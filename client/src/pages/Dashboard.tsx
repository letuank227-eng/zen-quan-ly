import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePages } from '../context/PageContext';
import api from '../services/api';
import { EmptyState } from '../components/Common/EmptyState';
import {
  Layers,
  MessageSquare,
  MessageCircle,
  Users,
  AlertTriangle,
  Megaphone,
  TrendingUp,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { selectedPageId, hasConnectedPages } = usePages();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/analytics/dashboard?pageId=${selectedPageId}`);
      if (res.data.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedPageId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Đang tải dữ liệu tổng quan...</p>
        </div>
      </div>
    );
  }

  // Requirement #19: Empty state when no Meta Page is connected
  if (!hasConnectedPages || !data?.hasPages) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Xin chào, {user?.fullName}!</h1>
            <p className="text-sm text-slate-500 mt-1">
              Bắt đầu kết nối tài khoản Meta của bạn để đồng bộ các Facebook Page bạn quản lý.
            </p>
          </div>
          <Link
            to="/settings?tab=meta"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-md shadow-brand-500/20 transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Kết nối Meta</span>
          </Link>
        </div>

        <EmptyState
          icon={Layers}
          title="Chưa có Page được kết nối"
          description="Hệ thống không sử dụng dữ liệu giả. Hãy kết nối tài khoản Facebook/Meta của bạn để chọn các Page bạn có quyền quản lý và bắt đầu xử lý tin nhắn, bình luận và khách hàng ngay tại đây."
          actionText="+ Kết nối Meta ngay"
          actionHref="/settings?tab=meta"
        />
      </div>
    );
  }

  const stats = data.stats;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header with Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Dashboard Tổng Quan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Dữ liệu tổng hợp từ các Facebook Page kết nối thực tế
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Làm mới</span>
          </button>
          <Link
            to="/inbox"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition"
          >
            <span>Mở Inbox xử lý</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {/* Pages Connected */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Số Page kết nối</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.pageCount}</p>
            <span className="text-[11px] text-brand-600 font-semibold mt-1 inline-flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Đang hoạt động
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Khách hàng CRM</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.customerCount}</p>
            <Link to="/customers" className="text-[11px] text-slate-500 hover:text-brand-600 font-medium mt-1 inline-block">
              Xem danh sách &rarr;
            </Link>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Unresolved Messages */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Tin nhắn chưa xử lý</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pendingMessages}</p>
            <Link to="/messenger" className="text-[11px] text-amber-600 font-semibold mt-1 inline-flex items-center gap-0.5">
              <span>Cần phản hồi</span> &rarr;
            </Link>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        {/* Unresolved Comments */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Bình luận chưa trả lời</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.pendingComments}</p>
            <Link to="/comments" className="text-[11px] text-red-600 font-semibold mt-1 inline-flex items-center gap-0.5">
              <span>Cần trả lời</span> &rarr;
            </Link>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Tổng người theo dõi (Followers)</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{stats.totalFollowers.toLocaleString()} người</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Chi tiêu Meta Ads</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{stats.adSpend.toLocaleString()} ₫</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Tổng bài viết đồng bộ</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{stats.totalPosts} bài</p>
          </div>
        </div>
      </div>

      {/* Recent Activities Feed */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Tương tác mới nhất từ Meta</h2>
            <p className="text-xs text-slate-500">Tin nhắn và bình luận trực tiếp gửi từ khách hàng</p>
          </div>
          <Link to="/inbox" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            Xem tất cả trong Inbox &rarr;
          </Link>
        </div>

        {data.recentActivities?.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Chưa có tương tác nào phát sinh. Khi khách gửi tin nhắn hoặc bình luận trên Facebook, hoạt động sẽ xuất hiện ngay tại đây.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentActivities.map((act: any) => (
              <div key={act.id} className="py-3 flex items-start justify-between gap-3 text-sm">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      act.type === 'messenger'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {act.type === 'messenger' ? (
                      <MessageSquare className="w-4 h-4" />
                    ) : (
                      <MessageCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">{act.sender}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                        {act.pageName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-0.5">{act.text}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  <span>
                    {new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
