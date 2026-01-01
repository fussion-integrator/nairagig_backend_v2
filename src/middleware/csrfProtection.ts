import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

interface CSRFToken {
  token: string;
  expires: number;
  sessionId: string;
  userId?: string;
}

export class EnterpriseCSRFProtection {
  private static readonly SECRET = process.env.CSRF_SECRET || 'default-csrf-secret';
  private static readonly TOKEN_EXPIRY = parseInt(process.env.CSRF_TOKEN_EXPIRY || '3600000'); // 1 hour
  private static tokens = new Map<string, CSRFToken>();
  private static suspiciousIPs = new Map<string, { count: number; lastAttempt: number }>();

  // Generate cryptographically secure CSRF token
  static generateToken(sessionId: string, userId?: string): string {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const payload = `${sessionId}:${timestamp}:${randomBytes}`;
    
    const token = crypto
      .createHmac('sha256', this.SECRET)
      .update(payload)
      .digest('hex');
    
    const expires = Date.now() + this.TOKEN_EXPIRY;
    
    this.tokens.set(token, {
      token,
      expires,
      sessionId,
      userId
    });
    
    return token;
  }

  // Validate CSRF token with timing-safe comparison
  static validateToken(sessionId: string, providedToken: string, userId?: string): boolean {
    if (!providedToken || providedToken.length !== 64) {
      return false;
    }

    const stored = this.tokens.get(providedToken);
    if (!stored) {
      return false;
    }

    // Check expiration
    if (stored.expires < Date.now()) {
      this.tokens.delete(providedToken);
      return false;
    }

    // Validate session and user
    if (stored.sessionId !== sessionId) {
      return false;
    }

    if (userId && stored.userId && stored.userId !== userId) {
      return false;
    }

    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(stored.token, 'hex'),
      Buffer.from(providedToken, 'hex')
    );
  }

  // Enhanced CSRF middleware with attack detection
  static middleware(req: Request, res: Response, next: NextFunction) {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip for webhook endpoints and auth endpoints
    if (req.path.includes('/webhook') || 
        req.path.includes('/auth/oauth') ||
        req.path.includes('/auth/set-tokens') ||
        req.path.includes('/auth/clear-tokens') ||
        req.path.includes('/auth/refresh') ||
        req.path.includes('/auth/verify') ||
        req.path.includes('/api/dev/')) {
      return next();
    }

    const sessionId = req.sessionID || req.cookies?.session_id;
    const csrfToken = req.headers['x-csrf-token'] as string;
    const userId = (req as any).user?.id;
    const clientIP = req.ip || 'unknown';

    if (!sessionId) {
      EnterpriseCSRFProtection.logSuspiciousActivity(clientIP, 'NO_SESSION');
      return res.status(403).json({ 
        error: 'Session required',
        code: 'CSRF_NO_SESSION'
      });
    }

    if (!csrfToken) {
      EnterpriseCSRFProtection.logSuspiciousActivity(clientIP, 'NO_CSRF_TOKEN');
      return res.status(403).json({ 
        error: 'CSRF token required',
        code: 'CSRF_TOKEN_MISSING'
      });
    }

    if (!EnterpriseCSRFProtection.validateToken(sessionId, csrfToken, userId)) {
      EnterpriseCSRFProtection.logSuspiciousActivity(clientIP, 'INVALID_CSRF_TOKEN');
      
      // Check for repeated CSRF attacks
      if (EnterpriseCSRFProtection.isUnderCSRFAttack(clientIP)) {
        EnterpriseCSRFProtection.handleCSRFAttack(req, clientIP);
        return res.status(429).json({ 
          error: 'Too many invalid CSRF attempts',
          code: 'CSRF_ATTACK_DETECTED'
        });
      }

      return res.status(403).json({ 
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID'
      });
    }

    // Token is valid, proceed
    next();
  }

  // Generate token endpoint with rate limiting
  static async generateTokenEndpoint(req: Request, res: Response) {
    try {
      const sessionId = req.sessionID || crypto.randomUUID();
      const userId = (req as any).user?.id;
      const clientIP = req.ip || 'unknown';

      // Rate limit token generation
      if (EnterpriseCSRFProtection.isTokenGenerationRateLimited(clientIP)) {
        return res.status(429).json({ 
          error: 'Token generation rate limit exceeded',
          code: 'CSRF_RATE_LIMITED'
        });
      }

      const token = EnterpriseCSRFProtection.generateToken(sessionId, userId);
      
      // Set token in cookie for double-submit pattern
      res.cookie('csrf_token', token, {
        httpOnly: false, // Client needs to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: this.TOKEN_EXPIRY,
        path: '/'
      });

      // Log token generation
      logger.info('CSRF token generated', {
        sessionId,
        userId,
        clientIP,
        userAgent: req.headers['user-agent']
      });

      res.json({ 
        csrfToken: token,
        expiresIn: this.TOKEN_EXPIRY
      });
    } catch (error) {
      logger.error('CSRF token generation failed:', error);
      res.status(500).json({ 
        error: 'Token generation failed',
        code: 'CSRF_GENERATION_ERROR'
      });
    }
  }

  // Log suspicious CSRF activity
  static logSuspiciousActivity(clientIP: string, type: string) {
    logger.warn(`CSRF security violation detected`, {
      type,
      clientIP,
      timestamp: new Date().toISOString()
    });

    // Track suspicious IPs
    const current = EnterpriseCSRFProtection.suspiciousIPs.get(clientIP) || { count: 0, lastAttempt: 0 };
    EnterpriseCSRFProtection.suspiciousIPs.set(clientIP, {
      count: current.count + 1,
      lastAttempt: Date.now()
    });
  }

  // Check if IP is under CSRF attack
  static isUnderCSRFAttack(clientIP: string): boolean {
    const suspicious = EnterpriseCSRFProtection.suspiciousIPs.get(clientIP);
    if (!suspicious) return false;

    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return suspicious.count >= 10 && suspicious.lastAttempt > fiveMinutesAgo;
  }

  // Handle CSRF attack
  static async handleCSRFAttack(req: Request, clientIP: string) {
    try {
      // Log security incident
      await prisma.securityIncident.create({
        data: {
          type: 'CSRF_ATTACK',
          description: `Multiple CSRF token violations from IP: ${clientIP}`,
          ipAddress: clientIP,
          userAgent: req.headers['user-agent'] || 'unknown',
          severity: 'HIGH',
          userId: (req as any).user?.id
        }
      });

      logger.error(`CSRF attack detected from IP: ${clientIP}`, {
        clientIP,
        userAgent: req.headers['user-agent'],
        path: req.path,
        method: req.method
      });
    } catch (error) {
      logger.error('Failed to log CSRF attack:', error);
    }
  }

  // Rate limit token generation
  static isTokenGenerationRateLimited(clientIP: string): boolean {
    const key = `csrf_gen_${clientIP}`;
    const current = EnterpriseCSRFProtection.suspiciousIPs.get(key) || { count: 0, lastAttempt: 0 };
    const oneMinuteAgo = Date.now() - 60000;

    if (current.lastAttempt < oneMinuteAgo) {
      EnterpriseCSRFProtection.suspiciousIPs.set(key, { count: 1, lastAttempt: Date.now() });
      return false;
    }

    if (current.count >= 10) {
      return true;
    }

    EnterpriseCSRFProtection.suspiciousIPs.set(key, {
      count: current.count + 1,
      lastAttempt: Date.now()
    });

    return false;
  }

  // Cleanup expired tokens and suspicious IPs
  static cleanup() {
    const now = Date.now();
    
    // Clean expired tokens
    for (const [token, data] of EnterpriseCSRFProtection.tokens.entries()) {
      if (data.expires < now) {
        EnterpriseCSRFProtection.tokens.delete(token);
      }
    }
    
    // Clean old suspicious IP records
    const oneHourAgo = now - (60 * 60 * 1000);
    for (const [ip, data] of EnterpriseCSRFProtection.suspiciousIPs.entries()) {
      if (data.lastAttempt < oneHourAgo) {
        EnterpriseCSRFProtection.suspiciousIPs.delete(ip);
      }
    }
  }

  // Get CSRF statistics
  static getStatistics() {
    return {
      activeTokens: EnterpriseCSRFProtection.tokens.size,
      suspiciousIPs: EnterpriseCSRFProtection.suspiciousIPs.size,
      tokenExpiry: EnterpriseCSRFProtection.TOKEN_EXPIRY
    };
  }
}

// Cleanup expired tokens every 10 minutes
setInterval(() => EnterpriseCSRFProtection.cleanup(), 10 * 60 * 1000);