import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePages } from '../context/PageContext';
import api from '../services/api';
import { AvailableMetaPage } from '../types';
import {
  Settings as SettingsIcon,
  Share2,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  Key,
  Shield,
  Layers,
  RefreshCw,
  Check,
  User,
  Lock,
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { pages, refreshPages } = usePages();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'meta' | 'profile' | 'password'>(
    searchParams.get('tab') === 'meta' || searchParams.get('select_pages') ? 'meta' : 'meta'
  );

  // Meta OAuth & Settings
  const [metaSettings, setMetaSettings] = useState<any>(null);
  const [metaHealth, setMetaHealth] = useState<any>(null);
  const [availablePages, setAvailablePages] = useState<AvailableMetaPage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  const [loadingPages, setLoadingPages] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // App Credentials Form
  const [inputAppId, setInputAppId] = useState('');
  const [inputAppSecret, setInputAppSecret] = useState('');
  const [inputVerifyToken, setInputVerifyToken] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [showAdvancedMeta, setShowAdvancedMeta] = useState(false);

  // Profile state
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileSaving, setProfileSaving] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Load Meta settings & health
  const fetchMetaStatus = async () => {
    try {
      const [settingsRes, healthRes] = await Promise.all([
        api.get('/meta/settings'),
        api.get('/meta/health'),
      ]);
      if (settingsRes.data.success) {
        setMetaSettings(settingsRes.data.settings);
        setInputAppId(settingsRes.data.settings.rawAppId || '');
        setInputVerifyToken(settingsRes.data.settings.verifyToken || 'zen_crm_verify_token_secure_2026');
      }
      if (healthRes.data.success) {
        setMetaHealth(healthRes.data);
        if (healthRes.data.connected) {
          fetchAvailablePages();
        }
      }
    } catch (err) {
      console.error('Failed to load Meta status:', err);
    }
  };

  // Fetch available pages from Meta API
  const fetchAvailablePages = async () => {
    try {
      setLoadingPages(true);
      const res = await api.get('/meta/available-pages');
      if (res.data.success) {
        setAvailablePages(res.data.pages || []);
        const preselected = res.data.pages
          .filter((p: AvailableMetaPage) => p.isConnected)
          .map((p: AvailableMetaPage) => p.id);
        setSelectedPageIds(preselected);
      }
    } catch (err: any) {
      console.error('Failed to fetch available pages:', err);
    } finally {
      setLoadingPages(false);
    }
  };

  useEffect(() => {
    fetchMetaStatus();

    const metaError = searchParams.get('meta_error');
    if (metaError) {
      setStatusMessage({ type: 'error', text: decodeURIComponent(metaError) });
    }

    const metaSuccess = searchParams.get('meta_success');
    const count = searchParams.get('count');
    if (metaSuccess) {
      setStatusMessage({
        type: 'success',
        text: `🎉 Tuyệt vời! Đã tự động kết nối thành công ${count || ''} Fanpage thật của bạn!`,
      });
      refreshPages();
      refreshUser();
    }

    const handlePopupMessage = (event: MessageEvent) => {
      if (event.data?.type === 'META_OAUTH_SUCCESS') {
        if (event.data.metaTokensBundle) {
          try {
            localStorage.setItem('zen_meta_tokens', event.data.metaTokensBundle);
            document.cookie = `zen_meta_tokens=${encodeURIComponent(event.data.metaTokensBundle)}; path=/; max-age=5184000; SameSite=Lax`;
          } catch {}
        }
        setStatusMessage({
          type: 'success',
          text: `🎉 Kết nối thành công ${event.data.count || ''} Fanpage thật! Đang đồng bộ tin nhắn, bình luận & ảnh đại diện khách hàng...`,
        });
        refreshPages();
        refreshUser();
        fetchMetaStatus();
        api.post('/meta/sync-all').then(() => {
          refreshPages();
          fetchMetaStatus();
        }).catch(() => {});
      } else if (event.data?.type === 'META_OAUTH_ERROR') {
        setStatusMessage({
          type: 'error',
          text: event.data.error || 'Lỗi xác thực Facebook OAuth.',
        });
      }
    };

    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, []);

  // Connect Meta OAuth button click (1-Click Popup like Pancake)
  const handleConnectMeta = async () => {
    try {
      const res = await api.get('/meta/connect-url');
      if (res.data.success && res.data.oauthUrl) {
        const width = 620;
        const height = 720;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          res.data.oauthUrl,
          'MetaOAuthPopup',
          `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
        );
        if (!popup) {
          window.location.href = res.data.oauthUrl;
        }
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Không thể tạo liên kết kết nối Meta. Vui lòng điền Meta App ID & Secret phía dưới.',
      });
    }
  };

  // Save Meta App Credentials
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCredentials(true);
    setStatusMessage(null);
    try {
      const res = await api.post('/meta/settings', {
        appId: inputAppId.trim(),
        appSecret: inputAppSecret.trim(),
        verifyToken: inputVerifyToken.trim(),
      });
      if (res.data.success) {
        setStatusMessage({ type: 'success', text: 'Đã lưu cấu hình Meta App thành công! Giờ bạn có thể bấm "+ Kết nối Meta".' });
        fetchMetaStatus();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.response?.data?.message || 'Lỗi lưu thông tin Meta App.' });
    } finally {
      setSavingCredentials(false);
    }
  };

  // Toggle page selection checkbox
  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  // Save selected pages
  const handleSaveSelectedPages = async () => {
    if (selectedPageIds.length === 0) {
      setStatusMessage({ type: 'error', text: 'Vui lòng chọn ít nhất 1 Facebook Page để kết nối.' });
      return;
    }

    setConnecting(true);
    setStatusMessage(null);
    try {
      const res = await api.post('/meta/connect-pages', { selectedPageIds });
      if (res.data.success) {
        setStatusMessage({ type: 'success', text: res.data.message });
        await refreshPages();
        await refreshUser();
        fetchMetaStatus();
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi kết nối Page.',
      });
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect single page
  const handleDisconnectPage = async (pageId: string) => {
    if (!confirm('Bạn có chắc chắn muốn ngắt kết nối Page này?')) return;
    try {
      await api.post(`/meta/disconnect-page/${pageId}`);
      await refreshPages();
      fetchMetaStatus();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi ngắt kết nối Page.');
    }
  };

  // Disconnect entire Meta account
  const handleDisconnectAccount = async () => {
    if (!confirm('Bạn có chắc chắn muốn ngắt kết nối toàn bộ tài khoản Meta? Tất cả Page sẽ tạm ngừng đồng bộ.')) return;
    setDisconnecting(true);
    try {
      await api.post('/meta/disconnect-account');
      await refreshPages();
      await refreshUser();
      fetchMetaStatus();
      setStatusMessage({ type: 'success', text: 'Đã ngắt kết nối tài khoản Meta thành công.' });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi ngắt kết nối Meta.');
    } finally {
      setDisconnecting(false);
    }
  };

  // Update Profile
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await api.put('/auth/profile', { fullName, phone });
      if (res.data.success) {
        setStatusMessage({ type: 'success', text: 'Cập nhật thông tin thành công!' });
        refreshUser();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Lỗi cập nhật thông tin.' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    try {
      const res = await api.put('/auth/change-password', { currentPassword, newPassword });
      if (res.data.success) {
        setStatusMessage({ type: 'success', text: 'Đổi mật khẩu thành công!' });
        setCurrentPassword('');
        setNewPassword('');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.response?.data?.message || 'Lỗi đổi mật khẩu.' });
    } finally {
      setPasswordSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Đã sao chép vào bộ nhớ tạm: ' + text);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Cài đặt hệ thống</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Quản lý kết nối Meta/Facebook API, chọn Pages quản lý, cấu hình bảo mật và tài khoản
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('meta')}
          className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
            activeTab === 'meta'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span>Kết nối Meta / Facebook Page</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
            activeTab === 'profile'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Thông tin tài khoản</span>
        </button>

        <button
          onClick={() => setActiveTab('password')}
          className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
            activeTab === 'password'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Đổi mật khẩu</span>
        </button>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-brand-50 border-brand-200 text-brand-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-brand-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* TAB 1: META CONNECTION */}
      {activeTab === 'meta' && (
        <div className="space-y-6">
          {/* 1-CLICK FACEBOOK LOGIN POPUP BANNER (LIKE PANCAKE) */}
          <div className="bg-gradient-to-r from-[#1877F2] to-blue-700 rounded-2xl shadow-lg p-5 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-bold">
                <Zap className="w-3.5 h-3.5 text-yellow-300 fill-current" />
                <span>Tự động 1-Click giống Pancake</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Kết nối trực tiếp bằng tài khoản Facebook (1-Click OAuth Popup)
              </h2>
              <p className="text-xs text-blue-100 max-w-2xl">
                Chỉ cần bấm nút bên cạnh và chọn <b>"Tiếp tục"</b> trên cửa sổ Facebook. Hệ thống sẽ tự động lấy <b>Token Page Vĩnh Viễn</b>, tự động kết nối toàn bộ Fanpage, bật Webhook và tải Tên + Ảnh đại diện thật của khách!
              </p>
            </div>

            <button
              type="button"
              onClick={handleConnectMeta}
              className="px-6 py-3.5 bg-white hover:bg-blue-50 active:scale-[0.99] text-[#1877F2] rounded-xl text-sm font-extrabold shadow-md transition flex items-center justify-center gap-2.5 shrink-0 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Kết nối với Facebook ngay</span>
            </button>
          </div>

          {/* Main Status Header Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm ${
                    metaHealth?.connected
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  <Share2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">Trạng thái kết nối Meta</h2>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        metaHealth?.connected
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {metaHealth?.connected ? 'ĐÃ KẾT NỐI' : 'CHƯA KẾT NỐI TÀI KHOẢN META'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-1">
                    {metaHealth?.connected
                      ? `Tài khoản Meta: ${metaHealth.metaUser?.name} • Đang kết nối ${pages.length} Facebook Page thực tế`
                      : 'Chưa kết nối Page nào. Chỉ cần bấm nút "Kết nối với Facebook ngay" ở trên để kết nối tự động 1-Click.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    fetchMetaStatus();
                    refreshPages();
                  }}
                  disabled={loadingPages}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPages ? 'animate-spin' : ''}`} />
                  <span>Tải lại Page</span>
                </button>

                {metaHealth?.connected && (
                  <button
                    onClick={handleDisconnectAccount}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <span>Ngắt kết nối Meta</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Currently Connected Pages List */}
          {pages.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Các Facebook Page đang hoạt động ({pages.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pages.map((p) => (
                  <div key={p.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.name} className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center">
                          {p.name[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                          {p.isWebhookSubscribed && (
                            <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                              ✓ Webhook tự động
                            </span>
                          )}
                          {p.instagramUsername && (
                            <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-semibold bg-pink-100 text-pink-700 shrink-0">
                              IG: @{p.instagramUsername}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">ID: {p.metaPageId} • {p.followersCount.toLocaleString()} followers</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnectPage(p.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 cursor-pointer"
                    >
                      Ngắt kết nối
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Page Selector from OAuth (When Available Pages loaded) */}
          {availablePages.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Danh sách Page lấy từ tài khoản Meta ({availablePages.length})</h3>
                  <p className="text-xs text-slate-500">
                    Tên Page được lấy động trực tiếp từ Meta API. Tích chọn các Page bạn muốn quản trị trong CRM.
                  </p>
                </div>
                <button
                  onClick={handleSaveSelectedPages}
                  disabled={connecting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/20 transition disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{connecting ? 'Đang lưu kết nối...' : 'Kết nối Page đã chọn'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availablePages.map((page) => {
                  const isSelected = selectedPageIds.includes(page.id);
                  return (
                    <div
                      key={page.id}
                      onClick={() => togglePageSelection(page.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-brand-50/50 border-brand-500 ring-1 ring-brand-500'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-brand-600 border-brand-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>

                        {page.avatar ? (
                          <img
                            src={page.avatar}
                            alt={page.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {page.name[0]}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{page.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            ID: {page.id} • {page.followersCount.toLocaleString()} người theo dõi
                          </p>
                        </div>
                      </div>

                      {page.isConnected && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                          Đã kết nối
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADVANCED SETTINGS ACCORDION (OPTIONAL FOR META DEVELOPER APP & WEBHOOK) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedMeta(!showAdvancedMeta)}
              className="w-full p-5 sm:p-6 flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Cấu hình nâng cao Meta App & Webhook (Tùy chọn - Dành cho Developer)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Chỉ cần thiết lập khi bạn muốn dùng Meta App riêng hoặc cấu hình thủ công Webhook Callback
                  </p>
                </div>
              </div>
              <div className="text-slate-400">
                {showAdvancedMeta ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </button>

            {showAdvancedMeta && (
              <div className="p-5 sm:p-6 border-t border-slate-100 space-y-6 bg-slate-50/30">
                {/* Meta App Credentials Form */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Thông tin Meta App ID & Secret</h4>
                  <form onSubmit={handleSaveCredentials} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Meta App ID
                        </label>
                        <input
                          type="text"
                          required
                          value={inputAppId}
                          onChange={(e) => setInputAppId(e.target.value)}
                          placeholder="Ví dụ: 123456789012345"
                          className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Meta App Secret
                        </label>
                        <input
                          type="password"
                          required
                          value={inputAppSecret}
                          onChange={(e) => setInputAppSecret(e.target.value)}
                          placeholder="••••••••••••••••••••••••"
                          className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500 font-mono"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingCredentials}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      {savingCredentials ? 'Đang lưu...' : 'Lưu Meta App ID & Secret'}
                    </button>
                  </form>
                </div>

                {/* META DEVELOPER APP SETUP GUIDE */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-bold text-slate-900">Thông số kỹ thuật Webhook Meta Developer</h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Điền các URL này vào bảng điều khiển ứng dụng Meta của bạn trên developers.facebook.com:
                  </p>

                  <div className="space-y-3">
                    {/* Redirect URI */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        1. Valid OAuth Redirect URI (Điền tại: Facebook Login for Business &gt; Settings &gt; Valid OAuth Redirect URIs)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={metaSettings?.redirectUri || 'http://localhost:5000/api/meta/oauth/callback'}
                          className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 select-all"
                        />
                        <button
                          onClick={() => copyToClipboard(metaSettings?.redirectUri || '')}
                          className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                          title="Sao chép"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Webhook Callback URL */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        2. Webhook Callback URL (Điền tại: Webhooks &gt; Page &gt; Edit Callback URL)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={metaSettings?.webhookCallbackUrl || 'http://localhost:5000/api/webhook/meta'}
                          className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 select-all"
                        />
                        <button
                          onClick={() => copyToClipboard(metaSettings?.webhookCallbackUrl || '')}
                          className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                          title="Sao chép"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Webhook Verify Token */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        3. Webhook Verify Token (Điền tại: Verify Token)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={metaSettings?.verifyToken || 'zen_crm_verify_token_secure_2026'}
                          className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 select-all"
                        />
                        <button
                          onClick={() => copyToClipboard(metaSettings?.verifyToken || '')}
                          className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                          title="Sao chép"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">Các quyền (Permissions) và trường Webhook:</p>
                    <p className="font-mono text-[11px] text-brand-700">
                      pages_show_list, pages_read_engagement, pages_manage_metadata, pages_messaging, pages_read_user_content, pages_manage_posts
                    </p>
                    <p className="font-mono text-[11px] text-slate-600">
                      Webhook fields: messages, messaging_postbacks, message_reads, feed
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 max-w-xl">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Thông tin cá nhân</h3>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email (không thể thay đổi)</label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full text-xs px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912345678"
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {profileSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: PASSWORD */}
      {activeTab === 'password' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 max-w-xl">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Đổi mật khẩu tài khoản</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu hiện tại</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu mới</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={passwordSaving}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {passwordSaving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
