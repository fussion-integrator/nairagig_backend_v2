import { Router } from 'express';
import { ReferralController } from '../controllers/referral.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const referralController = new ReferralController();

// Generate referral code (authenticated)
router.post('/generate-code', authenticate, referralController.generateReferralCode);

// Process referral signup (public - called during registration)
router.post('/process', referralController.processReferralSignup);

// Get user referrals (authenticated)
router.get('/my-referrals', authenticate, referralController.getUserReferrals);

// Validate referral code (public - for signup form)
router.get('/validate/:code', referralController.validateReferralCode);

// Complete referral (internal - called when referee completes first action)
router.post('/:referralId/complete', authenticate, referralController.completeReferral);

// Referral Challenge routes
router.get('/challenge', authenticate, referralController.getReferralChallenge);
router.post('/challenge/claim', authenticate, referralController.claimReferralReward);

export default router;