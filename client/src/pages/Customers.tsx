import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Customer, Tag } from '../types';
import {
  Users,
  Search,
  Filter,
  Tag as TagIcon,
  Phone,
  Mail,
  Clock,
  Plus,
  Trash2,
  X,
  Check,
  ChevronRight,
  MessageSquare,
  MessageCircle,
  RefreshCw,
  Camera,
} from 'lucide-react';
import CustomerAvatar from '../components/Common/CustomerAvatar';

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Customer Detail Drawer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newNote, setNewNote] = useState('');

  // New Tag Creation Modal
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#10B981');
  const [showTagModal, setShowTagModal] = useState(false);
  const [refreshingMeta, setRefreshingMeta] = useState(false);

  const handleRefreshMetaProfile = async () => {
    if (!selectedCustomerId || refreshingMeta) return;
    try {
      setRefreshingMeta(true);
      const res = await api.post(`/crm/customers/${selectedCustomerId}/refresh-profile`);
      if (res.data.customer) {
        setCustomerDetail(res.data.customer);
        setCustomers((prev) =>
          prev.map((c) => (c.id === selectedCustomerId ? { ...c, ...res.data.customer } : c))
        );
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể đồng bộ ảnh và thông tin từ Meta.');
    } finally {
      setRefreshingMeta(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/crm', {
        params: {
          search: search.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          tagId: tagFilter !== 'all' ? tagFilter : undefined,
        },
      });
      if (res.data.success) {
        setCustomers(res.data.customers || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await api.get('/tags');
      if (res.data.success) setAllTags(res.data.tags || []);
    } catch (e) {
      // Ignore
    }
  };

  const fetchCustomerDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await api.get(`/crm/${id}`);
      if (res.data.success) {
        setCustomerDetail(res.data.customer);
      }
    } catch (err) {
      console.error('Failed to load customer detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchTags();
  }, [statusFilter, tagFilter]);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerDetail(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCustomers();
  };

  // Add Note
  const handleAddNote = async () => {
    if (!newNote.trim() || !customerDetail) return;
    try {
      const res = await api.post(`/crm/${customerDetail.id}/notes`, { content: newNote.trim() });
      if (res.data.success) {
        setNewNote('');
        fetchCustomerDetail(customerDetail.id);
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  // Delete Note
  const handleDeleteNote = async (noteId: string) => {
    if (!customerDetail) return;
    try {
      await api.delete(`/crm/notes/${noteId}`);
      fetchCustomerDetail(customerDetail.id);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Toggle Tag on Customer
  const handleToggleCustomerTag = async (tagId: string) => {
    if (!customerDetail) return;
    const hasTag = customerDetail.tags?.some((t) => (t.tag as any).id === tagId);

    try {
      if (hasTag) {
        await api.delete(`/crm/tags/${customerDetail.id}/${tagId}`);
      } else {
        await api.post('/crm/tags/attach', { customerId: customerDetail.id, tagId });
      }
      fetchCustomerDetail(customerDetail.id);
      fetchCustomers();
    } catch (err) {
      console.error('Failed to toggle customer tag:', err);
    }
  };

  // Create New Tag
  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      const res = await api.post('/tags', { name: newTagName.trim(), color: newTagColor });
      if (res.data.success) {
        setNewTagName('');
        setShowTagModal(false);
        fetchTags();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi tạo thẻ.');
    }
  };

  // Update Status
  const handleUpdateStatus = async (status: string) => {
    if (!customerDetail) return;
    try {
      await api.put(`/crm/${customerDetail.id}`, { status });
      setCustomerDetail((prev) => prev ? { ...prev, status: status as any } : null);
      fetchCustomers();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Upload custom customer avatar
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customerDetail || uploadingAvatar) return;
    e.target.value = '';
    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.post(`/crm/${customerDetail.id}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setCustomerDetail(res.data.customer);
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerDetail.id ? { ...c, avatar: res.data.customer.avatar } : c))
        );
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi tải ảnh đại diện.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Quản lý khách hàng (CRM)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Hồ sơ khách hàng tự động lưu trữ từ các tương tác Messenger và Bình luận
          </p>
        </div>

        <button
          onClick={() => setShowTagModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl transition shrink-0"
        >
          <TagIcon className="w-3.5 h-3.5" />
          <span>+ Quản lý thẻ tag</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Status Dropdown */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-semibold text-slate-700 outline-none focus:border-brand-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="NEW">Khách mới</option>
            <option value="POTENTIAL">Tiềm năng</option>
            <option value="PURCHASED">Đã mua hàng</option>
            <option value="VIP">VIP</option>
            <option value="CARE_NEEDED">Cần chăm sóc</option>
            <option value="COMPLAINT">Khiếu nại</option>
          </select>

          {/* Tag Dropdown */}
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-700 outline-none focus:border-brand-500"
          >
            <option value="all">Tất cả thẻ tag</option>
            {allTags.map((t) => (
              <option key={t.name} value={(t as any).id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, SĐT, email..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-500 rounded-xl outline-none transition"
          />
        </form>
      </div>

      {/* Customers Table / Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Đang tải khách hàng...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Chưa có khách hàng nào</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Khi khách hàng nhắn tin hoặc bình luận trên Page, hồ sơ khách hàng sẽ tự động được ghi nhận tại đây.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {customers.map((cust) => (
              <div
                key={cust.id}
                onClick={() => setSelectedCustomerId(cust.id)}
                className="p-4 hover:bg-slate-50/80 cursor-pointer transition flex items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <CustomerAvatar name={cust.name} avatar={cust.avatar} size="md" />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 group-hover:text-brand-700 transition">
                        {cust.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full font-semibold bg-brand-50 text-brand-700">
                        {cust.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                      <span>ID Meta: {cust.metaId}</span>
                      {cust.phone && <span>• SĐT: {cust.phone}</span>}
                    </div>

                    {/* Tags */}
                    {cust.tags && cust.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {cust.tags.map((t) => (
                          <span
                            key={t.tag.name}
                            className="text-[9px] px-1.5 py-0.2 rounded font-semibold text-white"
                            style={{ backgroundColor: t.tag.color || '#10B981' }}
                          >
                            {t.tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    {new Date(cust.lastInteractionAt).toLocaleDateString()}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Detail Drawer */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">Chi tiết khách hàng</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshMetaProfile}
                  disabled={refreshingMeta}
                  className="px-2.5 py-1 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg flex items-center gap-1.5 transition border border-brand-200 disabled:opacity-60"
                  title="Đồng bộ ảnh đại diện và tên mới nhất từ Meta"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingMeta ? 'animate-spin' : ''}`} />
                  <span>{refreshingMeta ? 'Đang tải...' : 'Làm mới từ Meta'}</span>
                </button>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            {detailLoading || !customerDetail ? (
              <div className="p-12 text-center text-xs text-slate-400">Đang tải hồ sơ...</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* Profile Header */}
                <div className="flex items-center gap-3.5">
                  <div
                    className="relative group cursor-pointer shrink-0"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Bấm để tải/đổi ảnh đại diện khách hàng"
                  >
                    <CustomerAvatar
                      name={customerDetail.name}
                      avatar={customerDetail.avatar}
                      size="xl"
                      shape="rounded"
                    />
                    <input
                      type="file"
                      ref={avatarInputRef}
                      onChange={handleAvatarUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <div className="absolute inset-0 bg-black/40 text-white rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      {uploadingAvatar ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{customerDetail.name}</h2>
                    <p className="text-xs text-slate-400">ID Meta: {customerDetail.metaId}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <select
                        value={customerDetail.status}
                        onChange={(e) => handleUpdateStatus(e.target.value)}
                        className="text-xs font-semibold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 outline-none text-slate-700"
                      >
                        <option value="NEW">Khách mới</option>
                        <option value="POTENTIAL">Tiềm năng</option>
                        <option value="PURCHASED">Đã mua</option>
                        <option value="VIP">VIP</option>
                        <option value="CARE_NEEDED">Cần chăm sóc</option>
                        <option value="COMPLAINT">Khiếu nại</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="text-[11px] text-brand-600 hover:text-brand-700 font-medium hover:underline flex items-center gap-0.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Đổi ảnh</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tags Section */}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 mb-2">Thẻ khách hàng</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => {
                      const isAttached = customerDetail.tags?.some(
                        (t) => (t.tag as any).id === (tag as any).id
                      );
                      return (
                        <button
                          key={(tag as any).id}
                          onClick={() => handleToggleCustomerTag((tag as any).id)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
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

                {/* Notes Section */}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 mb-2">Ghi chú chăm sóc</h4>
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Thêm thông tin cần nhớ về khách..."
                      className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
                    />
                    <button
                      onClick={handleAddNote}
                      className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold"
                    >
                      Thêm
                    </button>
                  </div>

                  <div className="space-y-2">
                    {customerDetail.notes?.map((n) => (
                      <div key={n.id} className="p-3 bg-slate-50 rounded-xl text-xs flex justify-between group">
                        <div>
                          <p className="text-slate-800">{n.content}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {n.user?.fullName} • {new Date(n.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          className="text-slate-400 hover:text-red-600 p-1 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Tạo thẻ tag khách hàng mới</h3>
            <form onSubmit={handleCreateTag} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên thẻ</label>
                <input
                  type="text"
                  required
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Ví dụ: Khách sỉ, Cần gọi lại..."
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Màu sắc</label>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTagModal(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm"
                >
                  Tạo thẻ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
