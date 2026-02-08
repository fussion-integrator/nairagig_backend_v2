import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export class StatsController {
  async getPublicStats(req: Request, res: Response, next: NextFunction) {
    try {
      const [
        totalUsers,
        totalJobs,
        totalChallenges,
        completedJobs,
        totalApplications
      ] = await Promise.all([
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.job.count(),
        prisma.challenge.count(),
        prisma.job.count({ where: { status: 'COMPLETED' } }),
        prisma.application.count()
      ]);

      // Calculate success rate
      const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 98;

      res.json({
        success: true,
        data: {
          totalUsers,
          totalJobs,
          totalChallenges,
          completedJobs,
          averageRating: 4.9,
          successRate,
          totalApplications
        }
      });
    } catch (error) {
      logger.error('Failed to fetch public stats:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch statistics' 
      });
    }
  }
}
