import { Router } from 'express';
import { AdminRewardController } from '@/controllers/admin-reward.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const adminRewardController = new AdminRewardController();

// Reward configuration management
router.get('/configs', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.getRewardConfigs.bind(adminRewardController));
router.post('/configs', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.createRewardConfig.bind(adminRewardController));
router.put('/configs/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.updateRewardConfig.bind(adminRewardController));
router.delete('/configs/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.deleteRewardConfig.bind(adminRewardController));

// Reward analytics
router.get('/analytics', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.getRewardAnalytics.bind(adminRewardController));

// User rewards management
router.get('/user-rewards', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.getAllUserRewards.bind(adminRewardController));
router.post('/award-manual', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.awardManualReward.bind(adminRewardController));

// Badge management
router.get('/badges', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.getBadges.bind(adminRewardController));
router.post('/badges', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.createBadge.bind(adminRewardController));

// Leaderboard management
router.get('/leaderboards', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.getLeaderboards.bind(adminRewardController));
router.post('/leaderboards', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.createLeaderboard.bind(adminRewardController));

// Campaign management
router.get('/campaigns', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.getCampaigns.bind(adminRewardController));
router.post('/campaigns', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.createCampaign.bind(adminRewardController));
router.put('/campaigns/:id/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), adminRewardController.updateCampaignStatus.bind(adminRewardController));

export { router as adminRewardRoutes };