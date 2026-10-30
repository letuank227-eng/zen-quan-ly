import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';
import { PageSummary } from '../types';

interface PageContextType {
  pages: PageSummary[];
  selectedPageId: string; // 'all' or specific page id
  selectedPage: PageSummary | null;
  loadingPages: boolean;
  setSelectedPageId: (id: string) => void;
  refreshPages: () => Promise<void>;
  hasConnectedPages: boolean;
}

const PageContext = createContext<PageContextType | undefined>(undefined);

export const PageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('all');
  const [loadingPages, setLoadingPages] = useState<boolean>(true);

  const refreshPages = useCallback(async () => {
    if (!user) {
      setPages([]);
      setLoadingPages(false);
      return;
    }
    try {
      setLoadingPages(true);
      const res = await api.get('/pages');
      if (res.data.success) {
        setPages(res.data.pages || []);
      }
    } catch (err) {
      console.error('Failed to fetch pages:', err);
    } finally {
      setLoadingPages(false);
    }
  }, [user]);

  useEffect(() => {
    refreshPages();
  }, [refreshPages]);

  // Realtime updates when meta status or pages change
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMetaChanged = () => {
      refreshPages();
    };

    socket.on('meta_status_changed', handleMetaChanged);
    return () => {
      socket.off('meta_status_changed', handleMetaChanged);
    };
  }, []);

  const selectedPage = pages.find((p) => p.id === selectedPageId) || null;
  const hasConnectedPages = pages.length > 0;

  return (
    <PageContext.Provider
      value={{
        pages,
        selectedPageId,
        selectedPage,
        loadingPages,
        setSelectedPageId,
        refreshPages,
        hasConnectedPages,
      }}
    >
      {children}
    </PageContext.Provider>
  );
};

export function usePages() {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error('usePages must be used within a PageProvider');
  }
  return context;
}
