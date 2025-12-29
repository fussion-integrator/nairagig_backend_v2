import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { emailService } from '@/services/email.service';
import { logger } from '@/utils/logger';

export class SupportController {
  async createSupportTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { subject, message, category, priority, attachments } = req.body;

      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true }
      });

      if (!user) throw ApiError.notFound('User not found');

      // Use contact table instead of supportTicket
      const ticket = await prisma.contact.create({
        data: {
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          subject: category || 'GENERAL',
          message: `${subject}\n\n${message}`
        }
      });

      // Send support ticket notification to admin team
      try {
        await emailService.sendSupportTicketCreated(
          'contact@nairagig.com',
          user.firstName + ' ' + user.lastName,
          user.email,
          subject,
          message,
          category || 'GENERAL',
          priority || 'MEDIUM',
          ticket.id
        );
      } catch (emailError) {
        logger.error('Failed to send support ticket email:', emailError);
      }

      res.status(201).json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  }

  async getSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true }
      });

      if (!user) throw ApiError.notFound('User not found');

      const where: any = { email: user.email };
      // Note: status filtering not available with contact table

      // Use contact table instead of supportTicket
      const [tickets, total] = await Promise.all([
        prisma.contact.findMany({
          where: { email: user?.email },
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.contact.count({ where: { email: user?.email } })
      ]);

      res.json({
        success: true,
        data: tickets,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getSupportTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      const ticket = await prisma.contact.findUnique({
        where: { id }
      });

      if (!ticket) {
        throw ApiError.notFound('Support ticket not found');
      }

      if (ticket?.email !== user?.email) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  }
}