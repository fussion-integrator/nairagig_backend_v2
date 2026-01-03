import { Router } from 'express';
import { LinkedInAmbassadorController } from '../controllers/linkedin-ambassador.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const linkedInController = new LinkedInAmbassadorController();

// All routes require authentication
router.use(authenticate);

router.get('/challenge', linkedInController.getAmbassadorChallenge);
router.post('/submit-post', linkedInController.submitPost);
router.post('/request-review', linkedInController.requestMilestoneReview);
router.post('/claim-earnings', linkedInController.claimApprovedEarnings);

export default router;