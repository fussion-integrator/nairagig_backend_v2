import { Router } from 'express';
import { ProjectController } from '@/controllers/project.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const projectController = new ProjectController();

// Protected routes
router.use(authenticate);

router.get('/', projectController.getProjects.bind(projectController));
router.get('/:id', projectController.getProject.bind(projectController));
router.post('/', authorize('CLIENT'), projectController.createProject.bind(projectController));
router.put('/:id', projectController.updateProject.bind(projectController));
router.delete('/:id', projectController.deleteProject.bind(projectController));

// Milestone routes
router.get('/:id/milestones', projectController.getMilestones.bind(projectController));
router.post('/:id/milestones', projectController.createMilestone.bind(projectController));
router.put('/:id/milestones/:milestoneId', projectController.updateMilestone.bind(projectController));

// Progress update route
router.put('/:id/progress', projectController.updateProgress.bind(projectController));
router.get('/:id/progress-history', projectController.getProgressHistory.bind(projectController));
router.put('/:id/progress/:updateId/confirm', projectController.confirmProgressUpdate.bind(projectController));
router.put('/:id/progress/:updateId/request-changes', projectController.requestProgressChanges.bind(projectController));

export { router as projectRoutes };