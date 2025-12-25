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
router.post('/:challengeId/submit', challengeController.submitSolution.bind(challengeController));

export { router as challengeRoutes };