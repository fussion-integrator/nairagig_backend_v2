import { Request, Response, NextFunction } from 'express';
import { ScheduledJobsService } from '@/services/scheduled-jobs.service';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class ScheduledJobsController {
  private scheduledJobsService = new ScheduledJobsService();

  async processAllJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const { authorization } = req.headers;
      
      if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        throw ApiError.unauthorized('Invalid cron secret');
      }

      await this.scheduledJobsService.processAllScheduledJobs();
      
      res.json({ 
        success: true, 
        message: 'All scheduled jobs processed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  async processDeadlineReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const { authorization } = req.headers;
      
      if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        throw ApiError.unauthorized('Invalid cron secret');
      }

      await this.scheduledJobsService.processJobDeadlineReminders();
      await this.scheduledJobsService.processChallengeReminders();
      
      res.json({ success: true, message: 'Deadline reminders processed' });
    } catch (error) {
      next(error);
    }
  }

  async processAccountReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const { authorization } = req.headers;
      
      if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        throw ApiError.unauthorized('Invalid cron secret');
      }

      await this.scheduledJobsService.processInactiveAccountReminders();
      await this.scheduledJobsService.processReviewReminders();
      
      res.json({ success: true, message: 'Account reminders processed' });
    } catch (error) {
      next(error);
    }
  }

  async processPaymentReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const { authorization } = req.headers;
      
      if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        throw ApiError.unauthorized('Invalid cron secret');
      }

      await this.scheduledJobsService.processPaymentReminders();
      
      res.json({ success: true, message: 'Payment reminders processed' });
    } catch (error) {
      next(error);
    }
  }
}