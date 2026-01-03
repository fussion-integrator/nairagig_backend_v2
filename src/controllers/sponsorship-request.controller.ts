import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createSponsorshipRequestSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  businessEmail: z.string().email('Invalid email address'),
  businessPhone: z.string().optional(),
  businessWebsite: z.string().url().optional().or(z.literal('')),
  businessCategory: z.string().min(1, 'Business category is required'),
  businessSize: z.string().min(1, 'Business size is required'),
  requestType: z.enum(['BRAND_PARTNERSHIP', 'EVENT_SPONSORSHIP', 'CONTENT_COLLABORATION', 'PLATFORM_ADVERTISING', 'TALENT_ACQUISITION', 'COMMUNITY_BUILDING']),
  sponsorshipGoals: z.string().min(20, 'Please provide detailed sponsorship goals (minimum 20 characters)'),
  targetAudience: z.string().optional(),
  budgetRange: z.string().optional(),
  preferredDuration: z.string().optional(),
  additionalInfo: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string()
  })).default([])
});

export class SponsorshipRequestController {
  async checkSponsorshipStatus(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user has an active subscription (Professional or higher)
      const subscription = await prisma.subscription.findFirst({
        where: { 
          userId,
          status: 'ACTIVE'
        },
        include: { plan: true }
      });

      const currentPlan = subscription?.plan?.name || 'free';
      const canAccessSponsorship = ['pro', 'enterprise'].includes(currentPlan);

      if (!canAccessSponsorship) {
        return res.json({
          canSubmit: false,
          reason: 'subscription_required',
          message: 'You need to upgrade to a Professional plan or higher to submit sponsorship requests'
        });
      }

      // Check for existing pending request
      const existingRequest = await prisma.sponsorshipRequest.findFirst({
        where: {
          userId,
          status: { in: ['PENDING', 'UNDER_REVIEW'] }
        }
      });

      if (existingRequest) {
        return res.json({
          canSubmit: false,
          reason: 'pending_request',
          message: 'You already have a pending sponsorship request. Please wait for review.',
          pendingRequest: {
            id: existingRequest.id,
            businessName: existingRequest.businessName,
            requestType: existingRequest.requestType,
            status: existingRequest.status,
            priority: existingRequest.priority,
            sponsorshipGoals: existingRequest.sponsorshipGoals,
            budgetRange: existingRequest.budgetRange,
            createdAt: existingRequest.createdAt,
            updatedAt: existingRequest.updatedAt
          }
        });
      }

      res.json({
        canSubmit: true,
        message: 'You can submit a sponsorship request'
      });
    } catch (error) {
      console.error('Check sponsorship status error:', error);
      res.status(500).json({ error: 'Failed to check sponsorship status' });
    }
  }

  async createRequest(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const validatedData = createSponsorshipRequestSchema.parse(req.body);

      // Check if user has an active subscription (Professional or higher)
      const subscription = await prisma.subscription.findFirst({
        where: { 
          userId,
          status: 'ACTIVE'
        },
        include: { plan: true }
      });

      // Check if user can access sponsorship features
      const currentPlan = subscription?.plan?.name || 'free';
      const canAccessSponsorship = ['pro', 'enterprise'].includes(currentPlan);

      if (!canAccessSponsorship) {
        return res.status(403).json({ 
          error: 'Professional subscription required',
          message: 'You need to upgrade to a Professional plan or higher to submit sponsorship requests'
        });
      }

      // Check for existing pending request
      const existingRequest = await prisma.sponsorshipRequest.findFirst({
        where: {
          userId,
          status: { in: ['PENDING', 'UNDER_REVIEW'] }
        }
      });

      if (existingRequest) {
        return res.status(400).json({
          error: 'Existing request pending',
          message: 'You already have a pending sponsorship request. Please wait for review.',
          hasPendingRequest: true
        });
      }

      const sponsorshipRequest = await prisma.sponsorshipRequest.create({
        data: {
          userId,
          ...validatedData,
          businessWebsite: validatedData.businessWebsite || null,
          priority: 'MEDIUM'
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              subscriptionTier: true
            }
          }
        }
      });

      res.status(201).json({
        message: 'Sponsorship request submitted successfully',
        data: sponsorshipRequest
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }

      console.error('Create sponsorship request error:', error);
      res.status(500).json({ error: 'Failed to submit sponsorship request' });
    }
  }

  async getUserRequests(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const requests = await prisma.sponsorshipRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          businessName: true,
          requestType: true,
          status: true,
          priority: true,
          budgetRange: true,
          preferredDuration: true,
          adminNotes: true,
          reviewedAt: true,
          approvedAmount: true,
          approvedDuration: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true
        }
      });

      res.json({ data: requests });
    } catch (error) {
      console.error('Get user requests error:', error);
      res.status(500).json({ error: 'Failed to fetch sponsorship requests' });
    }
  }

  async getRequestById(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const request = await prisma.sponsorshipRequest.findFirst({
        where: {
          id,
          userId
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              subscriptionTier: true
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

  async cancelRequest(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const request = await prisma.sponsorshipRequest.findFirst({
        where: {
          id,
          userId,
          status: { in: ['PENDING', 'UNDER_REVIEW'] }
        }
      });

      if (!request) {
        return res.status(404).json({ 
          error: 'Request not found or cannot be cancelled' 
        });
      }

      const updatedRequest = await prisma.sponsorshipRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date()
        }
      });

      res.json({
        message: 'Sponsorship request cancelled successfully',
        data: updatedRequest
      });
    } catch (error) {
      console.error('Cancel request error:', error);
      res.status(500).json({ error: 'Failed to cancel sponsorship request' });
    }
  }
}