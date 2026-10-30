import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

export class NotificationsController {
  /**
   * List notifications for user
   */
  static async listNotifications(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const notifications = await prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      const unreadCount = await prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      });

      return res.json({ success: true, notifications, unreadCount });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tải thông báo.' });
    }
  }

  /**
   * Mark single notification as read
   */
  static async markAsRead(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      await prisma.notification.updateMany({
        where: { id, userId: req.user.id },
        data: { isRead: true },
      });

      return res.json({ success: true, message: 'Đã đánh dấu đã đọc.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật thông báo.' });
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      await prisma.notification.updateMany({
        where: { userId: req.user.id, isRead: false },
        data: { isRead: true },
      });

      return res.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật thông báo.' });
    }
  }

  /**
   * Simulate a real-time incoming customer message to test end-to-end socket & audio
   */
  static async testIncoming(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { type = 'message' } = req.body;
      const { emitToAccount } = await import('../services/socketService');

      if (type === 'comment') {
        emitToAccount(req.user.accountId, 'new_comment', {
          id: 'test_comment_' + Date.now(),
          message: 'Dạ shop ơi, sản phẩm này còn màu đen không ạ?',
          fromName: 'Khách hàng thử nghiệm',
          createdAt: new Date(),
        });
      } else {
        emitToAccount(req.user.accountId, 'new_message', {
          message: {
            id: 'test_msg_' + Date.now(),
            text: 'Chào shop! Shop còn hàng này không tư vấn mình với?',
            senderType: 'CUSTOMER',
            senderName: 'Khách hàng thử nghiệm',
            createdAt: new Date(),
          },
        });
      }

      return res.json({ success: true, message: `Đã phát sự kiện giả lập ${type} thành công!` });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi phát sự kiện test: ' + error.message });
    }
  }
}
