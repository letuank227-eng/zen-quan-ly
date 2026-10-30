import React, { useState, useEffect, useMemo } from 'react';
import { usePages } from '../context/PageContext';
import api from '../services/api';
import { Post, CommentItem } from '../types';
import { EmptyState } from '../components/Common/EmptyState';
import {
  FileText,
  ThumbsUp,
  MessageCircle,
  Share2,
  RefreshCw,
  ExternalLink,
  Layers,
  Send,
  X,
  AlertCircle,
  CheckCircle,
  Video,
  Play,
  Image as ImageIcon,
} from 'lucide-react';

export const Posts: React.FC = () => {
  const { selectedPageId, pages, hasConnectedPages } = usePages();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'photo'>('all');

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/posts', {
        params: {
          pageId: selectedPageId !== 'all' ? selectedPageId : undefined,
          limit: 100,
        },
      });
      if (res.data.success) {
        setPosts(res.data.posts || []);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [selectedPageId]);

  // Sync posts from Meta (syncs all connected pages if 'all' is selected)
  const handleSyncPosts = async () => {
    const targetPages = selectedPageId !== 'all'
      ? pages.filter((p) => p.id === selectedPageId)
      : pages;
    if (targetPages.length === 0) return;

    setSyncing(true);
    setAlertMsg(null);
    try {
      let totalSynced = 0;
      for (const p of targetPages) {
        const res = await api.post(`/posts/sync/${p.id}`);
        if (res.data?.success) {
          totalSynced += res.data.syncedCount || 0;
        }
      }
      setAlertMsg({ type: 'success', text: `Đã đồng bộ thành công ${totalSynced} bài viết từ Meta.` });
      fetchPosts();
    } catch (err: any) {
      setAlertMsg({
        type: 'error',
        text: err.response?.data?.message || 'Đồng bộ bài viết từ Meta thất bại.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const isVideoPost = (p: Post) => {
    return Boolean(
      p.videoUrl ||
      (p.permalinkUrl && (p.permalinkUrl.includes('/reel/') || p.permalinkUrl.includes('/videos/')))
    );
  };

  const filteredPosts = useMemo(() => {
    if (mediaFilter === 'video') {
      return posts.filter(isVideoPost);
    }
    if (mediaFilter === 'photo') {
      return posts.filter((p) => !isVideoPost(p));
    }
    return posts;
  }, [posts, mediaFilter]);

  const videoCount = useMemo(() => posts.filter(isVideoPost).length, [posts]);
  const photoCount = useMemo(() => posts.filter((p) => !isVideoPost(p)).length, [posts]);

  // Open comments drawer
  const handleOpenComments = async (post: Post) => {
    setSelectedPost(post);
    setCommentsLoading(true);
    try {
      const res = await api.get(`/posts/${post.id}`);
      if (res.data.success) {
        setSelectedPost(res.data.post);
      }
    } catch (err) {
      console.error('Failed to load post detail:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // Reply directly to post from drawer
  const handleSendCommentReply = async (commentId: string) => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    try {
      const res = await api.post(`/comments/${commentId}/reply`, {
        message: replyText.trim(),
      });
      if (res.data.success) {
        setReplyText('');
        if (selectedPost) {
          handleOpenComments(selectedPost);
        }
      }
    } catch (err: any) {
      alert('Lỗi trả lời bình luận: ' + (err.response?.data?.message || err.message));
    } finally {
      setReplying(false);
    }
  };

  if (!hasConnectedPages) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Layers}
          title="Chưa có Page nào được kết nối"
          description="Để đồng bộ bài viết và xem tương tác từ Facebook Page, vui lòng kết nối Meta Page."
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
            Quản lý bài viết (Posts)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Xem danh sách bài đăng từ Facebook Page và trả lời bình luận trực tiếp
          </p>
        </div>

        <button
          onClick={handleSyncPosts}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/20 transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ bài viết từ Meta'}</span>
        </button>
      </div>

      {alertMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            alertMsg.type === 'success'
              ? 'bg-brand-50 border-brand-200 text-brand-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {alertMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-brand-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
            <span>{alertMsg.text}</span>
          </div>
          <button onClick={() => setAlertMsg(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Media Filter Tabs */}
      {!loading && posts.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
          <button
            onClick={() => setMediaFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              mediaFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Tất cả bài viết ({posts.length})</span>
          </button>

          <button
            onClick={() => setMediaFilter('video')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              mediaFilter === 'video'
                ? 'bg-red-600 text-white shadow-sm shadow-red-500/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-red-500" />
            <span>Video & Reels ({videoCount})</span>
          </button>

          <button
            onClick={() => setMediaFilter('photo')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              mediaFilter === 'photo'
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-brand-600" />
            <span>Hình ảnh ({photoCount})</span>
          </button>
        </div>
      )}

      {/* Posts Grid */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">Đang tải danh sách bài viết...</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-700">Chưa có bài viết nào</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
            Bấm nút "Đồng bộ bài viết từ Meta" phía trên để lấy các bài viết mới nhất từ Facebook Page của bạn.
          </p>
          <button
            onClick={handleSyncPosts}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Đồng bộ ngay</span>
          </button>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center">
          <Video className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-700">Không tìm thấy bài viết nào</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
            Không có bài viết nào phù hợp với bộ lọc "{mediaFilter === 'video' ? 'Video & Reels' : 'Hình ảnh'}".
          </p>
          <button
            onClick={() => setMediaFilter('all')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <span>Xem tất cả bài viết</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition group"
            >
              <div>
                {/* Page info & Post Date */}
                <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {post.page.avatar ? (
                      <img
                        src={post.page.avatar}
                        alt={post.page.name}
                        className="w-6 h-6 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold">
                        {post.page.name[0]}
                      </div>
                    )}
                    <span className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">
                      {post.page.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(post.publishedAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Media thumbnail: Video or Picture */}
                {post.videoUrl ? (
                  <div className="w-full h-48 bg-slate-900 overflow-hidden relative group flex items-center justify-center">
                    <video
                      src={post.videoUrl}
                      poster={post.picture || undefined}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 pointer-events-none bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                      <Video className="w-3 h-3 text-red-400" />
                      <span>Video</span>
                    </div>
                  </div>
                ) : post.picture ? (
                  <div className="w-full h-48 bg-slate-100 overflow-hidden relative group">
                    <img
                      src={post.picture}
                      alt="Post attachment"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    {post.permalinkUrl && (post.permalinkUrl.includes('/videos/') || post.permalinkUrl.includes('/reel/')) ? (
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <Video className="w-3 h-3 text-red-400" />
                        <span>Video / Reel</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Post Message */}
                <div className="p-4">
                  <p className="text-xs text-slate-700 line-clamp-3 whitespace-pre-wrap">
                    {post.message || 'Bài viết đa phương tiện trên Facebook.'}
                  </p>
                </div>
              </div>

              {/* Stats & Actions Footer */}
              <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-slate-500 text-[11px] font-medium">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="w-3.5 h-3.5 text-blue-500" />
                    <span>{post.likeCount}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5 text-brand-600" />
                    <span>{post.commentCount}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Share2 className="w-3.5 h-3.5 text-purple-500" />
                    <span>{post.shareCount}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {post.permalinkUrl && (
                    <a
                      href={post.permalinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
                      title="Mở trên Facebook"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => handleOpenComments(post)}
                    className="px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
                  >
                    Xem bình luận
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Comments Modal / Slide-over */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  Bình luận: {selectedPost.message || 'Bài viết Facebook'}
                </h3>
                <span className="text-[10px] text-slate-400">Page: {selectedPost.page.name}</span>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Media Preview */}
            {selectedPost.videoUrl ? (
              <div className="w-full max-h-56 bg-slate-950 flex items-center justify-center border-b border-slate-200">
                <video
                  src={selectedPost.videoUrl}
                  poster={selectedPost.picture || undefined}
                  controls
                  className="max-h-56 max-w-full object-contain"
                />
              </div>
            ) : selectedPost.picture ? (
              <div className="w-full max-h-36 bg-slate-100 overflow-hidden border-b border-slate-200">
                <img
                  src={selectedPost.picture}
                  alt="Post preview"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}

            {/* Comments Stream */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {commentsLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">Đang tải bình luận...</div>
              ) : selectedPost.comments?.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Bài viết này chưa có bình luận nào.
                </div>
              ) : (
                selectedPost.comments?.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{c.authorName}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-800">{c.message}</p>

                    {/* Replies */}
                    {c.replies && c.replies.length > 0 && (
                      <div className="pl-3 border-l-2 border-slate-200 space-y-1.5 mt-2">
                        {c.replies.map((rep) => (
                          <div key={rep.id} className="text-[11px] bg-white p-2 rounded-lg">
                            <span className="font-bold text-brand-700">{rep.authorName}: </span>
                            <span className="text-slate-700">{rep.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Trả lời bình luận này qua Facebook..."
                        className="flex-1 text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-brand-500"
                      />
                      <button
                        onClick={() => handleSendCommentReply(c.id)}
                        disabled={replying || !replyText.trim()}
                        className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
