import { Router } from 'express';
import { WalletController } from '@/controllers/wallet.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const walletController = new WalletController();

// Protected routes
router.use(authenticate);

router.get('/', walletController.getWallet.bind(walletController));
router.get('/transactions', walletController.getTransactions.bind(walletController));
router.post('/transactions', walletController.createTransaction.bind(walletController));
router.get('/transactions/:id', walletController.getTransaction.bind(walletController));
router.put('/transactions/:id', walletController.updateTransaction.bind(walletController));
router.get('/payment-methods', walletController.getPaymentMethods.bind(walletController));
router.post('/payment-methods', walletController.addPaymentMethod.bind(walletController));
router.post('/deposit', walletController.initializeDeposit.bind(walletController));
router.post('/withdraw', walletController.initializeWithdrawal.bind(walletController));

export { router as walletRoutes };