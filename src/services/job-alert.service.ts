import { PrismaClient } from '@prisma/client';
import { JobSearchService } from './job-search.service';
import { notificationService } from './notification.service';

const prisma = new PrismaClient();

// JobAlert model doesn't exist in schema - feature disabled
export class JobAlertService {
  async createJobAlert(userId: string, alertData: any) {
    throw new Error('Job alerts feature is not yet implemented');
  }

  async processJobAlerts() {
    // Feature disabled
  }

  async getUserJobAlerts(userId: string) {
    return [];
  }

  async updateJobAlert(alertId: string, userId: string, updates: any) {
    throw new Error('Job alerts feature is not yet implemented');
  }

  async deleteJobAlert(alertId: string, userId: string) {
    throw new Error('Job alerts feature is not yet implemented');
  }
}