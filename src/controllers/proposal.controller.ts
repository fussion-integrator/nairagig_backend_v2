import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class ProposalController {
  async getProposals(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { freelancerId: userId };
      if (status && status !== 'all') where.status = status.toString().toUpperCase();

      const [proposals, total] = await Promise.all([
        prisma.jobApplication.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            job: {
              select: {
                id: true,
                title: true,
                budgetMin: true,
                budgetMax: true,
                budgetType: true,
                currency: true,
                status: true,
                client: {
                  select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
                }
              }
            }
          },
          orderBy: { submittedAt: 'desc' }
        }),
        prisma.jobApplication.count({ where })
      ]);

      const formattedProposals = proposals.map(proposal => ({
        id: proposal.id,
        projectTitle: proposal.job.title,
        client: `${proposal.job.client.firstName} ${proposal.job.client.lastName}`,
        amount: `₦${proposal.proposedBudget?.toLocaleString() || 'N/A'}`,
        status: proposal.status.toLowerCase(),
        sentDate: proposal.submittedAt.toISOString().split('T')[0],
        coverLetter: proposal.coverLetter,
        deliveryTime: proposal.proposedTimeline ? `${proposal.proposedTimeline} days` : 'Not specified',
        jobId: proposal.job.id,
        clientFeedback: proposal.clientFeedback,
        freelancerResponse: proposal.freelancerResponse
      }));

      res.json({
        success: true,
        data: formattedProposals,
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

  async getProposal(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const proposal = await prisma.jobApplication.findUnique({
        where: { id },
        include: {
          job: {
            include: {
              client: {
                select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
              }
            }
          }
        }
      });

      if (!proposal) {
        throw ApiError.notFound('Proposal not found');
      }

      if (proposal.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({ success: true, data: proposal });
    } catch (error) {
      next(error);
    }
  }

  async deleteProposal(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const proposal = await prisma.jobApplication.findUnique({
        where: { id }
      });

      if (!proposal) {
        throw ApiError.notFound('Proposal not found');
      }

      if (proposal.freelancerId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      if (proposal.status !== 'PENDING') {
        throw ApiError.badRequest('Can only delete pending proposals');
      }

      await prisma.jobApplication.delete({ where: { id } });

      res.json({ success: true, message: 'Proposal deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}