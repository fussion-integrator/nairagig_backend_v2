import { Request, Response } from 'express';
import { JobSearchService } from '../services/job-search.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const jobSearchService = new JobSearchService();

export class JobSearchController {
  async searchJobs(req: Request, res: Response) {
    try {
      const {
        keywords,
        location,
        jobType,
        experienceLevel,
        salaryMin,
        salaryMax,
        currency,
        skills
      } = req.query;

      const filters = {
        keywords: keywords as string,
        location: location as string,
        jobType: jobType as string,
        experienceLevel: experienceLevel as string,
        salaryMin: salaryMin ? parseInt(salaryMin as string) : undefined,
        salaryMax: salaryMax ? parseInt(salaryMax as string) : undefined,
        currency: currency as string || 'USD',
        skills: skills ? (skills as string).split(',').map(s => s.trim()).filter(s => s) : []
      };

      const userId = (req as any).user?.id;
      const jobs = await jobSearchService.searchJobs(filters, userId);

      // Log search activity
      if (userId) {
        try {
          await prisma.jobSearchLog.create({
            data: {
              userId,
              searchFilters: JSON.stringify(filters),
              resultsCount: jobs.length,
              searchedAt: new Date()
            }
          });
        } catch (error) {
          console.error('Failed to log search activity:', error);
        }
      }

      res.json({
        success: true,
        data: {
          jobs,
          totalCount: jobs.length,
          filters: filters
        }
      });
    } catch (error) {
      console.error('Job search error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search jobs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getJobDetails(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const job = await jobSearchService.getJobById(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        data: job
      });
    } catch (error) {
      console.error('Get job details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get job details',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async trackApplication(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { jobId, jobTitle, company, applicationUrl, source } = req.body;

      // Check if already applied
      const existingApplication = await prisma.externalJobApplication.findFirst({
        where: {
          userId,
          jobId,
          source
        }
      });

      if (existingApplication) {
        return res.json({
          success: true,
          message: 'Application already tracked',
          data: existingApplication
        });
      }

      // Create new application record
      const application = await prisma.externalJobApplication.create({
        data: {
          userId,
          jobId,
          jobTitle,
          company,
          applicationUrl,
          source,
          status: 'APPLIED',
          appliedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: 'Application tracked successfully',
        data: application
      });
    } catch (error) {
      console.error('Track application error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to track application',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async saveJob(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { jobId, jobTitle, company, jobData } = req.body;

      // Check if already saved
      const existingSave = await prisma.savedJob.findFirst({
        where: {
          userId,
          jobId
        }
      });

      if (existingSave) {
        // Remove if already saved (toggle)
        await prisma.savedJob.delete({
          where: { id: existingSave.id }
        });

        return res.json({
          success: true,
          message: 'Job removed from saved list',
          data: { saved: false }
        });
      }

      // Save the job
      const savedJob = await prisma.savedJob.create({
        data: {
          userId,
          jobId,
          jobTitle,
          company,
          jobData: JSON.stringify(jobData),
          savedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: 'Job saved successfully',
        data: { saved: true, savedJob }
      });
    } catch (error) {
      console.error('Save job error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save job',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getUserApplications(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { page = 1, limit = 20, status } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = { userId };
      if (status) {
        where.status = status;
      }

      const [applications, total] = await Promise.all([
        prisma.externalJobApplication.findMany({
          where,
          orderBy: { appliedAt: 'desc' },
          skip,
          take: parseInt(limit as string)
        }),
        prisma.externalJobApplication.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          applications,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string))
          }
        }
      });
    } catch (error) {
      console.error('Get user applications error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get applications',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getSavedJobs(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const [savedJobs, total] = await Promise.all([
        prisma.savedJob.findMany({
          where: { userId },
          orderBy: { savedAt: 'desc' },
          skip,
          take: parseInt(limit as string)
        }),
        prisma.savedJob.count({ where: { userId } })
      ]);

      // Parse job data
      const jobsWithData = savedJobs.map(job => ({
        ...job,
        jobData: job.jobData ? JSON.parse(job.jobData) : null
      }));

      res.json({
        success: true,
        data: {
          savedJobs: jobsWithData,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string))
          }
        }
      });
    } catch (error) {
      console.error('Get saved jobs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get saved jobs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}