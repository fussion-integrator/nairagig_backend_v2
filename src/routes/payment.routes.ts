import { Router } from 'express';
import { PaymentController } from '@/controllers/payment.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const paymentController = new PaymentController();

// Initialize payment
router.post('/initialize', authenticate, paymentController.initializePayment.bind(paymentController));

// Verify payment
router.get('/verify/:reference', authenticate, paymentController.verifyPayment.bind(paymentController));

// Payment history
router.get('/history', authenticate, paymentController.getPaymentHistory.bind(paymentController));

// Webhook (no auth required)
router.post('/webhook/paystack', paymentController.handleWebhook.bind(paymentController));

export { router as paymentRoutes };