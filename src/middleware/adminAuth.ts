import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import { Permission } from '@prisma/client';

const adminService = new AdminService();

// Admin authentication middleware
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accessToken = req.cookies.admin_access_token;
    const refreshToken = req.cookies.admin_refresh_token;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.replace('Bearer ', '');
    
    // Try access token first, then refresh token, then bearer token
    const token = accessToken || refreshToken || bearerToken;

    if (!token) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const session = await adminService.validateSession(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    (req as any).admin = session.admin;
    (req as any).permissions = session.permissions;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Permission check middleware factory
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = (req as any).admin;
    const permissions = (req as any).permissions;

    // Super admin has all permissions
    if (admin.role === 'SUPER_ADMIN') {
      return next();
    }

    if (!permissions || !permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Super admin only middleware
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  const admin = (req as any).admin;

  if (admin.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};