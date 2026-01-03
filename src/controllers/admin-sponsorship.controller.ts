import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const reviewRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'ON_HOLD']),
  adminNotes: z.string().optional(),
  approvedAmount: z.number().positive().optional(),
  approvedDuration: z.string().optional(),
  rejectionReason: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  followUpDate: z.string().datetime().optional()
});

const updateRequestSchema = z.object({
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  adminNotes: z.string().optional(),
  followUpDate: z.string().datetime().optional()
});

export class AdminSponsorshipController {
  async getAllRequests(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        status,
        priority,
        requestType,
        businessCategory,
        search
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (requestType) where.requestType = requestType;
      if (businessCategory) where.businessCategory = businessCategory;
      
      if (search) {
        where.OR = [
          { businessName: { contains: search as string, mode: 'insensitive' } },
          { businessEmail: { contains: search as string, mode: 'insensitive' } },
          { sponsorshipGoals: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [requests, total] = await Promise.all([
        prisma.sponsorshipRequest.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' }
          ],
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                subscriptionTier: true,
                profileImageUrl: true
              }
            },
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.sponsorshipRequest.count({ where })
      ]);

      const totalPages = Math.ceil(total / limitNum);

      res.json({
        data: requests,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      });
    } catch (error) {
      console.error('Get all requests error:', error);
      res.status(500).json({ error: 'Failed to fetch sponsorship requests' });
    }
  }

  async getRequestById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const request = await prisma.sponsorshipRequest.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              subscriptionTier: true,
              profileImageUrl: true,
              bio: true,
              createdAt: true,
              lastLoginAt: true
            }
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Sponsorship request not found' });
      }

      res.json({ data: request });
    } catch (error) {
      console.error('Get request by ID error:', error);
      res.status(500).json({ error: 'Failed to fetch sponsorship request' });
    }
  }

  async reviewRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id;

      if (!adminId) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }

      const validatedData = reviewRequestSchema.parse(req.body);

      // Validate required fields based on status
      if (validatedData.status === 'REJECTED' && !validatedData.rejectionReason) {
        return res.status(400).json({
          error: 'Rejection reason is required when rejecting a request'
        });
      }

      if (validatedData.status === 'APPROVED' && !validatedData.approvedAmount) {
        return res.status(400).json({
          error: 'Approved amount is required when approving a request'
        });
      }

      const request = await prisma.sponsorshipRequest.findUnique({
        where: { id },
        include: { user: true }
      });

      if (!request) {
        return res.status(404).json({ error: 'Sponsorship request not found' });
      }

      if (request.status === 'APPROVED' || request.status === 'REJECTED') {
        return res.status(400).json({
          error: 'Request has already been reviewed'
        });
      }

      const updatedRequest = await prisma.sponsorshipRequest.update({
        where: { id },
        data: {
          status: validatedData.status,
          adminNotes: validatedData.adminNotes,
          approvedAmount: validatedData.approvedAmount,
          approvedDuration: validatedData.approvedDuration,
          rejectionReason: validatedData.rejectionReason,
          priority: validatedData.priority || request.priority,
          followUpDate: validatedData.followUpDate ? new Date(validatedData.followUpDate) : null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          reviewer: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Create notification for user
      await prisma.notification.create({
        data: {
          userId: request.userId,
          title: `Sponsorship Request ${validatedData.status}`,
          message: validatedData.status === 'APPROVED' 
            ? `Your sponsorship request for ${request.businessName} has been approved!`
            : validatedData.status === 'REJECTED'
            ? `Your sponsorship request for ${request.businessName} has been rejected.`
            : `Your sponsorship request for ${request.businessName} is on hold.`,
          type: 'SYSTEM',
          data: {
            requestId: id,
            status: validatedData.status,
            adminNotes: validatedData.adminNotes
          }
        }
      });

      res.json({
        message: `Sponsorship request ${validatedData.status.toLowerCase()} successfully`,
        data: updatedRequest
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }

      console.error('Review request error:', error);
      res.status(500).json({ error: 'Failed to review sponsorship request' });
    }
  }

  async updateRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validatedData = updateRequestSchema.parse(req.body);

      const updatedRequest = await prisma.sponsorshipRequest.update({
        where: { id },
        data: {
          ...validatedData,
          followUpDate: validatedData.followUpDate ? new Date(validatedData.followUpDate) : undefined,
          updatedAt: new Date()
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      res.json({
        message: 'Sponsorship request updated successfully',
        data: updatedRequest
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }

      console.error('Update request error:', error);
      res.status(500).json({ error: 'Failed to update sponsorship request' });
    }
  }

  async getRequestStats(req: Request, res: Response) {
    try {
      const [
        totalRequests,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        onHoldRequests,
        highPriorityRequests,
        recentRequests
      ] = await Promise.all([
        prisma.sponsorshipRequest.count(),
        prisma.sponsorshipRequest.count({ where: { status: 'PENDING' } }),
        prisma.sponsorshipRequest.count({ where: { status: 'APPROVED' } }),
        prisma.sponsorshipRequest.count({ where: { status: 'REJECTED' } }),
        prisma.sponsorshipRequest.count({ where: { status: 'ON_HOLD' } }),
        prisma.sponsorshipRequest.count({ where: { priority: 'HIGH' } }),
        prisma.sponsorshipRequest.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          }
        })
      ]);

      const requestsByType = await prisma.sponsorshipRequest.groupBy({
        by: ['requestType'],
        _count: { requestType: true }
      });

      const requestsByCategory = await prisma.sponsorshipRequest.groupBy({
        by: ['businessCategory'],
        _count: { businessCategory: true }
      });

      res.json({
        data: {
          overview: {
            total: totalRequests,
            pending: pendingRequests,
            approved: approvedRequests,
            rejected: rejectedRequests,
            onHold: onHoldRequests,
            highPriority: highPriorityRequests,
            recent: recentRequests
          },
          byType: requestsByType.map(item => ({
            type: item.requestType,
            count: item._count.requestType
          })),
          byCategory: requestsByCategory.map(item => ({
            category: item.businessCategory,
            count: item._count.businessCategory
          }))
        }
      });
    } catch (error) {
      console.error('Get request stats error:', error);
      res.status(500).json({ error: 'Failed to fetch sponsorship statistics' });
    }
  }
}