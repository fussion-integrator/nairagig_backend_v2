import { Request, Response, NextFunction } from 'express';
import { ApiError } from '@/utils/ApiError';

export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    
    if (!roles.includes(user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }
    
    next();
  };
};