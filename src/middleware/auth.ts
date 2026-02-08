import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { config } from '@/config/config';
import { ApiError } from '@/utils/ApiError';
import { AuthenticatedUser } from '@/types/auth';

// Rate limiter with memory leak prevention
const rateLimiterMap = new Map<string, number[]>();
const RATE_LIMIT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Cleanup old rate limit entries
setInterval(() => {
  const now = Date.now();
  const cutoff = now - (15 * 60 * 1000); // 15 minutes
  
  for (const [key, timestamps] of rateLimiterMap.entries()) {
    const validTimestamps = timestamps.filter(time => time > cutoff);
    if (validTimestamps.length === 0) {
      rateLimiterMap.delete(key);
    } else {
      rateLimiterMap.set(key, validTimestamps);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.access_token;

    if (!token) {
      throw ApiError.unauthorized('Access token required');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string, type?: string };
    
    if (decoded.type === 'refresh') {
      throw ApiError.unauthorized('Invalid token type');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        twoFactorAuth: true
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      throw ApiError.unauthorized('Invalid or inactive user');
    }

    req.user = user as unknown as AuthenticatedUser;
    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }

    next();
  };
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Try to get token from Authorization header first (for API clients)
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    // If no Authorization header, try to get from httpOnly cookie
    if (!token) {
      token = req.cookies?.access_token;
    }

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true
      }
    });

    if (user && user.status === 'ACTIVE') {
      req.user = user as any;
    }

    next();
  } catch (error) {
    next();
  }
};

export const rateLimiter = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimiterMap.has(userId)) {
      rateLimiterMap.set(userId, []);
    }

    const userRequests = rateLimiterMap.get(userId) || [];
    const recentRequests = userRequests.filter((time: number) => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      return next(ApiError.tooManyRequests('Rate limit exceeded'));
    }

    recentRequests.push(now);
    rateLimiterMap.set(userId, recentRequests);

    next();
  };
};