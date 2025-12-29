import { Router } from 'express';
import { JobController } from '@/controllers/job.controller';
import { authenticate, authorize, optionalAuth } from '@/middleware/auth';

const router = Router();
const jobController = new JobController();

// Public routes (no auth required)
router.get('/public', jobController.getPublicJobs.bind(jobController));

// Routes with optional authentication
router.get('/', optionalAuth, jobController.getJobs.bind(jobController));

// Protected routes
router.use(authenticate);

router.get('/bookmarks', jobController.getBookmarkedJobs.bind(jobController));
router.post('/:id/bookmark', jobController.bookmarkJob.bind(jobController));
router.delete('/:id/bookmark', jobController.unbookmarkJob.bind(jobController));
router.get('/my-jobs', jobController.getMyJobs.bind(jobController));
router.get('/:id', jobController.getJob.bind(jobController));
router.post('/', authorize('CLIENT', 'FREELANCER'), jobController.createJob.bind(jobController));
router.put('/:id', jobController.updateJob.bind(jobController));
router.delete('/:id', jobController.deleteJob.bind(jobController));
router.post('/:id/apply', authorize('FREELANCER'), jobController.applyToJob.bind(jobController));
router.post('/award', jobController.awardJob.bind(jobController));
router.put('/:id/cancel', jobController.cancelJob.bind(jobController));
router.put('/:id/complete', jobController.completeJob.bind(jobController));
router.get('/:id/applications', jobController.getJobApplications.bind(jobController));
router.put('/:jobId/applications/:applicationId', jobController.updateApplication.bind(jobController));
router.post('/:jobId/questions', jobController.askQuestion.bind(jobController));
router.get('/:jobId/questions', jobController.getJobQuestions.bind(jobController));
router.put('/questions/:questionId/answer', jobController.answerQuestion.bind(jobController));

export { router as jobRoutes };