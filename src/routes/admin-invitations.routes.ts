import { Router } from 'express'
import { 
  createAdminInvitation, 
  getAdminInvitations, 
  revokeAdminInvitation, 
  acceptAdminInvitation,
  validateAdminInvitation
} from '../controllers/admin-invitation.controller'
import { authenticateAdmin } from '../middleware/adminAuth'

const router = Router()

// Create invitation (Super Admin only)
router.post('/', authenticateAdmin, createAdminInvitation)

// Get all pending invitations
router.get('/', authenticateAdmin, getAdminInvitations)

// Validate invitation token (public)
router.get('/validate/:token', validateAdminInvitation)

// Accept invitation (public route with token)
router.post('/accept/:token', acceptAdminInvitation)

// Revoke invitation
router.delete('/:id', authenticateAdmin, revokeAdminInvitation)

export default router