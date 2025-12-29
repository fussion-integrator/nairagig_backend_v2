import { Router } from 'express';
import { TwoFactorController } from '@/controllers/two-factor.controller';
import { getSessionStatus, extendSession } from '@/middleware/session-timeout.middleware';
import { authenticate } from '@/middleware/auth';

const router = Router();
const twoFactorController = new TwoFactorController();

// 2FA routes
router.post('/2fa/generate', twoFactorController.generateCode);
router.post('/2fa/verify', twoFactorController.verifyCode);

// Session management routes
router.get('/session/status', authenticate, getSessionStatus);
router.post('/session/extend', authenticate, extendSession);

export default router;