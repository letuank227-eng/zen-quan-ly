import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

export class InboxController {
  /**
   * Unified Inbox: combines Messenger conversations and Comments with rich filtering
   */
  static async getUnifiedInbox(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const {
        type = 'all', // all, messenger, comment
        status = 'all', // all, pending, processing, resolved
        pageId, // optional page filter
        assignedUserId, // optional staff filter
        search, // search text or customer name
        startDate,
        endDate,
        limit = 30,
        page = 1,
      } = req.query;

      const take = Math.min(Number(limit) || 30, 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      // Base page filter ensuring tenant isolation
      const accessiblePages = await prisma.page.findMany({
        where: {
          accountId: req.user.accountId,
          isConnected: true,
          ...(req.user.role === 'STAFF' ? { permissions: { some: { userId: req.user.id } } } : {}),
        },
        select: { id: true },
      });

      const allowedPageIds = accessiblePages.map(p => p.id);
      if (allowedPageIds.length === 0) {
        return res.json({
          success: true,
          items: [],
          total: 0,
          stats: { pending: 0, processing: 0, resolved: 0, messengerCount: 0, commentCount: 0 },
        });
      }

      const targetPageIds = pageId ? allowedPageIds.filter(id => id === pageId) : allowedPageIds;

      let items: any[] = [];

      // 1. Fetch Messenger Conversations
      if (type === 'all' || type === 'messenger') {
        const convWhere: any = {
          pageId: { in: targetPageIds },
        };

        if (status !== 'all') {
          convWhere.status = status.toString().toUpperCase();
        }

        if (assignedUserId) {
          convWhere.assignedUserId = assignedUserId === 'unassigned' ? null : assignedUserId.toString();
        }

        if (startDate || endDate) {
          convWhere.lastMessageAt = {};
          if (startDate) convWhere.lastMessageAt.gte = new Date(startDate.toString());
          if (endDate) convWhere.lastMessageAt.lte = new Date(endDate.toString());
        }

        if (search) {
          const q = search.toString();
          convWhere.OR = [
            { customer: { name: { contains: q } } },
            { snippet: { contains: q } },
          ];
        }

        const conversations = await prisma.conversation.findMany({
          where: convWhere,
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                avatar: true,
                metaId: true,
                phone: true,
                status: true,
                tags: { include: { tag: true } },
              },
            },
            page: {
              select: { id: true, name: true, avatar: true },
            },
            assignedUser: {
              select: { id: true, fullName: true, avatar: true },
            },
          },
          orderBy: { lastMessageAt: 'desc' },
          take: take * 2,
        });

        const mappedConvs = conversations.map(c => ({
          id: c.id,
          type: 'messenger',
          pageId: c.pageId,
          pageName: c.page.name,
          pageAvatar: c.page.avatar,
          customer: c.customer,
          content: c.snippet || 'Tin nhắn mới',
          timestamp: c.lastMessageAt,
          status: c.status,
          unreadCount: c.unreadCount,
          assignedUser: c.assignedUser,
        }));

        items = items.concat(mappedConvs);
      }

      // 2. Fetch Comments
      if (type === 'all' || type === 'comment') {
        const commWhere: any = {
          pageId: { in: targetPageIds },
          isFromPage: false, // Only customer comments to handle
        };

        if (status !== 'all') {
          commWhere.status = status.toString().toUpperCase();
        }

        if (assignedUserId) {
          commWhere.assignedUserId = assignedUserId === 'unassigned' ? null : assignedUserId.toString();
        }

        if (startDate || endDate) {
          commWhere.createdAt = {};
          if (startDate) commWhere.createdAt.gte = new Date(startDate.toString());
          if (endDate) commWhere.createdAt.lte = new Date(endDate.toString());
        }

        if (search) {
          const q = search.toString();
          commWhere.OR = [
            { authorName: { contains: q } },
            { message: { contains: q } },
          ];
        }

        const comments = await prisma.comment.findMany({
          where: commWhere,
          include: {
            page: { select: { id: true, name: true, avatar: true } },
            post: { select: { id: true, metaPostId: true, message: true, picture: true } },
            assignedUser: { select: { id: true, fullName: true, avatar: true } },
            customer: {
              select: {
                id: true,
                name: true,
                avatar: true,
                tags: { include: { tag: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: take * 2,
        });

        const mappedComments = comments.map(c => ({
          id: c.id,
          type: 'comment',
          pageId: c.pageId,
          pageName: c.page.name,
          pageAvatar: c.page.avatar,
          customer: c.customer || {
            name: c.authorName,
            avatar: null,
            metaId: c.authorMetaId,
            tags: [],
          },
          content: c.message,
          timestamp: c.createdAt,
          status: c.status,
          unreadCount: c.status === 'PENDING' ? 1 : 0,
          assignedUser: c.assignedUser,
          post: c.post,
          canReplyPrivately: c.canReplyPrivately,
        }));

        items = items.concat(mappedComments);
      }

      // Sort by timestamp desc
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Slice page
      const paginatedItems = items.slice(skip, skip + take);

      // Compute stats
      const [
        pendingConvs,
        pendingComms,
        procConvs,
        procComms,
        resConvs,
        resComms,
        totalMessages,
        totalComments,
      ] = await Promise.all([
        prisma.conversation.count({ where: { pageId: { in: targetPageIds }, status: 'PENDING' } }),
        prisma.comment.count({ where: { pageId: { in: targetPageIds }, isFromPage: false, status: 'PENDING' } }),
        prisma.conversation.count({ where: { pageId: { in: targetPageIds }, status: 'PROCESSING' } }),
        prisma.comment.count({ where: { pageId: { in: targetPageIds }, isFromPage: false, status: 'PROCESSING' } }),
        prisma.conversation.count({ where: { pageId: { in: targetPageIds }, status: 'RESOLVED' } }),
        prisma.comment.count({ where: { pageId: { in: targetPageIds }, isFromPage: false, status: 'RESOLVED' } }),
        prisma.conversation.count({ where: { pageId: { in: targetPageIds } } }),
        prisma.comment.count({ where: { pageId: { in: targetPageIds }, isFromPage: false } }),
      ]);

      const pendingCount = pendingConvs + pendingComms;
      const processingCount = procConvs + procComms;
      const resolvedCount = resConvs + resComms;

      return res.json({
        success: true,
        items: paginatedItems,
        total: items.length,
        stats: {
          pending: pendingCount,
          processing: processingCount,
          resolved: resolvedCount,
          messengerCount: totalMessages,
          commentCount: totalComments,
        },
      });
    } catch (error: any) {
      logger.error('Get unified inbox error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách Inbox.' });
    }
  }
}
