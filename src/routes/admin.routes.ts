import { Router } from 'express';
import { AdminController } from '@/controllers/admin.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const adminController = new AdminController();

// Protected admin routes
router.use(authenticate);
router.use(authorize('ADMIN'));

router.post('/users/:userId/suspend', adminController.suspendAccount.bind(adminController));
router.post('/users/:userId/grant-feature', adminController.grantFeatureAccess.bind(adminController));
router.post('/users/:userId/violation-warning', adminController.sendViolationWarning.bind(adminController));

export { router as adminRoutes };