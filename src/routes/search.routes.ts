import { Router } from 'express';
import { SearchController } from '@/controllers/search.controller';
import { optionalAuth } from '@/middleware/optionalAuth';
import { authenticate } from '@/middleware/auth';

const router = Router();
const searchController = new SearchController();

// Global search - uses optional auth to provide different results based on auth status
router.get('/global', optionalAuth, searchController.globalSearch);

// Search suggestions - uses optional auth
router.get('/suggestions', optionalAuth, searchController.searchSuggestions);

// Recent searches - requires auth (user-specific)
router.get('/recent', authenticate, searchController.getRecentSearches);

// Popular searches - public
router.get('/popular', searchController.getPopularSearches);

// Track search clicks - uses optional auth
router.post('/click', optionalAuth, searchController.trackSearchClick);

export default router;