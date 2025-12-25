import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class UserController {
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, role, status, search } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (role) where.role = role;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: Number(limit),
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            profileImageUrl: true,
            role: true,
            status: true,
            tier: true,
            createdAt: true,
            lastLoginAt: true,
            emailVerifiedAt: true,
            _count: {
              select: {
                clientProjects: true,
                freelancerProjects: true,
                sentMessages: true,
                receivedMessages: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          profile: true,
          wallet: true,
          bankAccounts: true,
          paymentMethods: true,
          clientProjects: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          freelancerProjects: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          sentMessages: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          notifications: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        email,
        firstName,
        lastName,
        role = 'CLIENT',
        status = 'ACTIVE',
        tier = 'BRONZE'
      } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        throw ApiError.badRequest('User with this email already exists');
      }

      const user = await prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          role,
          status,
          tier,
          emailVerifiedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          role: true,
          status: true,
          tier: true,
          createdAt: true
        }
      });

      logger.info(`User created: ${user.id} - ${user.email}`);

      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      const updatedUser = await prisma.user.update({
        where: { id: req.params.id },
        data: req.body,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          profileImageUrl: true,
          role: true,
          status: true,
          tier: true,
          updatedAt: true
        }
      });

      logger.info(`User updated: ${updatedUser.id} - ${updatedUser.email}`);

      res.json({
        success: true,
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: { 
          status: 'DELETED',
          deletedAt: new Date()
        }
      });

      await prisma.notification.create({
        data: {
          userId: req.params.id,
          type: 'SYSTEM',
          title: 'Account Deactivated',
          message: req.body.reason || 'Your account has been deactivated by an administrator.',
          priority: 'HIGH'
        }
      });

      logger.info(`User deleted: ${user.id} - ${user.email}`);

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: { 
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspensionReason: req.body.reason
        }
      });

      await prisma.notification.create({
        data: {
          userId: req.params.id,
          type: 'SYSTEM',
          title: 'Account Suspended',
          message: `Your account has been suspended. Reason: ${req.body.reason || 'Policy violation'}`,
          priority: 'NORMAL'
        }
      });

      logger.info(`User suspended: ${user.id} - ${user.email}`);

      res.json({
        success: true,
        message: 'User suspended successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async reactivateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      await prisma.user.update({
        where: { id: req.params.id },
        data: { 
          status: 'ACTIVE',
          suspendedAt: null,
          suspensionReason: null
        }
      });

      logger.info(`User reactivated: ${user.id} - ${user.email}`);

      res.json({
        success: true,
        message: 'User reactivated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserStats(req: Request, res: Response, next: NextFunction) {
    try {
      const [
        totalUsers,
        activeUsers,
        suspendedUsers,
        deletedUsers,
        clientUsers,
        freelancerUsers,
        adminUsers
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.user.count({ where: { status: 'SUSPENDED' } }),
        prisma.user.count({ where: { status: 'DELETED' } }),
        prisma.user.count({ where: { role: 'CLIENT' } }),
        prisma.user.count({ where: { role: 'FREELANCER' } }),
        prisma.user.count({ where: { role: 'ADMIN' } })
      ]);

      res.json({
        success: true,
        data: {
          total: totalUsers,
          byStatus: {
            active: activeUsers,
            suspended: suspendedUsers,
            deleted: deletedUsers
          },
          byRole: {
            clients: clientUsers,
            freelancers: freelancerUsers,
            admins: adminUsers
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const {
        firstName,
        lastName,
        title,
        bio,
        city,
        country,
        hourlyRate,
        availabilityStatus,
        skills,
        portfolios
      } = req.body;

      // Update user basic info
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          title,
          bio,
          city,
          country,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate.toString().replace(/[^0-9.]/g, '')) : null,
          availabilityStatus
        }
      });

      // Update skills if provided
      if (skills && Array.isArray(skills)) {
        await prisma.userSkill.deleteMany({
          where: { userId }
        });

        if (skills.length > 0) {
          await prisma.userSkill.createMany({
            data: skills.map((skillName: string) => ({
              userId,
              skillName: skillName.trim(),
              proficiencyLevel: 3 // Default to intermediate level (1-5 scale)
            }))
          });
        }
      }

      // Update portfolios if provided
      if (portfolios && Array.isArray(portfolios)) {
        await prisma.portfolio.deleteMany({
          where: { userId }
        });

        if (portfolios.length > 0) {
          await prisma.portfolio.createMany({
            data: portfolios.map((portfolio: any) => ({
              userId,
              title: portfolio.title,
              description: portfolio.description,
              liveUrl: portfolio.liveUrl || null,
              repositoryUrl: portfolio.repositoryUrl || null,
              tags: portfolio.tags || []
            }))
          });
        }
      }

      // Fetch updated user with relations
      const result = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          skills: {
            select: {
              id: true,
              skillName: true,
              proficiencyLevel: true
            }
          },
          portfolios: {
            select: {
              id: true,
              title: true,
              description: true,
              liveUrl: true,
              repositoryUrl: true,
              tags: true
            }
          }
        }
      });

      logger.info(`Profile updated: ${userId}`);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Profile update error:', error);
      next(error);
    }
  }

  async addPortfolioItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { title, description, liveUrl, repositoryUrl, tags } = req.body;

      const portfolio = await prisma.portfolio.create({
        data: {
          userId,
          title,
          description,
          liveUrl: liveUrl || null,
          repositoryUrl: repositoryUrl || null,
          tags: tags || []
        }
      });

      logger.info(`Portfolio item added: ${portfolio.id} for user ${userId}`);

      res.status(201).json({
        success: true,
        data: portfolio
      });
    } catch (error) {
      logger.error('Add portfolio error:', error);
      next(error);
    }
  }

  async updatePortfolioItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { portfolioId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { title, description, liveUrl, repositoryUrl, tags } = req.body;

      const portfolio = await prisma.portfolio.findFirst({
        where: { 
          id: portfolioId,
          userId 
        }
      });

      if (!portfolio) {
        throw ApiError.notFound('Portfolio item not found');
      }

      const updatedPortfolio = await prisma.portfolio.update({
        where: { id: portfolioId },
        data: {
          title,
          description,
          liveUrl: liveUrl || null,
          repositoryUrl: repositoryUrl || null,
          tags: tags || []
        }
      });

      logger.info(`Portfolio item updated: ${portfolioId}`);

      res.json({
        success: true,
        data: updatedPortfolio
      });
    } catch (error) {
      logger.error('Update portfolio error:', error);
      next(error);
    }
  }

  async deletePortfolioItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { portfolioId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const portfolio = await prisma.portfolio.findFirst({
        where: { 
          id: portfolioId,
          userId 
        }
      });

      if (!portfolio) {
        throw ApiError.notFound('Portfolio item not found');
      }

      await prisma.portfolio.delete({
        where: { id: portfolioId }
      });

      logger.info(`Portfolio item deleted: ${portfolioId}`);

      res.json({
        success: true,
        message: 'Portfolio item deleted successfully'
      });
    } catch (error) {
      logger.error('Delete portfolio error:', error);
      next(error);
    }
  }

  async getUserActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const activities = await prisma.userActivity.findMany({
        where: { userId: req.params.id },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: activities
      });
    } catch (error) {
      next(error);
    }
  }
}