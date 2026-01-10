import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  submitContent,
  getUserPosts,
  updatePostMetrics,
  getPostStats,
  uploadMiddleware
} from '../controllers/content-creator.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Submit new content with file upload
router.post('/submit', uploadMiddleware, submitContent);

// Get user's posts
router.get('/posts', getUserPosts);

// Get user statistics
router.get('/stats', getPostStats);

// Update post metrics (admin only)
router.put('/posts/:postId/metrics', updatePostMetrics);

export default router;