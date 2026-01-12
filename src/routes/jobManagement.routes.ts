import { Router } from 'express';
import { JobManagementController } from '../controllers/jobManagement.controller';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();
const jobController = new JobManagementController();

// Job Details
router.get('/:jobId', authenticateAdmin, jobController.getJobDetails);
router.put('/:jobId', authenticateAdmin, jobController.updateJob);

// Payment Management
router.post('/:jobId/release-payment', authenticateAdmin, jobController.releasePayment);
router.post('/:jobId/hold-payment', authenticateAdmin, jobController.holdPayment);
router.post('/:jobId/dispute-payment', authenticateAdmin, jobController.disputePayment);

// Applicant Management
router.get('/:jobId/applications', authenticateAdmin, jobController.getApplications);
router.post('/:jobId/applications/:appId/accept', authenticateAdmin, jobController.acceptApplication);
router.post('/:jobId/applications/:appId/reject', authenticateAdmin, jobController.rejectApplication);

// Communication
router.get('/:jobId/conversations', authenticateAdmin, jobController.getConversations);
router.post('/:jobId/messages', authenticateAdmin, jobController.sendMessage);

// Activity & Disputes
router.get('/:jobId/activity', authenticateAdmin, jobController.getActivity);
router.get('/:jobId/disputes', authenticateAdmin, jobController.getDisputes);
router.post('/:jobId/disputes', authenticateAdmin, jobController.createDispute);

export default router;