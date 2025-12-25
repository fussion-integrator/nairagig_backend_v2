import { Router } from 'express';
import { ProjectController } from '@/controllers/project.controller';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();
const projectController = new ProjectController();

// Public routes
router.get('/', projectController.getProjects.bind(projectController));
router.get('/:id', projectController.getProject.bind(projectController));

// Protected routes
router.use(authenticate);

router.post('/', authorize('CLIENT'), projectController.createProject.bind(projectController));
router.put('/:id', projectController.updateProject.bind(projectController));
router.delete('/:id', projectController.deleteProject.bind(projectController));

// Milestone routes
router.get('/:id/milestones', projectController.getMilestones.bind(projectController));
router.post('/:id/milestones', projectController.createMilestone.bind(projectController));
router.put('/:id/milestones/:milestoneId', projectController.updateMilestone.bind(projectController));

export { router as projectRoutes };