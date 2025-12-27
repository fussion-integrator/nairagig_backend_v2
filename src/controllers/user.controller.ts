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

  async getPublicProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          profileImageUrl: true,
          title: true,
          bio: true,
          city: true,
          country: true,
          hourlyRate: true,
          availabilityStatus: true,
          specialty: true,
          portfolioUrl: true,
          yearsOfExperience: true,
          reputationScore: true,
          createdAt: true,
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
          },
          socialProfiles: {
            select: {
              id: true,
              platform: true,
              profileUrl: true,
              username: true
            }
          },
          reviewsReceived: {
            select: {
              id: true,
              overallRating: true,
              comment: true,
              createdAt: true,
              reviewer: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
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
        phoneNumber,
        title,
        bio,
        city,
        country,
        hourlyRate,
        availabilityStatus,
        skills,
        portfolios,
        specialty,
        portfolioUrl,
        yearsOfExperience,
        socialLinks
      } = req.body;

      // Check if phone number is already taken by another user
      if (phoneNumber && phoneNumber.trim()) {
        const existingUser = await prisma.user.findFirst({
          where: {
            phoneNumber: phoneNumber.trim(),
            id: { not: userId }
          }
        });

        if (existingUser) {
          throw ApiError.badRequest('Phone number is already in use by another account');
        }
      }

      // Update user basic info
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          firstName,
          lastName,
          phoneNumber: phoneNumber && phoneNumber.trim() ? phoneNumber.trim() : null,
          displayName: `${firstName} ${lastName}`,
          title,
          bio,
          city,
          country,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate.toString().replace(/[^0-9.]/g, '')) : null,
          availabilityStatus,
          specialty,
          portfolioUrl,
          yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience.toString()) : null
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

      // Update social links if provided
      if (socialLinks && Array.isArray(socialLinks)) {
        await prisma.userSocialProfile.deleteMany({
          where: { userId }
        });

        if (socialLinks.length > 0) {
          await prisma.userSocialProfile.createMany({
            data: socialLinks.map((link: any) => ({
              userId,
              platform: link.platform,
              profileUrl: link.url,
              username: link.username || null
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
          },
          socialProfiles: {
            select: {
              id: true,
              platform: true,
              profileUrl: true,
              username: true
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

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { limit = 50, period = 'all' } = req.query;

      // Calculate date filter based on period
      let dateFilter: any = {};
      const now = new Date();
      
      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { gte: weekAgo };
      } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = { gte: monthAgo };
      }

      const users = await prisma.user.findMany({
        where: { 
          status: 'ACTIVE',
          role: { in: ['FREELANCER', 'CLIENT'] }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          profileImageUrl: true,
          experiencePoints: true,
          level: true,
          challengeParticipants: {
            where: period !== 'all' ? {
              registeredAt: dateFilter
            } : {},
            select: {
              id: true,
              status: true,
              registeredAt: true,
              submissions: {
                select: {
                  totalScore: true,
                  isWinner: true
                }
              }
            }
          }
        },
        orderBy: { experiencePoints: 'desc' },
        take: Number(limit)
      });

      const leaderboard = users.map((user, index) => {
        const participations = user.challengeParticipants || [];
        const challengesParticipated = participations.length;
        const challengesWon = participations.filter(p => 
          p.submissions.some(s => s.isWinner || s.totalScore >= 80)
        ).length;
        const winRate = challengesParticipated > 0 ? (challengesWon / challengesParticipated) * 100 : 0;

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          profileImageUrl: user.profileImageUrl,
          experiencePoints: user.experiencePoints || 0,
          level: user.level || 1,
          rank: index + 1,
          challengesParticipated,
          challengesWon,
          winRate: Math.round(winRate)
        };
      });

      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserRank(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { period = 'all' } = req.query;
      const currentUserId = (req as any).user?.id;

      // Users can only view their own rank unless they're admin
      if (currentUserId !== id && (req as any).user?.role !== 'ADMIN') {
        throw ApiError.forbidden('Insufficient permissions');
      }

      // Calculate date filter based on period
      let dateFilter: any = {};
      const now = new Date();
      
      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { gte: weekAgo };
      } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = { gte: monthAgo };
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          experiencePoints: true,
          level: true,
          challengeParticipants: {
            where: period !== 'all' ? {
              registeredAt: dateFilter
            } : {},
            select: {
              id: true,
              status: true,
              registeredAt: true,
              submissions: {
                select: {
                  totalScore: true,
                  isWinner: true
                }
              }
            }
          }
        }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Get user's rank by counting users with higher experience points
      const higherRankedCount = await prisma.user.count({
        where: {
          experiencePoints: { gt: user.experiencePoints || 0 },
          status: 'ACTIVE',
          role: { in: ['FREELANCER', 'CLIENT'] }
        }
      });

      const rank = higherRankedCount + 1;
      const participations = user.challengeParticipants || [];
      const challengesParticipated = participations.length;
      const challengesWon = participations.filter(p => 
        p.submissions.some(s => s.isWinner || s.totalScore >= 80)
      ).length;

      res.json({
        success: true,
        data: {
          rank,
          experiencePoints: user.experiencePoints || 0,
          level: user.level || 1,
          challengesParticipated,
          challengesWon
        }
      });
    } catch (error) {
      next(error);
    }
  }
}