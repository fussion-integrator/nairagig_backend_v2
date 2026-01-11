import { AdminRoleType, AdminStatus, Permission } from '@prisma/client';

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRoleType;
  roleId?: string;
  department?: string;
  restrictions?: Record<string, any>;
  status: AdminStatus;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  invitedBy?: string;
  permissions?: AdminPermissionData[];
}

export interface AdminPermissionData {
  id: string;
  permission: Permission;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface AdminInvitationData {
  id: string;
  email: string;
  role: AdminRoleType;
  roleId?: string;
  department?: string;
  restrictions?: Record<string, any>;
  status: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AdminSessionData {
  id: string;
  adminId: string;
  token: string;
  deviceInfo?: string;
  ipAddress: string;
  userAgent?: string;
  location?: string;
  isActive: boolean;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface AdminAuditLogData {
  id: string;
  adminId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress: string;
  userAgent?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  performedBy?: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  verifiedUsers: number;
  newUsersThisMonth: number;
  totalJobs: number;
  openJobs: number;
  activeGigs: number;
  completedJobs: number;
  jobsInProgress: number;
  totalChallenges: number;
  activeChallenges: number;
  completedChallenges: number;
  totalCategories: number;
  totalRevenue: number;
  totalTransactions: number;
  monthlyRevenue: number;
  openDisputes: number;
}

export interface RecentActivity {
  action: string;
  firstName?: string;
  lastName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AdminRoleData {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdminData {
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRoleType;
  roleId?: string;
  department?: string;
  restrictions?: Record<string, any>;
}

export interface UpdateAdminData {
  firstName?: string;
  lastName?: string;
  department?: string;
  restrictions?: Record<string, any>;
  status?: AdminStatus;
}

export interface AdminFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: AdminStatus;
  role?: AdminRoleType;
  department?: string;
}

export interface AdminStatsData {
  totalAdmins: number;
  activeAdmins: number;
  suspendedAdmins: number;
  pendingInvitations: number;
  recentLogins: number;
}