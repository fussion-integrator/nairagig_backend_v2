import { Router } from 'express';
import { TwitterAmbassadorController } from '../controllers/twitter-ambassador.controller';
import { optionalAuth, authenticate } from '../middleware/auth';

const router = Router();
const controller = new TwitterAmbassadorController();

// Twitter Ambassador APIs
router.get('/challenge', optionalAuth, controller.getChallengeData.bind(controller));
router.post('/submit-post', authenticate, controller.submitPost.bind(controller));
router.post('/claim-earnings', authenticate, controller.claimEarnings.bind(controller));
router.post('/request-review', authenticate, controller.requestReview.bind(controller));

export { router as twitterAmbassadorRoutes };
export default router;