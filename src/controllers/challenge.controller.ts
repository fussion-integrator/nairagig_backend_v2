import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class ChallengeController {
  async getChallenges(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, category, difficulty, status = 'ACTIVE', userOnly, participantStatus } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const userId = (req as any).user?.id;

      let where: any = {};
      
      // If userOnly is true, filter by user's participated challenges
      if (userOnly === 'true' && userId) {
        const participantWhere: any = { userId };
        
        // If participantStatus is WON, filter by winning submissions
        if (participantStatus === 'WON') {
          participantWhere.submissions = {
            some: { isWinner: true }
          };
        }
        
        where.participants = {
          some: participantWhere
        };
      } else {
        // Regular challenge filtering
        where.status = status;
        if (category) where.category = category;
        if (difficulty) where.difficultyLevel = difficulty;
      }

      const [challenges, total] = await Promise.all([
        prisma.challenge.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            creator: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
            sponsor: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
            _count: { select: { participants: true, submissions: true } }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.challenge.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          challenges,
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

  async getChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const challenge = await prisma.challenge.findUnique({
        where: { id: req.params.id },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          sponsor: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
            }
          },
          submissions: {
            include: {
              participant: {
                include: {
                  user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
                }
              }
            },
            orderBy: { totalScore: 'desc' }
          }
        }
      });

      if (!challenge) {
        throw ApiError.notFound('Challenge not found');
      }

      await prisma.challenge.update({
        where: { id: req.params.id },
        data: { viewCount: { increment: 1 } }
      });

      res.json({ success: true, data: challenge });
    } catch (error) {
      next(error);
    }
  }

  async createChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const challenge = await prisma.challenge.create({
        data: {
          ...req.body,
          createdBy: userId,
          status: 'DRAFT'
        },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } }
        }
      });

      logger.info(`Challenge created: ${challenge.id} by user: ${userId}`);
      res.status(201).json({ success: true, data: challenge });
    } catch (error) {
      next(error);
    }
  }

  async registerForChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { challengeId } = req.params;

      const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge) throw ApiError.notFound('Challenge not found');

      if (challenge.status !== 'REGISTRATION_OPEN') {
        throw ApiError.badRequest('Registration is not open for this challenge');
      }

      const existingParticipant = await prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } }
      });

      if (existingParticipant) {
        throw ApiError.badRequest('Already registered for this challenge');
      }

      const participant = await prisma.challengeParticipant.create({
        data: {
          challengeId,
          userId,
          status: 'REGISTERED'
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
        }
      });

      await prisma.challenge.update({
        where: { id: challengeId },
        data: { participantCount: { increment: 1 } }
      });

      res.status(201).json({ success: true, data: participant });
    } catch (error) {
      next(error);
    }
  }

  async submitSolution(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { challengeId } = req.params;
      const { title, description, submissionUrl, repositoryUrl, demoUrl } = req.body;

      const participant = await prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } }
      });

      if (!participant) {
        throw ApiError.badRequest('Must register for challenge first');
      }

      const submission = await prisma.challengeSubmission.create({
        data: {
          challengeId,
          participantId: participant.id,
          title,
          description,
          submissionUrl,
          repositoryUrl,
          demoUrl,
          status: 'SUBMITTED'
        }
      });

      await prisma.challenge.update({
        where: { id: challengeId },
        data: { submissionCount: { increment: 1 } }
      });

      res.status(201).json({ success: true, data: submission });
    } catch (error) {
      next(error);
    }
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;

      const submissions = await prisma.challengeSubmission.findMany({
        where: { challengeId },
        include: {
          participant: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
            }
          }
        },
        orderBy: [
          { totalScore: 'desc' },
          { submittedAt: 'asc' }
        ]
      });

      res.json({ success: true, data: submissions });
    } catch (error) {
      next(error);
    }
  }
}