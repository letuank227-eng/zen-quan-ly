import prisma from '../prisma/client';

export const logger = {
  info: (message: string, context?: any) => {
    const sanitized = sanitizeContext(context);
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`, sanitized ? JSON.stringify(sanitized) : '');
  },
  warn: (message: string, context?: any) => {
    const sanitized = sanitizeContext(context);
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`, sanitized ? JSON.stringify(sanitized) : '');
  },
  error: (message: string, context?: any) => {
    const sanitized = sanitizeContext(context);
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, sanitized ? JSON.stringify(sanitized) : '');
  },
  audit: async (params: {
    accountId: string;
    userId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    details?: string;
    ipAddress?: string;
  }) => {
    try {
      await prisma.auditLog.create({
        data: {
          accountId: params.accountId,
          userId: params.userId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          details: params.details,
          ipAddress: params.ipAddress,
        },
      });
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  },
};

/**
 * Remove sensitive fields like passwords, tokens, secrets before logging
 */
function sanitizeContext(ctx: any): any {
  if (!ctx) return undefined;
  if (typeof ctx !== 'object') return ctx;

  const clone = Array.isArray(ctx) ? [...ctx] : { ...ctx };
  const sensitiveKeys = ['password', 'token', 'access_token', 'accessToken', 'secret', 'client_secret', 'appSecret', 'encryptedAccessToken'];

  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      clone[key] = '[REDACTED]';
    } else if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = sanitizeContext(clone[key]);
    }
  }

  return clone;
}
