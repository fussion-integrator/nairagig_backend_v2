import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { subscriptionController } from '../controllers/subscription.controller'

const router = Router()

// Routes
router.get('/plans', subscriptionController.getPlans)
router.get('/wallet-balance', authenticate, subscriptionController.checkWalletBalance)
router.get('/current', authenticate, subscriptionController.getCurrentSubscription)
router.post('/initialize', authenticate, subscriptionController.initializeSubscription)
router.get('/verify/:reference', subscriptionController.verifySubscription)
router.post('/cancel', authenticate, subscriptionController.cancelSubscription)
router.get('/history', authenticate, subscriptionController.getSubscriptionHistory)

export { router as subscriptionRoutes }
export default router