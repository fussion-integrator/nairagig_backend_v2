import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class SponsorshipTierController {
  async getTiers(req: Request, res: Response, next: NextFunction) {
    try {
      const tiers = await prisma.sponsorshipTier.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' }
      });

      res.json({
        success: true,
        data: tiers
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