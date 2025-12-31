import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { logger } from '@/utils/logger';
import { ApiError } from '@/utils/ApiError';

const adminService = new AdminService();

// Enhanced admin authentication middleware with security features
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    // Extract token from multiple sources
    const accessToken = req.cookies.admin_access_token;
    const refreshToken = req.cookies.admin_refresh_token;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.replace('Bearer ', '');
    
    const token = accessToken || refreshToken || bearerToken;

    logger.info('Admin auth attempt:', {
      ip: clientIP,
      userAgent: userAgent.substring(0, 100),
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasBearerToken: !!bearerToken,
      endpoint: req.path,
      method: req.method
    });

    if (!token) {
      logger.warn('Admin auth failed - no token:', {
        ip: clientIP,
        endpoint: req.path,
        method: req.method
      });
      throw ApiError.unauthorized('Admin authentication required');
    }

    // Validate session with enhanced security checks
    const session = await adminService.validateSession(token);

    if (!session) {
      logger.warn('Admin auth failed - invalid session:', {
        ip: clientIP,
        tokenPrefix: token.substring(0, 10),
        endpoint: req.path,
        method: req.method
      });
      throw ApiError.unauthorized('Invalid or expired session');
    }

    // Additional security checks
    if (session.ipAddress && session.ipAddress !== clientIP) {
      logger.warn('Admin auth warning - IP mismatch:', {
        sessionIP: session.ipAddress,
        requestIP: clientIP,
        adminEmail: session.admin.email,
        endpoint: req.path
      });
      // Note: In production, you might want to block this or require re-authentication
    }

    // Check if admin account is still active
    if (session.admin.status !== 'ACTIVE') {
      logger.warn('Admin auth failed - inactive account:', {
        adminEmail: session.admin.email,
        status: session.admin.status,
        ip: clientIP
      });
      throw ApiError.forbidden('Admin account is not active');
    }

    // Update last active timestamp
    await adminService.updateSessionActivity(session.id);

    // Attach admin info to request
    (req as any).admin = {
      id: session.admin.id,
      email: session.admin.email,
      role: session.admin.role,
      sessionId: session.id
    };

    // Add IP and user agent for audit logging
    (req as any).clientIP = clientIP;
    (req as any).userAgent = userAgent;

    const duration = Date.now() - startTime;
    logger.info('Admin authenticated successfully:', {
      adminEmail: session.admin.email,
      adminRole: session.admin.role,
      ip: clientIP,
      endpoint: req.path,
      method: req.method,
      duration: `${duration}ms`
    });

    next();
  } catch (error) {
    const duration = Date.now() - Date.now();
    logger.error('Admin authentication error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      duration: `${duration}ms`
    });

    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.statusCode
      });
    }

    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 401
    });
  }
};

// Middleware to check specific admin permissions
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const admin = (req as any).admin;
      
      if (!admin) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      // Super admins have all permissions
      if (admin.role === 'SUPER_ADMIN') {
        return next();
      }

      // Check if admin has the required permission
      const hasPermission = await adminService.hasPermission(admin.id, permission);
      
      if (!hasPermission) {
        logger.warn('Admin permission denied:', {
          adminEmail: admin.email,
          requiredPermission: permission,
          endpoint: req.path,
          method: req.method
        });
        throw ApiError.forbidden(`Insufficient permissions: ${permission} required`);
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      
      if (error instanceof ApiError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.statusCode
        });
      }

      res.status(403).json({
        success: false,
        error: 'Permission check failed',
        code: 403
      });
    }
  };
};

// Audit logging middleware for admin actions
export const auditLog = (action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.json;
    
    res.json = function(data: any) {
      // Log the admin action after successful response
      if (data.success) {
        const admin = (req as any).admin;
        const clientIP = (req as any).clientIP;
        const userAgent = (req as any).userAgent;
        
        // This will be handled by the controller's logAdminAction method
        logger.info('Admin action completed:', {
          action,
          adminEmail: admin?.email,
          endpoint: req.path,
          method: req.method,
          ip: clientIP,
          success: true
        });
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};