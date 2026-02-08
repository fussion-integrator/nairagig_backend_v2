import { Router } from 'express';
import { StatsController } from '@/controllers/stats.controller';

const router = Router();
const statsController = new StatsController();

// Public endpoint - no auth required
router.get('/public', statsController.getPublicStats.bind(statsController));

export { router as statsRoutes };
