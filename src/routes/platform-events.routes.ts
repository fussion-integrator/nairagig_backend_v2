import { Router } from 'express';
import { PlatformEventsController } from '@/controllers/platform-events.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const platformEventsController = new PlatformEventsController();

// Protected admin routes
router.use(authenticate);
router.use(authorize('ADMIN'));

router.post('/maintenance-notice', platformEventsController.sendMaintenanceNotice.bind(platformEventsController));
router.post('/feature-launch', platformEventsController.sendFeatureLaunch.bind(platformEventsController));
router.post('/security-breach', platformEventsController.sendSecurityBreach.bind(platformEventsController));
router.post('/newsletter', platformEventsController.sendNewsletter.bind(platformEventsController));

export { router as platformEventsRoutes };