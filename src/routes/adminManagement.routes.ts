import { Router } from 'express';
import { AdminUserController } from '../controllers/adminUser.controller';
import { AdminDashboardController } from '../controllers/adminDashboard.controller';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();
const adminUserController = new AdminUserController();
const adminDashboardController = new AdminDashboardController();
const adminController = new AdminController();

// Debug route (no auth required)
router.get('/debug/sessions', async (req, res) => {
  try {
    const { prisma } = await import('@/config/database');
    const sessions = await prisma.adminSession.findMany({
      where: { isActive: true },
      include: { admin: { select: { email: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ 
      success: true, 
      data: sessions.map(s => ({
        id: s.id,
        token: s.token, // Show full token for debugging
        adminEmail: s.admin.email,
        created: s.createdAt,
        expires: s.expiresAt,
        isActive: s.isActive
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// All routes below require admin authentication
router.use((req, res, next) => {
  console.log('📍 AdminManagement route hit:', req.method, req.path);
  next();
});
router.use(authenticateAdmin);

// Dashboard routes
router.get('/dashboard', adminDashboardController.getDashboard.bind(adminDashboardController));
router.get('/stats', adminDashboardController.getStats.bind(adminDashboardController));
router.get('/activities', adminDashboardController.getActivities.bind(adminDashboardController));

// User management routes
router.get('/users/export', adminUserController.exportUsers.bind(adminUserController));
router.get('/users', adminUserController.getUsers.bind(adminUserController));
router.post('/users', adminUserController.createUser.bind(adminUserController));
router.post('/users/bulk-action', adminUserController.bulkAction.bind(adminUserController));
router.get('/users/:userId', adminUserController.getUserById.bind(adminUserController));
router.put('/users/:userId', adminUserController.updateUser.bind(adminUserController));
router.put('/users/:userId/status', adminUserController.updateUserStatus.bind(adminUserController));
router.delete('/users/:userId', adminUserController.deleteUser.bind(adminUserController));
router.delete('/users/:userId/permanent', adminUserController.permanentlyDeleteUser.bind(adminUserController));
router.put('/users/:userId/restore', adminUserController.restoreUser.bind(adminUserController));
router.post('/users/:userId/suspend', adminUserController.suspendUser.bind(adminUserController));
router.post('/users/:userId/activate', adminUserController.activateUser.bind(adminUserController));
router.put('/users/:userId/verify', adminUserController.verifyUser.bind(adminUserController));
router.put('/users/:userId/unverify', adminUserController.unverifyUser.bind(adminUserController));
router.post('/users/:userId/reset-password', adminUserController.resetPassword.bind(adminUserController));
router.post('/users/:userId/send-message', adminUserController.sendMessageToUser.bind(adminUserController));
router.get('/users/:userId/activity', adminUserController.getUserActivity.bind(adminUserController));

// User detail endpoints
router.get('/users/:userId/documents', adminUserController.getUserDocuments.bind(adminUserController));
router.get('/users/:userId/jobs', adminUserController.getUserJobs.bind(adminUserController));
router.get('/users/:userId/challenges', adminUserController.getUserChallenges.bind(adminUserController));
router.get('/users/:userId/transactions', adminUserController.getUserTransactions.bind(adminUserController));
router.get('/users/:userId/wallet', adminUserController.getUserWallet.bind(adminUserController));
router.get('/users/:userId/payment-methods', adminUserController.getUserPaymentMethods.bind(adminUserController));
router.get('/users/:userId/subscription', adminUserController.getUserSubscription.bind(adminUserController));
router.get('/users/:userId/payment-history', adminUserController.getUserPaymentHistory.bind(adminUserController));

// Admin management routes
router.post('/admins/invite', adminController.inviteAdmin.bind(adminController));
router.get('/admins/list', adminController.getAdmins.bind(adminController));
router.get('/admins/invitations', adminController.getInvitations.bind(adminController));
router.put('/admins/:adminId/permissions', adminController.updatePermissions.bind(adminController));
router.put('/admins/:adminId/suspend', adminController.suspendAdmin.bind(adminController));
router.put('/admins/:adminId/activate', adminController.activateAdmin.bind(adminController));
router.delete('/admins/invitations/:invitationId', adminController.revokeInvitation.bind(adminController));
router.get('/admins/export', adminController.exportAdmins.bind(adminController));
router.get('/admins/stats', adminController.getAdminStats.bind(adminController));
router.post('/admins/send-invitation-email', adminController.sendInvitationEmail.bind(adminController));

export default router;