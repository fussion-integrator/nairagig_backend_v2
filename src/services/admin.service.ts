import { prisma } from '@/config/database';
import crypto from 'crypto';

export class AdminService {
  // Generate secure session token
  generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Validate admin session with enhanced security
  async validateSession(token: string) {
    try {
      if (!token || token.length < 32) {
        return null;
      }

      const session = await prisma.adminSession.findUnique({
        where: { 
          token,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              status: true,
              lastLoginAt: true
            }
          }
        }
      });

      if (!session) {
        console.log('Session validation failed - not found or expired:', {
          tokenPrefix: token.substring(0, 10)
        });
        return null;
      }

      // Check if admin is still active
      if (session.admin.status !== 'ACTIVE') {
        console.log('Session validation failed - admin inactive:', {
          adminEmail: session.admin.email,
          status: session.admin.status
        });
        
        // Deactivate session for inactive admin
        await this.deactivateSession(session.id);
        return null;
      }

      console.log('Session validated successfully:', {
        adminEmail: session.admin.email,
        sessionId: session.id
      });

      return session;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  // Update session activity timestamp
  async updateSessionActivity(sessionId: string) {
    try {
      await prisma.adminSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() }
      });
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
  }

  // Deactivate session
  async deactivateSession(sessionId: string) {
    try {
      await prisma.adminSession.update({
        where: { id: sessionId },
        data: { isActive: false }
      });
      
      console.log('Session deactivated:', { sessionId });
    } catch (error) {
      console.error('Failed to deactivate session:', error);
    }
  }

  // Check if admin has specific permission
  async hasPermission(adminId: string, permission: string): Promise<boolean> {
    try {
      // Get admin with role
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { role: true, status: true }
      });

      if (!admin || admin.status !== 'ACTIVE') {
        return false;
      }

      // Super admins have all permissions
      if (admin.role === 'SUPER_ADMIN') {
        return true;
      }

      // Check specific permission
      const adminPermission = await prisma.adminPermission.findUnique({
        where: {
          adminId_permission: {
            adminId,
            permission: permission as any
          }
        }
      });

      // Check if permission exists and is not expired
      if (adminPermission) {
        if (adminPermission.expiresAt && adminPermission.expiresAt < new Date()) {
          return false;
        }
        return true;
      }

      // Default job management permissions for regular admins
      const jobPermissions = [
        'VIEW_JOBS',
        'EDIT_JOBS',
        'DELETE_JOBS',
        'MODERATE_JOBS'
      ];

      return jobPermissions.includes(permission);
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }

  // Create admin session
  async createSession(adminId: string, ipAddress: string, userAgent?: string, deviceInfo?: string) {
    try {
      const token = this.generateSessionToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const session = await prisma.adminSession.create({
        data: {
          adminId,
          token,
          ipAddress,
          userAgent: userAgent?.substring(0, 500), // Limit length
          deviceInfo: deviceInfo?.substring(0, 500),
          expiresAt,
          isActive: true
        }
      });

      // Update admin last login
      await prisma.admin.update({
        where: { id: adminId },
        data: { lastLoginAt: new Date() }
      });

      // Log successful session creation
      await prisma.adminLoginHistory.create({
        data: {
          adminId,
          ipAddress,
          userAgent: userAgent?.substring(0, 500),
          deviceInfo: deviceInfo?.substring(0, 500),
          status: 'SUCCESS'
        }
      });

      console.log('Admin session created:', {
        adminId,
        sessionId: session.id,
        ipAddress,
        expiresAt
      });

      return session;
    } catch (error) {
      console.error('Failed to create admin session:', error);
      
      // Log failed session creation
      try {
        await prisma.adminLoginHistory.create({
          data: {
            adminId,
            ipAddress,
            userAgent: userAgent?.substring(0, 500),
            deviceInfo: deviceInfo?.substring(0, 500),
            status: 'FAILED'
          }
        });
      } catch (logError) {
        console.error('Failed to log failed session creation:', logError);
      }
      
      throw error;
    }
  }

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    try {
      const result = await prisma.adminSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { isActive: false }
          ]
        }
      });

      if (result.count > 0) {
        console.log(`Cleaned up ${result.count} expired admin sessions`);
      }

      return result.count;
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  // Get active sessions for admin
  async getActiveSessions(adminId: string) {
    try {
      return await prisma.adminSession.findMany({
        where: {
          adminId,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          deviceInfo: true,
          createdAt: true,
          lastActiveAt: true,
          expiresAt: true
        },
        orderBy: { lastActiveAt: 'desc' }
      });
    } catch (error) {
      console.error('Failed to get active sessions:', error);
      return [];
    }
  }

  // Revoke all sessions for admin (useful for security incidents)
  async revokeAllSessions(adminId: string, exceptSessionId?: string) {
    try {
      const where: any = { adminId, isActive: true };
      if (exceptSessionId) {
        where.id = { not: exceptSessionId };
      }

      const result = await prisma.adminSession.updateMany({
        where,
        data: { isActive: false }
      });

      console.log(`Revoked ${result.count} sessions for admin:`, { adminId });
      return result.count;
    } catch (error) {
      console.error('Failed to revoke sessions:', error);
      return 0;
    }
  }
}