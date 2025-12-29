import { Router } from 'express';
// Remove non-existent imports
// import { sendBulkNotification, sendJobNotification, sendChallengeNotification } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();

// Placeholder routes - implement when notification controller methods are available
// router.post('/bulk', authenticate, authorize(['ADMIN', 'SUPER_ADMIN']), sendBulkNotification);
// router.post('/job/:jobId', authenticate, sendJobNotification);
// router.post('/challenge/:challengeId', authenticate, sendChallengeNotification);

export { router as notificationBulkRoutes };