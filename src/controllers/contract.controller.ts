import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class ContractController {
  async getContracts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        OR: [
          { clientId: userId },
          { freelancerId: userId }
        ]
      };
      if (status && status !== 'all') where.status = status.toString().toUpperCase();

      const [contracts, total] = await Promise.all([
        prisma.contract.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            project: {
              select: { id: true, title: true, progressPercentage: true }
            },
            client: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            freelancer: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.contract.count({ where })
      ]);

      const formattedContracts = contracts.map(contract => ({
        id: contract.id,
        projectTitle: contract.project.title,
        client: `${contract.client.firstName} ${contract.client.lastName}`,
        amount: `₦${contract.amount.toLocaleString()}`,
        status: contract.status.toLowerCase(),
        startDate: contract.startDate.toISOString().split('T')[0],
        endDate: contract.endDate?.toISOString().split('T')[0],
        progress: contract.project.progressPercentage || 0,
        terms: contract.terms,
        milestones: contract.milestones,
        isClient: contract.clientId === userId
      }));

      res.json({
        success: true,
        data: formattedContracts,
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

  async getContract(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: {
          project: true,
          client: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          },
          freelancer: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          }
        }
      });

      if (!contract) {
        throw ApiError.notFound('Contract not found');
      }

      if (contract.clientId !== userId && contract.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  async createContract(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const {
        projectId,
        jobId,
        freelancerId,
        title,
        description,
        terms,
        amount,
        paymentSchedule,
        startDate,
        endDate,
        deliverables,
        milestones
      } = req.body;

      // Verify project ownership
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!project) {
        throw ApiError.notFound('Project not found');
      }

      if (project.clientId !== userId) {
        throw ApiError.forbidden('Only project owner can create contracts');
      }

      const contract = await prisma.contract.create({
        data: {
          projectId,
          jobId,
          clientId: userId,
          freelancerId,
          title,
          description,
          terms,
          amount,
          paymentSchedule: paymentSchedule || 'MILESTONE',
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          deliverables: deliverables || [],
          milestones: milestones || []
        },
        include: {
          project: true,
          client: {
            select: { id: true, firstName: true, lastName: true }
          },
          freelancer: {
            select: { id: true, firstName: true, lastName: true }
          }
        }
      });

      res.status(201).json({ success: true, data: contract });
    } catch (error) {
      next(error);
    }
  }

  async signContract(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const contract = await prisma.contract.findUnique({
        where: { id }
      });

      if (!contract) {
        throw ApiError.notFound('Contract not found');
      }

      if (contract.clientId !== userId && contract.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      const isClient = contract.clientId === userId;
      const updateData: any = {};

      if (isClient) {
        updateData.signedByClient = true;
        updateData.clientSignedAt = new Date();
      } else {
        updateData.signedByFreelancer = true;
        updateData.freelancerSignedAt = new Date();
      }

      const updatedContract = await prisma.contract.update({
        where: { id },
        data: updateData
      });

      res.json({ success: true, data: updatedContract });
    } catch (error) {
      next(error);
    }
  }
}