import React, { useState, useEffect } from 'react';
import { usePages } from '../context/PageContext';
import { onSocketEvent } from '../services/socket';
import api from '../services/api';
import { UnifiedInboxItem } from '../types';
import { EmptyState } from '../components/Common/EmptyState';
import CustomerAvatar from '../components/Common/CustomerAvatar';
import {
  Inbox as InboxIcon,
  MessageSquare,
  MessageCircle,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Layers,
  ArrowRight,
  User,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Inbox: React.FC = () => {
  const navigate = useNavigate();
  const { selectedPageId, hasConnectedPages } = usePages();

  const [items, setItems] = useState<UnifiedInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    processing: 0,
    resolved: 0,
    messengerCount: 0,
    commentCount: 0,
  });

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'messenger' | 'comment'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'resolved'>('all');
  const [search, setSearch] = useState('');

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const res = await api.get('/inbox', {
        params: {
          type: typeFilter,
          status: statusFilter,
          pageId: selectedPageId !== 'all' ? selectedPageId : undefined,
          search: search.trim() || undefined,
        },
      });

      if (res.data.success) {
        setItems(res.data.items || []);
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load unified inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, [typeFilter, statusFilter, selectedPageId]);

  // Realtime updates
  useEffect(() => {
    const handleNewMessage = () => {
      fetchInbox();
    };

    const handleNewComment = () => {
      fetchInbox();
    };

    const handleUpdated = () => {
      fetchInbox();
    };

    const unsubMsg = onSocketEvent('new_message', handleNewMessage);
    const unsubSent = onSocketEvent('message_sent', handleNewMessage);
    const unsubComment = onSocketEvent('new_comment', handleNewComment);
    const unsubUpdated = onSocketEvent('inbox_updated', handleUpdated);

    return () => {
      unsubMsg();
      unsubSent();
      unsubComment();
      unsubUpdated();
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInbox();
  };

  const handleItemClick = (item: UnifiedInboxItem) => {
    if (item.type === 'messenger') {
      navigate(`/messenger?conversationId=${item.id}`);
    } else {
      navigate(`/comments?commentId=${item.id}`);
    }
  };

  if (!hasConnectedPages) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Layers}
          title="Chưa có Page nào được kết nối"
          description="Để bắt đầu gom tin nhắn Messenger và bình luận về một nơi xử lý, vui lòng kết nối ít nhất một Facebook Page."
          actionText="+ Kết nối Meta Page"
          actionHref="/settings?tab=meta"
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Hộp thư tập trung (Inbox)</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Gom toàn bộ tin nhắn Messenger và bình luận từ tất cả các Page vào một nơi
          </p>
        </div>
        <button
          onClick={fetchInbox}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-600' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Tabs & Quick Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Interaction Type Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl shrink-0 overflow-x-auto">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              typeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setTypeFilter('messenger')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              typeFilter === 'messenger'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Messenger ({stats.messengerCount})</span>
          </button>
          <button
            onClick={() => setTypeFilter('comment')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              typeFilter === 'comment'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Bình luận ({stats.commentCount})</span>
          </button>
        </div>

        {/* Status Filters & Search */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Status Pills */}
          <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                statusFilter === 'all'
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Tất cả trạng thái
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1 ${
                statusFilter === 'pending'
                  ? 'bg-amber-100 text-amber-800 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>Chưa xử lý ({stats.pending})</span>
            </button>
            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1 ${
                statusFilter === 'resolved'
                  ? 'bg-brand-100 text-brand-800 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <CheckCircle className="w-3 h-3 text-brand-600" />
              <span>Đã xử lý</span>
            </button>
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative w-full max-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm khách hàng, nội dung..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-500 rounded-xl outline-none transition"
            />
          </form>
        </div>
      </div>

      {/* Inbox List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Đang đồng bộ hộp thư...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <InboxIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Chưa có tương tác nào</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Không tìm thấy tin nhắn hoặc bình luận phù hợp với bộ lọc hiện tại.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => handleItemClick(item)}
              className="p-4 hover:bg-slate-50/80 cursor-pointer transition flex items-start justify-between gap-4 group"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                {/* Customer Avatar / Initials */}
                <div className="relative shrink-0">
                  <CustomerAvatar name={item.customer.name} avatar={item.customer.avatar} size="md" />

                  {/* Channel icon badge */}
                  <div
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white ring-2 ring-white text-[9px] ${
                      item.type === 'messenger' ? 'bg-blue-500' : 'bg-brand-600'
                    }`}
                  >
                    {item.type === 'messenger' ? (
                      <MessageSquare className="w-2.5 h-2.5" />
                    ) : (
                      <MessageCircle className="w-2.5 h-2.5" />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 group-hover:text-brand-700 transition">
                      {item.customer.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700">
                      {item.pageName}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        item.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : item.status === 'PROCESSING'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-brand-100 text-brand-800'
                      }`}
                    >
                      {item.status === 'PENDING'
                        ? 'Chưa xử lý'
                        : item.status === 'PROCESSING'
                        ? 'Đang xử lý'
                        : 'Đã xử lý'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 line-clamp-1">{item.content}</p>

                  {/* Customer Tags if any */}
                  {item.customer.tags && item.customer.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {item.customer.tags.map((t) => (
                        <span
                          key={t.tag.name}
                          className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white"
                          style={{ backgroundColor: t.tag.color || '#10B981' }}
                        >
                          {t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamp & Assigned Staff */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-[11px] text-slate-400 font-medium">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>

                {item.assignedUser ? (
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                    <User className="w-2.5 h-2.5" />
                    <span>{item.assignedUser.fullName}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Chưa giao</span>
                )}

                <span className="text-xs text-brand-600 font-medium opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-0.5">
                  Xử lý ngay &rarr;
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
