import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

export class TagsController {
  /**
   * List all tags for account
   */
  static async listTags(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const tags = await prisma.tag.findMany({
        where: { accountId: req.user.accountId },
        include: {
          _count: { select: { customers: true } },
        },
        orderBy: { name: 'asc' },
      });

      return res.json({ success: true, tags });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách thẻ.' });
    }
  }

  /**
   * Create a new tag
   */
  static async createTag(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { name, color = '#10B981' } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Tên thẻ không được để trống.' });
      }

      const existing = await prisma.tag.findFirst({
        where: { accountId: req.user.accountId, name: name.trim() },
      });

      if (existing) {
        return res.status(400).json({ success: false, message: 'Thẻ với tên này đã tồn tại.' });
      }

      const tag = await prisma.tag.create({
        data: {
          accountId: req.user.accountId,
          name: name.trim(),
          color: color.trim(),
        },
      });

      return res.status(201).json({ success: true, message: 'Tạo thẻ thành công.', tag });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tạo thẻ: ' + error.message });
    }
  }

  /**
   * Update a tag
   */
  static async updateTag(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const { name, color } = req.body;

      const tag = await prisma.tag.findFirst({
        where: { id, accountId: req.user.accountId },
      });

      if (!tag) return res.status(404).json({ success: false, message: 'Không tìm thấy thẻ.' });

      const updated = await prisma.tag.update({
        where: { id },
        data: {
          name: name?.trim() || undefined,
          color: color?.trim() || undefined,
        },
      });

      return res.json({ success: true, message: 'Cập nhật thẻ thành công.', tag: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật thẻ.' });
    }
  }

  /**
   * Delete a tag
   */
  static async deleteTag(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;

      const tag = await prisma.tag.findFirst({
        where: { id, accountId: req.user.accountId },
      });

      if (!tag) return res.status(404).json({ success: false, message: 'Không tìm thấy thẻ.' });

      await prisma.tag.delete({ where: { id } });

      return res.json({ success: true, message: 'Đã xóa thẻ thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi xóa thẻ.' });
    }
  }
}
