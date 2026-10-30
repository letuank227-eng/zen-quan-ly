import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../prisma/client';

export function requireRole(allowedRoles: ('ADMIN' | 'MANAGER' | 'STAFF')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Chưa xác thực người dùng.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện hành động này. Yêu cầu quyền: ' + allowedRoles.join(', '),
      });
    }

    next();
  };
}

export const requireAdmin = requireRole(['ADMIN']);
export const requireManagerOrAdmin = requireRole(['ADMIN', 'MANAGER']);

/**
 * Checks if user has permission to access a specific page
 */
export async function checkPageAccess(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const pageId = req.params.pageId || req.query.pageId as string || req.body.pageId;
    if (!pageId || !req.user) {
      return next();
    }

    // Admins have access to all pages in their account
    if (req.user.role === 'ADMIN') {
      const page = await prisma.page.findFirst({
        where: { id: pageId, accountId: req.user.accountId },
      });
      if (!page) {
        return res.status(404).json({ success: false, message: 'Page không tồn tại trong tài khoản.' });
      }
      return next();
    }

    // Managers and Staff check PagePermission
    const perm = await prisma.pagePermission.findUnique({
      where: {
        userId_pageId: {
          userId: req.user.id,
          pageId: pageId,
        },
      },
    });

    if (!perm) {
      return res.status(403).json({ success: false, message: 'Bạn chưa được phân quyền truy cập Page này.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi kiểm tra quyền truy cập Page.' });
  }
}
