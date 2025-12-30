import { Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { AdminRole, PrismaClient } from '@prisma/client';

const adminService = new AdminService();
const prisma = new PrismaClient();

export class AdminController {
  // Verify authentication (for httpOnly cookies)
  async verifyAuth(req: Request, res: Response) {
    try {
      const accessToken = req.cookies.admin_access_token;
      const refreshToken = req.cookies.admin_refresh_token;
      
      console.log('Admin verify auth:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        cookies: Object.keys(req.cookies),
        accessToken: accessToken ? accessToken.substring(0, 20) + '...' : 'none',
        refreshToken: refreshToken ? refreshToken.substring(0, 20) + '...' : 'none'
      });
      
      const token = accessToken || refreshToken;
      
      if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
      }

      const session = await adminService.validateSession(token);
      
      if (!session) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
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
          createdAt: session.admin.createdAt
        }
      });
    } catch (error: any) {
      console.error('Admin verify auth error:', error);
      res.status(401).json({ success: false, error: error.message });
    }
  }

  // OAuth login
  async login(req: Request, res: Response) {
    try {
      const { token } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent');

      if (!token) {
        return res.status(400).json({ error: 'Google token required' });
      }

      const result = await adminService.loginWithGoogle(token, ipAddress, userAgent);

      // Set both access and refresh tokens as httpOnly cookies
      res.cookie('admin_access_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: result.expiresAt
      });
      
      res.cookie('admin_refresh_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: result.expiresAt
      });

      res.json({
        success: true,
        admin: result.admin,
        expiresAt: result.expiresAt
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  // Logout
  async logout(req: Request, res: Response) {
    try {
      const accessToken = req.cookies.admin_access_token;
      const refreshToken = req.cookies.admin_refresh_token;
      const token = accessToken || refreshToken;
      
      if (token) {
        await adminService.logout(token);
      }

      res.clearCookie('admin_access_token');
      res.clearCookie('admin_refresh_token');
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get dashboard stats
  async getDashboardStats(req: Request, res: Response) {
    try {
      // Get basic stats from database
      const [userCount, jobCount, challengeCount, categoryCount] = await Promise.all([
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.job.count({ where: { status: 'OPEN' } }),
        prisma.challenge.count({ where: { status: 'ACTIVE' } }),
        prisma.category.count()
      ]);

      const stats = {
        totalUsers: userCount,
        activeGigs: jobCount,
        activeChallenges: challengeCount,
        totalCategories: categoryCount,
        totalRevenue: 125000, // Mock data
        openDisputes: 3, // Mock data
        openJobs: jobCount
      };

      const recentActivity = [
        { action: 'User registered', metadata: { user: 'Recent User' }, timestamp: new Date().toISOString() },
        { action: 'Job posted', metadata: { title: 'New Job' }, timestamp: new Date().toISOString() },
        { action: 'Challenge created', metadata: { title: 'New Challenge' }, timestamp: new Date().toISOString() }
      ];

      res.json({
        success: true,
        data: { stats, recentActivity }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get current admin (supports both Bearer token and cookie auth)
  async me(req: Request, res: Response) {
    try {
      // Check for token in both Authorization header and cookies
      const authHeader = req.headers.authorization;
      const accessToken = req.cookies.admin_access_token;
      const refreshToken = req.cookies.admin_refresh_token;
      
      let token: string | null = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove 'Bearer ' prefix
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
          createdAt: session.admin.createdAt
        }
      });
    } catch (error: any) {
      console.error('Admin me error:', error);
      res.status(401).json({ error: error.message });
    }
  }

  // Refresh admin tokens
  async refreshTokens(req: Request, res: Response) {
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

      // For simplicity, we'll use the same token (in production, generate new tokens)
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
          createdAt: session.admin.createdAt
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

  // Invite admin (Super Admin only)
  async inviteAdmin(req: Request, res: Response) {
    try {
      const { email, role } = req.body;
      const invitedBy = (req as any).admin.id;

      if (!email || !role) {
        return res.status(400).json({ error: 'Email and role required' });
      }

      if (!Object.values(AdminRole).includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const invitation = await adminService.inviteAdmin(email, role, invitedBy);

      res.json({
        success: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Validate invitation token
  async validateInvitationToken(req: Request, res: Response) {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: 'Token required' });
      }

      const invitation = await adminService.validateInvitationToken(token);

      res.json({
        success: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Accept invitation
  async acceptInvitation(req: Request, res: Response) {
    try {
      const { token, firstName, lastName } = req.body;

      if (!token || !firstName || !lastName) {
        return res.status(400).json({ error: 'Token, firstName, and lastName required' });
      }

      const admin = await adminService.acceptInvitation(token, firstName, lastName);

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
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Get all admins (Super Admin only)
  async getAdmins(req: Request, res: Response) {
    try {
      const { page, limit, search, status } = req.query;
      
      console.log('getAdmins called with params:', { page, limit, search, status });
      
      const result = await adminService.getAdmins({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        search: search as string,
        status: status as string
      });

      console.log('getAdmins result:', JSON.stringify(result, null, 2));
      res.json(result);
    } catch (error: any) {
      console.error('getAdmins error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get pending invitations
  async getInvitations(req: Request, res: Response) {
    try {
      const invitations = await adminService.getInvitations();
      res.json({ invitations });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Google OAuth callback
  async googleCallback(req: Request, res: Response) {
    try {
      console.log('🔗 Google OAuth callback triggered');
      console.log('👤 User from OAuth:', req.user);
      
      const user = req.user as any;
      if (!user) {
        console.log('❌ No user from OAuth, redirecting to login');
        return res.redirect('http://localhost:3001/login?error=oauth_failed');
      }

      console.log('Admin OAuth login:', user.email);

      // Check if this user is an admin
      let admin = await prisma.admin.findUnique({
        where: { email: user.email },
        include: { permissions: true }
      });

      // Auto-create super admin if it's the designated email
      if (!admin && user.email === 'fussion.integration@gmail.com') {
        console.log('🔄 Creating super admin for:', user.email);
        admin = await prisma.admin.create({
          data: {
            email: user.email,
            firstName: user.firstName || 'Super',
            lastName: user.lastName || 'Admin',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            activatedAt: new Date()
          },
          include: { permissions: true }
        });
      }

      if (!admin || admin.status !== 'ACTIVE') {
        console.log('❌ Admin not found or inactive:', { found: !!admin, status: admin?.status });
        return res.redirect('http://localhost:3001/login?error=unauthorized');
      }

      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent');

      // Create admin session
      const sessionToken = adminService.generateSessionToken();
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

      // Update last login
      await prisma.admin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() }
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

      // Don't set cookies on backend domain - let frontend handle it
      // Redirect to frontend callback with tokens
      const adminData = encodeURIComponent(JSON.stringify({
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      }));
      
      const tokens = encodeURIComponent(JSON.stringify({
        accessToken: sessionToken,
        refreshToken: sessionToken // Using same token for simplicity
      }));

      const redirectUrl = `http://localhost:3001/auth/callback?success=true&admin=${adminData}&tokens=${tokens}`;
      console.log('🚀 Redirecting to:', redirectUrl.substring(0, 100) + '...');
      
      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      res.redirect('http://localhost:3001/login?error=oauth_failed');
    }
  }

  // Update admin permissions
  async updatePermissions(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      const { permissions } = req.body;
      const updatedBy = (req as any).admin.id;

      const updatedAdmin = await adminService.updateAdminPermissions(adminId, permissions, updatedBy);
      res.json({ success: true, admin: updatedAdmin });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Suspend admin
  async suspendAdmin(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      const { reason } = req.body;
      const suspendedBy = (req as any).admin.id;

      const admin = await adminService.suspendAdmin(adminId, reason, suspendedBy);
      res.json({ success: true, admin });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Activate admin
  async activateAdmin(req: Request, res: Response) {
    try {
      const { adminId } = req.params;
      const activatedBy = (req as any).admin.id;

      const admin = await adminService.activateAdmin(adminId, activatedBy);
      res.json({ success: true, admin });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Revoke invitation
  async revokeInvitation(req: Request, res: Response) {
    try {
      const { invitationId } = req.params;
      const revokedBy = (req as any).admin.id;

      const invitation = await adminService.revokeInvitation(invitationId, revokedBy);
      res.json({ success: true, invitation });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Export admins
  async exportAdmins(req: Request, res: Response) {
    try {
      const { format = 'csv', filters } = req.query;
      const parsedFilters = filters ? JSON.parse(filters as string) : {};
      
      const data = await adminService.exportAdmins(parsedFilters, format as string);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=admins.csv');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=admins.json');
      }
      
      res.send(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get admin stats
  async getAdminStats(req: Request, res: Response) {
    try {
      const stats = await adminService.getAdminStats();
      res.json({ success: true, stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Send invitation email
  async sendInvitationEmail(req: Request, res: Response) {
    try {
      const { email, role, invitedBy } = req.body;
      
      await adminService.sendInvitationEmail(email, role, invitedBy);
      res.json({ success: true, message: 'Invitation email sent successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}