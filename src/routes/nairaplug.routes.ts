import { Router } from 'express';
import {
  getPosts,
  getPost,
  createPost,
  updatePost,
  createResponse,
  togglePostLike,
  toggleResponseLike,
  toggleBookmark,
  markResponseHelpful,
  releaseTip,
  getTrendingTags,
  getStats,
  searchUsers,
  getBookmarkedPosts,
  uploadMiddleware
} from '../controllers/nairaplug.controller';
import { authenticate } from '../middleware/auth';
import { optionalAuth } from '../middleware/optionalAuth';

const router = Router();

// Public routes (with optional auth for personalization)
router.get('/posts', optionalAuth, getPosts);
router.get('/posts/:id', optionalAuth, getPost);
router.get('/trending-tags', getTrendingTags);
router.get('/stats', getStats);

// Protected routes (require authentication)
router.post('/posts', authenticate, uploadMiddleware, createPost);
router.put('/posts/:id', authenticate, updatePost);
router.post('/posts/:id/responses', authenticate, createResponse);
router.post('/posts/:id/like', authenticate, togglePostLike);
router.post('/responses/:id/like', authenticate, toggleResponseLike);
router.post('/posts/:id/bookmark', authenticate, toggleBookmark);
router.post('/responses/:id/helpful', authenticate, markResponseHelpful);
router.post('/posts/:postId/responses/:responseId/release-tip', authenticate, releaseTip);
router.get('/users/search', authenticate, searchUsers);
router.get('/bookmarks', authenticate, getBookmarkedPosts);

export default router;