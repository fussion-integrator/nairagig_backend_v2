import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class PlatformEventsController {
  async sendMaintenanceNotice(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        maintenanceType, 
        startTime, 
        endTime, 
        description, 
        affectedServices 
      } = req.body;

      const users = await prisma.user.findMany({
        where: { emailNotifications: true },
        select: { email: true, firstName: true }
      });

      let emailsSent = 0;
      for (const user of users) {
        try {
          await emailService.sendMaintenanceNotice(user.email, {
            userName: user.firstName,
            maintenanceType,
            startTime,
            endTime,
            duration: this.calculateDuration(startTime, endTime),
            maintenanceStatus: 'Scheduled',
            maintenanceDate: new Date(startTime).toLocaleDateString(),
            timezone: 'UTC',
            maintenanceDescription: description,
            affectedServices: affectedServices || [],
            serviceAvailability: 'Limited during maintenance window',
            statusPageUrl: 'https://status.nairagig.com'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send maintenance notice to ${user.email}:`, emailError);
        }
      }

      logger.info(`Maintenance notice sent to ${emailsSent} users`);
      res.json({ success: true, message: `Maintenance notice sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  async sendFeatureLaunch(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        featureName, 
        featureDescription, 
        launchDate, 
        targetAudience 
      } = req.body;

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
          await emailService.sendFeatureAnnouncement(user.email, {
            userName: user.firstName,
            featureName,
            featureDescription,
            launchDate,
            availability: 'Available now',
            steps: [
              'Log in to your NairaGig account',
              'Navigate to the new feature section',
              'Explore the enhanced capabilities'
            ],
            featureUrl: `https://nairagig.com/features/${featureName.toLowerCase()}`,
            helpUrl: 'https://help.nairagig.com',
            feedbackUrl: 'https://nairagig.com/feedback'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send feature announcement to ${user.email}:`, emailError);
        }
      }

      logger.info(`Feature announcement sent to ${emailsSent} users`);
      res.json({ success: true, message: `Feature announcement sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  async sendSecurityBreach(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        breachType, 
        affectedData, 
        actionsTaken, 
        userActions 
      } = req.body;

      const users = await prisma.user.findMany({
        select: { email: true, firstName: true }
      });

      let emailsSent = 0;
      for (const user of users) {
        try {
          await emailService.sendSecurityAlertAdvanced(user.email, {
            userName: user.firstName,
            alertType: `Security Breach: ${breachType}`,
            eventDateTime: new Date().toISOString(),
            location: 'Platform-wide',
            deviceInfo: 'System Alert',
            ipAddress: 'N/A',
            eventDescription: `A security incident has been detected: ${affectedData}. ${actionsTaken}`,
            riskLevel: 'Critical',
            riskColor: '#dc2626',
            actionRequired: true,
            requiredActions: userActions || ['Change your password immediately', 'Review account activity'],
            securityUrl: 'https://nairagig.com/security'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send security breach alert to ${user.email}:`, emailError);
        }
      }

      logger.info(`Security breach alert sent to ${emailsSent} users`);
      res.json({ success: true, message: `Security breach alert sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  async sendNewsletter(req: Request, res: Response, next: NextFunction) {
    try {
      const { 
        title, 
        subtitle, 
        introMessage, 
        features, 
        tips 
      } = req.body;

      const users = await prisma.user.findMany({
        where: { emailNotifications: true },
        select: { email: true, firstName: true }
      });

      const platformStats = await this.getPlatformStats();

      let emailsSent = 0;
      for (const user of users) {
        try {
          await emailService.sendNewsletter(user.email, {
            recipientName: user.firstName,
            newsletterTitle: title,
            newsletterSubtitle: subtitle,
            introMessage,
            platformStats,
            features: features || [],
            tips: tips || [],
            mainCtaText: 'Explore Platform',
            mainCtaUrl: 'https://nairagig.com/dashboard',
            unsubscribeUrl: `https://nairagig.com/unsubscribe?email=${user.email}`,
            preferencesUrl: 'https://nairagig.com/preferences'
          });
          emailsSent++;
        } catch (emailError) {
          logger.error(`Failed to send newsletter to ${user.email}:`, emailError);
        }
      }

      logger.info(`Newsletter sent to ${emailsSent} users`);
      res.json({ success: true, message: `Newsletter sent to ${emailsSent} users` });
    } catch (error) {
      next(error);
    }
  }

  private calculateDuration(startTime: string, endTime: string): string {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes > 0 ? `${minutes} minutes` : ''}`;
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  private async getPlatformStats() {
    const [totalJobs, totalFreelancers, totalProjects, totalEarnings] = await Promise.all([
      prisma.job.count(),
      prisma.user.count({ where: { role: 'FREELANCER' } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'PAYMENT', status: 'COMPLETED' }
      })
    ]);

    return {
      totalJobs: totalJobs.toString(),
      totalFreelancers: totalFreelancers.toString(),
      totalEarnings: `₦${totalEarnings._sum.amount?.toLocaleString() || '0'}`,
      completedProjects: totalProjects.toString()
    };
  }
}