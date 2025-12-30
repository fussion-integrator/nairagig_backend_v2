import { Router } from 'express';
import { AdminUserController } from '../controllers/adminUser.controller';
import { AdminDashboardController } from '../controllers/adminDashboard.controller';
import { AdminController } from '../controllers/admin.controller';
import { authenticateAdmin, requirePermission, requireSuperAdmin } from '../middleware/adminAuth';
import { Permission } from '@prisma/client';

const router = Router();
const adminUserController = new AdminUserController();
const adminDashboardController = new AdminDashboardController();
const adminController = new AdminController();

// All routes require admin authentication
router.use(authenticateAdmin);

// Dashboard routes
router.get('/dashboard', requirePermission(Permission.VIEW_ANALYTICS), adminDashboardController.getDashboard.bind(adminDashboardController));
router.get('/stats', requirePermission(Permission.VIEW_ANALYTICS), adminDashboardController.getStats.bind(adminDashboardController));
router.get('/activities', requirePermission(Permission.VIEW_AUDIT_LOGS), adminDashboardController.getActivities.bind(adminDashboardController));

// User management routes
router.get('/users/export', requirePermission(Permission.VIEW_USERS), adminUserController.exportUsers.bind(adminUserController));
router.get('/users', requirePermission(Permission.VIEW_USERS), adminUserController.getUsers.bind(adminUserController));
router.post('/users', requirePermission(Permission.EDIT_USERS), adminUserController.createUser.bind(adminUserController));
router.post('/users/bulk-action', requirePermission(Permission.EDIT_USERS), adminUserController.bulkAction.bind(adminUserController));
router.get('/users/:userId', requirePermission(Permission.VIEW_USERS), adminUserController.getUserById.bind(adminUserController));
router.put('/users/:userId', requirePermission(Permission.EDIT_USERS), adminUserController.updateUser.bind(adminUserController));
router.put('/users/:userId/status', requirePermission(Permission.SUSPEND_USERS), adminUserController.updateUserStatus.bind(adminUserController));
router.delete('/users/:userId', requirePermission(Permission.DELETE_USERS), adminUserController.deleteUser.bind(adminUserController));
router.delete('/users/:userId/permanent', requirePermission(Permission.DELETE_USERS), adminUserController.permanentlyDeleteUser.bind(adminUserController));
router.put('/users/:userId/restore', requirePermission(Permission.DELETE_USERS), adminUserController.restoreUser.bind(adminUserController));
router.post('/users/:userId/suspend', requirePermission(Permission.SUSPEND_USERS), adminUserController.suspendUser.bind(adminUserController));
router.post('/users/:userId/activate', requirePermission(Permission.SUSPEND_USERS), adminUserController.activateUser.bind(adminUserController));
router.put('/users/:userId/verify', requirePermission(Permission.VERIFY_USERS), adminUserController.verifyUser.bind(adminUserController));
router.put('/users/:userId/unverify', requirePermission(Permission.VERIFY_USERS), adminUserController.unverifyUser.bind(adminUserController));
router.post('/users/:userId/reset-password', requirePermission(Permission.EDIT_USERS), adminUserController.resetPassword.bind(adminUserController));
router.post('/users/:userId/send-message', requirePermission(Permission.EDIT_USERS), adminUserController.sendMessageToUser.bind(adminUserController));
router.get('/users/:userId/activity', requirePermission(Permission.VIEW_USERS), adminUserController.getUserActivity.bind(adminUserController));

// User detail endpoints
router.get('/users/:userId/documents', requirePermission(Permission.VIEW_USERS), adminUserController.getUserDocuments.bind(adminUserController));
router.get('/users/:userId/jobs', requirePermission(Permission.VIEW_USERS), adminUserController.getUserJobs.bind(adminUserController));
router.get('/users/:userId/challenges', requirePermission(Permission.VIEW_USERS), adminUserController.getUserChallenges.bind(adminUserController));
router.get('/users/:userId/transactions', requirePermission(Permission.VIEW_USERS), adminUserController.getUserTransactions.bind(adminUserController));
router.get('/users/:userId/wallet', requirePermission(Permission.VIEW_USERS), adminUserController.getUserWallet.bind(adminUserController));
router.get('/users/:userId/payment-methods', requirePermission(Permission.VIEW_USERS), adminUserController.getUserPaymentMethods.bind(adminUserController));
router.get('/users/:userId/subscription', requirePermission(Permission.VIEW_USERS), adminUserController.getUserSubscription.bind(adminUserController));
router.get('/users/:userId/payment-history', requirePermission(Permission.VIEW_USERS), adminUserController.getUserPaymentHistory.bind(adminUserController));

// Admin management routes
router.post('/admins/invite', requireSuperAdmin, adminController.inviteAdmin.bind(adminController));
router.get('/admins/list', requireSuperAdmin, adminController.getAdmins.bind(adminController));
router.get('/admins/invitations', requireSuperAdmin, adminController.getInvitations.bind(adminController));
router.put('/admins/:adminId/permissions', requireSuperAdmin, adminController.updatePermissions.bind(adminController));
router.put('/admins/:adminId/suspend', requireSuperAdmin, adminController.suspendAdmin.bind(adminController));
router.put('/admins/:adminId/activate', requireSuperAdmin, adminController.activateAdmin.bind(adminController));
router.delete('/admins/invitations/:invitationId', requireSuperAdmin, adminController.revokeInvitation.bind(adminController));
router.get('/admins/export', requireSuperAdmin, adminController.exportAdmins.bind(adminController));
router.get('/admins/stats', requireSuperAdmin, adminController.getAdminStats.bind(adminController));
router.post('/admins/send-invitation-email', adminController.sendInvitationEmail.bind(adminController));

export default router;