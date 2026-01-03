import { Router } from 'express';
import { FacebookAmbassadorController } from '../controllers/facebook-ambassador.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const facebookAmbassadorController = new FacebookAmbassadorController();

// All routes require authentication
router.use(authenticate);

// Get Facebook ambassador challenge data
router.get('/challenge', facebookAmbassadorController.getAmbassadorChallenge);

// Submit Facebook post
router.post('/submit-post', facebookAmbassadorController.submitPost);

// Request milestone review
router.post('/request-review', facebookAmbassadorController.requestMilestoneReview);

// Claim approved earnings
router.post('/claim-earnings', facebookAmbassadorController.claimApprovedEarnings);

export default router;