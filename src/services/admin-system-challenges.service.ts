import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';

export class AdminSystemChallengesService {

  // LinkedIn Ambassador Management
  async getLinkedInParticipants(query: any) {
    const { page = 1, limit = 20, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const [posts, total] = await Promise.all([
      prisma.linkedInPost.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.linkedInPost.count({ where })
    ]);

    return {
      success: true,
      data: {
        posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getPendingLinkedInMilestones(query: any) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [milestones, total] = await Promise.all([
      prisma.linkedInMilestone.findMany({
        where: { status: 'PENDING' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.linkedInMilestone.count({ where: { status: 'PENDING' } })
    ]);

    return {
      success: true,
      data: {
        milestones,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async approveLinkedInMilestone(milestoneId: string, adminId: string, notes?: string) {
    const milestone = await prisma.linkedInMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        metadata: {
          reviewedBy: adminId,
          reviewedAt: new Date(),
          notes: notes || null
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Create audit log
    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'LINKEDIN',
        action: 'APPROVE_MILESTONE',
        adminId,
        userId: milestone.userId,
        resourceId: milestoneId,
        metadata: { notes }
      }
    });

    return { success: true, data: milestone };
  }

  async rejectLinkedInMilestone(milestoneId: string, adminId: string, reason: string) {
    const milestone = await prisma.linkedInMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'REJECTED',
        metadata: {
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason: reason
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Create audit log
    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'LINKEDIN',
        action: 'REJECT_MILESTONE',
        adminId,
        userId: milestone.userId,
        resourceId: milestoneId,
        metadata: { reason }
      }
    });

    return { success: true, data: milestone };
  }

  async getLinkedInAnalytics(query: any) {
    const { startDate, endDate } = query;
    const dateFilter: any = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [
      totalPosts,
      totalParticipants,
      totalMilestones,
      pendingMilestones,
      approvedMilestones,
      totalEarnings
    ] = await Promise.all([
      prisma.linkedInPost.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.linkedInPost.groupBy({
        by: ['userId'],
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }).then(result => result.length),
      prisma.linkedInMilestone.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.linkedInMilestone.count({
        where: {
          status: 'PENDING',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.linkedInMilestone.count({
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.linkedInMilestone.aggregate({
        _sum: { amount: true },
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }).then(result => result._sum.amount || 0)
    ]);

    return {
      success: true,
      data: {
        totalPosts,
        totalParticipants,
        totalMilestones,
        pendingMilestones,
        approvedMilestones,
        totalEarnings
      }
    };
  }

  // Facebook Ambassador Management
  async getFacebookParticipants(query: any) {
    const { page = 1, limit = 20, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const [posts, total] = await Promise.all([
      prisma.facebookPost.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.facebookPost.count({ where })
    ]);

    return {
      success: true,
      data: {
        posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getPendingFacebookMilestones(query: any) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [milestones, total] = await Promise.all([
      prisma.facebookMilestone.findMany({
        where: { status: 'PENDING' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.facebookMilestone.count({ where: { status: 'PENDING' } })
    ]);

    return {
      success: true,
      data: {
        milestones,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async approveFacebookMilestone(milestoneId: string, adminId: string, notes?: string) {
    const milestone = await prisma.facebookMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        metadata: {
          reviewedBy: adminId,
          reviewedAt: new Date(),
          notes: notes || null
        }
      }
    });

    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'FACEBOOK',
        action: 'APPROVE_MILESTONE',
        adminId,
        userId: milestone.userId,
        resourceId: milestoneId,
        metadata: { notes }
      }
    });

    return { success: true, data: milestone };
  }

  async rejectFacebookMilestone(milestoneId: string, adminId: string, reason: string) {
    const milestone = await prisma.facebookMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'REJECTED',
        metadata: {
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason: reason
        }
      }
    });

    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'FACEBOOK',
        action: 'REJECT_MILESTONE',
        adminId,
        userId: milestone.userId,
        resourceId: milestoneId,
        metadata: { reason }
      }
    });

    return { success: true, data: milestone };
  }

  // Twitter Ambassador Management
  async getTwitterParticipants(query: any) {
    const { page = 1, limit = 20, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const [posts, total] = await Promise.all([
      prisma.twitterPost.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.twitterPost.count({ where })
    ]);

    return {
      success: true,
      data: {
        posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getPendingTwitterMilestones(query: any) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [milestones, total] = await Promise.all([
      prisma.twitterMilestone.findMany({
        where: { status: 'PENDING' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.twitterMilestone.count({ where: { status: 'PENDING' } })
    ]);

    return {
      success: true,
      data: {
        milestones,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async approveTwitterMilestone(milestoneId: string, adminId: string, notes?: string) {
    const milestone = await prisma.twitterMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        metadata: {
          reviewedBy: adminId,
          reviewedAt: new Date(),
          notes: notes || null
        }
      }
    });

    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'TWITTER',
        action: 'APPROVE_MILESTONE',
        adminId,
        userId: milestone.userId,
        resourceId: milestoneId,
        metadata: { notes }
      }
    });

    return { success: true, data: milestone };
  }

  // Content Creator Management
  async getContentCreatorPosts(query: any) {
    const { page = 1, limit = 20, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { user: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } }
          ]
        }}
      ];
    }

    const [posts, total] = await Promise.all([
      prisma.contentCreatorPost.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.contentCreatorPost.count({ where })
    ]);

    return {
      success: true,
      data: {
        posts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async approveContentCreatorPost(postId: string, adminId: string, notes?: string) {
    const post = await prisma.contentCreatorPost.update({
      where: { id: postId },
      data: {
        status: 'APPROVED',
        adminNotes: notes
      }
    });

    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'CONTENT_CREATOR',
        action: 'APPROVE_POST',
        adminId,
        userId: post.userId,
        resourceId: postId,
        metadata: { notes }
      }
    });

    return { success: true, data: post };
  }

  async rejectContentCreatorPost(postId: string, adminId: string, reason: string) {
    const post = await prisma.contentCreatorPost.update({
      where: { id: postId },
      data: {
        status: 'REJECTED',
        adminNotes: reason
      }
    });

    await prisma.systemChallengeAudit.create({
      data: {
        challengeType: 'CONTENT_CREATOR',
        action: 'REJECT_POST',
        adminId,
        userId: post.userId,
        resourceId: postId,
        metadata: { reason }
      }
    });

    return { success: true, data: post };
  }

  // Referral Challenge Management
  async getReferralStats(query: any) {
    const { startDate, endDate } = query;
    const dateFilter: any = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [
      totalReferrals,
      successfulReferrals,
      totalEarnings,
      topReferrers
    ] = await Promise.all([
      prisma.referral.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.referral.count({
        where: {
          status: 'COMPLETED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.referral.aggregate({
        _sum: { rewardAmount: true },
        where: {
          status: 'COMPLETED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }).then(result => result._sum.rewardAmount || 0),
      prisma.referral.groupBy({
        by: ['referrerId'],
        _count: { id: true },
        _sum: { rewardAmount: true },
        where: {
          status: 'COMPLETED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      })
    ]);

    return {
      success: true,
      data: {
        totalReferrals,
        successfulReferrals,
        totalEarnings,
        topReferrers
      }
    };
  }

  async getReferralParticipants(query: any) {
    const { page = 1, limit = 20, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.referrer = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    const [referrals, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          referrer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          },
          referred: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.referral.count({ where })
    ]);

    return {
      success: true,
      data: {
        referrals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  // Bulk Operations
  async bulkApprove(type: string, ids: string[], adminId: string) {
    const results = [];

    for (const id of ids) {
      try {
        let result;
        switch (type) {
          case 'linkedin':
            result = await this.approveLinkedInMilestone(id, adminId);
            break;
          case 'facebook':
            result = await this.approveFacebookMilestone(id, adminId);
            break;
          case 'twitter':
            result = await this.approveTwitterMilestone(id, adminId);
            break;
          case 'content-creator':
            result = await this.approveContentCreatorPost(id, adminId);
            break;
          default:
            throw new Error(`Unsupported type: ${type}`);
        }
        results.push({ id, success: true, data: result.data });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    return { success: true, data: results };
  }

  // System Challenge Configuration Management
  async getSystemChallengeConfig(challengeType: string) {
    const config = await prisma.systemChallengeConfig.findUnique({
      where: { challengeType: challengeType.toUpperCase() }
    });

    if (!config) {
      // Return default config if none exists
      const defaultConfig = this.getDefaultConfig(challengeType);
      return { success: true, data: defaultConfig };
    }

    return { success: true, data: config };
  }

  async saveSystemChallengeConfig(challengeType: string, configData: any, adminId: string) {
    try {
      const config = await prisma.systemChallengeConfig.upsert({
        where: { challengeType: challengeType.toUpperCase() },
        update: {
          isActive: configData.isActive,
          milestoneTargets: configData.milestones || [],
          rewardAmounts: configData.milestones?.reduce((acc: any, m: any) => {
            acc[m.type] = m.reward;
            return acc;
          }, {}) || {},
          settings: {
            title: configData.title,
            description: configData.description,
            maxParticipants: configData.maxParticipants,
            startDate: configData.startDate,
            endDate: configData.endDate,
            autoApproval: configData.autoApproval,
            verificationRequired: configData.verificationRequired
          },
          resources: configData.resources || [],
          updatedAt: new Date()
        },
        create: {
          challengeType: challengeType.toUpperCase(),
          isActive: configData.isActive,
          milestoneTargets: configData.milestones || [],
          rewardAmounts: configData.milestones?.reduce((acc: any, m: any) => {
            acc[m.type] = m.reward;
            return acc;
          }, {}) || {},
          settings: {
            title: configData.title,
            description: configData.description,
            maxParticipants: configData.maxParticipants,
            startDate: configData.startDate,
            endDate: configData.endDate,
            autoApproval: configData.autoApproval,
            verificationRequired: configData.verificationRequired
          },
          resources: configData.resources || []
        }
      });

      // Try to create audit log, but don't fail if it doesn't work
      try {
        await prisma.systemChallengeAudit.create({
          data: {
            challengeType: challengeType.toUpperCase(),
            action: 'UPDATE_CONFIG',
            adminId,
            metadata: { configData }
          }
        });
      } catch (auditError) {
        logger.error('Failed to create audit log:', auditError);
      }

      return { success: true, data: config };
    } catch (error: any) {
      logger.error('Error saving system challenge config:', error);
      throw error;
    }
  }

  private getDefaultConfig(challengeType: string) {
    const defaults: any = {
      linkedin: {
        isActive: true,
        title: 'LinkedIn Ambassador Program',
        description: 'Promote NairaGig on LinkedIn and earn rewards for engagement milestones',
        milestones: [
          { id: '1', type: 'REACTIONS', target: 50, reward: 5000, description: 'Get 50 reactions on your post' },
          { id: '2', type: 'COMMENTS', target: 25, reward: 5000, description: 'Get 25 comments on your post' }
        ],
        maxParticipants: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        autoApproval: false,
        verificationRequired: true,
        resources: []
      },
      twitter: {
        isActive: true,
        title: 'Twitter Ambassador Program',
        description: 'Promote NairaGig on Twitter and earn rewards for engagement milestones',
        milestones: [
          { id: '1', type: 'REACTIONS', target: 50, reward: 5000, description: 'Get 50 reactions on your post' },
          { id: '2', type: 'COMMENTS', target: 25, reward: 5000, description: 'Get 25 comments on your post' }
        ],
        maxParticipants: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        autoApproval: false,
        verificationRequired: true,
        resources: []
      },
      facebook: {
        isActive: true,
        title: 'Facebook Ambassador Program',
        description: 'Promote NairaGig on Facebook and earn rewards for engagement milestones',
        milestones: [
          { id: '1', type: 'REACTIONS', target: 50, reward: 5000, description: 'Get 50 reactions on your post' },
          { id: '2', type: 'COMMENTS', target: 25, reward: 5000, description: 'Get 25 comments on your post' }
        ],
        maxParticipants: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        autoApproval: false,
        verificationRequired: true,
        resources: []
      },
      referral: {
        isActive: true,
        title: 'Referral Program',
        description: 'Refer new users to NairaGig and earn rewards',
        milestones: [
          { id: '1', type: 'REFERRALS', target: 5, reward: 10000, description: 'Refer 5 new users' },
          { id: '2', type: 'REFERRALS', target: 10, reward: 25000, description: 'Refer 10 new users' }
        ],
        maxParticipants: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        autoApproval: false,
        verificationRequired: true,
        resources: []
      },
      'content-creator': {
        isActive: true,
        title: 'Content Creator Program',
        description: 'Create quality content about NairaGig and earn rewards',
        milestones: [
          { id: '1', type: 'POSTS', target: 3, reward: 7500, description: 'Create 3 quality posts' }
        ],
        maxParticipants: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        autoApproval: false,
        verificationRequired: true,
        resources: []
      }
    };

    return defaults[challengeType] || defaults.linkedin;
  }

  // Overall Analytics
  async getSystemChallengesOverview(query: any) {
    const { startDate, endDate } = query;
    const dateFilter: any = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [
      linkedInStats,
      facebookStats,
      twitterStats,
      contentCreatorStats,
      referralStats
    ] = await Promise.all([
      this.getLinkedInAnalytics(query),
      this.getFacebookAnalytics(query),
      this.getTwitterAnalytics(query),
      this.getContentCreatorAnalytics(query),
      this.getReferralStats(query)
    ]);

    return {
      success: true,
      data: {
        linkedin: linkedInStats.data,
        facebook: facebookStats.data,
        twitter: twitterStats.data,
        contentCreator: contentCreatorStats.data,
        referral: referralStats.data
      }
    };
  }

  private async getFacebookAnalytics(query: any) {
    const { startDate, endDate } = query;
    const dateFilter: any = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [
      totalPosts,
      totalParticipants,
      totalMilestones,
      pendingMilestones,
      approvedMilestones,
      totalEarnings
    ] = await Promise.all([
      prisma.facebookPost.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.facebookPost.groupBy({
        by: ['userId'],
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }).then(result => result.length),
      prisma.facebookMilestone.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.facebookMilestone.count({
        where: {
          status: 'PENDING',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.facebookMilestone.count({
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.facebookMilestone.aggregate({
        _sum: { amount: true },
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }).then(result => result._sum.amount || 0)
    ]);

    return {
      data: {
        totalPosts,
        totalParticipants,
        totalMilestones,
        pendingMilestones,
        approvedMilestones,
        totalEarnings
      }
    };
  }

  private async getTwitterAnalytics(query: any) {
    const { startDate, endDate } = query;
    const dateFilter: any = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [
      totalPosts,
      totalParticipants,
      totalMilestones,
      pendingMilestones,
      approvedMilestones,
      totalEarnings
    ] = await Promise.all([
      prisma.twitterPost.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.twitterPost.groupBy({
        by: ['userId'],
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }).then(result => result.length),
      prisma.twitterMilestone.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.twitterMilestone.count({
        where: {
          status: 'PENDING',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.twitterMilestone.count({
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.twitterMilestone.aggregate({
        _sum: { amount: true },
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }).then(result => result._sum.amount || 0)
    ]);

    return {
      data: {
        totalPosts,
        totalParticipants,
        totalMilestones,
        pendingMilestones,
        approvedMilestones,
        totalEarnings
      }
    };
  }

  private async getContentCreatorAnalytics(query: any) {
    const { startDate, endDate } = query;
    const dateFilter: any = {};
    
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [
      totalPosts,
      pendingPosts,
      approvedPosts,
      totalViews,
      totalEarnings
    ] = await Promise.all([
      prisma.contentCreatorPost.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      prisma.contentCreatorPost.count({
        where: {
          status: 'PENDING',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.contentCreatorPost.count({
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      prisma.contentCreatorPost.aggregate({
        _sum: { views: true },
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }).then(result => result._sum.views || 0),
      prisma.contentCreatorPost.aggregate({
        _sum: { totalEarnings: true },
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }).then(result => result._sum.totalEarnings || 0)
    ]);

    return {
      data: {
        totalPosts,
        pendingPosts,
        approvedPosts,
        totalViews,
        totalEarnings
      }
    };
  }
}