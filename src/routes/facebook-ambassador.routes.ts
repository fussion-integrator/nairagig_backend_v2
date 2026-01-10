import { Router } from 'express';
import { FacebookAmbassadorController } from '../controllers/facebook-ambassador.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const facebookAmbassadorController = new FacebookAmbassadorController();

// All routes require authentication
router.use(authenticate);

// Get Facebook ambassador challenge data
router.get('/challenge', (req, res) => facebookAmbassadorController.getAmbassadorChallenge(req, res));

// Submit Facebook post
router.post('/submit-post', (req, res) => facebookAmbassadorController.submitPost(req, res));

// Request milestone review
router.post('/request-review', (req, res) => facebookAmbassadorController.requestMilestoneReview(req, res));

// Claim approved earnings
router.post('/claim-earnings', (req, res) => facebookAmbassadorController.claimApprovedEarnings(req, res));

export default router;