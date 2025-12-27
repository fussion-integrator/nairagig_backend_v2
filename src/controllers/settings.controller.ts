import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '@/types/auth';

const prisma = new PrismaClient();

export class SettingsController {
  async getSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          emailNotifications: true,
          smsNotifications: true,
          marketingEmails: true,
          twoFactorAuth: true,
          loginAlerts: true,
          sessionTimeout: true,
          profileVisibility: true,
          timezone: true,
          language: true,
          currency: true,
          dateFormat: true,
          timeFormat: true,
          theme: true,
          compactMode: true,
          showOnlineStatus: true,
          allowSearchEngineIndexing: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch settings',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const settings = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: settings,
        select: {
          emailNotifications: true,
          smsNotifications: true,
          marketingEmails: true,
          twoFactorAuth: true,
          loginAlerts: true,
          sessionTimeout: true,
          profileVisibility: true,
          timezone: true,
          language: true,
          currency: true,
          dateFormat: true,
          timeFormat: true,
          theme: true,
          compactMode: true,
          showOnlineStatus: true,
          allowSearchEngineIndexing: true,
        },
      });

      res.json({
        success: true,
        data: updatedUser,
        message: 'Settings updated successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update settings',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getSessions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;

      const sessions = await prisma.userSession.findMany({
        where: { 
          userId,
          isActive: true
        },
        orderBy: { lastActiveAt: 'desc' }
      });

      const formattedSessions = sessions.map(session => ({
        id: session.id,
        device: session.deviceInfo,
        location: session.location || 'Unknown location',
        lastActive: this.formatTimeAgo(session.lastActiveAt),
        current: req.headers['user-agent'] === session.userAgent,
        ip: session.ipAddress.replace(/\d{1,3}$/, 'xxx')
      }));

      res.json({
        success: true,
        data: formattedSessions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sessions',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async endSession(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      
      await prisma.userSession.update({
        where: { 
          id,
          userId // Ensure user can only end their own sessions
        },
        data: { isActive: false }
      });
      
      res.json({
        success: true,
        message: 'Session ended successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to end session',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async endAllSessions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const currentUserAgent = req.headers['user-agent'];
      
      // End all sessions except current one
      await prisma.userSession.updateMany({
        where: { 
          userId,
          userAgent: { not: currentUserAgent },
          isActive: true
        },
        data: { isActive: false }
      });
      
      res.json({
        success: true,
        message: 'All other sessions ended successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to end sessions',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getLoginHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [loginHistory, total] = await Promise.all([
        prisma.loginHistory.findMany({
          where: { userId },
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.loginHistory.count({ where: { userId } })
      ]);

      const formattedHistory = loginHistory.map(entry => ({
        id: entry.id,
        device: entry.deviceInfo,
        location: entry.location || 'Unknown location',
        time: this.formatTimeAgo(entry.createdAt),
        status: entry.status.toLowerCase(),
        ip: entry.ipAddress.replace(/\d{1,3}$/, 'xxx')
      }));

      res.json({
        success: true,
        data: formattedHistory,
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
        message: 'Failed to fetch login history',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
    } else {
      return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
    }
  }

  // Account management methods
  async requestAccountClosure(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      
      await prisma.user.update({
        where: { id: userId },
        data: { 
          status: 'INACTIVE',
          deletedAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        }
      });

      res.json({
        success: true,
        message: 'Account closure request submitted. You can reactivate within 30 days.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to process account closure request',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async deleteAccount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      
      // Soft delete - mark as deleted but keep data for legal/audit purposes
      await prisma.user.update({
        where: { id: userId },
        data: { 
          status: 'SUSPENDED',
          deletedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: 'Account deletion request submitted. Your account will be permanently deleted within 24 hours.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to process account deletion request',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}