import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'zen_crm_jwt_secret_token_secure_key_2026_987654321';
const JWT_EXPIRES_IN = '7d';

export class AuthController {
  /**
   * Register a new business account and admin user
   */
  static async register(req: Request, res: Response) {
    try {
      const { email, password, fullName, accountName, phone } = req.body;

      if (!email || !password || !fullName) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email, mật khẩu và họ tên.' });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Create business account and admin user in transaction
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            name: accountName?.trim() || `Doanh nghiệp của ${fullName}`,
          },
        });

        const user = await tx.user.create({
          data: {
            accountId: account.id,
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            fullName: fullName.trim(),
            phone: phone?.trim(),
            role: 'ADMIN',
          },
        });

        // Create default CRM tags
        const defaultTags = [
          { name: 'Khách mới', color: '#10B981' },
          { name: 'Khách tiềm năng', color: '#3B82F6' },
          { name: 'Đã mua', color: '#059669' },
          { name: 'VIP', color: '#F59E0B' },
          { name: 'Cần chăm sóc', color: '#8B5CF6' },
          { name: 'Khiếu nại', color: '#EF4444' },
        ];

        for (const tag of defaultTags) {
          await tx.tag.create({
            data: {
              accountId: account.id,
              name: tag.name,
              color: tag.color,
            },
          });
        }

        return { account, user };
      });

      const token = jwt.sign(
        {
          id: result.user.id,
          accountId: result.account.id,
          email: result.user.email,
          role: result.user.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
      });

      await logger.audit({
        accountId: result.account.id,
        userId: result.user.id,
        action: 'USER_REGISTER',
        targetType: 'User',
        targetId: result.user.id,
        details: `Đăng ký tài khoản mới: ${result.user.email}`,
      });

      return res.status(201).json({
        success: true,
        message: 'Đăng ký tài khoản thành công.',
        token,
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          phone: result.user.phone,
          role: result.user.role,
          accountId: result.account.id,
          accountName: result.account.name,
        },
      });
    } catch (error: any) {
      logger.error('Register error:', error.message);
      return res.status(500).json({ success: false, message: 'Đăng ký tài khoản thất bại.' });
    }
  }

  /**
   * Login user
   */
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu.' });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: { account: true },
      });

      if (!user) {
        return res.status(400).json({ success: false, message: 'Email hoặc mật khẩu không chính xác.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Email hoặc mật khẩu không chính xác.' });
      }

      const token = jwt.sign(
        {
          id: user.id,
          accountId: user.accountId,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
      });

      await logger.audit({
        accountId: user.accountId,
        userId: user.id,
        action: 'USER_LOGIN',
        targetType: 'User',
        targetId: user.id,
        details: `Đăng nhập thành công: ${user.email}`,
      });

      return res.json({
        success: true,
        message: 'Đăng nhập thành công.',
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          accountId: user.accountId,
          accountName: user.account.name,
        },
      });
    } catch (error: any) {
      logger.error('Login error:', error.message);
      return res.status(500).json({ success: false, message: 'Đăng nhập thất bại.' });
    }
  }

  /**
   * Get current authenticated user profile and account details
   */
  static async getMe(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          account: {
            include: {
              metaConnections: {
                where: { status: 'ACTIVE' },
                select: {
                  id: true,
                  metaUserId: true,
                  metaUserName: true,
                  metaUserEmail: true,
                  status: true,
                  createdAt: true,
                },
              },
              pages: {
                where: { isConnected: true },
                select: {
                  id: true,
                  metaPageId: true,
                  name: true,
                  avatar: true,
                  category: true,
                  followersCount: true,
                  isWebhookSubscribed: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          accountId: user.accountId,
          accountName: user.account.name,
          metaConnected: user.account.metaConnections.length > 0,
          metaUser: user.account.metaConnections[0] || null,
          connectedPages: user.account.pages,
        },
      });
    } catch (error: any) {
      logger.error('Get me error:', error.message);
      return res.status(500).json({ success: false, message: 'Không thể lấy thông tin người dùng.' });
    }
  }

  /**
   * Update personal profile
   */
  static async updateProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { fullName, phone, avatar } = req.body;
      const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          fullName: fullName?.trim() || undefined,
          phone: phone?.trim() || undefined,
          avatar: avatar || undefined,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          avatar: true,
          accountId: true,
        },
      });

      return res.json({ success: true, message: 'Cập nhật thông tin thành công.', user: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Cập nhật thông tin thất bại.' });
    }
  }

  /**
   * Change password
   */
  static async changePassword(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác.' });
      }

      const hashedNew = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedNew },
      });

      return res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Đổi mật khẩu thất bại.' });
    }
  }

  /**
   * Logout
   */
  static async logout(req: Request, res: Response) {
    res.clearCookie('token');
    return res.json({ success: true, message: 'Đăng xuất thành công.' });
  }

  /**
   * Forgot password request
   */
  static async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp địa chỉ email.' });
    }
    // Return standard security response without leaking email existence
    return res.json({
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến bạn.',
    });
  }
}
