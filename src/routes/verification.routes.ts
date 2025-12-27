import { Router } from 'express';
import { VerificationController } from '@/controllers/verification.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const verificationController = new VerificationController();

// User routes (authenticated users)
router.post('/submit', authenticate, verificationController.submitVerification.bind(verificationController));
router.get('/status', authenticate, verificationController.getVerificationStatus.bind(verificationController));

// Admin routes (admin only)
router.get('/', authenticate, authorize('ADMIN'), verificationController.getAllVerifications.bind(verificationController));
router.get('/stats', authenticate, authorize('ADMIN'), verificationController.getVerificationStats.bind(verificationController));
router.put('/:verificationId/approve', authenticate, authorize('ADMIN'), verificationController.approveVerification.bind(verificationController));
router.put('/:verificationId/reject', authenticate, authorize('ADMIN'), verificationController.rejectVerification.bind(verificationController));
router.put('/:verificationId/request-docs', authenticate, authorize('ADMIN'), verificationController.requestAdditionalDocuments.bind(verificationController));

export { router as verificationRoutes };