import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class SponsorshipTierController {
  async getTiers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      // Get subscription plans
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      });

      // Transform subscription plans to match sponsorship tier format
      const tiers = plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        price: plan.price,
        currency: plan.currency,
        benefits: plan.features,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt
      }));

      let userSubscription = null;
      let canAccessSponsorship = false;

      // Check user's current subscription if authenticated
      if (userId) {
        userSubscription = await prisma.subscription.findFirst({
          where: { 
            userId,
            status: 'ACTIVE'
          },
          include: { plan: true },
          orderBy: { createdAt: 'desc' }
        });

        // Check if user can access sponsorship features
        // Allow sponsorship for Pro and Enterprise plans
        const currentPlan = userSubscription?.plan?.name || 'free';
        canAccessSponsorship = ['pro', 'enterprise'].includes(currentPlan);
      }

      res.json({
        success: true,
        data: {
          tiers,
          userSubscription: userSubscription ? {
            planName: userSubscription.plan.name,
            planDisplayName: userSubscription.plan.displayName,
            status: userSubscription.status,
            currentPeriodEnd: userSubscription.currentPeriodEnd,
            canAccessSponsorship
          } : {
            planName: 'free',
            planDisplayName: 'Free',
            status: 'ACTIVE',
            canAccessSponsorship: false
          },
          canAccessSponsorship
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async createTier(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, displayName, price, benefits } = req.body;

      const tier = await prisma.sponsorshipTier.create({
        data: {
          name,
          displayName,
          price,
          benefits
        }
      });

      res.status(201).json({
        success: true,
        data: tier
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTier(req: Request, res: Response, next: NextFunction) {
    try {
      const tier = await prisma.sponsorshipTier.update({
        where: { id: req.params.id },
        data: req.body
      });

      res.json({
        success: true,
        data: tier
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteTier(req: Request, res: Response, next: NextFunction) {
    try {
      await prisma.sponsorshipTier.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      res.json({
        success: true,
        message: 'Tier deactivated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}