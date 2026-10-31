import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { emitToAccount, emitToPage } from '../services/socketService';

export class CommentsController {
  /**
   * List comments with filters
   */
  static async listComments(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId, postId, status, search, limit = 50, page = 1 } = req.query;

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
        parentId: null, // Top-level comments
      };

      if (postId) {
        where.postId = postId.toString();
      }

      if (status && status !== 'all') {
        where.status = status.toString().toUpperCase();
      }

      if (search) {
        where.OR = [
          { authorName: { contains: search.toString() } },
          { message: { contains: search.toString() } },
        ];
      }

      const [comments, total] = await Promise.all([
        prisma.comment.findMany({
          where,
          include: {
            page: { select: { id: true, name: true, avatar: true, metaPageId: true } },
            post: { select: { id: true, metaPostId: true, message: true, picture: true, permalinkUrl: true } },
            customer: { select: { id: true, name: true, avatar: true, metaId: true, phone: true, status: true } },
            assignedUser: { select: { id: true, fullName: true, avatar: true } },
            replies: {
              include: {
                page: { select: { id: true, name: true, avatar: true } },
                customer: { select: { id: true, name: true, avatar: true } },
                assignedUser: { select: { id: true, fullName: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.comment.count({ where }),
      ]);

      return res.json({ success: true, comments, total, page: Number(page), totalPages: Math.ceil(total / take) });
    } catch (error: any) {
      logger.error('List comments error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách bình luận.' });
    }
  }

  /**
   * Reply to a Comment (sends reply directly to Facebook Meta API)
   */
  static async replyComment(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { commentId } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Nội dung trả lời không được để trống.' });
      }

      const parentComment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: { page: true, post: true },
      });

      if (!parentComment) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bình luận gốc.' });
      }

      const pageAccessToken = decryptToken(parentComment.page.encryptedAccessToken);
      if (!pageAccessToken) {
        return res.status(400).json({ success: false, message: 'Page Access Token không hợp lệ.' });
      }

      // SEND TO META GRAPH API FIRST! (Rule: No fake success without Meta API confirmation)
      let metaResult: any;
      try {
        metaResult = await MetaGraphService.replyToComment(
          parentComment.metaCommentId,
          pageAccessToken,
          message.trim()
        );
      } catch (metaErr: any) {
        logger.error('Meta Reply Comment failed:', metaErr.message);
        return res.status(400).json({
          success: false,
          message: `Trả lời bình luận thất bại qua Meta API: ${metaErr.message}`,
        });
      }

      // Save reply in DB
      const reply = await prisma.comment.create({
        data: {
          pageId: parentComment.pageId,
          postId: parentComment.postId,
          metaCommentId: metaResult?.id || `reply_${Date.now()}`,
          parentId: parentComment.id,
          authorName: parentComment.page.name,
          authorMetaId: parentComment.page.metaPageId,
          message: message.trim(),
          status: 'RESOLVED',
          isFromPage: true,
          assignedUserId: req.user.id,
        },
        include: {
          page: { select: { id: true, name: true, avatar: true } },
          assignedUser: { select: { id: true, fullName: true } },
        },
      });

      // Update parent comment status to RESOLVED
      await prisma.comment.update({
        where: { id: parentComment.id },
        data: { status: 'RESOLVED' },
      });

      // Emit realtime update
      emitToPage(parentComment.pageId, 'comment_reply', {
        parentCommentId: parentComment.id,
        reply,
      });

      emitToAccount(parentComment.page.accountId, 'inbox_updated', {
        type: 'comment',
        id: parentComment.id,
        status: 'RESOLVED',
      });

      return res.json({
        success: true,
        message: 'Đã trả lời bình luận thành công trên Facebook.',
        reply,
      });
    } catch (error: any) {
      logger.error('Reply comment controller error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi trả lời bình luận: ' + error.message });
    }
  }

  /**
   * Send a Private Reply (Messenger) to a comment author
   */
  static async privateReply(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { commentId } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống.' });
      }

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: { page: true, post: true },
      });

      if (!comment) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bình luận.' });
      }

      const pageAccessToken = decryptToken(comment.page.encryptedAccessToken);
      if (!pageAccessToken) {
        return res.status(400).json({ success: false, message: 'Page Access Token không hợp lệ.' });
      }

      // SEND TO META GRAPH API
      let metaResult: any;
      try {
        metaResult = await MetaGraphService.sendPrivateReplyToComment(
          comment.page.metaPageId,
          pageAccessToken,
          comment.metaCommentId,
          message.trim()
        );
      } catch (metaErr: any) {
        logger.error('Meta Private Reply failed:', metaErr.message);
        return res.status(400).json({
          success: false,
          message: `Không thể gửi tin nhắn riêng cho bình luận này: ${metaErr.message} (Chính sách Meta chỉ cho phép gửi 1 tin nhắn riêng cho comment trong vòng 7 ngày).`,
        });
      }

      // Resolve Customer from recipient_id (Real PSID returned by Meta)
      const targetMetaId = metaResult?.recipient_id || comment.authorMetaId;
      let customer = await prisma.customer.findFirst({
        where: { accountId: req.user.accountId, metaId: targetMetaId },
      });

      if (!customer) {
        let realName = comment.authorName;
        let realAvatar: string | null = null;
        try {
          const profile = await MetaGraphService.getCustomerProfile(targetMetaId, pageAccessToken);
          if (profile?.name) realName = profile.name;
          if (profile?.profile_pic) realAvatar = profile.profile_pic;
        } catch {}

        customer = await prisma.customer.create({
          data: {
            accountId: req.user.accountId,
            primaryPageId: comment.pageId,
            metaId: targetMetaId,
            name: realName,
            avatar: realAvatar,
            status: 'NEW',
          },
        });
      }

      // Update comment with real customer and real name
      if (customer && customer.name !== 'Khách hàng Facebook') {
        await prisma.comment.update({
          where: { id: comment.id },
          data: {
            customerId: customer.id,
            authorName: customer.name,
            authorMetaId: targetMetaId,
          },
        });
      }

      let conv = await prisma.conversation.findFirst({
        where: { pageId: comment.pageId, customerId: customer.id },
      });

      if (!conv) {
        conv = await prisma.conversation.create({
          data: {
            pageId: comment.pageId,
            customerId: customer.id,
            snippet: message.trim(),
            status: 'PROCESSING',
            assignedUserId: req.user.id,
          },
        });
      } else {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            snippet: message.trim(),
            lastMessageAt: new Date(),
          },
        });
      }

      await prisma.message.create({
        data: {
          conversationId: conv.id,
          pageId: comment.pageId,
          metaMessageId: metaResult?.message_id || null,
          senderType: 'PAGE',
          senderId: comment.page.metaPageId,
          senderName: comment.page.name,
          text: message.trim(),
          isRead: true,
          sentStatus: 'SENT',
        },
      });

      // Update comment status
      await prisma.comment.update({
        where: { id: comment.id },
        data: { status: 'RESOLVED' },
      });

      return res.json({
        success: true,
        message: 'Đã gửi tin nhắn riêng Messenger thành công tới người bình luận.',
        conversationId: conv.id,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi gửi tin nhắn riêng: ' + error.message });
    }
  }

  /**
   * Update comment status
   */
  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { commentId } = req.params;
      const { status } = req.body;

      if (!['PENDING', 'PROCESSING', 'RESOLVED', 'HIDDEN'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
      }

      const updated = await prisma.comment.update({
        where: { id: commentId },
        data: { status },
      });

      return res.json({ success: true, message: 'Cập nhật trạng thái thành công.', comment: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái.' });
    }
  }

  /**
   * Sync comments from Meta API for all posts of a page
   */
  static async syncComments(req: AuthRequest, res: Response) {
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

      // 1. Sync media comments (videos, photos) directly via MetaGraphService
      const mediaComments = await MetaGraphService.fetchAllPageMediaComments(page.metaPageId, pageAccessToken);
      let totalSynced = 0;

      for (const mc of mediaComments) {
        // Find or create post for this media
        let post = await prisma.post.findFirst({
          where: {
            OR: [
              { metaPostId: mc.mediaId },
              { metaPostId: { endsWith: `_${mc.mediaId}` } },
              ...(mc.mediaDescription ? [{ message: { contains: mc.mediaDescription.substring(0, 30) } }] : [])
            ]
          }
        });

        if (!post) {
          post = await prisma.post.create({
            data: {
              pageId: page.id,
              metaPostId: mc.mediaId,
              message: mc.mediaDescription || null,
              likeCount: 0,
              commentCount: 1,
              publishedAt: mc.created_time ? new Date(mc.created_time) : new Date(),
            }
          });
        }

        let customer = await prisma.customer.findFirst({
          where: { accountId: req.user.accountId, metaId: mc.authorMetaId },
        });

        let mcAvatar = mc.authorAvatar || customer?.avatar || null;
        let mcName = mc.authorName;

        if (!mcAvatar && !mc.authorMetaId.startsWith('user_')) {
          try {
            const prof = await MetaGraphService.getCustomerProfile(mc.authorMetaId, pageAccessToken);
            if (prof?.profile_pic) mcAvatar = prof.profile_pic;
            if (prof?.name && mcName === 'Khách hàng Facebook') mcName = prof.name;
          } catch {}
        }

        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              accountId: req.user.accountId,
              primaryPageId: page.id,
              metaId: mc.authorMetaId,
              name: mcName,
              avatar: mcAvatar,
              status: 'NEW',
              lastInteractionAt: mc.created_time ? new Date(mc.created_time) : new Date(),
            },
          });
        } else if ((mcAvatar && !customer.avatar) || (mcName !== 'Khách hàng Facebook' && customer.name === 'Khách hàng Facebook')) {
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
              ...(mcAvatar && !customer.avatar ? { avatar: mcAvatar } : {}),
              ...(mcName !== 'Khách hàng Facebook' && customer.name === 'Khách hàng Facebook' ? { name: mcName } : {}),
            },
          });
        }

        await prisma.comment.upsert({
          where: { metaCommentId: mc.commentId },
          update: {
            message: mc.message || '',
            authorName: mcName,
            authorMetaId: mc.authorMetaId,
            status: 'PENDING',
          },
          create: {
            pageId: page.id,
            postId: post.id,
            metaCommentId: mc.commentId,
            customerId: customer.id,
            authorName: mcName,
            authorMetaId: mc.authorMetaId,
            message: mc.message || '',
            createdAt: mc.created_time ? new Date(mc.created_time) : new Date(),
            status: 'PENDING',
            isFromPage: mc.authorMetaId === page.metaPageId,
            canReplyPrivately: mc.authorMetaId !== page.metaPageId,
          },
        });
        totalSynced++;
      }

      // 2. Also try post comments
      const posts = await prisma.post.findMany({
        where: { pageId: page.id },
        orderBy: { publishedAt: 'desc' },
        take: 8,
      });

      for (const post of posts) {
        try {
          const comments = await MetaGraphService.fetchPostComments(post.metaPostId, pageAccessToken);
          if (Array.isArray(comments) && comments.length > 0) {
            for (const c of comments) {
              const authorMetaId = c.from?.id || `user_${c.id}`;
              let authorName = c.from?.name || 'Người dùng Facebook';
              let authorAvatar: string | null = c.from?.picture?.data?.url || null;

              let customer = await prisma.customer.findFirst({
                where: { accountId: req.user.accountId, metaId: authorMetaId },
              });

              if ((!authorAvatar || authorName.startsWith('Người dùng')) && !authorMetaId.startsWith('user_')) {
                try {
                  const prof = await MetaGraphService.getCustomerProfile(authorMetaId, pageAccessToken);
                  if (prof?.profile_pic) authorAvatar = prof.profile_pic;
                  if (prof?.name && authorName.startsWith('Người dùng')) authorName = prof.name;
                } catch {}
              }

              if (!customer) {
                customer = await prisma.customer.create({
                  data: {
                    accountId: req.user.accountId,
                    primaryPageId: page.id,
                    metaId: authorMetaId,
                    name: authorName,
                    avatar: authorAvatar,
                    status: 'NEW',
                    lastInteractionAt: c.created_time ? new Date(c.created_time) : new Date(),
                  },
                });
              } else if ((authorAvatar && !customer.avatar) || (!authorName.startsWith('Người dùng') && customer.name.startsWith('Người dùng'))) {
                customer = await prisma.customer.update({
                  where: { id: customer.id },
                  data: {
                    ...(authorAvatar && !customer.avatar ? { avatar: authorAvatar } : {}),
                    ...(!authorName.startsWith('Người dùng') && customer.name.startsWith('Người dùng') ? { name: authorName } : {}),
                  },
                });
              }

              const existingComment = await prisma.comment.findUnique({
                where: { metaCommentId: c.id },
              });

              const savedComment = await prisma.comment.upsert({
                where: { metaCommentId: c.id },
                update: {
                  message: c.message || '',
                  authorName,
                  authorMetaId,
                },
                create: {
                  pageId: page.id,
                  postId: post.id,
                  metaCommentId: c.id,
                  customerId: customer?.id || null,
                  authorName,
                  authorMetaId,
                  message: c.message || '',
                  createdAt: c.created_time ? new Date(c.created_time) : new Date(),
                  status: 'PENDING',
                  isFromPage: authorMetaId === page.metaPageId,
                  canReplyPrivately: authorMetaId !== page.metaPageId,
                },
              });

              if (!existingComment && authorMetaId !== page.metaPageId) {
                const commentPayload = {
                  pageId: page.id,
                  comment: savedComment,
                  post,
                };
                emitToPage(page.id, 'new_comment', commentPayload);
                emitToAccount(page.accountId, 'new_comment', commentPayload);
              }
              totalSynced++;
            }

            // Update post comment count
            await prisma.post.update({
              where: { id: post.id },
              data: { commentCount: comments.length },
            });
          }
        } catch (postErr: any) {
          // Continue gracefully
        }
      }

      return res.json({
        success: true,
        message: `Đã đồng bộ ${totalSynced} bình luận từ Meta Facebook.`,
        totalSynced,
      });
    } catch (error: any) {
      logger.error('Sync comments error:', error.message);
      return res.status(500).json({ success: false, message: 'Đồng bộ bình luận thất bại: ' + error.message });
    }
  }
}
