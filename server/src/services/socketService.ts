import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

let io: SocketIOServer | null = null;

interface SocketUser {
  id: string;
  accountId: string;
  role: string;
  email: string;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Cho phép kết nối WebSocket từ localhost và các thiết bị cùng mạng Wi-Fi/LAN
        callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Socket Auth Middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }

    try {
      const secret = process.env.JWT_SECRET || 'zen_crm_jwt_secret_token_secure_key_2026_987654321';
      const decoded = jwt.verify(token, secret) as SocketUser;
      (socket as any).user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as SocketUser;
    if (!user) return;

    // Join account-wide room and user-specific room
    socket.join(`account_${user.accountId}`);
    socket.join(`user_${user.id}`);

    // Join specific page room on demand
    socket.on('join_page', (pageId: string) => {
      socket.join(`page_${pageId}`);
    });

    socket.on('leave_page', (pageId: string) => {
      socket.leave(`page_${pageId}`);
    });

    socket.on('disconnect', () => {
      // Clean up
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit event to account members
 */
export function emitToAccount(accountId: string, event: string, data: any) {
  if (io) {
    io.to(`account_${accountId}`).emit(event, data);
  }
}

/**
 * Emit event to users listening to a specific page
 */
export function emitToPage(pageId: string, event: string, data: any) {
  if (io) {
    io.to(`page_${pageId}`).emit(event, data);
  }
}

/**
 * Emit event to a specific user
 */
export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
}
