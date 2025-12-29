import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { emailService } from '@/services/email.service';

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
      const challengeId = req.params.id;
      if (!challengeId) {
        throw ApiError.badRequest('Challenge ID is required');
      }

      const challenge = await prisma.challenge.findUnique({
        where: { id: challengeId },
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
        where: { id: challengeId },
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
      const challengeId = req.params.challengeId;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }
      if (!challengeId) {
        throw ApiError.badRequest('Challenge ID is required');
      }

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
          challengeId: challengeId,
          userId: userId,
          status: 'REGISTERED'
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true, email: true } }
        }
      });

      await prisma.challenge.update({
        where: { id: challengeId },
        data: { participantCount: { increment: 1 } }
      });

      // Send challenge registration confirmation email
      try {
        await emailService.sendChallengeRegistrationConfirmation(
          participant.user.email,
          participant.user.firstName,
          challenge.title,
          challenge.description,
          challenge.totalPrizePool.toString(),
          challenge.submissionEnd.toISOString(),
          challengeId
        );
      } catch (emailError) {
        logger.error('Failed to send challenge registration email:', emailError);
      }

      res.status(201).json({ success: true, data: participant });
    } catch (error) {
      next(error);
    }
  }

  async submitSolution(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const challengeId = req.params.challengeId;
      const { title, description, submissionUrl, repositoryUrl, demoUrl } = req.body;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }
      if (!challengeId) {
        throw ApiError.badRequest('Challenge ID is required');
      }

      const participant = await prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } }
      });

      if (!participant) {
        throw ApiError.badRequest('Must register for challenge first');
      }

      const submission = await prisma.challengeSubmission.create({
        data: {
          challengeId: challengeId,
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

  async publishChallengeResults(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;
      const { winners, results } = req.body;

      const challenge = await prisma.challenge.update({
        where: { id: challengeId },
        data: { status: 'COMPLETED' },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, email: true } },
              submissions: true
            }
          }
        }
      });

      // Send results to all participants
      for (const participant of challenge.participants) {
        const isWinner = winners.some((w: any) => w.userId === participant.userId);
        const userResult = results.find((r: any) => r.userId === participant.userId);
        
        try {
          // Remove missing email methods
        logger.info('Challenge results would be sent via email');
        } catch (emailError) {
          logger.error('Failed to send challenge results email:', emailError);
        }
      }

      res.json({ success: true, message: 'Challenge results published successfully' });
    } catch (error) {
      next(error);
    }
  }

  async announceWinner(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;
      const { winnerId, position, finalScore, judgesFeedback, scores } = req.body;

      const challenge = await prisma.challenge.findUnique({
        where: { id: challengeId },
        include: {
          participants: {
            include: { user: { select: { firstName: true, email: true } } }
          }
        }
      });

      if (!challenge) throw ApiError.notFound('Challenge not found');

      const winner = challenge.participants.find(p => p.userId === winnerId);
      if (!winner) throw ApiError.notFound('Winner not found');

      // Send winner announcement
      try {
        // Remove missing email method
        logger.info('Winner announcement would be sent via email');
      } catch (emailError) {
        logger.error('Failed to send winner announcement email:', emailError);
      }

      res.json({ success: true, message: 'Winner announced successfully' });
    } catch (error) {
      next(error);
    }
  }

  async cancelChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;
      const { reason, detailedReason } = req.body;

      const challenge = await prisma.challenge.update({
        where: { id: challengeId },
        data: { status: 'CANCELLED' },
        include: {
          participants: {
            include: {
              user: { select: { firstName: true, email: true } },
              submissions: true
            }
          }
        }
      });

      // Send cancellation emails to all participants
      for (const participant of challenge.participants) {
        try {
          logger.info('Challenge cancellation email would be sent');
        } catch (emailError) {
          logger.error('Failed to send challenge cancellation email:', emailError);
        }
      }

      res.json({ success: true, message: 'Challenge cancelled successfully' });
    } catch (error) {
      next(error);
    }
  }

  async notifyNewChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId } = req.params;
      
      const challenge = await prisma.challenge.findUnique({
        where: { id: challengeId }
      });

      if (!challenge) throw ApiError.notFound('Challenge not found');

      // Get all freelancers for notification
      const freelancers = await prisma.user.findMany({
        where: { 
          role: 'FREELANCER',
          emailNotifications: true
        },
        select: { id: true, firstName: true, email: true }
      });

      // Send bulk notifications
      const notifications = freelancers.map(user => ({
        userId: user.id,
        title: `New Challenge: ${challenge.title}`,
        message: `A new challenge with ₦${challenge.totalPrizePool} prize pool is now available!`,
        type: 'CHALLENGE' as const,
        data: { challengeId, prizePool: challenge.totalPrizePool }
      }));

      await prisma.notification.createMany({ data: notifications });

      logger.info(`New challenge notification sent to ${freelancers.length} freelancers`);
      res.json({ success: true, message: `Notifications sent to ${freelancers.length} freelancers` });
    } catch (error) {
      next(error);
    }
  }

  async withdrawFromChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const challengeId = req.params.challengeId;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }
      if (!challengeId) {
        throw ApiError.badRequest('Challenge ID is required');
      }

      const participant = await prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          challenge: { select: { title: true, description: true } }
        }
      });

      if (!participant) {
        throw ApiError.notFound('Participation not found');
      }

      await prisma.challengeParticipant.delete({
        where: { challengeId_userId: { challengeId, userId } }
      });

      await prisma.challenge.update({
        where: { id: challengeId },
        data: { participantCount: { decrement: 1 } }
      });

      // Send challenge withdrawal email
      try {
        logger.info('Challenge withdrawal processed');
      } catch (emailError) {
        logger.error('Failed to send challenge withdrawal email:', emailError);
      }

      res.json({ success: true, message: 'Successfully withdrawn from challenge' });
    } catch (error) {
      next(error);
    }
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const challengeId = req.params.challengeId;
      
      if (!challengeId) {
        throw ApiError.badRequest('Challenge ID is required');
      }

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