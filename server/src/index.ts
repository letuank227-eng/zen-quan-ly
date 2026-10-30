import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { initSocketServer } from './services/socketService';
import { logger } from './utils/logger';

// Routes
import authRoutes from './routes/authRoutes';
import metaRoutes from './routes/metaRoutes';
import pagesRoutes from './routes/pagesRoutes';
import inboxRoutes from './routes/inboxRoutes';
import messengerRoutes from './routes/messengerRoutes';
import commentsRoutes from './routes/commentsRoutes';
import postsRoutes from './routes/postsRoutes';
import crmRoutes from './routes/crmRoutes';
import tagsRoutes from './routes/tagsRoutes';
import staffRoutes from './routes/staffRoutes';
import adsRoutes from './routes/adsRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import notificationsRoutes from './routes/notificationsRoutes';
import webhookRoutes from './routes/webhookRoutes';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration (hỗ trợ localhost và các thiết bị cùng mạng Wi-Fi/LAN)
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        origin === FRONTEND_URL ||
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(
          origin
        );
      if (isAllowed) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-hub-signature-256'],
  })
);

// Capture raw body for Meta Webhook signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
    limit: '10mb',
  })
);

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static uploads directory (attachments, custom avatars)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize Realtime WebSocket Server
initSocketServer(server);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ZEN Multi-Page Social CRM API',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/messenger', messengerRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/webhook', webhookRoutes);

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled server error:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Đã xảy ra lỗi máy chủ nội bộ.',
  });
});

// Crash Prevention: Catch all unhandled exceptions & promise rejections so port 5000 NEVER dies
process.on('uncaughtException', (err) => {
  logger.error('CRITICAL: Uncaught Exception caught (process preserved):', err.stack || err.message);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('CRITICAL: Unhandled Promise Rejection caught (process preserved):', reason?.stack || reason?.message || reason);
});

import { startAutoSyncWorker } from './services/autoSyncService';

// Start Server (Only when not running inside Vercel Serverless Function)
if (!process.env.VERCEL) {
  server.listen(Number(PORT), '0.0.0.0', () => {
    logger.info(`🚀 ZEN Social CRM Backend running on http://localhost:${PORT}`);
    logger.info(`📡 Webhook URL: http://localhost:${PORT}/api/webhook/meta`);
    logger.info(`🔗 Client URL: ${FRONTEND_URL}`);

    // Start continuous auto-sync worker for Meta conversations
    startAutoSyncWorker();
  });
}

export default app;
