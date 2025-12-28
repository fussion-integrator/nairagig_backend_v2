import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';

export class ReviewController {
  async getReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 10, type = 'received' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = type === 'received' 
        ? { revieweeId: userId }
        : { reviewerId: userId };

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            reviewer: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            reviewee: {
              select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
            },
            project: {
              select: { id: true, title: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.review.count({ where })
      ]);

      const formattedReviews = reviews.map(review => ({
        id: review.id,
        projectTitle: review.project?.title || 'Direct Review',
        client: type === 'received' 
          ? `${review.reviewer.firstName} ${review.reviewer.lastName}`
          : `${review.reviewee.firstName} ${review.reviewee.lastName}`,
        rating: review.overallRating,
        date: review.createdAt.toISOString().split('T')[0],
        comment: review.comment,
        helpful: Math.floor(Math.random() * 20), // Mock helpful count
        reply: review.response,
        qualityRating: review.qualityRating,
        communicationRating: review.communicationRating,
        timelinessRating: review.timelinessRating,
        title: review.title
      }));

      res.json({
        success: true,
        data: formattedReviews,
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

  async getReview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const review = await prisma.review.findUnique({
        where: { id },
        include: {
          reviewer: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          },
          reviewee: {
            select: { id: true, firstName: true, lastName: true, profileImageUrl: true }
          },
          project: true
        }
      });

      if (!review) {
        throw ApiError.notFound('Review not found');
      }

      if (review.reviewerId !== userId && review.revieweeId !== userId) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({ success: true, data: review });
    } catch (error) {
      next(error);
    }
  }

  async createReview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const {
        revieweeId,
        projectId,
        overallRating,
        qualityRating,
        communicationRating,
        timelinessRating,
        comment,
        title,
        reviewType
      } = req.body;

      // Check if review already exists for this project and reviewer-reviewee pair
      if (projectId) {
        const existingReview = await prisma.review.findUnique({
          where: {
            projectId_reviewerId_revieweeId: {
              projectId,
              reviewerId: userId,
              revieweeId
            }
          }
        });

        if (existingReview) {
          throw ApiError.badRequest('Review already exists for this project');
        }
      }

      const review = await prisma.review.create({
        data: {
          reviewerId: userId,
          revieweeId,
          projectId,
          overallRating,
          qualityRating,
          communicationRating,
          timelinessRating,
          comment,
          title,
          reviewType: reviewType || 'CLIENT_TO_FREELANCER'
        },
        include: {
          reviewer: {
            select: { id: true, firstName: true, lastName: true }
          },
          reviewee: {
            select: { id: true, firstName: true, lastName: true }
          },
          project: {
            select: { id: true, title: true }
          }
        }
      });

      // Update reviewee's reputation score
      const reviews = await prisma.review.findMany({
        where: { revieweeId },
        select: { overallRating: true }
      });

      const averageRating = reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length;
      
      await prisma.user.update({
        where: { id: revieweeId },
        data: { reputationScore: averageRating }
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId: revieweeId,
          title: 'New Review Received',
          message: `You received a ${overallRating}-star review`,
          type: 'SYSTEM',
          data: {
            reviewId: review.id,
            rating: overallRating,
            projectId
          }
        }
      });

      res.status(201).json({ success: true, data: review });
    } catch (error) {
      next(error);
    }
  }

  async replyToReview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;
      const { response } = req.body;

      const review = await prisma.review.findUnique({
        where: { id }
      });

      if (!review) {
        throw ApiError.notFound('Review not found');
      }

      if (review.revieweeId !== userId) {
        throw ApiError.forbidden('Only the reviewee can reply to reviews');
      }

      if (review.response) {
        throw ApiError.badRequest('Review already has a response');
      }

      const updatedReview = await prisma.review.update({
        where: { id },
        data: {
          response,
          respondedAt: new Date()
        }
      });

      res.json({ success: true, data: updatedReview });
    } catch (error) {
      next(error);
    }
  }

  async getReviewStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;

      const [receivedReviews, givenReviews] = await Promise.all([
        prisma.review.findMany({
          where: { revieweeId: userId },
          select: { overallRating: true }
        }),
        prisma.review.findMany({
          where: { reviewerId: userId },
          select: { overallRating: true }
        })
      ]);

      const averageRating = receivedReviews.length > 0
        ? receivedReviews.reduce((sum, r) => sum + r.overallRating, 0) / receivedReviews.length
        : 0;

      const fiveStarCount = receivedReviews.filter(r => r.overallRating === 5).length;

      const stats = {
        averageRating: parseFloat(averageRating.toFixed(1)),
        totalReviews: receivedReviews.length,
        fiveStarReviews: fiveStarCount,
        reviewsGiven: givenReviews.length
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
}