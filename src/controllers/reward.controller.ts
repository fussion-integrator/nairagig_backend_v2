import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class RewardController {
  // Get user rewards
  async getUserRewards(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const { page = 1, limit = 20, type, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };
      if (type) where.type = type;
      if (status) where.status = status;

      const [rewards, total, stats] = await Promise.all([
        prisma.reward.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.reward.count({ where }),
        prisma.userRewardStats.findUnique({ where: { userId } })
      ]);

      res.json({
        success: true,
        data: {
          rewards,
          stats,
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

  // Get user reward stats
  async getUserRewardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const stats = await prisma.userRewardStats.findUnique({
        where: { userId }
      });

      if (!stats) {
        // Create initial stats
        const newStats = await prisma.userRewardStats.create({
          data: { userId }
        });
        return res.json({ success: true, data: newStats });
      }

      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  // Claim reward
  async claimReward(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const { rewardId } = req.params;

      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const reward = await prisma.reward.findUnique({
        where: { id: rewardId }
      });

      if (!reward) throw ApiError.notFound('Reward not found');
      if (reward.userId !== userId) throw ApiError.forbidden('Access denied');
      if (reward.status !== 'PENDING') throw ApiError.badRequest('Reward already claimed or expired');
      if (reward.expiresAt && reward.expiresAt < new Date()) {
        throw ApiError.badRequest('Reward has expired');
      }

      // Update reward status
      const updatedReward = await prisma.reward.update({
        where: { id: rewardId },
        data: {
          status: 'COMPLETED',
          claimedAt: new Date()
        }
      });

      // Update user wallet if reward has amount
      if (Number(reward.amount) > 0) {
        await prisma.wallet.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          update: {
            availableBalance: { increment: Number(reward.amount) },
            totalEarned: { increment: Number(reward.amount) }
          },
          create: {
            userId,
            currency: 'NGN',
            availableBalance: Number(reward.amount),
            totalEarned: Number(reward.amount)
          }
        });
      }

      // Update user reward stats
      await this.updateUserRewardStats(userId, Number(reward.amount), Number(reward.points));

      res.json({ success: true, data: updatedReward });
    } catch (error) {
      next(error);
    }
  }

  // Get user badges
  async getUserBadges(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const badges = await prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { earnedAt: 'desc' }
      });

      res.json({ success: true, data: badges });
    } catch (error) {
      next(error);
    }
  }

  // Get leaderboards
  async getLeaderboards(req: Request, res: Response, next: NextFunction) {
    try {
      const { type = 'EARNINGS', period = 'MONTHLY', limit = 10 } = req.query;

      const leaderboard = await prisma.leaderboard.findFirst({
        where: { type: type as any, period: period as any, isActive: true }
      });

      if (!leaderboard) {
        return res.json({ success: true, data: { entries: [] } });
      }

      const entries = await prisma.leaderboardEntry.findMany({
        where: { leaderboardId: leaderboard.id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true
            }
          }
        },
        orderBy: { rank: 'asc' },
        take: Number(limit)
      });

      res.json({
        success: true,
        data: {
          leaderboard,
          entries
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user referrals
  async getUserReferrals(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const referrals = await prisma.referral.findMany({
        where: { referrerId: userId },
        include: {
          referee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true,
              createdAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const stats = {
        totalReferrals: referrals.length,
        completedReferrals: referrals.filter(r => r.status === 'COMPLETED').length,
        totalEarned: referrals.reduce((sum, r) => sum + Number(r.rewardAmount), 0)
      };

      res.json({
        success: true,
        data: {
          referrals,
          stats
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Generate referral code
  async generateReferralCode(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      // Check if user already has a referral code
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true, firstName: true }
      });

      if (user?.referralCode) {
        return res.json({
          success: true,
          data: {
            referralCode: user.referralCode,
            referralUrl: `${process.env.FRONTEND_URL}/auth/signup?ref=${user.referralCode}`
          }
        });
      }

      // Generate unique referral code
      let referralCode: string;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        const namePrefix = user?.firstName?.substring(0, 3).toUpperCase() || 'USR';
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        referralCode = `${namePrefix}${randomSuffix}`;

        const existingUser = await prisma.user.findUnique({
          where: { referralCode }
        });

        if (!existingUser) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        referralCode = `REF${Date.now().toString().slice(-6)}`;
      }

      // Update user with referral code
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode }
      });

      res.json({
        success: true,
        data: {
          referralCode,
          referralUrl: `${process.env.FRONTEND_URL}/auth/signup?ref=${referralCode}`
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Process referral signup
  async processReferralSignup(req: Request, res: Response, next: NextFunction) {
    try {
      const { referralCode, newUserId } = req.body;

      if (!referralCode || !newUserId) {
        throw ApiError.badRequest('Referral code and new user ID required');
      }

      // Find referrer by referral code
      const referrer = await prisma.user.findUnique({
        where: { referralCode }
      });

      if (!referrer) {
        throw ApiError.notFound('Invalid referral code');
      }

      // Check if referral already exists
      const existingReferral = await prisma.referral.findUnique({
        where: { referrerId_refereeId: { referrerId: referrer.id, refereeId: newUserId } }
      });

      if (existingReferral) {
        throw ApiError.badRequest('Referral already processed');
      }

      // Create referral record
      const referral = await prisma.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: newUserId,
          referralCode,
          status: 'COMPLETED',
          rewardAmount: 5000,
          rewardPaid: true,
          rewardPaidAt: new Date(),
          completedAt: new Date()
        }
      });

      // Award referral rewards
      await this.awardReferralReward(referrer.id, newUserId);

      res.json({ success: true, data: referral });
    } catch (error) {
      next(error);
    }
  }

  // Award reward (internal method)
  async awardReward(userId: string, type: string, action: string, amount: number = 0, points: number = 0, metadata: any = {}) {
    try {
      const reward = await prisma.reward.create({
        data: {
          userId,
          type: type as any,
          action,
          amount,
          points,
          status: 'COMPLETED',
          metadata,
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
      await this.updateUserRewardStats(userId, amount, points);

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: 'Reward Earned!',
          message: `You earned ₦${amount.toLocaleString()} and ${points} points for ${action}`,
          data: { rewardId: reward.id, amount, points }
        }
      });

      return reward;
    } catch (error) {
      logger.error('Award reward error:', error);
      throw error;
    }
  }

  // Update user reward stats
  private async updateUserRewardStats(userId: string, amount: number, points: number) {
    await prisma.userRewardStats.upsert({
      where: { userId },
      update: {
        totalEarned: { increment: amount },
        totalPoints: { increment: points },
        lifetimeEarned: { increment: amount },
        monthlyEarned: { increment: amount },
        weeklyEarned: { increment: amount },
        lastRewardAt: new Date()
      },
      create: {
        userId,
        totalEarned: amount,
        totalPoints: points,
        lifetimeEarned: amount,
        monthlyEarned: amount,
        weeklyEarned: amount,
        lastRewardAt: new Date()
      }
    });
  }

  // Award referral reward
  private async awardReferralReward(referrerId: string, refereeId: string) {
    // Award to referrer
    await this.awardReward(referrerId, 'REFERRAL', 'friend_referral', 5000, 500, { refereeId });
    
    // Award to referee
    await this.awardReward(refereeId, 'ONBOARDING', 'referred_signup', 2000, 200, { referrerId });
  }
}