import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePages } from '../../context/PageContext';
import { useNotifications } from '../../context/NotificationContext';
import { PageSelector } from './PageSelector';
import { Menu, Bell, CheckCircle2, AlertCircle, RefreshCw, Check, Volume2, VolumeX, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

interface NavbarProps {
  onToggleMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileMenu }) => {
  const { user } = useAuth();
  const { refreshPages, loadingPages } = usePages();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    soundEnabled,
    toggleSound,
    testSound,
  } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [soundToast, setSoundToast] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const handleToggleSound = () => {
    toggleSound();
    setSoundToast(!soundEnabled ? '🔔 Đã BẬT âm thanh Ting-Ting!' : '🔇 Đã TẮT âm thanh thông báo');
    setTimeout(() => setSoundToast(null), 2500);
  };

  const handleTestSound = () => {
    testSound();
    setSoundToast('🔔 Đang phát thử âm thanh Ting-Ting...');
    setTimeout(() => setSoundToast(null), 2500);
  };

  const handleSimulateIncoming = async (type: 'message' | 'comment') => {
    try {
      await api.post('/notifications/test-incoming', { type });
      setSoundToast(type === 'message' ? '💬 Nhận tin nhắn khách hàng giả lập!' : '📝 Nhận bình luận khách hàng giả lập!');
      setTimeout(() => setSoundToast(null), 3000);
    } catch (err: any) {
      console.error('Failed to simulate:', err);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 relative">
      {soundToast && (
        <div className="absolute top-18 right-6 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 transition-all">
          <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>{soundToast}</span>
        </div>
      )}
      {/* Left side: Hamburger for mobile + Page Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-none"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <PageSelector />

        <button
          onClick={() => refreshPages()}
          disabled={loadingPages}
          title="Làm mới danh sách Page"
          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition hidden sm:inline-flex"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingPages ? 'animate-spin text-brand-600' : ''}`} />
        </button>
      </div>

      {/* Right side: Meta status, Notifications, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Meta Status Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-100 bg-slate-50">
          {user?.metaConnected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
              <span className="text-slate-700">Meta: {user.metaUser?.metaUserName || 'Đã kết nối'}</span>
            </>
          ) : (
            <Link to="/settings?tab=meta" className="flex items-center gap-1.5 text-amber-700 hover:underline">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Chưa kết nối Meta</span>
            </Link>
          )}
        </div>

        {/* Sound Toggle (Ting-ting) */}
        <button
          onClick={handleToggleSound}
          className={`p-2 rounded-xl transition flex items-center justify-center ${
            soundEnabled
              ? 'text-brand-600 hover:text-brand-700 hover:bg-brand-50 bg-brand-50/60'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
          title={
            soundEnabled
              ? 'Âm thanh thông báo (Ting-ting): Đang BẬT - Bấm để tắt'
              : 'Âm thanh thông báo (Ting-ting): Đang TẮT - Bấm để bật'
          }
          aria-label="Toggle Sound"
        >
          {soundEnabled ? (
            <Volume2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <VolumeX className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 relative transition"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-100 z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">Thông báo</h4>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-700">
                      {unreadCount} mới
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestSound}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition flex items-center gap-1"
                    title="Bấm để thử âm thanh ting-ting"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Thử tiếng</span>
                  </button>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllAsRead()}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Đọc hết
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Chưa có thông báo nào.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => !n.isRead && markAsRead(n.id)}
                      className={`p-3 text-xs cursor-pointer hover:bg-slate-50 transition flex items-start gap-2.5 ${
                        !n.isRead ? 'bg-brand-50/40' : ''
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          !n.isRead ? 'bg-brand-600' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-slate-900 ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>
                          {n.title}
                        </p>
                        <p className="text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Test Realtime Actions */}
              <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => handleSimulateIncoming('message')}
                  className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
                  title="Giả lập nhận tin nhắn khách hàng qua Socket để thử chuông Ting-Ting"
                >
                  <Zap className="w-3 h-3" />
                  <span>Test nhận tin nhắn</span>
                </button>
                <button
                  onClick={() => handleSimulateIncoming('comment')}
                  className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                  title="Giả lập nhận bình luận khách hàng qua Socket để thử chuông"
                >
                  <span>Test nhận bình luận</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <Link
          to="/settings"
          className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition"
        >
          <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {user?.fullName?.[0]?.toUpperCase() || 'U'}
          </div>
        </Link>
      </div>
    </header>
  );
};
