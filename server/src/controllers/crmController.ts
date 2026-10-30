import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { decryptToken } from '../utils/crypto';
import { MetaGraphService } from '../services/metaGraphService';
import fs from 'fs';
import path from 'path';

export class CrmController {
  /**
   * List customers with pagination, status & tag filters, search
   */
  static async listCustomers(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { status, tagId, pageId, assignedUserId, search, limit = 30, page = 1 } = req.query;
      const take = Math.min(Number(limit) || 30, 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const where: any = {
        accountId: req.user.accountId,
      };

      if (status && status !== 'all') {
        where.status = status.toString().toUpperCase();
      }

      if (pageId && pageId !== 'all') {
        where.primaryPageId = pageId.toString();
      }

      if (assignedUserId && assignedUserId !== 'all') {
        where.assignedUserId = assignedUserId === 'unassigned' ? null : assignedUserId.toString();
      }

      if (tagId && tagId !== 'all') {
        where.tags = {
          some: { tagId: tagId.toString() },
        };
      }

      if (search) {
        const q = search.toString();
        where.OR = [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ];
      }

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: {
            primaryPage: { select: { id: true, name: true, avatar: true } },
            assignedUser: { select: { id: true, fullName: true, avatar: true } },
            tags: { include: { tag: true } },
            _count: {
              select: {
                conversations: true,
                comments: true,
                notes: true,
              },
            },
          },
          orderBy: { lastInteractionAt: 'desc' },
          skip,
          take,
        }),
        prisma.customer.count({ where }),
      ]);

      return res.json({
        success: true,
        customers,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / take),
      });
    } catch (error: any) {
      logger.error('List customers error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách khách hàng.' });
    }
  }

  /**
   * Get customer profile with full history (messenger, comments, notes, tags)
   */
  static async getCustomerDetail(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const customer = await prisma.customer.findFirst({
        where: { id, accountId: req.user.accountId },
        include: {
          primaryPage: { select: { id: true, name: true, avatar: true, encryptedAccessToken: true } },
          assignedUser: { select: { id: true, fullName: true, email: true } },
          tags: { include: { tag: true } },
          notes: {
            include: { user: { select: { id: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'desc' },
          },
          conversations: {
            include: {
              page: { select: { id: true, name: true } },
              messages: {
                take: 10,
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { lastMessageAt: 'desc' },
          },
          comments: {
            take: 15,
            include: {
              page: { select: { id: true, name: true } },
              post: { select: { id: true, message: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!customer) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
      }

      // Lazy-fetch profile from Meta if avatar is missing
      if (!customer.avatar && customer.metaId && (customer.primaryPage as any)?.encryptedAccessToken) {
        try {
          const pageToken = decryptToken((customer.primaryPage as any).encryptedAccessToken);
          if (pageToken) {
            const profile = await MetaGraphService.getCustomerProfile(customer.metaId, pageToken);
            if (profile) {
              const updateData: any = {};
              if (profile.profile_pic) {
                updateData.avatar = profile.profile_pic;
                (customer as any).avatar = profile.profile_pic;
              }
              if (profile.name && customer.name.startsWith('Khách hàng #')) {
                updateData.name = profile.name;
                (customer as any).name = profile.name;
              }
              if (Object.keys(updateData).length > 0) {
                await prisma.customer.update({
                  where: { id: customer.id },
                  data: updateData,
                });
              }
            }
          }
        } catch (e: any) {
          // Ignore error
        }
      }

      // Remove sensitive encryptedAccessToken before responding
      if (customer.primaryPage) {
        delete (customer.primaryPage as any).encryptedAccessToken;
      }

      return res.json({ success: true, customer });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tải hồ sơ khách hàng.' });
    }
  }

  /**
   * Update customer basic info, status or assignment
   */
  static async updateCustomer(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const { name, phone, email, status, assignedUserId } = req.body;

      const customer = await prisma.customer.findFirst({
        where: { id, accountId: req.user.accountId },
      });

      if (!customer) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
      }

      const updated = await prisma.customer.update({
        where: { id },
        data: {
          name: name?.trim() || undefined,
          phone: phone?.trim() || undefined,
          email: email?.trim() || undefined,
          status: status || undefined,
          assignedUserId: assignedUserId !== undefined ? (assignedUserId || null) : undefined,
        },
        include: {
          assignedUser: { select: { id: true, fullName: true } },
          tags: { include: { tag: true } },
        },
      });

      if (name?.trim()) {
        await prisma.comment.updateMany({
          where: { customerId: id },
          data: { authorName: name.trim() },
        });
      }

      return res.json({ success: true, message: 'Cập nhật khách hàng thành công.', customer: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật khách hàng.' });
    }
  }

  /**
   * Add a note to customer
   */
  static async addNote(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { customerId } = req.params;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, message: 'Nội dung ghi chú không được để trống.' });
      }

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, accountId: req.user.accountId },
      });

      if (!customer) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
      }

      const note = await prisma.customerNote.create({
        data: {
          customerId: customer.id,
          userId: req.user.id,
          content: content.trim(),
        },
        include: {
          user: { select: { id: true, fullName: true, avatar: true } },
        },
      });

      return res.json({ success: true, message: 'Thêm ghi chú thành công.', note });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi thêm ghi chú.' });
    }
  }

  /**
   * Delete a note
   */
  static async deleteNote(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { noteId } = req.params;
      const note = await prisma.customerNote.findUnique({
        where: { id: noteId },
        include: { customer: true },
      });

      if (!note || note.customer.accountId !== req.user.accountId) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy ghi chú.' });
      }

      // Only author or Admin can delete note
      if (note.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa ghi chú này.' });
      }

      await prisma.customerNote.delete({ where: { id: noteId } });

      return res.json({ success: true, message: 'Đã xóa ghi chú thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi xóa ghi chú.' });
    }
  }

  /**
   * Attach tag to customer
   */
  static async attachTag(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { customerId, tagId } = req.body;

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, accountId: req.user.accountId },
      });

      if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });

      await prisma.customerTag.upsert({
        where: { customerId_tagId: { customerId, tagId } },
        update: {},
        create: { customerId, tagId },
      });

      return res.json({ success: true, message: 'Đã gán thẻ thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi gán thẻ: ' + error.message });
    }
  }

  /**
   * Remove tag from customer
   */
  static async detachTag(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { customerId, tagId } = req.params;

      await prisma.customerTag.deleteMany({
        where: { customerId, tagId },
      });

      return res.json({ success: true, message: 'Đã bỏ gán thẻ thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi bỏ thẻ: ' + error.message });
    }
  }

  /**
   * Refresh Customer profile & avatar directly from Meta
   */
  static async refreshCustomerMetaProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const customer = await prisma.customer.findFirst({
        where: { id, accountId: req.user.accountId },
        include: { primaryPage: true },
      });

      if (!customer) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
      }

      if (!customer.metaId) {
        return res.status(400).json({ success: false, message: 'Khách hàng này không có ID Meta.' });
      }

      // Find an active page in this account with token
      let page = customer.primaryPage;
      if (!page || !page.encryptedAccessToken) {
        page = await prisma.page.findFirst({
          where: { accountId: req.user.accountId, isConnected: true },
        });
      }

      if (!page || !page.encryptedAccessToken) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy Trang kết nối để truy vấn thông tin.' });
      }

      const pageToken = decryptToken(page.encryptedAccessToken);
      if (!pageToken) {
        return res.status(500).json({ success: false, message: 'Không thể giải mã mã truy cập Trang.' });
      }

      const profile = await MetaGraphService.getCustomerProfile(customer.metaId, pageToken);
      if (!profile) {
        return res.status(400).json({
          success: false,
          message: 'Không thể lấy thông tin từ Meta. Meta có thể hạn chế quyền riêng tư hoặc tài khoản chưa cấp quyền.',
        });
      }

      const updateData: any = {};
      if (profile.profile_pic) updateData.avatar = profile.profile_pic;
      if (profile.name) updateData.name = profile.name;

      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: updateData,
        include: {
          primaryPage: { select: { id: true, name: true, avatar: true } },
          tags: { include: { tag: true } },
        },
      });

      return res.json({
        success: true,
        message: 'Đã cập nhật thông tin và ảnh đại diện từ Meta thành công!',
        customer: updated,
      });
    } catch (error: any) {
      logger.error('Refresh customer profile error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi làm mới thông tin khách hàng từ Meta.' });
    }
  }

  /**
   * Upload custom avatar for a customer
   */
  static async uploadAvatar(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ success: false, message: 'Chưa chọn hình ảnh đại diện.' });
      }

      const customer = await prisma.customer.findFirst({
        where: { id, accountId: req.user.accountId },
      });

      if (!customer) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
      }

      const uploadsDir = path.join(__dirname, '../../uploads/avatars');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `avatar_${customer.id}_${Date.now()}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, file.buffer);

      const avatarUrl = `/uploads/avatars/${filename}`;

      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: { avatar: avatarUrl },
        include: {
          primaryPage: { select: { id: true, name: true, avatar: true } },
          tags: { include: { tag: true } },
        },
      });

      return res.json({
        success: true,
        message: 'Cập nhật ảnh đại diện khách hàng thành công!',
        customer: updated,
      });
    } catch (error: any) {
      logger.error('Upload customer avatar error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải lên ảnh đại diện.' });
    }
  }
}
