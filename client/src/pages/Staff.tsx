import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePages } from '../context/PageContext';
import api from '../services/api';
import {
  UserCheck,
  UserPlus,
  Shield,
  Clock,
  Lock,
  Unlock,
  Check,
  X,
  FileText,
} from 'lucide-react';

export const Staff: React.FC = () => {
  const { user } = useAuth();
  const { pages } = usePages();

  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'staff' | 'logs'>('staff');
  const [loading, setLoading] = useState(true);

  // Add staff modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'STAFF'>('STAFF');
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await api.get('/staff');
      if (res.data.success) {
        setStaff(res.data.staff || []);
      }
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/staff/audit-logs');
      if (res.data.success) {
        setLogs(res.data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  useEffect(() => {
    fetchStaff();
    if (user?.role === 'ADMIN') {
      fetchLogs();
    }
  }, []);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);

    try {
      const res = await api.post('/staff', {
        email,
        password,
        fullName,
        phone,
        role,
        assignedPageIds: selectedPages,
      });

      if (res.data.success) {
        setShowAddModal(false);
        setEmail('');
        setPassword('');
        setFullName('');
        setPhone('');
        setSelectedPages([]);
        fetchStaff();
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Thêm nhân viên thất bại.');
    } finally {
      setModalLoading(false);
    }
  };

  const togglePageSelection = (pageId: string) => {
    setSelectedPages((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  const handleToggleLock = async (staffMember: any) => {
    try {
      await api.put(`/staff/${staffMember.id}`, {
        isActive: !staffMember.isActive,
      });
      fetchStaff();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi cập nhật trạng thái nhân viên.');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Nhân viên & Phân quyền
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý đội ngũ nhân viên, phân công quyền hạn và giám sát hoạt động
          </p>
        </div>

        {user?.role === 'ADMIN' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/20 transition shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Thêm nhân viên mới</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('staff')}
          className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
            activeTab === 'staff'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Danh sách nhân viên ({staff.length})</span>
        </button>

        {user?.role === 'ADMIN' && (
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'logs'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Nhật ký hoạt động (Audit Logs)</span>
          </button>
        )}
      </div>

      {activeTab === 'staff' ? (
        /* Staff List */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {staff.map((member) => (
              <div
                key={member.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0">
                    {member.fullName[0]?.toUpperCase() || 'U'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{member.fullName}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          member.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800'
                            : member.role === 'MANAGER'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {member.role}
                      </span>
                      {!member.isActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                          Đã khóa
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{member.email}</span>
                      {member.phone && <span>• SĐT: {member.phone}</span>}
                    </div>

                    {/* Assigned Pages */}
                    {member.pagePermissions && member.pagePermissions.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] text-slate-400">Page phụ trách:</span>
                        {member.pagePermissions.map((perm: any) => (
                          <span
                            key={perm.page.id}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium"
                          >
                            {perm.page.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {user?.role === 'ADMIN' && member.id !== user.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleLock(member)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                        member.isActive
                          ? 'text-red-700 bg-red-50 hover:bg-red-100'
                          : 'text-brand-700 bg-brand-50 hover:bg-brand-100'
                      }`}
                    >
                      {member.isActive ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Khóa tài khoản</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Mở khóa</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Audit Logs */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Lịch sử hoạt động của hệ thống</h3>
          {logs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">Chưa có nhật ký hoạt động nào.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {log.user?.fullName || 'Hệ thống'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 font-mono text-slate-700">
                        {log.action}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{log.details || log.targetType}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Thêm nhân viên mới</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAddStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn B"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email đăng nhập</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nhanvien@zen.vn"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu khởi tạo</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu cho nhân viên"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vai trò</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-slate-700 focus:border-brand-500"
                >
                  <option value="STAFF">STAFF (Chỉ xử lý Inbox & Khách hàng)</option>
                  <option value="MANAGER">MANAGER (Quản lý Inbox, Bài viết, Quảng cáo)</option>
                  <option value="ADMIN">ADMIN (Toàn quyền quản trị)</option>
                </select>
              </div>

              {/* Page selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phân quyền Page quản lý
                </label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {pages.length === 0 ? (
                    <p className="text-[11px] text-slate-400">Chưa có Page kết nối để phân quyền.</p>
                  ) : (
                    pages.map((p) => {
                      const isSelected = selectedPages.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => togglePageSelection(p.id)}
                          className="flex items-center gap-2 cursor-pointer text-xs text-slate-800 p-1 hover:bg-white rounded-lg transition"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                          <span>{p.name}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {modalLoading ? 'Đang thêm...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
