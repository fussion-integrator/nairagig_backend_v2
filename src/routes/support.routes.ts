import { Router } from 'express';
import { SupportController } from '@/controllers/support.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const supportController = new SupportController();

// Protected routes
router.use(authenticate);

router.post('/tickets', supportController.createSupportTicket.bind(supportController));
router.get('/tickets', supportController.getSupportTickets.bind(supportController));
router.get('/tickets/:id', supportController.getSupportTicket.bind(supportController));

export { router as supportRoutes };