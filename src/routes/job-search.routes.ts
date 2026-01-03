import { Router } from 'express';
import { JobSearchController } from '../controllers/job-search.controller';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation.middleware';
import { query, body } from 'express-validator';

const router = Router();
const jobSearchController = new JobSearchController();

// Search jobs - public endpoint with optional auth for personalization
router.get('/search', async (req, res, next) => {
  // Try to authenticate but don't require it
  try {
    await authenticate(req, res, () => {});
  } catch (error) {
    // Ignore auth errors for public endpoint
  }
  jobSearchController.searchJobs(req, res);
});

// Get job details by ID - public endpoint
router.get('/jobs/:jobId', [
  validateRequest
], jobSearchController.getJobDetails.bind(jobSearchController));

// Track job application - requires authentication
router.post('/applications', [
  authenticate,
  body('jobId').notEmpty().isString().trim(),
  body('jobTitle').notEmpty().isString().trim(),
  body('company').notEmpty().isString().trim(),
  body('applicationUrl').optional().isURL(),
  body('source').notEmpty().isString().trim(),
  validateRequest
], jobSearchController.trackApplication.bind(jobSearchController));

// Save/unsave job - requires authentication
router.post('/save', [
  authenticate,
  body('jobId').notEmpty().isString().trim(),
  body('jobTitle').notEmpty().isString().trim(),
  body('company').notEmpty().isString().trim(),
  body('jobData').optional().isObject(),
  validateRequest
], jobSearchController.saveJob.bind(jobSearchController));

// Get user's job applications - requires authentication
router.get('/applications', [
  authenticate,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['applied', 'viewed', 'interview_scheduled', 'interview_completed', 'offer_received', 'accepted', 'rejected', 'withdrawn']),
  validateRequest
], jobSearchController.getUserApplications.bind(jobSearchController));

// Get user's saved jobs - requires authentication
router.get('/saved', [
  authenticate,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], jobSearchController.getSavedJobs.bind(jobSearchController));

export default router;