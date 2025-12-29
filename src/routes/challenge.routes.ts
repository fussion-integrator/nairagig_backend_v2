import { Router } from 'express';
import { ChallengeController } from '@/controllers/challenge.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const challengeController = new ChallengeController();

// Public routes
router.get('/', challengeController.getChallenges.bind(challengeController));
router.get('/:id', challengeController.getChallenge.bind(challengeController));
router.get('/:challengeId/leaderboard', challengeController.getLeaderboard.bind(challengeController));

// Protected routes
router.use(authenticate);

router.post('/', authorize('CLIENT'), challengeController.createChallenge.bind(challengeController));
router.post('/:challengeId/register', challengeController.registerForChallenge.bind(challengeController));
router.delete('/:challengeId/withdraw', challengeController.withdrawFromChallenge.bind(challengeController));
router.post('/:challengeId/submit', challengeController.submitSolution.bind(challengeController));
router.post('/:challengeId/publish-results', authorize('ADMIN'), challengeController.publishChallengeResults.bind(challengeController));
router.post('/:challengeId/announce-winner', authorize('ADMIN'), challengeController.announceWinner.bind(challengeController));
router.post('/:challengeId/cancel', authorize('ADMIN'), challengeController.cancelChallenge.bind(challengeController));
router.post('/:challengeId/notify-new', authorize('ADMIN'), challengeController.notifyNewChallenge.bind(challengeController));

export { router as challengeRoutes };