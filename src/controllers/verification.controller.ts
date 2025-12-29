import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { emailService } from '@/services/email.service';

export class VerificationController {
  async submitVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const {
        documentType,
        documentNumber,
        firstName,
        lastName,
        dateOfBirth,
        address,
        state,
        frontImageUrl,
        backImageUrl,
        selfieImageUrl
      } = req.body;

      // Check if user already has a pending or approved verification
      const existingVerification = await prisma.userVerification.findFirst({
        where: { 
          userId,
          status: { in: ['PENDING', 'APPROVED'] }
        }
      });

      if (existingVerification) {
        throw ApiError.badRequest('You already have a verification request in progress');
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });

      const verification = await prisma.userVerification.create({
        data: {
          userId,
          documentType,
          documentNumber,
          documentImages: [frontImageUrl, backImageUrl].filter(Boolean),
          selfieImage: selfieImageUrl,
          status: 'PENDING'
        }
      });

      // Send verification status email
      if (user) {
        await emailService.sendVerificationStatus(
          user.email!,
          {
            userName: user.firstName,
            verificationStatus: 'Under Review',
            verificationType: documentType,
            submissionDate: new Date().toLocaleDateString(),
            reviewDate: 'Pending',
            referenceNumber: verification.id,
            isApproved: false,
            isRejected: false,
            isPending: true,
            documentsReceived: 'All required documents',
            expectedCompletion: '3-5 business days',
            currentStage: 'Document verification',
            verificationUrl: `${process.env.FRONTEND_URL}/verification/status`
          }
        );
      }

      // Create notification for admin
      await prisma.notification.create({
        data: {
          userId: 'admin', // Admin user ID
          type: 'VERIFICATION_SUBMITTED',
          title: 'New Identity Verification',
          message: `User ${firstName} ${lastName} has submitted identity verification documents`,
          priority: 'NORMAL'
        }
      });

      logger.info(`Identity verification submitted: ${verification.id} for user ${userId}`);

      res.status(201).json({
        success: true,
        data: verification
      });
    } catch (error) {
      next(error);
    }
  }

  async getVerificationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      const verification = await prisma.userVerification.findFirst({
        where: { userId },
        orderBy: { submittedAt: 'desc' }
      });

      res.json({
        success: true,
        data: verification
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllVerifications(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 10, status, documentType } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};
      if (status) where.status = status;
      if (documentType) where.documentType = documentType;

      const [verifications, total] = await Promise.all([
        prisma.userVerification.findMany({
          where,
          skip,
          take: Number(limit),
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
          orderBy: { submittedAt: 'desc' }
        }),
        prisma.userVerification.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          verifications,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async approveVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const { verificationId } = req.params;
      const { notes } = req.body;

      const verification = await prisma.userVerification.findUnique({
        where: { id: verificationId },
        include: { user: true }
      });

      if (!verification) {
        throw ApiError.notFound('Verification not found');
      }

      // Update verification status
      const updatedVerification = await prisma.userVerification.update({
        where: { id: verificationId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          notes: notes,
          reviewedBy: (req as any).user?.id
        }
      });

      // Update user verification status
      await prisma.user.update({
        where: { id: verification.userId },
        data: { 
          kycVerifiedAt: new Date(),
          isVerified: true
        }
      });

      // Send verification approved email
      await emailService.sendVerificationStatus(
        verification.user.email!,
        {
          userName: verification.user.firstName,
          verificationStatus: 'Approved',
          verificationType: verification.documentType,
          submissionDate: verification.submittedAt.toLocaleDateString(),
          reviewDate: new Date().toLocaleDateString(),
          referenceNumber: verification.id,
          isApproved: true,
          isRejected: false,
          isPending: false,
          verificationUrl: `${process.env.FRONTEND_URL}/verification/status`
        }
      );

      // Create notification for user
      await prisma.notification.create({
        data: {
          userId: verification.userId,
          type: 'VERIFICATION_APPROVED',
          title: 'Identity Verification Approved',
          message: 'Your identity has been successfully verified. You can now access all platform features.',
          priority: 'HIGH'
        }
      });

      logger.info(`Identity verification approved: ${verificationId}`);

      res.json({
        success: true,
        data: updatedVerification
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const { verificationId } = req.params;
      const { reason, notes } = req.body;

      const verification = await prisma.userVerification.findUnique({
        where: { id: verificationId },
        include: { user: true }
      });

      if (!verification) {
        throw ApiError.notFound('Verification not found');
      }

      const updatedVerification = await prisma.userVerification.update({
        where: { id: verificationId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          notes: notes,
          rejectionReason: reason,
          reviewedBy: (req as any).user?.id
        }
      });

      // Send verification rejected email
      await emailService.sendVerificationStatus(
        verification.user.email!,
        {
          userName: verification.user.firstName,
          verificationStatus: 'Rejected',
          verificationType: verification.documentType,
          submissionDate: verification.submittedAt.toLocaleDateString(),
          reviewDate: new Date().toLocaleDateString(),
          referenceNumber: verification.id,
          isApproved: false,
          isRejected: true,
          isPending: false,
          rejectionReason: reason,
          additionalNotes: notes,
          verificationUrl: `${process.env.FRONTEND_URL}/verification/status`,
          resubmitUrl: `${process.env.FRONTEND_URL}/verification/submit`
        }
      );

      // Create notification for user
      await prisma.notification.create({
        data: {
          userId: verification.userId,
          type: 'VERIFICATION_REJECTED',
          title: 'Identity Verification Rejected',
          message: `Your identity verification was rejected. Reason: ${reason}. Please resubmit with correct documents.`,
          priority: 'HIGH'
        }
      });

      logger.info(`Identity verification rejected: ${verificationId}`);

      res.json({
        success: true,
        data: updatedVerification
      });
    } catch (error) {
      next(error);
    }
  }

  async requestAdditionalDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { verificationId } = req.params;
      const { requiredDocuments, notes } = req.body;

      const verification = await prisma.userVerification.findUnique({
        where: { id: verificationId }
      });

      if (!verification) {
        throw ApiError.notFound('Verification not found');
      }

      const updatedVerification = await prisma.userVerification.update({
        where: { id: verificationId },
        data: {
          status: 'ADDITIONAL_DOCS_REQUIRED',
          reviewedAt: new Date(),
          notes: notes,
          reviewedBy: (req as any).user?.id
        }
      });

      // Create notification for user
      await prisma.notification.create({
        data: {
          userId: verification.userId,
          type: 'VERIFICATION_ADDITIONAL_DOCS',
          title: 'Additional Documents Required',
          message: `Additional documents are required for your identity verification: ${requiredDocuments.join(', ')}`,
          priority: 'NORMAL'
        }
      });

      logger.info(`Additional documents requested for verification: ${verificationId}`);

      res.json({
        success: true,
        data: updatedVerification
      });
    } catch (error) {
      next(error);
    }
  }

  async getVerificationStats(req: Request, res: Response, next: NextFunction) {
    try {
      const [
        totalVerifications,
        pendingVerifications,
        approvedVerifications,
        rejectedVerifications,
        additionalDocsRequired
      ] = await Promise.all([
        prisma.userVerification.count(),
        prisma.userVerification.count({ where: { status: 'PENDING' } }),
        prisma.userVerification.count({ where: { status: 'APPROVED' } }),
        prisma.userVerification.count({ where: { status: 'REJECTED' } }),
        prisma.userVerification.count({ where: { status: 'ADDITIONAL_DOCS_REQUIRED' } })
      ]);

      res.json({
        success: true,
        data: {
          total: totalVerifications,
          pending: pendingVerifications,
          approved: approvedVerifications,
          rejected: rejectedVerifications,
          additionalDocsRequired
        }
      });
    } catch (error) {
      next(error);
    }
  }
}