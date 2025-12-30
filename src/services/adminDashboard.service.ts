import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AdminDashboardService {
  // Get dashboard overview stats
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalJobs,
      activeJobs,
      totalChallenges,
      totalCategories,
      totalTransactions
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.job.count(),
      prisma.job.count({ where: { status: 'OPEN' } }),
      prisma.challenge.count({ where: { status: 'ACTIVE' } }),
      prisma.category.count(),
      prisma.transaction.count()
    ]);

    const stats = {
      totalUsers,
      activeGigs: activeJobs,
      activeChallenges: totalChallenges,
      totalCategories,
      totalRevenue: 125000, // Mock data
      openDisputes: 3, // Mock data
      openJobs: activeJobs
    };

    const recentActivity = [
      { action: 'User registered', metadata: { user: 'Recent User' }, timestamp: new Date().toISOString() },
      { action: 'Job posted', metadata: { title: 'New Job' }, timestamp: new Date().toISOString() },
      { action: 'Challenge created', metadata: { title: 'New Challenge' }, timestamp: new Date().toISOString() }
    ];

    return { stats, recentActivity };
  }

  // Get recent activities
  async getRecentActivities(limit = 10) {
    return await prisma.adminAuditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });
  }

  // Get user growth data
  async getUserGrowthData(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' }
    });

    // Group by date
    const growthData: { [key: string]: number } = {};
    users.forEach(user => {
      const date = user.createdAt.toISOString().split('T')[0];
      growthData[date] = (growthData[date] || 0) + 1;
    });

    return Object.entries(growthData).map(([date, count]) => ({
      date,
      count
    }));
  }
}