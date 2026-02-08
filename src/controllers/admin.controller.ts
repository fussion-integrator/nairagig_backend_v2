import { Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { PrismaClient, AdminRoleType } from '@prisma/client';

const adminService = new AdminService();
const prisma = new PrismaClient();

export class AdminController {
  // Google OAuth callback for admin authentication
  async googleCallback(req: Request, res: Response) {
    try {
      const user = req.user as any;
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=oauth_failed`);
      }

      console.log('OAuth user data:', user);

      // Check if user is admin in the admin table
      let admin = await prisma.admin.findUnique({
        where: { email: user.email }
      });

      console.log('Existing admin found:', admin);

      // Auto-create super admin for designated email
      if (!admin && user.email === 'fussion.integration@gmail.com') {
        console.log('Creating new super admin for:', user.email);
        
        admin = await prisma.admin.create({
          data: {
            email: user.email,
            firstName: user.firstName || user.given_name || 'Super',
            lastName: user.lastName || user.family_name || 'Admin',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            activatedAt: new Date()
          }
        });

        console.log('Admin created successfully:', admin);
      }

      if (!admin || admin.status !== 'ACTIVE') {
        console.log('Admin not found or inactive:', { admin: admin?.email, status: admin?.status });
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=unauthorized`);
      }

      // Create admin session
      const token = adminService.generateSessionToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Clean up existing sessions
      await prisma.adminSession.updateMany({
        where: { adminId: admin.id },
        data: { isActive: false }
      });

      // Create new session
      await prisma.adminSession.create({
        data: {
          adminId: admin.id,
          token,
          ipAddress: req.ip || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          expiresAt
        }
      });

      // Update last login
      await prisma.admin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() }
      });

      console.log('Admin OAuth login successful:', admin.email);

      // Redirect to admin callback with tokens
      const adminData = encodeURIComponent(JSON.stringify({
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      }));
      
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/callback?accessToken=${token}&refreshToken=${token}&admin=${adminData}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Admin OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=oauth_failed`);
    }
  }

  // Get current admin info
  async me(req: Request, res: Response) {
    try {
      // Check for token in both Authorization header and cookies
      const authHeader = req.headers.authorization;
      const accessToken = req.cookies?.admin_access_token;
      const refreshToken = req.cookies?.admin_refresh_token;
      
      let token: string | null = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (accessToken) {
        token = accessToken;
      } else if (refreshToken) {
        token = refreshToken;
      }
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const session = await adminService.validateSession(token);
      
      if (!session) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      res.json({
        admin: {
          id: session.admin.id,
          email: session.admin.email,
          firstName: session.admin.firstName,
          lastName: session.admin.lastName,
          role: session.admin.role,
          status: session.admin.status,
          lastLoginAt: session.admin.lastLoginAt,
          createdAt: (session.admin as any).createdAt
        }
      });
    } catch (error: any) {
      console.error('Admin me error:', error);
      res.status(401).json({ error: error.message });
    }
  }

  // Refresh admin tokens
  async refresh(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No refresh token provided' });
      }

      const refreshToken = authHeader.substring(7);
      const session = await adminService.validateSession(refreshToken);
      
      if (!session) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      res.json({
        success: true,
        admin: {
          id: session.admin.id,
          email: session.admin.email,
          firstName: session.admin.firstName,
          lastName: session.admin.lastName,
          role: session.admin.role,
          status: session.admin.status,
          lastLoginAt: session.admin.lastLoginAt,
          createdAt: (session.admin as any).createdAt
        },
        tokens: {
          accessToken: refreshToken,
          refreshToken: refreshToken
        }
      });
    } catch (error: any) {
      console.error('Admin refresh tokens error:', error);
      res.status(401).json({ error: error.message });
    }
  }

  // Get dashboard stats
  async getStats(req: Request, res: Response) {
    try {
      const [userCount, jobCount, challengeCount] = await Promise.all([
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.job.count({ where: { status: 'OPEN' } }),
        prisma.challenge.count({ where: { status: 'ACTIVE' } })
      ]);

      res.json({
        success: true,
        data: {
          totalUsers: userCount,
          activeGigs: jobCount,
          activeChallenges: challengeCount,
          totalRevenue: 125000,
          openDisputes: 3
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get system health
  async getSystemHealth(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Placeholder methods for admin management (implement as needed)
  async inviteAdmin(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }

  async getAdmins(req: Request, res: Response) {
    try {
      // First, let's check if any admins exist at all
      const allAdmins = await prisma.admin.findMany();
      console.log('🔍 All admins in database:', allAdmins);
      
      const { page = 1, limit = 25, search, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = {};
      if (search) {
        where.OR = [
          { email: { contains: search as string, mode: 'insensitive' } },
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName: { contains: search as string, mode: 'insensitive' } }
        ];
      }
      if (status) where.status = status;
      
      console.log('🔍 Admin query where clause:', where);
      
      const [admins, total] = await Promise.all([
        prisma.admin.findMany({
          where,
          skip,
          take: Number(limit),
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            createdAt: true,
            lastLoginAt: true,
            activatedAt: true
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.admin.count({ where })
      ]);
      
      console.log('📊 Admin query results:', { adminsCount: admins.length, total });
      
      res.json({
        success: true,
        data: admins,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      console.error('❌ Admin query error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getInvitations(req: Request, res: Response) {
    try {
      const invitations = await prisma.adminInvitation.findMany({
        where: { status: { in: ['PENDING', 'EXPIRED'] } },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          invitedBy: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json({ success: true, data: invitations });
    } catch (error: any) {
      // Return empty array if table doesn't exist
      res.json({ success: true, data: [] });
    }
  }

  async updatePermissions(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }

  async suspendAdmin(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }

  async activateAdmin(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }

  async revokeInvitation(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }

  async exportAdmins(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }

  async getAdminStats(req: Request, res: Response) {
    try {
      console.log('🔍 Starting admin stats query...');
      
      // Check all tables individually
      const allAdmins = await prisma.admin.findMany();
      console.log('📊 All admins found:', allAdmins.length, allAdmins);
      
      const [totalAdmins, activeAdmins, pendingInvitations, recentLogins] = await Promise.allSettled([
        prisma.admin.count(),
        prisma.admin.count({ where: { status: 'ACTIVE' } }),
        prisma.adminInvitation.count({ where: { status: 'PENDING' } }),
        prisma.adminLoginHistory.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);
      
      console.log('📈 Stats results:', {
        totalAdmins: totalAdmins.status === 'fulfilled' ? totalAdmins.value : totalAdmins.reason,
        activeAdmins: activeAdmins.status === 'fulfilled' ? activeAdmins.value : activeAdmins.reason,
        pendingInvitations: pendingInvitations.status === 'fulfilled' ? pendingInvitations.value : pendingInvitations.reason,
        recentLogins: recentLogins.status === 'fulfilled' ? recentLogins.value : recentLogins.reason
      });
      
      res.json({
        success: true,
        data: {
          totalAdmins: totalAdmins.status === 'fulfilled' ? totalAdmins.value : 0,
          activeAdmins: activeAdmins.status === 'fulfilled' ? activeAdmins.value : 0,
          pendingInvitations: pendingInvitations.status === 'fulfilled' ? pendingInvitations.value : 0,
          recentLogins: recentLogins.status === 'fulfilled' ? recentLogins.value : 0
        }
      });
    } catch (error: any) {
      console.error('❌ Admin stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async sendInvitationEmail(req: Request, res: Response) {
    res.status(501).json({ error: 'Not implemented yet' });
  }
}