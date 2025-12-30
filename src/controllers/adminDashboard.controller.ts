import { Request, Response } from 'express';
import { AdminDashboardService } from '../services/adminDashboard.service';

const adminDashboardService = new AdminDashboardService();

export class AdminDashboardController {
  // Get dashboard overview
  async getDashboard(req: Request, res: Response) {
    try {
      const [stats, activities, growth] = await Promise.all([
        adminDashboardService.getDashboardStats(),
        adminDashboardService.getRecentActivities(10),
        adminDashboardService.getUserGrowthData(30)
      ]);

      res.json({
        stats,
        recentActivities: activities,
        userGrowth: growth
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get system stats
  async getStats(req: Request, res: Response) {
    try {
      const data = await adminDashboardService.getDashboardStats();
      res.json({
        success: true,
        data
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get recent activities
  async getActivities(req: Request, res: Response) {
    try {
      const { limit } = req.query;
      const activities = await adminDashboardService.getRecentActivities(
        limit ? parseInt(limit as string) : 20
      );
      res.json({ activities });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}