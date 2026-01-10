import { Router } from 'express';
import { completePhoneVerification, getVerificationStatus, updatePhoneNumber } from '../controllers/phone-verification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get current verification status
router.get('/status', authenticate, getVerificationStatus);

// Complete phone verification (with bonus for existing users)
router.post('/complete', authenticate, completePhoneVerification);

// Update phone number (requires re-verification)
router.put('/update', authenticate, updatePhoneNumber);

export default router;