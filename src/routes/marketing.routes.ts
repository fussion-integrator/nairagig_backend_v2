import { Router } from 'express';
import { MarketingController } from '@/controllers/marketing.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const marketingController = new MarketingController();

// Protected admin routes
router.use(authenticate);
router.use(authorize('ADMIN'));

router.post('/job-alerts/:jobId', marketingController.sendJobAlerts.bind(marketingController));
router.post('/challenge-alerts/:challengeId', marketingController.sendChallengeAlerts.bind(marketingController));
router.post('/weekly-report', marketingController.sendWeeklyReport.bind(marketingController));
router.post('/promotional-campaign', marketingController.sendPromotionalCampaign.bind(marketingController));
router.post('/monthly-stats', marketingController.sendMonthlyStats.bind(marketingController));

export { router as marketingRoutes };