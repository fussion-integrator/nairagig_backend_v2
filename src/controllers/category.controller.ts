import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class CategoryController {
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, limit = 100, active = true } = req.query;
      
      const where: any = {};
      if (active === 'true') where.isActive = true;
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const categories = await prisma.category.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          isActive: true
        },
        orderBy: { name: 'asc' },
        take: Number(limit)
      });

      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await prisma.category.findUnique({
        where: { id: req.params.id },
        include: {
          _count: { select: { jobs: true } }
        }
      });

      if (!category) {
        throw ApiError.notFound('Category not found');
      }

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }
}