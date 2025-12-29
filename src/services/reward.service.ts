import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export class RewardService {
  // Process onboarding rewards
  static async processOnboardingReward(userId: string, action: string) {
    try {
      const config = await prisma.rewardConfig.findUnique({
        where: { action, isActive: true }
      });

      if (!config) return;

      // Check if user already received this reward
      const existingReward = await prisma.reward.findFirst({
        where: { userId, action, status: 'COMPLETED' }
      });

      if (existingReward) return;

      // Award the reward
      const reward = await prisma.reward.create({
        data: {
          userId,
          type: config.type,
          action,
          amount: config.amount,
          points: config.points,
          status: 'COMPLETED',
          claimedAt: new Date()
        }
      });

      // Update wallet
      if (Number(config.amount) > 0) {
        await prisma.wallet.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          update: {
            availableBalance: { increment: config.amount },
            totalEarned: { increment: config.amount }
          },
          create: {
            userId,
            currency: 'NGN',
            availableBalance: config.amount,
            totalEarned: config.amount
          }
        });
      }

      // Update stats
      await this.updateUserRewardStats(userId, Number(config.amount), config.points);

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: 'Welcome Bonus!',
          message: `You earned ₦${config.amount.toString()} for ${action.replace('_', ' ')}`,
          data: { rewardId: reward.id }
        }
      });

      logger.info(`Onboarding reward awarded: ${userId} - ${action}`);
    } catch (error) {
      logger.error('Process onboarding reward error:', error);
    }
  }

  // Process activity rewards
  static async processActivityReward(userId: string, action: string, metadata: any = {}) {
    try {
      const config = await prisma.rewardConfig.findUnique({
        where: { action, isActive: true }
      });

      if (!config) return;

      // Check daily limits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayRewards = await prisma.reward.count({
        where: {
          userId,
          action,
          createdAt: { gte: today }
        }
      });

      const limits = config.limits as any;
      if (limits?.daily && todayRewards >= limits.daily) return;

      // Award the reward
      const reward = await prisma.reward.create({
        data: {
          userId,
          type: config.type,
          action,
          amount: config.amount,
          points: config.points,
          status: 'COMPLETED',
          metadata,
          claimedAt: new Date()
        }
      });

      // Update wallet
      if (Number(config.amount) > 0) {
        await prisma.wallet.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          update: {
            availableBalance: { increment: config.amount },
            totalEarned: { increment: config.amount }
          },
          create: {
            userId,
            currency: 'NGN',
            availableBalance: config.amount,
            totalEarned: config.amount
          }
        });
      }

      // Update stats
      await this.updateUserRewardStats(userId, Number(config.amount), config.points);

      // Update streaks
      await this.updateUserStreak(userId, action);

      logger.info(`Activity reward awarded: ${userId} - ${action}`);
    } catch (error) {
      logger.error('Process activity reward error:', error);
    }
  }

  // Process milestone rewards
  static async processMilestoneReward(userId: string, milestone: string, value: number) {
    try {
      const config = await prisma.rewardConfig.findUnique({
        where: { action: milestone, isActive: true }
      });

      if (!config) return;

      // Check if milestone already achieved
      const existingReward = await prisma.reward.findFirst({
        where: { userId, action: milestone, status: 'COMPLETED' }
      });

      if (existingReward) return;

      // Check if milestone criteria met
      const conditions = config.conditions as any;
      if (conditions?.minValue && value < conditions.minValue) return;

      // Award the reward
      const reward = await prisma.reward.create({
        data: {
          userId,
          type: config.type,
          action: milestone,
          amount: config.amount,
          points: config.points,
          status: 'COMPLETED',
          metadata: { value },
          claimedAt: new Date()
        }
      });

      // Update wallet
      if (Number(config.amount) > 0) {
        await prisma.wallet.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          update: {
            availableBalance: { increment: config.amount },
            totalEarned: { increment: config.amount }
          },
          create: {
            userId,
            currency: 'NGN',
            availableBalance: config.amount,
            totalEarned: config.amount
          }
        });
      }

      // Update stats
      await this.updateUserRewardStats(userId, Number(config.amount), config.points);

      // Award badge if applicable
      await this.checkAndAwardBadge(userId, milestone, value);

      // Create notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: 'Milestone Achieved!',
          message: `Congratulations! You earned ₦${config.amount.toString()} for reaching ${milestone.replace('_', ' ')}`,
          data: { rewardId: reward.id, milestone, value }
        }
      });

      logger.info(`Milestone reward awarded: ${userId} - ${milestone}`);
    } catch (error) {
      logger.error('Process milestone reward error:', error);
    }
  }

  // Update user streak
  private static async updateUserStreak(userId: string, action: string) {
    try {
      let streakType: string;
      
      switch (action) {
        case 'daily_login':
          streakType = 'DAILY_LOGIN';
          break;
        case 'job_completion':
          streakType = 'JOB_COMPLETION';
          break;
        default:
          return;
      }

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const streak = await prisma.userStreak.findUnique({
        where: { userId_streakType: { userId, streakType: streakType as any } }
      });

      if (!streak) {
        // Create new streak
        await prisma.userStreak.create({
          data: {
            userId,
            streakType: streakType as any,
            currentCount: 1,
            maxCount: 1,
            lastActiveAt: today,
            isActive: true
          }
        });
      } else {
        const lastActive = new Date(streak.lastActiveAt || 0);
        const isConsecutive = lastActive.toDateString() === yesterday.toDateString();

        if (isConsecutive) {
          // Continue streak
          const newCount = streak.currentCount + 1;
          await prisma.userStreak.update({
            where: { id: streak.id },
            data: {
              currentCount: newCount,
              maxCount: Math.max(newCount, streak.maxCount),
              lastActiveAt: today
            }
          });

          // Award streak bonus
          if (newCount % 7 === 0) { // Weekly streak bonus
            await this.processActivityReward(userId, 'weekly_streak_bonus', { streakCount: newCount });
          }
        } else if (lastActive.toDateString() !== today.toDateString()) {
          // Reset streak
          await prisma.userStreak.update({
            where: { id: streak.id },
            data: {
              currentCount: 1,
              lastActiveAt: today
            }
          });
        }
      }
    } catch (error) {
      logger.error('Update user streak error:', error);
    }
  }

  // Check and award badge
  private static async checkAndAwardBadge(userId: string, achievement: string, value: number) {
    try {
      const badges = await prisma.badge.findMany({
        where: { isActive: true }
      });

      for (const badge of badges) {
        const criteria = badge.criteria as any;
        
        // Check if user already has this badge
        const existingBadge = await prisma.userBadge.findUnique({
          where: { userId_badgeId: { userId, badgeId: badge.id } }
        });

        if (existingBadge) continue;

        // Check criteria
        let shouldAward = false;
        
        if (criteria.achievement === achievement && criteria.minValue && value >= criteria.minValue) {
          shouldAward = true;
        }

        if (shouldAward) {
          await prisma.userBadge.create({
            data: {
              userId,
              badgeId: badge.id,
              metadata: { achievement, value }
            }
          });

          // Create notification
          await prisma.notification.create({
            data: {
              userId,
              type: 'SYSTEM',
              title: 'Badge Earned!',
              message: `You earned the "${badge.title}" badge!`,
              data: { badgeId: badge.id }
            }
          });
        }
      }
    } catch (error) {
      logger.error('Check and award badge error:', error);
    }
  }

  // Update user reward stats
  private static async updateUserRewardStats(userId: string, amount: number, points: number) {
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

    // Update user tier based on points
    const stats = await prisma.userRewardStats.findUnique({ where: { userId } });
    if (stats) {
      let newTier = stats.tier;
      const totalPoints = stats.totalPoints;

      if (totalPoints >= 50000) newTier = 'DIAMOND';
      else if (totalPoints >= 25000) newTier = 'PLATINUM';
      else if (totalPoints >= 10000) newTier = 'GOLD';
      else if (totalPoints >= 5000) newTier = 'SILVER';
      else newTier = 'BRONZE';

      if (newTier !== stats.tier) {
        await prisma.userRewardStats.update({
          where: { userId },
          data: { tier: newTier }
        });

        // Award tier upgrade bonus
        const tierBonuses = {
          SILVER: 5000,
          GOLD: 10000,
          PLATINUM: 25000,
          DIAMOND: 50000
        };

        const bonus = tierBonuses[newTier as keyof typeof tierBonuses];
        if (bonus) {
          await prisma.reward.create({
            data: {
              userId,
              type: 'MILESTONE',
              action: `tier_upgrade_${newTier.toLowerCase()}`,
              amount: bonus,
              points: bonus / 10,
              status: 'COMPLETED',
              claimedAt: new Date()
            }
          });
        }
      }
    }
  }

  // Update leaderboards
  static async updateLeaderboards() {
    try {
      const leaderboards = await prisma.leaderboard.findMany({
        where: { isActive: true }
      });

      for (const leaderboard of leaderboards) {
        await this.updateLeaderboard(leaderboard);
      }
    } catch (error) {
      logger.error('Update leaderboards error:', error);
    }
  }

  private static async updateLeaderboard(leaderboard: any) {
    // Implementation depends on leaderboard type and period
    // This is a simplified version
    const period = this.getCurrentPeriod(leaderboard.period);
    
    // Clear existing entries for this period
    await prisma.leaderboardEntry.deleteMany({
      where: { leaderboardId: leaderboard.id, period }
    });

    // Calculate new rankings based on type
    let users: any[] = [];
    
    switch (leaderboard.type) {
      case 'EARNINGS':
        users = await prisma.userRewardStats.findMany({
          select: { userId: true, monthlyEarned: true },
          orderBy: { monthlyEarned: 'desc' },
          take: 100
        });
        break;
      case 'POINTS':
        users = await prisma.userRewardStats.findMany({
          select: { userId: true, totalPoints: true },
          orderBy: { totalPoints: 'desc' },
          take: 100
        });
        break;
    }

    // Create new entries
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const score = leaderboard.type === 'EARNINGS' ? user.monthlyEarned : user.totalPoints;
      
      await prisma.leaderboardEntry.create({
        data: {
          leaderboardId: leaderboard.id,
          userId: user.userId,
          rank: i + 1,
          score,
          period
        }
      });
    }
  }

  private static getCurrentPeriod(period: string): string {
    const now = new Date();
    
    switch (period) {
      case 'DAILY':
        return now.toISOString().split('T')[0];
      case 'WEEKLY':
        const year = now.getFullYear();
        const week = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
        return `${year}-W${week.toString().padStart(2, '0')}`;
      case 'MONTHLY':
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      default:
        return 'all-time';
    }
  }
}