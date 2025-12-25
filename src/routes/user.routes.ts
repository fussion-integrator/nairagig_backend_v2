import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const userController = new UserController();

// Profile routes (authenticated users)
router.put('/profile', authenticate, userController.updateProfile.bind(userController));
router.post('/portfolio', authenticate, userController.addPortfolioItem.bind(userController));
router.put('/portfolio/:portfolioId', authenticate, userController.updatePortfolioItem.bind(userController));
router.delete('/portfolio/:portfolioId', authenticate, userController.deletePortfolioItem.bind(userController));

// Admin only routes
router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/', userController.getUsers.bind(userController));
router.get('/stats', userController.getUserStats.bind(userController));
router.get('/:id', userController.getUser.bind(userController));
router.post('/', userController.createUser.bind(userController));
router.put('/:id', userController.updateUser.bind(userController));
router.delete('/:id', userController.deleteUser.bind(userController));
router.post('/:id/suspend', userController.suspendUser.bind(userController));
router.post('/:id/reactivate', userController.reactivateUser.bind(userController));
router.get('/:id/activity', userController.getUserActivity.bind(userController));

export { router as userRoutes };