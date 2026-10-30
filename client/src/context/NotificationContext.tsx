import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { onSocketEvent } from '../services/socket';
import { useAuth } from './AuthContext';
import { NotificationItem } from '../types';
import {
  playMessageSound,
  playCommentSound,
  playNotificationSound,
  isSoundEnabled,
  setSoundEnabled as saveSoundEnabled,
  testTingTingSound,
} from '../utils/sound';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  soundEnabled: boolean;
  toggleSound: () => void;
  testSound: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(isSoundEnabled);

  const toggleSound = () => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      saveSoundEnabled(next);
      if (next) {
        testTingTingSound();
      }
      return next;
    });
  };

  const testSound = () => {
    if (!soundEnabled) {
      setSoundEnabledState(true);
      saveSoundEnabled(true);
    }
    testTingTingSound();
  };

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  // Listen for realtime notifications, messages & comments to play "ting ting"
  useEffect(() => {
    const handleNewNotification = (notif: NotificationItem) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((prev) => prev + 1);
      // Play ting-ting notification sound
      playNotificationSound();
    };

    const handleNewMessage = (payload: any) => {
      // Don't play if it's an echo from our own page sending
      if (payload?.message?.senderType === 'PAGE') return;
      playMessageSound();
    };

    const handleNewComment = () => {
      playCommentSound();
    };

    const unsubNotification = onSocketEvent('notification', handleNewNotification);
    const unsubMessage = onSocketEvent('new_message', handleNewMessage);
    const unsubComment = onSocketEvent('new_comment', handleNewComment);

    return () => {
      unsubNotification();
      unsubMessage();
      unsubComment();
    };
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        soundEnabled,
        toggleSound,
        testSound,
        markAsRead,
        markAllAsRead,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
