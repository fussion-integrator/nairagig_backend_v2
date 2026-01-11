import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createSuccessResponse, createErrorResponse, handleControllerError } from '../types/api.types';

const prisma = new PrismaClient();

export class AdminDashboardController {
  async getDashboard(req: Request, res: Response) {
    try {
      const [userStats, jobStats, challengeStats, transactionStats] = await Promise.all([
        this.getUserStats(),
        this.getJobStats(),
        this.getChallengeStats(),
        this.getTransactionStats()
      ]);

      const recentActivity = await this.getRecentActivity();

      const response = createSuccessResponse({
        stats: {
          ...userStats,
          ...jobStats,
          ...challengeStats,
          ...transactionStats
        },
        recentActivity
      });

      res.json(response);
    } catch (error: any) {
      const errorResponse = handleControllerError(error, 'Failed to fetch dashboard data');
      res.status(500).json(errorResponse);
    }
  }

  async getStats(req: Request, res: Response) {
    try {
      const [userStats, jobStats, challengeStats, transactionStats] = await Promise.all([
        this.getUserStats(),
        this.getJobStats(),
        this.getChallengeStats(),
        this.getTransactionStats()
      ]);

      const recentActivity = await this.getRecentActivity();

      res.json({
        success: true,
        data: {
          stats: {
            ...userStats,
            ...jobStats,
            ...challengeStats,
            ...transactionStats
          },
          recentActivity
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getActivities(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [activities, total] = await Promise.all([
        prisma.adminAuditLog.findMany({
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            action: true,
            resource: true,
            resourceId: true,
            createdAt: true,
            admin: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.adminAuditLog.count()
      ]);

      const response = createSuccessResponse(
        { activities },
        'Activities retrieved successfully',
        {
          page: Number(page),
          limit: take,
          total,
          pages: Math.ceil(total / take)
        }
      );

      res.json(response);
    } catch (error: any) {
      const errorResponse = handleControllerError(error, 'Failed to fetch activities');
      res.status(500).json(errorResponse);
    }
  }

  private async getUserStats() {
    const [total, active, verified, newThisMonth] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ]);

    return {
      totalUsers: total,
      activeUsers: active,
      verifiedUsers: verified,
      newUsersThisMonth: newThisMonth
    };
  }

  private async getJobStats() {
    const [total, open, completed, inProgress] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { status: 'OPEN' } }),
      prisma.job.count({ where: { status: 'COMPLETED' } }),
      prisma.job.count({ where: { status: 'IN_PROGRESS' } })
    ]);

    return {
      totalJobs: total,
      openJobs: open,
      activeGigs: open, // alias for frontend compatibility
      completedJobs: completed,
      jobsInProgress: inProgress
    };
  }

  private async getChallengeStats() {
    const [total, active, completed, categories] = await Promise.all([
      prisma.challenge.count(),
      prisma.challenge.count({ where: { status: 'ACTIVE' } }),
      prisma.challenge.count({ where: { status: 'COMPLETED' } }),
      prisma.category.count()
    ]);

    return {
      totalChallenges: total,
      activeChallenges: active,
      completedChallenges: completed,
      totalCategories: categories
    };
  }

  private async getTransactionStats() {
    const [result, monthlyRevenue, openDisputes] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { amount: true },
        _count: true
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      }),
      prisma.dispute.count({ where: { status: 'OPEN' } })
    ]);

    return {
      totalRevenue: result._sum.amount || 0,
      totalTransactions: result._count,
      monthlyRevenue: monthlyRevenue._sum.amount || 0,
      openDisputes: openDisputes
    };
  }

  async getSystemHealth(req: Request, res: Response) {
    try {
      const healthChecks = await Promise.allSettled([
        // Database health
        prisma.$queryRaw`SELECT 1`,
        // Check if we can count users (basic DB operation)
        prisma.user.count({ take: 1 }),
        // Check if we can count jobs
        prisma.job.count({ take: 1 }),
        // Check if we can count transactions
        prisma.transaction.count({ take: 1 })
      ]);

      const systemStatus = {
        database: healthChecks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        userService: healthChecks[1].status === 'fulfilled' ? 'operational' : 'degraded',
        jobService: healthChecks[2].status === 'fulfilled' ? 'operational' : 'degraded',
        paymentService: healthChecks[3].status === 'fulfilled' ? 'operational' : 'degraded',
        timestamp: new Date().toISOString()
      };

      const response = createSuccessResponse(systemStatus);
      res.json(response);
    } catch (error: any) {
      const errorResponse = handleControllerError(error, 'Failed to check system health');
      res.status(500).json(errorResponse);
    }
  }

  private async getRecentActivity() {
    try {
      // Get recent platform activities from multiple sources
      const [userActivities, jobActivities, challengeActivities, transactionActivities] = await Promise.all([
        // Recent user registrations
        prisma.user.findMany({
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            createdAt: true
          }
        }),
        // Recent job postings
        prisma.job.findMany({
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            createdAt: true,
            client: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }),
        // Recent challenge submissions
        prisma.challengeSubmission.findMany({
          take: 2,
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            submittedAt: true,
            challenge: {
              select: {
                title: true
              }
            },
            participant: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }),
        // Recent transactions
        prisma.transaction.findMany({
          take: 2,
          orderBy: { createdAt: 'desc' },
          where: {
            status: 'COMPLETED'
          },
          select: {
            id: true,
            amount: true,
            type: true,
            createdAt: true,
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        })
      ]);

      const activities = [];

      // Add user activities
      userActivities.forEach(user => {
        activities.push({
          action: 'User registered',
          firstName: user.firstName,
          lastName: user.lastName,
          timestamp: user.createdAt.toISOString(),
          metadata: { userId: user.id }
        });
      });

      // Add job activities
      jobActivities.forEach(job => {
        activities.push({
          action: 'Job posted',
          firstName: job.client.firstName,
          lastName: job.client.lastName,
          timestamp: job.createdAt.toISOString(),
          metadata: { jobId: job.id, title: job.title }
        });
      });

      // Add challenge activities
      challengeActivities.forEach(submission => {
        activities.push({
          action: 'Challenge submission',
          firstName: submission.participant.user.firstName,
          lastName: submission.participant.user.lastName,
          timestamp: submission.submittedAt.toISOString(),
          metadata: { challengeTitle: submission.challenge.title }
        });
      });

      // Add transaction activities
      transactionActivities.forEach(transaction => {
        activities.push({
          action: `Payment ${transaction.type.toLowerCase()}`,
          firstName: transaction.user.firstName,
          lastName: transaction.user.lastName,
          timestamp: transaction.createdAt.toISOString(),
          metadata: { amount: transaction.amount, type: transaction.type }
        });
      });

      // Sort by timestamp and return latest 10
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

    } catch (error) {
      console.error('Error fetching recent activity:', error);
      return [];
    }
  }
}