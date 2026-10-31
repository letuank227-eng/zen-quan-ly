import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePages } from '../context/PageContext';
import { useAuth } from '../context/AuthContext';
import { onSocketEvent } from '../services/socket';
import api from '../services/api';
import { Conversation, Message, Customer, Tag, CustomerNote } from '../types';
import { EmptyState } from '../components/Common/EmptyState';
import CustomerAvatar from '../components/Common/CustomerAvatar';
import { playMessageSound } from '../utils/sound';
import {
  MessageSquare,
  Send,
  Search,
  User,
  Clock,
  CheckCircle,
  Tag as TagIcon,
  Plus,
  Trash2,
  ChevronLeft,
  Info,
  AlertCircle,
  Layers,
  Check,
  RefreshCw,
  Image as ImageIcon,
  Camera,
  X,
  Download,
  ExternalLink,
} from 'lucide-react';

export const Messenger: React.FC = () => {
  const { user } = useAuth();
  const { selectedPageId, hasConnectedPages } = usePages();
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(searchParams.get('conversationId'));
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'resolved'>('all');

  const [staffList, setStaffList] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Synchronous ref to prevent async race conditions ("bấm người này nhảy người kia")
  const activeConvIdRef = useRef<string | null>(activeConvId);
  const initialAutoSelectedRef = useRef<boolean>(false);

  // In-memory conversation cache for instant 0ms switching without loading flicker
  const convCacheRef = useRef<
    Map<
      string,
      {
        conversation: Conversation;
        messages: Message[];
        customer: Customer | null;
      }
    >
  >(new Map());

  // Select conversation with instant cache display & race-condition cancellation
  const selectConversation = (id: string) => {
    if (!id) return;
    activeConvIdRef.current = id;
    setActiveConvId(id);
    setSearchParams({ conversationId: id });

    // Instantly mark unread as 0 in local state
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );

    // If already in memory cache, show instantly (0ms latency, zero flicker)
    const cached = convCacheRef.current.get(id);
    if (cached) {
      setActiveConversation(cached.conversation);
      setMessages(cached.messages);
      setCustomer(cached.customer);
      setLoadingChat(false);
      // Silently refresh in background
      fetchConversationDetails(id, true);
    } else {
      setLoadingChat(true);
      fetchConversationDetails(id, false);
    }
  };

  // Sync latest messages on-demand from Meta
  const handleSyncMessages = async (silent = false) => {
    try {
      if (!silent) setSyncing(true);
      await api.post('/messenger/sync', {}, {
        params: {
          pageId: selectedPageId !== 'all' ? selectedPageId : undefined,
          limit: silent ? 6 : 20,
        },
      });
      await fetchConversations(true);
      const currentId = activeConvIdRef.current;
      if (currentId) {
        await fetchConversationDetails(currentId, true);
      }
    } catch (err) {
      if (!silent) console.error('Failed to sync messages:', err);
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  // Fetch conversation list
  const fetchConversations = async (silent = false) => {
    try {
      if (!silent) setLoadingList(true);
      const res = await api.get('/messenger/conversations', {
        params: {
          pageId: selectedPageId !== 'all' ? selectedPageId : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: search.trim() || undefined,
        },
      });
      if (res.data.success) {
        const list = res.data.conversations || [];
        setConversations(list);

        // Auto select first ONLY on initial desktop mount if nothing is selected yet
        if (
          !initialAutoSelectedRef.current &&
          !activeConvIdRef.current &&
          list.length > 0 &&
          window.innerWidth >= 1024
        ) {
          initialAutoSelectedRef.current = true;
          selectConversation(list[0].id);
        }
      }
    } catch (err) {
      if (!silent) console.error('Failed to load conversations:', err);
    } finally {
      if (!silent) setLoadingList(false);
    }
  };

  // Fetch active conversation detail & messages with strict race-condition check
  const fetchConversationDetails = async (convId: string, silent = false) => {
    try {
      if (!silent && !convCacheRef.current.has(convId)) {
        setLoadingChat(true);
      }
      setErrorMsg(null);
      const res = await api.get(`/messenger/conversations/${convId}/messages`);

      // RACE CONDITION GUARD: If user has already clicked another conversation, drop this response!
      if (activeConvIdRef.current !== convId) {
        return;
      }

      if (res.data.success) {
        const conv = res.data.conversation;
        const msgs = res.data.messages || [];
        const cust = res.data.conversation.customer;

        // Save to cache
        convCacheRef.current.set(convId, {
          conversation: conv,
          messages: msgs,
          customer: cust,
        });

        setActiveConversation(conv);
        setMessages(msgs);
        setCustomer(cust);
      }
    } catch (err: any) {
      if (activeConvIdRef.current === convId && !silent) {
        console.error('Failed to load messages:', err);
        setErrorMsg(err.response?.data?.message || 'Không thể tải tin nhắn.');
      }
    } finally {
      if (activeConvIdRef.current === convId && !silent) {
        setLoadingChat(false);
      }
    }
  };

  // Fetch staff & tags for assignment
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [staffRes, tagsRes] = await Promise.all([
          api.get('/staff'),
          api.get('/tags'),
        ]);
        if (staffRes.data.success) setStaffList(staffRes.data.staff || []);
        if (tagsRes.data.success) setAllTags(tagsRes.data.tags || []);
      } catch (e) {
        // Ignore
      }
    };
    loadMetadata();
  }, []);

  // Fetch conversations on filter / page change + trigger automatic Meta sync
  useEffect(() => {
    fetchConversations();
    handleSyncMessages(true);
  }, [selectedPageId, statusFilter]);

  // High-speed silent background poll (every 2 seconds for local DB, every 10 seconds from Meta Graph API)
  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      fetchConversations(true);
      const currentId = activeConvIdRef.current;
      if (currentId) {
        fetchConversationDetails(currentId, true);
      }
      if (tick % 45 === 0) {
        handleSyncMessages(true);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [selectedPageId, statusFilter]);

  // URL query parameter synchronization
  useEffect(() => {
    const paramId = searchParams.get('conversationId');
    if (paramId && paramId !== activeConvIdRef.current) {
      selectConversation(paramId);
    }
  }, [searchParams]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime Socket listener
  useEffect(() => {
    const handleNewMessage = (data: { conversationId: string; message: Message; customer?: any; page?: any; pageId?: string }) => {
      const isCurrent = data.conversationId === activeConvIdRef.current;

      // Play "ting ting" sound if message is from a customer
      if (data.message.senderType === 'CUSTOMER') {
        playMessageSound();
      }

      // If message belongs to currently active conversation
      if (isCurrent) {
        setMessages((prev) => {
          if (
            prev.some(
              (m) =>
                m.id === data.message.id ||
                (data.message.metaMessageId && m.metaMessageId === data.message.metaMessageId)
            )
          ) {
            return prev;
          }
          return [...prev, data.message];
        });
      }

      // Update in-memory cache
      const cached = convCacheRef.current.get(data.conversationId);
      if (cached) {
        if (
          !cached.messages.some(
            (m) =>
              m.id === data.message.id ||
              (data.message.metaMessageId && m.metaMessageId === data.message.metaMessageId)
          )
        ) {
          cached.messages = [...cached.messages, data.message];
        }
        cached.conversation.snippet = data.message.text;
        cached.conversation.lastMessageAt = data.message.createdAt;
      }

      // Update snippet and bump conversation to top
      setConversations((prev) => {
        const found = prev.find((c) => c.id === data.conversationId);
        if (!found) {
          // Instantly construct and prepend brand new conversation (0ms latency!)
          const newConv: Conversation = {
            id: data.conversationId,
            pageId: data.pageId || data.page?.id || '',
            page: data.page || { id: data.pageId || '', name: 'Page', avatar: null },
            customerId: data.customer?.id || '',
            customer: data.customer || {
              id: data.customer?.id || '',
              name: data.message.senderName || 'Khách hàng',
              avatar: data.customer?.avatar || null,
              tags: [],
            },
            snippet: data.message.text,
            unreadCount: isCurrent ? 0 : 1,
            status: 'PENDING',
            lastMessageAt: data.message.createdAt,
            createdAt: data.message.createdAt,
            updatedAt: data.message.createdAt,
          };
          fetchConversations(true);
          return [newConv, ...prev];
        }

        return prev
          .map((c) =>
            c.id === data.conversationId
              ? {
                  ...c,
                  snippet: data.message.text,
                  lastMessageAt: data.message.createdAt,
                  unreadCount: isCurrent ? 0 : c.unreadCount + 1,
                }
              : c
          )
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          );
      });
    };

    const handleConversationUpdated = (data: any) => {
      setConversations((prev) =>
        prev
          .map((c) =>
            c.id === data.id
              ? {
                  ...c,
                  snippet: data.snippet !== undefined ? data.snippet : c.snippet,
                  unreadCount: data.unreadCount !== undefined ? data.unreadCount : c.unreadCount,
                  lastMessageAt: data.lastMessageAt || c.lastMessageAt,
                }
              : c
          )
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          )
      );
    };

    const handleCustomerUpdated = (updatedCust: any) => {
      if (!updatedCust?.id) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.customerId === updatedCust.id
            ? { ...c, customer: { ...c.customer, ...updatedCust } }
            : c
        )
      );
      setCustomer((prev) => (prev && prev.id === updatedCust.id ? { ...prev, ...updatedCust } : prev));
    };

    const unsubNew = onSocketEvent('new_message', handleNewMessage);
    const unsubSent = onSocketEvent('message_sent', handleNewMessage);
    const unsubUpdated = onSocketEvent('conversation_updated', handleConversationUpdated);
    const unsubCust = onSocketEvent('customer_updated', handleCustomerUpdated);

    return () => {
      unsubNew();
      unsubSent();
      unsubUpdated();
      unsubCust();
    };
  }, []);

  // SEND MESSAGE (2-Way Meta Graph API with Optimistic UI like Pancake)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConvId || sending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setErrorMsg(null);

    // Optimistic message added to chat in 0ms (instant UI feedback)
    const tempId = 'temp_' + Date.now();
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConvId,
      pageId: activeConversation?.pageId || '',
      senderType: 'PAGE',
      senderId: activeConversation?.pageId || '',
      senderName: activeConversation?.page?.name || 'Bạn',
      text: textToSend,
      createdAt: new Date().toISOString(),
      isRead: true,
      sentStatus: 'SENT',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    const cachedConv = convCacheRef.current.get(activeConvId);
    if (cachedConv) {
      cachedConv.messages = [...cachedConv.messages, optimisticMsg];
      cachedConv.conversation.snippet = textToSend;
      cachedConv.conversation.lastMessageAt = optimisticMsg.createdAt;
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId
          ? { ...c, snippet: textToSend, lastMessageAt: optimisticMsg.createdAt }
          : c
      )
    );

    try {
      setSending(true);
      const res = await api.post(`/messenger/conversations/${activeConvId}/messages`, {
        text: textToSend,
      });

      if (res.data.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? res.data.data : m))
        );
        if (cachedConv) {
          cachedConv.messages = cachedConv.messages.map((m) => (m.id === tempId ? res.data.data : m));
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, sentStatus: 'FAILED', errorMessage: 'Gửi thất bại' } : m
        )
      );
      const msg = err.response?.data?.message || 'Gửi tin nhắn thất bại. Vui lòng kiểm tra lại quyền Meta.';
      setErrorMsg(msg);
      setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  // Helper to extract image URLs from JSON attachments
  const getAttachmentUrls = (attachmentsStr?: string): { url: string; previewUrl: string; name?: string }[] => {
    if (!attachmentsStr) return [];
    try {
      const parsed = JSON.parse(attachmentsStr);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const results: { url: string; previewUrl: string; name?: string }[] = [];

      for (const item of list) {
        const url =
          item.image_data?.url ||
          item.image_data?.preview_url ||
          item.payload?.url ||
          item.file_url ||
          item.url;
        const previewUrl =
          item.image_data?.preview_url ||
          item.image_data?.url ||
          item.payload?.url ||
          item.file_url ||
          item.url;

        if (url) {
          results.push({
            url,
            previewUrl: previewUrl || url,
            name: item.name || 'Hình ảnh',
          });
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  };

  // Send an image attachment
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConvId || uploadingAttachment) return;

    // Reset input
    e.target.value = '';
    setErrorMsg(null);

    const tempId = 'temp_file_' + Date.now();
    const localPreviewUrl = URL.createObjectURL(file);

    // Optimistic message
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConvId,
      pageId: activeConversation?.pageId || '',
      senderType: 'PAGE',
      senderId: activeConversation?.pageId || '',
      senderName: activeConversation?.page?.name || 'Bạn',
      text: '[Hình ảnh]',
      attachments: JSON.stringify([
        {
          image_data: { url: localPreviewUrl, preview_url: localPreviewUrl },
          payload: { url: localPreviewUrl },
        },
      ]),
      createdAt: new Date().toISOString(),
      isRead: true,
      sentStatus: 'SENT',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    const cachedConv = convCacheRef.current.get(activeConvId);
    if (cachedConv) {
      cachedConv.messages = [...cachedConv.messages, optimisticMsg];
      cachedConv.conversation.snippet = '[Hình ảnh]';
      cachedConv.conversation.lastMessageAt = optimisticMsg.createdAt;
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId
          ? { ...c, snippet: '[Hình ảnh]', lastMessageAt: optimisticMsg.createdAt }
          : c
      )
    );

    try {
      setUploadingAttachment(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post(`/messenger/conversations/${activeConvId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? res.data.data : m)));
        if (cachedConv) {
          cachedConv.messages = cachedConv.messages.map((m) => (m.id === tempId ? res.data.data : m));
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, sentStatus: 'FAILED', errorMessage: 'Gửi ảnh thất bại' } : m
        )
      );
      const msg = err.response?.data?.message || 'Gửi ảnh thất bại qua Meta API.';
      setErrorMsg(msg);
    } finally {
      setUploadingAttachment(false);
    }
  };

  // Upload custom customer avatar
  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customer || uploadingAvatar) return;

    e.target.value = '';
    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await api.post(`/crm/${customer.id}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        const updatedCust = res.data.customer;
        setCustomer(updatedCust);
        setConversations((prev) =>
          prev.map((c) =>
            c.customerId === customer.id
              ? { ...c, customer: { ...c.customer, avatar: updatedCust.avatar } }
              : c
          )
        );
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi tải lên ảnh đại diện.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Set any image URL (e.g. from chat/lightbox) as customer avatar
  const handleSetAsAvatar = async (imageUrl: string) => {
    if (!customer) return;
    try {
      const res = await api.put(`/crm/${customer.id}`, { avatar: imageUrl });
      if (res.data.success) {
        setCustomer((prev) => prev ? { ...prev, avatar: imageUrl } : null);
        setConversations((prev) =>
          prev.map((c) =>
            c.customerId === customer.id
              ? { ...c, customer: { ...c.customer, avatar: imageUrl } }
              : c
          )
        );
        setLightboxImage(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi cập nhật ảnh đại diện.');
    }
  };

  // Update Status
  const handleStatusChange = async (newStatus: string) => {
    if (!activeConvId) return;
    try {
      const res = await api.put(`/messenger/conversations/${activeConvId}/status`, {
        status: newStatus,
      });
      if (res.data.success) {
        setActiveConversation((prev) => prev ? { ...prev, status: newStatus as any } : null);
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConvId ? { ...c, status: newStatus as any } : c))
        );
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Assign Staff
  const handleAssignStaff = async (staffId: string) => {
    if (!activeConvId) return;
    try {
      const res = await api.put(`/messenger/conversations/${activeConvId}/assign`, {
        staffId: staffId || null,
      });
      if (res.data.success) {
        const assigned = staffList.find((s) => s.id === staffId);
        setActiveConversation((prev) =>
          prev ? { ...prev, assignedUser: assigned || undefined } : null
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId ? { ...c, assignedUser: assigned || undefined } : c
          )
        );
      }
    } catch (err) {
      console.error('Failed to assign staff:', err);
    }
  };

  // Customer Notes & Tags
  const handleAddNote = async () => {
    if (!newNoteContent.trim() || !customer) return;
    try {
      const res = await api.post(`/crm/${customer.id}/notes`, { content: newNoteContent.trim() });
      if (res.data.success) {
        setCustomer((prev) =>
          prev ? { ...prev, notes: [res.data.note, ...(prev.notes || [])] } : null
        );
        setNewNoteContent('');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!customer) return;
    try {
      await api.delete(`/crm/notes/${noteId}`);
      setCustomer((prev) =>
        prev ? { ...prev, notes: (prev.notes || []).filter((n) => n.id !== noteId) } : null
      );
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleToggleTag = async (tagId: string) => {
    if (!customer) return;
    const hasTag = customer.tags?.some((t) => (t.tag as any).id === tagId);

    try {
      if (hasTag) {
        await api.delete(`/crm/tags/${customer.id}/${tagId}`);
        setCustomer((prev) =>
          prev
            ? { ...prev, tags: (prev.tags || []).filter((t) => (t.tag as any).id !== tagId) }
            : null
        );
      } else {
        await api.post('/crm/tags/attach', { customerId: customer.id, tagId });
        const addedTag = allTags.find((t) => (t as any).id === tagId);
        if (addedTag) {
          setCustomer((prev) =>
            prev ? { ...prev, tags: [...(prev.tags || []), { tag: addedTag }] } : null
          );
        }
      }
    } catch (err) {
      console.error('Failed to toggle tag:', err);
    }
  };

  if (!hasConnectedPages) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={Layers}
          title="Chưa có Page nào được kết nối"
          description="Để sử dụng hệ thống Messenger hai chiều trực tiếp từ ứng dụng, vui lòng kết nối Meta Page."
          actionText="+ Kết nối Meta Page"
          actionHref="/settings?tab=meta"
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-white">
      {/* LEFT PANE: Conversation list */}
      <div
        className={`${
          activeConvId ? 'hidden lg:flex' : 'flex'
        } flex-col w-full lg:w-80 xl:w-96 border-r border-slate-200 bg-white shrink-0`}
      >
        {/* Search & Filter Header */}
        <div className="p-3.5 border-b border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Messenger</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSyncMessages()}
                disabled={syncing}
                title="Đồng bộ tin nhắn mới nhất từ Meta"
                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 hover:text-brand-600 bg-slate-100 hover:bg-brand-50 px-2 py-1 rounded-lg transition"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin text-brand-600' : ''}`} />
                <span>{syncing ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
              <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                {conversations.length} hội thoại
              </span>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên khách..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-500 rounded-xl outline-none transition"
            />
          </div>

          {/* Status tabs */}
          <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl">
            {(['all', 'pending', 'processing', 'resolved'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`flex-1 py-1 text-[11px] font-semibold rounded-lg capitalize transition ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {st === 'all'
                  ? 'Tất cả'
                  : st === 'pending'
                  ? 'Chưa xử lý'
                  : st === 'processing'
                  ? 'Đang xử lý'
                  : 'Đã xử lý'}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingList ? (
            <div className="p-8 text-center">
              <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">Đang tải hội thoại...</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">Chưa có cuộc hội thoại nào</p>
              <p className="mt-1">Khi khách hàng gửi tin nhắn đến Page, hội thoại sẽ hiển thị tại đây.</p>
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className={`p-3.5 hover:bg-slate-50 cursor-pointer transition flex items-start gap-3 ${
                  activeConvId === c.id ? 'bg-brand-50/50 border-r-2 border-brand-600' : ''
                }`}
              >
                {/* Customer avatar */}
                <div className="relative shrink-0">
                  <CustomerAvatar name={c.customer.name} avatar={c.customer.avatar} metaId={c.customer.metaId} size="md" />
                  {c.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-600 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {c.customer.name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.snippet || 'Bắt đầu hội thoại'}</p>

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                      {c.page.name}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold ${
                        c.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : c.status === 'PROCESSING'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-brand-100 text-brand-800'
                      }`}
                    >
                      {c.status === 'PENDING' ? 'Chưa xong' : c.status === 'PROCESSING' ? 'Đang làm' : 'Đã xong'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CENTER PANE: Active Chat Thread */}
      {activeConvId ? (
        <div className="flex-1 flex flex-col h-full bg-slate-50 min-w-0">
          {/* Chat Header */}
          <div className="h-16 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Back button for mobile */}
              <button
                onClick={() => setActiveConvId(null)}
                className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <CustomerAvatar
                name={activeConversation?.customer.name}
                avatar={activeConversation?.customer.avatar}
                metaId={activeConversation?.customer.metaId}
                size="sm"
              />

              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {activeConversation?.customer.name}
                </h3>
                <p className="text-[11px] text-slate-400 truncate">
                  qua <span className="font-semibold text-slate-600">{activeConversation?.page.name}</span>
                </p>
              </div>
            </div>

            {/* Actions: Status dropdown, Assign Staff, Toggle Customer Info */}
            <div className="flex items-center gap-2">
              {/* Status Select */}
              <select
                value={activeConversation?.status || 'PENDING'}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 outline-none focus:border-brand-500"
              >
                <option value="PENDING">Chưa xử lý</option>
                <option value="PROCESSING">Đang xử lý</option>
                <option value="RESOLVED">Đã xử lý</option>
              </select>

              {/* Staff Assignment */}
              <select
                value={activeConversation?.assignedUser?.id || ''}
                onChange={(e) => handleAssignStaff(e.target.value)}
                className="hidden sm:inline-block text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-medium text-slate-700 outline-none focus:border-brand-500"
              >
                <option value="">Gán nhân viên...</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.role})
                  </option>
                ))}
              </select>

              {/* Toggle Info Drawer */}
              <button
                onClick={() => setShowInfoDrawer(!showInfoDrawer)}
                className={`p-2 rounded-xl border transition ${
                  showInfoDrawer
                    ? 'bg-brand-50 text-brand-600 border-brand-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
                title="Thông tin khách hàng"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Meta API Error Alert if sending failed */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Lỗi giao tiếp Meta API: </span>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Messages Feed */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {loadingChat ? (
              <div className="py-12 text-center text-xs text-slate-400">Đang tải cuộc trò chuyện...</div>
            ) : messages.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Chưa có tin nhắn nào trong cuộc trò chuyện này.
              </div>
            ) : (
              messages.map((m) => {
                const isFromPage = m.senderType === 'PAGE';
                const attachments = getAttachmentUrls(m.attachments);
                const showText = m.text && m.text !== '[Hình ảnh]';

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isFromPage ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-xs sm:text-sm shadow-sm ${
                        isFromPage
                          ? 'bg-brand-600 text-white rounded-br-none'
                          : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-none'
                      }`}
                    >
                      {/* Render Attachments if any */}
                      {attachments.length > 0 && (
                        <div className="space-y-2 mb-1.5">
                          {attachments.map((att, idx) => (
                            <div
                              key={idx}
                              className="relative group rounded-xl overflow-hidden border border-black/10 bg-black/5 cursor-pointer max-w-sm"
                              onClick={() => setLightboxImage(att.url)}
                            >
                              <img
                                src={att.previewUrl}
                                alt={att.name || 'Hình ảnh'}
                                className="max-h-64 w-auto rounded-xl object-contain hover:scale-[1.01] transition duration-200"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <span className="text-[11px] font-medium bg-black/70 text-white px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                                  <Search className="w-3 h-3" /> Phóng to
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Render text caption */}
                      {showText && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    </div>

                    <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-400">
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isFromPage && (
                        <span>• {m.sentStatus === 'SENT' ? 'Đã gửi qua Meta' : m.sentStatus}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Box (TWO-WAY MESSAGING & IMAGES) */}
          <div className="p-3 bg-white border-t border-slate-200">
            {/* Hidden file input for sending images */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              accept="image/*"
              className="hidden"
            />

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAttachment}
                className="p-2.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition shrink-0"
                title="Gửi hình ảnh qua Messenger"
              >
                {uploadingAttachment ? (
                  <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const file = items[i].getAsFile();
                      if (file) {
                        e.preventDefault();
                        const syntheticEvent = {
                          target: { files: [file], value: '' },
                        } as any;
                        handleFileSelected(syntheticEvent);
                        break;
                      }
                    }
                  }
                }}
                placeholder="Nhập tin nhắn... (Hỗ trợ dán ảnh trực tiếp Ctrl+V)"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-500 rounded-xl text-xs sm:text-sm outline-none transition"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold shadow-md shadow-brand-500/20 transition flex items-center justify-center gap-1 text-xs sm:text-sm disabled:opacity-50 shrink-0"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Gửi</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
            <p className="text-[10px] text-slate-400 mt-1.5 text-center">
              Tin nhắn và hình ảnh gửi đi sẽ được chuyển trực tiếp qua Meta Graph API tới Messenger của khách hàng.
            </p>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-slate-50 p-6 text-center">
          <div>
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-700">Chọn một cuộc hội thoại</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Chọn cuộc trò chuyện bên trái để xem nội dung và trả lời trực tiếp cho khách hàng.
            </p>
          </div>
        </div>
      )}

      {/* RIGHT PANE: Customer CRM Drawer */}
      {showInfoDrawer && customer && (
        <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto p-4 space-y-5 shrink-0">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Hồ sơ khách hàng</h4>
            <div className="flex items-center gap-3 mt-3">
              <div
                className="relative group cursor-pointer shrink-0"
                onClick={() => avatarInputRef.current?.click()}
                title="Bấm để tải/đổi ảnh đại diện khách hàng"
              >
                <CustomerAvatar name={customer.name} avatar={customer.avatar} metaId={customer.metaId} size="lg" />
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarSelected}
                  accept="image/*"
                  className="hidden"
                />
                <div className="absolute inset-0 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  {uploadingAvatar ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-slate-400">ID: {customer.metaId}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-semibold">
                    {customer.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="text-[10px] text-brand-600 hover:text-brand-700 font-medium hover:underline flex items-center gap-0.5"
                  >
                    <Camera className="w-3 h-3" />
                    <span>Đổi ảnh</span>
                  </button>
                </div>
                {activeConversation?.page && (
                  <a
                    href={`https://business.facebook.com/latest/inbox/messenger?asset_id=${(activeConversation.page as any).metaPageId || activeConversation.pageId}&selected_item_id=${(activeConversation as any).metaConversationId || customer.metaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-400 hover:text-brand-600 flex items-center gap-1 mt-1 transition"
                    title="Mở hộp thư Facebook Meta Business Suite"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Xem trên Business Suite</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold text-slate-800">Thẻ khách hàng (Tags)</h5>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const isAttached = customer.tags?.some((t) => (t.tag as any).id === (tag as any).id);
                return (
                  <button
                    key={(tag as any).id}
                    onClick={() => handleToggleTag((tag as any).id)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                      isAttached
                        ? 'bg-brand-600 text-white font-semibold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isAttached && <Check className="w-3 h-3" />}
                    <span>{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <h5 className="text-xs font-bold text-slate-800 mb-2">Ghi chú nhân viên</h5>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Thêm ghi chú..."
                  className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {customer.notes?.map((n) => (
                <div key={n.id} className="p-2 bg-slate-50 rounded-xl text-xs flex justify-between group">
                  <div>
                    <p className="text-slate-800">{n.content}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {n.user?.fullName} • {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteNote(n.id)}
                    className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL FOR PREVIEWING IMAGES */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-10 right-0 flex items-center gap-2 z-10">
              {customer && (
                <button
                  type="button"
                  onClick={() => handleSetAsAvatar(lightboxImage)}
                  className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition flex items-center gap-1.5 text-xs font-semibold shadow"
                  title="Đặt ảnh này làm ảnh đại diện cho khách hàng"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Đặt làm avatar khách</span>
                </button>
              )}
              <a
                href={lightboxImage}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition flex items-center gap-1 text-xs"
                title="Tải ảnh gốc về máy"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về</span>
              </a>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={lightboxImage}
              alt="Hình ảnh đính kèm"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl bg-black/40"
            />
          </div>
        </div>
      )}
    </div>
  );
};
