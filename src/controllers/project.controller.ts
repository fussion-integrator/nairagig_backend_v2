import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class ProjectController {
  async getProjects(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, status, category, minBudget, maxBudget } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (status) where.status = status;
      if (category) where.category = category;
      if (minBudget || maxBudget) {
        where.budget = {};
        if (minBudget) where.budget.gte = Number(minBudget);
        if (maxBudget) where.budget.lte = Number(maxBudget);
      }

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImageUrl: true
              }
            },
            freelancer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileImageUrl: true
              }
            },
            _count: {
              select: {
                members: true,
                milestones: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.project.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          projects,
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

  async getProject(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          client: true,
          freelancer: true,
          milestones: true,
          files: true,
          reviews: true
        }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      next(error);
    }
  }

  async createProject(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const {
        title,
        description,
        category,
        subcategory,
        budget,
        timeline,
        skillsRequired,
        experienceLevel,
        projectType,
        attachments
      } = req.body;

      const project = await prisma.project.create({
        data: {
          title,
          description,
          category,
          subcategory,
          budget,
          timeline,
          skillsRequired,
          experienceLevel,
          projectType,
          attachments,
          clientId: userId,
          status: 'OPEN'
        },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImageUrl: true
            }
          }
        }
      });

      logger.info(`Project created: ${project.id} by user: ${userId}`);

      res.status(201).json({
        success: true,
        data: project
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProject(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const project = await prisma.project.findUnique({
        where: { id: req.params.id }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId) {
        throw ApiError.forbidden('Only project owner can update');
      }

      const updatedProject = await prisma.project.update({
        where: { id: req.params.id },
        data: req.body,
        include: {
          client: true,
          freelancer: true
        }
      });

      res.json({
        success: true,
        data: updatedProject
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProject(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const project = await prisma.project.findUnique({
        where: { id: req.params.id }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId) {
        throw ApiError.forbidden('Only project owner can delete');
      }

      await prisma.project.delete({
        where: { id: req.params.id }
      });

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async createMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const { title, description, amount, dueDate, deliverables } = req.body;

      const milestones = await prisma.projectMilestone.findMany({
        where: { projectId: req.params.id },
        orderBy: { orderIndex: 'asc' }
      });

      const milestone = await prisma.projectMilestone.create({
        data: {
          projectId: req.params.id,
          createdBy: userId,
          title,
          description,
          amount,
          dueDate: dueDate ? new Date(dueDate) : null,
          deliverables,
          orderIndex: milestones.length
        }
      });

      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        select: { clientId: true, freelancerId: true, status: true }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId && project.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
        throw ApiError.badRequest('Cannot add milestones to completed/cancelled project');
      }

      if (project.clientId !== userId) {
        throw ApiError.forbidden('Only client can create milestones');
      }

      res.status(201).json({
        success: true,
        data: milestone
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMilestone(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const milestone = await prisma.projectMilestone.findUnique({
        where: { id: req.params.milestoneId }
      });

      if (!milestone) {
        throw ApiError.notFound('Milestone not found');
      }

      const project = await prisma.project.findUnique({
        where: { id: milestone.projectId },
        select: { clientId: true, freelancerId: true }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId && project.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      const updatedMilestone = await prisma.projectMilestone.update({
        where: { id: req.params.milestoneId },
        data: req.body
      });

      res.json({
        success: true,
        data: updatedMilestone
      });
    } catch (error) {
      next(error);
    }
  }

  async getMilestones(req: Request, res: Response, next: NextFunction) {
    try {
      const milestones = await prisma.projectMilestone.findMany({
        where: { projectId: req.params.id },
        orderBy: { orderIndex: 'asc' }
      });

      res.json({
        success: true,
        data: milestones
      });
    } catch (error) {
      next(error);
    }
  }
}