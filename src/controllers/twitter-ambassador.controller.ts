import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export class TwitterAmbassadorController {
  
  async getChallengeData(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;

      // Get challenge configuration
      const config = await prisma.systemChallengeConfig.findUnique({
        where: { challengeType: 'TWITTER' }
      });

      if (!config || !config.isActive) {
        return res.json({
          success: true,
          data: null
        });
      }

      // Get user-specific data if authenticated
      let userStats = {
        totalPosts: 0,
        totalReactions: 0,
        totalComments: 0,
        totalEarnings: 0,
        pendingEarnings: 0,
        reactionMilestones: 0,
        commentMilestones: 0
      };
      let userPosts = [];
      let userMilestones = [];

      if (userId) {
        userPosts = await prisma.twitterPost.findMany({
          where: { userId },
          select: {
            id: true,
            url: true,
            likes: true,
            replies: true,
            status: true,
            submittedAt: true,
            lastChecked: true
          },
          orderBy: { submittedAt: 'desc' }
        });

        userMilestones = await prisma.twitterMilestone.findMany({
          where: { userId },
          select: {
            id: true,
            type: true,
            amount: true,
            status: true,
            createdAt: true,
            approvedAt: true
          },
          orderBy: { createdAt: 'desc' }
        });

        userStats = {
          totalPosts: userPosts.length,
          totalReactions: userPosts.reduce((sum, post) => sum + (post.likes || 0), 0),
          totalComments: userPosts.reduce((sum, post) => sum + (post.replies || 0), 0),
          totalEarnings: userMilestones.filter(m => m.status === 'APPROVED').reduce((sum, m) => sum + m.amount, 0),
          pendingEarnings: userMilestones.filter(m => m.status === 'PENDING').reduce((sum, m) => sum + m.amount, 0),
          reactionMilestones: userMilestones.filter(m => m.type === 'LIKES').length,
          commentMilestones: userMilestones.filter(m => m.type === 'REPLIES').length
        };
      }

      res.json({
        success: true,
        data: {
          stats: userStats,
          posts: userPosts.map(post => ({
            ...post,
            reactions: post.likes,
            comments: post.replies
          })),
          milestones: userMilestones
        }
      });

    } catch (error) {
      logger.error('getChallengeData error:', error);
      next(error);
    }
  }

  async submitPost(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const { url } = req.body;

      if (!userId) {
        throw ApiError.unauthorized('Authentication required');
      }

      if (!url) {
        throw ApiError.badRequest('Post URL is required');
      }

      // Check if post already exists
      const existingPost = await prisma.twitterPost.findFirst({
        where: { url, userId }
      });

      if (existingPost) {
        throw ApiError.badRequest('Post already submitted');
      }

      const post = await prisma.twitterPost.create({
        data: {
          userId,
          url,
          status: 'PENDING'
        }
      });

      res.json({
        success: true,
        data: post
      });

    } catch (error) {
      logger.error('submitPost error:', error);
      next(error);
    }
  }

  async claimEarnings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw ApiError.unauthorized('Authentication required');
      }

      // Get approved milestones that haven't been claimed
      const approvedMilestones = await prisma.twitterMilestone.findMany({
        where: {
          userId,
          status: 'APPROVED',
          claimedAt: null
        }
      });

      if (approvedMilestones.length === 0) {
        throw ApiError.badRequest('No earnings available to claim');
      }

      const totalAmount = approvedMilestones.reduce((sum, m) => sum + m.amount, 0);

      // Mark milestones as claimed
      await prisma.twitterMilestone.updateMany({
        where: {
          id: { in: approvedMilestones.map(m => m.id) }
        },
        data: {
          claimedAt: new Date()
        }
      });

      res.json({
        success: true,
        data: {
          claimedAmount: totalAmount,
          milestoneCount: approvedMilestones.length
        }
      });

    } catch (error) {
      logger.error('claimEarnings error:', error);
      next(error);
    }
  }

  async requestReview(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw ApiError.unauthorized('Authentication required');
      }

      // Get pending posts that need review
      const pendingPosts = await prisma.twitterPost.findMany({
        where: {
          userId,
          status: 'PENDING'
        }
      });

      res.json({
        success: true,
        data: {
          newMilestones: pendingPosts.length,
          message: 'Review request submitted successfully'
        }
      });

    } catch (error) {
      logger.error('requestReview error:', error);
      next(error);
    }
  }
}