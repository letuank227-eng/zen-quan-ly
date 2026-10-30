import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { EmptyState } from '../components/Common/EmptyState';
import {
  Megaphone,
  TrendingUp,
  DollarSign,
  Eye,
  MousePointer,
  RefreshCw,
  Calendar,
  Layers,
  Users,
} from 'lucide-react';

export const Ads: React.FC = () => {
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [selectedAdAccount, setSelectedAdAccount] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('last_30d');
  const [insightsSummary, setInsightsSummary] = useState<any>({
    spend: 0,
    reach: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    results: 0,
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchAdAccounts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/ads/accounts');
      if (res.data.success) {
        setAdAccounts(res.data.adAccounts || []);
        if (res.data.adAccounts?.length > 0 && !selectedAdAccount) {
          setSelectedAdAccount(res.data.adAccounts[0].metaAdAccountId);
        }
      }
    } catch (err) {
      console.error('Failed to load ad accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async () => {
    try {
      const res = await api.get('/ads/insights', {
        params: {
          adAccountId: selectedAdAccount || undefined,
          datePreset,
        },
      });
      if (res.data.success && res.data.summary) {
        setInsightsSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to load ad insights:', err);
    }
  };

  useEffect(() => {
    fetchAdAccounts();
  }, []);

  useEffect(() => {
    if (selectedAdAccount || adAccounts.length > 0) {
      fetchInsights();
    }
  }, [selectedAdAccount, datePreset]);

  const handleSyncAds = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/ads/sync');
      if (res.data.success) {
        fetchAdAccounts();
        fetchInsights();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Đồng bộ tài khoản quảng cáo thất bại.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">Đang tải dữ liệu quảng cáo...</p>
      </div>
    );
  }

  // Requirement #16 & #27: Empty state when no ads account
  if (adAccounts.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản lý quảng cáo (Meta Ads)</h1>
          <button
            onClick={handleSyncAds}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ từ Meta</span>
          </button>
        </div>

        <EmptyState
          icon={Megaphone}
          title="Chưa có dữ liệu quảng cáo"
          description="Tài khoản Meta của bạn chưa liên kết với tài khoản Meta Ads hoặc quyền ads_read chưa được cấp. Bấm đồng bộ để kiểm tra."
          actionText="Đồng bộ tài khoản Ads"
          actionOnClick={handleSyncAds}
        />
      </div>
    );
  }

  const currentAccount = adAccounts.find((a) => a.metaAdAccountId === selectedAdAccount) || adAccounts[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Quản lý quảng cáo (Meta Ads)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Theo dõi chi tiêu, chiến dịch và hiệu quả quảng cáo từ Meta Ads Manager
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range preset */}
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 outline-none shadow-sm focus:border-brand-500"
          >
            <option value="today">Hôm nay</option>
            <option value="yesterday">Hôm qua</option>
            <option value="last_7d">7 ngày qua</option>
            <option value="last_30d">30 ngày qua</option>
            <option value="this_month">Tháng này</option>
          </select>

          <button
            onClick={handleSyncAds}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/20 transition disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ</span>
          </button>
        </div>
      </div>

      {/* Account Selector */}
      {adAccounts.length > 1 && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 overflow-x-auto">
          {adAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAdAccount(acc.metaAdAccountId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedAdAccount === acc.metaAdAccountId
                  ? 'bg-brand-50 text-brand-700 font-bold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {acc.name} ({acc.currency})
            </button>
          ))}
        </div>
      )}

      {/* Metrics Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Spend */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Chi tiêu (Spend)</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {Number(insightsSummary.spend || 0).toLocaleString()} ₫
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Reach */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Tiếp cận (Reach)</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {Number(insightsSummary.reach || 0).toLocaleString()}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Impressions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Lượt hiển thị (Impressions)</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {Number(insightsSummary.impressions || 0).toLocaleString()}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5" />
          </div>
        </div>

        {/* Clicks & CTR */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">CTR / CPC trung bình</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {insightsSummary.ctr}% / {Number(insightsSummary.cpc || 0).toLocaleString()}₫
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <MousePointer className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Chiến dịch quảng cáo (Campaigns)</h2>

        {currentAccount?.campaigns?.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Tài khoản này chưa có chiến dịch nào được đồng bộ.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {currentAccount?.campaigns?.map((camp: any) => (
              <div key={camp.id} className="py-3.5 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{camp.name}</span>
                    <span
                      className={`px-2 py-0.2 rounded-full text-[10px] font-semibold ${
                        camp.status === 'ACTIVE'
                          ? 'bg-brand-100 text-brand-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {camp.status}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Mục tiêu: {camp.objective || 'Chung'} • ID: {camp.metaCampaignId}
                  </p>
                </div>

                <div className="text-right">
                  <span className="font-bold text-slate-900">
                    {camp.dailyBudget ? `${camp.dailyBudget.toLocaleString()} ₫/ngày` : 'Ngân sách trọn đời'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
