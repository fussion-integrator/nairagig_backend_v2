import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Transaction routes - Coming soon' });
});

export { router as transactionRoutes };