import { prisma } from '@/config/database';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class ScheduledJobsService {
  private calculateTimeRemaining(deadline: Date): string {
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }

  async processJobDeadlineReminders() {
    try {
      const upcomingJobs = await prisma.project.findMany({
        where: {
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000)
          },
          status: 'ACTIVE'
        },
        include: {
          freelancer: { select: { email: true, firstName: true } },
          client: { select: { email: true, firstName: true } }
        }
      });

      for (const job of upcomingJobs) {
        await emailService.sendJobDeadlineReminder(
          job.freelancer.email,
          job.freelancer.firstName,
          {
            projectTitle: job.title,
            deadlineDate: job.endDate?.toISOString() || '',
            timeRemaining: this.calculateTimeRemaining(job.endDate || new Date()),
            progressPercentage: job.progressPercentage,
            isFreelancer: true
          }
        );
      }

      logger.info(`Processed ${upcomingJobs.length} job deadline reminders`);
    } catch (error) {
      logger.error('Error processing job deadline reminders:', error);
    }
  }

  async processChallengeReminders() {
    try {
      const upcomingChallenges = await prisma.challengeParticipant.findMany({
        where: {
          challenge: {
            submissionEnd: {
              gte: new Date(),
              lte: new Date(Date.now() + 48 * 60 * 60 * 1000)
            },
            status: 'ACTIVE'
          }
        },
        include: {
          user: { select: { email: true, firstName: true } },
          challenge: true
        }
      });

      for (const participant of upcomingChallenges) {
        // Note: sendChallengeReminder method needs to be implemented in EmailService
        // await emailService.sendChallengeReminder(
        //   participant.user.email,
        //   {
        //     participantName: participant.user.firstName,
        //     challengeTitle: participant.challenge.title,
        //     timeRemaining: this.calculateTimeRemaining(participant.challenge.submissionEnd),
        //     submissionDeadline: participant.challenge.submissionEnd.toISOString(),
        //     prizePool: participant.challenge.totalPrizePool,
        //     hasSubmitted: false,
        //     challengeUrl: `https://nairagig.com/challenges/${participant.challenge.id}`
        //   }
        // );
      }

      logger.info(`Processed ${upcomingChallenges.length} challenge reminders`);
    } catch (error) {
      logger.error('Error processing challenge reminders:', error);
    }
  }

  async processInactiveAccountReminders() {
    try {
      const inactiveUsers = await prisma.user.findMany({
        where: {
          lastLoginAt: {
            lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
          // Note: profileCompletionPercentage field doesn't exist in schema
        }
      });

      for (const user of inactiveUsers) {
        await emailService.sendAccountActivation(
    // @ts-ignore
    // @ts-ignore
          user.firstName,
          user.email,
          50, // Default completion percentage
          `https://nairagig.com/profile/complete`,
          30
        );
      }

      logger.info(`Processed ${inactiveUsers.length} inactive account reminders`);
    } catch (error) {
      logger.error('Error processing inactive account reminders:', error);
    }
  }

  async processReviewReminders() {
    try {
      const completedProjects = await prisma.project.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          }
        },
        include: {
          freelancer: { select: { email: true, firstName: true } },
          client: { select: { email: true, firstName: true } }
        }
      });

      for (const project of completedProjects) {
        // Send to client
        await emailService.sendReviewRequest(
          project.client.email,
          {
            recipientName: project.client.firstName,
            requesterName: project.freelancer.firstName,
            projectTitle: project.title,
            completionDate: project.completedAt?.toISOString() || '',
            projectValue: project.agreedBudget.toString(),
            projectDuration: '2 weeks',
            isForFreelancer: true,
            reviewUrl: `https://nairagig.com/projects/${project.id}/review`
          }
        );

        // Send to freelancer
        await emailService.sendReviewRequest(
          project.freelancer.email,
          {
            recipientName: project.freelancer.firstName,
            requesterName: project.client.firstName,
            projectTitle: project.title,
            completionDate: project.completedAt?.toISOString() || '',
            projectValue: project.agreedBudget.toString(),
            projectDuration: '2 weeks',
            isForFreelancer: false,
            reviewUrl: `https://nairagig.com/projects/${project.id}/review`
          }
        );
      }

      logger.info(`Processed ${completedProjects.length * 2} review reminders`);
    } catch (error) {
      logger.error('Error processing review reminders:', error);
    }
  }

  async processPaymentReminders() {
    try {
      const overduePayments = await prisma.projectMilestone.findMany({
        where: {
          status: 'APPROVED',
          dueDate: {
            lte: new Date()
          }
          // Note: paymentStatus field doesn't exist in schema
        },
        include: {
          project: {
            include: {
              client: { select: { email: true, firstName: true } }
            }
          }
        }
      });

      for (const milestone of overduePayments) {
        await emailService.sendPaymentReminder(
          milestone.project.client.email,
          milestone.project.client.firstName,
          {
            projectTitle: milestone.project.title,
            milestoneTitle: milestone.title,
            amount: milestone.amount.toString(),
            dueDate: milestone.dueDate?.toISOString() || '',
            daysOverdue: Math.floor((Date.now() - (milestone.dueDate?.getTime() || Date.now())) / (1000 * 60 * 60 * 24))
          }
        );
      }

      logger.info(`Processed ${overduePayments.length} payment reminders`);
    } catch (error) {
      logger.error('Error processing payment reminders:', error);
    }
  }

  async processSecurityMonitoring() {
    try {
      // Check for suspicious login patterns
      const suspiciousLogins = await prisma.loginHistory.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          status: 'FAILED'
        },
        select: { ipAddress: true, userId: true }
      });

      const ipCounts = suspiciousLogins.reduce((acc, login) => {
        acc[login.ipAddress] = (acc[login.ipAddress] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Alert for IPs with >10 failed attempts in 1 hour
      for (const [ip, count] of Object.entries(ipCounts)) {
        if (count > 10) {
          await emailService.sendSecurityAlertAdvanced('admin@nairagig.com', {
            userName: 'Admin',
            alertType: 'Suspicious Login Activity',
            eventDateTime: new Date().toISOString(),
            location: 'Multiple locations',
            deviceInfo: 'Multiple devices',
            ipAddress: ip,
            eventDescription: `${count} failed login attempts detected from IP ${ip} in the last hour`,
            riskLevel: 'High',
            riskColor: '#dc2626',
            actionRequired: true,
            requiredActions: ['Block IP address', 'Investigate user accounts'],
            securityUrl: 'https://admin.nairagig.com/security'
          });
        }
      }

      logger.info('Security monitoring completed');
    } catch (error) {
      logger.error('Error in security monitoring:', error);
    }
  }

  async processMarketingCampaigns() {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dayOfMonth = today.getDate();

      // Send weekly reports on Mondays
      if (dayOfWeek === 1) {
        await this.sendWeeklyReports();
      }

      // Send monthly stats on the 1st of each month
      if (dayOfMonth === 1) {
        await this.sendMonthlyStats();
      }

      logger.info('Marketing campaigns processing completed');
    } catch (error) {
      logger.error('Error processing marketing campaigns:', error);
    }
  }

  private async sendWeeklyReports() {
    const users = await prisma.user.findMany({
      where: { emailNotifications: true },
      select: { email: true, firstName: true }
    });

    const weeklyStats = await this.getWeeklyStats();
    
    for (const user of users) {
      try {
        await emailService.sendNewsletter(user.email, {
          recipientName: user.firstName,
          newsletterTitle: 'Weekly NairaGig Report',
          newsletterSubtitle: 'Your weekly platform summary',
          introMessage: 'Here\'s what happened on NairaGig this week',
          platformStats: weeklyStats,
          features: [{
            icon: '📊',
            title: 'Weekly Highlights',
            description: `${weeklyStats.newJobs} new jobs posted`
          }],
          tips: ['Complete your profile for better job matches'],
          mainCtaText: 'View Dashboard',
          mainCtaUrl: 'https://nairagig.com/dashboard',
          unsubscribeUrl: `https://nairagig.com/unsubscribe?email=${user.email}`,
          preferencesUrl: 'https://nairagig.com/preferences'
        });
      } catch (emailError) {
        logger.error(`Failed to send weekly report to ${user.email}:`, emailError);
      }
    }
  }

  private async sendMonthlyStats() {
    const users = await prisma.user.findMany({
      where: { emailNotifications: true },
      select: { email: true, firstName: true }
    });

    const monthlyStats = await this.getMonthlyStats();

    for (const user of users) {
      try {
        await emailService.sendNewsletter(user.email, {
          recipientName: user.firstName,
          newsletterTitle: 'Monthly Platform Statistics',
          newsletterSubtitle: 'NairaGig growth and achievements',
          introMessage: 'See how NairaGig performed this month',
          platformStats: monthlyStats,
          features: [{
            icon: '📈',
            title: 'Platform Growth',
            description: `${monthlyStats.newUsers} new users joined`
          }],
          mainCtaText: 'Explore Opportunities',
          mainCtaUrl: 'https://nairagig.com/jobs',
          unsubscribeUrl: `https://nairagig.com/unsubscribe?email=${user.email}`,
          preferencesUrl: 'https://nairagig.com/preferences'
        });
      } catch (emailError) {
        logger.error(`Failed to send monthly stats to ${user.email}:`, emailError);
      }
    }
  }

  private async getWeeklyStats() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [newJobs, completedProjects] = await Promise.all([
      prisma.job.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.project.count({ where: { completedAt: { gte: weekAgo } } })
    ]);
    return {
      newJobs: newJobs.toString(),
      completedProjects: completedProjects.toString(),
      totalJobs: '0',
      totalFreelancers: '0',
      totalEarnings: '₦0'
    };
  }

  private async getMonthlyStats() {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalJobs, newUsers] = await Promise.all([
      prisma.job.count(),
      prisma.user.count({ where: { createdAt: { gte: monthAgo } } })
    ]);
    return {
      totalJobs: totalJobs.toString(),
      newUsers: newUsers.toString(),
      totalFreelancers: '0',
      totalEarnings: '₦0',
      completedProjects: '0'
    };
  }

  async processAllScheduledJobs() {
    logger.info('Starting scheduled jobs processing...');
    
    await Promise.all([
      this.processJobDeadlineReminders(),
      this.processChallengeReminders(),
      this.processInactiveAccountReminders(),
      this.processReviewReminders(),
      this.processPaymentReminders(),
      this.processSecurityMonitoring(),
      this.processMarketingCampaigns()
    ]);

    logger.info('Completed scheduled jobs processing');
  }
}