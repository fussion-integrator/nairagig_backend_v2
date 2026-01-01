import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    status: string;
    profileImageUrl?: string;
    sessionTimeout?: boolean;
  };
}

export const sessionTimeoutMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip for OAuth routes and auth endpoints
    if (req.path.includes('/auth/google') || 
        req.path.includes('/auth/linkedin') || 
        req.path.includes('/auth/apple') ||
        req.path.includes('/auth/set-tokens') ||
        req.path.includes('/auth/clear-tokens') ||
        req.path.includes('/auth/verify') ||
        req.path.includes('/auth/refresh')) {
      return next();
    }

    // Skip for non-authenticated routes
    if (!req.user?.id) {
      return next();
    }

    const userId = req.user.id;
    const userAgent = req.headers['user-agent'] || '';

    // Get user's session timeout preference
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionTimeout: true }
    });

    // Skip if user has disabled session timeout
    if (!user?.sessionTimeout) {
      return next();
    }

    // Find user's session
    const session = await prisma.userSession.findFirst({
      where: {
        userId,
        userAgent,
        isActive: true
      }
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Check if session has timed out (30 minutes of inactivity)
    const timeoutDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = new Date();
    const lastActive = new Date(session.lastActiveAt);
    const timeSinceLastActivity = now.getTime() - lastActive.getTime();

    if (timeSinceLastActivity > timeoutDuration) {
      // Deactivate the session
      await prisma.userSession.update({
        where: { id: session.id },
        data: { isActive: false }
      });

      logger.info(`Session timed out for user ${userId}`);

      return res.status(401).json({
        success: false,
        message: 'Session has timed out due to inactivity',
        code: 'SESSION_TIMEOUT'
      });
    }

    // Update last active time
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastActiveAt: now }
    });

    next();
  } catch (error) {
    logger.error('Session timeout middleware error:', error);
    next();
  }
};

export const getSessionStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const userId = req.user.id;
    const userAgent = req.headers['user-agent'] || '';

    const session = await prisma.userSession.findFirst({
      where: {
        userId,
        userAgent,
        isActive: true
      }
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session not found'
      });
    }

    const timeoutDuration = 30 * 60 * 1000; // 30 minutes
    const now = new Date();
    const lastActive = new Date(session.lastActiveAt);
    const timeSinceLastActivity = now.getTime() - lastActive.getTime();
    const timeRemaining = Math.max(0, timeoutDuration - timeSinceLastActivity);

    res.json({
      success: true,
      data: {
        isActive: true,
        lastActiveAt: session.lastActiveAt,
        timeRemaining: Math.floor(timeRemaining / 1000), // in seconds
        expiresAt: new Date(lastActive.getTime() + timeoutDuration)
      }
    });
  } catch (error) {
    logger.error('Get session status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get session status'
    });
  }
};

export const extendSession = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const userId = req.user.id;
    const userAgent = req.headers['user-agent'] || '';

    const session = await prisma.userSession.findFirst({
      where: {
        userId,
        userAgent,
        isActive: true
      }
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Update last active time
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() }
    });

    res.json({
      success: true,
      message: 'Session extended successfully'
    });
  } catch (error) {
    logger.error('Extend session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend session'
    });
  }
};