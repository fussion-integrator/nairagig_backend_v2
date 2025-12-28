import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const userController = new UserController();

// Public routes
router.get('/leaderboard', userController.getLeaderboard.bind(userController));
router.get('/:id/profile', userController.getPublicProfile.bind(userController));

// Profile routes (authenticated users)
router.get('/profile', authenticate, userController.getCurrentUserProfile.bind(userController));
router.get('/stats', authenticate, userController.getCurrentUserStats.bind(userController));
router.put('/profile', authenticate, userController.updateProfile.bind(userController));
router.post('/portfolio', authenticate, userController.addPortfolioItem.bind(userController));
router.put('/portfolio/:portfolioId', authenticate, userController.updatePortfolioItem.bind(userController));
router.delete('/portfolio/:portfolioId', authenticate, userController.deletePortfolioItem.bind(userController));
router.post('/social-links', authenticate, userController.addSocialLink.bind(userController));
router.put('/social-links/:linkId', authenticate, userController.updateSocialLink.bind(userController));
router.delete('/social-links/:linkId', authenticate, userController.deleteSocialLink.bind(userController));
router.get('/:id/rank', authenticate, userController.getUserRank.bind(userController));
router.get('/:id/submissions', authenticate, userController.getUserSubmissions.bind(userController));

// Admin only routes
router.get('/', authenticate, authorize('ADMIN'), userController.getUsers.bind(userController));
router.get('/admin/stats', authenticate, authorize('ADMIN'), userController.getUserStats.bind(userController));
router.get('/:id', authenticate, authorize('ADMIN'), userController.getUser.bind(userController));
router.post('/', authenticate, authorize('ADMIN'), userController.createUser.bind(userController));
router.put('/:id', authenticate, authorize('ADMIN'), userController.updateUser.bind(userController));
router.delete('/:id', authenticate, authorize('ADMIN'), userController.deleteUser.bind(userController));
router.post('/:id/suspend', authenticate, authorize('ADMIN'), userController.suspendUser.bind(userController));
router.post('/:id/reactivate', authenticate, authorize('ADMIN'), userController.reactivateUser.bind(userController));
router.get('/:id/activity', authenticate, authorize('ADMIN'), userController.getUserActivity.bind(userController));

export { router as userRoutes };