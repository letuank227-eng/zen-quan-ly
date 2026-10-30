import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    accountId: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'MANAGER' | 'STAFF';
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' });
    }

    const secret = process.env.JWT_SECRET || 'zen_crm_jwt_secret_token_secure_key_2026_987654321';
    const decoded = jwt.verify(token, secret) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        accountId: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa.' });
    }

    req.user = {
      id: user.id,
      accountId: user.accountId,
      email: user.email,
      fullName: user.fullName,
      role: user.role as 'ADMIN' | 'MANAGER' | 'STAFF',
    };

    next();
  } catch (error: any) {
    return res.status(401).json({ success: false, message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' });
  }
}
