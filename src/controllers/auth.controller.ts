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

      const accessToken = jwt.sign(
        { userId: user.id },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );
      
      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn }
      );

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

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

      const accessToken = jwt.sign(
        { userId: user.id },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );
      
      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn }
      );

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

      const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        throw ApiError.unauthorized('Invalid refresh token');
      }

      const newAccessToken = jwt.sign(
        { userId: user.id },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );
      
      const newRefreshToken = jwt.sign(
        { userId: user.id },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn }
      );

      res.json({
        success: true,
        data: {
          tokens: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}