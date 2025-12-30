import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/adminAuth';
import passport from 'passport';

const router = Router();
const adminController = new AdminController();

// Public routes
router.post('/login', adminController.login.bind(adminController));
router.get('/validate-invitation/:token', adminController.validateInvitationToken.bind(adminController));
router.post('/accept-invitation', adminController.acceptInvitation.bind(adminController));
router.post('/refresh', adminController.refreshTokens.bind(adminController));

// Google OAuth for admin
router.get('/google', passport.authenticate('google-admin', { scope: ['profile', 'email'] }));
router.get('/google/callback', 
  passport.authenticate('google-admin', { failureRedirect: '/login?error=oauth_failed' }), 
  adminController.googleCallback.bind(adminController)
);

// Auth verification route (uses cookies)
router.get('/verify', adminController.verifyAuth.bind(adminController));

// Protected routes
router.use(authenticateAdmin);

router.get('/me', adminController.me.bind(adminController));
router.post('/logout', adminController.logout.bind(adminController));

// Super admin only routes
router.post('/invite', requireSuperAdmin, adminController.inviteAdmin.bind(adminController));
router.get('/list', requireSuperAdmin, adminController.getAdmins.bind(adminController));
router.get('/invitations', requireSuperAdmin, adminController.getInvitations.bind(adminController));
router.put('/:adminId/permissions', requireSuperAdmin, adminController.updatePermissions.bind(adminController));

export default router;