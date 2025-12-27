import { Router } from 'express';
import { BillingController } from '@/controllers/billing.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const billingController = new BillingController();

// Bank Accounts
router.get('/bank-accounts', authenticate, billingController.getBankAccounts.bind(billingController));
router.post('/bank-accounts', authenticate, billingController.addBankAccount.bind(billingController));
router.put('/bank-accounts/:id', authenticate, billingController.updateBankAccount.bind(billingController));
router.delete('/bank-accounts/:id', authenticate, billingController.deleteBankAccount.bind(billingController));

// Payment Cards
router.get('/payment-cards', authenticate, billingController.getPaymentCards.bind(billingController));
router.post('/payment-cards', authenticate, billingController.addPaymentCard.bind(billingController));
router.put('/payment-cards/:id', authenticate, billingController.updatePaymentCard.bind(billingController));
router.delete('/payment-cards/:id', authenticate, billingController.deletePaymentCard.bind(billingController));

// Payment History
router.get('/payment-history', authenticate, billingController.getPaymentHistory.bind(billingController));

// Banks
router.get('/banks', authenticate, billingController.getBanks.bind(billingController));
router.post('/verify-account', authenticate, billingController.verifyBankAccount.bind(billingController));
router.post('/verify-card', authenticate, billingController.verifyCardBin.bind(billingController));

export { router as billingRoutes };