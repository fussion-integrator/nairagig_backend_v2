import { Router } from 'express';
import { TwitterAmbassadorController } from '../controllers/twitter-ambassador.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const twitterAmbassadorController = new TwitterAmbassadorController();

// All routes require authentication
router.use(authenticate);

// Get Twitter ambassador challenge data
router.get('/challenge', twitterAmbassadorController.getAmbassadorChallenge);

// Submit Twitter post
router.post('/submit-post', twitterAmbassadorController.submitPost);

// Request milestone review
router.post('/request-review', twitterAmbassadorController.requestMilestoneReview);

// Claim approved earnings
router.post('/claim-earnings', twitterAmbassadorController.claimApprovedEarnings);

export default router;