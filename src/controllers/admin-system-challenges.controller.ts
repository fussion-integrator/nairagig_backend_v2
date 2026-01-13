import { Request, Response, NextFunction } from 'express';
import { AdminSystemChallengesService } from '../services/admin-system-challenges.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { validationResult } from 'express-validator';
import { prisma } from '../config/database';

export class AdminSystemChallengesController {
  private adminSystemChallengesService: AdminSystemChallengesService;

  constructor() {
    this.adminSystemChallengesService = new AdminSystemChallengesService();
  }

  // Public methods (no authentication required)
  async getPublicChallengeConfig(req: Request, res: Response) {
    try {
      const { challengeType } = req.params;
      
      const result = await this.adminSystemChallengesService.getSystemChallengeConfig(challengeType);
      
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: 'Challenge configuration not found'
        });
      }

      // Return only public information, hide admin-specific details
      const publicConfig = {
        challengeType: result.data.challengeType,
        isActive: result.data.isActive,
        title: result.data.settings?.title || `${challengeType} Challenge`,
        description: result.data.settings?.description || '',
        milestones: result.data.milestoneTargets || [],
        maxParticipants: result.data.settings?.maxParticipants || 0,
        startDate: result.data.settings?.startDate || '',
        endDate: result.data.settings?.endDate || ''
      };

      res.json({
        success: true,
        data: publicConfig
      });
    } catch (error: any) {
      logger.error('Error getting public challenge config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get challenge configuration'
      });
    }
  }

  async getActiveConfigs(req: Request, res: Response) {
    try {
      const challengeTypes = ['linkedin', 'twitter', 'facebook', 'referral'];
      const challenges = [];

      for (const type of challengeTypes) {
        try {
          const result = await this.adminSystemChallengesService.getSystemChallengeConfig(type);
          if (result.success && result.data.isActive) {
            challenges.push({
              challengeType: result.data.challengeType,
              isActive: result.data.isActive,
              title: result.data.settings?.title || `${type} Challenge`,
              description: result.data.settings?.description || '',
              milestones: result.data.milestoneTargets || [],
              maxParticipants: result.data.settings?.maxParticipants || 0,
              startDate: result.data.settings?.startDate || '',
              endDate: result.data.settings?.endDate || ''
            });
          }
        } catch (error) {
          logger.error(`Error loading ${type} challenge:`, error);
        }
      }

      res.json({
        success: true,
        data: challenges
      });
    } catch (error: any) {
      logger.error('Error getting active configs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active configurations'
      });
    }
  }

  // LinkedIn Ambassador Management
  async getLinkedInParticipants(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw ApiError.badRequest('Invalid request parameters', errors.array());
      }

      const adminId = (req as any).admin?.id;
      if (!adminId) {
        throw ApiError.unauthorized('Admin authentication required');
      }

      const result = await this.adminSystemChallengesService.getLinkedInParticipants(req.query);
      res.json(result);
    } catch (error) {
      logger.error('getLinkedInParticipants error:', error);
      next(error);
    }
  }

  async getPendingLinkedInMilestones(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getPendingLinkedInMilestones(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async approveLinkedInMilestone(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.approveLinkedInMilestone(id, adminId, notes);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async rejectLinkedInMilestone(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.rejectLinkedInMilestone(id, adminId, reason);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getLinkedInAnalytics(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getLinkedInAnalytics(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Facebook Ambassador Management
  async getFacebookParticipants(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getFacebookParticipants(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPendingFacebookMilestones(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getPendingFacebookMilestones(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async approveFacebookMilestone(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.approveFacebookMilestone(id, adminId, notes);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async rejectFacebookMilestone(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.rejectFacebookMilestone(id, adminId, reason);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Twitter Ambassador Management
  async getTwitterParticipants(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getTwitterParticipants(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPendingTwitterMilestones(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getPendingTwitterMilestones(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async approveTwitterMilestone(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.approveTwitterMilestone(id, adminId, notes);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Content Creator Management
  async getContentCreatorPosts(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getContentCreatorPosts(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async approveContentCreatorPost(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.approveContentCreatorPost(id, adminId, notes);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async rejectContentCreatorPost(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.rejectContentCreatorPost(id, adminId, reason);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Referral Challenge Management
  async getReferralStats(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getReferralStats(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getReferralParticipants(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getReferralParticipants(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Bulk Operations
  async bulkApprove(req: Request, res: Response) {
    try {
      const { type, ids } = req.body;
      const adminId = (req as any).admin?.id;
      const result = await this.adminSystemChallengesService.bulkApprove(type, ids, adminId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get all system challenge submissions
  async getAllSystemChallengeSubmissions(req: Request, res: Response) {
    try {
      const { challengeType, status, page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      let submissions = [];
      let total = 0;

      switch (challengeType) {
        case 'linkedin':
          [submissions, total] = await Promise.all([
            prisma.linkedInPost.findMany({
              where: status ? { status: status as any } : {},
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    profileImageUrl: true
                  }
                }
              },
              orderBy: { createdAt: 'desc' },
              skip,
              take: Number(limit)
            }),
            prisma.linkedInPost.count({ where: status ? { status: status as any } : {} })
          ]);
          break;
        case 'twitter':
          [submissions, total] = await Promise.all([
            prisma.twitterPost.findMany({
              where: status ? { status: status as any } : {},
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    profileImageUrl: true
                  }
                }
              },
              orderBy: { createdAt: 'desc' },
              skip,
              take: Number(limit)
            }),
            prisma.twitterPost.count({ where: status ? { status: status as any } : {} })
          ]);
          break;
        case 'facebook':
          [submissions, total] = await Promise.all([
            prisma.facebookPost.findMany({
              where: status ? { status: status as any } : {},
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    profileImageUrl: true
                  }
                }
              },
              orderBy: { createdAt: 'desc' },
              skip,
              take: Number(limit)
            }),
            prisma.facebookPost.count({ where: status ? { status: status as any } : {} })
          ]);
          break;
        default:
          // Get all submissions from all platforms
          const [linkedInPosts, twitterPosts, facebookPosts] = await Promise.all([
            prisma.linkedInPost.findMany({
              where: status ? { status: status as any } : {},
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    profileImageUrl: true
                  }
                }
              },
              take: 10
            }),
            prisma.twitterPost.findMany({
              where: status ? { status: status as any } : {},
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    profileImageUrl: true
                  }
                }
              },
              take: 10
            }),
            prisma.facebookPost.findMany({
              where: status ? { status: status as any } : {},
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    profileImageUrl: true
                  }
                }
              },
              take: 10
            })
          ]);
          
          submissions = [
            ...linkedInPosts.map(p => ({ ...p, platform: 'linkedin' })),
            ...twitterPosts.map(p => ({ ...p, platform: 'twitter' })),
            ...facebookPosts.map(p => ({ ...p, platform: 'facebook' }))
          ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          total = submissions.length;
      }

      res.json({
        success: true,
        data: {
          submissions,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // System Challenge Configuration Management
  async getSystemChallengeConfig(req: Request, res: Response) {
    try {
      const { challengeType } = req.params;
      const result = await this.adminSystemChallengesService.getSystemChallengeConfig(challengeType);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async saveSystemChallengeConfig(req: Request, res: Response) {
    try {
      const { challengeType } = req.params;
      const configData = req.body;
      const adminId = (req as any).admin?.id;
      
      if (!adminId) {
        return res.status(401).json({ success: false, error: 'Admin authentication required' });
      }

      const result = await this.adminSystemChallengesService.saveSystemChallengeConfig(challengeType, configData, adminId);
      res.json(result);
    } catch (error: any) {
      logger.error('saveSystemChallengeConfig error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save configuration' });
    }
  }

  // Overall Analytics
  async getSystemChallengesOverview(req: Request, res: Response) {
    try {
      const result = await this.adminSystemChallengesService.getSystemChallengesOverview(req.query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}