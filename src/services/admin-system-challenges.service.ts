import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminSystemChallengesService {
  constructor(private prisma: PrismaService) {}

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
      this.prisma.linkedInPost.findMany({
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
      this.prisma.linkedInPost.count({ where })
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
      this.prisma.linkedInMilestone.findMany({
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
      this.prisma.linkedInMilestone.count({ where: { status: 'PENDING' } })
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
    const milestone = await this.prisma.linkedInMilestone.update({
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
    await this.prisma.systemChallengeAudit.create({
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
    const milestone = await this.prisma.linkedInMilestone.update({
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
    await this.prisma.systemChallengeAudit.create({
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
      this.prisma.linkedInPost.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      this.prisma.linkedInPost.groupBy({
        by: ['userId'],
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }).then(result => result.length),
      this.prisma.linkedInMilestone.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      this.prisma.linkedInMilestone.count({
        where: {
          status: 'PENDING',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      this.prisma.linkedInMilestone.count({
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      this.prisma.linkedInMilestone.aggregate({
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
      this.prisma.facebookPost.findMany({
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
      this.prisma.facebookPost.count({ where })
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
      this.prisma.facebookMilestone.findMany({
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
      this.prisma.facebookMilestone.count({ where: { status: 'PENDING' } })
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
    const milestone = await this.prisma.facebookMilestone.update({
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

    await this.prisma.systemChallengeAudit.create({
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
    const milestone = await this.prisma.facebookMilestone.update({
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

    await this.prisma.systemChallengeAudit.create({
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
      this.prisma.twitterPost.findMany({
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
      this.prisma.twitterPost.count({ where })
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
      this.prisma.twitterMilestone.findMany({
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
      this.prisma.twitterMilestone.count({ where: { status: 'PENDING' } })
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
    const milestone = await this.prisma.twitterMilestone.update({
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

    await this.prisma.systemChallengeAudit.create({
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
      this.prisma.contentCreatorPost.findMany({
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
      this.prisma.contentCreatorPost.count({ where })
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
    const post = await this.prisma.contentCreatorPost.update({
      where: { id: postId },
      data: {
        status: 'APPROVED',
        adminNotes: notes
      }
    });

    await this.prisma.systemChallengeAudit.create({
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
    const post = await this.prisma.contentCreatorPost.update({
      where: { id: postId },
      data: {
        status: 'REJECTED',
        adminNotes: reason
      }
    });

    await this.prisma.systemChallengeAudit.create({
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
      this.prisma.referral.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      this.prisma.referral.count({
        where: {
          status: 'COMPLETED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      this.prisma.referral.aggregate({
        _sum: { rewardAmount: true },
        where: {
          status: 'COMPLETED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }).then(result => result._sum.rewardAmount || 0),
      this.prisma.referral.groupBy({
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
      this.prisma.referral.findMany({
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
      this.prisma.referral.count({ where })
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
    // Similar to LinkedIn analytics but for Facebook
    return { data: { totalPosts: 0, totalParticipants: 0, totalMilestones: 0, pendingMilestones: 0, approvedMilestones: 0, totalEarnings: 0 } };
  }

  private async getTwitterAnalytics(query: any) {
    // Similar to LinkedIn analytics but for Twitter
    return { data: { totalPosts: 0, totalParticipants: 0, totalMilestones: 0, pendingMilestones: 0, approvedMilestones: 0, totalEarnings: 0 } };
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
      this.prisma.contentCreatorPost.count({
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }),
      this.prisma.contentCreatorPost.count({
        where: {
          status: 'PENDING',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      this.prisma.contentCreatorPost.count({
        where: {
          status: 'APPROVED',
          ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
        }
      }),
      this.prisma.contentCreatorPost.aggregate({
        _sum: { views: true },
        where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {}
      }).then(result => result._sum.views || 0),
      this.prisma.contentCreatorPost.aggregate({
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