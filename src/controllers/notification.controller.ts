import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '@/types/auth';

const prisma = new PrismaClient();

export class NotificationController {
  async getNotifications(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { page = 1, limit = 20 } = req.query;

      const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      const total = await prisma.notification.count({
        where: { userId },
      });

      res.json({
        success: true,
        data: notifications,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async markAsRead(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found',
        });
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async markAllAsRead(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;

      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });

      res.json({
        success: true,
        message: 'All notifications marked as read',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteNotification(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found',
        });
      }

      await prisma.notification.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'Notification deleted',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}