import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePages } from '../context/PageContext';
import { onSocketEvent } from '../services/socket';
import api from '../services/api';
import { CommentItem } from '../types';
import { EmptyState } from '../components/Common/EmptyState';
import CustomerAvatar from '../components/Common/CustomerAvatar';
import {
  MessageCircle,
  MessageSquare,
  Send,
  Reply,
  CheckCircle,
  Clock,
  Layers,
  Search,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Pencil,
  Check,
  X,
} from 'lucide-react';

export const Comments: React.FC = () => {
  const { selectedPageId, pages, hasConnectedPages } = usePages();
  const [searchParams] = useSearchParams();

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'resolved'>('all');
  const [search, setSearch] = useState('');

  // Reply state
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // Private reply state (Comment -> Messenger)
  const [activePrivateReplyId, setActivePrivateReplyId] = useState<string | null>(null);
  const [privateReplyText, setPrivateReplyText] = useState('');
  const [privateReplying, setPrivateReplying] = useState(false);

  // Rename customer state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [updatingName, setUpdatingName] = useState(false);

  const handleStartRename = (comment: CommentItem) => {
    setEditingCommentId(comment.id);
    setEditingName(comment.customer?.name || comment.authorName);
  };

  const handleSaveRename = async (comment: CommentItem) => {
    if (!editingName.trim()) return;
    setUpdatingName(true);
    try {
      if (comment.customer?.id) {
        await api.put(`/crm/${comment.customer.id}`, { name: editingName.trim() });
      }
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id || (comment.customer?.id && c.customer?.id === comment.customer.id)
            ? {
                ...c,
                authorName: editingName.trim(),
                customer: c.customer ? { ...c.customer, name: editingName.trim() } : undefined,
              }
            : c
        )
      );
      setEditingCommentId(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể đổi tên khách.');
    } finally {
      setUpdatingName(false);
    }
  };

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/comments', {
        params: {
          pageId: selectedPageId !== 'all' ? selectedPageId : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: search.trim() || undefined,
        },
      });
      if (res.data.success) {
        setComments(res.data.comments || []);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromMeta = async () => {
    const targetPageId = selectedPageId !== 'all' ? selectedPageId : pages[0]?.id;
    if (!targetPageId) return;

    setSyncingMeta(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.post(`/comments/sync/${targetPageId}`);
      if (res.data.success) {
        setActionSuccess(res.data.message);
        fetchComments();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Đồng bộ bình luận từ Meta thất bại.');
    } finally {
      setSyncingMeta(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [selectedPageId, statusFilter]);

  // Realtime comments listener
  useEffect(() => {
    const handleNewComment = () => {
      fetchComments();
    };

    const handleCommentReply = () => {
      fetchComments();
    };

    const unsubComment = onSocketEvent('new_comment', handleNewComment);
    const unsubReply = onSocketEvent('comment_reply', handleCommentReply);

    return () => {
      unsubComment();
      unsubReply();
    };
  }, []);

  // SUBMIT COMMENT REPLY (POSTS DIRECTLY TO FACEBOOK GRAPH API)
  const handleSendReply = async (commentId: string) => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await api.post(`/comments/${commentId}/reply`, {
        message: replyText.trim(),
      });

      if (res.data.success) {
        setActionSuccess('Đã trả lời bình luận thành công trên Facebook!');
        setReplyText('');
        setActiveReplyId(null);
        fetchComments();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Trả lời bình luận thất bại trên Meta API.';
      setActionError(msg);
    } finally {
      setReplying(false);
    }
  };

  // SUBMIT PRIVATE REPLY (COMMENT -> MESSENGER)
  const handleSendPrivateReply = async (commentId: string) => {
    if (!privateReplyText.trim() || privateReplying) return;
    setPrivateReplying(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await api.post(`/comments/${commentId}/private-reply`, {
        message: privateReplyText.trim(),
      });

      if (res.data.success) {
        setActionSuccess('Đã gửi tin nhắn riêng Messenger thành công tới khách hàng!');
        setPrivateReplyText('');
        setActivePrivateReplyId(null);
        fetchComments();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Không thể gửi tin nhắn riêng cho bình luận này.';
      setActionError(msg);
    } finally {
      setPrivateReplying(false);
    }
  };

  // Status Change
  const handleStatusChange = async (commentId: string, newStatus: string) => {
    try {
      await api.put(`/comments/${commentId}/status`, { status: newStatus });
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, status: newStatus as any } : c))
      );
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  if (!hasConnectedPages) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Layers}
          title="Chưa có Page nào được kết nối"
          description="Kết nối Facebook Page để tự động đồng bộ và trả lời bình luận trên các bài viết."
          actionText="+ Kết nối Meta Page"
          actionHref="/settings?tab=meta"
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Quản lý bình luận (Comments)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Đồng bộ và trả lời trực tiếp bình luận trên các bài viết của Page
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSyncFromMeta}
            disabled={syncingMeta}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/20 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingMeta ? 'animate-spin' : ''}`} />
            <span>{syncingMeta ? 'Đang đồng bộ...' : 'Đồng bộ từ Meta'}</span>
          </button>
          <button
            onClick={fetchComments}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-600' : ''}`} />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl text-xs text-brand-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-brand-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-brand-600 font-bold ml-2">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {(['all', 'pending', 'processing', 'resolved'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition ${
                statusFilter === st
                  ? 'bg-brand-50 text-brand-700 font-bold shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {st === 'all'
                ? 'Tất cả bình luận'
                : st === 'pending'
                ? 'Chưa trả lời'
                : st === 'processing'
                ? 'Đang xử lý'
                : 'Đã trả lời'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo người gửi, nội dung..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-500 rounded-xl outline-none transition"
          />
        </div>
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Đang tải bình luận...</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
            <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Chưa có bình luận nào</p>
            <p className="text-xs text-slate-400 mt-1">
              Khi bài viết trên Facebook nhận được bình luận, hệ thống sẽ tự động đồng bộ về đây.
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4"
            >
              {/* Post Context Header */}
              {comment.post && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  {comment.post.picture && (
                    <img
                      src={comment.post.picture}
                      alt="Post thumbnail"
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-700 truncate">
                      Bài viết: {comment.post.message || 'Bài viết hình ảnh/video'}
                    </p>
                    <span className="text-[10px] text-slate-400">Page: {comment.page.name}</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      comment.status === 'PENDING'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-brand-100 text-brand-800'
                    }`}
                  >
                    {comment.status === 'PENDING' ? 'Chưa trả lời' : 'Đã xử lý'}
                  </span>
                </div>
              )}

              {/* Main Comment */}
              <div className="flex items-start gap-3">
                <CustomerAvatar
                  name={comment.customer?.name || comment.authorName}
                  avatar={comment.customer?.avatar}
                  metaId={comment.customer?.metaId || comment.authorMetaId}
                  size="sm"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    {editingCommentId === comment.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(comment);
                            if (e.key === 'Escape') setEditingCommentId(null);
                          }}
                          autoFocus
                          placeholder="Nhập tên thật khách..."
                          className="text-xs px-2 py-1 bg-white border border-brand-400 rounded-lg outline-none font-bold text-slate-900 shadow-sm"
                        />
                        <button
                          onClick={() => handleSaveRename(comment)}
                          disabled={updatingName}
                          className="p-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition"
                          title="Lưu tên khách"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingCommentId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
                          title="Hủy"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <span className="font-bold text-slate-900 text-sm">
                          {comment.customer?.name || comment.authorName}
                        </span>
                        <button
                          onClick={() => handleStartRename(comment)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-brand-600 rounded transition"
                          title="Đổi tên thật khách hàng"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {(comment.authorName === 'Khách hàng Facebook' || !comment.customer?.name) && (
                          <button
                            onClick={() => handleStartRename(comment)}
                            className="text-[10px] text-amber-600 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded font-medium border border-amber-200 inline-flex items-center gap-1 transition"
                            title="Bấm để đặt tên thật cho khách"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>Đổi tên thật</span>
                          </button>
                        )}
                      </div>
                    )}

                    <span className="text-[10px] text-slate-400">
                      {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{comment.message}</p>

                  {/* Actions for this comment */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {/* Reply inline button */}
                    <button
                      onClick={() => {
                        setActiveReplyId(activeReplyId === comment.id ? null : comment.id);
                        setActivePrivateReplyId(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Trả lời bình luận</span>
                    </button>

                    {/* Private reply button (Comment -> Messenger) */}
                    <button
                      onClick={() => {
                        setActivePrivateReplyId(activePrivateReplyId === comment.id ? null : comment.id);
                        setActiveReplyId(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Nhắn tin riêng (Messenger)</span>
                    </button>

                    {/* Status Toggle */}
                    <button
                      onClick={() =>
                        handleStatusChange(
                          comment.id,
                          comment.status === 'PENDING' ? 'RESOLVED' : 'PENDING'
                        )
                      }
                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
                    >
                      {comment.status === 'PENDING' ? 'Đánh dấu đã xử lý' : 'Đánh dấu chưa xử lý'}
                    </button>

                    {/* View on Facebook */}
                    <a
                      href={
                        comment.post?.permalinkUrl
                          ? (comment.post.permalinkUrl.includes('?')
                              ? `${comment.post.permalinkUrl}&comment_id=${comment.metaCommentId?.split('_')[1] || ''}`
                              : `${comment.post.permalinkUrl}?comment_id=${comment.metaCommentId?.split('_')[1] || ''}`)
                          : `https://www.facebook.com/${comment.metaCommentId || ''}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Mở bình luận này trên Facebook để xem trang cá nhân của khách"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Xem trên FB</span>
                    </a>
                  </div>

                  {/* Inline Reply Form (Direct to Facebook) */}
                  {activeReplyId === comment.id && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                        <span>Trả lời bình luận công khai dưới danh nghĩa {comment.page.name}:</span>
                        <span className="text-[10px] text-brand-600">Đăng thẳng lên Facebook</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Nhập nội dung phản hồi..."
                          className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-brand-500"
                        />
                        <button
                          onClick={() => handleSendReply(comment.id)}
                          disabled={replying || !replyText.trim()}
                          className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition disabled:opacity-50 shrink-0"
                        >
                          {replying ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span>Gửi trả lời</span>
                              <Send className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Private Reply Form (Comment -> Messenger) */}
                  {activePrivateReplyId === comment.id && (
                    <div className="mt-3 p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
                      <div className="flex items-center justify-between text-xs text-blue-900 font-semibold">
                        <span>Nhắn tin riêng qua Messenger tới {comment.authorName}:</span>
                        <span className="text-[10px] text-blue-600">Quy tắc Meta (trong 7 ngày)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={privateReplyText}
                          onChange={(e) => setPrivateReplyText(e.target.value)}
                          placeholder="Nhập tin nhắn riêng gửi thẳng đến Messenger khách..."
                          className="flex-1 text-xs px-3 py-2 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleSendPrivateReply(comment.id)}
                          disabled={privateReplying || !privateReplyText.trim()}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition disabled:opacity-50 shrink-0"
                        >
                          {privateReplying ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span>Gửi tin nhắn</span>
                              <Send className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Replies List */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3 pl-3 border-l-2 border-slate-200 space-y-2.5">
                      {comment.replies.map((r) => (
                        <div key={r.id} className="text-xs bg-slate-50/80 p-2.5 rounded-xl">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">
                              {r.authorName} {r.isFromPage && <span className="text-[10px] text-brand-600 font-semibold">(Page)</span>}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-700 mt-1">{r.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
