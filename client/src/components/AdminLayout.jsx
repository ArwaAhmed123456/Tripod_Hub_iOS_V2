import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ShieldCheck, HelpCircle, MessageSquare, User, LogOut,
  BellDot, BookOpen, MapPin, Users, Bell, Code, Settings as SettingsIcon,
  Menu, X, Shield,
} from 'lucide-react';

const AdminLayout = () => {
  const navigate      = useNavigate();
  const location      = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [manageOpen,  setManageOpen]  = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const desktopProfileRef = useRef(null);
  const mobileProfileRef  = useRef(null);
  const supportRef        = useRef(null);
  const manageRef         = useRef(null);

  const isManageActive  = location.pathname.startsWith('/admin/manage');
  const isSupportActive = location.pathname.startsWith('/admin/support');

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // Poll for pending guard approvals every 30 seconds
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const { default: api } = await import('../api');
        const res = await api.get('/guards/members?status=Pending');
        setPendingCount((res.data || []).length);
      } catch { /* silently fail */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  const firstName    = localStorage.getItem('adminFirstName') || '';
  const lastName     = localStorage.getItem('adminLastName')  || '';
  const adminEmail   = localStorage.getItem('admin_remember_email') || '';
  const organization = localStorage.getItem('adminOrg') || '';
  const adminRole    = localStorage.getItem('adminRole') || '';
  const fullName     = firstName || lastName
    ? `${firstName} ${lastName}`.trim()
    : adminEmail.split('@')[0] || 'Admin';
  const initials     = fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  const handleLogout = () => {
    setProfileOpen(false);
    setMobileMenuOpen(false);
    ['adminToken','adminRole','adminFirstName','adminLastName','adminOrg'].forEach(k => localStorage.removeItem(k));
    navigate('/admin/login');
  };

  useEffect(() => {
    const h = (e) => {
      const isInsideProfile =
        (desktopProfileRef.current && desktopProfileRef.current.contains(e.target)) ||
        (mobileProfileRef.current  && mobileProfileRef.current.contains(e.target));
      if (!isInsideProfile) setProfileOpen(false);
      if (supportRef.current && !supportRef.current.contains(e.target)) setSupportOpen(false);
      if (manageRef.current  && !manageRef.current.contains(e.target))  setManageOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const navLinks = [
    { to: '/admin/activity',   label: 'Activity'   },
    { to: '/admin/cameras',    label: 'CCTV Cameras' },
    { to: '/admin/people',     label: 'People'     },
    { to: '/admin/attendance', label: 'Attendance' },
    ...(adminRole === 'superadmin' ? [{ to: '/admin/superadmin', label: 'Super Admin' }] : []),
  ];

  const manageItems = [
    { to: '/admin/manage/sites',          icon: MapPin,       label: 'Sites',                  desc: 'Site setup, branding, sign in flows and devices' },
    { to: '/admin/manage/visitor-groups', icon: Users,        label: 'Visitor groups',         desc: 'Manage visitor types, data privacy and configurations' },
    { to: '/admin/manage/notifications',  icon: Bell,         label: 'Advanced notifications', desc: 'Send custom notifications to specific recipients' },
    { to: '/admin/manage/safety',         icon: ShieldCheck,  label: 'Safety check',           desc: 'Manage people to be identified at sign in' },
    { to: '/admin/manage/account',        icon: SettingsIcon, label: 'Account management',     desc: 'Manage subscription, user roles and permissions' },
    { to: '/admin/manage/api',            icon: Code,         label: 'Client API',             desc: 'Add an API key for external access to your data' },
  ].filter((item) => ['superadmin', 'admin'].includes(adminRole) || item.to !== '/admin/manage/account');

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">

      {/* ── Top nav ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 shadow-sm z-30 sticky top-0">
        <div className="flex items-center justify-between h-[60px] lg:h-[72px] px-4 lg:px-6">

          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/Tipod_Final_Logo_high_pixel.png" alt="Tripod"
              className="h-7 lg:h-8 w-auto object-contain" />
          </div>

          {/* Desktop nav — hidden on tablet/mobile */}
          <nav className="hidden lg:flex h-full items-center ml-6">
            {navLinks.map(({ to, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  `px-4 h-[72px] flex items-center text-[15px] font-semibold transition-colors border-b-2 ${
                    isActive ? 'border-[#2b4594] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`
                }
              >{label}</NavLink>
            ))}

            {/* Manage dropdown */}
            <div className="relative h-[72px] flex items-center" ref={manageRef}>
              <button onClick={() => setManageOpen(o => !o)}
                className={`px-4 h-[72px] flex items-center text-[15px] font-semibold transition-colors border-b-2 gap-1 ${
                  isManageActive ? 'border-[#2b4594] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}>
                Manage
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5 text-slate-400">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {manageOpen && (
                <div className="absolute left-0 top-full w-[480px] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="grid grid-cols-2 gap-0 p-5">
                    <div className="space-y-1 pr-4 border-r border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pb-1">Manage settings</p>
                      {manageItems.slice(0,2).map(({ to, icon: Icon, label, desc }) => (
                        <Link key={to} to={to} onClick={() => setManageOpen(false)}
                          className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                          <Icon size={18} className="text-slate-400 mt-0.5 flex-shrink-0 group-hover:text-[#2b4594]" />
                          <div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
                        </Link>
                      ))}
                    </div>
                    <div className="space-y-1 pl-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pb-1">Visitors</p>
                      {manageItems.slice(2,4).map(({ to, icon: Icon, label, desc }) => (
                        <Link key={to} to={to} onClick={() => setManageOpen(false)}
                          className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                          <Icon size={18} className="text-slate-400 mt-0.5 flex-shrink-0 group-hover:text-[#2b4594]" />
                          <div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
                        </Link>
                      ))}
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-3 pb-1">Account</p>
                      {manageItems.slice(4).map(({ to, icon: Icon, label, desc }) => (
                        <Link key={to} to={to} onClick={() => setManageOpen(false)}
                          className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                          <Icon size={18} className="text-slate-400 mt-0.5 flex-shrink-0 group-hover:text-[#2b4594]" />
                          <div><p className="text-sm font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{desc}</p></div>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-slate-100 px-5 py-3">
                    <Link to="/admin/manage" onClick={() => setManageOpen(false)}
                      className="text-sm font-semibold text-[#2b4594] hover:text-[#1e326e]">View all settings →</Link>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Right side — desktop */}
          <div className="hidden lg:flex items-center gap-5 h-full ml-auto">
            <NavLink to="/admin/evacuation"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-red-600' : 'text-slate-500 hover:text-slate-800'}`
              }>
              <ShieldCheck size={18} strokeWidth={1.75} />
              <span className="text-[10px] font-semibold">Evacuation</span>
            </NavLink>

            {/* Pending approvals bell — only shows when there are pending guards */}
            {pendingCount > 0 && (
              <NavLink to="/admin/people"
                className="relative flex flex-col items-center justify-center gap-0.5 text-amber-600 hover:text-amber-700 transition-colors"
                title={`${pendingCount} pending approval${pendingCount > 1 ? 's' : ''}`}
              >
                <div className="relative">
                  <Bell size={18} strokeWidth={1.75} />
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {pendingCount}
                  </span>
                </div>
                <span className="text-[10px] font-semibold">Approvals</span>
              </NavLink>
            )}

            <div className="relative" ref={supportRef}>
              <button onClick={() => setSupportOpen(o => !o)}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${isSupportActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
                <HelpCircle size={18} strokeWidth={1.75} />
                <span className="text-[10px] font-semibold">Support</span>
              </button>
              {supportOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                  <Link to="/admin/support/whats-new" onClick={() => setSupportOpen(false)} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
                    <span className="inline-flex items-center gap-2"><BellDot size={15} className="text-[#2b4594]" /> What&apos;s new</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  </Link>
                  <Link to="/admin/support/collections/getting-started" onClick={() => setSupportOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
                    <BookOpen size={15} className="text-[#2b4594]" /> Getting started
                  </Link>
                  <Link to="/admin/support" onClick={() => setSupportOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
                    <HelpCircle size={15} className="text-[#2b4594]" /> Support
                  </Link>
                </div>
              )}
            </div>

            <div className="relative" ref={desktopProfileRef}>
              <button onClick={() => setProfileOpen(o => !o)}
                className="flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-800 transition-colors">
                <div className="w-6 h-6 rounded-full bg-[#2b4594] flex items-center justify-center text-[10px] font-bold text-white">{initials}</div>
                <span className="text-[10px] font-semibold">Profile</span>
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 w-56">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-800">{fullName}</p>
                    {organization && <p className="text-xs text-slate-500 mt-0.5">{organization}</p>}
                    {!organization && adminEmail && <p className="text-xs text-slate-500 mt-0.5">{adminEmail}</p>}
                  </div>
                  <div className="py-1">
                    <Link to="/admin/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <User size={15} className="text-slate-400" /> My profile
                    </Link>
                    <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <LogOut size={15} className="text-slate-400" /> Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tablet/Mobile right side — profile avatar + hamburger */}
          <div className="flex lg:hidden items-center gap-3 ml-auto">
            <div className="relative" ref={mobileProfileRef}>
              <button onClick={() => setProfileOpen(o => !o)}
                className="w-8 h-8 rounded-full bg-[#2b4594] flex items-center justify-center text-[11px] font-bold text-white">
                {initials}
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 w-56">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-800">{fullName}</p>
                    {organization && <p className="text-xs text-slate-500 mt-0.5">{organization}</p>}
                  </div>
                  <div className="py-1">
                    <Link to="/admin/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <User size={15} className="text-slate-400" /> My profile
                    </Link>
                    <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      <LogOut size={15} className="text-slate-400" /> Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setMobileMenuOpen(o => !o)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* ── Mobile / Tablet slide-down menu ─────────────────── */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-slate-200 shadow-lg z-40">
            <nav className="px-4 py-3 space-y-1">
              {navLinks.map(({ to, label }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) =>
                    `block px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                      isActive ? 'bg-[#2b4594]/10 text-[#2b4594]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`
                  }
                >{label}</NavLink>
              ))}

              {/* Manage section */}
              <div>
                <button onClick={() => setManageOpen(o => !o)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                    isManageActive ? 'bg-[#2b4594]/10 text-[#2b4594]' : 'text-slate-600 hover:bg-slate-50'
                  }`}>
                  Manage
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform ${manageOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {manageOpen && (
                  <div className="mt-1 ml-4 space-y-1 border-l-2 border-slate-100 pl-3">
                    {manageItems.map(({ to, icon: Icon, label }) => (
                      <Link key={to} to={to} onClick={() => { setManageOpen(false); setMobileMenuOpen(false); }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                        <Icon size={16} className="text-slate-400 flex-shrink-0" />
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Evacuation + Support */}
              <NavLink to="/admin/evacuation"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-red-50 text-red-600' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }>
                <ShieldCheck size={18} /> Evacuation
              </NavLink>
              <NavLink to="/admin/support"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                    isActive ? 'bg-[#2b4594]/10 text-[#2b4594]' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }>
                <HelpCircle size={18} /> Support
              </NavLink>

              {/* Account shortcuts (mobile) */}
              <div className="pt-2 mt-2 border-t border-slate-200 space-y-1">
                <NavLink to="/admin/profile"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold transition-colors ${
                      isActive ? 'bg-[#2b4594]/10 text-[#2b4594]' : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }>
                  <User size={18} /> Profile
                </NavLink>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <LogOut size={18} /> Log out
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto relative">
        <Outlet />
        <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
          <button className="w-10 h-10 bg-[#2b4594] hover:bg-[#1e326e] text-white rounded-full shadow-lg flex items-center justify-center transition-colors">
            <MessageSquare size={18} />
          </button>
        </div>
      </main>

    </div>
  );
};

export default AdminLayout;
