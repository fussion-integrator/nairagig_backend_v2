import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { logger } from '@/utils/logger';
import { prisma } from './database';

let ioInstance: Server;

export function setupSocketIO(io: Server) {
  ioInstance = io;
  
  // Authentication middleware
  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                   socket.request.headers.cookie?.split(';')
                     .find(c => c.trim().startsWith('access_token='))
                     ?.split('=')[1];
      
      const userId = socket.handshake.auth.userId;
      
      if (!userId && !token) {
        logger.warn('Socket authentication failed: No authentication provided');
        return next(new Error('Authentication required'));
      }

      let user;
      if (userId) {
        // Direct userId authentication (for cookie-based auth)
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, firstName: true, lastName: true }
        });
      } else if (token) {
        // Token-based authentication
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        const tokenUserId = decoded.userId || decoded.id;
        
        if (!tokenUserId) {
          logger.warn('Socket authentication failed: No userId in token');
          return next(new Error('Invalid token format'));
        }
        
        user = await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: { id: true, role: true, firstName: true, lastName: true }
        });
      }

      if (!user) {
        logger.warn('Socket authentication failed: User not found');
        return next(new Error('User not found'));
      }

      logger.info(`Socket authenticated for user ID: ${user.id}`);
      socket.userId = user.id;
      socket.userData = user;
      
      next();
    } catch (error: any) {
      logger.error('Socket authentication error');
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: any) => {
    logger.info(`User connected with socket ID: ${socket.id}`);

    // Join user's personal room
    socket.join(`user_${socket.userId}`);

    // Join conversation rooms
    socket.on('join_conversation', async (conversationId: string) => {
      try {
        logger.info(`User attempting to join conversation`);
        
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            participants: {
              some: { userId: socket.userId }
            }
          },
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true } }
              }
            }
          }
        });

        if (conversation) {
          socket.join(`conversation_${conversationId}`);
          logger.info(`User joined conversation successfully`);
          
          // Get current room members count only
          const room = ioInstance.sockets.adapter.rooms.get(`conversation_${conversationId}`);
          logger.info(`Conversation has ${room ? room.size : 0} active members`);
          
          // Notify others in the conversation
          socket.to(`conversation_${conversationId}`).emit('user_joined', {
            userId: socket.userId,
            user: socket.userData
          });
        } else {
          logger.warn('User not authorized for conversation');
          socket.emit('error', { message: 'Not authorized for this conversation' });
        }
      } catch (error) {
        logger.error('Error joining conversation');
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation_${conversationId}`);
      logger.info('User left conversation');
      
      // Notify others in the conversation
      socket.to(`conversation_${conversationId}`).emit('user_left', {
        userId: socket.userId
      });
    });

    socket.on('typing_start', (data: { conversationId: string }) => {
      logger.debug('User typing event');
      socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
        userId: socket.userId,
        user: socket.userData,
        conversationId: data.conversationId
      });
    });

    socket.on('typing_stop', (data: { conversationId: string }) => {
      socket.to(`conversation_${data.conversationId}`).emit('user_stopped_typing', {
        userId: socket.userId,
        conversationId: data.conversationId
      });
    });

    socket.on('disconnect', (reason: string) => {
      logger.info(`User disconnected: ${reason}`);
    });

    // WebRTC Signaling Events
    socket.on('call-offer', (data: { offer: any, to: string, type: 'voice' | 'video' }) => {
      logger.info('Call offer initiated');
      socket.to(`user_${data.to}`).emit('incoming-call', {
        offer: data.offer,
        from: socket.userId,
        type: data.type,
        caller: socket.userData
      });
    });

    socket.on('call-answer', (data: { answer: any, to: string }) => {
      logger.info('Call answered');
      socket.to(`user_${data.to}`).emit('call-answered', {
        answer: data.answer,
        from: socket.userId
      });
    });

    socket.on('ice-candidate', (data: { candidate: any, to: string }) => {
      socket.to(`user_${data.to}`).emit('ice-candidate', {
        candidate: data.candidate,
        from: socket.userId
      });
    });

    socket.on('call-end', (data: { to: string }) => {
      logger.info('Call ended');
      socket.to(`user_${data.to}`).emit('call-ended', {
        from: socket.userId
      });
    });
  });
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}