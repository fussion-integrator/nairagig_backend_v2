import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class DisputeController {
  async getDisputes(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        OR: [
          { raisedBy: userId },
          { againstUserId: userId }
        ]
      };
      if (status && status !== 'all') where.status = status.toString().toUpperCase();

      const [disputes, total] = await Promise.all([
        prisma.dispute.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            project: {
              select: { id: true, title: true }
            },
            raisedByUser: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            againstUser: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            responses: {
              include: {
                responder: {
                  select: { id: true, firstName: true, lastName: true }
                }
              },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.dispute.count({ where })
      ]);

      const formattedDisputes = disputes.map(dispute => ({
        id: dispute.id,
        projectTitle: dispute.projectId ? 'Project Dispute' : 'N/A',
        client: dispute.raisedBy === userId ? 
          'Against User' :
          'Raised By User',
        status: dispute.status.toLowerCase(),
        openedDate: dispute.createdAt.toISOString().split('T')[0],
        resolvedDate: dispute.resolvedAt?.toISOString().split('T')[0],
        reason: dispute.title,
        description: dispute.description,
        resolution: dispute.resolution,
        responses: [] // Remove responses from mapping since they're not included
      }));

      res.json({
        success: true,
        data: formattedDisputes,
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

  async getDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const dispute = await prisma.dispute.findUnique({
        where: { id },
        include: {
          project: true,
          contract: true,
          raisedByUser: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          },
          againstUser: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          },
          resolver: {
            select: { id: true, firstName: true, lastName: true }
          },
          responses: {
            include: {
              responder: {
                select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!dispute) {
        throw ApiError.notFound('Dispute not found');
      }

      if (dispute.raisedBy !== userId && dispute.againstUserId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({ success: true, data: dispute });
    } catch (error) {
      next(error);
    }
  }

  async createDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const {
        projectId,
        contractId,
        jobId,
        againstUser,
        title,
        description,
        category,
        priority,
        amount,
        evidence
      } = req.body;

      const dispute = await prisma.dispute.create({
        data: {
          projectId,
          contractId,
          raisedBy: userId,
          againstUserId: againstUser,
          title,
          description,
          priority: priority || 'MEDIUM',
          evidence: evidence || []
        },
        include: {
          project: true,
          raisedByUser: {
            select: { id: true, firstName: true, lastName: true, email: true }
          },
          againstUser: {
            select: { id: true, firstName: true, lastName: true, email: true }
          }
        }
      });

      // Send dispute notification emails
      try {
        await emailService.sendDisputeCreated(
          dispute.againstUser.email,
          dispute.againstUser.firstName,
          dispute.raisedByUser.firstName + ' ' + dispute.raisedByUser.lastName,
          dispute.title,
          dispute.description,
          dispute.id,
          dispute.project?.title || 'N/A'
        );
      } catch (emailError) {
        logger.error('Failed to send dispute created email:', emailError);
      }

      // Create notification for the other party
      await prisma.notification.create({
        data: {
          userId: againstUser,
          title: 'New Dispute Raised',
          message: `A dispute has been raised against you: ${title}`,
          type: 'SYSTEM',
          data: {
            disputeId: dispute.id,
            projectId,
            raisedBy: userId
          }
        }
      });

      res.status(201).json({ success: true, data: dispute });
    } catch (error) {
      next(error);
    }
  }

  async respondToDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;
      const { message, attachments } = req.body;

      const dispute = await prisma.dispute.findUnique({
        where: { id },
        include: {
          raisedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          againstUser: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      });

      if (!dispute) {
        throw ApiError.notFound('Dispute not found');
      }

      if (dispute.raisedBy !== userId && dispute.againstUserId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      const response = await prisma.disputeResponse.create({
        data: {
          disputeId: id,
          responderId: userId,
          message,
          attachments: attachments || []
        },
        include: {
          responder: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          }
        }
      });

      // Send dispute response email
      const otherUserId = dispute.raisedBy === userId ? dispute.againstUserId : dispute.raisedBy;
      const otherUser = dispute.raisedBy === userId ? dispute.againstUser : dispute.raisedByUser;
      
      try {
        await emailService.sendDisputeResponse(
          otherUser.email,
          otherUser.firstName,
          response.responder.firstName + ' ' + response.responder.lastName,
          dispute.title,
          message,
          dispute.id
        );
      } catch (emailError) {
        logger.error('Failed to send dispute response email:', emailError);
      }

      // Notify the other party
      await prisma.notification.create({
        data: {
          userId: otherUserId,
          title: 'New Dispute Response',
          message: `New response added to dispute: ${dispute.title}`,
          type: 'SYSTEM',
          data: {
            disputeId: id,
            responseId: response.id
          }
        }
      });

      res.status(201).json({ success: true, data: response });
    } catch (error) {
      next(error);
    }
  }

  async resolveDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;
      const { resolution } = req.body;

      // Only admins can resolve disputes for now
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
        throw ApiError.forbidden('Only admins can resolve disputes');
      }

      const dispute = await prisma.dispute.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution,
          resolvedBy: userId,
          resolvedAt: new Date()
        }
      });

      // Notify both parties
      await Promise.all([
        prisma.notification.create({
          data: {
            userId: dispute.raisedBy,
            title: 'Dispute Resolved',
            message: `Your dispute has been resolved: ${dispute.title}`,
            type: 'SYSTEM',
            data: { disputeId: id, resolution }
          }
        }),
        prisma.notification.create({
          data: {
            userId: dispute.againstUserId,
            title: 'Dispute Resolved',
            message: `A dispute against you has been resolved: ${dispute.title}`,
            type: 'SYSTEM',
            data: { disputeId: id, resolution }
          }
        })
      ]);

      res.json({ success: true, data: dispute });
    } catch (error) {
      next(error);
    }
  }
}