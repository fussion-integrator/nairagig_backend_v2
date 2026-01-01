import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '@/utils/logger';

export class EnterpriseSecurityHeaders {
  private static nonces = new Map<string, string>();

  static middleware(req: Request, res: Response, next: NextFunction) {
    const isProduction = process.env.NODE_ENV === 'production';
    const nonce = EnterpriseSecurityHeaders.generateNonce();
    
    // Store nonce for this request
    EnterpriseSecurityHeaders.nonces.set(req.ip || 'unknown', nonce);
    
    // Security Headers
    const headers = {
      // Prevent clickjacking
      'X-Frame-Options': 'DENY',
      
      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',
      
      // XSS Protection
      'X-XSS-Protection': '1; mode=block',
      
      // HSTS (HTTP Strict Transport Security)
      'Strict-Transport-Security': isProduction 
        ? 'max-age=31536000; includeSubDomains; preload'
        : 'max-age=31536000; includeSubDomains',
      
      // Referrer Policy
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      
      // Permissions Policy (Feature Policy)
      'Permissions-Policy': [
        'geolocation=()',
        'microphone=()',
        'camera=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()',
        'ambient-light-sensor=()',
        'autoplay=()',
        'encrypted-media=()',
        'fullscreen=(self)',
        'picture-in-picture=()'
      ].join(', '),
      
      // Cross-Origin Policies
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      
      // Content Security Policy
      'Content-Security-Policy': EnterpriseSecurityHeaders.generateCSP(nonce, isProduction),
      
      // Remove server information
      'Server': 'NairaGig-Enterprise',
      
      // Cache Control for sensitive pages
      'Cache-Control': req.path.includes('/admin') || req.path.includes('/dashboard') 
        ? 'no-store, no-cache, must-revalidate, private'
        : 'public, max-age=300',
      
      // Expect-CT (Certificate Transparency)
      'Expect-CT': isProduction 
        ? 'max-age=86400, enforce, report-uri="https://nairagig.com/ct-report"'
        : 'max-age=0',
      
      // Network Error Logging
      'NEL': isProduction 
        ? '{"report_to":"default","max_age":31536000,"include_subdomains":true}'
        : '{}',
      
      // Report-To for security reporting
      'Report-To': isProduction 
        ? '{"group":"default","max_age":31536000,"endpoints":[{"url":"https://nairagig.com/security-report"}],"include_subdomains":true}'
        : '{}'
    };

    // Apply headers
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('X-AspNet-Version');
    res.removeHeader('X-AspNetMvc-Version');
    
    // Add nonce to response locals for template usage
    res.locals.nonce = nonce;
    
    next();
  }

  static generateCSP(nonce: string, isProduction: boolean): string {
    const baseDirectives = {
      'default-src': ["'self'"],
      'script-src': isProduction 
        ? ["'self'", `'nonce-${nonce}'`, 'https://js.paystack.co']
        : ["'self'", `'nonce-${nonce}'`, "'unsafe-eval'", 'https://js.paystack.co'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:', 'blob:'],
      'connect-src': [
        "'self'",
        'https://api.paystack.co',
        'https://api.languagetool.org',
        'https://tfhub.dev',
        'https://www.kaggle.com',
        'https://storage.googleapis.com',
        ...(isProduction ? [] : ['http://localhost:*', 'ws://localhost:*'])
      ],
      'frame-src': ['https://js.paystack.co'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'worker-src': ["'self'", 'blob:'],
      'media-src': ["'self'", 'blob:'],
      'manifest-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'block-all-mixed-content': [],
      ...(isProduction ? { 'upgrade-insecure-requests': [] } : {})
    };

    return Object.entries(baseDirectives)
      .map(([directive, sources]) => 
        sources.length > 0 ? `${directive} ${sources.join(' ')}` : directive
      )
      .join('; ');
  }

  // Generate cryptographically secure nonce
  static generateNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  // Get nonce for current request
  static getNonce(req: Request): string {
    return EnterpriseSecurityHeaders.nonces.get(req.ip || 'unknown') || EnterpriseSecurityHeaders.generateNonce();
  }

  // Security headers for API responses
  static apiSecurityHeaders(req: Request, res: Response, next: NextFunction) {
    // API-specific security headers
    res.setHeader('X-API-Version', process.env.API_VERSION || 'v1');
    res.setHeader('X-Rate-Limit-Remaining', '1000'); // Will be updated by rate limiter
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    
    next();
  }

  // Security headers for file uploads
  static fileUploadSecurityHeaders(req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Download-Options', 'noopen');
    
    next();
  }

  // Cleanup old nonces
  static cleanup() {
    EnterpriseSecurityHeaders.nonces.clear();
  }
}

// Cleanup nonces every hour
setInterval(() => EnterpriseSecurityHeaders.cleanup(), 60 * 60 * 1000);