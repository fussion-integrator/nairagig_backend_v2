import { Router } from 'express';
import { ReviewController } from '@/controllers/review.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const reviewController = new ReviewController();

router.use(authenticate);

router.get('/', reviewController.getReviews.bind(reviewController));
router.get('/stats', reviewController.getReviewStats.bind(reviewController));
router.get('/:id', reviewController.getReview.bind(reviewController));
router.post('/', reviewController.createReview.bind(reviewController));
router.put('/:id/reply', reviewController.replyToReview.bind(reviewController));

export { router as reviewRoutes };