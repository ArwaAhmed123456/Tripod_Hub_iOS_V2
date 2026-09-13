import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, Shield, FileText, CreditCard, ChevronRight, Plus, Trash2, X, Mail, Pencil, CheckCircle, XCircle, Clock, Eye, EyeOff } from 'lucide-react';
import api from '../../api';

const ROLES = ['superadmin', 'admin', 'viewer'];
const ROLE_COLORS = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin:      'bg-blue-100 text-[#2b4594]',
  viewer:     'bg-slate-100 text-slate-600',
};
const MOBILE_ROLES = ['employee', 'guard', 'manager', 'admin'];

// ─── Invite user modal ────────────────────────────────────────────────────────
const InviteModal = ({ onClose, onInvited }) => {
  const [email, setEmail]               = useState('');
  const [firstName, setFirstName]       = useState('');
  const [lastName, setLastName]         = useState('');
  const [phone, setPhone]               = useState('');
  const [password, setPassword]         = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole]                 = useState('admin');
  const [accountType, setAccountType]   = useState('portal');
  const [mobileRole, setMobileRole]     = useState('guard');
  const [siteId, setSiteId]             = useState('');
  const [sites, setSites]               = useState([]);
  const [sendWelcome, setSendWelcome]   = useState(true);
  const [sendAppCode, setSendAppCode]   = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [createdCreds, setCreatedCreds] = useState(null);

  const currentRole = (() => {
    try { const t = localStorage.getItem('adminToken'); return t ? JSON.parse(atob(t.split('.')[1])).role || 'admin' : 'admin'; } catch { return 'admin'; }
  })();
  const isSuperAdmin = currentRole === 'superadmin';
  const currentSiteId = (() => {
    try { const t = localStorage.getItem('adminToken'); return t ? JSON.parse(atob(t.split('.')[1])).site_id || '' : ''; } catch { return ''; }
  })();

  useEffect(() => {
    api.get('/projects').then(r => {
      setSites(r.data || []);
      if (!isSuperAdmin && currentSiteId) setSiteId(currentSiteId);
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    if (!password.trim() || password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true); setError('');
    try {
      if (accountType === 'portal') {
        const res = await api.post('/auth/invite', {
          email: email.trim(), role,
          password: password.trim(),
          first_name: firstName.trim() || undefined,
          last_name:  lastName.trim()  || undefined,
          phone:      phone.trim()     || undefined,
          organization: organization.trim() || undefined,
          site_id:    siteId           || undefined,
          send_email: sendWelcome,
        });
        const returnedPassword = res?.data?.password || password.trim();
        setCreatedCreds({ email: email.trim(), password: returnedPassword, role, type: 'Portal account' });
        onInvited({ email: email.trim(), role });
      } else {
        const res = await api.post('/guards/members', {
          first_name:        firstName.trim() || email.split('@')[0],
          last_name:         lastName.trim()  || undefined,
          email:             email.trim(),
          phone:             phone.trim()     || undefined,
          password:          password.trim(),
          mobileRole,
          role:              mobileRole.charAt(0).toUpperCase() + mobileRole.slice(1),
          site_id:           siteId           || undefined,
          status:            'Current',
          send_welcome:      sendWelcome,
          include_companion: sendAppCode,
        });
        setCreatedCreds({
          email: email.trim(), password: password.trim(),
          role: mobileRole, type: 'Mobile app account',
          note: (sendWelcome || sendAppCode)
            ? 'Email queued. If “Send app code” is enabled, the invite code will be included in the email.'
            : 'User created. Share credentials with them.',
        });
        onInvited({ email: email.trim(), role: mobileRole, status: 'invited' });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally { setSaving(false); }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2b4594]';

  // Step 2 — show credentials
  if (createdCreds) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">✓ {createdCreds.type} created</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-green-800">Share these credentials with the user:</p>
            <div>
              <p className="text-xs text-green-600 font-semibold mb-1">EMAIL</p>
              <p className="font-mono text-sm bg-white border border-green-200 rounded-lg px-3 py-2 select-all">{createdCreds.email}</p>
            </div>
            <div>
              <p className="text-xs text-green-600 font-semibold mb-1">PASSWORD</p>
              <p className="font-mono text-sm bg-white border border-green-200 rounded-lg px-3 py-2 select-all font-bold tracking-wider">{createdCreds.password}</p>
            </div>
            <div>
              <p className="text-xs text-green-600 font-semibold mb-1">ROLE</p>
              <p className="text-sm font-semibold capitalize text-slate-800">{createdCreds.role}</p>
            </div>
          </div>
          {createdCreds.note && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">{createdCreds.note}</p>
          )}
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ Copy these credentials now — the password will not be shown again.
          </p>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-5 py-2 bg-[#2b4594] hover:bg-[#1e326e] text-white rounded-lg text-sm font-semibold">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Create account</h2>
            <p className="text-xs text-slate-500 mt-0.5">Add a portal admin or mobile app user</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Account type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Account type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'portal', label: '🖥  Portal (Web)', desc: 'Admin dashboard access' },
                { val: 'mobile', label: '📱  Mobile App',   desc: 'Guard / Manager / Employee' },
              ].map(({ val, label, desc }) => (
                <button key={val} type="button" onClick={() => setAccountType(val)}
                  className={`text-left px-4 py-3 rounded-xl border-2 transition-colors ${accountType === val ? 'border-[#2b4594] bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <p className={`text-sm font-semibold ${accountType === val ? 'text-[#2b4594]' : 'text-slate-800'}`}>{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">First name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Last name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" className={inp} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email address <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@tripodsvcs.co.uk" className={inp} />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Phone <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 900000" className={inp} />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password <span className="text-red-500">*</span></label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" className={inp} autoComplete="new-password" />
            <p className="text-xs text-slate-500 mt-1">User will login with this password. Min 8 characters.</p>
          </div>

          {/* Portal fields */}
          {accountType === 'portal' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Organisation</label>
                <input value={organization} onChange={e => setOrganization(e.target.value)} placeholder="Tripod Services Ltd" className={inp} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Portal role <span className="text-red-500">*</span></label>
                <select value={role} onChange={e => setRole(e.target.value)} className={inp}>
                  <option value="admin">Site Manager — manages their assigned site only</option>
                  <option value="superadmin">Super Admin — full access to all sites</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {role === 'superadmin' ? 'Can see and edit every account and guard across all sites.' : 'Restricted to data linked to their assigned site only.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Assign to site {!isSuperAdmin && <span className="text-slate-400 font-normal text-xs">(locked to your site)</span>}
                </label>
                {isSuperAdmin ? (
                  <select value={siteId} onChange={e => setSiteId(e.target.value)} className={inp}>
                    <option value="">Select site…</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    {sites.length === 0 && <option disabled>No sites — create one in Manage → Sites</option>}
                  </select>
                ) : (
                  <div className={`${inp} bg-slate-50 text-slate-600 cursor-not-allowed`}>
                    {sites.find(s => s.id === currentSiteId)?.name || 'Your site'}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mobile fields */}
          {accountType === 'mobile' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Mobile app role <span className="text-red-500">*</span></label>
                <select value={mobileRole} onChange={e => setMobileRole(e.target.value)} className={inp}>
                  <option value="guard">Security Guard — sign in/out visitors, run evacuations</option>
                  <option value="manager">Manager — view on-site people, approve guards</option>
                  <option value="employee">Employee — sign self in/out, view calendar</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Assign to site {!isSuperAdmin && <span className="text-slate-400 font-normal text-xs">(locked to your site)</span>}
                </label>
                {isSuperAdmin ? (
                  <select value={siteId} onChange={e => setSiteId(e.target.value)} className={inp}>
                    <option value="">Select site…</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    {sites.length === 0 && <option disabled>No sites — create one in Manage → Sites</option>}
                  </select>
                ) : (
                  <div className={`${inp} bg-slate-50 text-slate-600 cursor-not-allowed`}>
                    {sites.find(s => s.id === currentSiteId)?.name || 'Your site'}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Email options */}
          {accountType === 'portal' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#2b4594]/10 flex items-center justify-center flex-shrink-0">
                    <Mail size={15} className="text-[#2b4594]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Send welcome email</p>
                    <p className="text-xs text-slate-500 mt-0.5">Includes credentials and portal access link</p>
                  </div>
                </div>
                <div
                  onClick={() => setSendWelcome(v => !v)}
                  className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${sendWelcome ? 'bg-[#2b4594]' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${sendWelcome ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email options</p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWelcome}
                  onChange={e => setSendWelcome(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2b4594] rounded flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Send welcome email</p>
                  <p className="text-xs text-slate-500 mt-0.5">Includes login credentials and getting started instructions</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendAppCode}
                  onChange={e => setSendAppCode(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2b4594] rounded flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Send app code</p>
                  <p className="text-xs text-slate-500 mt-0.5">Includes the Tripod Hub Connect invite code in the email</p>
                </div>
              </label>
              {!email.trim() && (
                <p className="text-xs text-slate-500">Enter an email address to enable email sending.</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 bg-[#2b4594] hover:bg-[#1e326e] disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Create mobile user modal (Guard/Manager) ─────────────────────────────────
const MobileUserModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', mobileRole: 'guard', site_id: '' });
  const [showPassword, setShowPassword]   = useState(false);
  const [sendWelcome, setSendWelcome]     = useState(true);
  const [sendAppCode, setSendAppCode]     = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [sites, setSites]     = useState([]);
  const [createdCreds, setCreatedCreds] = useState(null);

  useEffect(() => {
    api.get('/projects').then(res => setSites(res.data || [])).catch(() => setSites([]));
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Full name is required'); return; }
    if (!form.password.trim() || form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true); setError('');
    try {
      const parts = form.name.trim().split(/\s+/);
      const res = await api.post('/guards/members', {
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password.trim(),
        mobileRole: form.mobileRole,
        role: form.mobileRole === 'guard' ? 'Guard' : form.mobileRole === 'manager' ? 'Manager' : form.mobileRole === 'admin' ? 'Admin' : 'Employee',
        site_id: form.site_id || undefined,
        status: 'Current',
        send_welcome: sendWelcome && !!form.email.trim(),
        include_companion: sendAppCode && !!form.email.trim(),
      });
      setCreatedCreds({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        role: form.mobileRole,
        note: (sendWelcome || sendAppCode) && form.email.trim()
          ? 'Welcome email with login credentials and Tripod Hub Connect invite code sent.'
          : 'User created. Share the credentials below with them.',
      });
      onCreated?.(res.data.member);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
      setSaving(false);
    }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#2b4594]';

  // Step 2 — credentials
  if (createdCreds) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">✓ Mobile app user created</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-green-800">Share these credentials with {createdCreds.name}:</p>
            {createdCreds.email && (
              <div>
                <p className="text-xs text-green-600 font-semibold mb-1">EMAIL</p>
                <p className="font-mono text-sm bg-white border border-green-200 rounded-lg px-3 py-2 select-all">{createdCreds.email}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-green-600 font-semibold mb-1">PASSWORD</p>
              <p className="font-mono text-sm bg-white border border-green-200 rounded-lg px-3 py-2 select-all font-bold tracking-wider">{createdCreds.password}</p>
            </div>
            <div>
              <p className="text-xs text-green-600 font-semibold mb-1">ROLE</p>
              <p className="text-sm font-semibold capitalize text-slate-800">{createdCreds.role}</p>
            </div>
          </div>
          {createdCreds.note && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">{createdCreds.note}</p>
          )}
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ Copy these credentials now — the password will not be shown again.
          </p>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-5 py-2 bg-[#2b4594] hover:bg-[#1e326e] text-white rounded-lg text-sm font-semibold">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Create mobile app user</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Full name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Full name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="John Smith" className={inp} />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="john@company.com" className={inp} />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+44 7700 900000" className={inp} />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 8 characters"
                className={inp}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">User will login with this password. Min 8 characters.</p>
          </div>

          {/* Mobile App Role */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Mobile App Role</label>
            <select value={form.mobileRole} onChange={e => setForm(f => ({ ...f, mobileRole: e.target.value }))} className={inp}>
              <option value="guard">Guard</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
            <div className="mt-2 text-xs text-slate-500 space-y-0.5 pl-1">
              <p><span className="font-semibold text-slate-700">Guard</span> — sign in/out visitors, run evacuations</p>
              <p><span className="font-semibold text-slate-700">Manager</span> — view on-site people, receive notifications</p>
              <p><span className="font-semibold text-slate-700">Employee</span> — sign self in/out, view calendar</p>
              <p><span className="font-semibold text-slate-700">Admin</span> — full mobile app access</p>
            </div>
          </div>

          {/* Site */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Site</label>
            <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))} className={inp}>
              <option value="">Select site…</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              {sites.length === 0 && <option disabled>No sites — create one in Manage → Sites</option>}
            </select>
          </div>

          {/* Email options — only show if email entered */}
          {form.email.trim() && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email options</p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={sendWelcome} onChange={e => setSendWelcome(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2b4594] rounded flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Send welcome email</p>
                  <p className="text-xs text-slate-500 mt-0.5">Includes login credentials and getting started instructions</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={sendAppCode} onChange={e => setSendAppCode(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2b4594] rounded flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Include Tripod Hub Connect app invite</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sends a 12-digit code to connect the mobile companion app</p>
                </div>
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 bg-[#2b4594] hover:bg-[#1e326e] disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Edit mobile user modal (Guard/Manager/Employee) ──────────────────────────
const EditMobileUserModal = ({ user, onClose, onUpdated }) => {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email === 'No email' ? '' : user.email || '',
    phone: user.phone || '',
    mobileRole: user.role || 'guard',
    site_id: user.site_id || '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sites, setSites] = useState([]);

  useEffect(() => {
    api.get('/projects').then(res => setSites(res.data || [])).catch(() => setSites([]));
  }, []);

  const handleUpdate = async () => {
    if (!form.name.trim()) { setError('Full name is required'); return; }
    setSaving(true); setError('');
    try {
      const parts = form.name.trim().split(/\s+/);
      await api.put(`/guards/members/${user.id}`, {
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        role: form.mobileRole === 'guard' ? 'Guard' : form.mobileRole === 'manager' ? 'Manager' : form.mobileRole === 'admin' ? 'Admin' : 'Employee',
        mobileRole: form.mobileRole,
        site_id: form.site_id || undefined,
        password: form.password?.trim() || undefined,
      });
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
      setSaving(false);
    }
  };

  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#2b4594]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Edit mobile app user</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Full name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Mobile App Role</label>
            <select value={form.mobileRole} onChange={e => setForm(f => ({ ...f, mobileRole: e.target.value }))} className={inp}>
              <option value="guard">Guard</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Site</label>
            <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))} className={inp}>
              <option value="">Select site…</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              New password <span className="text-slate-400 font-normal text-xs">(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              value={form.password || ''}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Enter new password…"
              className={inp}
              autoComplete="new-password"
            />
            <p className="text-xs text-slate-400 mt-1">Min 8 characters. Share this with the user after saving.</p>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={handleUpdate} disabled={saving} className="px-5 py-2 bg-[#2b4594] hover:bg-[#1e326e] disabled:opacity-60 text-white rounded-lg text-sm font-semibold">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Section card ─────────────────────────────────────────────────────────────
const SectionCard = ({ icon: Icon, title, desc, onClick }) => (
  <button onClick={onClick}
    className="flex items-center gap-4 w-full text-left px-5 py-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm hover:border-slate-300 transition-all group">
    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
      <Icon size={18} className="text-slate-500 group-hover:text-[#2b4594]" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
    </div>
    <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" />
  </button>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const AccountManagement = () => {
  const adminRole = localStorage.getItem('adminRole') || '';
  const [activeSection, setActiveSection] = useState('overview');
  const [showInvite, setShowInvite] = useState(false);
  const [showMobileUser, setShowMobileUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pendingGuards, setPendingGuards] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  const fetchPendingGuards = useCallback(async () => {
    setLoadingPending(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await api.get('/guards/pending', { headers: { Authorization: `Bearer ${token}` } });
      setPendingGuards(res.data || []);
    } catch {
      setPendingGuards([]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const handleGuardApproval = async (guardId, status) => {
    setApprovingId(guardId);
    try {
      const token = localStorage.getItem('adminToken');
      await api.put(`/guards/${guardId}/approval`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      fetchPendingGuards();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update approval');
    } finally {
      setApprovingId(null);
    }
  };

  useEffect(() => {
    if (activeSection === 'users' || activeSection === 'mobile-users') {
      fetchUsers();
    }
    if (activeSection === 'approvals' || activeSection === 'mobile-users') {
      fetchPendingGuards();
    }
  }, [activeSection]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const isSuper = adminRole === 'superadmin';
      const currentSiteId = (() => {
        try { const t = localStorage.getItem('adminToken'); return t ? JSON.parse(atob(t.split('.')[1])).site_id || '' : ''; } catch { return ''; }
      })();

      const [adminsRes, membersRes] = await Promise.all([
        isSuper ? api.get('/auth/admins') : Promise.resolve({ data: [] }),
        api.get('/guards/members')
      ]);
      const admins = adminsRes.data.map(a => ({
        id: a._id,
        name: a.first_name ? `${a.first_name} ${a.last_name || ''}`.trim() : a.email?.split('@')[0] || 'Unknown',
        email: a.email,
        role: a.role,
        status: 'active',
        isPortal: true,
        site: a.site_id?.name || ''
      }));
      const members = membersRes.data
        .map(m => ({
          id: m.id || m._id,
          name: m.name || m.first_name || m.email?.split('@')[0] || 'Unknown',
          email: m.email || 'No email',
          phone: m.phone || '',
          role: (m.mobileRole || m.role || 'employee').toLowerCase(),
          status: (m.status || 'current').toLowerCase(),
          isPortal: false,
          site: m.site || '',
          site_id: m.site_id || ''
        }))
        .filter(m => isSuper || !currentSiteId || String(m.site_id) === String(currentSiteId));
      
      setUsers([...admins, ...members].filter(u => isSuper || u.role !== 'superadmin'));
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  if (adminRole !== 'superadmin' && adminRole !== 'admin') {
    return <Navigate to="/admin/manage/sites" replace />;
  }

  const addUser = (u) => setUsers(prev => [...prev, { ...u, id: Date.now(), status: 'invited' }]);
  const removeUser = async (user) => {
    if (!confirm(`Are you sure you want to remove ${user.name || 'this user'}?`)) return;
    try {
      if (user.isPortal) {
        await api.delete(`/auth/admins/${user.id}`);
      } else {
        await api.delete(`/guards/members/${user.id}`);
      }
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove user');
    }
  };
  const changeRole = (id, role) => setUsers(u => u.map(x => x.id === id ? { ...x, role } : x));

  const fmtDate = (val) => {
    try { return val ? new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; } catch { return val || '—'; }
  };

  // Overview
  if (activeSection === 'overview') return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Account management</h1>
      <p className="text-slate-500 text-sm mb-8">Manage subscription, user roles and permissions for your organisation.</p>
      <div className="space-y-3">
        {adminRole === 'superadmin' && (
          <SectionCard icon={Users}       title="Portal users"         desc="Add and edit users who have access to this portal" onClick={() => setActiveSection('users')} />
        )}
        <SectionCard icon={Shield}      title="Mobile app users"      desc="Create Guard, Manager, and Employee accounts for the companion app" onClick={() => setActiveSection('mobile-users')} />
        <SectionCard
          icon={Clock}
          title="Guard approvals"
          desc={pendingGuards.length > 0 ? `${pendingGuards.length} guard${pendingGuards.length === 1 ? '' : 's'} pending approval` : 'Review and approve new guard sign-ups'}
          onClick={() => setActiveSection('approvals')}
        />
        {adminRole === 'superadmin' && (
          <>
            <SectionCard icon={Shield}      title="Roles and permissions" desc="Set up different user roles and what they can do"  onClick={() => setActiveSection('roles')} />
            <SectionCard icon={CreditCard}  title="Subscription details"  desc="Plans and payment details"                        onClick={() => setActiveSection('billing')} />
            <SectionCard icon={FileText}    title="Audit log"             desc="Record of system activity and events"              onClick={() => setActiveSection('audit')} />
          </>
        )}
      </div>
    </div>
  );

  // Guard approvals section
  if (activeSection === 'approvals') {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setActiveSection('overview')} className="text-sm text-[#2b4594] hover:underline">← Account management</button>
        </div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Guard approvals</h1>
            <p className="text-slate-500 text-sm">Guards who signed up via the mobile app and are awaiting your approval to access the system.</p>
          </div>
          <button onClick={fetchPendingGuards} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Guard</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Site</th>
                <th className="px-5 py-3 text-left">Signed up</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingPending ? (
                <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : pendingGuards.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-5 py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle size={22} className="text-green-500" />
                    </div>
                    <p className="text-slate-600 font-semibold">All caught up!</p>
                    <p className="text-slate-400 text-xs mt-1">No guards pending approval.</p>
                  </td>
                </tr>
              ) : (
                pendingGuards.map(g => (
                  <tr key={g.id} className="hover:bg-slate-50 group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600 flex-shrink-0">
                          {(g.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{g.name || '—'}</p>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Pending</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{g.email || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{g.site || '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{fmtDate(g.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleGuardApproval(g.id, 'approved')}
                          disabled={approvingId === g.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
                        >
                          <CheckCircle size={13} /> Approve
                        </button>
                        <button
                          onClick={() => handleGuardApproval(g.id, 'rejected')}
                          disabled={approvingId === g.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Mobile app users page
  if (activeSection === 'mobile-users') {
    const mobileUsers = users.filter(u => !u.isPortal);
    return (
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setActiveSection('overview')} className="text-sm text-[#2b4594] hover:underline">← Account management</button>
        </div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Mobile app users</h1>
            <p className="text-slate-500 text-sm">Create and manage Guard, Manager, and Employee accounts for the Tripod Hub Connect companion app.</p>
          </div>
          <button onClick={() => setShowMobileUser(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2b4594] hover:bg-[#1e326e] text-white rounded-lg text-sm font-semibold">
            <Plus size={15} /> Create mobile app user
          </button>
        </div>

        {/* Pending Guard Approvals */}
        {pendingGuards.length > 0 && (
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-5 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Clock size={18} className="text-orange-600" />
                  Pending Guard Approvals
                </h2>
                <p className="text-sm text-slate-600 mt-1">{pendingGuards.length} guard{pendingGuards.length === 1 ? '' : 's'} awaiting approval</p>
              </div>
              <button onClick={() => setActiveSection('approvals')} className="text-sm text-[#2b4594] hover:underline font-semibold">
                View all →
              </button>
            </div>
            <div className="space-y-3">
              {pendingGuards.slice(0, 3).map(g => (
                <div key={g.id} className="bg-white rounded-lg p-4 border border-orange-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                      {(g.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{g.name || '—'}</p>
                      <p className="text-xs text-slate-500">{g.email || '—'} • {g.site || 'No site'} • {fmtDate(g.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleGuardApproval(g.id, 'approved')}
                      disabled={approvingId === g.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
                    >
                      <CheckCircle size={13} /> Approve
                    </button>
                    <button
                      onClick={() => handleGuardApproval(g.id, 'rejected')}
                      disabled={approvingId === g.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              ))}
              {pendingGuards.length > 3 && (
                <button onClick={() => setActiveSection('approvals')} className="w-full text-center text-sm text-slate-600 hover:text-[#2b4594] font-semibold py-2">
                  + {pendingGuards.length - 3} more pending
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total',     value: mobileUsers.length,                                                             color: 'text-slate-800' },
            { label: 'Guards',    value: mobileUsers.filter(u => u.role === 'guard').length,                             color: 'text-[#2b4594]' },
            { label: 'Managers',  value: mobileUsers.filter(u => u.role === 'manager').length,                           color: 'text-purple-700' },
            { label: 'Employees', value: mobileUsers.filter(u => u.role === 'employee' || u.role === 'admin').length,    color: 'text-green-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Site</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingUsers ? (
                <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : mobileUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center">
                    <p className="text-slate-500 font-semibold mb-1">No mobile app users yet</p>
                    <p className="text-slate-400 text-xs mb-4">Create your first guard, manager, or employee to get started.</p>
                    <button onClick={() => setShowMobileUser(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#2b4594] text-white rounded-lg text-sm font-semibold hover:bg-[#1e326e]">
                      <Plus size={14} /> Create mobile app user
                    </button>
                  </td>
                </tr>
              ) : (
                mobileUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#2b4594]/10 flex items-center justify-center text-xs font-bold text-[#2b4594] flex-shrink-0">
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{u.name || '--'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{u.email || '--'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                        u.role === 'guard'   ? 'bg-blue-100 text-[#2b4594]' :
                        u.role === 'manager' ? 'bg-purple-100 text-purple-700' :
                        u.role === 'admin'   ? 'bg-slate-200 text-slate-700' :
                        'bg-green-100 text-green-700'
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs max-w-[120px] truncate" title={u.site || '—'}>{u.site || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                        u.status === 'active' || u.status === 'current'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>{u.status === 'current' ? 'Active' : u.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right flex items-center justify-end gap-1">
                      <button onClick={() => setEditingUser(u)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-[#2b4594] transition-colors opacity-0 group-hover:opacity-100" title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => removeUser(u)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100" title="Remove">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showMobileUser && (
          <MobileUserModal
            onClose={() => setShowMobileUser(false)}
            onCreated={(member) => {
              setShowMobileUser(false);
              fetchUsers();
            }}
          />
        )}
        {editingUser && (
          <EditMobileUserModal
            user={editingUser}
            onClose={() => setEditingUser(null)}
            onUpdated={() => {
              setEditingUser(null);
              fetchUsers();
            }}
          />
        )}
      </div>
    );
  }

  // Portal users
  if (activeSection === 'users') return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActiveSection('overview')} className="text-sm text-[#2b4594] hover:underline">← Account management</button>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Portal users</h1>
          <p className="text-slate-500 text-sm">Add and edit users who have access to this portal.</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2b4594] hover:bg-[#1e326e] text-white rounded-lg text-sm font-semibold">
          <Plus size={15} /> Invite user
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-5 py-3 text-left">Name</th>
              <th className="px-5 py-3 text-left">Email</th>
              <th className="px-5 py-3 text-left">Role</th>
              <th className="px-5 py-3 text-left">Type</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadingUsers ? (
              <tr>
                <td colSpan="6" className="px-5 py-8 text-center text-slate-400">Loading accounts...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-5 py-8 text-center text-slate-400">No accounts found.</td>
              </tr>
            ) : (
              users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 group">
                  <td className="px-5 py-3 text-slate-800 font-medium">{u.name || '--'}</td>
                  <td className="px-5 py-3 text-slate-800">{u.email}</td>
                  <td className="px-5 py-3">
                    {u.isPortal ? (
                      <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                        className="border border-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-[#2b4594] bg-white">
                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    ) : (
                      <span className="capitalize">{u.role}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.isPortal ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.isPortal ? 'Portal' : 'Mobile App'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                      u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{u.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {u.role !== 'superadmin' && (
                      <button onClick={() => removeUser(u)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100" title="Remove account">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={addUser} />}
    </div>
  );

  // Billing
  if (activeSection === 'billing') return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActiveSection('overview')} className="text-sm text-[#2b4594] hover:underline">← Account management</button>
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Subscription details</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-800">Current plan</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#2b4594] text-white">CORE</span>
              <span className="text-sm text-slate-600">Enterprise</span>
            </div>
          </div>
          <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">Upgrade plan</button>
        </div>
        {[['Billing cycle', 'Monthly'], ['Next billing date', '4 Aug 2026'], ['Payment method', 'Visa •••• 4242']].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{k}</p>
            <p className="text-sm font-semibold text-slate-800">{v}</p>
          </div>
        ))}
        <div className="pt-4 border-t border-slate-100">
          <button className="text-sm text-red-600 hover:underline">Cancel subscription</button>
        </div>
      </div>
    </div>
  );

  // Audit log: the real, searchable audit trail is restricted to Super Admins.
  if (activeSection === 'audit') return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActiveSection('overview')} className="text-sm text-[#2b4594] hover:underline">← Account management</button>
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Audit log</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-600">
        {adminRole === 'superadmin' ? <button onClick={() => { window.location.href = '/admin/superadmin'; }} className="rounded-lg bg-[#2b4594] px-4 py-2 font-semibold text-white">Open real audit trail</button> : 'Audit records are available to the Super Admin only.'}
      </div>
    </div>
  );

  // Roles: use the unified account editor rather than misleading static definitions.
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActiveSection('overview')} className="text-sm text-[#2b4594] hover:underline">← Account management</button>
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Roles and permissions</h1>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm text-slate-600 mb-4">Select a real Portal or Mobile account to change its role, assigned sites, camera access, and individual permissions. Changes apply immediately on the next protected request.</p>
        {adminRole === 'superadmin' ? <button onClick={() => { window.location.href = '/admin/superadmin'; }} className="rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white">Open account permission editor</button> : <p className="text-sm text-amber-700">Only a Super Admin can change company-wide account roles and permissions.</p>}
      </div>
    </div>
  );
};

export default AccountManagement;
