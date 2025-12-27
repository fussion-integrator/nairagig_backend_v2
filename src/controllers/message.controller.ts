import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { getIO } from '@/config/socket';

export class MessageController {
  async getConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) throw ApiError.unauthorized('User not authenticated');

      const { status, type, labels, priority, archived, muted, projectId, page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      console.log(`🔍 getConversations called with filters:`, {
        userId,
        status,
        type,
        projectId,
        priority,
        archived,
        muted,
        page,
        limit
      });

      const where: any = {
        participants: { some: { userId } }
      };

      if (status) where.status = status;
      if (type) where.type = type;
      if (projectId) where.projectId = projectId;
      if (priority) where.priority = priority;
      if (archived !== undefined) where.isArchived = archived === 'true';
      if (muted !== undefined) {
        where.participants = {
          some: {
            userId,
            mutedUntil: muted === 'true' ? { not: null } : null
          }
        };
      }
      if (labels) {
        where.labels = {
          some: {
            name: { in: Array.isArray(labels) ? labels : [labels] }
          }
        };
      }

      console.log(`🔍 Final where clause:`, JSON.stringify(where, null, 2));

      const conversations = await prisma.conversation.findMany({
        where,
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
          },
          labels: true,
          settings: true
        },
        orderBy: { createdAt: 'asc' }, // Always return the oldest conversation first for consistency
        skip,
        take: Number(limit)
      });

      // Track conversation and message counts
      for (const conv of conversations) {
        const messageCount = await prisma.message.count({
          where: { conversationId: conv.id }
        });
        console.log(`📊 DB TRACKING - getConversations:`, {
          conversationId: conv.id,
          projectId: conv.projectId,
          type: conv.type,
          totalMessages: messageCount,
          participantCount: conv.participants.length
        });
      }

      const total = await prisma.conversation.count({ where });

      res.json({ 
        success: true, 
        data: conversations,
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

  async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
            }
          },
          settings: true,
          labels: true,
          security: true
        }
      });

      if (!conversation) {
        throw ApiError.notFound('Conversation not found');
      }

      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        throw ApiError.forbidden('Access denied');
      }

      const messages = await prisma.message.findMany({
        where: { conversationId },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          reads: true,
          reactions: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } }
            }
          },
          mentions: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } }
            }
          },
          replyTo: {
            include: {
              sender: { select: { id: true, firstName: true, lastName: true } }
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: Number(limit)
      });

      console.log(`📊 DB TRACKING - getConversation:`, {
        conversationId,
        projectId: conversation.projectId,
        conversationType: conversation.type,
        messagesFound: messages.length,
        requestedLimit: Number(limit),
        skip
      });
      console.log(`📜 Found ${messages.length} messages for conversation ${conversationId}`);
      
      const total = await prisma.message.count({ where: { conversationId } });
      console.log(`📊 DB TRACKING - Total message count: ${total}`);

      res.json({ 
        success: true, 
        data: {
          ...conversation,
          messages,
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

  async createConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { participantIds, type = 'DIRECT', title, projectId } = req.body;

      const allParticipants = [userId, ...participantIds];

      // For PROJECT conversations, check if one already exists for this project
      if (type === 'PROJECT' && projectId) {
        console.log(`🔍 Checking for existing PROJECT conversation for project ${projectId}`);
        
        const existingConversation = await prisma.conversation.findFirst({
          where: {
            type: 'PROJECT',
            projectId,
            participants: {
              some: { userId }
            }
          },
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
              }
            }
          },
          orderBy: { createdAt: 'asc' } // Get the oldest conversation to ensure consistency
        });

        console.log(`🔍 Search result:`, {
          found: !!existingConversation,
          conversationId: existingConversation?.id,
          projectId: existingConversation?.projectId,
          participantCount: existingConversation?.participants?.length,
          searchUserId: userId
        });

        if (existingConversation) {
          console.log(`✅ Found existing PROJECT conversation ${existingConversation.id} for project ${projectId}`);
          console.log(`👥 Participants:`, existingConversation.participants.map(p => `${p.user.firstName} ${p.user.lastName} (${p.userId})`));
          
          // Ensure all required participants are in the conversation
          const existingParticipantIds = existingConversation.participants.map(p => p.userId);
          const missingParticipants = allParticipants.filter(id => !existingParticipantIds.includes(id));
          
          console.log(`👥 Participant check:`, {
            existing: existingParticipantIds,
            required: allParticipants,
            missing: missingParticipants
          });
          
          if (missingParticipants.length > 0) {
            console.log(`⚠️ Adding missing participants to existing conversation:`, missingParticipants);
            await prisma.conversationParticipant.createMany({
              data: missingParticipants.map(userId => ({
                conversationId: existingConversation.id,
                userId
              }))
            });
            
            // Refetch conversation with updated participants
            const updatedConversation = await prisma.conversation.findUnique({
              where: { id: existingConversation.id },
              include: {
                participants: {
                  include: {
                    user: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } }
                  }
                }
              }
            });
            return res.json({ success: true, data: updatedConversation });
          }
          
          return res.json({ success: true, data: existingConversation });
        } else {
          console.log(`❌ No existing PROJECT conversation found for project ${projectId} with user ${userId}`);
        }
      }

      // For direct conversations, check if one already exists
      if (type === 'DIRECT' && participantIds.length === 1) {
        const existingConversation = await prisma.conversation.findFirst({
          where: {
            type: 'DIRECT',
            projectId: null,
            participants: {
              every: {
                userId: { in: [userId, participantIds[0]] }
              },
              none: {
                userId: { notIn: [userId, participantIds[0]] }
              }
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

        if (existingConversation) {
          return res.json({ success: true, data: existingConversation });
        }
      }

      console.log(`🆕 Creating new ${type} conversation for project ${projectId} with participants:`, allParticipants);
      
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

      console.log(`✅ Created new ${type} conversation ${conversation.id} with participants:`, 
        conversation.participants.map(p => `${p.user.firstName} ${p.user.lastName} (${p.userId})`));

      res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      next(error);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationId } = req.params;
      const { 
        content, 
        messageType = 'TEXT', 
        attachments = [], 
        replyToId, 
        threadId, 
        mentions = [], 
        priority = 'NORMAL',
        metadata = {} 
      } = req.body;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { 
          participants: true,
          settings: true
        }
      });

      if (!conversation) {
        throw ApiError.notFound('Conversation not found');
      }

      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        throw ApiError.forbidden('Access denied');
      }

      // Check conversation settings
      if (conversation.settings && !conversation.settings.allowFileSharing && attachments.length > 0) {
        throw ApiError.badRequest('File sharing is disabled for this conversation');
      }

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          messageType,
          attachments,
          replyToId,
          threadId,
          priority,
          mentions: {
            create: mentions.map((mentionedUserId: string) => ({
              userId: mentionedUserId
            }))
          }
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          mentions: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } }
            }
          },
          replyTo: {
            include: {
              sender: { select: { id: true, firstName: true, lastName: true } }
            }
          }
        }
      });

      console.log(`✅ Message saved to database:`, {
        id: message.id,
        conversationId,
        content: content?.substring(0, 50),
        senderId: userId
      });

      // Track message count after adding new message
      const messageCount = await prisma.message.count({
        where: { conversationId }
      });
      const conversationInfo = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, projectId: true, type: true }
      });
      console.log(`📊 DB TRACKING - After adding message:`, {
        conversationId,
        projectId: conversationInfo?.projectId,
        conversationType: conversationInfo?.type,
        totalMessages: messageCount,
        newMessageId: message.id
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: content?.substring(0, 100)
        }
      });

      // Verify message was properly saved
      const savedMessage = await prisma.message.findUnique({
        where: { id: message.id },
        include: {
          conversation: {
            select: { id: true, projectId: true, type: true }
          }
        }
      });
      console.log(`🔍 DB VERIFICATION - Message exists:`, {
        messageExists: !!savedMessage,
        messageId: savedMessage?.id,
        conversationId: savedMessage?.conversationId,
        projectId: savedMessage?.conversation?.projectId,
        conversationType: savedMessage?.conversation?.type
      });

      // Create delivery records
      const otherParticipants = conversation.participants.filter(p => p.userId !== userId);
      await prisma.messageDelivery.createMany({
        data: otherParticipants.map(p => ({
          messageId: message.id,
          userId: p.userId,
          status: 'SENT'
        }))
      });

      // Create notifications for recipients
      for (const participant of otherParticipants) {
        await prisma.notification.create({
          data: {
            userId: participant.userId,
            type: 'MESSAGE',
            title: 'New project message',
            message: `${message.sender.firstName}: ${content?.substring(0, 50) || 'Sent a message'}`,
            data: {
              projectId: conversation.projectId,
              conversationId,
              messageId: message.id
            },
            actionUrl: `/projects/${conversation.projectId}`
          }
        });
      }

      // Emit real-time events
      try {
        const io = getIO();
        console.log(`📤 Emitting new_message to room: conversation_${conversationId}`);
        console.log(`📤 Message from user ${userId}:`, { messageId: message.id, content });
        
        // Get all sockets in the room to see who's connected
        const room = io.sockets.adapter.rooms.get(`conversation_${conversationId}`);
        console.log(`👥 Users in room conversation_${conversationId}:`, room ? Array.from(room) : 'No users');
        
        io.to(`conversation_${conversationId}`).emit('new_message', {
          ...message,
          conversationId
        });

        // Emit mentions
        mentions.forEach((mentionedUserId: string) => {
          console.log(`📢 Sending mention notification to user_${mentionedUserId}`);
          io.to(`user_${mentionedUserId}`).emit('message_mention', {
            messageId: message.id,
            conversationId,
            sender: message.sender
          });
        });
        
        // Emit to all participants' personal rooms for global notifications
        conversation.participants.forEach(participant => {
          if (participant.userId !== userId) {
            console.log(`📢 Sending global notification to user_${participant.userId}`);
            io.to(`user_${participant.userId}`).emit('new_message', {
              ...message,
              conversationId,
              projectId: conversation.projectId // Include project ID for navigation
            });
          }
        });
      } catch (error) {
        logger.error('Socket.IO emit error:', error);
      }

      res.status(201).json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  }

  async addReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { messageId } = req.params;
      const { emoji } = req.body;

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

      const reaction = await prisma.messageReaction.upsert({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji
          }
        },
        update: {},
        create: {
          messageId,
          userId,
          emoji
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } }
        }
      });

      // Emit real-time event
      try {
        const io = getIO();
        io.to(`conversation_${message.conversationId}`).emit('message_reaction_added', {
          messageId,
          reaction
        });
      } catch (error) {
        logger.error('Socket.IO emit error:', error);
      }

      res.json({ success: true, data: reaction });
    } catch (error) {
      next(error);
    }
  }

  async removeReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { messageId, emoji } = req.params;

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

      await prisma.messageReaction.delete({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji
          }
        }
      });

      // Emit real-time event
      try {
        const io = getIO();
        io.to(`conversation_${message.conversationId}`).emit('message_reaction_removed', {
          messageId,
          userId,
          emoji
        });
      } catch (error) {
        logger.error('Socket.IO emit error:', error);
      }

      res.json({ success: true, message: 'Reaction removed' });
    } catch (error) {
      next(error);
    }
  }

  async getMessageThread(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { messageId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

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

      const threadMessages = await prisma.message.findMany({
        where: { threadId: messageId },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          reactions: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } }
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: Number(limit)
      });

      const total = await prisma.message.count({ where: { threadId: messageId } });

      res.json({ 
        success: true, 
        data: {
          parentMessage: message,
          replies: threadMessages,
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

  async searchMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { 
        q, 
        conversationId, 
        from, 
        to, 
        type, 
        hasAttachments, 
        page = 1, 
        limit = 20 
      } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        conversation: {
          participants: {
            some: { userId }
          }
        }
      };

      if (q) {
        where.content = {
          contains: q as string,
          mode: 'insensitive'
        };
      }

      if (conversationId) where.conversationId = conversationId;
      if (type) where.messageType = type;
      if (hasAttachments === 'true') {
        where.attachments = {
          not: []
        };
      }
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from as string);
        if (to) where.createdAt.lte = new Date(to as string);
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
          conversation: {
            select: { id: true, title: true, type: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      const total = await prisma.message.count({ where });

      res.json({ 
        success: true, 
        data: messages,
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

  async updateConversationSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationId } = req.params;
      const settings = req.body;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true }
      });

      if (!conversation) {
        throw ApiError.notFound('Conversation not found');
      }

      const participant = conversation.participants.find(p => p.userId === userId);
      if (!participant || !['OWNER', 'ADMIN'].includes(participant.role)) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      const updatedSettings = await prisma.conversationSettings.upsert({
        where: { conversationId },
        update: settings,
        create: {
          conversationId,
          ...settings
        }
      });

      res.json({ success: true, data: updatedSettings });
    } catch (error) {
      next(error);
    }
  }

  async addConversationLabel(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationId } = req.params;
      const { name, color = '#6B7280' } = req.body;

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

      const label = await prisma.conversationLabel.create({
        data: {
          conversationId,
          name,
          color
        }
      });

      res.json({ success: true, data: label });
    } catch (error) {
      next(error);
    }
  }

  async bulkArchiveConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any)?.id;
      const { conversationIds } = req.body;

      await prisma.conversation.updateMany({
        where: {
          id: { in: conversationIds },
          participants: {
            some: { userId }
          }
        },
        data: {
          isArchived: true
        }
      });

      res.json({ success: true, message: 'Conversations archived' });
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

      // Update delivery status
      await prisma.messageDelivery.updateMany({
        where: {
          messageId,
          userId,
          status: 'SENT'
        },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date()
        }
      });

      // Emit real-time event
      try {
        const io = getIO();
        io.to(`conversation_${message.conversationId}`).emit('message_read', {
          messageId,
          userId
        });
      } catch (error) {
        logger.error('Socket.IO emit error:', error);
      }

      res.json({ success: true, message: 'Message marked as read' });
    } catch (error) {
      next(error);
    }
  }
}