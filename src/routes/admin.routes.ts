import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin } from '../middleware/adminAuth';
import passport from 'passport';

const router = Router();
const adminController = new AdminController();

// Google OAuth for admin
router.get('/google', passport.authenticate('google-admin', { scope: ['profile', 'email'] }));
router.get('/google/callback', 
  passport.authenticate('google-admin', { failureRedirect: '/login?error=oauth_failed' }), 
  adminController.googleCallback.bind(adminController)
);

// Public routes
router.get('/stats', adminController.getStats.bind(adminController));
router.get('/system/health', adminController.getSystemHealth.bind(adminController));

// Protected routes
router.use(authenticateAdmin);

router.get('/me', adminController.me.bind(adminController));
router.post('/refresh', adminController.refresh.bind(adminController));

export default router;