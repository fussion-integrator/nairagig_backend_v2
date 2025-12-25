import { Router } from 'express';
import { MessageController } from '@/controllers/message.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const messageController = new MessageController();

// All routes require authentication
router.use(authenticate);

router.get('/conversations', messageController.getConversations.bind(messageController));
router.get('/conversations/:conversationId', messageController.getConversation.bind(messageController));
router.post('/conversations', messageController.createConversation.bind(messageController));
router.post('/conversations/:conversationId/messages', messageController.sendMessage.bind(messageController));
router.put('/messages/:messageId/read', messageController.markAsRead.bind(messageController));

export { router as messageRoutes };