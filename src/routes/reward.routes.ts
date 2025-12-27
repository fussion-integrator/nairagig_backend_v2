import { Router } from 'express';
import { RewardController } from '@/controllers/reward.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const controller = new RewardController();

// Bind methods to avoid context issues
router.get('/stats', authenticate, controller.getUserRewardStats.bind(controller));
router.get('/', authenticate, controller.getUserRewards.bind(controller));
router.post('/:rewardId/claim', authenticate, controller.claimReward.bind(controller));
router.get('/badges', authenticate, controller.getUserBadges.bind(controller));
router.get('/leaderboards', authenticate, controller.getLeaderboards.bind(controller));
router.get('/referrals', authenticate, controller.getUserReferrals.bind(controller));
router.post('/referrals/generate-code', authenticate, controller.generateReferralCode.bind(controller));
router.post('/referrals/process', controller.processReferralSignup.bind(controller));

export default router;