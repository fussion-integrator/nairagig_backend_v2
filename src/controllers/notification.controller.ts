import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class NotificationController {
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 20, unreadOnly = false } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };
      if (unreadOnly === 'true') where.isRead = false;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.notification.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const notification = await prisma.notification.findUnique({ where: { id } });
      if (!notification) throw ApiError.notFound('Notification not found');
      if (notification.userId !== userId) throw ApiError.forbidden('Access denied');

      await prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() }
      });

      res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;

      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() }
      });

      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      next(error);
    }
  }

  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const notification = await prisma.notification.findUnique({ where: { id } });
      if (!notification) throw ApiError.notFound('Notification not found');
      if (notification.userId !== userId) throw ApiError.forbidden('Access denied');

      await prisma.notification.delete({ where: { id } });
      res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
      next(error);
    }
  }

  async sendBulkNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { type, title, data, targetUsers, filterCriteria } = req.body;

      if (!type || !title) {
        throw ApiError.badRequest('Type and title are required');
      }

      const result = await notificationService.sendBulkNotification({
        type,
        title,
        data: data || {},
        targetUsers,
        filterCriteria
      });

      res.json({
        success: true,
        message: `Notification sent to ${result.sent} users`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async sendJobNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { jobId } = req.params;

      const result = await notificationService.notifyNewJob(jobId);

      res.json({
        success: true,
        message: `Job notification sent to ${result?.sent || 0} users`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async sendChallengeNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;

      const result = await notificationService.notifyNewChallenge(challengeId);

      res.json({
        success: true,
        message: `Challenge notification sent to ${result?.sent || 0} users`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}