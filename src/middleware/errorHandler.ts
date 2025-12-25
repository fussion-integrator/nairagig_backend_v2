import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { ApiError } from '@/utils/ApiError';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error(`${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
    return;
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    res.status(400).json({
      success: false,
      message: 'Database operation failed',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Token expired'
    });
    return;
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.message
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};