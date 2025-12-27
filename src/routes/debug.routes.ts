import { Router } from 'express';
import { DebugController } from '@/controllers/debug.controller';

const router = Router();
const debugController = new DebugController();

// Only enable in development
if (process.env.NODE_ENV === 'development') {
  router.get('/rooms', debugController.getAllRooms);
  router.get('/rooms/:roomName', debugController.getRoomInfo);
}

export { router as debugRoutes };