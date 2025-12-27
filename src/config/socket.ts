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
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        console.log('❌ No token provided');
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwtSecret) as any;
      const userId = decoded.userId || decoded.id;
      
      if (!userId) {
        console.log('❌ No userId in token');
        return next(new Error('Invalid token format'));
      }
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, firstName: true, lastName: true }
      });

      if (!user) {
        console.log('❌ User not found:', userId);
        return next(new Error('User not found'));
      }

      console.log('✅ Socket authenticated:', user.firstName, user.lastName);
      socket.userId = user.id;
      socket.userData = user;
      
      next();
    } catch (error) {
      console.error('❌ Socket auth error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: any) => {
    console.log(`✅ User ${socket.userId} connected with socket ID: ${socket.id}`);

    // Join user's personal room
    socket.join(`user_${socket.userId}`);

    // Join conversation rooms
    socket.on('join_conversation', async (conversationId: string) => {
      try {
        console.log(`🔄 User ${socket.userId} attempting to join conversation ${conversationId}`);
        
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
          console.log(`✅ User ${socket.userId} joined conversation ${conversationId}`);
          console.log(`👥 Conversation participants:`, conversation.participants.map(p => `${p.user.firstName} ${p.user.lastName} (${p.userId})`));
          
          // Get current room members
          const room = ioInstance.sockets.adapter.rooms.get(`conversation_${conversationId}`);
          console.log(`👥 Current room members:`, room ? Array.from(room) : 'No members');
          
          // Notify others in the conversation
          socket.to(`conversation_${conversationId}`).emit('user_joined', {
            userId: socket.userId,
            user: socket.userData
          });
        } else {
          console.log(`❌ User ${socket.userId} not authorized for conversation ${conversationId}`);
          socket.emit('error', { message: 'Not authorized for this conversation' });
        }
      } catch (error) {
        console.error('❌ Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation_${conversationId}`);
      console.log(`🔌 User ${socket.userId} left conversation ${conversationId}`);
      
      // Notify others in the conversation
      socket.to(`conversation_${conversationId}`).emit('user_left', {
        userId: socket.userId
      });
    });

    socket.on('typing_start', (data: { conversationId: string }) => {
      console.log(`⌨️ User ${socket.userId} typing in ${data.conversationId}`);
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

    socket.on('disconnect', (reason) => {
      console.log(`🔌 User ${socket.userId} disconnected: ${reason}`);
    });
  });
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}