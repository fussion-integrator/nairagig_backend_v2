import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class AdminRewardController {
  // Get reward configurations
  async getRewardConfigs(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, type, isActive } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (type) where.type = type;
      if (isActive !== undefined) where.isActive = isActive === 'true';

      const [configs, total] = await Promise.all([
        prisma.rewardConfig.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.rewardConfig.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          configs,
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

  // Create reward configuration
  async createRewardConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const { action, type, amount, points, conditions, limits, description } = req.body;

      const config = await prisma.rewardConfig.create({
        data: {
          action,
          type,
          amount: amount || 0,
          points: points || 0,
          conditions: conditions || {},
          limits: limits || {},
          description
        }
      });

      res.status(201).json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  }

  // Update reward configuration
  async updateRewardConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const config = await prisma.rewardConfig.update({
        where: { id },
        data: updateData
      });

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  }

  // Delete reward configuration
  async deleteRewardConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await prisma.rewardConfig.delete({
        where: { id }
      });

      res.json({ success: true, message: 'Reward configuration deleted' });
    } catch (error) {
      next(error);
    }
  }

  // Get reward analytics
  async getRewardAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, type } = req.query;

      const where: any = {};
      if (startDate && endDate) {
        where.createdAt = {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        };
      }
      if (type) where.type = type;

      const [
        totalRewards,
        totalAmount,
        totalPoints,
        rewardsByType,
        rewardsByStatus,
        topUsers
      ] = await Promise.all([
        prisma.reward.count({ where }),
        prisma.reward.aggregate({
          where,
          _sum: { amount: true }
        }),
        prisma.reward.aggregate({
          where,
          _sum: { points: true }
        }),
        prisma.reward.groupBy({
          by: ['type'],
          where,
          _count: true,
          _sum: { amount: true, points: true }
        }),
        prisma.reward.groupBy({
          by: ['status'],
          where,
          _count: true
        }),
        prisma.userRewardStats.findMany({
          orderBy: { totalEarned: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImageUrl: true
              }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          summary: {
            totalRewards,
            totalAmount: totalAmount._sum.amount || 0,
            totalPoints: totalPoints._sum.points || 0
          },
          rewardsByType,
          rewardsByStatus,
          topUsers
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all user rewards (admin view)
  async getAllUserRewards(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, userId, type, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (userId) where.userId = userId;
      if (type) where.type = type;
      if (status) where.status = status;

      const [rewards, total] = await Promise.all([
        prisma.reward.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profileImageUrl: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.reward.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          rewards,
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

  // Award manual reward
  async awardManualReward(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, type, action, amount, points, description } = req.body;

      const reward = await prisma.reward.create({
        data: {
          userId,
          type,
          action,
          amount: amount || 0,
          points: points || 0,
          status: 'COMPLETED',
          metadata: { description, manual: true },
          claimedAt: new Date()
        }
      });

      // Update wallet if amount > 0
      if (amount > 0) {
        await prisma.wallet.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          update: {
            availableBalance: { increment: amount },
            totalEarned: { increment: amount }
          },
          create: {
            userId,
            currency: 'NGN',
            availableBalance: amount,
            totalEarned: amount
          }
        });
      }

      // Update user stats
      await prisma.userRewardStats.upsert({
        where: { userId },
        update: {
          totalEarned: { increment: amount || 0 },
          totalPoints: { increment: points || 0 },
          lastRewardAt: new Date()
        },
        create: {
          userId,
          totalEarned: amount || 0,
          totalPoints: points || 0,
          lastRewardAt: new Date()
        }
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: 'Special Reward!',
          message: description || `You received a special reward of ₦${amount?.toLocaleString()} and ${points} points`,
          data: { rewardId: reward.id, manual: true }
        }
      });

      res.status(201).json({ success: true, data: reward });
    } catch (error) {
      next(error);
    }
  }

  // Manage badges
  async getBadges(req: Request, res: Response, next: NextFunction) {
    try {
      const badges = await prisma.badge.findMany({
        include: {
          _count: {
            select: { userBadges: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: badges });
    } catch (error) {
      next(error);
    }
  }

  async createBadge(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, title, description, category, icon, color, rarity, criteria } = req.body;

      const badge = await prisma.badge.create({
        data: {
          name,
          title,
          description,
          category,
          icon,
          color: color || '#6B7280',
          rarity: rarity || 'COMMON',
          criteria: criteria || {}
        }
      });

      res.status(201).json({ success: true, data: badge });
    } catch (error) {
      next(error);
    }
  }

  // Manage leaderboards
  async getLeaderboards(req: Request, res: Response, next: NextFunction) {
    try {
      const leaderboards = await prisma.leaderboard.findMany({
        include: {
          _count: {
            select: { entries: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: leaderboards });
    } catch (error) {
      next(error);
    }
  }

  async createLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, title, description, type, period, category } = req.body;

      const leaderboard = await prisma.leaderboard.create({
        data: {
          name,
          title,
          description,
          type,
          period,
          category
        }
      });

      res.status(201).json({ success: true, data: leaderboard });
    } catch (error) {
      next(error);
    }
  }

  // Manage campaigns
  async getCampaigns(req: Request, res: Response, next: NextFunction) {
    try {
      const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: campaigns });
    } catch (error) {
      next(error);
    }
  }

  async createCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, title, description, type, startDate, endDate, budget, conditions, rewards } = req.body;

      const campaign = await prisma.campaign.create({
        data: {
          name,
          title,
          description,
          type,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          budget: budget || 0,
          conditions: conditions || {},
          rewards: rewards || {}
        }
      });

      res.status(201).json({ success: true, data: campaign });
    } catch (error) {
      next(error);
    }
  }

  // Update campaign status
  async updateCampaignStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const campaign = await prisma.campaign.update({
        where: { id },
        data: { status }
      });

      res.json({ success: true, data: campaign });
    } catch (error) {
      next(error);
    }
  }
}