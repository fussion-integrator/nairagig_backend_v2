import { Router } from 'express';
import { SponsorshipTierController } from '@/controllers/sponsorship-tier.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const controller = new SponsorshipTierController();

router.get('/', controller.getTiers);
router.post('/', authenticate, controller.createTier);
router.put('/:id', authenticate, controller.updateTier);
router.delete('/:id', authenticate, controller.deleteTier);

export default router;