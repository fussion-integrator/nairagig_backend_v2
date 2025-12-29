import { Router } from 'express';
import { TestController } from '@/controllers/test.controller';

const router = Router();
const testController = new TestController();

// Test email endpoint
router.post('/send-email', testController.sendTestEmail);

export default router;