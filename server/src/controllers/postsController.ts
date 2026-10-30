import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';

export class PostsController {
  /**
   * List posts for a page or all pages
   */
  static async listPosts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId, limit = 50, page = 1 } = req.query;
      const take = Math.min(Number(limit) || 50, 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const accessiblePages = await prisma.page.findMany({
        where: {
          accountId: req.user.accountId,
          isConnected: true,
          ...(req.user.role === 'STAFF' ? { permissions: { some: { userId: req.user.id } } } : {}),
        },
        select: { id: true },
      });

      const allowedPageIds = accessiblePages.map(p => p.id);
      const targetPageIds = pageId ? allowedPageIds.filter(id => id === pageId) : allowedPageIds;

      const where: any = {
        pageId: { in: targetPageIds },
      };

      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          include: {
            page: { select: { id: true, name: true, avatar: true } },
            _count: { select: { comments: true } },
          },
          orderBy: { publishedAt: 'desc' },
          skip,
          take,
        }),
        prisma.post.count({ where }),
      ]);

      return res.json({ success: true, posts, total, page: Number(page), totalPages: Math.ceil(total / take) });
    } catch (error: any) {
      logger.error('List posts error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách bài viết.' });
    }
  }

  /**
   * Sync posts from Meta API for a specific page
   */
  static async syncPosts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId } = req.params;
      const page = await prisma.page.findFirst({
        where: { id: pageId, accountId: req.user.accountId },
      });

      if (!page) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy Page.' });
      }

      const pageAccessToken = decryptToken(page.encryptedAccessToken);
      if (!pageAccessToken) {
        return res.status(400).json({ success: false, message: 'Page Access Token không hợp lệ.' });
      }

      // Fetch dynamic posts directly from Meta Graph API (fetch up to 100 to capture all videos/reels)
      const metaPosts = await MetaGraphService.fetchPagePosts(page.metaPageId, pageAccessToken, 100);

      let syncedCount = 0;
      for (const p of metaPosts) {
        await prisma.post.upsert({
          where: { metaPostId: p.id },
          update: {
            message: p.message || null,
            permalinkUrl: p.permalink_url || null,
            picture: p.full_picture || null,
            videoUrl: p.video_url || null,
            likeCount: p.reactions?.summary?.total_count || 0,
            commentCount: p.comments?.summary?.total_count || 0,
            shareCount: p.shares?.count || 0,
          },
          create: {
            pageId: page.id,
            metaPostId: p.id,
            message: p.message || null,
            permalinkUrl: p.permalink_url || null,
            picture: p.full_picture || null,
            videoUrl: p.video_url || null,
            likeCount: p.reactions?.summary?.total_count || 0,
            commentCount: p.comments?.summary?.total_count || 0,
            shareCount: p.shares?.count || 0,
            publishedAt: p.created_time ? new Date(p.created_time) : new Date(),
          },
        });
        syncedCount++;
      }

      return res.json({
        success: true,
        message: `Đã đồng bộ thành công ${syncedCount} bài viết từ Meta.`,
        syncedCount,
      });
    } catch (error: any) {
      logger.error('Sync posts error:', error.message);
      return res.status(500).json({ success: false, message: 'Đồng bộ bài viết thất bại: ' + error.message });
    }
  }

  /**
   * Get post detail with full comment list
   */
  static async getPostDetail(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          page: { select: { id: true, name: true, avatar: true, metaPageId: true } },
          comments: {
            where: { parentId: null },
            include: {
              replies: {
                include: { assignedUser: { select: { id: true, fullName: true } } },
                orderBy: { createdAt: 'asc' },
              },
              assignedUser: { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!post) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết.' });
      }

      return res.json({ success: true, post });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tải chi tiết bài viết.' });
    }
  }
}
