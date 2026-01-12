import { PrismaClient, UserStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { createSuccessResponse, createErrorResponse, handleControllerError } from '../types/api.types';
import { emailService } from './email.service';
import { pushNotificationService } from './pushNotification.service';

const prisma = new PrismaClient();

export class AdminUserService {
  // Get user statistics
  async getUserStats() {
    const [totalUsers, activeUsers, verifiedUsers, adminUsers, suspendedUsers, deletedUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { isVerified: true, status: { not: UserStatus.DELETED } } }),
      prisma.user.count({ where: { role: UserRole.ADMIN, status: { not: UserStatus.DELETED } } }),
      prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      prisma.user.count({ where: { status: UserStatus.DELETED } })
    ]);

    return {
      totalUsers,
      activeUsers,
      verifiedUsers,
      adminUsers,
      suspendedUsers,
      deletedUsers
    };
  }

  // Get comprehensive user details in one call
  async getUserDetails(userId: string) {
    const [user, documents, jobs, challenges, wallet, transactions, paymentMethods, subscription, paymentHistory, activity, sponsorships] = await Promise.allSettled([
      this.getUserById(userId),
      this.getUserDocuments(userId, 1, 10),
      this.getUserJobs(userId, 1, 10),
      this.getUserChallenges(userId, 1, 10),
      this.getUserWallet(userId),
      this.getUserTransactions(userId, 1, 10),
      this.getUserPaymentMethods(userId),
      this.getUserSubscription(userId),
      this.getUserPaymentHistory(userId, 1, 10),
      this.getUserActivity(userId, { limit: 20 }),
      this.getUserSponsorships(userId, 1, 10)
    ]);

    return {
      user: user.status === 'fulfilled' ? user.value : null,
      documents: documents.status === 'fulfilled' ? documents.value : { documents: [], pagination: {} },
      jobs: jobs.status === 'fulfilled' ? jobs.value : { jobs: [], pagination: {} },
      challenges: challenges.status === 'fulfilled' ? challenges.value : { challenges: [], pagination: {} },
      wallet: wallet.status === 'fulfilled' ? wallet.value : { wallet: {} },
      transactions: transactions.status === 'fulfilled' ? transactions.value : { transactions: [], pagination: {} },
      paymentMethods: paymentMethods.status === 'fulfilled' ? paymentMethods.value : { paymentMethods: [] },
      subscription: subscription.status === 'fulfilled' ? subscription.value : { subscription: null },
      paymentHistory: paymentHistory.status === 'fulfilled' ? paymentHistory.value : { paymentHistory: [], pagination: {} },
      activity: activity.status === 'fulfilled' ? activity.value : [],
      sponsorships: sponsorships.status === 'fulfilled' ? sponsorships.value : { sponsorships: [], pagination: {} }
    };
  }

  // Get user sponsorships
  async getUserSponsorships(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    
    const sponsorships = await prisma.sponsorship.findMany({
      where: { userId },
      include: {
        campaign: {
          select: {
            title: true,
            description: true,
            budget: true,
            startDate: true,
            endDate: true,
            status: true
          }
        },
        sponsor: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    const total = await prisma.sponsorship.count({ where: { userId } });
    
    return {
      sponsorships,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get users with pagination and filters
  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: UserStatus;
    role?: UserRole;
    includeDeleted?: boolean;
  }) {
    const { page = 1, limit = 20, search, status, role, includeDeleted = false } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    // Exclude deleted users by default
    if (!includeDeleted) {
      where.status = { not: UserStatus.DELETED };
    }
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status && status !== UserStatus.DELETED) where.status = status;
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          deletedAt: true,
          isVerified: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          kycVerifiedAt: true,
          wallets: {
            select: {
              totalEarned: true
            }
          },
          verification: {
            select: {
              status: true
            }
          },
          _count: {
            select: {
              jobs: true,
              awardedJobs: true,
              applications: true,
              transactions: true
            }
          },
          awardedJobs: {
            where: {
              status: 'COMPLETED'
            },
            select: {
              id: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    const usersWithEarnings = users.map(user => {
      const totalEarnings = user.wallets.reduce((sum, wallet) => sum + Number(wallet.totalEarned), 0);
      const isActive = user.status === 'ACTIVE';
      
      let totalJobs = 0;
      let completedJobs = 0;
      
      if (user.role === 'CLIENT') {
        totalJobs = user._count.jobs;
        completedJobs = 0;
      } else if (user.role === 'FREELANCER') {
        totalJobs = user._count.awardedJobs;
        completedJobs = user.awardedJobs.length;
      }
      
      const isFullyVerified = user.isVerified && 
        user.emailVerifiedAt && 
        (user.verification?.status === 'APPROVED' || user.kycVerifiedAt);
      
      return {
        ...user,
        totalEarnings,
        isActive,
        isVerified: isFullyVerified || user.isVerified,
        totalJobs,
        completedJobs,
        isDeleted: user.status === UserStatus.DELETED,
        // Ensure status is properly returned
        status: user.status,
        awardedJobs: undefined,
        jobs: undefined
      };
    });

    return {
      users: usersWithEarnings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Create user
  async createUser(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role: UserRole;
    password: string;
  }, adminId: string) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password - Note: User model doesn't have password field in schema
    // This would need to be added to the User model or handled differently
    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phone,
        role: data.role,
        status: UserStatus.ACTIVE,
        isVerified: true // Admin-created users are auto-verified
      }
    });

    await this.logAdminAction(adminId, 'CREATE_USER', 'User', user.id, { email: data.email });
    return user;
  }

  // Update user
  async updateUser(userId: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    role?: UserRole;
    isActive?: boolean;
    isVerified?: boolean;
  }, adminId: string) {
    const updateData: any = {};
    
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.email) updateData.email = data.email;
    if (data.phone) updateData.phoneNumber = data.phone;
    if (data.role) updateData.role = data.role;
    if (data.isVerified !== undefined) updateData.isVerified = data.isVerified;
    if (data.isActive !== undefined) {
      updateData.status = data.isActive ? UserStatus.ACTIVE : UserStatus.SUSPENDED;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    await this.logAdminAction(adminId, 'UPDATE_USER', 'User', userId, data);
    return user;
  }

  // Update user status
  async updateUserStatus(userId: string, data: { isActive?: boolean; role?: UserRole }, adminId: string) {
    const updateData: any = {};
    
    if (data.isActive !== undefined) {
      updateData.status = data.isActive ? UserStatus.ACTIVE : UserStatus.SUSPENDED;
      if (!data.isActive) {
        updateData.suspendedAt = new Date();
      } else {
        updateData.suspendedAt = null;
      }
    }
    
    if (data.role) {
      updateData.role = data.role;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    await this.logAdminAction(adminId, 'UPDATE_USER_STATUS', 'User', userId, data);
    return user;
  }

  // Soft delete user with data anonymization
  async softDeleteUser(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    if (user.status === UserStatus.DELETED) {
      throw new Error('User is already deleted');
    }

    // Check for active projects
    const activeProjects = await prisma.project.count({
      where: {
        OR: [{ clientId: userId }, { freelancerId: userId }],
        status: { in: ['PLANNING', 'ACTIVE'] }
      }
    });

    if (activeProjects > 0) {
      throw new Error('Cannot delete user with active projects. Please complete or cancel projects first.');
    }

    // Store original data for potential restoration
    const originalData = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      bio: user.bio,
      profileImageUrl: user.profileImageUrl,
      coverImageUrl: user.coverImageUrl,
      address: user.address,
      city: user.city,
      state: user.state,
      country: user.country,
      websiteUrl: user.websiteUrl,
      portfolioUrl: user.portfolioUrl
    };

    const deletionDate = new Date();
    const retentionPeriod = '30';
    const appealDeadline = new Date(deletionDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const permanentDeletionDate = new Date(deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const referenceId = `DEL-${userId.substring(0, 8).toUpperCase()}-${Date.now()}`;

    // Send deletion notification email before anonymizing data
    try {
      // TODO: Implement email service
      console.log(`Account deletion notification would be sent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send deletion notification email:', emailError);
      // Continue with deletion even if email fails
    }

    // Soft delete with data anonymization
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DELETED,
        deletedAt: deletionDate,
        email: `deleted_${userId}@anonymized.local`,
        firstName: 'Deleted',
        lastName: 'User',
        phoneNumber: null,
        bio: null,
        profileImageUrl: null,
        coverImageUrl: null,
        address: null,
        city: null,
        state: null,
        country: null,
        websiteUrl: null,
        portfolioUrl: null
      }
    });

    // Deactivate sessions and cancel subscriptions
    await Promise.all([
      prisma.userSession.updateMany({
        where: { userId },
        data: { isActive: false }
      }),
      prisma.subscription.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'CANCELED', canceledAt: new Date() }
      })
    ]);

    await this.logAdminAction(adminId, 'SOFT_DELETE_USER', 'User', userId, {
      originalData,
      referenceId,
      retentionPeriod,
      appealDeadline: appealDeadline.toISOString(),
      permanentDeletionDate: permanentDeletionDate.toISOString()
    });
  }

  // Get user details
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        bio: true,
        hourlyRate: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        authProvider: true,
        address: true,
        availabilityStatus: true,
        city: true,
        country: true,
        coverImageUrl: true,
        dateOfBirth: true,
        deletedAt: true,
        displayName: true,
        emailVerifiedAt: true,
        experiencePoints: true,
        gender: true,
        kycVerifiedAt: true,
        lastActiveAt: true,
        level: true,
        loginCount: true,
        phoneVerifiedAt: true,
        portfolioUrl: true,
        profileImageUrl: true,
        reputationScore: true,
        state: true,
        subscriptionExpiresAt: true,
        subscriptionTier: true,
        timezone: true,
        title: true,
        twoFactorEnabled: true,
        websiteUrl: true,
        yearsOfExperience: true,
        specialty: true,
        referralCode: true,
        isVerified: true,
        suspendedAt: true,
        wallets: true,
        skills: true,
        verification: true,
        _count: {
          select: {
            jobs: true,
            awardedJobs: true,
            applications: true,
            transactions: true,
            reviews: true
          }
        },
        awardedJobs: {
          where: {
            status: 'COMPLETED'
          },
          select: {
            id: true
          }
        },
        jobs: {
          where: {
            status: 'COMPLETED'
          },
          select: {
            id: true
          }
        }
      }
    });

    if (user) {
      // Calculate totalEarnings from wallet data
      const totalEarnings = user.wallets.reduce((sum, wallet) => sum + Number(wallet.totalEarned), 0);
      
      // Calculate job statistics based on role
      let totalJobs = 0;
      let completedJobs = 0;
      
      if (user.role === 'CLIENT') {
        // For clients: count jobs they created
        totalJobs = user._count.jobs;
        // For clients: count their completed jobs
        completedJobs = user.jobs.length;
      } else if (user.role === 'FREELANCER') {
        // For freelancers: count jobs awarded to them
        totalJobs = user._count.awardedJobs;
        // For freelancers: count completed awarded jobs
        completedJobs = user.awardedJobs.length;
      }
      
      return {
        ...user,
        totalEarnings,
        isActive: user.status === 'ACTIVE',
        totalJobs,
        completedJobs,
        // Clean up the temporary fields
        awardedJobs: undefined,
        jobs: undefined
      };
    }

    return user;
  }

  // Suspend user
  async suspendUser(userId: string, adminId: string, reason?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.SUSPENDED,
        suspendedAt: new Date()
      }
    });

    // Send suspension notification email
    try {
      await emailService.sendAccountSuspension(user.firstName, user.email, {
        reason: reason || 'Account suspended by administrator',
        duration: 'Indefinite',
        referenceId: `SUSP-${userId.substring(0, 8).toUpperCase()}-${Date.now()}`,
        reviewDate: 'To be determined',
        violationDetails: reason || 'Administrative action',
        policySection: 'Terms of Service',
        reviewPeriod: '7-14 business days',
        appealDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        appealUrl: `${process.env.FRONTEND_URL}/appeal`,
        accountBalance: '0' // Would need to calculate actual balance
      });
    } catch (emailError) {
      console.error('Failed to send suspension notification email:', emailError);
    }

    await this.logAdminAction(adminId, 'SUSPEND_USER', 'User', userId, { reason });
    return updatedUser;
  }

  // Activate user
  async activateUser(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        suspendedAt: null
      }
    });

    // Send activation notification email
    try {
      await emailService.sendAccountActivation(user.firstName, user.email);
    } catch (emailError) {
      console.error('Failed to send activation notification email:', emailError);
    }

    await this.logAdminAction(adminId, 'ACTIVATE_USER', 'User', userId);
    return updatedUser;
  }

  // Verify user
  async verifyUser(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true }
    });

    // Send verification notification email
    try {
      await emailService.sendAccountVerification(user.firstName, user.email);
    } catch (emailError) {
      console.error('Failed to send verification notification email:', emailError);
    }

    await this.logAdminAction(adminId, 'VERIFY_USER', 'User', userId);
    return updatedUser;
  }

  // Unverify user
  async unverifyUser(userId: string, adminId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isVerified: false }
    });

    await this.logAdminAction(adminId, 'UNVERIFY_USER', 'User', userId);
    return user;
  }

  // Reset user password - Password field doesn't exist in current schema
  async resetUserPassword(userId: string, adminId: string) {
    const temporaryPassword = crypto.randomBytes(8).toString('hex');
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, email: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Send password reset email with temporary password
    try {
      await emailService.sendPasswordReset(user.firstName, user.email, {
        temporaryPassword,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password`,
        expiresIn: '24 hours'
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
    }
    
    await this.logAdminAction(adminId, 'RESET_PASSWORD', 'User', userId, { temporaryPassword });
    return { temporaryPassword };
  }

  // Get user activity
  async getUserActivity(userId: string, params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    // Get audit logs for this user
    const activities = await prisma.adminAuditLog.findMany({
      where: { resourceId: userId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return activities;
  }

  // Get deleted users backup data for recovery
  async getDeletedUsersBackup(adminId: string, params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const backups = await prisma.adminAuditLog.findMany({
      where: {
        action: 'PERMANENT_DELETE_BACKUP',
        resource: 'User'
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    const total = await prisma.adminAuditLog.count({
      where: {
        action: 'PERMANENT_DELETE_BACKUP',
        resource: 'User'
      }
    });

    return {
      backups: backups.map(backup => ({
        id: backup.id,
        userId: backup.resourceId,
        userBackup: backup.metadata.userBackup,
        deletedAt: backup.createdAt,
        deletedBy: backup.admin
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Bulk actions
  async bulkAction(userIds: string[], action: string, adminId: string) {
    const results = [];

    for (const userId of userIds) {
      try {
        switch (action) {
          case 'activate':
            await this.activateUser(userId, adminId);
            break;
          case 'deactivate':
            await this.suspendUser(userId, adminId, 'Bulk action');
            break;
          case 'verify':
            await this.verifyUser(userId, adminId);
            break;
          case 'unverify':
            await this.unverifyUser(userId, adminId);
            break;
          case 'delete':
            await this.softDeleteUser(userId, adminId);
            break;
          case 'restore':
            await this.restoreUser(userId, adminId);
            break;
          case 'permanently_delete':
            await this.permanentlyDeleteUser(userId, adminId);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        results.push({ userId, success: true });
      } catch (error: any) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    await this.logAdminAction(adminId, 'BULK_ACTION', 'User', 'multiple', { action, userIds, results });
    return results;
  }

  // Export users
  async exportUsers(params: { format: string; filters: any; selectedUserIds?: string[] }) {
    const { format, filters, selectedUserIds } = params;
    
    const where: any = {};
    
    // Only add filters if they have values to prevent Prisma validation errors
    if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
      where.status = filters.status[0]; // Take first status
    }
    if (filters.role && Array.isArray(filters.role) && filters.role.length > 0) {
      where.role = filters.role[0]; // Take first role
    }
    if (filters.verified !== undefined) {
      where.isVerified = filters.verified;
    }
    if (filters.search && filters.search.trim()) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } }
      ];
    }
    
    // If specific users are selected, filter by those IDs
    if (selectedUserIds && selectedUserIds.length > 0) {
      where.id = { in: selectedUserIds };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        status: true,
        isVerified: true,
        createdAt: true,
        lastLoginAt: true,
        wallets: {
          select: {
            totalEarned: true,
            availableBalance: true
          }
        },
        _count: {
          select: {
            jobs: true,
            awardedJobs: true,
            applications: true,
            transactions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const exportData = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber || '',
      role: user.role,
      status: user.status,
      isVerified: user.isVerified ? 'Yes' : 'No',
      totalEarnings: user.wallets.reduce((sum, wallet) => sum + Number(wallet.totalEarned), 0),
      availableBalance: user.wallets.reduce((sum, wallet) => sum + Number(wallet.availableBalance), 0),
      totalJobs: user._count.jobs + user._count.awardedJobs,
      totalApplications: user._count.applications,
      totalTransactions: user._count.transactions,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() || 'Never'
    }));

    if (format === 'csv') {
      const headers = [
        'ID', 'Email', 'First Name', 'Last Name', 'Phone', 'Role', 'Status', 
        'Verified', 'Total Earnings', 'Available Balance', 'Total Jobs', 
        'Applications', 'Transactions', 'Created At', 'Last Login'
      ];
      const rows = exportData.map(user => [
        user.id,
        user.email,
        user.firstName,
        user.lastName,
        user.phoneNumber,
        user.role,
        user.status,
        user.isVerified,
        user.totalEarnings,
        user.availableBalance,
        user.totalJobs,
        user.totalApplications,
        user.totalTransactions,
        user.createdAt,
        user.lastLoginAt
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(exportData, null, 2);
  }

  private async logAdminAction(adminId: string, action: string, resource: string, resourceId: string, metadata?: any) {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        resource,
        resourceId,
        metadata: metadata || {},
        ipAddress: 'system',
        performedBy: adminId
      }
    });
  }

  // Restore soft-deleted user
  async restoreUser(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.status !== UserStatus.DELETED) {
      throw new Error('User is not deleted and cannot be restored');
    }

    // Get original data from audit log
    const auditLog = await prisma.adminAuditLog.findFirst({
      where: {
        action: 'SOFT_DELETE_USER',
        resourceId: userId
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!auditLog?.metadata?.originalData) {
      throw new Error('Original user data not found. Cannot restore user.');
    }

    const originalData = auditLog.metadata.originalData;
    const restorationDate = new Date();
    const referenceId = auditLog.metadata.referenceId || `RES-${userId.substring(0, 8).toUpperCase()}-${Date.now()}`;

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.SUSPENDED, // Restore to suspended for review
        deletedAt: null,
        email: originalData.email,
        firstName: originalData.firstName,
        lastName: originalData.lastName,
        phoneNumber: originalData.phoneNumber,
        bio: originalData.bio,
        profileImageUrl: originalData.profileImageUrl,
        coverImageUrl: originalData.coverImageUrl,
        address: originalData.address,
        city: originalData.city,
        state: originalData.state,
        country: originalData.country,
        websiteUrl: originalData.websiteUrl,
        portfolioUrl: originalData.portfolioUrl
      }
    });

    // Send restoration notification email
    try {
      await emailService.sendAccountRestoration(originalData.firstName, originalData.email, {
        restorationDate: restorationDate.toLocaleDateString(),
        referenceId,
        accountStatus: 'Suspended (Under Review)'
      });
    } catch (emailError) {
      console.error('Failed to send restoration notification email:', emailError);
    }

    await this.logAdminAction(adminId, 'RESTORE_USER', 'User', userId, {
      reason: 'User account restored from deletion',
      restoredData: originalData,
      referenceId,
      restorationDate: restorationDate.toISOString()
    });
  }

  // Permanently delete user (hard delete) - Super Admin only
  async permanentlyDeleteUser(userId: string, adminId: string) {
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: {
        wallets: true,
        skills: true,
        verification: true,
        _count: {
          select: {
            jobs: true,
            awardedJobs: true,
            applications: true,
            transactions: true
          }
        }
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== UserStatus.DELETED) {
      throw new Error('User must be soft-deleted first');
    }

    // Check retention period (e.g., 30 days)
    const retentionPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    const deletedDate = user.deletedAt?.getTime() || 0;
    const now = Date.now();
    
    if (now - deletedDate < retentionPeriod) {
      throw new Error('Cannot permanently delete user before retention period expires');
    }

    // Get original data and reference ID from soft delete audit log
    const softDeleteLog = await prisma.adminAuditLog.findFirst({
      where: {
        action: 'SOFT_DELETE_USER',
        resourceId: userId
      },
      orderBy: { createdAt: 'desc' }
    });

    const originalEmail = softDeleteLog?.metadata?.originalData?.email;
    const referenceId = softDeleteLog?.metadata?.referenceId || `PERM-${userId.substring(0, 8).toUpperCase()}-${Date.now()}`;
    const originalDeletionDate = user.deletedAt?.toLocaleDateString() || 'Unknown';

    // Send permanent deletion notification email before deleting
    if (originalEmail) {
      try {
        await emailService.sendAccountPermanentDeletion(originalEmail, {
          deletionDate: new Date().toLocaleDateString(),
          referenceId,
          originalDeletionDate,
          retentionPeriod: '30'
        });
      } catch (emailError) {
        console.error('Failed to send permanent deletion notification email:', emailError);
      }
    }

    // Create backup record before permanent deletion
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'PERMANENT_DELETE_BACKUP',
        resource: 'User',
        resourceId: userId,
        metadata: {
          userBackup: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            createdAt: user.createdAt,
            deletedAt: user.deletedAt,
            totalEarnings: user.wallets.reduce((sum, w) => sum + Number(w.totalEarned), 0),
            jobStats: user._count
          },
          reason: 'User permanently deleted - backup created for potential recovery',
          referenceId,
          originalEmail
        },
        ipAddress: 'system',
        performedBy: adminId
      }
    });

    await this.logAdminAction(adminId, 'PERMANENT_DELETE_USER', 'User', userId, {
      reason: 'User permanently deleted after retention period',
      originalEmail,
      deletedAt: user.deletedAt,
      backupCreated: true,
      referenceId
    });

    // Hard delete - this will cascade delete related data
    await prisma.user.delete({ where: { id: userId } });
  }

  // Send message to user
  async sendMessageToUser(userId: string, adminId: string, messageData: {
    subject: string;
    message: string;
    actionRequired?: boolean;
    sendEmail?: boolean;
    sendPushNotification?: boolean;
  }) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const admin = await prisma.admin.findUnique({ where: { id: adminId } });
      if (!admin) {
        throw new Error('Admin not found');
      }

      const adminName = `${admin.firstName || 'Admin'} ${admin.lastName || ''}`.trim();

      // Send email notification if requested
      if (messageData.sendEmail) {
        try {
          // Add timeout to email service call
          const emailPromise = emailService.sendAdminMessage(user.firstName, user.email, {
            subject: messageData.subject,
            message: messageData.message,
            adminName,
            sentDate: new Date().toLocaleDateString(),
            actionRequired: messageData.actionRequired
          });
          
          // Set timeout for email sending (60 seconds to match email service)
          await Promise.race([
            emailPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Email service timeout')), 60000)
            )
          ]);
        } catch (emailError) {
          console.error('Failed to send admin message email:', emailError);
          // Don't throw error, just log it and continue
        }
      }

      // Send push notification if requested
      if (messageData.sendPushNotification) {
        try {
          await pushNotificationService.sendNotification(userId, {
            title: messageData.subject,
            message: messageData.message,
            actionUrl: `${process.env.FRONTEND_URL}/messages`
          });
        } catch (pushError) {
          console.error('Failed to send push notification:', pushError);
          // Don't throw error, just log it and continue
        }
      }

      await this.logAdminAction(adminId, 'SEND_MESSAGE', 'User', userId, {
        subject: messageData.subject,
        message: messageData.message,
        actionRequired: messageData.actionRequired,
        sendEmail: messageData.sendEmail,
        sendPushNotification: messageData.sendPushNotification,
        adminName
      });

      return { success: true, message: 'Message sent successfully' };
    } catch (error: any) {
      console.error('Error in sendMessageToUser:', error);
      throw error;
    }
  }

  async getUserProjects(userId: string, page: number = 1, limit: number = 10) {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { clientId: userId },
          { freelancerId: userId }
        ]
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        freelancer: { select: { firstName: true, lastName: true } }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    const total = await prisma.project.count({
      where: {
        OR: [
          { clientId: userId },
          { freelancerId: userId }
        ]
      }
    });
    
    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getUserDocuments(userId: string, page: number = 1, limit: number = 10) {
    const documents = await prisma.document.findMany({
      where: { userId },
      include: {
        reviewer: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { uploadedAt: 'desc' }
    });
    
    const total = await prisma.document.count({ where: { userId } });
    
    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getUserJobs(userId: string, page: number = 1, limit: number = 10) {
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { clientId: userId },
          { awardedTo: userId },
          { applications: { some: { freelancerId: userId } } }
        ]
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        awardedFreelancer: { select: { firstName: true, lastName: true } },
        applications: {
          where: { freelancerId: userId },
          select: { status: true, submittedAt: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    const total = await prisma.job.count({
      where: {
        OR: [
          { clientId: userId },
          { awardedTo: userId },
          { applications: { some: { freelancerId: userId } } }
        ]
      }
    });
    
    return {
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getUserChallenges(userId: string, page: number = 1, limit: number = 10) {
    const challenges = await prisma.challengeParticipant.findMany({
      where: { userId },
      include: {
        challenge: {
          select: {
            title: true,
            category: true,
            totalPrizePool: true,
            registrationStart: true,
            registrationEnd: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { registeredAt: 'desc' }
    });
    
    const total = await prisma.challengeParticipant.count({ where: { userId } });
    
    return {
      challenges,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getUserTransactions(userId: string, page: number = 1, limit: number = 10) {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    const total = await prisma.transaction.count({ where: { userId } });
    
    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getUserWallet(userId: string) {
    const wallet = await prisma.wallet.findFirst({
      where: { userId },
      include: {
        transactions: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    return {
      wallet: wallet || {
        availableBalance: 0,
        pendingBalance: 0,
        escrowBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        currency: 'NGN'
      }
    };
  }

  async getUserPaymentMethods(userId: string) {
    try {
      const paymentMethods = await prisma.paymentMethod.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
      });

      return {
        paymentMethods
      };
    } catch (error) {
      console.error('Error fetching user payment methods:', error);
      return {
        paymentMethods: []
      };
    }
  }

  async getUserSubscription(userId: string) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: { 
          userId,
          status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }
        },
        include: {
          plan: true,
          paymentMethod: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        subscription
      };
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      return {
        subscription: null
      };
    }
  }

  async getUserPaymentHistory(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const paymentHistory = await prisma.paymentHistory.findMany({
        where: { userId },
        include: {
          subscription: {
            include: { plan: true }
          },
          paymentMethod: true
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      });

      const total = await prisma.paymentHistory.count({
        where: { userId }
      });

      return {
        paymentHistory,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching user payment history:', error);
      return {
        paymentHistory: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      };
    }
  }

  // Send email to individual user
  async sendEmailToUser(userId: string, adminId: string, emailData: {
    subject: string;
    message: string;
  }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin not found');
    }

    const adminName = `${admin.firstName || 'Admin'} ${admin.lastName || ''}`.trim();

    try {
      await emailService.sendAdminMessage(user.firstName, user.email, {
        subject: emailData.subject,
        message: emailData.message,
        adminName,
        sentDate: new Date().toLocaleDateString(),
        actionRequired: false
      });

      await this.logAdminAction(adminId, 'SEND_EMAIL', 'User', userId, {
        subject: emailData.subject,
        message: emailData.message,
        adminName
      });

      return { success: true, message: 'Email sent successfully' };
    } catch (error: any) {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  // Send bulk email to multiple users
  async sendBulkEmail(userIds: string[], adminId: string, emailData: {
    subject: string;
    message: string;
  }) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, email: true }
    });

    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new Error('Admin not found');
    }

    const adminName = `${admin.firstName || 'Admin'} ${admin.lastName || ''}`.trim();

    const results = [];
    for (const user of users) {
      try {
        await emailService.sendAdminMessage(user.firstName, user.email, {
          subject: emailData.subject,
          message: emailData.message,
          adminName,
          sentDate: new Date().toLocaleDateString(),
          actionRequired: false
        });
        results.push({ userId: user.id, success: true });
      } catch (error: any) {
        results.push({ userId: user.id, success: false, error: error.message });
      }
    }

    await this.logAdminAction(adminId, 'BULK_EMAIL', 'User', 'multiple', {
      subject: emailData.subject,
      message: emailData.message,
      userIds,
      results,
      adminName
    });

    return results;
  }
}