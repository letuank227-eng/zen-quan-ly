import React, { useState, useEffect } from 'react';
import { usePages } from '../context/PageContext';
import api from '../services/api';
import { EmptyState } from '../components/Common/EmptyState';
import {
  BarChart3,
  TrendingUp,
  Users,
  Eye,
  MessageCircle,
  ThumbsUp,
  Share2,
  Layers,
  RefreshCw,
} from 'lucide-react';

export const Analytics: React.FC = () => {
  const { selectedPageId, pages, hasConnectedPages } = usePages();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any[]>([]);
  const [pageInfo, setPageInfo] = useState<any>(null);

  const fetchInsights = async () => {
    const targetPageId = selectedPageId !== 'all' ? selectedPageId : pages[0]?.id;
    if (!targetPageId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await api.get(`/analytics/page/${targetPageId}`);
      if (res.data.success) {
        setInsights(res.data.insights || []);
        setPageInfo(res.data.page);
      }
    } catch (err) {
      console.error('Failed to load page insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [selectedPageId, pages]);

  if (!hasConnectedPages) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Layers}
          title="Chưa có Page nào được kết nối"
          description="Để xem các chỉ số thống kê tăng trưởng, tiếp cận và tương tác của Page, vui lòng kết nối Meta Page."
          actionText="+ Kết nối Meta Page"
          actionHref="/settings?tab=meta"
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Thống kê & Báo cáo Page (Page Insights)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Dữ liệu thống kê lượt tiếp cận, tương tác và tăng trưởng từ Meta Graph API
          </p>
        </div>

        <button
          onClick={fetchInsights}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-600' : ''}`} />
          <span>Làm mới chỉ số</span>
        </button>
      </div>

      {/* Target Page Info Banner */}
      {pageInfo && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold">
              {pageInfo.name[0]}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{pageInfo.name}</h2>
              <p className="text-xs text-slate-500">
                Tổng số người theo dõi: <span className="font-semibold text-brand-700">{pageInfo.followersCount?.toLocaleString() || 0}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Insights Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">Lượt hiển thị trang</p>
            <Eye className="w-4 h-4 text-brand-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {insights.find((i) => i.name === 'page_impressions')?.values?.[0]?.value?.toLocaleString() || '---'}
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">page_impressions</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">Người dùng tương tác</p>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {insights.find((i) => i.name === 'page_engaged_users')?.values?.[0]?.value?.toLocaleString() || '---'}
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">page_engaged_users</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">Tương tác bài viết</p>
            <ThumbsUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {insights.find((i) => i.name === 'page_post_engagements')?.values?.[0]?.value?.toLocaleString() || '---'}
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">page_post_engagements</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">Lượt xem trang</p>
            <BarChart3 className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {insights.find((i) => i.name === 'page_views_total')?.values?.[0]?.value?.toLocaleString() || '---'}
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">page_views_total</span>
        </div>
      </div>

      {/* Raw Insights details table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900">Chi tiết số liệu Meta Graph Insights</h3>
        {insights.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Chưa nhận được số liệu thống kê từ Meta API (cần quyền read_insights hoặc Page có lượng tương tác tối thiểu).
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {insights.map((item) => (
              <div key={item.id || item.name} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">{item.title || item.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-sm text-brand-700">
                    {item.values?.[0]?.value !== undefined ? String(item.values[0].value) : '0'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">{item.period}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
