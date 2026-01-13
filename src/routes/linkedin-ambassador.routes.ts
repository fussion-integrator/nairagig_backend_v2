import { Router } from 'express';
import { LinkedInAmbassadorController } from '../controllers/linkedin-ambassador.controller';
import { optionalAuth, authenticate } from '../middleware/auth';

const router = Router();
const controller = new LinkedInAmbassadorController();

// LinkedIn Ambassador APIs
router.get('/challenge', optionalAuth, controller.getChallengeData.bind(controller));
router.post('/submit-post', authenticate, controller.submitPost.bind(controller));
router.post('/claim-earnings', authenticate, controller.claimEarnings.bind(controller));
router.post('/request-review', authenticate, controller.requestReview.bind(controller));

export { router as linkedInAmbassadorRoutes };
export default router;