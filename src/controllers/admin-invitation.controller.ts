import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

const prisma = new PrismaClient()

export const validateAdminInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params

    const invitation = await prisma.adminInvitation.findUnique({
      where: { token }
    })

    if (!invitation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invitation not found' 
      })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation is no longer valid' 
      })
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation has expired' 
      })
    }

    res.json({
      success: true,
      invitation: {
        email: invitation.email,
        role: { name: invitation.role },
        department: invitation.department,
        expiresAt: invitation.expiresAt
      }
    })
  } catch (error) {
    console.error('Validate invitation error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    })
  }
}

export const createAdminInvitation = async (req: Request, res: Response) => {
  try {
    const { email, roleId, department, restrictions, invitedBy } = req.body

    if (!email || !roleId) {
      return res.status(400).json({ error: 'Email and role are required' })
    }

    // Check if invitation already exists
    const existingInvitation = await prisma.adminInvitation.findUnique({
      where: { email }
    })

    if (existingInvitation && existingInvitation.status === 'PENDING') {
      return res.status(400).json({ error: 'Invitation already exists for this email' })
    }

    // Generate invitation token
    const token = uuidv4()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 3) // 3 days expiry

    // Create invitation
    const invitation = await prisma.adminInvitation.create({
      data: {
        email,
        roleId,
        department,
        restrictions: restrictions || {},
        invitedBy,
        token,
        expiresAt,
        status: 'PENDING'
      }
    })

    res.status(201).json({
      success: true,
      message: 'Admin invitation created successfully',
      data: invitation
    })
  } catch (error) {
    console.error('Create invitation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getAdminInvitations = async (req: Request, res: Response) => {
  try {
    const invitations = await prisma.$queryRaw`
      SELECT ai.*, ar.name as role_name, a.first_name as inviter_first_name, a.last_name as inviter_last_name
      FROM admin_invitations ai
      LEFT JOIN admin_roles ar ON ai.role_id = ar.id
      LEFT JOIN admins a ON ai.invited_by = a.id
      WHERE ai.status = 'PENDING' AND ai.expires_at > NOW()
      ORDER BY ai.created_at DESC
    `

    res.json({
      success: true,
      invitations
    })
  } catch (error) {
    console.error('Get invitations error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const revokeAdminInvitation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const invitation = await prisma.adminInvitation.update({
      where: { id },
      data: { status: 'REVOKED' }
    })

    res.json({
      success: true,
      message: 'Invitation revoked successfully',
      data: invitation
    })
  } catch (error) {
    console.error('Revoke invitation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const acceptAdminInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params
    const { adminData } = req.body

    if (!adminData?.firstName || !adminData?.lastName) {
      return res.status(400).json({ 
        success: false, 
        error: 'First name and last name are required' 
      })
    }

    // Find invitation
    const invitation = await prisma.adminInvitation.findUnique({
      where: { token },
      include: { inviter: true }
    })

    if (!invitation) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invitation not found' 
      })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation is no longer valid' 
      })
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invitation has expired' 
      })
    }

    // Create admin account
    const admin = await prisma.admin.create({
      data: {
        email: invitation.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        role: invitation.role,
        roleId: invitation.roleId,
        department: invitation.department,
        restrictions: invitation.restrictions,
        invitedBy: invitation.invitedBy,
        status: 'ACTIVE',
        activatedAt: new Date()
      }
    })

    // Update invitation status
    await prisma.adminInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date()
      }
    })

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      }
    })
  } catch (error) {
    console.error('Accept invitation error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    })
  }
}