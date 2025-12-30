import { PrismaClient, AdminRole, AdminStatus, InvitationStatus, Permission } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export class AdminService {
  // OAuth login for admins
  async loginWithGoogle(token: string, ipAddress: string, userAgent?: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new Error('Invalid Google token');
    }

    // Check if admin exists
    let admin = await prisma.admin.findUnique({
      where: { email: payload.email },
      include: { permissions: true }
    });

    // Auto-create super admin if it's the designated email
    if (!admin && payload.email === 'fussion.integration@gmail.com') {
      admin = await prisma.admin.create({
        data: {
          email: payload.email,
          firstName: payload.given_name || 'Super',
          lastName: payload.family_name || 'Admin',
          role: AdminRole.SUPER_ADMIN,
          status: AdminStatus.ACTIVE,
          activatedAt: new Date()
        },
        include: { permissions: true }
      });

      // Grant all permissions to super admin
      const allPermissions = Object.values(Permission);
      await prisma.adminPermission.createMany({
        data: allPermissions.map(permission => ({
          adminId: admin!.id,
          permission,
          grantedBy: admin!.id // Self-granted
        }))
      });

      // Reload admin with permissions
      admin = await prisma.admin.findUnique({
        where: { id: admin.id },
        include: { permissions: true }
      });
    }

    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw new Error('Admin not found or inactive');
    }

    // Super admin restriction for other emails
    if (admin.role === AdminRole.SUPER_ADMIN && payload.email !== 'fussion.integration@gmail.com') {
      throw new Error('Unauthorized super admin access');
    }

    // Create session
    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.adminSession.create({
      data: {
        adminId: admin.id,
        token: sessionToken,
        ipAddress,
        userAgent,
        expiresAt
      }
    });

    // Log login
    await prisma.adminLoginHistory.create({
      data: {
        adminId: admin.id,
        ipAddress,
        userAgent,
        status: 'SUCCESS'
      }
    });

    // Update last login
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        permissions: admin.permissions.map(p => p.permission)
      },
      token: sessionToken,
      expiresAt
    };
  }

  // Logout admin
  async logout(token: string) {
    await prisma.adminSession.updateMany({
      where: { token },
      data: { isActive: false }
    });
  }

  // Verify token for authentication
  async verifyToken(token: string) {
    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: {
        admin: {
          include: { permissions: true }
        }
      }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    // Update last active
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() }
    });

    return session.admin;
  }

  // Invite admin
  async inviteAdmin(email: string, role: AdminRole, invitedBy: string) {
    // Check if inviter has permission
    const inviter = await this.getAdminWithPermissions(invitedBy);
    if (!this.hasPermission(inviter, Permission.MANAGE_ADMINS)) {
      throw new Error('Insufficient permissions');
    }

    // Check if admin already exists
    const existingAdmin = await prisma.admin.findUnique({ where: { email } });
    if (existingAdmin) {
      throw new Error('Admin already exists');
    }

    // Check existing invitation
    const existingInvitation = await prisma.adminInvitation.findUnique({ where: { email } });
    if (existingInvitation && existingInvitation.status === InvitationStatus.PENDING) {
      throw new Error('Invitation already sent');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Update existing invitation or create new one
    if (existingInvitation) {
      return await prisma.adminInvitation.update({
        where: { id: existingInvitation.id },
        data: {
          role,
          invitedBy,
          token,
          expiresAt,
          status: InvitationStatus.PENDING
        }
      });
    }

    return await prisma.adminInvitation.create({
      data: {
        email,
        role,
        invitedBy,
        token,
        expiresAt
      }
    });
  }

  // Validate invitation token
  async validateInvitationToken(token: string) {
    const invitation = await prisma.adminInvitation.findUnique({
      where: { token },
      include: { inviter: true }
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new Error('Invalid or expired invitation');
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.adminInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED }
      });
      throw new Error('Invitation expired');
    }

    return invitation;
  }

  // Accept invitation
  async acceptInvitation(token: string, firstName: string, lastName: string) {
    const invitation = await prisma.adminInvitation.findUnique({
      where: { token },
      include: { inviter: true }
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new Error('Invalid or expired invitation');
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.adminInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED }
      });
      throw new Error('Invitation expired');
    }

    // Create admin
    const admin = await prisma.admin.create({
      data: {
        email: invitation.email,
        firstName,
        lastName,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
        activatedAt: new Date()
      }
    });

    // Grant default permissions based on role
    const permissions = this.getDefaultPermissions(invitation.role);
    await prisma.adminPermission.createMany({
      data: permissions.map(permission => ({
        adminId: admin.id,
        permission,
        grantedBy: invitation.invitedBy
      }))
    });

    // Update invitation status
    await prisma.adminInvitation.update({
      where: { id: invitation.id },
      data: { 
        status: InvitationStatus.ACCEPTED,
        acceptedAt: new Date()
      }
    });

    return admin;
  }

  // Validate session
  async validateSession(token: string) {
    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: {
        admin: {
          include: { permissions: true }
        }
      }
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return null;
    }

    // Update last active
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() }
    });

    return {
      admin: session.admin,
      permissions: session.admin.permissions.map(p => p.permission)
    };
  }

  // Get all admins (Super Admin only)
  async getAdmins(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const { page = 1, limit = 20, search, status } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    const [admins, total] = await Promise.all([
      prisma.admin.findMany({
        where,
        skip,
        take: limit,
        include: { permissions: true },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.admin.count({ where })
    ]);

    return {
      admins: admins.map(admin => ({
        ...admin,
        permissions: admin.permissions.map(p => p.permission)
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get pending invitations
  async getInvitations() {
    return await prisma.adminInvitation.findMany({
      where: { status: InvitationStatus.PENDING },
      orderBy: { createdAt: 'desc' }
    });
  }

  // Update admin permissions
  async updateAdminPermissions(adminId: string, permissions: string[], updatedBy: string) {
    const admin = await this.getAdminWithPermissions(updatedBy);
    if (!this.hasPermission(admin, Permission.MANAGE_ADMINS)) {
      throw new Error('Insufficient permissions');
    }

    // Remove existing permissions
    await prisma.adminPermission.deleteMany({
      where: { adminId }
    });

    // Add new permissions
    if (permissions.length > 0) {
      await prisma.adminPermission.createMany({
        data: permissions.map(permission => ({
          adminId,
          permission: permission as Permission,
          grantedBy: updatedBy
        }))
      });
    }

    await this.logAdminAction(updatedBy, 'UPDATE_PERMISSIONS', 'Admin', adminId, { permissions });
    
    return await this.getAdminWithPermissions(adminId);
  }

  generateSessionToken(): string {
    return jwt.sign(
      { type: 'admin_session', timestamp: Date.now() },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );
  }

  private async getAdminWithPermissions(adminId: string) {
    return await prisma.admin.findUnique({
      where: { id: adminId },
      include: { permissions: true }
    });
  }

  private hasPermission(admin: any, permission: Permission): boolean {
    if (admin.role === AdminRole.SUPER_ADMIN) return true;
    return admin.permissions.some((p: any) => p.permission === permission);
  }

  // Revoke invitation
  async revokeInvitation(invitationId: string, adminId: string) {
    const admin = await this.getAdminWithPermissions(adminId);
    if (!this.hasPermission(admin, Permission.MANAGE_ADMINS)) {
      throw new Error('Insufficient permissions');
    }

    return await prisma.adminInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED }
    });
  }

  // Suspend admin
  async suspendAdmin(adminId: string, reason: string, suspendedBy: string) {
    const admin = await this.getAdminWithPermissions(suspendedBy);
    if (!this.hasPermission(admin, Permission.MANAGE_ADMINS)) {
      throw new Error('Insufficient permissions');
    }

    const targetAdmin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!targetAdmin) {
      throw new Error('Admin not found');
    }

    if (targetAdmin.role === AdminRole.SUPER_ADMIN) {
      throw new Error('Cannot suspend super admin');
    }

    const updatedAdmin = await prisma.admin.update({
      where: { id: adminId },
      data: {
        status: AdminStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedBy,
        suspensionReason: reason
      },
      include: { permissions: true }
    });

    // Deactivate all sessions
    await prisma.adminSession.updateMany({
      where: { adminId },
      data: { isActive: false }
    });

    await this.logAdminAction(suspendedBy, 'SUSPEND_ADMIN', 'Admin', adminId, { reason });
    
    return updatedAdmin;
  }

  // Activate admin
  async activateAdmin(adminId: string, activatedBy: string) {
    const admin = await this.getAdminWithPermissions(activatedBy);
    if (!this.hasPermission(admin, Permission.MANAGE_ADMINS)) {
      throw new Error('Insufficient permissions');
    }

    const updatedAdmin = await prisma.admin.update({
      where: { id: adminId },
      data: {
        status: AdminStatus.ACTIVE,
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null
      },
      include: { permissions: true }
    });

    await this.logAdminAction(activatedBy, 'ACTIVATE_ADMIN', 'Admin', adminId, {});
    
    return updatedAdmin;
  }

  // Export admins
  async exportAdmins(filters: any, format: string) {
    const where: any = {};
    
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status.toUpperCase();
    }
    
    if (filters.role && filters.role !== 'all') {
      where.role = filters.role.toUpperCase();
    }
    
    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    const admins = await prisma.admin.findMany({
      where,
      include: { permissions: true },
      orderBy: { createdAt: 'desc' }
    });

    const exportData = admins.map(admin => ({
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      status: admin.status,
      permissions: admin.permissions.map(p => p.permission).join(', '),
      lastLoginAt: admin.lastLoginAt?.toISOString() || 'Never',
      createdAt: admin.createdAt.toISOString(),
      suspendedAt: admin.suspendedAt?.toISOString() || '',
      suspensionReason: admin.suspensionReason || ''
    }));

    if (format === 'csv') {
      const headers = ['ID', 'Email', 'First Name', 'Last Name', 'Role', 'Status', 'Permissions', 'Last Login', 'Created At', 'Suspended At', 'Suspension Reason'];
      const csvRows = [headers.join(',')];
      
      exportData.forEach(admin => {
        const row = [
          admin.id,
          admin.email,
          admin.firstName,
          admin.lastName,
          admin.role,
          admin.status,
          `"${admin.permissions}"`,
          admin.lastLoginAt,
          admin.createdAt,
          admin.suspendedAt,
          `"${admin.suspensionReason}"`
        ];
        csvRows.push(row.join(','));
      });
      
      return csvRows.join('\n');
    }
    
    return JSON.stringify(exportData, null, 2);
  }

  // Get admin stats
  async getAdminStats() {
    const [totalAdmins, activeAdmins, suspendedAdmins, superAdmins, pendingInvitations] = await Promise.all([
      prisma.admin.count(),
      prisma.admin.count({ where: { status: AdminStatus.ACTIVE } }),
      prisma.admin.count({ where: { status: AdminStatus.SUSPENDED } }),
      prisma.admin.count({ where: { role: AdminRole.SUPER_ADMIN } }),
      prisma.adminInvitation.count({ where: { status: InvitationStatus.PENDING } })
    ]);

    const recentLogins = await prisma.adminLoginHistory.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        },
        status: 'SUCCESS'
      }
    });

    return {
      totalAdmins,
      activeAdmins,
      suspendedAdmins,
      superAdmins,
      pendingInvitations,
      recentLogins
    };
  }

  // Send invitation email
  async sendInvitationEmail(email: string, role: string, invitedBy: string) {
    try {
      // Get the actual invitation token from the database
      const invitation = await prisma.adminInvitation.findUnique({
        where: { email }
      });
      
      if (!invitation) {
        throw new Error('Invitation not found');
      }
      
      const { emailService } = await import('@/services/email.service');
      
      const inviteUrl = `${process.env.ADMIN_FRONTEND_URL || 'http://localhost:3001'}/auth/accept-invitation?token=${invitation.token}`;
      
      await emailService.sendAdminInvitation({
        to: email,
        role,
        invitedBy,
        inviteUrl
      });
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      // Don't throw error - invitation was created successfully
    }
  }

  private async logAdminAction(adminId: string, action: string, resource: string, resourceId: string, metadata?: any) {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        resource,
        resourceId,
        metadata: metadata || {},
        ipAddress: 'system',
        performedBy: adminId
      }
    });
  }

  private getDefaultPermissions(role: AdminRole): Permission[] {
    if (role === AdminRole.SUPER_ADMIN) {
      return Object.values(Permission);
    }

    return [
      Permission.VIEW_USERS,
      Permission.VIEW_JOBS,
      Permission.VIEW_PROJECTS,
      Permission.VIEW_TRANSACTIONS,
      Permission.VIEW_ANALYTICS
    ];
  }
}