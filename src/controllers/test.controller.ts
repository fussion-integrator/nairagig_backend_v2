import { Request, Response, NextFunction } from 'express';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class TestController {
  async sendTestEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email address is required'
        });
      }

      // Send a test 2FA email
      await emailService.sendTwoFactorCode(
        'Test User',
        email,
        '123456',
        new Date().toLocaleString(),
        'Lagos, Nigeria',
        'Chrome on MacOS'
      );

      logger.info(`Test email sent to ${email}`);

      res.json({
        success: true,
        message: `Test email sent successfully to ${email}`
      });
    } catch (error) {
      logger.error('Failed to send test email:', error);
      next(error);
    }
  }
}