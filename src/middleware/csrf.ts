import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '@/utils/logger';

interface CSRFOptions {
  secret?: string;
  ignoreMethods?: string[];
  skipRoutes?: string[];
  cookieName?: string;
  headerName?: string;
  development?: boolean;
}

export class CSRFProtection {
  private secret: string;
  private ignoreMethods: string[];
  private skipRoutes: string[];
  private cookieName: string;
  private headerName: string;
  private development: boolean;

  constructor(options: CSRFOptions = {}) {
    this.secret = options.secret || process.env.CSRF_SECRET || 'nairagig-csrf-secret-2024';
    this.ignoreMethods = options.ignoreMethods || ['GET', 'HEAD', 'OPTIONS'];
    this.skipRoutes = options.skipRoutes || [
      '/api/v1/auth/oauth',
      '/api/v1/auth/callback',
      '/api/v1/auth/set-tokens',
      '/api/v1/auth/clear-tokens',
      '/api/v1/auth/refresh',
      '/api/v1/auth/verify',
      '/api/v1/security/session/status'
    ];
    this.cookieName = options.cookieName || 'csrf-token';
    this.headerName = options.headerName || 'x-csrf-token';
    this.development = options.development ?? (process.env.NODE_ENV === 'development');
  }

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  validateToken(token: string, sessionToken?: string): boolean {
    if (!token) return false;
    
    // In development, be more lenient
    if (this.development) {
      return token.length >= 32; // Basic length check
    }

    // In production, use proper HMAC validation
    try {
      const expectedToken = crypto
        .createHmac('sha256', this.secret)
        .update(sessionToken || 'default')
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(expectedToken, 'hex')
      );
    } catch {
      return false;
    }
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip CSRF for ignored methods
      if (this.ignoreMethods.includes(req.method)) {
        return next();
      }

      // Skip CSRF for specific routes
      if (this.skipRoutes.some(route => req.path.startsWith(route))) {
        return next();
      }

      // In development, be very lenient
      if (this.development) {
        // Only check for obvious attacks, not strict CSRF
        const referer = req.headers.referer || req.headers.origin;
        const host = req.headers.host;
        
        // Allow same-origin requests
        if (referer && host && (
          referer.includes(`localhost:${process.env.PORT || 3000}`) ||
          referer.includes(`localhost:3001`) ||
          referer.includes(host)
        )) {
          return next();
        }

        // Allow requests without referer (API clients, mobile apps)
        if (!referer) {
          return next();
        }
      }

      // Get CSRF token from header or body
      const token = req.headers[this.headerName] as string || 
                   req.body?._csrf || 
                   req.query._csrf as string;

      if (!token) {
        logger.warn('CSRF token missing', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        // In development, just warn and continue
        if (this.development) {
          return next();
        }
        
        return res.status(403).json({ 
          error: 'CSRF token required',
          code: 'CSRF_TOKEN_MISSING'
        });
      }

      // Validate token
      const sessionToken = req.cookies?.access_token;
      if (!this.validateToken(token, sessionToken)) {
        logger.warn('CSRF token validation failed', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          token: token.substring(0, 8) + '...' // Log partial token for debugging
        });
        
        // In development, just warn and continue
        if (this.development) {
          return next();
        }
        
        return res.status(403).json({ 
          error: 'Invalid CSRF token',
          code: 'CSRF_TOKEN_INVALID'
        });
      }

      next();
    };
  }

  // Endpoint to get CSRF token
  getTokenEndpoint() {
    return (req: Request, res: Response) => {
      const token = this.generateToken();
      
      // Set token in cookie for convenience
      res.cookie(this.cookieName, token, {
        httpOnly: false, // Allow JavaScript access
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 1000 // 1 hour
      });

      res.json({ 
        csrfToken: token,
        headerName: this.headerName
      });
    };
  }
}

// Export singleton instance
export const csrfProtection = new CSRFProtection({
  development: process.env.NODE_ENV === 'development'
});