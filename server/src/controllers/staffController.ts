import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

export class StaffController {
  /**
   * List all staff members for account
   */
  static async listStaff(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const staff = await prisma.user.findMany({
        where: { accountId: req.user.accountId },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          isActive: true,
          avatar: true,
          createdAt: true,
          pagePermissions: {
            include: {
              page: { select: { id: true, name: true, avatar: true } },
            },
          },
          _count: {
            select: {
              assignedConvs: true,
              assignedComms: true,
              assignedCusts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, staff });
    } catch (error: any) {
      logger.error('List staff error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách nhân viên.' });
    }
  }

  /**
   * Create a new employee
   */
  static async createStaff(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { email, password, fullName, phone, role = 'STAFF', assignedPageIds = [] } = req.body;

      if (!email || !password || !fullName) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ email, mật khẩu và họ tên.' });
      }

      if (!['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ.' });
      }

      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (existing) {
        return res.status(400).json({ success: false, message: 'Email đã tồn tại trên hệ thống.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newStaff = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            accountId: req.user!.accountId,
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            fullName: fullName.trim(),
            phone: phone?.trim(),
            role: role as any,
          },
        });

        // Assign page permissions if provided
        if (Array.isArray(assignedPageIds) && assignedPageIds.length > 0) {
          for (const pageId of assignedPageIds) {
            await tx.pagePermission.create({
              data: {
                userId: user.id,
                pageId,
                canChat: true,
                canComment: true,
                canViewPosts: true,
                canViewAds: role === 'ADMIN' || role === 'MANAGER',
              },
            });
          }
        }

        return user;
      });

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'CREATE_STAFF',
        targetType: 'User',
        targetId: newStaff.id,
        details: `Thêm nhân viên mới: ${newStaff.fullName} (${newStaff.email}), quyền ${newStaff.role}`,
      });

      return res.status(201).json({
        success: true,
        message: 'Thêm nhân viên thành công.',
        staff: {
          id: newStaff.id,
          email: newStaff.email,
          fullName: newStaff.fullName,
          role: newStaff.role,
        },
      });
    } catch (error: any) {
      logger.error('Create staff error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi thêm nhân viên: ' + error.message });
    }
  }

  /**
   * Update staff role or permissions
   */
  static async updateStaff(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { id } = req.params;
      const { fullName, phone, role, isActive, assignedPageIds } = req.body;

      const staff = await prisma.user.findFirst({
        where: { id, accountId: req.user.accountId },
      });

      if (!staff) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên.' });

      // Prevent locking own admin account
      if (staff.id === req.user.id && isActive === false) {
        return res.status(400).json({ success: false, message: 'Bạn không thể tự khóa tài khoản của chính mình.' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            fullName: fullName?.trim() || undefined,
            phone: phone?.trim() || undefined,
            role: role || undefined,
            isActive: isActive !== undefined ? isActive : undefined,
          },
        });

        if (Array.isArray(assignedPageIds)) {
          // Re-sync page permissions
          await tx.pagePermission.deleteMany({ where: { userId: id } });
          for (const pageId of assignedPageIds) {
            await tx.pagePermission.create({
              data: {
                userId: id,
                pageId,
                canChat: true,
                canComment: true,
                canViewPosts: true,
              },
            });
          }
        }
      });

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'UPDATE_STAFF',
        targetType: 'User',
        targetId: id,
        details: `Cập nhật nhân viên: ${staff.fullName}`,
      });

      return res.json({ success: true, message: 'Cập nhật nhân viên thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi cập nhật nhân viên: ' + error.message });
    }
  }

  /**
   * Get audit logs for accountability
   */
  static async getAuditLogs(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { limit = 50, page = 1 } = req.query;
      const take = Math.min(Number(limit) || 50, 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { accountId: req.user.accountId },
          include: {
            user: { select: { id: true, fullName: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.auditLog.count({ where: { accountId: req.user.accountId } }),
      ]);

      return res.json({ success: true, logs, total });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi tải lịch sử hoạt động.' });
    }
  }
}
