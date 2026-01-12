import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class JobManagementController {
  
  async getJobDetails(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          client: true,
          applications: {
            include: {
              freelancer: true
            }
          },
          conversations: {
            include: {
              messages: {
                include: {
                  sender: true
                }
              }
            }
          },
          disputes: true,
          payments: true,
          activityLogs: true
        }
      });

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({ success: true, data: job });
    } catch (error) {
      console.error('Get job details error:', error);
      res.status(500).json({ error: 'Failed to fetch job details' });
    }
  }

  async updateJob(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const updateData = req.body;

      const job = await prisma.job.update({
        where: { id: jobId },
        data: updateData
      });

      res.json({ success: true, data: job });
    } catch (error) {
      console.error('Update job error:', error);
      res.status(500).json({ error: 'Failed to update job' });
    }
  }

  async releasePayment(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const { amount, freelancerId } = req.body;
      const adminId = (req as any).admin.id;

      // Create payment record
      const payment = await prisma.jobPayment.create({
        data: {
          jobId,
          freelancerId,
          amount,
          status: 'completed',
          type: 'job_payment',
          description: 'Job payment released by admin',
          transactionId: `PAY_${Date.now()}`,
          method: 'admin_release'
        }
      });

      // Update job status
      await prisma.job.update({
        where: { id: jobId },
        data: { paymentStatus: 'paid' }
      });

      // Log activity
      await prisma.jobActivityLog.create({
        data: {
          jobId,
          action: 'Payment Released',
          description: `Admin released payment of ₦${amount.toLocaleString()}`,
          performedBy: `Admin ${adminId}`,
          performerId: adminId
        }
      });

      res.json({ success: true, data: payment });
    } catch (error) {
      console.error('Release payment error:', error);
      res.status(500).json({ error: 'Failed to release payment' });
    }
  }

  async holdPayment(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin.id;

      await prisma.job.update({
        where: { id: jobId },
        data: { paymentStatus: 'held' }
      });

      await prisma.jobActivityLog.create({
        data: {
          jobId,
          action: 'Payment Held',
          description: `Admin held payment. Reason: ${reason || 'No reason provided'}`,
          performedBy: `Admin ${adminId}`,
          performerId: adminId
        }
      });

      res.json({ success: true, message: 'Payment held successfully' });
    } catch (error) {
      console.error('Hold payment error:', error);
      res.status(500).json({ error: 'Failed to hold payment' });
    }
  }

  async disputePayment(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const { reason, description } = req.body;
      const adminId = (req as any).admin.id;

      const dispute = await prisma.jobDispute.create({
        data: {
          jobId,
          title: reason || 'Payment Dispute',
          description: description || 'Payment dispute raised by admin',
          status: 'open',
          priority: 'medium',
          raisedBy: 'admin',
          raisedById: adminId
        }
      });

      res.json({ success: true, data: dispute });
    } catch (error) {
      console.error('Dispute payment error:', error);
      res.status(500).json({ error: 'Failed to create payment dispute' });
    }
  }

  async getApplications(req: Request, res: Response) {
    try {
      const { jobId } = req.params;

      const applications = await prisma.jobApplication.findMany({
        where: { jobId },
        include: {
          freelancer: true
        },
        orderBy: { submittedAt: 'desc' }
      });

      res.json({ success: true, data: applications });
    } catch (error) {
      console.error('Get applications error:', error);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  }

  async acceptApplication(req: Request, res: Response) {
    try {
      const { jobId, appId } = req.params;
      const adminId = (req as any).admin.id;

      // Update application status
      const application = await prisma.jobApplication.update({
        where: { id: appId },
        data: { status: 'ACCEPTED' }
      });

      // Update job status
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: 'IN_PROGRESS',
          hiredFreelancerId: application.freelancerId
        }
      });

      // Reject other applications
      await prisma.jobApplication.updateMany({
        where: { 
          jobId,
          id: { not: appId }
        },
        data: { status: 'REJECTED' }
      });

      // Log activity
      await prisma.jobActivityLog.create({
        data: {
          jobId,
          action: 'Application Accepted',
          description: `Admin accepted application from ${application.freelancerId}`,
          performedBy: `Admin ${adminId}`,
          performerId: adminId
        }
      });

      res.json({ success: true, data: application });
    } catch (error) {
      console.error('Accept application error:', error);
      res.status(500).json({ error: 'Failed to accept application' });
    }
  }

  async rejectApplication(req: Request, res: Response) {
    try {
      const { jobId, appId } = req.params;
      const { reason } = req.body;
      const adminId = (req as any).admin.id;

      const application = await prisma.jobApplication.update({
        where: { id: appId },
        data: { 
          status: 'REJECTED',
          rejectionReason: reason
        }
      });

      await prisma.jobActivityLog.create({
        data: {
          jobId,
          action: 'Application Rejected',
          description: `Admin rejected application. Reason: ${reason || 'No reason provided'}`,
          performedBy: `Admin ${adminId}`,
          performerId: adminId
        }
      });

      res.json({ success: true, data: application });
    } catch (error) {
      console.error('Reject application error:', error);
      res.status(500).json({ error: 'Failed to reject application' });
    }
  }

  async getConversations(req: Request, res: Response) {
    try {
      const { jobId } = req.params;

      const conversations = await prisma.conversation.findMany({
        where: { jobId },
        include: {
          messages: {
            include: {
              sender: true
            },
            orderBy: { createdAt: 'asc' }
          },
          participants: true
        }
      });

      res.json({ success: true, data: conversations });
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const { content, conversationId } = req.body;
      const adminId = (req as any).admin.id;

      const message = await prisma.message.create({
        data: {
          content,
          senderId: adminId,
          conversationId,
          messageType: 'TEXT'
        },
        include: {
          sender: true
        }
      });

      res.json({ success: true, data: message });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }

  async getActivity(req: Request, res: Response) {
    try {
      const { jobId } = req.params;

      const activities = await prisma.jobActivityLog.findMany({
        where: { jobId },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: activities });
    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
  }

  async getDisputes(req: Request, res: Response) {
    try {
      const { jobId } = req.params;

      const disputes = await prisma.jobDispute.findMany({
        where: { jobId },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: disputes });
    } catch (error) {
      console.error('Get disputes error:', error);
      res.status(500).json({ error: 'Failed to fetch disputes' });
    }
  }

  async createDispute(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const { title, description, priority } = req.body;
      const adminId = (req as any).admin.id;

      const dispute = await prisma.jobDispute.create({
        data: {
          jobId,
          title,
          description,
          priority: priority || 'medium',
          status: 'open',
          raisedBy: 'admin',
          raisedById: adminId
        }
      });

      res.json({ success: true, data: dispute });
    } catch (error) {
      console.error('Create dispute error:', error);
      res.status(500).json({ error: 'Failed to create dispute' });
    }
  }
}