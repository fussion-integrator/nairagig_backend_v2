import { Router } from 'express';
import { DisputeController } from '@/controllers/dispute.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const disputeController = new DisputeController();

router.use(authenticate);

router.get('/', disputeController.getDisputes.bind(disputeController));
router.get('/:id', disputeController.getDispute.bind(disputeController));
router.post('/', disputeController.createDispute.bind(disputeController));
router.post('/:id/respond', disputeController.respondToDispute.bind(disputeController));
router.put('/:id/resolve', authorize('ADMIN', 'SUPER_ADMIN'), disputeController.resolveDispute.bind(disputeController));

export { router as disputeRoutes };