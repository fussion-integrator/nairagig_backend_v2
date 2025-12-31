import { Router } from 'express';
import { AdminJobController, adminJobRateLimit, validateJobQuery, validateJobStatusUpdate, validateBulkUpdate } from '@/controllers/admin-job.controller';
import { authenticateAdmin } from '@/middleware/adminAuth';
import { param } from 'express-validator';

const router = Router();
const adminJobController = new AdminJobController();

// Apply rate limiting to all admin job routes
router.use(adminJobRateLimit);

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Validation for job ID parameter
const validateJobId = [
  param('id').isUUID().withMessage('Invalid job ID format')
];

// Get all jobs with filters and pagination
router.get('/', 
  validateJobQuery,
  adminJobController.getJobs.bind(adminJobController)
);

// Get job statistics
router.get('/stats', 
  adminJobController.getJobStats.bind(adminJobController)
);

// Get specific job details
router.get('/:id', 
  validateJobId,
  adminJobController.getJobDetails.bind(adminJobController)
);

// Update job status (activate, deactivate, flag, unflag)
router.patch('/:id/status', 
  validateJobStatusUpdate,
  adminJobController.updateJobStatus.bind(adminJobController)
);

// Delete specific job
router.delete('/:id', 
  validateJobId,
  adminJobController.deleteJob.bind(adminJobController)
);

// Bulk operations
router.post('/bulk-update', 
  validateBulkUpdate,
  adminJobController.bulkUpdateJobs.bind(adminJobController)
);

// Export jobs
router.post('/export', 
  adminJobController.exportJobs.bind(adminJobController)
);

export { router as adminJobRoutes };