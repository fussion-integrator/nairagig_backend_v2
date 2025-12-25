import { Router } from 'express';
import { JobController } from '@/controllers/job.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const jobController = new JobController();

// Public routes
router.get('/', jobController.getJobs.bind(jobController));

// Protected routes
router.use(authenticate);

router.get('/my-jobs', jobController.getMyJobs.bind(jobController));
router.get('/:id', jobController.getJob.bind(jobController));
router.post('/', authorize('CLIENT', 'FREELANCER'), jobController.createJob.bind(jobController));
router.put('/:id', jobController.updateJob.bind(jobController));
router.delete('/:id', jobController.deleteJob.bind(jobController));
router.post('/:jobId/apply', authorize('FREELANCER'), jobController.applyToJob.bind(jobController));
router.get('/:id/applications', jobController.getJobApplications.bind(jobController));
router.put('/:jobId/applications/:applicationId', jobController.updateApplication.bind(jobController));
router.post('/:jobId/questions', jobController.askQuestion.bind(jobController));
router.get('/:jobId/questions', jobController.getJobQuestions.bind(jobController));
router.put('/questions/:questionId/answer', jobController.answerQuestion.bind(jobController));

export { router as jobRoutes };