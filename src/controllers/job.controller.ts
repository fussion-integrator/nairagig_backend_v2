import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class JobController {
  async getJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
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

      // Check application status for each job if user is authenticated
      let jobsWithApplicationStatus = jobs;
      if (userId) {
        const userApplications = await prisma.jobApplication.findMany({
          where: {
            freelancerId: userId,
            jobId: { in: jobs.map(job => job.id) }
          },
          select: { jobId: true, status: true }
        });

        const applicationMap = new Map(userApplications.map(app => [app.jobId, app.status]));
        
        jobsWithApplicationStatus = jobs.map(job => ({
          ...job,
          hasApplied: applicationMap.has(job.id),
          userApplicationStatus: applicationMap.get(job.id) || null
        }));
      }

      res.json({
        success: true,
        data: {
          jobs: jobsWithApplicationStatus,
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
      const userId = (req.user as any)?.id;
      
      const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true, reputationScore: true, bio: true } },
          category: true,
          applications: {
            include: {
              freelancer: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true, reputationScore: true } }
            }
          },
          _count: { select: { applications: true } }
        }
      });

      if (!job) {
        throw ApiError.notFound('Job not found');
      }

      // Check if current user has applied
      let userApplication = null;
      if (userId) {
        userApplication = await prisma.jobApplication.findUnique({
          where: { jobId_freelancerId: { jobId: job.id, freelancerId: userId } }
        });
      }

      await prisma.job.update({
        where: { id: req.params.id },
        data: { viewCount: { increment: 1 } }
      });

      const jobWithApplicationStatus = {
        ...job,
        hasApplied: !!userApplication,
        userApplicationStatus: userApplication?.status || null
      };

      res.json({ success: true, data: jobWithApplicationStatus });
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
          coreFeatures: coreFeatures || [],
          timeline: timeline || [],
          referenceLinks: referenceLinks || [],
          managedByNairagig: req.body.managedByNairagig || false,
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

      const { 
        categoryId, requiredSkills, experienceLevel, budgetType, visibility,
        coreFeatures, timeline, referenceLinks, attachments,
        ...validJobData 
      } = req.body;
      
      // Apply same enum mappings as createJob
      const experienceLevelMap: {[key: string]: string} = {
        'entry': 'ENTRY',
        'intermediate': 'INTERMEDIATE', 
        'expert': 'EXPERT'
      };
      
      const budgetTypeMap: {[key: string]: string} = {
        'fixed': 'FIXED',
        'hourly': 'HOURLY'
      };
      
      const visibilityMap: {[key: string]: string} = {
        'PUBLIC': 'PUBLIC',
        'PRIVATE': 'PRIVATE',
        'FEATURED': 'FEATURED'
      };
      
      // Process attachments
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

      const updatedJob = await prisma.job.update({
        where: { id: req.params.id },
        data: {
          ...validJobData,
          categoryId,
          requiredSkills: requiredSkills || [],
          experienceLevel: experienceLevelMap[experienceLevel] || experienceLevel,
          budgetType: budgetTypeMap[budgetType] || budgetType,
          visibility: visibilityMap[visibility] || visibility,
          attachments: processedAttachments,
          coreFeatures: coreFeatures || [],
          timeline: timeline || [],
          referenceLinks: referenceLinks || [],
          managedByNairagig: req.body.managedByNairagig || false
        },
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
      const { id: jobId } = req.params;
      const { coverLetter, proposedBudget, proposedTimeline, attachments } = req.body;

      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      // Check if job exists and is open
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) {
        throw ApiError.notFound('Job not found');
      }
      if (job.status !== 'OPEN') {
        throw ApiError.badRequest('Job is not accepting applications');
      }

      // Check if user already applied
      const existingApplication = await prisma.jobApplication.findUnique({
        where: { jobId_freelancerId: { jobId, freelancerId: userId } }
      });

      if (existingApplication) {
        throw ApiError.badRequest('Already applied to this job');
      }

      // Convert proposedTimeline to number if it's a string
      let timelineValue = null;
      if (proposedTimeline) {
        if (typeof proposedTimeline === 'string') {
          // Extract numbers from string (e.g., "2 weeks" -> 2)
          const match = proposedTimeline.match(/\d+/);
          timelineValue = match ? parseInt(match[0]) : null;
        } else if (typeof proposedTimeline === 'number') {
          timelineValue = proposedTimeline;
        }
      }

      const application = await prisma.jobApplication.create({
        data: {
          jobId,
          freelancerId: userId,
          coverLetter: coverLetter || '',
          proposedBudget: proposedBudget ? parseFloat(proposedBudget.toString()) : null,
          proposedTimeline: timelineValue,
          attachments: attachments || [],
          status: 'PENDING'
        },
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
        }
      });

      // Update job application count
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

  async awardJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { jobId, freelancerId } = req.body;

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');
      if (job.awardedTo) throw ApiError.badRequest('Job already awarded');

      // Award job and create project
      const [updatedJob, project] = await prisma.$transaction(async (tx) => {
        const awardedJob = await tx.job.update({
          where: { id: jobId },
          data: {
            awardedTo: freelancerId,
            awardedAt: new Date(),
            status: 'IN_PROGRESS'
          }
        });

        const newProject = await tx.project.create({
          data: {
            title: job.title,
            description: job.description,
            clientId: userId,
            freelancerId,
            jobId,
            agreedBudget: job.budgetMin || 0,
            status: 'ACTIVE'
          }
        });

        // Create project conversation
        await tx.conversation.create({
          data: {
            type: 'PROJECT',
            projectId: newProject.id,
            title: `Project: ${job.title}`,
            participants: {
              create: [
                { userId },
                { userId: freelancerId }
              ]
            }
          }
        });

        return [awardedJob, newProject];
      });

      res.json({ success: true, data: { job: updatedJob, project } });
    } catch (error) {
      next(error);
    }
  }
}