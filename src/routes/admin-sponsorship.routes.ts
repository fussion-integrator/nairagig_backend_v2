import { Router } from 'express';
import { AdminSponsorshipController } from '../controllers/admin-sponsorship.controller';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();
const adminSponsorshipController = new AdminSponsorshipController();

// All routes require admin authentication
router.use(authenticateAdmin);

// Admin sponsorship management routes
router.get('/', adminSponsorshipController.getAllRequests);
router.get('/stats', adminSponsorshipController.getRequestStats);
router.get('/:id', adminSponsorshipController.getRequestById);
router.patch('/:id/review', adminSponsorshipController.reviewRequest);
router.patch('/:id', adminSponsorshipController.updateRequest);

export default router;