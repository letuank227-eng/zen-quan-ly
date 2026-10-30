import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';

export class AnalyticsController {
  /**
   * Unified Dashboard metrics: calculated dynamically from connected pages
   */
  static async getDashboardOverview(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId } = req.query;

      // 1. Get connected pages
      const accessiblePages = await prisma.page.findMany({
        where: {
          accountId: req.user.accountId,
          isConnected: true,
          ...(req.user.role === 'STAFF' ? { permissions: { some: { userId: req.user.id } } } : {}),
        },
        select: { id: true, name: true, avatar: true, followersCount: true },
      });

      // If no page is connected, return zero state as required by spec
      if (accessiblePages.length === 0) {
        return res.json({
          success: true,
          hasPages: false,
          stats: {
            pageCount: 0,
            customerCount: 0,
            newMessages: 0,
            newComments: 0,
            pendingMessages: 0,
            pendingComments: 0,
            totalPosts: 0,
            totalFollowers: 0,
            adSpend: 0,
          },
          recentActivities: [],
        });
      }

      const allowedPageIds = accessiblePages.map(p => p.id);
      const targetPageIds = pageId && pageId !== 'all' ? allowedPageIds.filter(id => id === pageId) : allowedPageIds;

      const totalFollowers = accessiblePages
        .filter(p => targetPageIds.includes(p.id))
        .reduce((sum, p) => sum + p.followersCount, 0);

      // Dynamic counts from database
      const [
        customerCount,
        pendingMessages,
        pendingComments,
        totalPosts,
        recentMessages,
        recentComments,
      ] = await Promise.all([
        prisma.customer.count({
          where: {
            accountId: req.user.accountId,
            ...(pageId && pageId !== 'all' ? { primaryPageId: pageId.toString() } : {}),
          },
        }),
        prisma.conversation.count({
          where: { pageId: { in: targetPageIds }, status: 'PENDING' },
        }),
        prisma.comment.count({
          where: { pageId: { in: targetPageIds }, isFromPage: false, status: 'PENDING' },
        }),
        prisma.post.count({
          where: { pageId: { in: targetPageIds } },
        }),
        prisma.message.findMany({
          where: { pageId: { in: targetPageIds }, senderType: 'CUSTOMER' },
          include: {
            conversation: { include: { customer: true } },
            page: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.comment.findMany({
          where: { pageId: { in: targetPageIds }, isFromPage: false },
          include: {
            page: { select: { name: true } },
            post: { select: { message: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      // Combine recent activity
      const activities: any[] = [];
      for (const m of recentMessages) {
        activities.push({
          id: m.id,
          type: 'messenger',
          sender: m.conversation.customer.name,
          pageName: m.page.name,
          text: m.text,
          time: m.createdAt,
        });
      }
      for (const c of recentComments) {
        activities.push({
          id: c.id,
          type: 'comment',
          sender: c.authorName,
          pageName: c.page.name,
          text: c.message,
          time: c.createdAt,
        });
      }
      activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      // Get ad accounts spend
      const adAccounts = await prisma.adAccount.findMany({
        where: { accountId: req.user.accountId },
        select: { amountSpent: true },
      });
      const totalAdSpend = adAccounts.reduce((sum, a) => sum + a.amountSpent, 0);

      return res.json({
        success: true,
        hasPages: true,
        stats: {
          pageCount: accessiblePages.length,
          customerCount,
          newMessages: pendingMessages,
          newComments: pendingComments,
          pendingMessages,
          pendingComments,
          totalPosts,
          totalFollowers,
          adSpend: totalAdSpend,
        },
        recentActivities: activities.slice(0, 8),
      });
    } catch (error: any) {
      logger.error('Get dashboard overview error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải dữ liệu bảng điều khiển.' });
    }
  }

  /**
   * Page Insights and Analytics from Meta API
   */
  static async getPageInsights(req: AuthRequest, res: Response) {
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

      // Fetch dynamic insights directly from Meta Graph API
      const metaInsights = await MetaGraphService.fetchPageInsights(page.metaPageId, pageAccessToken);

      return res.json({
        success: true,
        page: {
          id: page.id,
          name: page.name,
          followersCount: page.followersCount,
        },
        insights: metaInsights,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tải dữ liệu thống kê Page: ' + error.message });
    }
  }
}
