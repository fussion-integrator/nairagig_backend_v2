import { PrismaClient } from '@prisma/client';
import { emailService } from './email.service';
import { logger } from '@/utils/logger';

const prisma = new PrismaClient();

interface NotificationOptions {
  type: 'NEW_JOB' | 'NEW_CHALLENGE' | 'NEWSLETTER' | 'ANNOUNCEMENT';
  title: string;
  data: Record<string, any>;
  targetUsers?: string[];
  filterCriteria?: {
    role?: string[];
    emailNotifications?: boolean;
    marketingEmails?: boolean;
  };
}

class NotificationService {
  
  async sendBulkNotification(options: NotificationOptions): Promise<{ sent: number; failed: number }> {
    try {
      let users;
      
      if (options.targetUsers) {
        // Send to specific users
        users = await prisma.user.findMany({
          where: {
            id: { in: options.targetUsers },
            emailNotifications: true,
            status: 'ACTIVE'
          },
          select: { id: true, email: true, firstName: true, lastName: true }
        });
      } else {
        // Send based on filter criteria
        const whereClause: any = {
          status: 'ACTIVE',
          emailNotifications: options.filterCriteria?.emailNotifications ?? true
        };

        if (options.filterCriteria?.role) {
          whereClause.role = { in: options.filterCriteria.role };
        }

        if (options.type === 'NEWSLETTER' || options.type === 'ANNOUNCEMENT') {
          whereClause.marketingEmails = options.filterCriteria?.marketingEmails ?? true;
        }

        users = await prisma.user.findMany({
          where: whereClause,
          select: { id: true, email: true, firstName: true, lastName: true }
        });
      }

      let sent = 0;
      let failed = 0;

      // Send emails in batches to avoid overwhelming the SMTP server
      const batchSize = 50;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        const emailPromises = batch.map(async (user) => {
          try {
            await this.sendNotificationEmail(user, options);
            
            // Create in-app notification
            await prisma.notification.create({
              data: {
                userId: user.id,
                title: options.title,
                message: this.getNotificationMessage(options.type, options.data),
                type: this.mapNotificationType(options.type),
                data: options.data
              }
            });
            
            return { success: true };
          } catch (error) {
            logger.error(`Failed to send notification to user ${user.id}`, error);
            return { success: false };
          }
        });

        const results = await Promise.allSettled(emailPromises);
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            sent++;
          } else {
            failed++;
          }
        });

        // Add delay between batches
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(`Bulk notification sent: ${sent} successful, ${failed} failed`);
      return { sent, failed };

    } catch (error) {
      logger.error('Failed to send bulk notification', error);
      throw error;
    }
  }

  private async sendNotificationEmail(user: any, options: NotificationOptions) {
    const emailData = {
      firstName: user.firstName,
      lastName: user.lastName,
      ...options.data
    };

    switch (options.type) {
      case 'NEW_JOB':
        return emailService.sendEmail({
          to: user.email,
          subject: `New Job Alert: ${options.data.jobTitle}`,
          template: 'new-job-notification',
          data: emailData
        });
        
      case 'NEW_CHALLENGE':
        return emailService.sendEmail({
          to: user.email,
          subject: `New Challenge: ${options.data.challengeTitle}`,
          template: 'new-challenge-notification',
          data: emailData
        });
        
      case 'NEWSLETTER':
        return emailService.sendEmail({
          to: user.email,
          subject: options.title,
          template: 'newsletter',
          data: emailData
        });
        
      case 'ANNOUNCEMENT':
        return emailService.sendEmail({
          to: user.email,
          subject: options.title,
          template: 'announcement',
          data: emailData
        });
    }
  }

  private getNotificationMessage(type: string, data: any): string {
    switch (type) {
      case 'NEW_JOB':
        return `New job posted: ${data.jobTitle} - Budget: ${data.budget}`;
      case 'NEW_CHALLENGE':
        return `New challenge available: ${data.challengeTitle} - Prize: ${data.prizePool}`;
      case 'NEWSLETTER':
        return data.excerpt || 'Check out our latest newsletter';
      case 'ANNOUNCEMENT':
        return data.message || 'New announcement from NairaGig';
      default:
        return 'New notification';
    }
  }

  private mapNotificationType(type: string) {
    switch (type) {
      case 'NEW_JOB':
        return 'JOB_APPLICATION';
      case 'NEW_CHALLENGE':
        return 'CHALLENGE';
      case 'NEWSLETTER':
      case 'ANNOUNCEMENT':
        return 'MARKETING';
      default:
        return 'SYSTEM';
    }
  }

  // Notify users about new jobs matching their skills/preferences
  async notifyNewJob(jobId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { category: true, client: true }
    });

    if (!job) return;

    return this.sendBulkNotification({
      type: 'NEW_JOB',
      title: `New Job: ${job.title}`,
      data: {
        jobId: job.id,
        jobTitle: job.title,
        budget: `₦${job.budgetMin?.toLocaleString()} - ₦${job.budgetMax?.toLocaleString()}`,
        category: job.category?.name,
        clientName: `${job.client.firstName} ${job.client.lastName}`,
        jobUrl: `https://nairagig.com/jobs/${job.id}`,
        description: job.description.substring(0, 200) + '...'
      },
      filterCriteria: {
        role: ['FREELANCER'],
        emailNotifications: true
      }
    });
  }

  // Notify users about new challenges
  async notifyNewChallenge(challengeId: string) {
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { creator: true }
    });

    if (!challenge) return;

    return this.sendBulkNotification({
      type: 'NEW_CHALLENGE',
      title: `New Challenge: ${challenge.title}`,
      data: {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        prizePool: `₦${challenge.totalPrizePool.toLocaleString()}`,
        category: challenge.category,
        registrationEnd: challenge.registrationEnd.toLocaleDateString(),
        submissionEnd: challenge.submissionEnd.toLocaleDateString(),
        challengeUrl: `https://nairagig.com/challenges/${challenge.id}`,
        description: challenge.description.substring(0, 200) + '...'
      },
      filterCriteria: {
        role: ['FREELANCER'],
        emailNotifications: true
      }
    });
  }
}

export const notificationService = new NotificationService();