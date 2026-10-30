import { Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { MetaGraphService } from '../services/metaGraphService';
import { decryptToken } from '../utils/crypto';
import { logger } from '../utils/logger';

export class AdsController {
  /**
   * Get connected Ad Accounts and their metrics
   */
  static async getAdAccounts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const adAccounts = await prisma.adAccount.findMany({
        where: { accountId: req.user.accountId },
        include: {
          campaigns: {
            include: {
              adSets: {
                include: { ads: true },
              },
            },
          },
        },
      });

      return res.json({ success: true, adAccounts });
    } catch (error: any) {
      logger.error('Get ad accounts error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải danh sách tài khoản quảng cáo.' });
    }
  }

  /**
   * Sync Ad Accounts & Campaigns from Meta API
   */
  static async syncAdsData(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
      });

      if (!metaConn) {
        return res.status(400).json({ success: false, message: 'Chưa kết nối tài khoản Meta.' });
      }

      const userAccessToken = decryptToken(metaConn.encryptedAccessToken);
      if (!userAccessToken) {
        return res.status(400).json({ success: false, message: 'Token Meta không hợp lệ.' });
      }

      // Fetch dynamic Ad Accounts from Meta
      const rawAccounts = await MetaGraphService.fetchAdAccounts(userAccessToken);
      if (rawAccounts.length === 0) {
        return res.json({
          success: true,
          message: 'Không tìm thấy tài khoản quảng cáo Meta nào cho tài khoản này.',
          adAccounts: [],
        });
      }

      const syncedAccounts = [];

      for (const raw of rawAccounts) {
        const adAccount = await prisma.adAccount.upsert({
          where: { metaAdAccountId: raw.id },
          update: {
            name: raw.name || raw.id,
            currency: raw.currency || 'VND',
            accountStatus: raw.account_status || 1,
            amountSpent: Number(raw.amount_spent || 0) / 100, // Meta returns currency in cents
          },
          create: {
            accountId: req.user.accountId,
            metaAdAccountId: raw.id,
            name: raw.name || raw.id,
            currency: raw.currency || 'VND',
            accountStatus: raw.account_status || 1,
            amountSpent: Number(raw.amount_spent || 0) / 100,
          },
        });

        // Sync campaigns
        const campaigns = await MetaGraphService.fetchCampaigns(raw.id, userAccessToken);
        for (const c of campaigns) {
          await prisma.campaign.upsert({
            where: { metaCampaignId: c.id },
            update: {
              name: c.name,
              objective: c.objective || null,
              status: c.status || 'ACTIVE',
              dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
              lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
            },
            create: {
              adAccountId: adAccount.id,
              metaCampaignId: c.id,
              name: c.name,
              objective: c.objective || null,
              status: c.status || 'ACTIVE',
              dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
              lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
            },
          });
        }

        syncedAccounts.push(adAccount);
      }

      return res.json({
        success: true,
        message: `Đã đồng bộ ${syncedAccounts.length} tài khoản quảng cáo từ Meta.`,
        adAccounts: syncedAccounts,
      });
    } catch (error: any) {
      logger.error('Sync ads error:', error.message);
      return res.status(500).json({ success: false, message: 'Đồng bộ quảng cáo thất bại: ' + error.message });
    }
  }

  /**
   * Get ad insights & overview metrics (spend, reach, impressions, CTR, CPC, CPM)
   */
  static async getAdInsights(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });

      const { adAccountId, datePreset = 'last_30d' } = req.query;

      const metaConn = await prisma.metaConnection.findFirst({
        where: { accountId: req.user.accountId, status: 'ACTIVE' },
      });

      if (!metaConn) {
        return res.json({
          success: true,
          insights: [],
          summary: { spend: 0, reach: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, results: 0 },
        });
      }

      const userAccessToken = decryptToken(metaConn.encryptedAccessToken);
      if (!userAccessToken) {
        return res.status(400).json({ success: false, message: 'Token Meta không hợp lệ.' });
      }

      let targetAdAccountId = adAccountId as string;
      if (!targetAdAccountId) {
        const firstAccount = await prisma.adAccount.findFirst({
          where: { accountId: req.user.accountId },
        });
        if (firstAccount) {
          targetAdAccountId = firstAccount.metaAdAccountId;
        }
      }

      if (!targetAdAccountId) {
        return res.json({
          success: true,
          insights: [],
          summary: { spend: 0, reach: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, results: 0 },
        });
      }

      const insightsData = await MetaGraphService.fetchAdAccountInsights(
        targetAdAccountId,
        userAccessToken,
        datePreset.toString()
      );

      // Calculate totals
      let spend = 0;
      let reach = 0;
      let impressions = 0;
      let clicks = 0;

      for (const row of insightsData) {
        spend += Number(row.spend || 0);
        reach += Number(row.reach || 0);
        impressions += Number(row.impressions || 0);
        clicks += Number(row.clicks || 0);
      }

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

      return res.json({
        success: true,
        insights: insightsData,
        summary: {
          spend,
          reach,
          impressions,
          clicks,
          ctr: Number(ctr.toFixed(2)),
          cpc: Number(cpc.toFixed(0)),
          cpm: Number(cpm.toFixed(0)),
          results: clicks,
        },
      });
    } catch (error: any) {
      logger.error('Get ad insights error:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi tải thống kê quảng cáo.' });
    }
  }
}
