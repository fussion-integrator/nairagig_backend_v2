import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { config } from '@/config/config';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

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

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Record login session and history
      await this.recordLoginSession(req, user.id, 'SUCCESS');

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
      const { userId } = req.body;

      if (!userId) {
        throw ApiError.badRequest('User ID required');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
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
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw ApiError.unauthorized('Refresh token required');
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
        throw ApiError.unauthorized('Invalid refresh token');
      }

      const payload = { userId: user.id };
      const newAccessToken = (jwt.sign as any)(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
      const newRefreshToken = (jwt.sign as any)(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          user
        }
      });
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
    } catch (error) {
      logger.error('Failed to record login session:', error);
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