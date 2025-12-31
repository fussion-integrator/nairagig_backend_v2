import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { config } from '@/config/config';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { emailService } from '@/services/email.service';
import { AdminService } from '@/services/admin.service';

const adminService = new AdminService();

export class AuthController {
  async oauthCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as any;
      
      if (!user) {
        throw ApiError.unauthorized('Authentication failed');
      }

      const payload = { userId: user.id };
      const accessToken = (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
      const refreshToken = (jwt.sign as any)(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });

      // Check if this is the super admin email - auto-create if needed
      if (user.email === 'fussion.integration@gmail.com') {
        let admin = await prisma.admin.findUnique({
          where: { email: user.email },
          include: { permissions: true }
        });

        // Auto-create super admin if doesn't exist
        if (!admin) {
          admin = await prisma.admin.create({
            data: {
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: 'SUPER_ADMIN',
              status: 'ACTIVE',
              activatedAt: new Date()
            },
            include: { permissions: true }
          });

          // Grant all permissions to super admin
          const { Permission } = await import('@prisma/client');
          const allPermissions = Object.values(Permission);
          await prisma.adminPermission.createMany({
            data: allPermissions.map(permission => ({
              adminId: admin!.id,
              permission,
              grantedBy: admin!.id
            }))
          });

          // Reload admin with permissions
          admin = await prisma.admin.findUnique({
            where: { id: admin.id },
            include: { permissions: true }
          });
        }

        if (admin && admin.status === 'ACTIVE') {
          // This is an admin login - use admin login flow
          logger.info(`Admin OAuth login: ${admin.email}`);
          
          // Create admin session using AdminService
          const sessionToken = adminService.generateSessionToken();
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

          // Clean up any existing sessions for this admin first
          await prisma.adminSession.updateMany({
            where: { adminId: admin.id },
            data: { isActive: false }
          });

          await prisma.adminSession.create({
            data: {
              adminId: admin.id,
              token: sessionToken,
              ipAddress: req.ip || 'unknown',
              userAgent: req.headers['user-agent'],
              expiresAt
            }
          });
          
          // Update admin last login
          await prisma.admin.update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date() }
          });

          // Log admin login
          await prisma.adminLoginHistory.create({
            data: {
              adminId: admin.id,
              ipAddress: req.ip || 'unknown',
              userAgent: req.headers['user-agent'],
              status: 'SUCCESS'
            }
          });

          // Set cookies with proper domain settings for cross-port access
          res.cookie('admin_access_token', sessionToken, {
            httpOnly: false, // Allow JavaScript access for cross-port development
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : 'localhost',
            maxAge: 15 * 60 * 1000 // 15 minutes
          });

          res.cookie('admin_refresh_token', sessionToken, {
            httpOnly: false, // Allow JavaScript access for cross-port development
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : 'localhost',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
          });

          // Redirect to admin callback with tokens
          const adminData = encodeURIComponent(JSON.stringify({
            id: admin.id,
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role
          }));
          
          const tokens = encodeURIComponent(JSON.stringify({
            accessToken: sessionToken,
            refreshToken: sessionToken
          }));

          const adminCallbackUrl = `http://localhost:3001/auth/callback?success=true&admin=${adminData}&tokens=${tokens}`;
          return res.redirect(adminCallbackUrl);
        }
      }

      // Check if this is an existing admin (non-super admin)
      const admin = await prisma.admin.findUnique({
        where: { email: user.email },
        include: { permissions: true }
      });

      if (admin && admin.status === 'ACTIVE') {
        // This is an admin login - use admin login flow
        logger.info(`Admin OAuth login: ${admin.email}`);
        
        // Create admin session using AdminService
        const sessionToken = adminService.generateSessionToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Clean up any existing sessions for this admin first
        await prisma.adminSession.updateMany({
          where: { adminId: admin.id },
          data: { isActive: false }
        });

        await prisma.adminSession.create({
          data: {
            adminId: admin.id,
            token: sessionToken,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'],
            expiresAt
          }
        });
        
        // Update admin last login
        await prisma.admin.update({
          where: { id: admin.id },
          data: { lastLoginAt: new Date() }
        });

        // Log admin login
        await prisma.adminLoginHistory.create({
          data: {
            adminId: admin.id,
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'],
            status: 'SUCCESS'
          }
        });

        // Set cookies with proper domain settings for cross-port access
        res.cookie('admin_access_token', sessionToken, {
          httpOnly: false, // Allow JavaScript access for cross-port development
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : 'localhost',
          maxAge: 15 * 60 * 1000 // 15 minutes
        });

        res.cookie('admin_refresh_token', sessionToken, {
          httpOnly: false, // Allow JavaScript access for cross-port development
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : 'localhost',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Redirect to admin callback with tokens
        const adminData = encodeURIComponent(JSON.stringify({
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role
        }));
        
        const tokens = encodeURIComponent(JSON.stringify({
          accessToken: sessionToken,
          refreshToken: sessionToken
        }));

        const adminCallbackUrl = `http://localhost:3001/auth/callback?success=true&admin=${adminData}&tokens=${tokens}`;
        return res.redirect(adminCallbackUrl);
      }

      const isNewUser = user.createdAt && (new Date().getTime() - new Date(user.createdAt).getTime()) < 60000;
      
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Record login session and history
      const loginData = await this.recordLoginSession(req, user.id, 'SUCCESS');

      // Send welcome email for new users
      if (isNewUser) {
        await emailService.sendWelcomeEmail(
          user.firstName,
          user.lastName,
          user.email,
          user.authProvider || 'google',
          user.role
        );
      } else {
        // Check if 2FA is enabled
        if (user.twoFactorAuth) {
          // Generate and send 2FA code
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

          await prisma.twoFactorCode.create({
            data: {
              userId: user.id,
              code,
              expiresAt
            }
          });

          await emailService.sendTwoFactorCode(
            user.firstName,
            user.email,
            code,
            new Date().toLocaleString(),
            loginData?.location || 'Unknown',
            loginData?.deviceInfo || 'Unknown device'
          );

          // Return pending 2FA response
          const callbackUrl = `http://localhost:3001/auth/callback?success=false&requires2fa=true&email=${encodeURIComponent(user.email)}`;
          return res.redirect(callbackUrl);
        }

        // Send login alert for existing users on new device/location
        await this.checkAndSendLoginAlert(user, loginData);
      }

      logger.info(`OAuth login successful: ${user.email}`);

      const userData = encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }));
      
      const tokens = encodeURIComponent(JSON.stringify({
        accessToken,
        refreshToken
      }));

      const callbackUrl = `http://localhost:3001/auth/callback?success=true&user=${userData}&tokens=${tokens}`;
      res.redirect(callbackUrl);
    } catch (error) {
      next(error);
    }
  }

  async generateOAuthToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        throw ApiError.badRequest('Email is required');
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          profileImageUrl: true
        }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      const payload = { userId: user.id };
      const accessToken = (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
      const refreshToken = (jwt.sign as any)(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });

      res.json({
        success: true,
        data: {
          user,
          tokens: {
            accessToken,
            refreshToken
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyToken(req: Request, res: Response, next: NextFunction) {
    try {
      let token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        token = req.cookies?.access_token;
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          profileImageUrl: true
        }
      });

      if (!user || user.status !== 'ACTIVE') {
        return res.status(401).json({
          success: false,
          message: 'Invalid or inactive user'
        });
      }

      res.json({
        success: true,
        data: { user, valid: true }
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  }

  async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          skills: {
            select: {
              id: true,
              skillName: true,
              proficiencyLevel: true
            }
          },
          portfolios: {
            select: {
              id: true,
              title: true,
              description: true,
              liveUrl: true,
              repositoryUrl: true,
              tags: true
            }
          },
          socialProfiles: {
            select: {
              id: true,
              platform: true,
              profileUrl: true,
              username: true
            }
          }
        }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      let refreshToken = req.body.refreshToken;
      
      // Try to get refresh token from httpOnly cookie if not in body
      if (!refreshToken) {
        refreshToken = req.cookies?.refresh_token;
      }

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token required'
        });
      }

      const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret as string) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          profileImageUrl: true
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      const payload = { userId: user.id };
      const newAccessToken = (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
      const newRefreshToken = (jwt.sign as any)(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });

      // Set new tokens as httpOnly cookies
      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 // 15 minutes
      });

      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          user
        }
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
  }

  async setTokens(req: Request, res: Response, next: NextFunction) {
    try {
      const { accessToken, refreshToken, user } = req.body;

      if (!accessToken || !refreshToken || !user) {
        throw ApiError.badRequest('Missing required token data');
      }

      // Set httpOnly cookies
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 // 15 minutes
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ success: true, message: 'Tokens set successfully' });
    } catch (error) {
      next(error);
    }
  }

  async clearTokens(req: Request, res: Response, next: NextFunction) {
    try {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      res.json({ success: true, message: 'Tokens cleared successfully' });
    } catch (error) {
      next(error);
    }
  }

  private async recordLoginSession(req: Request, userId: string, status: 'SUCCESS' | 'FAILED') {
    try {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown';
      const deviceInfo = this.parseUserAgent(userAgent);
      const location = await this.getLocationFromIP(ipAddress);

      // Record login history
      await prisma.loginHistory.create({
        data: {
          userId,
          deviceInfo,
          ipAddress,
          location,
          userAgent,
          status
        }
      });

      // Create/update active session only for successful logins
      if (status === 'SUCCESS') {
        await prisma.userSession.upsert({
          where: {
            userId_userAgent: {
              userId,
              userAgent
            }
          },
          update: {
            lastActiveAt: new Date(),
            isActive: true
          },
          create: {
            userId,
            deviceInfo,
            ipAddress,
            location,
            userAgent,
            isActive: true
          }
        });
      }

      return { deviceInfo, location, ipAddress, userAgent };
    } catch (error) {
      logger.error('Failed to record login session:', error);
      return null;
    }
  }

  private async checkAndSendLoginAlert(user: any, loginData: any) {
    if (!loginData) return;

    try {
      // Check if user has login alerts enabled
      const userSettings = await prisma.user.findUnique({
        where: { id: user.id },
        select: { loginAlerts: true }
      });

      if (!userSettings?.loginAlerts) {
        logger.info(`Login alerts disabled for user ${user.email}`);
        return; // User has disabled login alerts
      }

      // Check if this is a new device/location
      const recentLogins = await prisma.loginHistory.findMany({
        where: {
          userId: user.id,
          status: 'SUCCESS',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days (reduced from 30)
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });

      logger.info(`Checking login alert for ${user.email}: ${recentLogins.length} recent logins`);

      // More lenient device detection - check if similar device/location exists
      const isNewDevice = recentLogins.length === 0 || !recentLogins.some(login => {
        const deviceMatch = login.deviceInfo?.includes(loginData.deviceInfo?.split(' ')[0]) || 
                           loginData.deviceInfo?.includes(login.deviceInfo?.split(' ')[0]);
        const locationMatch = login.location === loginData.location;
        return deviceMatch && locationMatch;
      });

      logger.info(`New device detected for ${user.email}: ${isNewDevice}`);

      if (isNewDevice) {
        logger.info(`Sending login alert to ${user.email}`);
        await emailService.sendLoginAlert(
          user.firstName,
          user.email,
          new Date().toLocaleString(),
          loginData.location,
          loginData.deviceInfo,
          loginData.ipAddress,
          user.authProvider || 'google'
        );
      }
    } catch (error) {
      logger.error('Failed to send login alert:', error);
    }
  }

  private parseUserAgent(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome on ' + (userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'MacOS' : userAgent.includes('Linux') ? 'Linux' : 'Unknown');
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari on ' + (userAgent.includes('iPhone') ? 'iPhone' : userAgent.includes('iPad') ? 'iPad' : 'MacOS');
    if (userAgent.includes('Firefox')) return 'Firefox on ' + (userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'MacOS' : 'Linux');
    if (userAgent.includes('Edge')) return 'Edge on Windows';
    return 'Unknown device';
  }

  private async getLocationFromIP(ipAddress: string): Promise<string> {
    // Simple IP-based location detection (in production, use a proper service)
    if (ipAddress.startsWith('197.210') || ipAddress.startsWith('197.211')) return 'Lagos, Nigeria';
    if (ipAddress.startsWith('105.112')) return 'Ibadan, Nigeria';
    if (ipAddress.startsWith('102.89')) return 'Abuja, Nigeria';
    return 'Nigeria';
  }
}