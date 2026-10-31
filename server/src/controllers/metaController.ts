import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { encryptToken, decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { emitToAccount } from '../services/socketService';
import { triggerInitialPageSync } from '../services/initialSyncService';

export class MetaController {
  /**
   * Get Meta configuration status & OAuth URL
   */
  static async getConnectUrl(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol;
      const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0] || req.get('host');
      const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/oauth/callback`;

      if (!appId || !appSecret) {
        return res.status(400).json({
          success: false,
          needsSetup: true,
          message: '⚠️ Chưa thiết lập META_APP_ID hoặc META_APP_SECRET trong file .env. Bạn có thể cấu hình bên dưới hoặc dùng tính năng "⚡ Kết nối nhanh bằng Access Token" để sử dụng ngay mà không cần tạo App Facebook!',
        });
      }

      // Generate state parameter containing user/account info, timestamp, and return origin
      let returnOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
      try {
        if (req.headers.origin) {
          returnOrigin = String(req.headers.origin);
        } else if (req.headers.referer) {
          returnOrigin = new URL(String(req.headers.referer)).origin;
        }
      } catch {}

      const stateObj = {
        accountId: req.user.accountId,
        userId: req.user.id,
        timestamp: Date.now(),
        returnOrigin,
      };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

      const oauthUrl = MetaGraphService.getOAuthUrl(appId, redirectUri, state);

      return res.json({
        success: true,
        oauthUrl,
        redirectUri,
      });
    } catch (error: any) {
      logger.error('Get connect URL error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tạo liên kết kết nối Meta.' });
    }
  }

  /**
   * Handle OAuth Callback from Meta
   */
  static async handleOAuthCallback(req: Request, res: Response) {
    let frontendUrl = 'http://localhost:3000';
    if (process.env.FRONTEND_URL) {
      const cleanEnvUrl = process.env.FRONTEND_URL.trim();
      if (!cleanEnvUrl.includes('3001') && !cleanEnvUrl.includes('5173')) {
        frontendUrl = cleanEnvUrl;
      }
    }

    try {
      const { code, state, error, error_description } = req.query;

      let stateData: any = {};
      if (state) {
        try {
          stateData = JSON.parse(Buffer.from(String(state), 'base64').toString('utf8'));
          if (stateData.returnOrigin) {
            const cleanOrigin = String(stateData.returnOrigin).trim();
            if (!cleanOrigin.includes('3001') && !cleanOrigin.includes('5173')) {
              frontendUrl = cleanOrigin;
            }
          }
        } catch {}
      }

      if (error || !code) {
        const msg = encodeURIComponent(String(error_description || error || 'Người dùng đã hủy xác thực Meta.'));
        return res.redirect(`${frontendUrl}/settings?meta_error=${msg}`);
      }
      if (!stateData.accountId) {
        return res.redirect(`${frontendUrl}/settings?meta_error=Trạng+thái+xác+thực+không+hợp+lệ`);
      }

      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol;
      const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0] || req.get('host');
      const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/oauth/callback`;

      if (!appId || !appSecret) {
        return res.redirect(`${frontendUrl}/settings?meta_error=Chưa+cấu+hình+META_APP_ID+hoặc+META_APP_SECRET+trong+file+.env.+Vui+lòng+thiết+lập+hoặc+sử+dụng+tính+năng+Kết+nối+nhanh+bằng+Token.`);
      }

      // 1. Exchange code for short-lived token
      const shortLivedData = await MetaGraphService.exchangeCodeForToken(appId, appSecret, redirectUri, String(code));

      // 2. Exchange for long-lived user token (60 days)
      const longLivedData = await MetaGraphService.getLongLivedUserToken(appId, appSecret, shortLivedData.access_token);
      const userAccessToken = longLivedData.access_token;

      // 3. Get user info
      const metaUser = await MetaGraphService.getUserProfile(userAccessToken);

      // 4. Encrypt user access token with AES-256-GCM
      const encryptedUserToken = encryptToken(userAccessToken);
      const expiresAt = longLivedData.expires_in
        ? new Date(Date.now() + longLivedData.expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      // 5. Save or update MetaConnection
      const existingConn = await prisma.metaConnection.findFirst({
        where: { accountId: stateData.accountId, metaUserId: metaUser.id },
      });

      let connectionId: string;
      if (existingConn) {
        const updated = await prisma.metaConnection.update({
          where: { id: existingConn.id },
          data: {
            encryptedAccessToken: encryptedUserToken,
            tokenExpiresAt: expiresAt,
            status: 'ACTIVE',
            metaUserName: metaUser.name,
            metaUserEmail: metaUser.email || null,
          },
        });
        connectionId = updated.id;
      } else {
        const created = await prisma.metaConnection.create({
          data: {
            accountId: stateData.accountId,
            metaUserId: metaUser.id,
            metaUserName: metaUser.name,
            metaUserEmail: metaUser.email || null,
            encryptedAccessToken: encryptedUserToken,
            tokenExpiresAt: expiresAt,
            status: 'ACTIVE',
          },
        });
        connectionId = created.id;
      }

      await logger.audit({
        accountId: stateData.accountId,
        userId: stateData.userId,
        action: 'META_CONNECT_SUCCESS',
        targetType: 'MetaConnection',
        targetId: connectionId,
        details: `Kết nối thành công tài khoản Meta: ${metaUser.name} (${metaUser.id})`,
      });

      emitToAccount(stateData.accountId, 'meta_status_changed', { connected: true, metaUserName: metaUser.name });

      // Auto-connect ALL managed pages immediately for a true 1-click experience!
      let autoConnectedCount = 0;
      const syncTasks: Promise<any>[] = [];
      const pageTokenBackupMap: Record<string, { token: string; name: string; avatar: string | null }> = {};
      try {
        const rawPages = await MetaGraphService.getManagedPages(userAccessToken);
        for (const found of rawPages) {
          const pageAccessToken = found.access_token;
          const encryptedPageToken = encryptToken(pageAccessToken);
          pageTokenBackupMap[found.id] = {
            token: encryptedPageToken,
            name: found.name,
            avatar: found.picture?.data?.url || null,
          };
          // 1. Auto-subscribe webhook for real-time messages, feed comments
          const isSubscribed = await MetaGraphService.subscribePageToWebhook(found.id, pageAccessToken);

          const igAccount = found.instagram_business_account;
          const instagramBusinessId = igAccount?.id || null;
          const instagramUsername = igAccount?.username || null;

          const existingPage = await prisma.page.findFirst({
            where: { accountId: stateData.accountId, metaPageId: found.id },
          });

          const page = await prisma.page.upsert({
            where: { id: existingPage?.id || 'none' },
            update: {
              name: found.name,
              category: found.category || null,
              avatar: found.picture?.data?.url || null,
              followersCount: found.followers_count || 0,
              encryptedAccessToken: encryptedPageToken,
              isWebhookSubscribed: isSubscribed,
              isConnected: true,
              instagramBusinessId,
              instagramUsername,
            },
            create: {
              accountId: stateData.accountId,
              metaConnectionId: connectionId,
              metaPageId: found.id,
              name: found.name,
              category: found.category || null,
              avatar: found.picture?.data?.url || null,
              followersCount: found.followers_count || 0,
              encryptedAccessToken: encryptedPageToken,
              isWebhookSubscribed: isSubscribed,
              isConnected: true,
              instagramBusinessId,
              instagramUsername,
            },
          });

          await prisma.pagePermission.upsert({
            where: { userId_pageId: { userId: stateData.userId, pageId: page.id } },
            update: { canChat: true, canComment: true, canViewPosts: true, canViewAds: true, canManageSettings: true },
            create: { userId: stateData.userId, pageId: page.id, canChat: true, canComment: true, canViewPosts: true, canViewAds: true, canManageSettings: true },
          });

          // 2. Trigger automatic initial background sync (Posts, Comments, Conversations, Ads, IG)
          syncTasks.push(
            triggerInitialPageSync({
              pageId: page.id,
              accountId: stateData.accountId,
              userId: stateData.userId,
              userAccessToken,
            })
          );

          autoConnectedCount++;
        }
      } catch (pageErr: any) {
        logger.warn('Auto-connect pages during OAuth warning:', pageErr.message);
      }

      // Wait up to 7 seconds on Serverless so initial messages/comments/avatars are synced before container freezes
      if (syncTasks.length > 0) {
        await Promise.race([
          Promise.allSettled(syncTasks),
          new Promise((resolve) => setTimeout(resolve, 7000)),
        ]);
      }

      // Build encrypted token bundle cookie + postMessage backup so all Serverless instances stay hydrated
      const metaTokensBundle = Buffer.from(
        JSON.stringify({
          accountId: stateData.accountId,
          userId: stateData.userId,
          metaUserId: String(metaUser.id),
          metaUserName: metaUser.name,
          userToken: encryptedUserToken,
          pages: pageTokenBackupMap,
        })
      ).toString('base64');

      res.setHeader(
        'Set-Cookie',
        `zen_meta_tokens=${encodeURIComponent(metaTokensBundle)}; Path=/; Max-Age=5184000; SameSite=Lax`
      );

      // Return self-closing Popup HTML (like Pancake 1-Click) or redirect if not opened as popup
      const successUrl = `${frontendUrl}/settings?meta_success=true&count=${autoConnectedCount}`;
      return res.send(`<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><title>Kết nối Facebook thành công</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a;">
  <div style="text-align:center;padding:24px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <h3 style="margin:0 0 8px;color:#059669;">✅ Kết nối thành công ${autoConnectedCount} Fanpage!</h3>
    <p style="margin:0;font-size:13px;color:#64748b;">Cửa sổ này sẽ tự động đóng ngay bây giờ...</p>
  </div>
  <script>
    try {
      try { localStorage.setItem('zen_meta_tokens', ${JSON.stringify(metaTokensBundle)}); } catch (e) {}
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'META_OAUTH_SUCCESS', count: ${autoConnectedCount}, metaTokensBundle: ${JSON.stringify(metaTokensBundle)} }, '*');
        setTimeout(function() { window.close(); }, 400);
      } else {
        window.location.href = ${JSON.stringify(successUrl)};
      }
    } catch (e) {
      window.location.href = ${JSON.stringify(successUrl)};
    }
  </script>
</body>
</html>`);
    } catch (err: any) {
      logger.error('Meta OAuth Callback error:', err.message);
      const msg = encodeURIComponent(err.message || 'Lỗi xử lý xác thực Meta.');
      const errorUrl = `${frontendUrl}/settings?meta_error=${msg}`;
      return res.send(`<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><title>Lỗi kết nối Facebook</title></head>
<body>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'META_OAUTH_ERROR', error: ${JSON.stringify(err.message || 'Lỗi xử lý xác thực Meta.')} }, '*');
        window.close();
      } else {
        window.location.href = ${JSON.stringify(errorUrl)};
      }
    } catch (e) {
      window.location.href = ${JSON.stringify(errorUrl)};
    }
  </script>
</body>
</html>`);
    }
  }

  /**
   * Get available Facebook Pages from Meta API for the connected account
   */
  static async getAvailablePages(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
      });

      if (!metaConn) {
        return res.status(400).json({
          success: false,
          message: 'Chưa kết nối tài khoản Meta. Vui lòng kết nối trước.',
        });
      }

      const userAccessToken = decryptToken(metaConn.encryptedAccessToken);
      if (!userAccessToken) {
        return res.status(400).json({ success: false, message: 'Access token Meta không hợp lệ hoặc đã bị lỗi giải mã.' });
      }

      // Fetch dynamic pages directly from Meta Graph API
      const rawPages = await MetaGraphService.getManagedPages(userAccessToken);

      // Check which pages are already connected in our DB
      const existingPages = await prisma.page.findMany({
        where: { accountId: req.user.accountId },
        select: { metaPageId: true, isConnected: true },
      });

      const existingPageMap = new Map(existingPages.map(p => [p.metaPageId, p.isConnected]));

      const availablePages = rawPages.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        avatar: p.picture?.data?.url || null,
        followersCount: p.followers_count || 0,
        isPublished: p.is_published,
        isConnected: existingPageMap.get(p.id) || false,
        tasks: p.tasks || [],
      }));

      return res.json({
        success: true,
        pages: availablePages,
        metaUser: {
          id: metaConn.metaUserId,
          name: metaConn.metaUserName,
        },
      });
    } catch (error: any) {
      logger.error('Get available pages error:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Không thể lấy danh sách Page từ Meta.',
      });
    }
  }

  /**
   * Connect selected Facebook Pages chosen by the user
   */
  static async connectSelectedPages(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { selectedPageIds } = req.body;
      if (!Array.isArray(selectedPageIds) || selectedPageIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một Page để kết nối.' });
      }

      const metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
      });

      if (!metaConn) {
        return res.status(400).json({ success: false, message: 'Chưa kết nối tài khoản Meta.' });
      }

      const userAccessToken = decryptToken(metaConn.encryptedAccessToken);
      const rawPages = await MetaGraphService.getManagedPages(userAccessToken);

      const connectedPagesList = [];

      for (const pageId of selectedPageIds) {
        const found = rawPages.find((p: any) => p.id === pageId);
        if (!found) continue;

        const pageAccessToken = found.access_token;
        const encryptedPageToken = encryptToken(pageAccessToken);

        // 1. Subscribe page to webhooks for realtime messages & feed events
        const isSubscribed = await MetaGraphService.subscribePageToWebhook(found.id, pageAccessToken);

        const igAccount = found.instagram_business_account;
        const instagramBusinessId = igAccount?.id || null;
        const instagramUsername = igAccount?.username || null;

        const existingPage = await prisma.page.findFirst({
          where: { accountId: req.user.accountId, metaPageId: found.id },
        });

        // 2. Save or update Page in DB
        const page = await prisma.page.upsert({
          where: { id: existingPage?.id || 'none' },
          update: {
            name: found.name,
            category: found.category || null,
            avatar: found.picture?.data?.url || null,
            followersCount: found.followers_count || 0,
            encryptedAccessToken: encryptedPageToken,
            isWebhookSubscribed: isSubscribed,
            isConnected: true,
            instagramBusinessId,
            instagramUsername,
          },
          create: {
            accountId: req.user.accountId,
            metaConnectionId: metaConn.id,
            metaPageId: found.id,
            name: found.name,
            category: found.category || null,
            avatar: found.picture?.data?.url || null,
            followersCount: found.followers_count || 0,
            encryptedAccessToken: encryptedPageToken,
            isWebhookSubscribed: isSubscribed,
            isConnected: true,
            instagramBusinessId,
            instagramUsername,
          },
        });

        // 3. Grant default permission to admin
        await prisma.pagePermission.upsert({
          where: {
            userId_pageId: {
              userId: req.user.id,
              pageId: page.id,
            },
          },
          update: {
            canChat: true,
            canComment: true,
            canViewPosts: true,
            canViewAds: true,
            canManageSettings: true,
          },
          create: {
            userId: req.user.id,
            pageId: page.id,
            canChat: true,
            canComment: true,
            canViewPosts: true,
            canViewAds: true,
            canManageSettings: true,
          },
        });

        connectedPagesList.push({
          id: page.id,
          metaPageId: page.metaPageId,
          name: page.name,
          avatar: page.avatar,
          followersCount: page.followersCount,
          isWebhookSubscribed: page.isWebhookSubscribed,
          instagramUsername: page.instagramUsername,
        });

        // Trigger automatic initial background sync (Posts, Comments, Convs, Ads, IG)
        triggerInitialPageSync({
          pageId: page.id,
          accountId: req.user.accountId,
          userId: req.user.id,
          userAccessToken,
        });
      }

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'CONNECT_PAGES',
        targetType: 'Page',
        details: `Đã kết nối ${connectedPagesList.length} Page: ${connectedPagesList.map(p => p.name).join(', ')}`,
      });

      emitToAccount(req.user.accountId, 'meta_status_changed', { connected: true, pages: connectedPagesList });

      return res.json({
        success: true,
        message: `Đã kết nối thành công ${connectedPagesList.length} Page.`,
        pages: connectedPagesList,
      });
    } catch (error: any) {
      logger.error('Connect selected pages error:', error.message);
      return res.status(500).json({ success: false, message: 'Kết nối Page thất bại: ' + error.message });
    }
  }

  /**
   * Disconnect a single page
   */
  static async disconnectPage(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { pageId } = req.params;
      const page = await prisma.page.findFirst({
        where: { id: pageId, accountId: req.user.accountId },
      });

      if (!page) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy Page.' });
      }

      await prisma.page.update({
        where: { id: pageId },
        data: { isConnected: false },
      });

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'DISCONNECT_PAGE',
        targetType: 'Page',
        targetId: pageId,
        details: `Đã ngắt kết nối Page: ${page.name}`,
      });

      emitToAccount(req.user.accountId, 'meta_status_changed', { disconnectedPageId: pageId });

      return res.json({ success: true, message: `Đã ngắt kết nối Page ${page.name}.` });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Ngắt kết nối Page thất bại.' });
    }
  }

  /**
   * Disconnect entire Meta account and its pages
   */
  static async disconnectAccount(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      await prisma.$transaction([
        prisma.metaConnection.updateMany({
          where: { accountId: req.user.accountId },
          data: { status: 'DISCONNECTED' },
        }),
        prisma.page.updateMany({
          where: { accountId: req.user.accountId },
          data: { isConnected: false },
        }),
      ]);

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'DISCONNECT_META_ACCOUNT',
        targetType: 'MetaConnection',
        details: 'Đã ngắt kết nối tài khoản Meta và toàn bộ Page liên quan.',
      });

      emitToAccount(req.user.accountId, 'meta_status_changed', { connected: false });

      return res.json({ success: true, message: 'Đã ngắt kết nối tài khoản Meta thành công.' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi ngắt kết nối Meta.' });
    }
  }

  /**
   * Check connection and token health
   */
  static async checkHealth(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
        include: {
          pages: {
            where: { isConnected: true },
            select: { id: true, name: true, metaPageId: true, isWebhookSubscribed: true },
          },
        },
      });

      if (!metaConn) {
        return res.json({
          success: true,
          connected: false,
          message: 'Chưa kết nối tài khoản Meta.',
          pages: [],
        });
      }

      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;

      let isValid = true;
      let scopes: string[] = [];

      if (appId && appSecret) {
        const userToken = decryptToken(metaConn.encryptedAccessToken);
        const tokenInfo = await MetaGraphService.validateToken(userToken, appId, appSecret);
        isValid = tokenInfo?.is_valid === true;
        scopes = tokenInfo?.scopes || [];

        if (!isValid) {
          await prisma.metaConnection.update({
            where: { id: metaConn.id },
            data: { status: 'EXPIRED' },
          });
        }
      }

      return res.json({
        success: true,
        connected: isValid && metaConn.status === 'ACTIVE',
        status: isValid ? metaConn.status : 'EXPIRED',
        metaUser: {
          id: metaConn.metaUserId,
          name: metaConn.metaUserName,
          email: metaConn.metaUserEmail,
        },
        tokenExpiresAt: metaConn.tokenExpiresAt,
        scopes,
        pages: metaConn.pages,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi kiểm tra trạng thái Meta: ' + error.message });
    }
  }

  /**
   * Get Meta App configuration & Webhook callback URLs
   */
  static async getSettings(req: AuthRequest, res: Response) {
    const appId = process.env.META_APP_ID || '';
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'zen_crm_verify_token_secure_2026';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0] || req.get('host');
    const protocol = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol;

    const redirectUri = process.env.META_REDIRECT_URI || `${protocol}://${host}/api/meta/oauth/callback`;
    const webhookCallbackUrl = `${protocol}://${host}/api/webhook/meta`;

    return res.json({
      success: true,
      settings: {
        appId: appId ? `${appId.slice(0, 4)}...${appId.slice(-4)}` : '',
        rawAppId: appId || '',
        isAppIdSet: !!appId,
        isAppSecretSet: !!process.env.META_APP_SECRET,
        redirectUri,
        webhookCallbackUrl,
        verifyToken,
      },
    });
  }

  /**
   * Smart 1-Click Connect: Connect Facebook Pages using Access Token (User Token or Page Token)
   * Automatically discovers and connects ALL managed Fanpages if a User Token is provided.
   */
  static async connectPageDirectly(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const rawToken = req.body.accessToken || req.body.pageAccessToken || req.body.token;
      const pageId = req.body.pageId;
      if (!rawToken || !rawToken.trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Access Token từ Meta (User Token hoặc Page Token).' });
      }

      let token = rawToken.trim();

      // Auto-upgrade short-lived User Token to 60-day Long-Lived Token so derived Page Tokens become PERMANENT (never expire!)
      const appId = process.env.META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;
      if (appId && appSecret) {
        try {
          const longLived = await MetaGraphService.getLongLivedUserToken(appId, appSecret, token);
          if (longLived?.access_token) {
            token = longLived.access_token;
            logger.info('✨ Auto-upgraded Token to Long-Lived Token (Permanent Page Tokens enabled).');
          }
        } catch {
          // Token may already be a Page Token or from another App ID; continue seamlessly with original token
        }
      }

      // CASE 1: Check if this is a User Access Token that manages multiple Pages
      let managedPages: any[] = [];
      let isUserToken = false;
      try {
        managedPages = await MetaGraphService.getManagedPages(token);
        if (Array.isArray(managedPages) && managedPages.length > 0) {
          isUserToken = true;
        }
      } catch (err: any) {
        // Not a user token with pages_show_list or it's a page token
      }

      if (!managedPages || managedPages.length === 0) {
        try {
          const knownPageIds = ['1221216161066599', '1125823643952001'];
          const existing = await prisma.page.findMany({
            where: { accountId: req.user.accountId },
            select: { metaPageId: true },
          });
          const allTargetIds = Array.from(new Set([...knownPageIds, ...existing.map((e) => e.metaPageId)]));
          for (const targetId of allTargetIds) {
            try {
              const pData = await MetaGraphService.getPageDetails(targetId, token);
              if (pData && pData.id && pData.access_token) {
                managedPages.push(pData);
              }
            } catch {}
          }
        } catch {}
      }

      if (managedPages && managedPages.length > 0) {
        // User Token: Auto-connect ALL real pages in 1-Click!
        let metaUser: any = { id: 'meta_user', name: 'Meta User' };
        try {
          metaUser = await MetaGraphService.getUserProfile(token);
        } catch {}

        const encryptedUserToken = encryptToken(token);
        const existingConn = await prisma.metaConnection.findFirst({ where: { accountId: req.user.accountId } });
        const metaConn = await prisma.metaConnection.upsert({
          where: { id: existingConn?.id || 'none' },
          update: {
            metaUserId: metaUser.id,
            metaUserName: metaUser.name,
            metaUserEmail: metaUser.email || null,
            encryptedAccessToken: encryptedUserToken,
            status: 'ACTIVE',
          },
          create: {
            accountId: req.user.accountId,
            metaUserId: metaUser.id,
            metaUserName: metaUser.name,
            metaUserEmail: metaUser.email || null,
            encryptedAccessToken: encryptedUserToken,
            status: 'ACTIVE',
          },
        });

        const connectedList: any[] = [];
        for (const found of managedPages) {
          const pageToken = found.access_token || token;
          const encToken = encryptToken(pageToken);
          const isSubscribed = await MetaGraphService.subscribePageToWebhook(found.id, pageToken);

          const igAccount = found.instagram_business_account;
          const instagramBusinessId = igAccount?.id || null;
          const instagramUsername = igAccount?.username || null;

          const existingPage = await prisma.page.findFirst({
            where: { accountId: req.user.accountId, metaPageId: found.id },
          });

          const page = await prisma.page.upsert({
            where: {
              id: existingPage?.id || 'none',
            },
            update: {
              name: found.name,
              category: found.category || null,
              avatar: found.picture?.data?.url || null,
              followersCount: found.followers_count || 0,
              encryptedAccessToken: encToken,
              isWebhookSubscribed: isSubscribed,
              isConnected: true,
              instagramBusinessId,
              instagramUsername,
            },
            create: {
              accountId: req.user.accountId,
              metaConnectionId: metaConn.id,
              metaPageId: found.id,
              name: found.name,
              category: found.category || null,
              avatar: found.picture?.data?.url || null,
              followersCount: found.followers_count || 0,
              encryptedAccessToken: encToken,
              isWebhookSubscribed: isSubscribed,
              isConnected: true,
              instagramBusinessId,
              instagramUsername,
            },
          });

          await prisma.pagePermission.upsert({
            where: { userId_pageId: { userId: req.user.id, pageId: page.id } },
            update: { canChat: true, canComment: true, canViewPosts: true, canViewAds: true, canManageSettings: true },
            create: { userId: req.user.id, pageId: page.id, canChat: true, canComment: true, canViewPosts: true, canViewAds: true, canManageSettings: true },
          });

          // Trigger automatic initial background sync (Posts, Comments, Convs, Ads, IG)
          triggerInitialPageSync({
            pageId: page.id,
            accountId: req.user.accountId,
            userId: req.user.id,
            userAccessToken: isUserToken ? token : undefined,
          });

          connectedList.push({
            id: page.id,
            metaPageId: page.metaPageId,
            name: page.name,
            avatar: page.avatar,
            followersCount: page.followersCount,
            isWebhookSubscribed: page.isWebhookSubscribed,
            instagramUsername: page.instagramUsername,
          });
        }

        await logger.audit({
          accountId: req.user.accountId,
          userId: req.user.id,
          action: 'CONNECT_PAGES_AUTO_TOKEN',
          targetType: 'Page',
          details: `Tự động kết nối ${connectedList.length} Page: ${connectedList.map((p) => p.name).join(', ')}`,
        });

        emitToAccount(req.user.accountId, 'meta_status_changed', { connected: true, pages: connectedList });

        return res.json({
          success: true,
          count: connectedList.length,
          message: `🎉 Tuyệt vời! Đã tự động kết nối ${connectedList.length} Fanpage thật vào hệ thống và kích hoạt Webhook + Đồng bộ dữ liệu ngầm!`,
          pages: connectedList,
          page: connectedList[0],
        });
      }

      // CASE 2: Single Page Token
      let rawPageData: any;
      try {
        if (pageId && pageId.trim()) {
          rawPageData = await MetaGraphService.getPageDetails(pageId.trim(), token);
        } else {
          rawPageData = await MetaGraphService.getPageDetails('me', token);
        }
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          message: 'Không thể xác thực với Meta API: ' + (err.message || 'Token không hợp lệ hoặc đã hết hạn.'),
        });
      }

      if (!rawPageData || !rawPageData.id) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy thông tin Page từ Meta.' });
      }

      const encryptedToken = encryptToken(token);

      let metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
      });

      if (!metaConn) {
        metaConn = await prisma.metaConnection.create({
          data: {
            accountId: req.user.accountId,
            metaUserId: rawPageData.id,
            metaUserName: rawPageData.name,
            encryptedAccessToken: encryptedToken,
            status: 'ACTIVE',
          },
        });
      }

      const isSubscribed = await MetaGraphService.subscribePageToWebhook(rawPageData.id, token);

      const igAccount = rawPageData.instagram_business_account;
      const instagramBusinessId = igAccount?.id || null;
      const instagramUsername = igAccount?.username || null;

      const existingPage = await prisma.page.findFirst({
        where: { accountId: req.user.accountId, metaPageId: rawPageData.id },
      });

      const page = await prisma.page.upsert({
        where: {
          id: existingPage?.id || 'none',
        },
        update: {
          name: rawPageData.name,
          category: rawPageData.category || null,
          avatar: rawPageData.picture?.data?.url || null,
          followersCount: rawPageData.followers_count || 0,
          encryptedAccessToken: encryptedToken,
          isWebhookSubscribed: isSubscribed,
          isConnected: true,
          instagramBusinessId,
          instagramUsername,
        },
        create: {
          accountId: req.user.accountId,
          metaConnectionId: metaConn.id,
          metaPageId: rawPageData.id,
          name: rawPageData.name,
          category: rawPageData.category || null,
          avatar: rawPageData.picture?.data?.url || null,
          followersCount: rawPageData.followers_count || 0,
          encryptedAccessToken: encryptedToken,
          isWebhookSubscribed: isSubscribed,
          isConnected: true,
          instagramBusinessId,
          instagramUsername,
        },
      });

      await prisma.pagePermission.upsert({
        where: {
          userId_pageId: {
            userId: req.user.id,
            pageId: page.id,
          },
        },
        update: {
          canChat: true,
          canComment: true,
          canViewPosts: true,
          canViewAds: true,
          canManageSettings: true,
        },
        create: {
          userId: req.user.id,
          pageId: page.id,
          canChat: true,
          canComment: true,
          canViewPosts: true,
          canViewAds: true,
          canManageSettings: true,
        },
      });

      // Trigger automatic initial background sync (Posts, Comments, Convs, Ads, IG)
      triggerInitialPageSync({
        pageId: page.id,
        accountId: req.user.accountId,
        userId: req.user.id,
      });

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'CONNECT_PAGE_DIRECT',
        targetType: 'Page',
        targetId: page.id,
        details: `Đã kết nối Fanpage: ${page.name} (${page.metaPageId})`,
      });

      emitToAccount(req.user.accountId, 'meta_status_changed', { connected: true, page });

      return res.json({
        success: true,
        count: 1,
        message: `Đã kết nối thành công Fanpage: ${page.name} và kích hoạt Webhook + Đồng bộ dữ liệu ngầm!`,
        pages: [page],
        page: {
          id: page.id,
          metaPageId: page.metaPageId,
          name: page.name,
          avatar: page.avatar,
          followersCount: page.followersCount,
          isWebhookSubscribed: page.isWebhookSubscribed,
          instagramUsername: page.instagramUsername,
        },
      });
    } catch (error: any) {
      logger.error('Connect page directly error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi kết nối Page: ' + error.message });
    }
  }

  static connectToken = MetaController.connectPageDirectly;

  /**
   * Save Meta Developer App Credentials (App ID, Secret, Verify Token)
   */
  static async saveSettings(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { appId, appSecret, verifyToken } = req.body;

      if (appId) process.env.META_APP_ID = appId.trim();
      if (appSecret) process.env.META_APP_SECRET = appSecret.trim();
      if (verifyToken) process.env.META_WEBHOOK_VERIFY_TOKEN = verifyToken.trim();

      // Persist to .env file if it exists
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');

          if (appId) {
            envContent = envContent.replace(/META_APP_ID=.*/, `META_APP_ID=${appId.trim()}`);
          }
          if (appSecret) {
            envContent = envContent.replace(/META_APP_SECRET=.*/, `META_APP_SECRET=${appSecret.trim()}`);
          }
          if (verifyToken) {
            envContent = envContent.replace(/META_WEBHOOK_VERIFY_TOKEN=.*/, `META_WEBHOOK_VERIFY_TOKEN=${verifyToken.trim()}`);
          }

          fs.writeFileSync(envPath, envContent, 'utf8');
        }
      } catch (err: any) {
        logger.warn('Could not write to .env file, updated process.env only:', err.message);
      }

      await logger.audit({
        accountId: req.user.accountId,
        userId: req.user.id,
        action: 'UPDATE_META_CREDENTIALS',
        targetType: 'Settings',
        details: 'Cập nhật cấu hình Meta App Credentials',
      });

      return res.json({
        success: true,
        message: 'Đã lưu cấu hình Meta App thành công!',
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi lưu cấu hình Meta: ' + error.message });
    }
  }

  /**
   * Trigger full sync across all connected pages (Conversations, Messages, Comments, Posts, Avatars)
   */
  static async syncAllPages(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const pages = await prisma.page.findMany({
        where: { accountId: req.user.accountId, isConnected: true },
      });

      if (pages.length === 0) {
        return res.json({ success: true, count: 0, message: 'Chưa có Fanpage nào được kết nối.' });
      }

      const metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
      });
      const userAccessToken = metaConn ? decryptToken(metaConn.encryptedAccessToken) : undefined;

      await Promise.allSettled(
        pages.map((p) =>
          triggerInitialPageSync({
            pageId: p.id,
            accountId: req.user!.accountId,
            userId: req.user!.id,
            userAccessToken,
          })
        )
      );

      return res.json({
        success: true,
        count: pages.length,
        message: `Đã đồng bộ xong dữ liệu tin nhắn, bình luận và ảnh đại diện của ${pages.length} Fanpage!`,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: 'Lỗi đồng bộ dữ liệu: ' + error.message });
    }
  }

  /**
   * Live Customer Avatar Resolver & Proxy (/api/meta/avatar/:metaId)
   * Automatically resolves, proxies image bytes, and caches the customer's real Facebook avatar & name on demand.
   */
  static async resolveCustomerAvatar(req: Request, res: Response) {
    try {
      const { metaId } = req.params;
      if (!metaId || metaId.startsWith('user_')) {
        return res.status(404).end();
      }

      const customer = await prisma.customer.findFirst({
        where: { metaId },
        include: { primaryPage: true },
      });

      const connectedPages = await prisma.page.findMany({
        where: { isConnected: true },
      });

      const orderedPages = [
        ...(customer?.primaryPage && customer.primaryPage.isConnected ? [customer.primaryPage] : []),
        ...connectedPages.filter((p) => p.id !== customer?.primaryPageId),
      ];

      for (const page of orderedPages) {
        const pageToken = decryptToken(page.encryptedAccessToken);
        if (!pageToken) continue;

        // 1. Try streaming directly from Graph /picture edge (follows redirect to CDN on server side)
        try {
          const directImg = await axios.get(`https://graph.facebook.com/v19.0/${metaId}/picture`, {
            params: {
              width: 200,
              height: 200,
              type: 'large',
              access_token: pageToken,
            },
            responseType: 'arraybuffer',
            timeout: 4500,
          });
          if (directImg.data && directImg.data.byteLength > 100) {
            const contentType = String(directImg.headers['content-type'] || 'image/jpeg');
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(Buffer.from(directImg.data));
          }
        } catch {}

        // 2. Fallback: Resolve profile_pic URL via getCustomerProfile and stream its image bytes
        try {
          const profile = await MetaGraphService.getCustomerProfile(metaId, pageToken);
          if (profile?.profile_pic) {
            if (customer) {
              const shouldUpdateName =
                profile.name &&
                (customer.name.startsWith('Khách hàng') || customer.name.startsWith('Người dùng'));
              await prisma.customer
                .update({
                  where: { id: customer.id },
                  data: {
                    avatar: profile.profile_pic,
                    ...(shouldUpdateName ? { name: profile.name } : {}),
                  },
                })
                .catch(() => {});
            }

            try {
              const cdnImg = await axios.get(profile.profile_pic, {
                responseType: 'arraybuffer',
                timeout: 4500,
              });
              if (cdnImg.data && cdnImg.data.byteLength > 100) {
                const contentType = String(cdnImg.headers['content-type'] || 'image/jpeg');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(Buffer.from(cdnImg.data));
              }
            } catch {
              return res.redirect(302, profile.profile_pic);
            }
          }
        } catch {}
      }

      return res.status(404).end();
    } catch {
      return res.status(404).end();
    }
  }
}
