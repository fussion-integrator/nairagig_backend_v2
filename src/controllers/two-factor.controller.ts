import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { emailService } from '@/services/email.service';

export class TwoFactorController {
  async generateCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      
      if (!email) {
        throw ApiError.badRequest('Email is required');
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true, twoFactorAuth: true }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      if (!user.twoFactorAuth) {
        throw ApiError.badRequest('2FA is not enabled for this account');
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Invalidate previous codes
      await prisma.twoFactorCode.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true }
      });

      // Create new code
      await prisma.twoFactorCode.create({
        data: {
          userId: user.id,
          code,
          expiresAt
        }
      });

      // Send email
      await emailService.sendTwoFactorCode(
        user.firstName,
        email,
        code,
        new Date().toLocaleString(),
        'Nigeria', // Default location
        req.headers['user-agent'] || 'Unknown device'
      );

      res.json({
        success: true,
        message: 'Verification code sent to your email'
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        throw ApiError.badRequest('Email and code are required');
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      });

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      const twoFactorCode = await prisma.twoFactorCode.findFirst({
        where: {
          userId: user.id,
          code,
          used: false,
          expiresAt: { gt: new Date() }
        }
      });

      if (!twoFactorCode) {
        throw ApiError.badRequest('Invalid or expired verification code');
      }

      // Mark code as used
      await prisma.twoFactorCode.update({
        where: { id: twoFactorCode.id },
        data: { used: true }
      });

      res.json({
        success: true,
        message: 'Code verified successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}