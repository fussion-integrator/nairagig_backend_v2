import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class JobController {
  async getJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, category, budgetMin, budgetMax, experienceLevel, status = 'OPEN' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { status };
      if (category) where.categoryId = category;
      if (experienceLevel) where.experienceLevel = experienceLevel;
      if (budgetMin || budgetMax) {
        where.OR = [
          { budgetType: 'FIXED', budgetMin: { gte: Number(budgetMin), lte: Number(budgetMax) } },
          { budgetType: 'HOURLY', budgetMin: { gte: Number(budgetMin), lte: Number(budgetMax) } }
        ];
      }

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            client: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
            category: true,
            _count: { select: { applications: true } }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.job.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          jobs,
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

  async getJob(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true, reputationScore: true } },
          category: true,
          applications: {
            include: {
              freelancer: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true, reputationScore: true } }
            }
          }
        }
      });

      if (!job) {
        throw ApiError.notFound('Job not found');
      }

      await prisma.job.update({
        where: { id: req.params.id },
        data: { viewCount: { increment: 1 } }
      });

      res.json({ success: true, data: job });
    } catch (error) {
      next(error);
    }
  }

  async createJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const { 
        categoryId, requiredSkills, experienceLevel, budgetType, visibility,
        projectDuration, jobType, coreFeatures, deliverables, timeline, 
        referenceLinks, managedByNairagig, hourlyRate, location, attachments,
        ...validJobData 
      } = req.body;
      
      // Map experienceLevel to database enum
      const experienceLevelMap: {[key: string]: string} = {
        'entry': 'ENTRY',
        'intermediate': 'INTERMEDIATE', 
        'expert': 'EXPERT'
      };
      
      // Map budgetType to database enum
      const budgetTypeMap: {[key: string]: string} = {
        'fixed': 'FIXED',
        'hourly': 'HOURLY'
      };
      
      // Map visibility to database enum
      const visibilityMap: {[key: string]: string} = {
        'PUBLIC': 'PUBLIC',
        'PRIVATE': 'PRIVATE',
        'FEATURED': 'FEATURED'
      };
      
      // Process attachments - ensure proper format
      let processedAttachments = [];
      if (attachments) {
        if (Array.isArray(attachments)) {
          processedAttachments = attachments.map(att => {
            if (typeof att === 'string') {
              return { name: att, size: 0, type: 'unknown' };
            }
            return {
              id: att.id || null,
              name: att.name || 'Unknown',
              size: att.size || 0,
              type: att.type || 'unknown',
              url: att.url || null
            };
          });
        }
      }
      
      const job = await prisma.job.create({
        data: {
          ...validJobData,
          categoryId,
          requiredSkills: requiredSkills || [],
          experienceLevel: experienceLevelMap[experienceLevel] || 'INTERMEDIATE',
          budgetType: budgetTypeMap[budgetType] || 'FIXED',
          visibility: visibilityMap[visibility] || 'PUBLIC',
          attachments: processedAttachments,
          status: validJobData.status || 'OPEN', // Default to OPEN if not specified
          clientId: userId
        },
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          category: true
        }
      });

      logger.info(`Job created: ${job.id} by user: ${userId}`);
      res.status(201).json({ success: true, data: job });
    } catch (error) {
      next(error);
    }
  }

  async updateJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });

      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');

      const updatedJob = await prisma.job.update({
        where: { id: req.params.id },
        data: req.body,
        include: { client: true, category: true }
      });

      res.json({ success: true, data: updatedJob });
    } catch (error) {
      next(error);
    }
  }

  async applyToJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { jobId } = req.params;
      const { coverLetter, proposedBudget, proposedTimeline } = req.body;

      const existingApplication = await prisma.jobApplication.findUnique({
        where: { jobId_freelancerId: { jobId, freelancerId: userId } }
      });

      if (existingApplication) {
        throw ApiError.badRequest('Already applied to this job');
      }

      const application = await prisma.jobApplication.create({
        data: {
          jobId,
          freelancerId: userId,
          coverLetter,
          proposedBudget,
          proposedTimeline,
          status: 'PENDING'
        },
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
        }
      });

      await prisma.job.update({
        where: { id: jobId },
        data: { applicationCount: { increment: 1 } }
      });

      res.status(201).json({ success: true, data: application });
    } catch (error) {
      next(error);
    }
  }

  async getJobApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });

      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');

      const applications = await prisma.jobApplication.findMany({
        where: { jobId: req.params.id },
        include: {
          freelancer: { 
            select: { 
              id: true, 
              firstName: true, 
              lastName: true, 
              profileImageUrl: true, 
              reputationScore: true,
              skills: true
            } 
          }
        },
        orderBy: { submittedAt: 'desc' }
      });

      res.json({ success: true, data: applications });
    } catch (error) {
      next(error);
    }
  }

  async updateApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { jobId, applicationId } = req.params;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');

      const application = await prisma.jobApplication.update({
        where: { id: applicationId },
        data: req.body,
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true } }
        }
      });

      res.json({ success: true, data: application });
    } catch (error) {
      next(error);
    }
  }

  async askQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { jobId } = req.params;
      const { question } = req.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw ApiError.notFound('Job not found');
      if (!job.allowQuestions) throw ApiError.badRequest('Questions not allowed for this job');

      const jobQuestion = await prisma.jobQuestion.create({
        data: {
          jobId,
          freelancerId: userId,
          question
        },
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true } }
        }
      });

      res.status(201).json({ success: true, data: jobQuestion });
    } catch (error) {
      next(error);
    }
  }

  async getJobQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { jobId } = req.params;

      const questions = await prisma.jobQuestion.findMany({
        where: { jobId, isPublic: true },
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: questions });
    } catch (error) {
      next(error);
    }
  }

  async getMyJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const { page = 1, limit = 10, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { clientId: userId };
      if (status) where.status = status;

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            category: true,
            _count: { select: { applications: true } }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.job.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          jobs,
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

  async deleteJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });

      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');

      await prisma.job.delete({ where: { id: req.params.id } });
      res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async answerQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { questionId } = req.params;
      const { answer } = req.body;

      const question = await prisma.jobQuestion.findUnique({
        where: { id: questionId },
        include: { job: true }
      });

      if (!question) throw ApiError.notFound('Question not found');
      if (question.job.clientId !== userId) throw ApiError.forbidden('Access denied');

      const updatedQuestion = await prisma.jobQuestion.update({
        where: { id: questionId },
        data: {
          answer,
          isAnswered: true,
          answeredAt: new Date()
        },
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true } }
        }
      });

      res.json({ success: true, data: updatedQuestion });
    } catch (error) {
      next(error);
    }
  }
}