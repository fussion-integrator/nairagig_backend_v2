import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class FacebookAmbassadorController {
  async getAmbassadorChallenge(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const posts = await prisma.facebookPost.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      const milestones = await prisma.facebookMilestone.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      const totalReactions = posts.reduce((sum, post) => sum + post.reactions, 0);
      const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);
      const totalEarnings = milestones
        .filter(m => m.status === 'APPROVED')
        .reduce((sum, m) => sum + Number(m.amount), 0);
      const pendingEarnings = milestones
        .filter(m => m.status === 'PENDING')
        .reduce((sum, m) => sum + Number(m.amount), 0);

      res.json({
        success: true,
        data: {
          stats: {
            totalPosts: posts.length,
            totalReactions,
            totalComments,
            totalEarnings,
            pendingEarnings,
            reactionMilestones: Math.floor(totalReactions / 100),
            commentMilestones: Math.floor(totalComments / 100)
          },
          posts: posts.map(post => ({
            id: post.id,
            url: post.url,
            reactions: post.reactions,
            comments: post.comments,
            status: post.status,
            submittedAt: post.createdAt,
            lastChecked: post.lastChecked
          })),
          milestones: milestones.map(milestone => ({
            id: milestone.id,
            type: milestone.type,
            amount: milestone.amount,
            status: milestone.status,
            createdAt: milestone.createdAt,
            approvedAt: milestone.approvedAt
          }))
        }
      });
    } catch (error) {
      console.error('Get Facebook ambassador challenge error:', error);
      res.status(500).json({ error: 'Failed to fetch ambassador challenge data' });
    }
  }

  async submitPost(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { url } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!url || !url.includes('facebook.com')) {
        return res.status(400).json({ error: 'Valid Facebook post URL required' });
      }

      const existingPost = await prisma.facebookPost.findFirst({
        where: { userId, url }
      });

      if (existingPost) {
        return res.status(400).json({ error: 'Post already submitted' });
      }

      const post = await prisma.facebookPost.create({
        data: {
          userId,
          url,
          reactions: 0,
          comments: 0,
          status: 'PENDING'
        }
      });

      res.json({
        success: true,
        data: { postId: post.id }
      });
    } catch (error) {
      console.error('Submit Facebook post error:', error);
      res.status(500).json({ error: 'Failed to submit post' });
    }
  }

  async requestMilestoneReview(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const posts = await prisma.facebookPost.findMany({
        where: { userId, status: 'APPROVED' }
      });

      const totalReactions = posts.reduce((sum, post) => sum + post.reactions, 0);
      const totalComments = posts.reduce((sum, post) => sum + post.comments, 0);

      const reactionMilestones = Math.floor(totalReactions / 100);
      const commentMilestones = Math.floor(totalComments / 100);

      const existingMilestones = await prisma.facebookMilestone.findMany({
        where: { userId }
      });

      const existingReactionMilestones = existingMilestones.filter(m => m.type === 'REACTIONS').length;
      const existingCommentMilestones = existingMilestones.filter(m => m.type === 'COMMENTS').length;

      const newMilestones = [];

      for (let i = existingReactionMilestones; i < reactionMilestones; i++) {
        newMilestones.push({
          userId,
          type: 'REACTIONS',
          amount: 500, // 5 naira per reaction * 100 reactions
          status: 'PENDING',
          metadata: { milestone: i + 1, reactions: (i + 1) * 100 }
        });
      }

      for (let i = existingCommentMilestones; i < commentMilestones; i++) {
        newMilestones.push({
          userId,
          type: 'COMMENTS',
          amount: 1000, // 10 naira per comment * 100 comments
          status: 'PENDING',
          metadata: { milestone: i + 1, comments: (i + 1) * 100 }
        });
      }

      if (newMilestones.length > 0) {
        await prisma.facebookMilestone.createMany({
          data: newMilestones
        });

        await prisma.notification.create({
          data: {
            userId: 'admin',
            title: 'Facebook Ambassador Milestone Review',
            message: `User has ${newMilestones.length} new milestones pending review`,
            type: 'SYSTEM',
            data: { userId, milestones: newMilestones.length }
          }
        });
      }

      res.json({
        success: true,
        data: { 
          newMilestones: newMilestones.length,
          totalEligible: reactionMilestones + commentMilestones
        }
      });
    } catch (error) {
      console.error('Request Facebook milestone review error:', error);
      res.status(500).json({ error: 'Failed to request milestone review' });
    }
  }

  async claimApprovedEarnings(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const approvedMilestones = await prisma.facebookMilestone.findMany({
        where: {
          userId,
          status: 'APPROVED',
          claimed: false
        }
      });

      if (approvedMilestones.length === 0) {
        return res.status(400).json({ error: 'No approved earnings to claim' });
      }

      const totalAmount = approvedMilestones.reduce((sum, m) => sum + Number(m.amount), 0);

      let wallet = await prisma.wallet.findFirst({
        where: { userId }
      });

      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId,
            availableBalance: 0,
            currency: 'NGN'
          }
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: wallet!.id },
          data: {
            availableBalance: { increment: totalAmount },
            totalEarned: { increment: totalAmount }
          }
        });

        await tx.facebookMilestone.updateMany({
          where: {
            id: { in: approvedMilestones.map(m => m.id) }
          },
          data: { claimed: true, claimedAt: new Date() }
        });

        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet!.id,
            amount: totalAmount,
            type: 'CREDIT',
            status: 'COMPLETED',
            description: `Facebook Ambassador earnings - ${approvedMilestones.length} milestones`,
            processedAt: new Date(),
            metadata: {
              type: 'facebook_ambassador_claim',
              milestones: approvedMilestones.length
            }
          }
        });
      });

      res.json({
        success: true,
        data: {
          claimedAmount: totalAmount,
          milestonesClaimed: approvedMilestones.length
        }
      });
    } catch (error) {
      console.error('Claim Facebook earnings error:', error);
      res.status(500).json({ error: 'Failed to claim earnings' });
    }
  }
}