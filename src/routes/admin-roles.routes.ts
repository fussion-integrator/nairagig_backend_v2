import { Router } from 'express';
import { AdminRoleController } from '../controllers/adminRole.controller';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth';

const router = Router();
const adminRoleController = new AdminRoleController();

// All routes require admin authentication
router.use(authenticateAdmin);

// Get all roles
router.get('/', adminRoleController.getRoles.bind(adminRoleController));

// Get available permissions
router.get('/permissions', adminRoleController.getPermissions.bind(adminRoleController));

// Create new role (Super Admin only)
router.post('/', requirePermission('SUPER_ADMIN'), adminRoleController.createRole.bind(adminRoleController));

// Update role (Super Admin only)
router.put('/:roleId', requirePermission('SUPER_ADMIN'), adminRoleController.updateRole.bind(adminRoleController));

// Delete role (Super Admin only)
router.delete('/:roleId', requirePermission('SUPER_ADMIN'), adminRoleController.deleteRole.bind(adminRoleController));

export default router;