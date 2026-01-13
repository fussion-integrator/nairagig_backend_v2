import { Router } from 'express';
import { AdminSystemChallengesController } from '../controllers/admin-system-challenges.controller';
import { authenticateAdmin } from '../middleware/adminAuth';
import { query, param } from 'express-validator';

const router = Router();
const controller = new AdminSystemChallengesController();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Validation middleware
const validateQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isLength({ max: 255 }).withMessage('Search query too long')
];

const validateId = [
  param('id').isUUID().withMessage('Invalid ID format')
];

// LinkedIn Ambassador Management
router.get('/linkedin/participants', validateQuery, controller.getLinkedInParticipants.bind(controller));
router.get('/linkedin/milestones/pending', validateQuery, controller.getPendingLinkedInMilestones.bind(controller));
router.post('/linkedin/milestones/:id/approve', validateId, controller.approveLinkedInMilestone.bind(controller));
router.post('/linkedin/milestones/:id/reject', validateId, controller.rejectLinkedInMilestone.bind(controller));
router.get('/linkedin/analytics', controller.getLinkedInAnalytics.bind(controller));

// Facebook Ambassador Management
router.get('/facebook/participants', validateQuery, controller.getFacebookParticipants.bind(controller));
router.get('/facebook/milestones/pending', validateQuery, controller.getPendingFacebookMilestones.bind(controller));
router.post('/facebook/milestones/:id/approve', validateId, controller.approveFacebookMilestone.bind(controller));
router.post('/facebook/milestones/:id/reject', validateId, controller.rejectFacebookMilestone.bind(controller));

// Twitter Ambassador Management
router.get('/twitter/participants', validateQuery, controller.getTwitterParticipants.bind(controller));
router.get('/twitter/milestones/pending', validateQuery, controller.getPendingTwitterMilestones.bind(controller));
router.post('/twitter/milestones/:id/approve', validateId, controller.approveTwitterMilestone.bind(controller));

// Content Creator Management
router.get('/content-creator/posts', validateQuery, controller.getContentCreatorPosts.bind(controller));
router.post('/content-creator/posts/:id/approve', validateId, controller.approveContentCreatorPost.bind(controller));
router.post('/content-creator/posts/:id/reject', validateId, controller.rejectContentCreatorPost.bind(controller));

// Referral Challenge Management
router.get('/referrals/stats', controller.getReferralStats.bind(controller));
router.get('/referrals/participants', validateQuery, controller.getReferralParticipants.bind(controller));

// Bulk Operations
router.post('/bulk-approve', controller.bulkApprove.bind(controller));

// System Challenge Submissions
router.get('/submissions', controller.getAllSystemChallengeSubmissions.bind(controller));

// System Challenge Configuration Management
router.get('/config/:challengeType', controller.getSystemChallengeConfig.bind(controller));
router.post('/config/:challengeType', controller.saveSystemChallengeConfig.bind(controller));

// Overall Analytics
router.get('/analytics/overview', controller.getSystemChallengesOverview.bind(controller));

export { router as adminSystemChallengesRoutes };