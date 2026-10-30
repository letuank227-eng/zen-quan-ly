import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';

export class PagesController {
  /**
   * List connected pages accessible by user
   */
  static async listPages(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      let whereClause: any = {
        accountId: req.user.accountId,
        isConnected: true,
      };

      // If user is STAFF, only return pages they have permission for
      if (req.user.role === 'STAFF') {
        whereClause.permissions = {
          some: { userId: req.user.id },
        };
      }

      const pages = await prisma.page.findMany({
        where: whereClause,
        select: {
          id: true,
          metaPageId: true,
          name: true,
          category: true,
          avatar: true,
          followersCount: true,
          isWebhookSubscribed: true,
          isConnected: true,
          instagramBusinessId: true,
          instagramUsername: true,
          createdAt: true,
          _count: {
            select: {
              conversations: true,
              comments: true,
              posts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, pages });
    } catch (error: any) {
      logger.error('List pages error:', error.message);
      return res.status(500).json({ success: false, message: 'Không thể lấy danh sách Page.' });
    }
  }

  /**
   * Get single page detail
   */
  static async getPageDetail(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const page = await prisma.page.findFirst({
        where: { id, accountId: req.user.accountId },
        include: {
          permissions: {
            include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
          },
          _count: {
            select: {
              conversations: true,
              comments: true,
              posts: true,
            },
          },
        },
      });

      if (!page) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy Page.' });
      }

      return res.json({
        success: true,
        page: {
          id: page.id,
          metaPageId: page.metaPageId,
          name: page.name,
          category: page.category,
          avatar: page.avatar,
          followersCount: page.followersCount,
          isWebhookSubscribed: page.isWebhookSubscribed,
          instagramBusinessId: page.instagramBusinessId,
          instagramUsername: page.instagramUsername,
          isConnected: page.isConnected,
          permissions: page.permissions,
          counts: page._count,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Không thể lấy thông tin Page.' });
    }
  }

  /**
   * Sync latest Page info from Meta API (followers, avatar, etc.)
   */
  static async syncPage(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const page = await prisma.page.findFirst({
        where: { id, accountId: req.user.accountId },
      });

      if (!page) return res.status(404).json({ success: false, message: 'Không tìm thấy Page.' });

      const pageAccessToken = decryptToken(page.encryptedAccessToken);
      if (!pageAccessToken) {
        return res.status(400).json({ success: false, message: 'Page Access Token không hợp lệ.' });
      }

      // Re-subscribe webhook
      const isSubscribed = await MetaGraphService.subscribePageToWebhook(page.metaPageId, pageAccessToken);

      const updated = await prisma.page.update({
        where: { id },
        data: { isWebhookSubscribed: isSubscribed },
      });

      return res.json({
        success: true,
        message: 'Đồng bộ thông tin Page thành công.',
        page: {
          id: updated.id,
          name: updated.name,
          isWebhookSubscribed: updated.isWebhookSubscribed,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Đồng bộ Page thất bại: ' + error.message });
    }
  }
}
