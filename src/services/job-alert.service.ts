import { PrismaClient } from '@prisma/client';
import { JobSearchService } from './job-search.service';
import { NotificationService } from './notification.service';

const prisma = new PrismaClient();

interface JobAlert {
  id: string;
  userId: string;
  name: string;
  filters: any;
  frequency: 'DAILY' | 'WEEKLY' | 'INSTANT';
  isActive: boolean;
  lastRun?: Date;
}

export class JobAlertService {
  private jobSearchService: JobSearchService;
  private notificationService: NotificationService;

  constructor() {
    this.jobSearchService = new JobSearchService();
    this.notificationService = new NotificationService();
  }

  async createJobAlert(userId: string, alertData: {
    name: string;
    filters: any;
    frequency: 'DAILY' | 'WEEKLY' | 'INSTANT';
  }) {
    return await prisma.jobAlert.create({
      data: {
        userId,
        name: alertData.name,
        filters: JSON.stringify(alertData.filters),
        frequency: alertData.frequency,
        isActive: true
      }
    });
  }

  async processJobAlerts() {
    const activeAlerts = await prisma.jobAlert.findMany({
      where: { isActive: true },
      include: { user: true }
    });

    for (const alert of activeAlerts) {
      try {
        await this.processAlert(alert);
      } catch (error) {
        console.error(`Error processing alert ${alert.id}:`, error);
      }
    }
  }

  private async processAlert(alert: any) {
    const filters = JSON.parse(alert.filters);
    const jobs = await this.jobSearchService.searchJobs(filters, alert.userId);

    // Get jobs posted since last run
    const lastRun = alert.lastRun || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newJobs = jobs.filter(job => new Date(job.postedDate) > lastRun);

    if (newJobs.length > 0) {
      await this.sendJobAlert(alert.user, alert.name, newJobs);
      
      // Update last run
      await prisma.jobAlert.update({
        where: { id: alert.id },
        data: { lastRun: new Date() }
      });
    }
  }

  private async sendJobAlert(user: any, alertName: string, jobs: any[]) {
    const notification = {
      userId: user.id,
      title: `New Jobs Found: ${alertName}`,
      message: `${jobs.length} new job${jobs.length > 1 ? 's' : ''} match your criteria`,
      type: 'JOB_ALERT',
      data: { jobs: jobs.slice(0, 5) }, // Send top 5 jobs
      actionText: 'View Jobs',
      actionUrl: '/ai-job-scout'
    };

    await this.notificationService.createNotification(notification);

    // Send email if user has email notifications enabled
    if (user.emailNotifications) {
      await this.sendJobAlertEmail(user, alertName, jobs);
    }
  }

  private async sendJobAlertEmail(user: any, alertName: string, jobs: any[]) {
    // Implement email sending logic
    console.log(`Sending job alert email to ${user.email} for ${jobs.length} jobs`);
  }

  async getUserJobAlerts(userId: string) {
    return await prisma.jobAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateJobAlert(alertId: string, userId: string, updates: any) {
    return await prisma.jobAlert.update({
      where: { id: alertId, userId },
      data: {
        ...updates,
        filters: updates.filters ? JSON.stringify(updates.filters) : undefined
      }
    });
  }

  async deleteJobAlert(alertId: string, userId: string) {
    return await prisma.jobAlert.delete({
      where: { id: alertId, userId }
    });
  }
}