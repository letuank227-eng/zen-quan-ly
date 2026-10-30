import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { emitToAccount, emitToPage, emitToUser } from '../services/socketService';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export class MessengerController {
  /**
   * Get conversations for a page or all pages
   */
  static async getConversations(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId, status, assignedUserId, search } = req.query;

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

      if (status && status !== 'all') {
        where.status = status.toString().toUpperCase();
      }

      if (assignedUserId) {
        where.assignedUserId = assignedUserId === 'unassigned' ? null : assignedUserId.toString();
      }

      if (search) {
        where.customer = {
          name: { contains: search.toString() },
        };
      }

      const conversations = await prisma.conversation.findMany({
        where,
        include: {
          customer: {
            include: {
              tags: { include: { tag: true } },
            },
          },
          page: {
            select: { id: true, name: true, avatar: true },
          },
          assignedUser: {
            select: { id: true, fullName: true, avatar: true, email: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      return res.json({ success: true, conversations });
    } catch (error: any) {
      logger.error('Get conversations error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách hội thoại.' });
    }
  }

  /**
   * Get messages inside a conversation
   */
  static async getMessages(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { conversationId } = req.params;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          customer: {
            include: {
              tags: { include: { tag: true } },
              notes: {
                include: { user: { select: { fullName: true } } },
                orderBy: { createdAt: 'desc' },
              },
            },
          },
          page: { select: { id: true, name: true, avatar: true, metaPageId: true, encryptedAccessToken: true } },
          assignedUser: { select: { id: true, fullName: true } },
        },
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại.' });
      }

      // Lazy-fetch customer profile from Meta if missing avatar
      if (conversation.customer && !conversation.customer.avatar && conversation.customer.metaId) {
        let newAvatar: string | null = null;
        let newName = conversation.customer.name;
        try {
          const pageToken = decryptToken((conversation.page as any).encryptedAccessToken);
          if (pageToken) {
            const profile = await MetaGraphService.getCustomerProfile(conversation.customer.metaId, pageToken);
            if (profile) {
              if (profile.profile_pic) newAvatar = profile.profile_pic;
              if (profile.name && (conversation.customer.name.startsWith('Khách hàng #') || conversation.customer.name === 'Khách hàng')) {
                newName = profile.name;
              }
            }
          }
        } catch (e: any) {
          // Ignore profile fetch failure
        }
        if (newAvatar || (newName && newName !== conversation.customer.name)) {
          const updateData: any = {};
          if (newAvatar) updateData.avatar = newAvatar;
          if (newName && newName !== conversation.customer.name) updateData.name = newName;
          await prisma.customer.update({
            where: { id: conversation.customer.id },
            data: updateData,
          }).catch(() => {});
          if (newAvatar) (conversation.customer as any).avatar = newAvatar;
          if (newName) (conversation.customer as any).name = newName;
        }
      }

      // Remove sensitive encryptedAccessToken before responding
      delete (conversation.page as any).encryptedAccessToken;

      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });

      // Mark unread messages as read
      if (conversation.unreadCount > 0) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { unreadCount: 0 },
        });

        await prisma.message.updateMany({
          where: { conversationId, isRead: false },
          data: { isRead: true },
        });
      }

      return res.json({
        success: true,
        conversation,
        messages,
      });
    } catch (error: any) {
      logger.error('Get messages error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải tin nhắn.' });
    }
  }

  /**
   * Send a Messenger message from App to Customer via Meta Graph API
   */
  static async sendMessage(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { conversationId } = req.params;
      const { text } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống.' });
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          page: true,
          customer: true,
        },
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại.' });
      }

      // Decrypt page access token
      const pageAccessToken = decryptToken(conversation.page.encryptedAccessToken);
      if (!pageAccessToken) {
        return res.status(400).json({
          success: false,
          message: 'Không tìm thấy Page Access Token hợp lệ. Vui lòng kết nối lại Page.',
        });
      }

      // SEND TO META GRAPH API FIRST! (Rule: No fake success without Meta API confirmation)
      let metaResponse: any;
      try {
        metaResponse = await MetaGraphService.sendMessengerMessage(
          conversation.page.metaPageId,
          pageAccessToken,
          conversation.customer.metaId,
          text.trim()
        );
      } catch (metaErr: any) {
        logger.error('Meta Send Message failed:', metaErr.message);
        return res.status(400).json({
          success: false,
          message: `Gửi tin nhắn thất bại: ${metaErr.message}`,
        });
      }

      // Save message in DB
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          pageId: conversation.pageId,
          metaMessageId: metaResponse?.message_id || null,
          senderType: 'PAGE',
          senderId: conversation.page.metaPageId,
          senderName: conversation.page.name,
          text: text.trim(),
          isRead: true,
          sentStatus: 'SENT',
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          snippet: text.trim(),
          lastMessageAt: new Date(),
          status: conversation.status === 'PENDING' ? 'PROCESSING' : conversation.status,
        },
      });

      // Update customer last interaction
      await prisma.customer.update({
        where: { id: conversation.customer.id },
        data: { lastInteractionAt: new Date() },
      });

      // Emit realtime update to Socket.IO
      const payload = {
        conversationId: conversation.id,
        pageId: conversation.pageId,
        message,
      };

      emitToPage(conversation.pageId, 'message_sent', payload);
      emitToAccount(conversation.page.accountId, 'message_sent', payload);
      emitToAccount(conversation.page.accountId, 'conversation_updated', {
        id: conversation.id,
        snippet: text.trim(),
        lastMessageAt: message.createdAt,
      });

      return res.json({
        success: true,
        message: 'Gửi tin nhắn thành công.',
        data: message,
      });
    } catch (error: any) {
      logger.error('Send message controller error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi gửi tin nhắn: ' + error.message });
    }
  }

  /**
   * Send an image or file attachment from App to Customer via Meta Graph API
   */
  static async sendAttachment(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { conversationId } = req.params;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ success: false, message: 'Chưa chọn tệp hoặc hình ảnh tải lên.' });
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          page: true,
          customer: true,
        },
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại.' });
      }

      const pageAccessToken = decryptToken(conversation.page.encryptedAccessToken);
      if (!pageAccessToken) {
        return res.status(400).json({
          success: false,
          message: 'Không tìm thấy Page Access Token hợp lệ. Vui lòng kết nối lại Page.',
        });
      }

      // Save file to server/uploads/attachments/
      const uploadsDir = path.join(__dirname, '../../uploads/attachments');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, file.buffer);

      const localFileUrl = `/uploads/attachments/${filename}`;

      // SEND TO META GRAPH API FIRST
      let metaResponse: any;
      try {
        metaResponse = await MetaGraphService.sendMessengerImage(
          conversation.page.metaPageId,
          pageAccessToken,
          conversation.customer.metaId,
          file.buffer,
          file.originalname || filename,
          file.mimetype || 'image/jpeg'
        );
      } catch (metaErr: any) {
        logger.error('Meta Send Image failed:', metaErr.message);
        return res.status(400).json({
          success: false,
          message: `Gửi hình ảnh thất bại qua Meta API: ${metaErr.message}`,
        });
      }

      const attachmentsData = [
        {
          id: metaResponse?.attachment_id || filename,
          mime_type: file.mimetype,
          name: file.originalname,
          size: file.size,
          image_data: {
            url: localFileUrl,
            preview_url: localFileUrl,
          },
          payload: {
            url: localFileUrl,
          },
        },
      ];

      // Save message in DB
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          pageId: conversation.pageId,
          metaMessageId: metaResponse?.message_id || null,
          senderType: 'PAGE',
          senderId: conversation.page.metaPageId,
          senderName: conversation.page.name,
          text: '[Hình ảnh]',
          attachments: JSON.stringify(attachmentsData),
          isRead: true,
          sentStatus: 'SENT',
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          snippet: '[Hình ảnh]',
          lastMessageAt: new Date(),
          status: conversation.status === 'PENDING' ? 'PROCESSING' : conversation.status,
        },
      });

      // Update customer last interaction
      await prisma.customer.update({
        where: { id: conversation.customer.id },
        data: { lastInteractionAt: new Date() },
      });

      // Emit realtime update to Socket.IO
      const payload = {
        conversationId: conversation.id,
        pageId: conversation.pageId,
        message,
      };

      emitToPage(conversation.pageId, 'message_sent', payload);
      emitToAccount(conversation.page.accountId, 'message_sent', payload);
      emitToAccount(conversation.page.accountId, 'conversation_updated', {
        id: conversation.id,
        snippet: '[Hình ảnh]',
        lastMessageAt: message.createdAt,
      });

      return res.json({
        success: true,
        message: 'Gửi hình ảnh thành công.',
        data: message,
      });
    } catch (error: any) {
      logger.error('Send attachment controller error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi gửi tệp đính kèm: ' + error.message });
    }
  }

  /**
   * Update conversation status (PENDING, PROCESSING, RESOLVED)
   */
  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { conversationId } = req.params;
      const { status } = req.body;

      if (!['PENDING', 'PROCESSING', 'RESOLVED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: { status },
      });

      return res.json({ success: true, message: 'Cập nhật trạng thái thành công.', conversation: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái.' });
    }
  }

  /**
   * Assign conversation to staff
   */
  static async assignStaff(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { conversationId } = req.params;
      const { staffId } = req.body;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { page: true, customer: true },
      });

      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại.' });
      }

      const assignedUserId = staffId || null;

      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: { assignedUserId },
        include: { assignedUser: { select: { id: true, fullName: true } } },
      });

      // Create notification for assigned staff
      if (staffId && staffId !== req.user.id) {
        const notif = await prisma.notification.create({
          data: {
            userId: staffId,
            title: 'Hội thoại mới được giao',
            message: `${req.user.fullName} đã giao hội thoại của khách hàng "${conversation.customer.name}" cho bạn.`,
            type: 'ASSIGNMENT',
            pageId: conversation.pageId,
            referenceId: conversation.id,
          },
        });
        emitToUser(staffId, 'notification', notif);
      }

        return res.json({
          success: true,
          message: staffId ? 'Gán nhân viên thành công.' : 'Hủy gán nhân viên thành công.',
          conversation: updated,
        });
      } catch (error: any) {
        return res.status(500).json({ success: false, message: 'Lỗi gán nhân viên.' });
      }
    }

  /**
   * Sync latest conversations and messages on-demand from Meta
   */
  static async syncConversations(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId } = req.query;

      const whereClause: any = {
        accountId: req.user.accountId,
        isConnected: true,
      };

      if (pageId && pageId !== 'all') {
        whereClause.id = pageId.toString();
      }

      const pages = await prisma.page.findMany({
        where: whereClause,
      });

      if (pages.length === 0) {
        return res.json({ success: true, count: 0, message: 'Không có Trang nào được kết nối.' });
      }

      let totalSynced = 0;

      for (const page of pages) {
        const pageAccessToken = decryptToken(page.encryptedAccessToken);
        if (!pageAccessToken) continue;

        try {
          const limitParam = Number(req.query.limit) || 8;
          const convsRes = await axios.get(
            `https://graph.facebook.com/v19.0/${page.metaPageId}/conversations`,
            {
              params: {
                access_token: pageAccessToken,
                fields: 'id,snippet,updated_time,unread_count,senders,messages.limit(30){id,message,created_time,from,attachments{id,mime_type,name,size,image_data,file_url}}',
                limit: limitParam,
              },
            }
          );

          const convList = convsRes.data.data || [];

          for (const c of convList) {
            const otherSender =
              c.senders?.data?.find((s: any) => s.id !== page.metaPageId) || c.senders?.data?.[0];
            const customerName = otherSender?.name || 'Khách hàng';
            const customerPsid = otherSender?.id || c.id;

            let customer = await prisma.customer.findUnique({
              where: {
                accountId_metaId: {
                  accountId: page.accountId,
                  metaId: customerPsid,
                },
              },
            });

            let finalName = customerName;
            let finalAvatar: string | null = null;

            if (!customer || !customer.avatar || customer.name === 'Khách hàng' || customer.name.startsWith('Khách hàng #')) {
              try {
                const profile = await MetaGraphService.getCustomerProfile(customerPsid, pageAccessToken);
                if (profile) {
                  if (profile.name) finalName = profile.name;
                  if (profile.profile_pic) finalAvatar = profile.profile_pic;
                }
              } catch (e: any) {
                // Ignore profile fetch failure
              }
            }

            customer = await prisma.customer.upsert({
              where: {
                accountId_metaId: {
                  accountId: page.accountId,
                  metaId: customerPsid,
                },
              },
              update: {
                lastInteractionAt: new Date(c.updated_time),
                ...(finalAvatar && !customer?.avatar ? { avatar: finalAvatar } : {}),
                ...(customer?.name === 'Khách hàng' && finalName !== 'Khách hàng' ? { name: finalName } : {}),
              },
              create: {
                accountId: page.accountId,
                primaryPageId: page.id,
                metaId: customerPsid,
                name: finalName,
                avatar: finalAvatar,
                lastInteractionAt: new Date(c.updated_time),
              },
            });

            const conv = await prisma.conversation.upsert({
              where: {
                pageId_customerId: {
                  pageId: page.id,
                  customerId: customer.id,
                },
              },
              update: {
                metaConversationId: c.id,
                snippet: c.snippet || null,
                unreadCount: c.unread_count || 0,
                lastMessageAt: new Date(c.updated_time),
              },
              create: {
                pageId: page.id,
                customerId: customer.id,
                metaConversationId: c.id,
                snippet: c.snippet || null,
                unreadCount: c.unread_count || 0,
                lastMessageAt: new Date(c.updated_time),
                status: 'PROCESSING',
              },
            });

            if (c.messages?.data) {
              for (const m of c.messages.data) {
                const hasAttachments = m.attachments?.data && m.attachments.data.length > 0;
                if (!m.message && !hasAttachments) continue;
                const isPage = m.from?.id === page.metaPageId;
                const senderId = m.from?.id || customerPsid;
                const msgText = m.message || (hasAttachments ? '[Hình ảnh]' : '');
                const attachmentsJson = hasAttachments ? JSON.stringify(m.attachments.data) : null;

                const existingMsg = await prisma.message.findUnique({
                  where: { metaMessageId: m.id },
                });

                const savedMsg = await prisma.message.upsert({
                  where: { metaMessageId: m.id },
                  update: {
                    text: msgText,
                    attachments: attachmentsJson,
                  },
                  create: {
                    pageId: page.id,
                    conversationId: conv.id,
                    metaMessageId: m.id,
                    senderType: isPage ? 'PAGE' : 'CUSTOMER',
                    senderId: senderId,
                    senderName: m.from?.name || (isPage ? page.name : customerName),
                    text: msgText,
                    attachments: attachmentsJson,
                    createdAt: new Date(m.created_time),
                  },
                });

                if (!existingMsg && !isPage) {
                  const msgPayload = {
                    conversationId: conv.id,
                    pageId: page.id,
                    message: savedMsg,
                    customer,
                  };
                  emitToPage(page.id, 'new_message', msgPayload);
                  emitToAccount(page.accountId, 'new_message', msgPayload);
                }
              }
            }

            totalSynced++;
          }
        } catch (pageErr: any) {
          logger.error(`Error syncing conversations for page ${page.name}:`, pageErr.message);
        }
      }

      emitToAccount(req.user.accountId, 'conversations_synced', { totalSynced });

      return res.json({
        success: true,
        count: totalSynced,
        message: `Đã đồng bộ thành công ${totalSynced} cuộc hội thoại mới nhất từ Meta!`,
      });
    } catch (error: any) {
      logger.error('Sync conversations error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi đồng bộ tin nhắn.' });
    }
  }
}
