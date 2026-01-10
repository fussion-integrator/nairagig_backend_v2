import { Router } from 'express';
import { TwitterAmbassadorController } from '../controllers/twitter-ambassador.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const twitterAmbassadorController = new TwitterAmbassadorController();

// All routes require authentication
router.use(authenticate);

// Get Twitter ambassador challenge data
router.get('/challenge', (req, res) => twitterAmbassadorController.getAmbassadorChallenge(req, res));

// Submit Twitter post
router.post('/submit-post', (req, res) => twitterAmbassadorController.submitPost(req, res));

// Request milestone review
router.post('/request-review', (req, res) => twitterAmbassadorController.requestMilestoneReview(req, res));

// Claim approved earnings
router.post('/claim-earnings', (req, res) => twitterAmbassadorController.claimApprovedEarnings(req, res));

export default router;