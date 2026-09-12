import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, Plus, Edit2, Trash2, Key, Search,
  RefreshCw, X, ChevronDown, Check, AlertCircle,
  Lock, Unlock, Eye, EyeOff, ClipboardList, Camera,
  MapPin, Building2, Smartphone, Monitor, Activity,
  UserCheck, UserX, ChevronRight, Info
} from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';

// ─── Role Badge ───────────────────────────────────────────────────────────────
const RoleBadge = ({ role }) => {
  const map = {
    superadmin: 'bg-purple-100 text-purple-800 border-purple-200',
    admin:      'bg-blue-100 text-blue-800 border-blue-200',
    manager:    'bg-indigo-100 text-indigo-800 border-indigo-200',
    guard:      'bg-green-100 text-green-800 border-green-200',
    employee:   'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border capitalize ${map[role] || map.employee}`}>
      {role}
    </span>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ isActive }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
    isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
  }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
    {isActive ? 'Active' : 'Inactive'}
  </span>
);

// ─── Account Type Badge ───────────────────────────────────────────────────────
const TypeBadge = ({ isPortal }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
    isPortal ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  }`}>
    {isPortal ? <Monitor size={10} /> : <Smartphone size={10} />}
    {isPortal ? 'Portal' : 'Mobile'}
  </span>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
    </div>
  </div>
);

// ─── Permission Toggle ────────────────────────────────────────────────────────
const PermToggle = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <div
      onClick={onChange}
      className={`w-10 h-5.5 rounded-full relative transition-colors cursor-pointer ${checked ? 'bg-[#2b4594]' : 'bg-slate-300'}`}
      style={{ width: 40, height: 22 }}
    >
      <div className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        style={{ width: 18, height: 18, top: 2, left: checked ? 20 : 2 }}
      />
    </div>
  </label>
);

// ─── Main Super Admin Page ────────────────────────────────────────────────────
const SuperAdminPage = () => {
  const [tab, setTab] = useState('accounts'); // 'accounts' | 'audit'
  const [accounts, setAccounts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [sites, setSites] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState(null);
  const [showAuditDetail, setShowAuditDetail] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [createForm, setCreateForm] = useState({
    account_type: 'mobile',
    role: 'guard',
    first_name: '', last_name: '',
    email: '', phone: '', password: '',
    company: '', organization: '', site_id: '',
  });

  // Edit form
  const [editForm, setEditForm] = useState({});

  // Permission editor state
  const [permForm, setPermForm] = useState({
    allowed_sites: [],
    allowed_cameras: [],
    module_permissions: {
      can_view_cameras: true,
      can_manage_cameras: false,
      can_edit_reports: false,
      can_delete_reports: false,
      can_export_reports: true,
      can_approve_guards: true,
    },
  });

  // Audit log filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('');

  // ─── Fetch accounts ─────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/accounts');
      setAccounts(res.data.accounts || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch audit logs ────────────────────────────────────────────────────
  const fetchAuditLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: 150 });
      if (auditSearch) params.append('search', auditSearch);
      if (auditAction) params.append('action', auditAction);
      const res = await api.get(`/superadmin/audit-logs?${params}`);
      setAuditLogs(res.data.logs || []);
    } catch (err) {
      toast.error('Failed to load audit logs');
    }
  }, [auditSearch, auditAction]);

  // ─── Fetch sites and cameras for permission editor ───────────────────────
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [sitesRes, camsRes] = await Promise.all([
          api.get('/projects'),
          api.get('/cameras'),
        ]);
        setSites(sitesRes.data || []);
        setCameras(camsRes.data || []);
      } catch { /* silently fail */ }
    };
    fetchMeta();
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { if (tab === 'audit') fetchAuditLogs(); }, [tab, fetchAuditLogs]);

  // ─── Create account ──────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (createForm.password.length < 8) return toast.error('Password must be at least 8 characters');
    setSaving(true);
    try {
      await api.post('/superadmin/accounts', createForm);
      toast.success('Account created successfully');
      setShowCreateModal(false);
      setCreateForm({ account_type: 'mobile', role: 'guard', first_name: '', last_name: '', email: '', phone: '', password: '', company: '', organization: '', site_id: '' });
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  // ─── Edit account ────────────────────────────────────────────────────────
  const openEdit = (acc) => {
    setEditingAccount(acc);
    setEditForm({
      first_name: acc.first_name || '',
      last_name: acc.last_name || '',
      email: acc.email || '',
      phone: acc.phone || '',
      role: acc.role || '',
      company: acc.company || '',
      organization: acc.organization || '',
      site_id: acc.site_id ? String(acc.site_id) : '',
      is_active: acc.isActive,
      password: '',
    });
    setShowPassword(false);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (!payload.password || payload.password.trim() === '') delete payload.password;
      await api.put(`/superadmin/accounts/${editingAccount.id}`, payload);
      toast.success('Account updated successfully');
      setEditingAccount(null);
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update account');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete account ──────────────────────────────────────────────────────
  const handleDelete = async (acc) => {
    if (!window.confirm(`Permanently delete account "${acc.email}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/superadmin/accounts/${acc.id}`);
      toast.success('Account deleted');
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete account');
    }
  };

  // ─── Open permission editor ──────────────────────────────────────────────
  const openPermissions = (acc) => {
    setEditingPermissions(acc);
    const gp = acc.granularPermissions || {};
    setPermForm({
      allowed_sites: (gp.allowed_sites || gp.allowedSites || []).map(String),
      allowed_cameras: (gp.allowed_cameras || gp.allowedCameras || []).map(String),
      module_permissions: {
        // Until an override is saved, the normal policy is Manager/Admin only.
        can_view_cameras:   typeof (gp.camera_access_override ?? gp.cameraAccessOverride) === 'boolean'
          ? (gp.camera_access_override ?? gp.cameraAccessOverride)
          : ['manager', 'admin', 'superadmin'].includes(acc.role),
        can_manage_cameras: gp.module_permissions?.can_manage_cameras ?? gp.modulePermissions?.can_manage_cameras ?? false,
        can_edit_reports:   gp.module_permissions?.can_edit_reports   ?? gp.modulePermissions?.can_edit_reports   ?? false,
        can_delete_reports: gp.module_permissions?.can_delete_reports ?? gp.modulePermissions?.can_delete_reports ?? false,
        can_export_reports: gp.module_permissions?.can_export_reports ?? gp.modulePermissions?.can_export_reports ?? true,
        can_approve_guards: gp.module_permissions?.can_approve_guards ?? gp.modulePermissions?.can_approve_guards ?? true,
      },
    });
  };

  const handleSavePermissions = async () => {
    if (!editingPermissions) return;
    setSaving(true);
    try {
      await api.put(`/superadmin/accounts/${editingPermissions.id}/permissions`, permForm);
      toast.success('Permissions updated');
      setEditingPermissions(null);
      fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle site in permission form ─────────────────────────────────────
  const toggleSite = (id) => {
    const s = String(id);
    setPermForm(p => ({
      ...p,
      allowed_sites: p.allowed_sites.includes(s)
        ? p.allowed_sites.filter(x => x !== s)
        : [...p.allowed_sites, s],
    }));
  };

  const toggleCamera = (id) => {
    const s = String(id);
    setPermForm(p => ({
      ...p,
      allowed_cameras: p.allowed_cameras.includes(s)
        ? p.allowed_cameras.filter(x => x !== s)
        : [...p.allowed_cameras, s],
    }));
  };

  // ─── Filtered account list ───────────────────────────────────────────────
  const filtered = accounts.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) || a.siteName?.toLowerCase().includes(q);
    const matchRole = filterRole === 'all' || a.role === filterRole;
    const matchType = filterType === 'all' || (filterType === 'portal' ? a.isPortal : !a.isPortal);
    return matchSearch && matchRole && matchType;
  });

  // Stats
  const totalAccounts = accounts.length;
  const portalAccounts = accounts.filter(a => a.isPortal).length;
  const mobileAccounts = accounts.filter(a => !a.isPortal).length;
  const activeAccounts = accounts.filter(a => a.isActive).length;

  const logActionLabel = (action) => {
    const map = {
      create_account: '➕ Created account',
      update_account: '✏️ Updated account',
      delete_account: '🗑️ Deleted account',
      update_permissions: '🔑 Changed permissions',
      edit_visit: '📝 Edited visit',
      delete_visit: '🗑️ Deleted visit',
      edit_delivery: '📝 Edited delivery',
      delete_delivery: '🗑️ Deleted delivery',
    };
    return map[action] || action;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#1e1560] to-[#2b4594] p-6 rounded-2xl shadow-lg text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Shield size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">Super Admin Console</h1>
            <p className="text-sm text-blue-200 mt-0.5">System-wide control · All accounts · Permissions · Audit trail</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-[#2b4594] text-sm font-bold rounded-xl shadow hover:bg-blue-50 transition-all"
        >
          <Plus size={16} /> Create Account
        </button>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users}     label="Total Accounts"   value={totalAccounts}  color="bg-[#2b4594]" />
        <StatCard icon={Monitor}   label="Portal Accounts"  value={portalAccounts} color="bg-slate-600" />
        <StatCard icon={Smartphone} label="Mobile Accounts" value={mobileAccounts} color="bg-amber-500" />
        <StatCard icon={UserCheck} label="Active Accounts"  value={activeAccounts} color="bg-emerald-500" />
      </div>

      {/* ── Tab Switcher ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[['accounts', Users, 'Accounts'], ['audit', ClipboardList, 'Audit Log']].map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id ? 'bg-white text-[#2b4594] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ ACCOUNTS TAB ═══════════════════════════ */}
      {tab === 'accounts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, site..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#2b4594] focus:outline-none bg-slate-50"
              />
            </div>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:border-[#2b4594] focus:outline-none font-medium">
              <option value="all">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="guard">Guard</option>
              <option value="employee">Employee</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:border-[#2b4594] focus:outline-none font-medium">
              <option value="all">All Types</option>
              <option value="portal">Portal</option>
              <option value="mobile">Mobile</option>
            </select>
            <button onClick={fetchAccounts} className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center p-16">
              <RefreshCw size={28} className="animate-spin text-[#2b4594]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center text-slate-500">
              <Users size={36} className="mb-3 text-slate-300" />
              <p className="font-semibold">No accounts found</p>
              <p className="text-sm mt-1">Adjust your filters or create a new account</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Account</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Site</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(acc => (
                    <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2b4594] to-[#4b6fd4] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(acc.name || acc.email || '?').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">{acc.name || acc.email?.split('@')[0]}</p>
                            <p className="text-xs text-slate-500">{acc.email}</p>
                            {acc.company && <p className="text-xs text-slate-400">{acc.company}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><RoleBadge role={acc.role} /></td>
                      <td className="px-4 py-3.5 hidden md:table-cell"><TypeBadge isPortal={acc.isPortal} /></td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className="text-xs text-slate-600">{acc.siteName || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge isActive={acc.isActive} /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openPermissions(acc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                            title="Edit Permissions"
                          >
                            <Key size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(acc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#2b4594] hover:bg-blue-50 transition-colors"
                            title="Edit Account"
                          >
                            <Edit2 size={14} />
                          </button>
                          {!acc.isPrimarySuperAdmin && (
                            <button
                              onClick={() => handleDelete(acc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete Account"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                Showing {filtered.length} of {accounts.length} accounts
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ AUDIT LOG TAB ══════════════════════════ */}
      {tab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchAuditLogs()}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#2b4594] focus:outline-none bg-slate-50"
              />
            </div>
            <select value={auditAction} onChange={e => setAuditAction(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:border-[#2b4594] focus:outline-none font-medium">
              <option value="">All Actions</option>
              <option value="create_account">Create Account</option>
              <option value="update_account">Update Account</option>
              <option value="delete_account">Delete Account</option>
              <option value="update_permissions">Update Permissions</option>
              <option value="edit_visit">Edit Visit</option>
              <option value="delete_visit">Delete Visit</option>
              <option value="edit_delivery">Edit Delivery</option>
              <option value="delete_delivery">Delete Delivery</option>
            </select>
            <button onClick={fetchAuditLogs} className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>

          {auditLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-slate-500">
              <ClipboardList size={36} className="mb-3 text-slate-300" />
              <p className="font-semibold">No audit log entries found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.map(log => (
                <div key={log._id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{logActionLabel(log.action)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{log.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] text-slate-400">By <strong className="text-slate-600">{log.actorName || log.actorEmail}</strong></span>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                        {log.ipAddress && (
                          <><span className="text-[11px] text-slate-400">·</span>
                          <span className="text-[11px] text-slate-400">IP: {log.ipAddress}</span></>
                        )}
                      </div>
                    </div>
                    {(log.beforeState || log.afterState) && (
                      <button
                        onClick={() => setShowAuditDetail(log)}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-[#2b4594] hover:bg-blue-50 transition-colors"
                        title="View Details"
                      >
                        <Info size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ CREATE ACCOUNT MODAL ═══════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#1e1560] to-[#2b4594]">
              <div className="flex items-center gap-2 text-white">
                <Plus size={18} />
                <h3 className="text-lg font-bold">Create New Account</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Account Type */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Account Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['portal', 'Portal (Web)', Monitor], ['mobile', 'Mobile App', Smartphone]].map(([val, lbl, Icon]) => (
                    <button
                      key={val} type="button"
                      onClick={() => setCreateForm(f => ({
                        ...f, account_type: val,
                        role: val === 'portal' ? 'admin' : 'guard',
                      }))}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                        createForm.account_type === val
                          ? 'border-[#2b4594] bg-blue-50 text-[#2b4594]'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={16} /> {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Role *</label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none"
                >
                  {createForm.account_type === 'portal'
                    ? <><option value="admin">Admin</option><option value="superadmin">Super Admin</option></>
                    : <><option value="guard">Guard</option><option value="manager">Manager</option><option value="employee">Employee</option></>
                  }
                </select>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">First Name</label>
                  <input type="text" placeholder="John"
                    value={createForm.first_name} onChange={e => setCreateForm(f => ({ ...f, first_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Last Name</label>
                  <input type="text" placeholder="Smith"
                    value={createForm.last_name} onChange={e => setCreateForm(f => ({ ...f, last_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Email *</label>
                <input type="email" required placeholder="user@company.com"
                  value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Password *</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} required placeholder="Min. 8 characters"
                    value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none pr-10" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Phone</label>
                <input type="tel" placeholder="+44 7700 900000"
                  value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
              </div>

              {/* Company / Organisation */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">
                  {createForm.account_type === 'portal' ? 'Organisation' : 'Company'}
                </label>
                <input type="text" placeholder="e.g. Tripod Security Ltd"
                  value={createForm.account_type === 'portal' ? createForm.organization : createForm.company}
                  onChange={e => setCreateForm(f => createForm.account_type === 'portal'
                    ? { ...f, organization: e.target.value }
                    : { ...f, company: e.target.value }
                  )}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
              </div>

              {/* Site */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Assign to Site</label>
                <select value={createForm.site_id} onChange={e => setCreateForm(f => ({ ...f, site_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none">
                  <option value="">— No site (global access) —</option>
                  {sites.map(s => <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="rounded-xl bg-[#2b4594] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1e326e] disabled:opacity-60 shadow">
                  {saving ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ EDIT ACCOUNT MODAL ═════════════════════════ */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Edit Account — {editingAccount.email}</h3>
              <button onClick={() => setEditingAccount(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">First Name</label>
                  <input type="text" value={editForm.first_name || ''}
                    onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Last Name</label>
                  <input type="text" value={editForm.last_name || ''}
                    onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Email</label>
                <input type="email" value={editForm.email || ''}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Phone</label>
                <input type="tel" value={editForm.phone || ''}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Role</label>
                <select value={editForm.role || ''}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none">
                  {editingAccount.isPortal
                    ? <><option value="admin">Admin</option><option value="superadmin">Super Admin</option></>
                    : <><option value="guard">Guard</option><option value="manager">Manager</option><option value="employee">Employee</option></>
                  }
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Assign to Site</label>
                <select value={editForm.site_id || ''}
                  onChange={e => setEditForm(f => ({ ...f, site_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none">
                  <option value="">— No site (global access) —</option>
                  {sites.map(s => <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>)}
                </select>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  {editForm.is_active ? <Unlock size={14} className="text-emerald-500" /> : <Lock size={14} className="text-red-500" />}
                  Account Status: <strong>{editForm.is_active ? 'Active' : 'Inactive'}</strong>
                </span>
                <div
                  onClick={() => setEditForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-10 h-5.5 rounded-full relative cursor-pointer transition-colors ${editForm.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  style={{ width: 40, height: 22 }}
                >
                  <div style={{ width: 18, height: 18, top: 2, left: editForm.is_active ? 20 : 2, position: 'absolute', borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">New Password (optional)</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Leave blank to keep current"
                    value={editForm.password || ''}
                    onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#2b4594] focus:outline-none pr-10" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditingAccount(null)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="rounded-xl bg-[#2b4594] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1e326e] disabled:opacity-60 shadow">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════ PERMISSIONS MODAL ══════════════════════════ */}
      {editingPermissions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-700 to-[#2b4594]">
              <div className="flex items-center gap-2 text-white">
                <Key size={18} />
                <div>
                  <h3 className="text-base font-bold">Granular Permissions</h3>
                  <p className="text-xs text-purple-200">{editingPermissions.email}</p>
                </div>
              </div>
              <button onClick={() => setEditingPermissions(null)} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Module Permissions */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-2">
                  <Activity size={13} /> Module Access
                </h4>
                <div className="space-y-2">
                  {Object.entries(permForm.module_permissions).map(([key, val]) => (
                    <PermToggle
                      key={key}
                      label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      checked={val}
                      onChange={() => setPermForm(p => ({
                        ...p,
                        module_permissions: { ...p.module_permissions, [key]: !val },
                      }))}
                    />
                  ))}
                </div>
              </div>

              {/* Allowed Sites */}
              {sites.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
                    <MapPin size={13} /> Allowed Sites
                    <span className="text-[10px] font-normal text-slate-400">(empty = all sites)</span>
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {sites.map(s => {
                      const id = String(s.id || s._id);
                      const checked = permForm.allowed_sites.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'border-[#2b4594] bg-[#2b4594]' : 'border-slate-300'}`}
                            onClick={() => toggleSite(id)}>
                            {checked && <Check size={10} color="white" strokeWidth={3} />}
                          </div>
                          <MapPin size={13} className="text-slate-400" />
                          <span className="text-sm text-slate-700">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Allowed Cameras */}
              {cameras.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2">
                    <Camera size={13} /> Camera Access
                    <span className="text-[10px] font-normal text-slate-400">(empty = all cameras on allowed sites)</span>
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {cameras.map(c => {
                      const id = String(c.id || c._id);
                      const checked = permForm.allowed_cameras.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'border-[#2b4594] bg-[#2b4594]' : 'border-slate-300'}`}
                            onClick={() => toggleCamera(id)}>
                            {checked && <Check size={10} color="white" strokeWidth={3} />}
                          </div>
                          <Camera size={13} className="text-slate-400" />
                          <span className="text-sm text-slate-700">{c.name} <span className="text-slate-400 text-xs">({c.location})</span></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditingPermissions(null)}
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleSavePermissions} disabled={saving}
                  className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60 shadow">
                  {saving ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ AUDIT DETAIL MODAL ═════════════════════════ */}
      {showAuditDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Audit Log Detail</h3>
              <button onClick={() => setShowAuditDetail(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-slate-500 font-semibold uppercase">Action</span><p className="mt-1 font-semibold">{showAuditDetail.action}</p></div>
                <div><span className="text-xs text-slate-500 font-semibold uppercase">Resource</span><p className="mt-1 font-semibold capitalize">{showAuditDetail.resourceType}</p></div>
                <div><span className="text-xs text-slate-500 font-semibold uppercase">Actor</span><p className="mt-1">{showAuditDetail.actorName || showAuditDetail.actorEmail}</p></div>
                <div><span className="text-xs text-slate-500 font-semibold uppercase">Time</span><p className="mt-1">{new Date(showAuditDetail.createdAt).toLocaleString()}</p></div>
              </div>
              {showAuditDetail.description && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-700">{showAuditDetail.description}</p>
                </div>
              )}
              {showAuditDetail.beforeState && (
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Before</p>
                  <pre className="text-xs bg-red-50 border border-red-100 rounded-xl p-3 overflow-x-auto text-slate-700">
                    {JSON.stringify(showAuditDetail.beforeState, null, 2)}
                  </pre>
                </div>
              )}
              {showAuditDetail.afterState && (
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">After</p>
                  <pre className="text-xs bg-emerald-50 border border-emerald-100 rounded-xl p-3 overflow-x-auto text-slate-700">
                    {JSON.stringify(showAuditDetail.afterState, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminPage;
