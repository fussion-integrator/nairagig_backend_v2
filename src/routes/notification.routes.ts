import { Router } from 'express';
import { NotificationController } from '@/controllers/notification.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const notificationController = new NotificationController();

router.use(authenticate);

router.get('/', notificationController.getNotifications.bind(notificationController));
router.put('/mark-all-read', notificationController.markAllAsRead.bind(notificationController));
router.put('/:id/read', notificationController.markAsRead.bind(notificationController));
router.delete('/:id', notificationController.deleteNotification.bind(notificationController));

export { router as notificationRoutes };