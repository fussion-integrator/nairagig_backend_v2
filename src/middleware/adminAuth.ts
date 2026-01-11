import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';

const adminService = new AdminService();

export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }

    const token = authHeader.substring(7);
    const session = await adminService.validateSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session'
      });
    }

    if (session.admin.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'Admin account is not active'
      });
    }

    // Attach admin info to request
    (req as any).admin = {
      id: session.admin.id,
      email: session.admin.email,
      role: session.admin.role,
      sessionId: session.id
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const admin = (req as any).admin;
      
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: 'Admin authentication required'
        });
      }

      // Super admins have all permissions
      if (admin.role === 'SUPER_ADMIN') {
        return next();
      }

      // For now, only allow SUPER_ADMIN for permission-based routes
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions: ${permission} required`
      });
    } catch (error) {
      res.status(403).json({
        success: false,
        error: 'Permission check failed'
      });
    }
  };
};