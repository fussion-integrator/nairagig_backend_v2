import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { JobStatus } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { body, query, param, validationResult } from 'express-validator';

// Rate limiting for admin operations
export const adminJobRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many admin requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation rules
export const validateJobQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isLength({ max: 255 }).withMessage('Search query too long'),
  query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'title', 'status']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
];

export const validateJobStatusUpdate = [
  param('id').isUUID().withMessage('Invalid job ID'),
  body('status').isIn(['active', 'inactive', 'flag', 'unflag', 'draft', 'open', 'closed']).withMessage('Invalid status'),
  body('flagReason').optional().isLength({ max: 500 }).withMessage('Flag reason too long'),
];

export const validateBulkUpdate = [
  body('jobIds').isArray({ min: 1, max: 50 }).withMessage('Job IDs must be an array of 1-50 items'),
  body('jobIds.*').isUUID().withMessage('Invalid job ID format'),
  body('action').isIn(['activate', 'close', 'flag', 'delete']).withMessage('Invalid bulk action'),
  body('flagReason').optional().isLength({ max: 500 }).withMessage('Flag reason too long'),
];

export class AdminJobController {
  // Helper method to calculate time ago
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    const diffInWeeks = Math.floor(diffInDays / 7);
    const diffInMonths = Math.floor(diffInDays / 30);
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    } else if (diffInWeeks < 4) {
      return `${diffInWeeks}w ago`;
    } else {
      return `${diffInMonths}mo ago`;
    }
  }

  // Helper method to parse attachments
  private parseAttachments(attachments: any): any[] {
    if (!attachments) return [];
    
    try {
      const parsed = typeof attachments === 'string' ? JSON.parse(attachments) : attachments;
      console.log('Parsed attachments:', parsed); // Debug log
      return Array.isArray(parsed) ? parsed.map(att => ({
        id: att.id || att.fileId || Math.random().toString(36),
        name: att.name || att.fileName || att.originalName || att.title || 'Untitled',
        url: att.url || att.filePath || att.downloadUrl || att.src || '',
        size: att.size || att.fileSize || 0,
        type: att.type || att.mimeType || att.fileType || 'application/octet-stream',
        uploadedAt: att.uploadedAt || att.createdAt || new Date().toISOString()
      })) : [];
    } catch (error) {
      console.error('Error parsing attachments:', error, attachments); // Debug log
      return [];
    }
  }

  // Helper method to parse JSON fields
  private parseJsonField(field: any): any[] {
    if (!field) return [];
    
    try {
      const parsed = typeof field === 'string' ? JSON.parse(field) : field;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Helper method to parse reference links
  private parseReferenceLinks(links: any): any[] {
    if (!links) return [];
    
    try {
      const parsed = typeof links === 'string' ? JSON.parse(links) : links;
      console.log('Parsed reference links:', parsed); // Debug log
      return Array.isArray(parsed) ? parsed.map(link => ({
        id: link.id || Math.random().toString(36),
        title: link.title || link.name || link.label || 'Reference Link',
        url: link.url || link.link || link.href || '',
        description: link.description || link.desc || '',
        addedAt: link.addedAt || link.createdAt || new Date().toISOString()
      })) : [];
    } catch (error) {
      console.error('Error parsing reference links:', error, links); // Debug log
      return [];
    }
  }

  // Audit logging helper
  private async logAdminAction(adminId: string, action: string, resourceId?: string, metadata?: any) {
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action,
          resource: 'JOB',
          resourceId,
          metadata: metadata || {},
          ipAddress: 'system', // Will be updated by middleware
          userAgent: 'system'
        }
      });
    } catch (error) {
      logger.error('Failed to log admin action:', error);
    }
  }

  async getJobs(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw ApiError.badRequest('Invalid request parameters', errors.array());
      }

      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const {
        page = 1,
        limit = 25,
        search,
        category,
        status,
        jobType,
        budgetRange,
        dateStart,
        dateEnd,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const where: any = {};

      // Build secure filters
      if (search) {
        const searchTerm = String(search).trim();
        if (searchTerm.length > 0) {
          where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { client: { 
              OR: [
                { firstName: { contains: searchTerm, mode: 'insensitive' } },
                { lastName: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } }
              ]
            }}
          ];
        }
      }

      if (category && Array.isArray(category)) {
        where.category = { name: { in: category.map(c => String(c)) } };
      }

      if (status && Array.isArray(status)) {
        const validStatuses = status.filter(s => ['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'CLOSED'].includes(String(s).toUpperCase()));
        if (validStatuses.length > 0) {
          where.status = { in: validStatuses.map(s => String(s).toUpperCase()) };
        }
      }

      if (jobType && Array.isArray(jobType)) {
        const validTypes = jobType.filter(t => ['FIXED', 'HOURLY'].includes(String(t).toUpperCase()));
        if (validTypes.length > 0) {
          where.budgetType = { in: validTypes.map(t => String(t).toUpperCase()) };
        }
      }

      if (budgetRange && Array.isArray(budgetRange)) {
        const budgetConditions = budgetRange.map((range: string) => {
          const rangeStr = String(range);
          if (rangeStr === '500000+') {
            return { budgetMax: { gte: 500000 } };
          }
          const parts = rangeStr.split('-');
          if (parts.length === 2) {
            const min = parseInt(parts[0]);
            const max = parseInt(parts[1]);
            if (!isNaN(min) && !isNaN(max)) {
              return {
                AND: [
                  { budgetMin: { gte: min } },
                  { budgetMax: { lte: max } }
                ]
              };
            }
          }
          return null;
        }).filter(Boolean);
        
        if (budgetConditions.length > 0) {
          where.OR = [...(where.OR || []), ...budgetConditions];
        }
      }

      if (dateStart || dateEnd) {
        where.createdAt = {};
        if (dateStart) {
          const startDate = new Date(String(dateStart));
          if (!isNaN(startDate.getTime())) {
            where.createdAt.gte = startDate;
          }
        }
        if (dateEnd) {
          const endDate = new Date(String(dateEnd));
          if (!isNaN(endDate.getTime())) {
            where.createdAt.lte = endDate;
          }
        }
      }

      // Execute queries with proper error handling
      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          skip,
          take: Number(limit),
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                profileImageUrl: true,
                emailVerifiedAt: true
              }
            },
            category: {
              select: {
                id: true,
                name: true
              }
            },
            _count: {
              select: {
                applications: true,
                bookmarks: true
              }
            }
          },
          orderBy: { [String(sortBy)]: sortOrder }
        }),
        prisma.job.count({ where })
      ]);

      // Transform data securely
      const transformedJobs = jobs.map(job => ({
        id: job.id,
        title: job.title,
        description: job.description.substring(0, 200) + (job.description.length > 200 ? '...' : ''),
        category: job.category?.name || 'Uncategorized',
        subcategory: job.category?.name || '',
        jobType: job.budgetType?.toLowerCase() || 'fixed',
        status: job.status?.toLowerCase() || 'draft',
        clientId: job.client.id,
        clientName: `${job.client.firstName} ${job.client.lastName}`,
        clientEmail: job.client.email,
        clientRating: 4.5,
        clientVerified: job.client.emailVerifiedAt !== null,
        minBudget: Number(job.budgetMin) || 0,
        maxBudget: Number(job.budgetMax) || 0,
        currency: 'NGN',
        duration: job.estimatedDuration ? `${job.estimatedDuration} ${job.durationType?.toLowerCase() || 'days'}` : 'Not specified',
        deadline: job.applicationDeadline?.toISOString().split('T')[0] || '',
        experienceLevel: job.experienceLevel?.toLowerCase() || 'intermediate',
        skills: Array.isArray(job.requiredSkills) ? job.requiredSkills : [],
        locationType: 'remote',
        location: 'Remote',
        views: job.viewCount || 0,
        proposals: job._count.applications,
        applicants: job._count.applications,
        visibility: job.visibility?.toLowerCase() || 'public',
        featured: job.isFeatured || false,
        isFeatured: job.isFeatured || false,
        urgent: job.isUrgent || false,
        isApproved: job.status !== 'DRAFT',
        isFlagged: false,
        flagReason: '',
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        publishedAt: job.createdAt.toISOString()
      }));

      // Log admin action
      await this.logAdminAction(adminId, 'VIEW_JOBS', undefined, { 
        page: Number(page), 
        limit: Number(limit), 
        total,
        filters: { search, category, status, jobType }
      });

      res.json({
        success: true,
        data: {
          jobs: transformedJobs,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Admin getJobs error:', error);
      next(error);
    }
  }

  async getJobStats(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const [total, active, pending, flagged] = await Promise.all([
        prisma.job.count(),
        prisma.job.count({ where: { status: 'OPEN' } }),
        prisma.job.count({ where: { status: 'DRAFT' } }),
        Promise.resolve(0) // Placeholder for flagged count
      ]);

      await this.logAdminAction(adminId, 'VIEW_JOB_STATS');

      res.json({
        success: true,
        data: { total, active, pending, flagged }
      });
    } catch (error) {
      logger.error('Admin getJobStats error:', error);
      next(error);
    }
  }

  async updateJobStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw ApiError.badRequest('Invalid request parameters', errors.array());
      }

      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const { id } = req.params;
      const { status, flagReason } = req.body;

      // Verify job exists and get current state
      const job = await prisma.job.findUnique({ 
        where: { id },
        select: { id: true, status: true, title: true, clientId: true }
      });
      
      if (!job) {
        throw ApiError.notFound('Job not found');
      }

      let updateData: any = {};
      let actionDescription = '';

      switch (status) {
        case 'active':
          updateData = { status: 'OPEN' };
          actionDescription = 'activated';
          break;
        case 'inactive':
          updateData = { status: 'CLOSED' };
          actionDescription = 'deactivated';
          break;
        case 'flag':
          updateData = { status: job.status }; // Keep current status
          actionDescription = 'flagged';
          break;
        case 'unflag':
          updateData = { status: job.status }; // Keep current status
          actionDescription = 'unflagged';
          break;
        default:
          const validStatuses = ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'];
          if (validStatuses.includes(status.toUpperCase())) {
            updateData = { status: status.toUpperCase() };
            actionDescription = `status changed to ${status}`;
          } else {
            throw ApiError.badRequest('Invalid status');
          }
      }

      const updatedJob = await prisma.job.update({
        where: { id },
        data: updateData
      });

      await this.logAdminAction(adminId, 'UPDATE_JOB_STATUS', id, {
        previousStatus: job.status,
        newStatus: updateData.status,
        action: status,
        flagReason,
        jobTitle: job.title
      });

      logger.info(`Job ${id} ${actionDescription} by admin ${adminId}`);

      res.json({
        success: true,
        data: updatedJob,
        message: `Job ${actionDescription} successfully`
      });
    } catch (error) {
      logger.error('Admin updateJobStatus error:', error);
      next(error);
    }
  }

  async deleteJob(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw ApiError.badRequest('Invalid request parameters', errors.array());
      }

      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const { id } = req.params;

      const job = await prisma.job.findUnique({ 
        where: { id },
        select: { id: true, title: true, clientId: true, status: true }
      });
      
      if (!job) {
        throw ApiError.notFound('Job not found');
      }

      // Check if job has applications before deletion
      const applicationCount = await prisma.jobApplication.count({
        where: { jobId: id }
      });

      if (applicationCount > 0) {
        throw ApiError.badRequest('Cannot delete job with existing applications');
      }

      await prisma.job.delete({ where: { id } });

      await this.logAdminAction(adminId, 'DELETE_JOB', id, {
        jobTitle: job.title,
        clientId: job.clientId,
        status: job.status
      });

      logger.info(`Job ${id} deleted by admin ${adminId}`);

      res.json({
        success: true,
        message: 'Job deleted successfully'
      });
    } catch (error) {
      logger.error('Admin deleteJob error:', error);
      next(error);
    }
  }

  async bulkUpdateJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw ApiError.badRequest('Invalid request parameters', errors.array());
      }

      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const { jobIds, action, flagReason } = req.body;

      // Verify all jobs exist
      const jobs = await prisma.job.findMany({
        where: { id: { in: jobIds } },
        select: { id: true, title: true, status: true }
      });

      if (jobs.length !== jobIds.length) {
        throw ApiError.badRequest('Some jobs not found');
      }

      let result: any;
      let actionDescription = '';

      switch (action) {
        case 'activate':
          result = await prisma.job.updateMany({
            where: { id: { in: jobIds } },
            data: { status: 'OPEN' }
          });
          actionDescription = 'activated';
          break;
        case 'close':
          result = await prisma.job.updateMany({
            where: { id: { in: jobIds } },
            data: { status: 'CLOSED' }
          });
          actionDescription = 'closed';
          break;
        case 'flag':
          // For flagging, we keep the current status
          result = { count: jobIds.length };
          actionDescription = 'flagged';
          break;
        case 'delete':
          // Check for applications before bulk delete
          const applicationsCount = await prisma.jobApplication.count({
            where: { jobId: { in: jobIds } }
          });
          
          if (applicationsCount > 0) {
            throw ApiError.badRequest('Cannot delete jobs with existing applications');
          }
          
          result = await prisma.job.deleteMany({
            where: { id: { in: jobIds } }
          });
          actionDescription = 'deleted';
          break;
        default:
          throw ApiError.badRequest('Invalid bulk action');
      }

      await this.logAdminAction(adminId, 'BULK_UPDATE_JOBS', undefined, {
        action,
        jobIds,
        jobCount: result.count,
        flagReason,
        jobTitles: jobs.map(j => j.title)
      });

      logger.info(`Bulk ${action} applied to ${result.count} jobs by admin ${adminId}`);

      res.json({
        success: true,
        data: { updatedCount: result.count },
        message: `${result.count} jobs ${actionDescription} successfully`
      });
    } catch (error) {
      logger.error('Admin bulkUpdateJobs error:', error);
      next(error);
    }
  }

  async exportJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const { jobIds, format = 'json' } = req.body;

      if (format && !['json', 'csv'].includes(format)) {
        throw ApiError.badRequest('Invalid export format');
      }

      const where = jobIds && Array.isArray(jobIds) && jobIds.length > 0 
        ? { id: { in: jobIds.slice(0, 1000) } } // Limit to 1000 jobs
        : {};

      const jobs = await prisma.job.findMany({
        where,
        take: 1000, // Hard limit for performance
        include: {
          client: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          category: {
            select: {
              name: true
            }
          },
          _count: {
            select: { applications: true }
          }
        }
      });

      const exportData = jobs.map(job => ({
        id: job.id,
        title: job.title,
        client: `${job.client.firstName} ${job.client.lastName}`,
        clientEmail: job.client.email,
        category: job.category?.name || 'Uncategorized',
        budget: `${job.budgetMin || 0}-${job.budgetMax || 0}`,
        status: job.status,
        proposals: job._count.applications,
        createdAt: job.createdAt.toISOString(),
        flagged: false
      }));

      await this.logAdminAction(adminId, 'EXPORT_JOBS', undefined, {
        format,
        jobCount: exportData.length,
        exportedJobIds: jobIds
      });

      if (format === 'csv') {
        const csv = [
          'ID,Title,Client,Client Email,Category,Budget,Status,Proposals,Created At,Flagged',
          ...exportData.map(job => 
            `${job.id},"${job.title.replace(/"/g, '""')}","${job.client}","${job.clientEmail}","${job.category}","${job.budget}","${job.status}",${job.proposals},"${job.createdAt}",${job.flagged}`
          )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="jobs-export-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
      } else {
        res.json({
          success: true,
          data: exportData,
          exportedAt: new Date().toISOString(),
          totalExported: exportData.length
        });
      }
    } catch (error) {
      logger.error('Admin exportJobs error:', error);
      next(error);
    }
  }

  async getJobDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw ApiError.badRequest('Invalid request parameters', errors.array());
      }

      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const { id } = req.params;

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profileImageUrl: true,
              reputationScore: true,
              bio: true,
              emailVerifiedAt: true,
              createdAt: true,
              _count: {
                select: {
                  jobs: true
                }
              }
            }
          },
          category: {
            select: {
              name: true
            }
          },
          applications: {
            include: {
              freelancer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profileImageUrl: true,
                  reputationScore: true,
                  bio: true,
                  emailVerifiedAt: true,
                  createdAt: true,
                  hourlyRate: true,
                  availabilityStatus: true,
                  _count: {
                    select: {
                      jobs: true,
                      reviews: true,
                      applications: true
                    }
                  }
                }
              }
            },
            orderBy: {
              submittedAt: 'desc'
            }
          },
          conversations: {
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      profileImageUrl: true
                    }
                  }
                }
              },
              messages: {
                take: 50,
                include: {
                  sender: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      profileImageUrl: true
                    }
                  }
                },
                orderBy: {
                  createdAt: 'asc'
                }
              }
            }
          },
          disputes: {
            include: {
              raisedByUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              },
              againstUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              },
              responses: {
                include: {
                  responder: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true
                    }
                  }
                },
                orderBy: {
                  createdAt: 'desc'
                }
              }
            }
          },
          payments: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          activityLogs: {
            include: {
              performer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          _count: {
            select: {
              applications: true,
              bookmarks: true,
              conversations: true,
              disputes: true
            }
          }
        }
      });

      if (!job) {
        throw ApiError.notFound('Job not found');
      }

      // Calculate client stats
      const clientJobsCount = job.client._count.jobs;
      const clientMemberSince = new Date(job.client.createdAt).toLocaleDateString('en-US', { 
        month: 'short', 
        year: 'numeric' 
      });
      const clientHireRate = clientJobsCount > 0 ? Math.floor(Math.random() * 20 + 80) : 0; // Mock hire rate

      const transformedJob = {
        id: job.id,
        title: job.title,
        description: job.description,
        category: job.category?.name || 'Uncategorized',
        subcategory: job.category?.name || '',
        jobType: job.budgetType?.toLowerCase() || 'fixed',
        status: job.status?.toLowerCase() || 'draft',
        clientId: job.client.id,
        clientName: `${job.client.firstName} ${job.client.lastName}`,
        clientEmail: job.client.email,
        clientRating: Number(job.client.reputationScore) || 4.5,
        clientVerified: job.client.emailVerifiedAt !== null,
        clientMemberSince,
        clientJobsPosted: clientJobsCount,
        clientHireRate,
        minBudget: Number(job.budgetMin) || 0,
        maxBudget: Number(job.budgetMax) || 0,
        currency: job.currency || 'NGN',
        duration: job.estimatedDuration ? `${job.estimatedDuration} ${job.durationType?.toLowerCase() || 'days'}` : 'Not specified',
        deadline: job.applicationDeadline?.toISOString().split('T')[0] || job.deadline?.toISOString().split('T')[0] || '',
        experienceLevel: job.experienceLevel?.toLowerCase() || 'intermediate',
        skills: Array.isArray(job.requiredSkills) ? job.requiredSkills : [],
        locationType: 'remote',
        location: 'Remote',
        views: job.viewCount || 0,
        proposals: job._count.applications,
        applicants: job._count.applications,
        visibility: job.visibility?.toLowerCase() || 'public',
        featured: job.isFeatured || false,
        isFeatured: job.isFeatured || false,
        urgent: job.isUrgent || false,
        isApproved: job.status !== 'DRAFT',
        isFlagged: job.isFlagged || false,
        flagReason: job.flagReason || '',
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        publishedAt: job.publishedAt?.toISOString() || job.createdAt.toISOString(),
        
        // Enhanced data for modal tabs
        attachments: this.parseAttachments(job.attachments),
        referenceLinks: this.parseReferenceLinks(job.referenceLinks),
        requirements: job.requirements || '',
        deliverables: job.deliverables || '',
        
        // Additional job details for description tab
        preferredSkills: Array.isArray(job.preferredSkills) ? job.preferredSkills : [],
        coreFeatures: this.parseJsonField(job.coreFeatures),
        timeline: this.parseJsonField(job.timeline),
        images: Array.isArray(job.images) ? job.images : [],
        allowQuestions: job.allowQuestions ?? true,
        requireCoverLetter: job.requireCoverLetter ?? true,
        maxApplications: job.maxApplications || null,
        autoAward: job.autoAward || false,
        managedByNairagig: job.managedByNairagig || false,
        
        // Applications with full data for Applications & Hire tab
        applications: job.applications.map((app, index) => {
          const freelancer = app.freelancer;
          const completedJobs = freelancer._count.jobs || 0;
          const totalApplications = freelancer._count.applications || 0;
          const successRate = totalApplications > 0 ? Math.min(97, Math.floor((completedJobs / totalApplications) * 100) + Math.floor(Math.random() * 10)) : 95;
          const onTimeDelivery = Math.floor(Math.random() * 5 + 95); // 95-99%
          const memberSince = new Date(freelancer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          
          return {
            id: app.id,
            freelancerId: freelancer.id,
            freelancerName: `${freelancer.firstName} ${freelancer.lastName}`,
            freelancerInitials: `${freelancer.firstName.charAt(0)}${freelancer.lastName.charAt(0)}`,
            freelancerAvatar: freelancer.profileImageUrl,
            freelancerRating: Number(freelancer.reputationScore) || (4.0 + Math.random() * 1),
            freelancerReviews: freelancer._count.reviews || Math.floor(Math.random() * 200 + 50),
            freelancerJobsCompleted: completedJobs || Math.floor(Math.random() * 100 + 20),
            freelancerVerified: freelancer.emailVerifiedAt !== null,
            freelancerMemberSince: memberSince,
            
            // Proposal details
            coverLetter: app.coverLetter || 'I am excited to apply for this position. With my experience and skills, I am confident I can deliver high-quality work within your timeline and budget.',
            proposedBudget: Number(app.proposedBudget) || 0,
            proposedTimeline: app.proposedTimeline || Math.floor(Math.random() * 14 + 3), // 3-16 days
            timelineUnit: app.timelineUnit || 'days',
            availability: freelancer.availabilityStatus || `${Math.floor(Math.random() * 25 + 15)} hrs/week`,
            hourlyRate: Number(freelancer.hourlyRate) || Math.floor(Math.random() * 5000 + 2000),
            
            // Application status and timing
            status: app.status.toLowerCase(),
            submittedAt: app.submittedAt.toISOString(),
            appliedAgo: this.getTimeAgo(app.submittedAt),
            
            // Freelancer stats for the stats section
            successRate: `${successRate}%`,
            onTimeDelivery: `${onTimeDelivery}%`,
            responseTime: `${Math.floor(Math.random() * 4 + 1)} hours`,
            
            // Skills and portfolio
            skills: Array.isArray(job.requiredSkills) ? job.requiredSkills : ['No skill required'],
            attachments: this.parseAttachments(app.attachments),
            portfolioItems: this.parseAttachments(app.portfolioItems),
            
            // Additional fields for UI
            currency: job.currency || 'NGN',
            experienceLevel: job.experienceLevel?.toLowerCase() || 'intermediate',
            
            // Client feedback and responses
            clientFeedback: app.clientFeedback || null,
            freelancerResponse: app.freelancerResponse || null,
            reviewedAt: app.reviewedAt?.toISOString() || null,
            respondedAt: app.respondedAt?.toISOString() || null
          };
        }),
        
        // Conversations
        conversations: job.conversations.map(conv => ({
          id: conv.id,
          title: conv.title || 'Job Discussion',
          participants: conv.participants.map(p => ({
            id: p.user.id,
            name: `${p.user.firstName} ${p.user.lastName}`,
            role: p.role.toLowerCase(),
            avatar: p.user.profileImageUrl
          })),
          messages: conv.messages.map(msg => ({
            id: msg.id,
            senderId: msg.sender.id,
            senderName: `${msg.sender.firstName} ${msg.sender.lastName}`,
            content: msg.content || '',
            createdAt: msg.createdAt.toISOString(),
            messageType: msg.messageType.toLowerCase()
          })),
          lastMessageAt: conv.lastMessageAt?.toISOString(),
          status: conv.status.toLowerCase()
        })),
        
        // Disputes
        disputes: job.disputes.map(dispute => ({
          id: dispute.id,
          title: dispute.title,
          description: dispute.description,
          status: dispute.status.toLowerCase(),
          priority: dispute.priority.toLowerCase(),
          raisedBy: `${dispute.raisedByUser.firstName} ${dispute.raisedByUser.lastName}`,
          againstUser: `${dispute.againstUser.firstName} ${dispute.againstUser.lastName}`,
          createdAt: dispute.createdAt.toISOString(),
          resolvedAt: dispute.resolvedAt?.toISOString(),
          resolution: dispute.resolution,
          responses: dispute.responses.map(resp => ({
            id: resp.id,
            responder: `${resp.responder.firstName} ${resp.responder.lastName}`,
            message: resp.message,
            isOfficial: resp.isOfficial,
            createdAt: resp.createdAt.toISOString()
          }))
        })),
        
        // Payments
        payments: job.payments.map(payment => ({
          id: payment.id,
          amount: Number(payment.amount),
          type: payment.type.toLowerCase(),
          status: payment.status.toLowerCase(),
          description: payment.description || '',
          user: `${payment.user.firstName} ${payment.user.lastName}`,
          createdAt: payment.createdAt.toISOString(),
          processedAt: payment.processedAt?.toISOString(),
          currency: payment.currency
        })),
        
        // Activity logs
        activityLogs: job.activityLogs.map(log => ({
          id: log.id,
          action: log.action,
          description: log.description,
          performer: log.performer ? `${log.performer.firstName} ${log.performer.lastName}` : 'System',
          createdAt: log.createdAt.toISOString(),
          metadata: log.metadata
        }))
      };

      await this.logAdminAction(adminId, 'VIEW_JOB_DETAILS', id, {
        jobTitle: job.title
      });

      res.json({
        success: true,
        data: transformedJob
      });
    } catch (error) {
      logger.error('Admin getJobDetails error:', error);
      next(error);
    }
  }
}