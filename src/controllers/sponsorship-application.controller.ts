import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { paystackService } from '@/services/paystack.service';
import { ApiError } from '@/utils/ApiError';
import { config } from '@/config/config';

export class SponsorshipApplicationController {
  async applyForSponsorship(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const { tierId, fullName, email, reason, attachments, voiceNote } = req.body;

      const tier = await prisma.sponsorshipTier.findUnique({
        where: { name: tierId } // Look up by name instead of id
      });

      if (!tier) {
        throw ApiError.notFound('Sponsorship tier not found');
      }

      const application = await prisma.sponsorshipApplication.create({
        data: {
          userId,
          tierId: tier.id,
          fullName,
          email,
          reason,
          attachments: attachments || [],
          voiceNote
        },
        include: {
          tier: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      });

      // Initialize payment if tier has a price
      if (tier.price > 0) {
        const reference = paystackService.generateReference();
        const amountInKobo = paystackService.convertToKobo(tier.price);

        const paystackResponse = await paystackService.initializeTransaction({
          email,
          amount: amountInKobo,
          reference,
          callback_url: `${config.frontendUrl}/sponsorship/payment-callback`,
          metadata: {
            applicationId: application.id,
            userId,
            tierName: tier.name
          }
        });

        // Create transaction record
        await prisma.transaction.create({
          data: {
            userId,
            amount: tier.price,
            type: 'PAYMENT',
            status: 'PENDING',
            description: `Sponsorship payment for ${tier.displayName}`,
            referenceId: reference,
            gatewayProvider: 'PAYSTACK',
            metadata: {
              applicationId: application.id,
              tierName: tier.name
            }
          }
        });

        return res.status(201).json({
          success: true,
          data: {
            application,
            payment: {
              reference,
              authorizationUrl: paystackResponse.data.authorization_url,
              accessCode: paystackResponse.data.access_code
            }
          }
        });
      }

      res.status(201).json({
        success: true,
        data: { application }
      });
    } catch (error) {
      next(error);
    }
  }

  async getApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (status) where.status = status;

      const [applications, total] = await Promise.all([
        prisma.sponsorshipApplication.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            tier: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.sponsorshipApplication.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          applications,
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

  async updateApplicationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const application = await prisma.sponsorshipApplication.update({
        where: { id },
        data: { status },
        include: {
          tier: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      });

      // If approved, update user's subscription tier
      if (status === 'APPROVED') {
        await prisma.user.update({
          where: { id: application.userId },
          data: { subscriptionTier: application.tier.name }
        });
      }

      res.json({
        success: true,
        data: application
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { reference } = req.params;

      const paystackResponse = await paystackService.verifyTransaction(reference);
      
      if (!paystackResponse.status || paystackResponse.data.status !== 'success') {
        throw ApiError.badRequest('Payment verification failed');
      }

      // Update transaction
      const transaction = await prisma.transaction.update({
        where: { referenceId: reference },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          gatewayResponse: paystackResponse.data
        }
      });

      // Auto-approve application for paid tiers
      const applicationId = (transaction.metadata as any)?.applicationId;
      if (applicationId) {
        const application = await prisma.sponsorshipApplication.update({
          where: { id: applicationId },
          data: { status: 'APPROVED' },
          include: { tier: true }
        });

        // Update user tier
        await prisma.user.update({
          where: { id: transaction.userId },
          data: { subscriptionTier: application.tier.name }
        });
      }

      res.json({
        success: true,
        data: { transaction, paymentStatus: 'success' }
      });
    } catch (error) {
      next(error);
    }
  }
}