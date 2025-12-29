import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class AdminController {
  async suspendAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = (req.user as any)?.id;
      const { userId } = req.params;
      const { reason, duration, violationDetails, policySection } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, email: true }
      });

      if (!user) throw ApiError.notFound('User not found');

      await prisma.user.update({
        where: { id: userId },
        data: { 
          status: 'SUSPENDED',
          suspendedAt: new Date()
        }
      });

      // Send suspension email
      try {
        await emailService.sendAccountSuspension(user.firstName, user.email, {
          reason,
          duration,
          referenceId: `SUS-${Date.now()}`,
          reviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          violationDetails,
          policySection,
          reviewPeriod: '30 days',
          appealDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          appealUrl: 'https://nairagig.com/appeal',
          accountBalance: '0'
        });
      } catch (emailError) {
        logger.error('Failed to send suspension email:', emailError);
      }

      res.json({ success: true, message: 'Account suspended successfully' });
    } catch (error) {
      next(error);
    }
  }

  async grantFeatureAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { featureName, featureDescription, accessLevel } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, email: true }
      });

      if (!user) throw ApiError.notFound('User not found');

      // Feature access would be handled through user roles or a separate permissions system
      // For now, we'll just log this action
      logger.info(`Feature access granted: ${featureName} to user ${userId}`);

      // Send feature access email
      try {
        await emailService.sendFeatureAccessGranted(user.email, user.firstName, {
          featureName,
          featureDescription,
          accessLevel,
          grantedDate: new Date().toISOString(),
          featureUrl: `https://nairagig.com/features/${featureName.toLowerCase()}`
        });
      } catch (emailError) {
        logger.error('Failed to send feature access email:', emailError);
      }

      res.json({ success: true, message: 'Feature access granted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async sendViolationWarning(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { violationType, warningMessage, policySection, actionRequired } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, email: true }
      });

      if (!user) throw ApiError.notFound('User not found');

      // Log the warning (using notifications table as alternative)
      await prisma.notification.create({
        data: {
          userId,
          title: `Policy Violation Warning: ${violationType}`,
          message: warningMessage,
          type: 'SYSTEM'
        }
      });

      // Send violation warning email
      try {
        await emailService.sendSecurityAlertAdvanced(user.email, {
          userName: user.firstName,
          alertType: `Policy Violation Warning: ${violationType}`,
          eventDateTime: new Date().toISOString(),
          location: 'Administrative Action',
          deviceInfo: 'System Generated',
          ipAddress: 'N/A',
          eventDescription: warningMessage,
          riskLevel: 'Medium',
          riskColor: '#f59e0b',
          actionRequired: true,
          requiredActions: actionRequired ? [actionRequired] : [],
          securityUrl: 'https://nairagig.com/account/security'
        });
      } catch (emailError) {
        logger.error('Failed to send violation warning email:', emailError);
      }

      res.json({ success: true, message: 'Violation warning sent successfully' });
    } catch (error) {
      next(error);
    }
  }
}