import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AdminRoleController {
  // Get all admin roles
  async getRoles(req: Request, res: Response) {
    try {
      const roles = await prisma.adminRole.findMany({
        include: {
          _count: {
            select: {
              admins: true,
              invitations: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      res.json({
        success: true,
        data: roles
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create new role
  async createRole(req: Request, res: Response) {
    try {
      const { name, description, permissions, level } = req.body;
      const adminId = (req as any).admin.id;

      if (!name || !permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Name and permissions array are required' 
        });
      }

      const role = await prisma.adminRole.create({
        data: {
          name,
          description,
          permissions,
          level: level || 1,
          createdBy: adminId
        }
      });

      res.status(201).json({
        success: true,
        data: role
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Update role
  async updateRole(req: Request, res: Response) {
    try {
      const { roleId } = req.params;
      const { name, description, permissions, level } = req.body;
      const adminId = (req as any).admin.id;

      const role = await prisma.adminRole.update({
        where: { id: roleId },
        data: {
          name,
          description,
          permissions,
          level,
          updatedBy: adminId,
          updatedAt: new Date()
        }
      });

      res.json({
        success: true,
        data: role
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Delete role
  async deleteRole(req: Request, res: Response) {
    try {
      const { roleId } = req.params;

      // Check if role is in use
      const [adminCount, invitationCount] = await Promise.all([
        prisma.admin.count({ where: { roleId } }),
        prisma.adminInvitation.count({ where: { roleId } })
      ]);

      if (adminCount > 0 || invitationCount > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete role that is currently assigned to admins or invitations'
        });
      }

      await prisma.adminRole.delete({ where: { id: roleId } });

      res.json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Get available permissions
  async getPermissions(req: Request, res: Response) {
    try {
      const permissions = [
        // User Management
        { category: 'User Management', permissions: ['VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS', 'SUSPEND_USERS'] },
        
        // Job Management
        { category: 'Job Management', permissions: ['VIEW_JOBS', 'CREATE_JOBS', 'EDIT_JOBS', 'DELETE_JOBS', 'MODERATE_JOBS'] },
        
        // Challenge Management
        { category: 'Challenge Management', permissions: ['VIEW_CHALLENGES', 'CREATE_CHALLENGES', 'EDIT_CHALLENGES', 'DELETE_CHALLENGES'] },
        
        // Financial Management
        { category: 'Financial Management', permissions: ['VIEW_TRANSACTIONS', 'PROCESS_PAYMENTS', 'MANAGE_WALLETS', 'VIEW_REPORTS'] },
        
        // Admin Management
        { category: 'Admin Management', permissions: ['VIEW_ADMINS', 'INVITE_ADMINS', 'EDIT_ADMINS', 'SUSPEND_ADMINS'] },
        
        // System Management
        { category: 'System Management', permissions: ['VIEW_LOGS', 'MANAGE_SETTINGS', 'SYSTEM_MAINTENANCE', 'BACKUP_DATA'] },
        
        // Content Management
        { category: 'Content Management', permissions: ['MODERATE_CONTENT', 'MANAGE_CATEGORIES', 'MANAGE_NOTIFICATIONS'] },
        
        // Security
        { category: 'Security', permissions: ['VIEW_SECURITY_LOGS', 'MANAGE_PERMISSIONS', 'AUDIT_ACTIONS'] }
      ];

      res.json({
        success: true,
        data: permissions
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}