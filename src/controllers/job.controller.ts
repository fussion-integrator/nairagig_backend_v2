import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { notificationService } from '../services/notification.service';
import { emailService } from '@/services/email.service';
import { ExperienceLevel, BudgetType, JobVisibility, JobStatus } from '@prisma/client';

export class JobController {
  async getPublicJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, category, budgetMin, budgetMax, experienceLevel, status = 'OPEN' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { status, visibility: 'PUBLIC' };
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

      logger.info('Creating job with data:', {
        title: req.body.title,
        categoryId: req.body.categoryId,
        status: req.body.status,
        budgetType: req.body.budgetType,
        visibility: req.body.visibility,
        hasApplicationDeadline: !!req.body.applicationDeadline,
        coreFeatures: req.body.coreFeatures,
        deliverables: req.body.deliverables,
        timeline: req.body.timeline,
        requirements: req.body.requirements,
        requiredSkills: req.body.requiredSkills
      });

      // Validate required fields first
      if (!req.body.title) {
        throw ApiError.badRequest('Job title is required');
      }
      if (!req.body.description) {
        throw ApiError.badRequest('Job description is required');
      }
      if (!req.body.categoryId) {
        throw ApiError.badRequest('Category is required');
      }

      const { 
        categoryId, requiredSkills, experienceLevel, budgetType, visibility,
        estimatedDuration, durationType, coreFeatures, deliverables, timeline, 
        referenceLinks, managedByNairagig, hourlyRate, location, attachments,
        applicationDeadline,
        ...validJobData 
      } = req.body;
      
      // Process applicationDeadline - convert date string to DateTime
      let processedApplicationDeadline = undefined;
      if (applicationDeadline) {
        try {
          // If it's just a date string (YYYY-MM-DD), add time to make it a valid DateTime
          const dateStr = applicationDeadline.includes('T') ? applicationDeadline : `${applicationDeadline}T23:59:59.999Z`;
          processedApplicationDeadline = new Date(dateStr);
        } catch (error) {
          logger.warn('Invalid applicationDeadline format:', applicationDeadline);
        }
      }
      
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
        'public': 'PUBLIC',
        'private': 'PRIVATE', 
        'featured': 'FEATURED',
        'invite-only': 'PRIVATE'
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
      
      // Prepare job data with explicit field mapping
      const jobData = {
        title: validJobData.title,
        description: validJobData.description,
        categoryId,
        clientId: userId,
        requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
        experienceLevel: experienceLevelMap[experienceLevel] || 'INTERMEDIATE',
        budgetType: budgetTypeMap[budgetType] || 'FIXED',
        visibility: visibilityMap[visibility] || 'PUBLIC',
        attachments: processedAttachments,
        coreFeatures: Array.isArray(coreFeatures) ? coreFeatures : [],
        timeline: Array.isArray(timeline) ? timeline : [],
        referenceLinks: Array.isArray(referenceLinks) ? referenceLinks : [],
        managedByNairagig: Boolean(req.body.managedByNairagig),
        status: validJobData.status || 'OPEN',
        applicationDeadline: processedApplicationDeadline,
        budgetMin: validJobData.budgetMin ? Number(validJobData.budgetMin) : null,
        budgetMax: validJobData.budgetMax ? Number(validJobData.budgetMax) : null,
        allowQuestions: validJobData.allowQuestions !== undefined ? Boolean(validJobData.allowQuestions) : true,
        requireCoverLetter: validJobData.requireCoverLetter !== undefined ? Boolean(validJobData.requireCoverLetter) : true,
        requirements: validJobData.requirements || null,
        deliverables: deliverables || validJobData.deliverables || null,
        // Use new duration fields directly
        estimatedDuration: estimatedDuration ? Number(estimatedDuration) : null,
        durationType: durationType || null
      };

      logger.info('Processed job data for Prisma:', {
        title: jobData.title,
        categoryId: jobData.categoryId,
        clientId: jobData.clientId,
        status: jobData.status,
        budgetType: jobData.budgetType,
        visibility: jobData.visibility,
        coreFeatures: jobData.coreFeatures,
        deliverables: jobData.deliverables,
        timeline: jobData.timeline,
        requirements: jobData.requirements
      });

      const job = await prisma.job.create({
        data: {
          title: jobData.title,
          description: jobData.description,
          categoryId: jobData.categoryId,
          clientId: jobData.clientId,
          requiredSkills: jobData.requiredSkills,
          experienceLevel: jobData.experienceLevel as ExperienceLevel,
          budgetType: jobData.budgetType as BudgetType,
          visibility: jobData.visibility as JobVisibility,
          attachments: jobData.attachments,
          coreFeatures: jobData.coreFeatures,
          timeline: jobData.timeline,
          referenceLinks: jobData.referenceLinks,
          managedByNairagig: jobData.managedByNairagig,
          status: jobData.status as JobStatus,
          applicationDeadline: jobData.applicationDeadline,
          budgetMin: jobData.budgetMin,
          budgetMax: jobData.budgetMax,
          allowQuestions: jobData.allowQuestions,
          requireCoverLetter: jobData.requireCoverLetter,
          requirements: jobData.requirements,
          deliverables: jobData.deliverables,
          estimatedDuration: jobData.estimatedDuration,
          durationType: jobData.durationType as any
        },
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          category: true
        }
      });

      logger.info(`Job created: ${job.id} by user: ${userId}`);
      
      // Send notification to all freelancers if job is published (status is OPEN)
      if (job.status === 'OPEN') {
        try {
          await notificationService.notifyNewJob(job.id);
          logger.info(`Job notification sent for job: ${job.id}`);
        } catch (notificationError) {
          logger.error(`Failed to send job notification for job: ${job.id}`, notificationError);
          // Don't fail the job creation if notification fails
        }
      }
      
      res.status(201).json({ success: true, data: job });
    } catch (error) {
      logger.error('Job creation error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: userId,
        requestBody: {
          title: req.body.title,
          categoryId: req.body.categoryId,
          status: req.body.status
        }
      });
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
        estimatedDuration, durationType, coreFeatures, timeline, referenceLinks, attachments, applicationDeadline,
        ...validJobData 
      } = req.body;
      
      // Process applicationDeadline - convert date string to DateTime
      let processedApplicationDeadline = undefined;
      if (applicationDeadline) {
        try {
          // If it's just a date string (YYYY-MM-DD), add time to make it a valid DateTime
          const dateStr = applicationDeadline.includes('T') ? applicationDeadline : `${applicationDeadline}T23:59:59.999Z`;
          processedApplicationDeadline = new Date(dateStr);
        } catch (error) {
          logger.warn('Invalid applicationDeadline format:', applicationDeadline);
        }
      }
      
      // Process duration fields
      const processedEstimatedDuration = estimatedDuration ? Number(estimatedDuration) : null;
      const processedDurationType = durationType || null;
      
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
        'public': 'PUBLIC',
        'private': 'PRIVATE',
        'featured': 'FEATURED',
        'invite-only': 'PRIVATE'
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
          requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : (requiredSkills ? Object.values(requiredSkills) : []),
          experienceLevel: experienceLevelMap[experienceLevel] || experienceLevel,
          budgetType: budgetTypeMap[budgetType] || budgetType,
          visibility: visibilityMap[visibility] || visibility,
          attachments: processedAttachments,
          coreFeatures: Array.isArray(coreFeatures) ? coreFeatures : (coreFeatures ? Object.values(coreFeatures) : []),
          timeline: Array.isArray(timeline) ? timeline : (timeline ? Object.values(timeline) : []),
          referenceLinks: Array.isArray(referenceLinks) ? referenceLinks : (referenceLinks ? Object.values(referenceLinks) : []),
          managedByNairagig: req.body.managedByNairagig || false,
          applicationDeadline: processedApplicationDeadline,
          estimatedDuration: processedEstimatedDuration,
          durationType: processedDurationType as any
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
      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { client: true }
      });
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

      // Get freelancer info
      const freelancer = await prisma.user.findUnique({ where: { id: userId } });

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

      // Send job application received email to client
      if (job.client && freelancer) {
        await emailService.sendJobApplicationReceived(
          job.client.email!,
          job.client.firstName,
          job.title,
          `${freelancer.firstName} ${freelancer.lastName}`
        );
      }

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
      const { status, notes } = req.body;

      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { client: true }
      });
      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');

      const application = await prisma.jobApplication.findUnique({
        where: { id: applicationId },
        include: { freelancer: true }
      });
      if (!application) throw ApiError.notFound('Application not found');

      const updatedApplication = await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { status, clientFeedback: notes },
        include: {
          freelancer: { select: { id: true, firstName: true, lastName: true, email: true } }
        }
      });

      // Send job application status email to freelancer
      if (status && application.freelancer) {
        const statusData: any = {
          clientName: `${job.client.firstName} ${job.client.lastName}`,
          jobUrl: `${process.env.FRONTEND_URL}/jobs/${jobId}`,
          applicationDate: application.submittedAt.toLocaleDateString()
        };

        if (status === 'ACCEPTED') {
          statusData.nextSteps = 'The client will contact you soon to discuss project details.';
          statusData.projectStartDate = 'To be confirmed';
        } else if (status === 'REJECTED') {
          statusData.rejectionReason = notes || 'Your application was not selected for this project.';
          statusData.feedback = 'Keep applying to similar projects to increase your chances.';
        }

        await emailService.sendJobApplicationStatus(
          application.freelancer.email!,
          application.freelancer.firstName,
          job.title,
          status,
          statusData
        );
      }

      res.json({ success: true, data: updatedApplication });
    } catch (error) {
      next(error);
    }
  }

  async askQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { jobId } = req.params;
      const { question } = req.body;

      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { client: true }
      });
      if (!job) throw ApiError.notFound('Job not found');
      if (!job.allowQuestions) throw ApiError.badRequest('Questions not allowed for this job');

      const freelancer = await prisma.user.findUnique({ where: { id: userId } });

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

      // Send job question received email to client
      if (job.client && freelancer) {
        await emailService.sendJobQuestionReceived(
          job.client.email!,
          job.client.firstName,
          {
            jobTitle: job.title,
            questionText: question,
            freelancerName: `${freelancer.firstName} ${freelancer.lastName}`,
            questionDate: new Date().toLocaleDateString(),
            isPublic: true
          }
        );
      }

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

      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { client: true }
      });
      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');
      if (job.awardedTo) throw ApiError.badRequest('Job already awarded');

      const freelancer = await prisma.user.findUnique({ where: { id: freelancerId } });
      if (!freelancer) throw ApiError.notFound('Freelancer not found');

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

      // Send job awarded email to freelancer
      await emailService.sendJobAwarded(
        freelancer.email!,
        freelancer.firstName,
        job.title,
        (job.budgetMin || 0).toString(),
        `${job.client.firstName} ${job.client.lastName}`
      );

      res.json({ success: true, data: { job: updatedJob, project } });
    } catch (error) {
      next(error);
    }
  }

  async bookmarkJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id: jobId } = req.params;

      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw ApiError.notFound('Job not found');

      const existingBookmark = await prisma.jobBookmark.findUnique({
        where: { userId_jobId: { userId, jobId } }
      });

      if (existingBookmark) {
        throw ApiError.badRequest('Job already bookmarked');
      }

      const bookmark = await prisma.jobBookmark.create({
        data: { userId, jobId }
      });

      res.status(201).json({ success: true, data: bookmark });
    } catch (error) {
      next(error);
    }
  }

  async unbookmarkJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id: jobId } = req.params;

      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const bookmark = await prisma.jobBookmark.findUnique({
        where: { userId_jobId: { userId, jobId } }
      });

      if (!bookmark) {
        throw ApiError.notFound('Bookmark not found');
      }

      await prisma.jobBookmark.delete({
        where: { userId_jobId: { userId, jobId } }
      });

      res.json({ success: true, message: 'Job unbookmarked successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getBookmarkedJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const [bookmarks, total] = await Promise.all([
        prisma.jobBookmark.findMany({
          where: { userId },
          skip,
          take: Number(limit),
          include: {
            job: {
              include: {
                client: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
                category: true,
                _count: { select: { applications: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.jobBookmark.count({ where: { userId } })
      ]);

      const jobs = bookmarks.map(bookmark => ({
        ...bookmark.job,
        bookmarkedAt: bookmark.createdAt
      }));

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

  async cancelJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id: jobId } = req.params;
      const { reason } = req.body;

      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { client: true }
      });
      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');

      let freelancer = null;
      if (job.awardedTo) {
        freelancer = await prisma.user.findUnique({ where: { id: job.awardedTo } });
      }

      const updatedJob = await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'CANCELLED'
        }
      });

      const cancellationData = {
        jobTitle: job.title,
        jobCategory: job.categoryId || 'General',
        jobBudget: (job.budgetMin || 0).toString(),
        cancellationReason: reason || 'No reason provided',
        cancellationDate: new Date().toLocaleDateString()
      };

      if (freelancer) {
        await emailService.sendJobCancelled(
          freelancer.email!,
          freelancer.firstName,
          { ...cancellationData, isFreelancer: true }
        );
      }

      await emailService.sendJobCancelled(
        job.client.email!,
        job.client.firstName,
        { ...cancellationData, isClient: true }
      );

      res.json({ success: true, data: updatedJob });
    } catch (error) {
      next(error);
    }
  }

  async completeJob(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id: jobId } = req.params;
      const { completionNotes } = req.body;

      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { client: true }
      });
      if (!job) throw ApiError.notFound('Job not found');
      if (job.clientId !== userId) throw ApiError.forbidden('Access denied');
      if (!job.awardedTo) throw ApiError.badRequest('Job was not awarded to anyone');

      const freelancer = await prisma.user.findUnique({ where: { id: job.awardedTo } });
      if (!freelancer) throw ApiError.notFound('Freelancer not found');

      const updatedJob = await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      const projectData = {
        projectTitle: job.title,
        completionDate: new Date().toLocaleDateString(),
        clientName: `${job.client.firstName} ${job.client.lastName}`,
        freelancerName: `${freelancer.firstName} ${freelancer.lastName}`,
        totalValue: (job.budgetMin || 0).toString(),
        projectDuration: 'Completed'
      };

      await emailService.sendJobCompleted(
        freelancer.email!,
        { ...projectData, isFreelancer: true }
      );

      await emailService.sendJobCompleted(
        job.client.email!,
        { ...projectData, isClient: true }
      );

      res.json({ success: true, data: updatedJob });
    } catch (error) {
      next(error);
    }
  }
}