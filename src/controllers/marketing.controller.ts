import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class MarketingController {
  async sendJobAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { jobId } = req.params;
      
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { category: true }
      });

      if (!job) throw ApiError.notFound('Job not found');

      // Find freelancers matching job criteria
      const matchingFreelancers = await prisma.user.findMany({
        where: {
          role: 'FREELANCER',
          emailNotifications: true,
          skills: { some: { skillName: { in: job.requiredSkills } } },
          // Skip category filtering for now
          // preferredCategories: { has: job.categoryId }
        },
        select: { id: true, firstName: true, email: true }
      });

      // Send bulk notifications
      const notifications = matchingFreelancers.map(user => ({
        userId: user.id,
        title: `New Job Alert: ${job.title}`,
        message: `A new ${job.category?.name} job matching your skills is available. Budget: ₦${job.budgetMin || 0}`,
        type: 'JOB_APPLICATION' as const,
        data: { jobId, budget: job.budgetMin || 0, category: job.category?.name }
      }));

      await prisma.notification.createMany({ data: notifications });

      logger.info(`Job alerts sent to ${matchingFreelancers.length} freelancers`);
      res.json({ success: true, message: `Job alerts sent to ${matchingFreelancers.length} freelancers` });
    } catch (error) {
      next(error);
    }
  }

  async sendChallengeAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;
      
      const challenge = await prisma.challenge.findUnique({
        where: { id: challengeId }
      });

      if (!challenge) throw ApiError.notFound('Challenge not found');

      const freelancers = await prisma.user.findMany({
        where: { 
          role: 'FREELANCER',
          emailNotifications: true
        },
        select: { id: true, firstName: true, email: true }
      });

      const notifications = freelancers.map(user => ({
        userId: user.id,
        title: `New Challenge: ${challenge.title}`,
        message: `Join the latest challenge with ₦${challenge.totalPrizePool} prize pool!`,
        type: 'CHALLENGE' as const,
        data: { challengeId, prizePool: challenge.totalPrizePool }
      }));

      await prisma.notification.createMany({ data: notifications });

      logger.info(`Challenge alerts sent to ${freelancers.length} freelancers`);
      res.json({ success: true, message: `Challenge alerts sent to ${freelancers.length} freelancers` });
    } catch (error) {
      next(error);
    }
  }

  async sendWeeklyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await prisma.user.findMany({
        where: { emailNotifications: true },
        select: { email: true, firstName: true, role: true }
      });

      const weeklyStats = await this.getWeeklyStats();
      
      let emailsSent = 0;
      for (const user of users) {
        try {
          await emailService.sendNewsletter(user.email, {
            recipientName: user.firstName,
            newsletterTitle: 'Weekly NairaGig Report',
            newsletterSubtitle: 'Your weekly platform summary',
            introMessage: 'Here\'s what happened on NairaGig this week',
            platformStats: weeklyStats,
            features: [
              {
                icon: '📊',
                title: 'Weekly Highlights',
                description: `${weeklyStats.totalJobs} new jobs posted, ${weeklyStats.completedProjects} projects completed`
              }
            ],
            tips: [
              'Complete your profile to get more job matches',
              'Respond to job applications within 24 hours',
              'Keep your portfolio updated with recent work'
            ],
            mainCtaText: 'View Dashboard',
            mainCtaUrl: 'https://nairagig.com/dashboard',
            unsubscribeUrl: `https://nairagig.com/unsubscribe?email=${user.email}`,
            preferencesUrl: 'https://nairagig.com/preferences'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send weekly report to ${user.email}:`, emailError);
        }
      }

      logger.info(`Weekly report sent to ${emailsSent} users`);
      res.json({ success: true, message: `Weekly report sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  async sendPromotionalCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, subtitle, message, targetAudience, promoCode, discount } = req.body;

      const whereClause: any = { emailNotifications: true };
      if (targetAudience && targetAudience !== 'all') {
        whereClause.role = targetAudience;
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        select: { email: true, firstName: true }
      });

      let emailsSent = 0;
      for (const user of users) {
        try {
          await emailService.sendNewsletter(user.email, {
            recipientName: user.firstName,
            newsletterTitle: title,
            newsletterSubtitle: subtitle,
            introMessage: message,
            features: [
              {
                icon: '🎉',
                title: 'Special Offer',
                description: `Use code ${promoCode} for ${discount}% off`,
                ctaText: 'Claim Offer',
                ctaUrl: `https://nairagig.com/promo/${promoCode}`
              }
            ],
            mainCtaText: 'Get Started',
            mainCtaUrl: 'https://nairagig.com/jobs',
            unsubscribeUrl: `https://nairagig.com/unsubscribe?email=${user.email}`,
            preferencesUrl: 'https://nairagig.com/preferences'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send promotional campaign to ${user.email}:`, emailError);
        }
      }

      logger.info(`Promotional campaign sent to ${emailsSent} users`);
      res.json({ success: true, message: `Promotional campaign sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  async sendMonthlyStats(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await prisma.user.findMany({
        where: { emailNotifications: true },
        select: { email: true, firstName: true }
      });

      const monthlyStats = await this.getMonthlyStats();

      let emailsSent = 0;
      for (const user of users) {
        try {
          await emailService.sendNewsletter(user.email, {
            recipientName: user.firstName,
            newsletterTitle: 'Monthly Platform Statistics',
            newsletterSubtitle: 'NairaGig growth and achievements',
            introMessage: 'See how NairaGig performed this month',
            platformStats: monthlyStats,
            features: [
              {
                icon: '📈',
                title: 'Platform Growth',
                description: `${monthlyStats.completedProjects} new users joined this month`
              },
              {
                icon: '💰',
                title: 'Earnings Milestone',
                description: `₦${monthlyStats.totalEarnings} paid out to freelancers`
              }
            ],
            mainCtaText: 'Explore Opportunities',
            mainCtaUrl: 'https://nairagig.com/jobs',
            unsubscribeUrl: `https://nairagig.com/unsubscribe?email=${user.email}`,
            preferencesUrl: 'https://nairagig.com/preferences'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send monthly stats to ${user.email}:`, emailError);
        }
      }

      logger.info(`Monthly statistics sent to ${emailsSent} users`);
      res.json({ success: true, message: `Monthly statistics sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  private async getWeeklyStats() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const [newJobs, completedProjects, newUsers, totalEarnings] = await Promise.all([
      prisma.job.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.project.count({ where: { completedAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { 
          type: 'PAYMENT', 
          status: 'COMPLETED',
          createdAt: { gte: weekAgo }
        }
      })
    ]);

    return {
      totalJobs: newJobs.toString(),
      totalFreelancers: completedProjects.toString(),
      totalEarnings: `₦${totalEarnings._sum.amount?.toLocaleString() || '0'}`,
      completedProjects: newUsers.toString()
    };
  }

  private async getMonthlyStats() {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [totalJobs, totalFreelancers, totalEarnings, newUsers] = await Promise.all([
      prisma.job.count(),
      prisma.user.count({ where: { role: 'FREELANCER' } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'PAYMENT', status: 'COMPLETED' }
      }),
      prisma.user.count({ where: { createdAt: { gte: monthAgo } } })
    ]);

    return {
      totalJobs: totalJobs.toString(),
      totalFreelancers: totalFreelancers.toString(),
      totalEarnings: `₦${totalEarnings._sum.amount?.toLocaleString() || '0'}`,
      completedProjects: newUsers.toString()
    };
  }
}