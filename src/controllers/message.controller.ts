import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

export class MessageController {
  async getConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const conversations = await prisma.conversation.findMany({
        where: {
          participants: {
            some: { userId }
          }
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
            }
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              sender: { select: { id: true, firstName: true, lastName: true } }
            }
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });

      res.json({ success: true, data: conversations });
    } catch (error) {
      next(error);
    }
  }

  async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationId } = req.params;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
            }
          },
          messages: {
            include: {
              sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
              reads: true
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        throw ApiError.notFound('Conversation not found');
      }

      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        throw ApiError.forbidden('Access denied');
      }

      res.json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async createConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { participantIds, type = 'DIRECT', title, projectId } = req.body;

      const allParticipants = [userId, ...participantIds];

      const conversation = await prisma.conversation.create({
        data: {
          type,
          title,
          projectId,
          participants: {
            create: allParticipants.map(id => ({ userId: id }))
          }
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
            }
          }
        }
      });

      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationId } = req.params;
      const { content, messageType = 'TEXT', attachments = [] } = req.body;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true }
      });

      if (!conversation) {
        throw ApiError.notFound('Conversation not found');
      }

      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        throw ApiError.forbidden('Access denied');
      }

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          messageType,
          attachments
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
        }
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: content?.substring(0, 100)
        }
      });

      res.status(201).json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { messageId } = req.params;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: { conversation: { include: { participants: true } } }
      });

      if (!message) {
        throw ApiError.notFound('Message not found');
      }

      const isParticipant = message.conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        throw ApiError.forbidden('Access denied');
      }

      await prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { readAt: new Date() },
        create: { messageId, userId }
      });

      res.json({ success: true, message: 'Message marked as read' });
    } catch (error) {
      next(error);
    }
  }
}