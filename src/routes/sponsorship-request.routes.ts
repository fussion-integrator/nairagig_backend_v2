import { Router } from 'express';
import { SponsorshipRequestController } from '../controllers/sponsorship-request.controller';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation.middleware';

const router = Router();
const sponsorshipRequestController = new SponsorshipRequestController();

// All routes require authentication
router.use(authenticate);

// Check sponsorship status
router.get('/status', sponsorshipRequestController.checkSponsorshipStatus);

// User routes
router.post('/', sponsorshipRequestController.createRequest);
router.get('/my-requests', sponsorshipRequestController.getUserRequests);
router.get('/:id', sponsorshipRequestController.getRequestById);
router.patch('/:id/cancel', sponsorshipRequestController.cancelRequest);

export default router;