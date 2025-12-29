import { Router } from 'express';
import { ScheduledJobsController } from '@/controllers/scheduled-jobs.controller';

const router = Router();
const scheduledJobsController = new ScheduledJobsController();

// Webhook endpoints for external cron services
router.post('/all', scheduledJobsController.processAllJobs.bind(scheduledJobsController));
router.post('/deadlines', scheduledJobsController.processDeadlineReminders.bind(scheduledJobsController));
router.post('/accounts', scheduledJobsController.processAccountReminders.bind(scheduledJobsController));
router.post('/payments', scheduledJobsController.processPaymentReminders.bind(scheduledJobsController));

export { router as scheduledJobsRoutes };