import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { ApiError } from '@/utils/ApiError';

interface SessionData {
  id: string;
  userId: string;
  fingerprint: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export class EnterpriseSessionSecurity {
  private static readonly FINGERPRINT_SECRET = process.env.SESSION_FINGERPRINT_SECRET || 'default-secret';
  private static readonly SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || '3600000'); // 1 hour
  private static readonly MAX_CONCURRENT_SESSIONS = parseInt(process.env.CONCURRENT_SESSION_LIMIT || '3');
  private static readonly ROTATION_INTERVAL = parseInt(process.env.SESSION_ROTATION_INTERVAL || '300000'); // 5 minutes

  // Generate cryptographically secure session ID
  static generateSecureSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create device fingerprint with multiple factors
  static generateFingerprint(req: Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.headers['accept'] || '',
      req.ip || '',
      req.headers['x-forwarded-for'] || '',
    ];
    
    const fingerprint = crypto
      .createHmac('sha256', this.FINGERPRINT_SECRET)
      .update(components.join('|'))
      .digest('hex');
    
    return fingerprint;
  }

  // Enhanced session validation with security checks
  static async validateSession(req: Request, res: Response, next: NextFunction) {
    try {
      // Skip session validation for auth endpoints
      if (req.path.includes('/auth/') && 
          (req.path.includes('/set-tokens') || 
           req.path.includes('/clear-tokens') || 
           req.path.includes('/oauth') ||
           req.path.includes('/refresh') ||
           req.path.includes('/verify'))) {
        return next();
      }

      const sessionToken = req.cookies?.access_token;
      if (!sessionToken) return next();

      // Get session with user data - handle legacy sessions without token
      let session = await prisma.userSession.findFirst({
        where: { 
          token: sessionToken,
          isActive: true,
          expiresAt: { gt: new Date() }
        },
        include: { 
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              status: true,
              twoFactorAuth: true
            }
          }
        }
      });

      // If no session found with token, try to find by user agent (legacy support)
      if (!session) {
        const decoded = jwt.verify(sessionToken, config.jwtSecret) as { userId: string };
        session = await prisma.userSession.findFirst({
          where: {
            userId: decoded.userId,
            userAgent: req.headers['user-agent'],
            isActive: true
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                status: true,
                twoFactorAuth: true
              }
            }
          }
        });
      }

      if (!session || !session.user) {
        await EnterpriseSessionSecurity.clearInvalidSession(res, sessionToken);
        return next();
      }

      // Check if user account is suspended
      if (session.user.status === 'SUSPENDED' || session.user.status === 'BANNED') {
        await EnterpriseSessionSecurity.invalidateUserSessions(session.userId);
        await EnterpriseSessionSecurity.clearInvalidSession(res, sessionToken);
        return res.status(423).json({ error: 'Account suspended' });
      }

      // Validate session fingerprint (only if fingerprint exists and not in development)
      if (session.fingerprint && process.env.NODE_ENV === 'production') {
        const currentFingerprint = EnterpriseSessionSecurity.generateFingerprint(req);
        if (session.fingerprint !== currentFingerprint) {
          logger.warn(`Session hijacking detected for user ${session.userId}`, {
            userId: session.userId,
            sessionId: session.id,
            originalFingerprint: session.fingerprint,
            currentFingerprint,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          });
          
          // Invalidate all sessions and notify user
          await EnterpriseSessionSecurity.handleSecurityBreach(session.userId, req);
          return res.status(401).json({ error: 'Security violation detected' });
        }
      }

      // Check session timeout
      const timeSinceLastActivity = Date.now() - session.lastActiveAt.getTime();
      if (timeSinceLastActivity > EnterpriseSessionSecurity.SESSION_TIMEOUT) {
        await EnterpriseSessionSecurity.expireSession(session.id);
        await EnterpriseSessionSecurity.clearInvalidSession(res, sessionToken);
        return res.status(401).json({ error: 'Session expired' });
      }

      // Check if session needs rotation
      const timeSinceCreation = Date.now() - session.createdAt.getTime();
      if (timeSinceCreation > EnterpriseSessionSecurity.ROTATION_INTERVAL) {
        const newToken = await EnterpriseSessionSecurity.rotateSession(session, req, res);
        if (newToken) {
          req.headers.authorization = `Bearer ${newToken}`;
        }
      }

      // Update session activity
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() }
      });

      req.user = session.user;
      req.sessionId = session.id;
      next();
    } catch (error) {
      logger.error('Session validation error:', error);
      next();
    }
  }

  // Create new secure session using upsert
  static async createSession(userId: string, req: Request, res: Response): Promise<string> {
    const sessionId = EnterpriseSessionSecurity.generateSecureSessionId();
    const fingerprint = EnterpriseSessionSecurity.generateFingerprint(req);
    const expiresAt = new Date(Date.now() + EnterpriseSessionSecurity.SESSION_TIMEOUT);
    const deviceInfo = EnterpriseSessionSecurity.parseUserAgent(req.headers['user-agent'] || 'Unknown');

    // Enforce concurrent session limit
    await EnterpriseSessionSecurity.enforceConcurrentSessionLimit(userId);

    // Create new session using upsert
    await prisma.userSession.upsert({
      where: {
        userId_userAgent: {
          userId,
          userAgent: req.headers['user-agent'] || 'unknown'
        }
      },
      update: {
        token: sessionId,
        fingerprint,
        ipAddress: req.ip || 'unknown',
        expiresAt,
        isActive: true,
        lastActiveAt: new Date()
      },
      create: {
        id: crypto.randomUUID(),
        userId,
        token: sessionId,
        deviceInfo,
        fingerprint,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        expiresAt,
        isActive: true
      }
    });

    // Set secure cookie
    EnterpriseSessionSecurity.setSecureCookie(res, 'access_token', sessionId);
    
    // Log session creation
    logger.info(`Secure session created for user ${userId}`, {
      userId,
      sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return sessionId;
  }

  // Rotate session token
  private static async rotateSession(session: any, req: Request, res: Response): Promise<string | null> {
    try {
      const newToken = EnterpriseSessionSecurity.generateSecureSessionId();
      const newExpiresAt = new Date(Date.now() + EnterpriseSessionSecurity.SESSION_TIMEOUT);

      // Update session with new token
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          token: newToken,
          expiresAt: newExpiresAt,
          lastActiveAt: new Date()
        }
      });

      // Set new cookie
      EnterpriseSessionSecurity.setSecureCookie(res, 'access_token', newToken);
      
      logger.info(`Session rotated for user ${session.userId}`);
      return newToken;
    } catch (error) {
      logger.error('Session rotation failed:', error);
      return null;
    }
  }

  // Handle security breach
  private static async handleSecurityBreach(userId: string, req: Request) {
    // Invalidate all user sessions
    await EnterpriseSessionSecurity.invalidateUserSessions(userId);
    
    // Log security incident
    await prisma.securityIncident.create({
      data: {
        userId,
        type: 'SESSION_HIJACKING',
        description: 'Session fingerprint mismatch detected',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        severity: 'HIGH'
      }
    });

    // TODO: Send security alert email to user
    logger.error(`Security breach detected for user ${userId}`, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
  }

  // Enforce concurrent session limit
  private static async enforceConcurrentSessionLimit(userId: string) {
    const activeSessions = await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastActiveAt: 'desc' }
    });

    if (activeSessions.length >= EnterpriseSessionSecurity.MAX_CONCURRENT_SESSIONS) {
      // Deactivate oldest sessions
      const sessionsToDeactivate = activeSessions.slice(EnterpriseSessionSecurity.MAX_CONCURRENT_SESSIONS - 1);
      await prisma.userSession.updateMany({
        where: {
          id: { in: sessionsToDeactivate.map(s => s.id) }
        },
        data: { isActive: false }
      });
    }
  }

  // Invalidate all user sessions
  private static async invalidateUserSessions(userId: string) {
    await prisma.userSession.updateMany({
      where: { userId },
      data: { isActive: false }
    });
  }

  // Expire specific session
  private static async expireSession(sessionId: string) {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { isActive: false }
    });
  }

  // Clear invalid session cookies
  private static async clearInvalidSession(res: Response, token: string) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    
    // Mark session as inactive in database
    await prisma.userSession.updateMany({
      where: { token },
      data: { isActive: false }
    });
  }

  // Set secure cookie with enterprise settings
  private static setSecureCookie(res: Response, name: string, value: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie(name, value, {
      httpOnly: true, // Always httpOnly for security
      secure: isProduction,
      sameSite: 'strict', // Stricter than lax
      maxAge: EnterpriseSessionSecurity.SESSION_TIMEOUT,
      domain: process.env.COOKIE_DOMAIN,
      path: '/',
      signed: true // Sign cookies for integrity
    });
  }

  // Parse user agent for device info
  private static parseUserAgent(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome on ' + (userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'MacOS' : userAgent.includes('Linux') ? 'Linux' : 'Unknown');
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari on ' + (userAgent.includes('iPhone') ? 'iPhone' : userAgent.includes('iPad') ? 'iPad' : 'MacOS');
    if (userAgent.includes('Firefox')) return 'Firefox on ' + (userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'MacOS' : 'Linux');
    if (userAgent.includes('Edge')) return 'Edge on Windows';
    return 'Unknown device';
  }

  // Cleanup expired sessions
  static async cleanupExpiredSessions() {
    try {
      const result = await prisma.userSession.deleteMany({
        where: {
          OR: [
            { 
              createdAt: { 
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours old
              } 
            },
            {
              expiresAt: {
                lt: new Date()
              }
            },
            {
              isActive: false
            }
          ]
        }
      });
      
      if (result.count > 0) {
        logger.info(`Cleaned up ${result.count} expired sessions`);
      }
    } catch (error) {
      logger.error('Session cleanup failed:', error);
    }
  }
}