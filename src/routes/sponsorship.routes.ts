import { Router } from 'express';
import { SponsorshipApplicationController } from '@/controllers/sponsorship-application.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const controller = new SponsorshipApplicationController();

router.post('/apply', authenticate, controller.applyForSponsorship);
router.get('/applications', authenticate, controller.getApplications);
router.put('/applications/:id/status', authenticate, controller.updateApplicationStatus);
router.get('/verify-payment/:reference', controller.verifyPayment);

export default router;