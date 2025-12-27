import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { getIO } from '@/config/socket';

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
      const userId = (req.user as any)?.id;
      
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
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
          }
        }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      // Check if user has access to this project
      if (project.clientId !== userId && project.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      // Fetch job separately if jobId exists
      let job = null;
      if (project.jobId) {
        job = await prisma.job.findUnique({
          where: { id: project.jobId },
          include: {
            category: true,
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
      }

      res.json({
        success: true,
        data: {
          ...project,
          job
        }
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

  async updateProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;
      const { progressPercentage, reason } = req.body;

      const project = await prisma.project.findUnique({
        where: { id },
        include: { client: true, freelancer: true }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.freelancerId !== userId) {
        throw ApiError.forbidden('Only freelancer can update progress');
      }

      const oldProgress = project.progressPercentage;
      
      // DO NOT update project progress immediately - only create pending update
      // Progress will only be updated when client confirms

      // Create action message in conversation
      const conversation = await prisma.conversation.findFirst({
        where: { projectId: id, type: 'PROJECT' }
      });

      let message = null;
      if (conversation) {
        message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            content: `${project.freelancer.firstName} has submitted a progress update to ${progressPercentage}%`,
            messageType: 'ACTION',
            actionType: 'STATUS_UPDATE',
            actionData: {
              oldValue: `${oldProgress}%`,
              newValue: `${progressPercentage}%`,
              reason
            }
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
          }
        });

        // Emit real-time update
        try {
          const io = getIO();
          io.to(`conversation_${conversation.id}`).emit('new_message', {
            ...message,
            conversationId: conversation.id
          });
        } catch (error) {
          logger.error('Socket.IO emit error:', error);
        }
      }

      // Create PENDING progress update
      const progressUpdate = await prisma.projectProgressUpdate.create({
        data: {
          projectId: id,
          updatedBy: userId,
          oldProgress,
          newProgress: progressPercentage,
          reason,
          status: 'PENDING',
          messageId: message?.id
        }
      });

      // Create notification for client
      await prisma.notification.create({
        data: {
          userId: project.clientId,
          title: 'Progress Update Available',
          message: `${project.freelancer.firstName} updated project progress to ${progressPercentage}%`,
          type: 'PROJECT_UPDATE',
          data: {
            projectId: id,
            projectTitle: project.title,
            progressPercentage,
            updateId: progressUpdate.id
          }
        }
      });

      res.json({ success: true, data: { project, progressUpdate } });
    } catch (error) {
      next(error);
    }
  }

  async getProgressHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const updates = await prisma.projectProgressUpdate.findMany({
        where: { projectId: id },
        include: {
          updater: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          confirmer: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          message: { select: { id: true, conversationId: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      const total = await prisma.projectProgressUpdate.count({ where: { projectId: id } });

      res.json({
        success: true,
        data: updates,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmProgressUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id, updateId } = req.params;

      const project = await prisma.project.findUnique({
        where: { id },
        include: { client: true, freelancer: true }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId) {
        throw ApiError.forbidden('Only client can confirm updates');
      }

      const update = await prisma.projectProgressUpdate.update({
        where: { id: updateId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy: userId
        }
      });

      // Update project progress
      await prisma.project.update({
        where: { id },
        data: { progressPercentage: update.newProgress }
      });

      // Create action message in conversation
      const conversation = await prisma.conversation.findFirst({
        where: { projectId: id, type: 'PROJECT' }
      });

      if (conversation) {
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            content: `${project.client.firstName} confirmed the progress update to ${update.newProgress}%`,
            messageType: 'ACTION',
            actionType: 'PROGRESS_CONFIRMED',
            actionData: {
              progressPercentage: update.newProgress,
              confirmedBy: project.client.firstName
            }
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
          }
        });

        // Emit real-time update
        try {
          const io = getIO();
          io.to(`conversation_${conversation.id}`).emit('new_message', {
            ...message,
            conversationId: conversation.id
          });
        } catch (error) {
          logger.error('Socket.IO emit error:', error);
        }
      }

      // Create notification for freelancer
      await prisma.notification.create({
        data: {
          userId: project.freelancerId,
          title: 'Progress Confirmed',
          message: `${project.client.firstName} confirmed your progress update`,
          type: 'PROJECT_UPDATE',
          data: {
            projectId: id,
            projectTitle: project.title,
            progressPercentage: update.newProgress,
            status: 'CONFIRMED'
          }
        }
      });

      res.json({ success: true, data: update });
    } catch (error) {
      next(error);
    }
  }

  async requestProgressChanges(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id, updateId } = req.params;
      const { reason } = req.body;

      const project = await prisma.project.findUnique({
        where: { id },
        include: { client: true, freelancer: true }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId) {
        throw ApiError.forbidden('Only client can request changes');
      }

      const update = await prisma.projectProgressUpdate.update({
        where: { id: updateId },
        data: {
          status: 'CHANGE_REQUESTED',
          changeRequested: true,
          changeReason: reason
        }
      });

      // Create action message in conversation
      const conversation = await prisma.conversation.findFirst({
        where: { projectId: id, type: 'PROJECT' }
      });

      if (conversation) {
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            content: `${project.client.firstName} requested changes to the progress update`,
            messageType: 'ACTION',
            actionType: 'CHANGES_REQUESTED',
            actionData: {
              reason,
              requestedBy: project.client.firstName
            }
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
          }
        });

        // Emit real-time update
        try {
          const io = getIO();
          io.to(`conversation_${conversation.id}`).emit('new_message', {
            ...message,
            conversationId: conversation.id
          });
        } catch (error) {
          logger.error('Socket.IO emit error:', error);
        }
      }

      res.json({ success: true, data: update });
    } catch (error) {
      next(error);
    }
  }
}