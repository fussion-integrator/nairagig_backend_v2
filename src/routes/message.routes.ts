import { Router } from 'express';
import { MessageController } from '@/controllers/message.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const messageController = new MessageController();

// All routes require authentication
router.use(authenticate);

// Conversation routes
router.get('/conversations', messageController.getConversations.bind(messageController));
router.get('/conversations/:conversationId', messageController.getConversation.bind(messageController));
router.post('/conversations', messageController.createConversation.bind(messageController));
router.put('/conversations/:conversationId/settings', messageController.updateConversationSettings.bind(messageController));
router.post('/conversations/:conversationId/labels', messageController.addConversationLabel.bind(messageController));
router.post('/conversations/bulk-archive', messageController.bulkArchiveConversations.bind(messageController));

// Message routes
router.post('/conversations/:conversationId/messages', messageController.sendMessage.bind(messageController));
router.get('/messages/search', messageController.searchMessages.bind(messageController));
router.get('/messages/:messageId/thread', messageController.getMessageThread.bind(messageController));
router.put('/messages/:messageId/read', messageController.markAsRead.bind(messageController));

// Reaction routes
router.post('/messages/:messageId/reactions', messageController.addReaction.bind(messageController));
router.delete('/messages/:messageId/reactions/:emoji', messageController.removeReaction.bind(messageController));

export { router as messageRoutes };