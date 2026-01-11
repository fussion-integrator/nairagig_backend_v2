import { Request, Response } from 'express';
import { AdminUserService } from '../services/adminUser.service';
import { UserStatus, UserRole } from '@prisma/client';

const adminUserService = new AdminUserService();

export class AdminUserController {
  // Get users list
  async getUsers(req: Request, res: Response) {
    try {
      const { page, limit, search, status, role, includeDeleted } = req.query;
      
      const result = await adminUserService.getUsers({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        search: search as string,
        status: status as UserStatus,
        role: role as UserRole,
        includeDeleted: includeDeleted === 'true'
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get user statistics
  async getUserStats(req: Request, res: Response) {
    try {
      const stats = await adminUserService.getUserStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create user
  async createUser(req: Request, res: Response) {
    try {
      const { firstName, lastName, email, phone, role, password } = req.body;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.createUser({
        firstName,
        lastName,
        email,
        phone,
        role,
        password
      }, adminId);

      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Get comprehensive user details (single endpoint)
  async getUserDetails(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const result = await adminUserService.getUserDetails(userId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get user details
  async getUserById(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const user = await adminUserService.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update user
  async updateUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.updateUser(userId, updateData, adminId);
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Update user status
  async updateUserStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { isActive, role } = req.body;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.updateUserStatus(userId, { isActive, role }, adminId);
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Soft delete user (default)
  async deleteUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const admin = (req as any).admin;
      
      if (!admin?.id) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }

      await adminUserService.softDeleteUser(userId, admin.id);
      res.json({ success: true, message: 'User soft deleted successfully' });
    } catch (error: any) {
      console.error('Soft delete user error:', error.message);
      res.status(400).json({ error: error.message });
    }
  }

  // Permanent delete user (separate endpoint)
  async permanentlyDeleteUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const admin = (req as any).admin;
      
      if (!admin?.id) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }

      await adminUserService.permanentlyDeleteUser(userId, admin.id);
      res.json({ success: true, message: 'User permanently deleted' });
    } catch (error: any) {
      console.error('Permanent delete user error:', error.message);
      res.status(400).json({ error: error.message });
    }
  }

  // Restore user
  async restoreUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const adminId = (req as any).admin.id;

      await adminUserService.restoreUser(userId, adminId);
      res.json({ success: true, message: 'User restored successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Suspend user
  async suspendUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.suspendUser(userId, adminId, reason);
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Activate user
  async activateUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.activateUser(userId, adminId);
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Verify user
  async verifyUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.verifyUser(userId, adminId);
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Unverify user
  async unverifyUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const adminId = (req as any).admin.id;

      const user = await adminUserService.unverifyUser(userId, adminId);
      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Reset user password
  async resetPassword(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const adminId = (req as any).admin.id;

      const result = await adminUserService.resetUserPassword(userId, adminId);
      res.json({ success: true, temporaryPassword: result.temporaryPassword });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get user activity
  async getUserActivity(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page, limit } = req.query;

      const result = await adminUserService.getUserActivity(userId, {
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Bulk actions
  async bulkAction(req: Request, res: Response) {
    try {
      const { userIds, action } = req.body;
      const adminId = (req as any).admin.id;

      const result = await adminUserService.bulkAction(userIds, action, adminId);
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Export users
  async exportUsers(req: Request, res: Response) {
    try {
      const { format = 'csv', filters, selectedUserIds } = req.query;
      
      let parsedFilters = {};
      let parsedUserIds: string[] | undefined;
      
      // Safely parse filters
      if (filters && typeof filters === 'string') {
        try {
          parsedFilters = JSON.parse(filters);
        } catch (parseError) {
          console.error('Failed to parse filters:', parseError);
          parsedFilters = {};
        }
      }
      
      // Safely parse selectedUserIds
      if (selectedUserIds && typeof selectedUserIds === 'string') {
        try {
          parsedUserIds = JSON.parse(selectedUserIds);
        } catch (parseError) {
          console.error('Failed to parse selectedUserIds:', parseError);
          parsedUserIds = undefined;
        }
      }
      
      const exportParams: any = {
        format: format as string,
        filters: parsedFilters,
        selectedUserIds: parsedUserIds
      };
      
      const result = await adminUserService.exportUsers(exportParams);

      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=users-${new Date().toISOString().split('T')[0]}.${format}`);
      res.send(result);
    } catch (error: any) {
      console.error('Export users error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Send message to user
  async sendMessageToUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { subject, message, actionRequired, sendEmail, sendPushNotification } = req.body;
      const adminId = (req as any).admin.id;

      // Set timeout for the entire operation (15 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 15000)
      );

      const servicePromise = adminUserService.sendMessageToUser(userId, adminId, {
        subject,
        message,
        actionRequired,
        sendEmail,
        sendPushNotification
      });

      const result = await Promise.race([servicePromise, timeoutPromise]);
      res.json(result);
    } catch (error: any) {
      console.error('Controller error in sendMessageToUser:', error);
      if (error.message === 'Request timeout') {
        res.status(408).json({ success: false, error: 'Request timeout - message may have been sent' });
      } else {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  async getUserProjects(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const result = await adminUserService.getUserProjects(userId, Number(page), Number(limit));
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserDocuments(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const result = await adminUserService.getUserDocuments(userId, Number(page), Number(limit));
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserJobs(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const result = await adminUserService.getUserJobs(userId, Number(page), Number(limit));
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserChallenges(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const result = await adminUserService.getUserChallenges(userId, Number(page), Number(limit));
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserTransactions(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const result = await adminUserService.getUserTransactions(userId, Number(page), Number(limit));
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserWallet(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const result = await adminUserService.getUserWallet(userId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserPaymentMethods(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const result = await adminUserService.getUserPaymentMethods(userId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserSubscription(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const result = await adminUserService.getUserSubscription(userId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Send email to individual user
  async sendEmailToUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { subject, message } = req.body;
      const adminId = (req as any).admin.id;

      const result = await adminUserService.sendEmailToUser(userId, adminId, {
        subject,
        message
      });

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Bulk email to users
  async bulkEmail(req: Request, res: Response) {
    try {
      const { userIds, subject, message } = req.body;
      const adminId = (req as any).admin.id;

      const result = await adminUserService.sendBulkEmail(userIds, adminId, {
        subject,
        message
      });

      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserPaymentHistory(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const result = await adminUserService.getUserPaymentHistory(userId, Number(page), Number(limit));
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}