import { Request } from 'express';
import { User } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  profileImageUrl?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}