import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from 'joi';
import { ApiError } from '@/utils/ApiError';

export const validateRequest = (schema: ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      throw ApiError.badRequest('Validation failed', errorMessage);
    }
    
    next();
  };
};