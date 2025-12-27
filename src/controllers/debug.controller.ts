import { Request, Response } from 'express';
import { getIO } from '@/config/socket';

export class DebugController {
  async getRoomInfo(req: Request, res: Response) {
    try {
      const { roomName } = req.params;
      const io = getIO();
      
      const room = io.sockets.adapter.rooms.get(roomName);
      const connectedSockets = Array.from(io.sockets.sockets.keys());
      
      res.json({
        success: true,
        data: {
          roomName,
          members: room ? Array.from(room) : [],
          memberCount: room ? room.size : 0,
          allConnectedSockets: connectedSockets,
          totalConnected: connectedSockets.length
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getAllRooms(req: Request, res: Response) {
    try {
      const io = getIO();
      const rooms = Array.from(io.sockets.adapter.rooms.entries());
      
      res.json({
        success: true,
        data: {
          rooms: rooms.map(([name, sockets]) => ({
            name,
            members: Array.from(sockets),
            memberCount: sockets.size
          })),
          totalRooms: rooms.length
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}