import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitData {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

export class EnterpriseRateLimit {
  private static limits = new Map<string, RateLimitData>();
  private static suspiciousIPs = new Set<string>();
  private static blockedIPs = new Map<string, number>(); // IP -> unblock timestamp

  // Different rate limits for different endpoints
  static readonly configs = {
    // General API rate limiting
    general: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100
    },
    
    // Strict rate limiting for auth endpoints
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 200, // Increased from 50 to 200
      keyGenerator: (req: Request) => `auth_${req.ip}_${req.path}`
    },
    
    // Very strict for login attempts
    login: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyGenerator: (req: Request) => `login_${req.ip}`
    },
    
    // File upload rate limiting
    upload: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
      keyGenerator: (req: Request) => `upload_${req.ip}`
    },
    
    // Admin endpoints - very strict
    admin: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30,
      keyGenerator: (req: Request) => `admin_${req.ip}_${(req as any).user?.id || 'anonymous'}`
    }
  };

  // Create rate limiter middleware
  static createLimiter(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const clientIP = req.ip || 'unknown';
      
      // Skip rate limiting for auth verify endpoint in development
      if (process.env.NODE_ENV === 'development' && req.path.includes('/auth/verify')) {
        return next();
      }
      
      // Check if IP is blocked
      if (EnterpriseRateLimit.isIPBlocked(clientIP)) {
        return EnterpriseRateLimit.handleBlockedIP(req, res);
      }

      const key = config.keyGenerator ? config.keyGenerator(req) : `${clientIP}_${req.path}`;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      let limitData = EnterpriseRateLimit.limits.get(key);
      
      if (!limitData || limitData.resetTime <= now) {
        // Reset or create new limit data
        limitData = {
          count: 0,
          resetTime: now + config.windowMs,
          blocked: false
        };
      }

      // Increment request count
      limitData.count++;
      EnterpriseRateLimit.limits.set(key, limitData);

      // Check if limit exceeded
      if (limitData.count > config.maxRequests) {
        await EnterpriseRateLimit.handleRateLimitExceeded(req, res, key, limitData);
        return;
      }

      // Set rate limit headers
      EnterpriseRateLimit.setRateLimitHeaders(res, config, limitData);
      
      next();
    };
  }

  // Handle rate limit exceeded
  private static async handleRateLimitExceeded(
    req: Request, 
    res: Response, 
    key: string, 
    limitData: RateLimitData
  ) {
    const clientIP = req.ip || 'unknown';
    
    // Mark as suspicious after multiple violations
    if (limitData.count > 50) {
      EnterpriseRateLimit.suspiciousIPs.add(clientIP);
      await EnterpriseRateLimit.logSecurityIncident(req, 'RATE_LIMIT_ABUSE', 'HIGH');
    }

    // Temporary block for severe violations
    if (limitData.count > 100) {
      const blockDuration = 60 * 60 * 1000; // 1 hour
      EnterpriseRateLimit.blockedIPs.set(clientIP, Date.now() + blockDuration);
      await EnterpriseRateLimit.logSecurityIncident(req, 'IP_BLOCKED', 'CRITICAL');
    }

    logger.warn(`Rate limit exceeded for ${clientIP}`, {
      key,
      count: limitData.count,
      path: req.path,
      userAgent: req.headers['user-agent']
    });

    const retryAfter = Math.ceil((limitData.resetTime - Date.now()) / 1000);
    
    res.set({
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(limitData.resetTime).toISOString()
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Check if IP is blocked
  static isIPBlocked(clientIP: string): boolean {
    const blockUntil = EnterpriseRateLimit.blockedIPs.get(clientIP);
    if (!blockUntil) return false;

    if (Date.now() > blockUntil) {
      EnterpriseRateLimit.blockedIPs.delete(clientIP);
      return false;
    }

    return true;
  }

  // Handle blocked IP
  static handleBlockedIP(req: Request, res: Response) {
    const clientIP = req.ip || 'unknown';
    const blockUntil = EnterpriseRateLimit.blockedIPs.get(clientIP);
    const retryAfter = blockUntil ? Math.ceil((blockUntil - Date.now()) / 1000) : 3600;

    logger.warn(`Blocked IP attempted access: ${clientIP}`, {
      path: req.path,
      userAgent: req.headers['user-agent']
    });

    res.set({
      'Retry-After': retryAfter.toString()
    });

    res.status(429).json({
      error: 'IP Blocked',
      message: 'Your IP has been temporarily blocked due to suspicious activity.',
      retryAfter,
      code: 'IP_BLOCKED'
    });
  }

  // Set rate limit headers
  static setRateLimitHeaders(
    res: Response, 
    config: RateLimitConfig, 
    limitData: RateLimitData
  ) {
    const remaining = Math.max(0, config.maxRequests - limitData.count);
    
    res.set({
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(limitData.resetTime).toISOString(),
      'X-RateLimit-Window': config.windowMs.toString()
    });
  }

  // Log security incident
  static async logSecurityIncident(
    req: Request, 
    type: string, 
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ) {
    try {
      await prisma.securityIncident.create({
        data: {
          type,
          description: `Rate limiting violation: ${type}`,
          ipAddress: req.ip || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          severity,
          userId: (req as any).user?.id,
          metadata: {
            path: req.path,
            method: req.method,
            headers: req.headers
          }
        }
      });
    } catch (error) {
      logger.error('Failed to log security incident:', error);
    }
  }

  // DDoS detection and mitigation
  static ddosProtection(req: Request, res: Response, next: NextFunction) {
    const clientIP = req.ip || 'unknown';
    const now = Date.now();
    const key = `ddos_${clientIP}`;
    
    let data = EnterpriseRateLimit.limits.get(key);
    if (!data || data.resetTime <= now) {
      data = {
        count: 0,
        resetTime: now + 10000, // 10 second window
        blocked: false
      };
    }

    data.count++;
    EnterpriseRateLimit.limits.set(key, data);

    // DDoS threshold: 100 requests in 10 seconds
    if (data.count > 100) {
      // Block IP for 1 hour
      EnterpriseRateLimit.blockedIPs.set(clientIP, now + (60 * 60 * 1000));
      
      logger.error(`DDoS attack detected from ${clientIP}`, {
        requestCount: data.count,
        userAgent: req.headers['user-agent']
      });

      return res.status(429).json({
        error: 'DDoS Protection Activated',
        message: 'Suspicious traffic detected. Access temporarily restricted.',
        code: 'DDOS_PROTECTION'
      });
    }

    next();
  }

  // Cleanup expired entries
  static cleanup() {
    const now = Date.now();
    
    // Clean expired rate limit data
    for (const [key, data] of EnterpriseRateLimit.limits.entries()) {
      if (data.resetTime <= now) {
        EnterpriseRateLimit.limits.delete(key);
      }
    }

    // Clean expired IP blocks
    for (const [ip, blockUntil] of EnterpriseRateLimit.blockedIPs.entries()) {
      if (now > blockUntil) {
        EnterpriseRateLimit.blockedIPs.delete(ip);
      }
    }

    logger.info('Rate limit cleanup completed', {
      activeLimits: EnterpriseRateLimit.limits.size,
      blockedIPs: EnterpriseRateLimit.blockedIPs.size
    });
  }

  // Get statistics
  static getStatistics() {
    return {
      activeLimits: EnterpriseRateLimit.limits.size,
      suspiciousIPs: EnterpriseRateLimit.suspiciousIPs.size,
      blockedIPs: EnterpriseRateLimit.blockedIPs.size,
      configs: Object.keys(EnterpriseRateLimit.configs)
    };
  }

  // Whitelist IP (for trusted sources)
  static whitelistIP(ip: string) {
    EnterpriseRateLimit.blockedIPs.delete(ip);
    EnterpriseRateLimit.suspiciousIPs.delete(ip);
    
    // Remove all rate limit entries for this IP
    for (const [key] of EnterpriseRateLimit.limits.entries()) {
      if (key.includes(ip)) {
        EnterpriseRateLimit.limits.delete(key);
      }
    }
    
    logger.info(`IP whitelisted: ${ip}`);
  }

  // Clear rate limits for development
  static clearRateLimits() {
    if (process.env.NODE_ENV === 'development') {
      EnterpriseRateLimit.limits.clear();
      EnterpriseRateLimit.blockedIPs.clear();
      EnterpriseRateLimit.suspiciousIPs.clear();
      logger.info('Rate limits cleared for development');
    }
  }
}

// Cleanup every 5 minutes
setInterval(() => EnterpriseRateLimit.cleanup(), 5 * 60 * 1000);