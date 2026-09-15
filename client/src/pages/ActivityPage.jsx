import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  ImagePlus,
  LogOut,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  Trash2,
  User,
  History,
  X,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../api';
import SlideOutDrawer from '../components/SlideOutDrawer';

const toInputDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateRange = (preset) => {
  const end = new Date();
  const start = new Date();

  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }
  if (preset === 'last7') start.setDate(start.getDate() - 6);
  if (preset === 'last30') start.setDate(start.getDate() - 29);

  return {
    from: toInputDate(start),
    to: toInputDate(end),
  };
};

const formatDateTime = (value) => {
  if (!value || value === '--') return '--';
  if (typeof value === 'string' && value.includes('T')) {
    const [datePart, timePart] = value.split('T');
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const time = timePart ? timePart.slice(0, 5) : '';
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthName = months[parseInt(month, 10) - 1] || month;
      return `${parseInt(day, 10)} ${monthName} ${year}, ${time}`;
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDate = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatVisitDuration = (visit) => {
  if (visit.duration) return visit.duration;
  if (!visit.sign_out_time) return 'In progress';
  if (!visit.sign_in_time) return '--';

  const start = new Date(visit.sign_in_time);
  const end = new Date(visit.sign_out_time);
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  return `${(diffMs / 3600000).toFixed(1)}h`;
};

const downloadWorkbook = (rows, filename, sheetName) => {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
};

const VISIT_EXPORT_FIELDS = [
  { id: 'Name', value: (visit) => visit.name || '' },
  { id: 'Date', value: (visit) => formatDateTime(visit.sign_in_time || visit.created_at).split(',')[0] || '' },
  { id: 'Time In', value: (visit) => formatDateTime(visit.sign_in_time) },
  { id: 'Time Out', value: (visit) => formatDateTime(visit.sign_out_time) },
  { id: 'Role', value: (visit) => visit.group || visit.user_type || '' },
  { id: 'Company', value: (visit) => visit.trade || visit.company || '' },
  { id: 'Company Name', value: (visit) => visit.employee_company_name || '' },
  { id: 'Expected Arrival', value: (visit) => formatDateTime(visit.expected_date || visit.expectedArrival) },
  { id: 'Description', value: (visit) => visit.description || visit.reason || '' },
  { id: 'Purpose of Visit', value: (visit) => visit.reason || '' },
  { id: 'Hrs', value: (visit) => String(visit.hours ?? '').replace(/\.\d+$/, '') },
  { id: 'Mins', value: (visit) => String(Math.round((Number(visit.hours || 0) % 1) * 60) || '') },
  { id: 'Site', value: (visit) => visit.site || '' },
  { id: 'Group', value: (visit) => visit.group || '' },
  { id: 'In time', value: (visit) => formatDateTime(visit.sign_in_time) },
  { id: 'Out time', value: (visit) => formatDateTime(visit.sign_out_time) },
  { id: 'Expected time', value: () => '' },
  { id: 'In via', value: () => '' },
  { id: 'Out via', value: () => '' },
  { id: 'Duration (hours)', value: (visit) => formatVisitDuration(visit) },
  { id: 'Duration (h:m)', value: (visit) => formatVisitDuration(visit) },
  { id: 'Distance (metres)', value: () => '' },
  { id: 'Modified time', value: (visit) => formatDateTime(visit.created_at) },
  { id: 'Modified by', value: () => 'Admin' },
  { id: 'Modified reason', value: (visit) => visit.reason || '' },
  { id: 'Rejected sign in', value: () => 'No' },
  { id: 'Locale', value: () => 'en-GB' },
  { id: 'Visit notes', value: (visit) => visit.reason || '' },
  { id: 'Photo', value: (visit) => visit.photo_base64 || visit.photo ? 'Included' : '' },
];

const TAB_ITEMS = [
  { id: 'visits', label: 'Visit timeline' },
  { id: 'prereg', label: 'Pre-registrations' },
  { id: 'deliveries', label: 'Deliveries' },
];

const StatCard = ({ label, value }) => (
  <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
    <p className="text-4xl font-semibold text-slate-800">{value}</p>
    <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
  </div>
);

const ExportModal = ({ visits, groups, siteName, onClose }) => {
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [selectedFields, setSelectedFields] = useState([
    'Name', 'Date', 'Time In', 'Time Out', 'Role', 'Company', 'Hrs', 'Mins',
  ]);

  const groupedVisits = useMemo(() => {
    if (selectedGroup === 'All') return visits;
    return visits.filter((visit) => visit.group === selectedGroup);
  }, [selectedGroup, visits]);

  const toggleField = (field) => {
    setSelectedFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field]
    );
  };

  const handleExport = () => {
    if (!groupedVisits.length) {
      toast.error('There is no visit data to export');
      return;
    }

    if (!selectedFields.length) {
      toast.error('Select at least one field to export');
      return;
    }

    const rows = groupedVisits.map((visit) => {
      const row = {};
      selectedFields.forEach((fieldName) => {
        const field = VISIT_EXPORT_FIELDS.find((item) => item.id === fieldName);
        row[fieldName] = field ? field.value(visit) : '';
      });
      return row;
    });

    const safeSiteName = (siteName || 'site').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    downloadWorkbook(rows, `${safeSiteName}-activity-export.xlsx`, 'Activity');
    toast.success(`Exported ${rows.length} visit${rows.length === 1 ? '' : 's'}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">Export visit data</h2>
            <p className="mt-1 text-sm text-slate-500">
              Export the current visit timeline for {siteName || 'this site'}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Export group</label>
            <select
              value={selectedGroup}
              onChange={(event) => setSelectedGroup(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            >
              <option value="All">All groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-700">System fields</span>
              <button
                type="button"
                onClick={() => setSelectedFields(VISIT_EXPORT_FIELDS.map((field) => field.id))}
                className="text-sm font-semibold text-[#2b4594] hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedFields([])}
                className="text-sm font-semibold text-[#2b4594] hover:underline"
              >
                Deselect all
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {VISIT_EXPORT_FIELDS.map((field) => (
                <label key={field.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.id)}
                    onChange={() => toggleField(field.id)}
                    className="h-4 w-4 accent-[#2b4594]"
                  />
                  <span className="text-sm text-slate-700">{field.id}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="text-sm text-slate-500">
            {groupedVisits.length} row{groupedVisits.length === 1 ? '' : 's'} will be exported.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
            >
              <Download size={15} />
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const NewVisitModal = ({ sites, selectedSiteId, groups, onClose, onSaved }) => {
  const [siteId, setSiteId] = useState(selectedSiteId || '');
  const [groupId, setGroupId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!memberSearch.trim()) {
      setMemberSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/guards/members', {
          params: {
            search: memberSearch,
            status: 'Current',
            site_id: siteId || undefined,
          },
        });
        setMemberSuggestions((response.data || []).slice(0, 8));
      } catch {
        setMemberSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [memberSearch, siteId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const displayName = selectedMember?.name || memberSearch.trim();
    if (!displayName) {
      setError('Select a member or enter a visitor name');
      return;
    }

    const selectedGroup = groups.find((group) => group.id === groupId);
    setSaving(true);

    try {
      await api.post('/visits', {
        site_id: siteId || undefined,
        member_id: selectedMember?.id || undefined,
        name: selectedMember ? undefined : displayName,
        group: selectedGroup?.name || selectedMember?.visitor_group || undefined,
        notes: notes || undefined,
      });
      toast.success('Visit signed in');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign in');
    } finally {
      setSaving(false);
    }
  };

  const siteName = selectedSiteId === 'all' 
    ? 'All sites' 
    : sites.find((site) => site.id === selectedSiteId)?.name || 'site';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-800">New visit at {siteName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Site</label>
            <select
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Group</label>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            >
              <option value="">Please select</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Member name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={memberSearch}
                onChange={(event) => {
                  setMemberSearch(event.target.value);
                  setSelectedMember(null);
                }}
                placeholder="Search members"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              />
              {memberSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {memberSuggestions.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setSelectedMember(member);
                        setMemberSearch(member.name);
                        setGroupId(member.visitor_group_id || '');
                        setMemberSuggestions([]);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <span className="font-medium">{member.name}</span>
                      {member.visitor_group && (
                        <span className="ml-2 text-slate-400">({member.visitor_group})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#2b4594] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1e326e] disabled:opacity-60"
            >
              {saving ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditVisitModal = ({ visit, sites, groups, onClose, onSaved }) => {
  const extractTime = (val) => {
    if (!val || val === '--') return '';
    if (typeof val === 'string') {
      if (val.includes('T')) {
        const afterT = val.split('T')[1];
        if (afterT) return afterT.slice(0, 5);
      }
      if (val.includes(':')) {
        return val.trim().slice(0, 5);
      }
    }
    return '';
  };

  const extractDate = (val, fullTime) => {
    if (val && String(val).includes('-')) return String(val).trim().slice(0, 10);
    if (fullTime && typeof fullTime === 'string' && fullTime.includes('-')) {
      return fullTime.split('T')[0].slice(0, 10);
    }
    return toInputDate(new Date());
  };

  const [name, setName] = useState(visit.name || '');
  const [siteId, setSiteId] = useState(
    visit.site_id || sites.find((s) => s.name === visit.site)?.id || sites[0]?.id || ''
  );
  const [group, setGroup] = useState(visit.group || 'Visitor');
  const [trade, setTrade] = useState(visit.trade || '');
  const [employeeCompanyName, setEmployeeCompanyName] = useState(visit.employee_company_name || '');
  const [carReg, setCarReg] = useState(visit.car_reg || '');
  const [reason, setReason] = useState(visit.reason || '');
  const [date, setDate] = useState(extractDate(visit.date, visit.sign_in_time));
  const [timeIn, setTimeIn] = useState(extractTime(visit.sign_in_time));
  const [timeOut, setTimeOut] = useState(extractTime(visit.sign_out_time));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!timeIn) {
      setError('Signed-in time is required');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const response = await api.put(`/visits/${visit.id}`, {
        name: name.trim(),
        site_id: siteId,
        group,
        trade,
        employee_company_name: employeeCompanyName,
        car_reg: carReg,
        reason,
        date,
        time_in: timeIn,
        time_out: timeOut || null,
      });

      toast.success('Visit updated successfully');
      if (onSaved) onSaved(response.data.visit);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update visit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Edit visit</h2>
            <p className="text-xs text-slate-500 mt-0.5">Update visitor details and timings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Group</label>
              <select
                value={group}
                onChange={(e) => {
                  const nextGroup = e.target.value;
                  setGroup(nextGroup);
                  setEmployeeCompanyName('');
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              >
                {(groups.length > 0 ? groups : [
                  { id: '1', name: 'Visitors' },
                  { id: '2', name: 'Employees' },
                  { id: '3', name: 'Contractors' },
                  { id: '4', name: 'Workers' },
                  { id: '5', name: 'Deliveries' },
                ]).map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Signed In <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                required
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-slate-700">Signed Out</label>
                {timeOut && (
                  <button
                    type="button"
                    onClick={() => setTimeOut('')}
                    className="text-[11px] text-[#2b4594] hover:underline"
                    title="Set to currently on site"
                  >
                    Clear (On site)
                  </button>
                )}
              </div>
              <input
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                placeholder="--:--"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Trade / Company</label>
              <input
                type="text"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                placeholder="e.g. Electrical, Contractor"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Car Registration</label>
              <input
                type="text"
                value={carReg}
                onChange={(e) => setCarReg(e.target.value.toUpperCase())}
                placeholder="e.g. LJ75KUZ"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594] font-mono uppercase"
              />
            </div>
          </div>

          {!!group && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                {group.replace(/s$/i, '')} Company Name <span className="text-xs font-normal text-slate-400">(Optional)</span>
              </label>
              <input
                type="text"
                value={employeeCompanyName}
                onChange={(e) => setEmployeeCompanyName(e.target.value)}
                placeholder={`Enter ${group.replace(/s$/i, '').toLowerCase()} company name`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notes / Purpose of Visit</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for visit..."
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#2b4594] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1e326e] disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PreRegModal = ({ siteId, siteName, groups, onClose, onSaved }) => {
  const [mode, setMode] = useState('individual');
  const [visitorType, setVisitorType] = useState('returning');
  const [groupId, setGroupId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [newName, setNewName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [startDate, setStartDate] = useState(toInputDate(new Date()));
  const [arrivalTime, setArrivalTime] = useState('');
  const [notes, setNotes] = useState('');
  const [sendWelcome, setSendWelcome] = useState(false);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'individual' || !memberSearch.trim()) {
      setMemberSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/guards/members', {
          params: {
            search: memberSearch,
            status: 'Current',
            site_id: siteId,
          },
        });
        setMemberSuggestions((response.data || []).slice(0, 8));
      } catch {
        setMemberSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [memberSearch, mode, siteId]);

  const downloadTemplate = () => {
    downloadWorkbook(
      [
        {
          name: 'Jane Example',
          email: 'jane@example.com',
          phone: '+44 7700 900000',
          expected_date: `${toInputDate(new Date())}T09:00`,
          notes: 'Meeting with site team',
        },
      ],
      'pre-registration-template.xlsx',
      'PreRegistrations'
    );
  };

  const handleIndividualSubmit = async () => {
    const name = visitorType === 'returning'
      ? (selectedMember?.name || memberSearch.trim())
      : newName.trim();

    if (!name) {
      setError('Enter a visitor name or choose a returning visitor');
      return;
    }

    const expectedDate = arrivalTime
      ? new Date(`${startDate}T${arrivalTime}`).toISOString()
      : new Date(`${startDate}T00:00`).toISOString();

    await api.post('/pre-registrations', {
      site_id: siteId,
      name,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
      expected_date: expectedDate,
      visitor_group_id: groupId || selectedMember?.visitor_group_id || undefined,
      member_id: selectedMember?.id || undefined,
      send_welcome: sendWelcome && !!email,
    });
  };

  const handleBulkSubmit = async () => {
    if (!file) {
      setError('Choose a spreadsheet file first');
      return;
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    const validRows = rows.filter((row) => String(row.name || '').trim());

    if (!validRows.length) {
      setError('Your file must contain at least one row with a name');
      return;
    }

    await Promise.all(
      validRows.map((row) =>
        api.post('/pre-registrations', {
          site_id: siteId,
          name: String(row.name).trim(),
          email: row.email ? String(row.email).trim() : undefined,
          phone: row.phone ? String(row.phone).trim() : undefined,
          notes: row.notes ? String(row.notes).trim() : undefined,
          expected_date: row.expected_date
            ? new Date(String(row.expected_date)).toISOString()
            : undefined,
          visitor_group_id: groupId || undefined,
        })
      )
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (mode === 'individual') {
        await handleIndividualSubmit();
        toast.success('Pre-registration created');
      } else {
        await handleBulkSubmit();
        toast.success('Bulk pre-registrations imported');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save pre-registration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">New pre-registration at {siteName}</h2>
            <p className="mt-1 text-sm text-slate-500">Create an expected arrival before the visitor reaches site.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-200 px-6 py-4">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {[
              ['individual', 'Individual'],
              ['bulk', 'Bulk import'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`px-4 py-2 text-sm font-semibold ${
                  mode === value ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Group</label>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            >
              <option value="">Please select</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {mode === 'individual' ? (
            <>
              <div className="flex flex-wrap gap-6">
                {[
                  ['returning', 'Select returning visitor'],
                  ['new', 'Add new visitor'],
                ].map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="visitorType"
                      value={value}
                      checked={visitorType === value}
                      onChange={(event) => setVisitorType(event.target.value)}
                      className="h-4 w-4 accent-[#2b4594]"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Full name</label>
                {visitorType === 'returning' ? (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(event) => {
                        setMemberSearch(event.target.value);
                        setSelectedMember(null);
                      }}
                      placeholder="Search members"
                      className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                    />
                    {memberSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                        {memberSuggestions.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              setSelectedMember(member);
                              setMemberSearch(member.name);
                              setGroupId(member.visitor_group_id || groupId);
                              setMemberSuggestions([]);
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <span className="font-medium">{member.name}</span>
                            {member.visitor_group && (
                              <span className="ml-2 text-slate-400">({member.visitor_group})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Enter full name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                  />
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="visitor@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+44 7700 900000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Arrival time</label>
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(event) => setArrivalTime(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                />
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                Upload a spreadsheet with columns like <span className="font-semibold">name</span>,{' '}
                <span className="font-semibold">email</span>, <span className="font-semibold">phone</span>,{' '}
                <span className="font-semibold">expected_date</span>, and <span className="font-semibold">notes</span>.
              </div>

              <div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download size={15} />
                  Download template
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Upload file</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {file && <p className="mt-2 text-sm text-slate-500">Selected file: {file.name}</p>}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Welcome email toggle */}
          {mode === 'individual' && email && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Send welcome email</p>
                <p className="text-xs text-slate-500 mt-0.5">Send arrival confirmation and site info to visitor</p>
              </div>
              <div
                onClick={() => setSendWelcome(v => !v)}
                className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${sendWelcome ? 'bg-[#2b4594]' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${sendWelcome ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#2b4594] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1e326e] disabled:opacity-60"
            >
              {saving ? 'Saving...' : mode === 'individual' ? 'Pre-register' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PreRegTab = ({ siteId, siteName, groups, onVisitsChanged }) => {
  const [preRegs, setPreRegs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [groupFilter, setGroupFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    fetchPreRegs();
  }, [siteId, search, statusFilter]);

  const fetchPreRegs = async () => {
    setLoading(true);
    try {
      const response = await api.get('/pre-registrations', {
        params: {
          site_id: siteId,
          search: search || undefined,
          status: statusFilter !== 'All' ? statusFilter : undefined,
        },
      });
      setPreRegs(response.data || []);
    } catch {
      setPreRegs([]);
    } finally {
      setLoading(false);
    }
  };

  const visibleItems = useMemo(() => {
    return preRegs.filter((item) => groupFilter === 'All' || item.visitor_group === groupFilter);
  }, [groupFilter, preRegs]);

  const expectedToday = visibleItems.filter((item) => {
    if (!item.expected_date) return false;
    return toInputDate(new Date(item.expected_date)) === toInputDate(new Date());
  }).length;

  const allSelected = visibleItems.length > 0
    && visibleItems.every((item) => selectedIds.includes(item.id));

  const toggleSelection = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleItems.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleItems.map((item) => item.id)])));
  };

  const handleArrive = async (id) => {
    try {
      await api.post(`/pre-registrations/${id}/arrive`);
      toast.success('Visitor marked as arrived');
      await fetchPreRegs();
      onVisitsChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark visitor as arrived');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this pre-registration?')) return;
    try {
      await api.delete(`/pre-registrations/${id}`);
      toast.success('Pre-registration deleted');
      await fetchPreRegs();
      setSelectedIds((current) => current.filter((item) => item !== id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete pre-registration');
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) {
      toast.error('Select at least one pre-registration');
      return;
    }

    if (!window.confirm(`Delete ${selectedIds.length} pre-registration(s)?`)) return;

    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/pre-registrations/${id}`)));
      toast.success('Selected pre-registrations deleted');
      setSelectedIds([]);
      await fetchPreRegs();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete selected items');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="w-fit rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p className="text-2xl font-bold text-slate-800">{expectedToday}</p>
        <p className="mt-1 text-sm font-medium text-slate-500">Expected today</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
          >
            {['All', 'Pending', 'Arrived', 'Cancelled'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
          >
            <option value="All">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.name}>
                {group.name}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Trash2 size={15} />
            Delete
          </button>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
          >
            Pre-register
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[#2b4594]" />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Arrival time</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleItems.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    className="h-4 w-4 accent-[#2b4594]"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 text-slate-600">{item.visitor_group || '--'}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(item.expected_date)}</td>
                <td className="px-4 py-3 text-slate-600">{formatTime(item.expected_date)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.status === 'Arrived'
                        ? 'bg-blue-100 text-[#2b4594]'
                        : item.status === 'Cancelled'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {item.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleArrive(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#2b4594] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1e326e]"
                      >
                        <CheckCircle2 size={14} />
                        Arrived
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-slate-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && visibleItems.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <p className="text-lg font-semibold text-slate-600">There are no pre-registered visitors</p>
            <p className="text-sm">Create an expected arrival for {siteName || 'this site'} to start planning ahead.</p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-1 rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
            >
              Pre-register
            </button>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center text-sm text-slate-500">Loading pre-registrations...</div>
        )}
      </div>

      {showModal && (
        <PreRegModal
          siteId={siteId}
          siteName={siteName}
          groups={groups}
          onClose={() => setShowModal(false)}
          onSaved={fetchPreRegs}
        />
      )}
    </div>
  );
};

// ── Helpers: client-side image compression via canvas ───────────────────────
const compressImage = (file, maxPx = 1280, qualityJpeg = 0.82) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', qualityJpeg);
    };
    img.onerror = reject;
    img.src = url;
  });

// ── Deliveries Tab ───────────────────────────────────────────────────────────
const DeliveriesTab = ({ siteId, siteName }) => {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', supplier: '', car_registration: '', delivery_document_number: '', product: '', net_weight: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);   // raw File from picker
  const [imagePreview, setImagePreview] = useState(null); // object URL for <img>
  const [expandedId, setExpandedId] = useState(null); // row expanded for image preview
  const [showExportModal, setShowExportModal] = useState(false);
  const [includeExportPhotos, setIncludeExportPhotos] = useState(true);
  const [deliveryExportColumns, setDeliveryExportColumns] = useState([
    'Name', 'Site / Project', 'Date / Time', 'Supplier', 'Vehicle Reg', 'Delivery Document Number', 'Product', 'Net Weight', 'Image',
  ]);
  const fileInputRef = React.useRef(null);

  const API_BASE = import.meta.env.VITE_API_URL || '';

  const handlePrintReport = () => {
    if (!deliveryExportColumns.length) {
      toast.error('Select at least one column to export');
      return;
    }
    setShowExportModal(false);
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const deliveryFields = {
      Name: d => d.recipient || '—',
      'Site / Project': () => siteName || '—',
      'Date / Time': d => new Date(d.receivedAt || d.createdAt).toLocaleString('en-GB'),
      Supplier: d => d.supplier || d.sender || d.company || '—',
      'Vehicle Reg': d => d.carRegistration || '—',
      'Delivery Document Number': d => d.deliveryDocumentNumber || '—',
      Product: d => d.product || d.itemName || '—',
      'Net Weight': d => d.netWeight || '—',
    };
    const tableColumns = deliveryExportColumns.filter(c => c !== 'Image');
    const rowsHtml = filtered.map(d => `<tr>${tableColumns.map(c =>
      `<td style="padding:8px;border:1px solid #e2e8f0;">${deliveryFields[c](d)}</td>`
    ).join('')}</tr>`).join('');

    let picsHtml = '';
    if (includeExportPhotos && deliveryExportColumns.includes('Image')) {
      const withPics = filtered.filter(d => d.deliveryImageUrl);
      if (withPics.length > 0) {
        picsHtml = `
          <div style="margin-top:30px;page-break-before:always">
            <h3 style="margin-bottom:12px;color:#1e293b">Attached Delivery Pictures</h3>
            <div style="display:flex;flex-wrap:wrap;gap:16px;">
              ${withPics.map(d => `
                <div style="border:1px solid #e2e8f0;padding:8px;border-radius:6px;width:240px">
                  <p style="margin:0 0 6px;font-size:12px;font-weight:bold">${d.recipient || d.itemName || 'Item'}</p>
                  <img src="${API_BASE}${d.deliveryImageUrl}" style="width:100%;height:150px;object-fit:cover;border-radius:4px" />
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    printWin.document.write(`
      <html>
        <head>
          <title>Delivery Report - ${siteName || 'Site'}</title>
          <style>body { font-family: Arial, sans-serif; padding: 28px; color: #1e293b; }.report-head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2b4594;padding-bottom:14px}.report-head img{height:46px;max-width:170px;object-fit:contain}</style>
        </head>
        <body>
          <div class="report-head"><img src="${API_BASE}/Tipod_Final_Logo_high_pixel.png" alt="Tripod Services"/><div><h2 style="margin:0">Delivery Report</h2><p style="margin:5px 0 0;color:#64748b;font-size:13px">${siteName || 'Site'} · Generated ${new Date().toLocaleString('en-GB')}</p></div></div>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <thead>
              <tr style="background:#f8fafc;font-weight:bold;text-align:left;">
                ${tableColumns.map(c => `<th style="padding:8px;border:1px solid #e2e8f0;">${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          ${picsHtml}
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  const handleDeliveryExcelExport = () => {
    if (!deliveryExportColumns.length) return toast.error('Select at least one column to export');
    const values = {
      Name: d => d.recipient || '', 'Site / Project': () => siteName || '',
      'Date / Time': d => d.receivedAt ? new Date(d.receivedAt).toLocaleString('en-GB') : '',
      Supplier: d => d.supplier || d.sender || d.company || '',
      'Vehicle Reg': d => d.carRegistration || '',
      'Delivery Document Number': d => d.deliveryDocumentNumber || '',
      Product: d => d.product || d.itemName || '', 'Net Weight': d => d.netWeight || '',
      Image: d => d.deliveryImageUrl ? 'Included' : '',
    };
    const rows = filtered.map(delivery => Object.fromEntries(deliveryExportColumns.map(column => [column, values[column](delivery)])));
    downloadWorkbook(rows, `${(siteName || 'site').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-deliveries-export.xlsx`, 'Deliveries');
    toast.success(`Exported ${rows.length} delivery record${rows.length === 1 ? '' : 's'}`);
    setShowExportModal(false);
  };

  useEffect(() => { if (siteId) fetchDeliveries(); }, [siteId]);

  // Cleanup object URLs on unmount
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const res = await api.get('/deliveries', { params: { site_id: siteId } });
      setDeliveries(res.data || []);
    } catch { setDeliveries([]); }
    finally { setLoading(false); }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      const compressedFile = new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch {
      toast.error('Could not process image — please try another file');
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const resetModal = () => {
    setShowModal(false);
    setForm({ name: '', supplier: '', car_registration: '', delivery_document_number: '', product: '', net_weight: '', notes: '' });
    removeImage();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.supplier.trim() || !form.product.trim()) return;
    setSaving(true);
    try {
      if (imageFile) {
        // Multipart upload with image
        const fd = new FormData();
        fd.append('site_id', siteId);
        Object.entries(form).forEach(([key, value]) => fd.append(key, value));
        fd.append('delivery_image', imageFile, imageFile.name);
        await api.post('/deliveries', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/deliveries', { site_id: siteId, ...form });
      }
      toast.success('Delivery recorded');
      resetModal();
      fetchDeliveries();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record delivery');
    } finally { setSaving(false); }
  };

  const handleCollect = async (id) => {
    try {
      await api.post(`/deliveries/${id}/collect`);
      toast.success('Marked as collected');
      fetchDeliveries();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update delivery');
    }
  };

  const filtered = deliveries.filter(d =>
    !search || d.recipient?.toLowerCase().includes(search.toLowerCase()) ||
    d.sender?.toLowerCase().includes(search.toLowerCase()) ||
    d.carrier?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deliveries..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
            />
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <Download size={15} /> Export Report
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
          >
            Log delivery
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Sender</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Photo</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(d => (
              <React.Fragment key={d._id || d.id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.recipient}</td>
                  <td className="px-4 py-3 text-slate-600">{d.sender || '--'}</td>
                  <td className="px-4 py-3 text-slate-600">{d.carrier || '--'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {d.createdAt ? new Date(d.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${d.collected ? 'bg-blue-100 text-[#2b4594]' : 'bg-slate-100 text-slate-600'}`}>
                      {d.collected ? 'Collected' : 'Awaiting collection'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {d.deliveryImageUrl ? (
                      <button
                        type="button"
                        title="View delivery photo"
                        onClick={() => setExpandedId(expandedId === (d._id || d.id) ? null : (d._id || d.id))}
                        className="inline-flex items-center justify-center rounded-lg bg-slate-100 p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#2b4594] transition-colors"
                      >
                        <Camera size={15} />
                      </button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!d.collected && (
                      <button
                        type="button"
                        onClick={() => handleCollect(d._id || d.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#2b4594] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1e326e]"
                      >
                        <CheckCircle2 size={13} /> Collect
                      </button>
                    )}
                  </td>
                </tr>
                {/* Expandable photo row */}
                {expandedId === (d._id || d.id) && d.deliveryImageUrl && (
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-6 pb-4 pt-2">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Picture</p>
                      <img
                        src={`${API_BASE}${d.deliveryImageUrl}`}
                        alt="Delivery"
                        className="max-h-64 max-w-sm rounded-xl border border-slate-200 object-contain shadow-sm"
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <p className="text-lg font-semibold text-slate-600">No deliveries recorded</p>
            <p className="text-sm">Log a delivery to track parcels and packages for {siteName || 'this site'}.</p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-1 rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
            >
              Log delivery
            </button>
          </div>
        )}
        {loading && <div className="py-12 text-center text-sm text-slate-500">Loading deliveries...</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-md overflow-y-auto max-h-[90vh] rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-xl font-semibold text-slate-800">Log a delivery</h2>
              <button type="button" onClick={resetModal} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Site / Project</label>
                <input value={siteName || 'Current site'} disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Supplier *</label>
                <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Vehicle Reg</label>
                <input value={form.car_registration} onChange={e => setForm(f => ({ ...f, car_registration: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Delivery Document Number <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input value={form.delivery_document_number} onChange={e => setForm(f => ({ ...f, delivery_document_number: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Product *</label>
                <input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Net Weight <span className="text-slate-400 font-normal">(Optional)</span></label>
                <input value={form.net_weight} onChange={e => setForm(f => ({ ...f, net_weight: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Description</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]" />
              </div>

              {/* ── Delivery Picture ──────────────────────────────────────── */}
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Delivery Picture
                  <span className="ml-1.5 text-xs font-normal text-slate-400">(Optional)</span>
                </label>
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-36 w-full max-w-xs rounded-xl border border-slate-200 object-cover shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                      title="Remove photo"
                    >
                      <X size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#2b4594] hover:underline"
                    >
                      <Camera size={13} /> Retake / Replace
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500 hover:border-[#2b4594] hover:text-[#2b4594] transition-colors"
                  >
                    <ImagePlus size={18} />
                    <span>Tap to upload or capture photo</span>
                  </button>
                )}
                {/* Hidden file input: accept="image/*" + capture="environment" triggers camera on mobile */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetModal}
                  className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="rounded-lg bg-[#2b4594] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1e326e] disabled:opacity-60">
                  {saving ? 'Saving...' : 'Log delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Export Report Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Export Delivery Report</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Ready to export <strong>{filtered.length}</strong> delivery record(s) for <strong>{siteName || 'Current Site'}</strong>.
            </p>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={includeExportPhotos}
                onChange={e => setIncludeExportPhotos(e.target.checked)}
                className="w-4 h-4 rounded accent-[#2b4594]"
              />
              <div>
                <span className="text-sm font-semibold text-slate-800">Include delivery pictures in printable report</span>
                <p className="text-xs text-slate-500">Uncheck to generate a clean table-only report</p>
              </div>
            </label>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-800">Columns to include</p>
                <button type="button" onClick={() => setDeliveryExportColumns(['Name', 'Site / Project', 'Date / Time', 'Supplier', 'Vehicle Reg', 'Delivery Document Number', 'Product', 'Net Weight', 'Image'])} className="text-xs font-semibold text-[#2b4594] hover:underline">Select all</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['Name', 'Site / Project', 'Date / Time', 'Supplier', 'Vehicle Reg', 'Delivery Document Number', 'Product', 'Net Weight', 'Image'].map(column => (
                  <label key={column} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={deliveryExportColumns.includes(column)} onChange={() => setDeliveryExportColumns(current => current.includes(column) ? current.filter(c => c !== column) : [...current, column])} className="w-4 h-4 accent-[#2b4594]" />
                    {column}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
              >
                <Download size={15} /> Print / Export PDF
              </button>
              <button
                type="button"
                onClick={handleDeliveryExcelExport}
                className="inline-flex items-center gap-2 rounded-lg border border-[#2b4594] px-4 py-2 text-sm font-semibold text-[#2b4594] hover:bg-blue-50"
              >
                <Download size={15} /> Export Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ActivityPage = () => {
  const initialRange = getDateRange('today');
  const [activeTab, setActiveTab] = useState('visits');
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [groups, setGroups] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [stats, setStats] = useState({ totalIn: 0, groupCounts: [] });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [groupFilter, setGroupFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(true);
  const [showNewVisit, setShowNewVisit] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showColSettings, setShowColSettings] = useState(false);
  const [datePreset, setDatePreset] = useState('today');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [selectedVisitIds, setSelectedVisitIds] = useState([]);
  const [openVisitMenuId, setOpenVisitMenuId] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState('sign_in_time');
  const [sortDir, setSortDir] = useState('desc');
  const [visibleCols, setVisibleCols] = useState([
    'Name',
    'Photo',
    'Site',
    'Group',
    'Company Name',
    'Signed in',
    'Signed out',
    'Duration',
  ]);

  const actionsRef = useRef(null);
  const siteRef = useRef(null);
  const dateRef = useRef(null);
  const colRef = useRef(null);

  const firstName = localStorage.getItem('adminFirstName') || '';
  const lastName = localStorage.getItem('adminLastName') || '';
  // Also try decoding from the JWT token itself (works even before re-login)
  const adminName = (() => {
    if (firstName || lastName) return `${firstName} ${lastName}`.trim();
    try {
      const token = localStorage.getItem('adminToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const fn = payload.firstName || '';
        const ln = payload.lastName  || '';
        if (fn || ln) return `${fn} ${ln}`.trim();
        if (payload.email) return payload.email.split('@')[0];
      }
    } catch { /* ignore */ }
    return (localStorage.getItem('admin_remember_email') || 'Admin').split('@')[0];
  })();

  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const siteName = selectedSite?.name || 'My site';

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) setActionsOpen(false);
      if (siteRef.current && !siteRef.current.contains(event.target)) setSiteOpen(false);
      if (dateRef.current && !dateRef.current.contains(event.target)) setShowDatePicker(false);
      if (colRef.current && !colRef.current.contains(event.target)) setShowColSettings(false);
      setOpenVisitMenuId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (!selectedSiteId || selectedSiteId === 'all') return;
    loadGroups(selectedSiteId);
    loadVisitStats(selectedSiteId);
  }, [selectedSiteId]);

  useEffect(() => {
    if (!selectedSiteId || selectedSiteId === 'all') return;
    loadVisits();
  }, [selectedSiteId, dateFrom, dateTo, statusFilter, groupFilter, search]);

  const loadSites = async () => {
    try {
      const response = await api.get('/projects');
      const siteList = response.data || [];
      setSites(siteList);
      const firstSiteId = siteList[0]?.id || '';
      setSelectedSiteId((current) => current || firstSiteId);
      // Load groups immediately for the first site
      if (firstSiteId) {
        loadGroups(firstSiteId);
        loadVisitStats(firstSiteId);
      }
    } catch (err) {
      setSites([]);
      if (err.response?.status !== 404) {
        console.error('Failed to load sites', err);
      }
    }
  };

  const loadGroups = async (siteId) => {
    try {
      const response = await api.get('/visitor-groups', {
        params: { project_id: siteId },
      });
      const groupList = response.data || [];
      setGroups(groupList);
      setGroupFilter((current) =>
        current !== 'All' && !groupList.some((group) => group.name === current)
          ? 'All'
          : current
      );
    } catch {
      setGroups([]);
    }
  };

  const loadVisitStats = async (siteId) => {
    try {
      const response = await api.get('/visits/stats', {
        params: { site_id: siteId },
      });
      setStats(response.data || { totalIn: 0, groupCounts: [] });
    } catch {
      setStats({ totalIn: 0, visitorsIn: 0, employeesIn: 0 });
    }
  };

  const loadVisits = async () => {
    setLoadingVisits(true);
    try {
      const response = await api.get('/visits', {
        params: {
          site_id: selectedSiteId,
          date_from: dateFrom,
          date_to: dateTo,
          status: statusFilter !== 'All' ? statusFilter : undefined,
          group: groupFilter !== 'All' ? groupFilter : undefined,
          search: search || undefined,
        },
      });
      setVisits(response.data || []);
    } catch {
      setVisits([]);
    } finally {
      setLoadingVisits(false);
    }
  };

  const handleDatePreset = (preset) => {
    const range = getDateRange(preset);
    setDatePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setShowDatePicker(false);
  };

  const handleCustomDateChange = (field, value) => {
    setDatePreset('custom');
    if (field === 'from') setDateFrom(value);
    if (field === 'to') setDateTo(value);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortDir(column === 'name' ? 'asc' : 'desc');
  };

  const visibleVisits = useMemo(() => {
    const rows = [...visits];

    rows.sort((a, b) => {
      let left = a[sortBy];
      let right = b[sortBy];

      if (sortBy === 'duration') {
        left = parseFloat(String(formatVisitDuration(a)).replace('h', '')) || 0;
        right = parseFloat(String(formatVisitDuration(b)).replace('h', '')) || 0;
      } else if (sortBy === 'name' || sortBy === 'group' || sortBy === 'site') {
        left = String(left || '').toLowerCase();
        right = String(right || '').toLowerCase();
      } else {
        left = left ? new Date(left).getTime() : 0;
        right = right ? new Date(right).getTime() : 0;
      }

      if (left < right) return sortDir === 'asc' ? -1 : 1;
      if (left > right) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [sortBy, sortDir, visits]);

  const allVisibleSelected = visibleVisits.length > 0
    && visibleVisits.every((visit) => selectedVisitIds.includes(visit.id));

  const toggleVisitSelection = (id) => {
    setSelectedVisitIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const toggleSelectAllVisits = () => {
    if (allVisibleSelected) {
      setSelectedVisitIds((current) => current.filter((id) => !visibleVisits.some((visit) => visit.id === id)));
      return;
    }
    setSelectedVisitIds((current) => Array.from(new Set([...current, ...visibleVisits.map((visit) => visit.id)])));
  };

  const handleSignOutVisit = async (id) => {
    try {
      await api.post(`/visits/${id}/sign-out`);
      toast.success('Visitor signed out');
      await Promise.all([loadVisits(), loadVisitStats(selectedSiteId)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign out visitor');
    }
  };

  const handleDeleteVisit = async (id) => {
    if (!window.confirm('Delete this visit?')) return;

    try {
      await api.delete(`/visits/${id}`);
      toast.success('Visit deleted');
      setSelectedVisitIds((current) => current.filter((item) => item !== id));
      await Promise.all([loadVisits(), loadVisitStats(selectedSiteId)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete visit');
    }
  };

  const handleBulkSignOut = async () => {
    const activeIds = visibleVisits
      .filter((visit) => selectedVisitIds.includes(visit.id) && !visit.sign_out_time)
      .map((visit) => visit.id);

    if (!activeIds.length) {
      toast.error('Select at least one active visit');
      return;
    }

    try {
      await Promise.all(activeIds.map((id) => api.post(`/visits/${id}/sign-out`)));
      toast.success(`Signed out ${activeIds.length} visit${activeIds.length === 1 ? '' : 's'}`);
      setSelectedVisitIds([]);
      await Promise.all([loadVisits(), loadVisitStats(selectedSiteId)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sign out selected visits');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedVisitIds.length) {
      toast.error('Select at least one visit');
      return;
    }

    if (!window.confirm(`Delete ${selectedVisitIds.length} selected visit(s)?`)) return;

    try {
      await Promise.all(selectedVisitIds.map((id) => api.delete(`/visits/${id}`)));
      toast.success('Selected visits deleted');
      setSelectedVisitIds([]);
      await Promise.all([loadVisits(), loadVisitStats(selectedSiteId)]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete selected visits');
    }
  };

  const visitColumns = [
    {
      key: 'Name',
      header: (
        <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-1">
          Name
        </button>
      ),
      render: (visit) => <span className="font-medium text-slate-800">{visit.name}</span>,
    },
    {
      key: 'Photo',
      header: <span>Photo</span>,
      render: (visit) => (
        <div className="relative inline-block">
          {visit.image_url
            ? <img src={visit.image_url} alt={visit.name} className="w-9 h-9 rounded-full object-cover block" />
            : <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                {(visit.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
              </div>
          }
          {/* Status dot — bottom-right corner like MS Teams / Office */}
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${visit.sign_out_time ? 'bg-red-500' : 'bg-green-500'}`} />
        </div>
      ),
    },
    {
      key: 'Site',
      header: (
        <button type="button" onClick={() => handleSort('site')} className="inline-flex items-center gap-1">
          Site
        </button>
      ),
      render: (visit) => visit.site || '--',
    },
    {
      key: 'Group',
      header: (
        <button type="button" onClick={() => handleSort('group')} className="inline-flex items-center gap-1">
          Group
        </button>
      ),
      render: (visit) => visit.group || '--',
    },
    {
      key: 'Company Name',
      header: <span>Company name</span>,
      render: (visit) => visit.employee_company_name || '--',
    },
    {
      key: 'Signed in',
      header: (
        <button type="button" onClick={() => handleSort('sign_in_time')} className="inline-flex items-center gap-1">
          Signed in
        </button>
      ),
      render: (visit) => (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-slate-700 font-medium">{formatDateTime(visit.sign_in_time)}</span>
        </div>
      ),
    },
    {
      key: 'Signed out',
      header: (
        <button type="button" onClick={() => handleSort('sign_out_time')} className="inline-flex items-center gap-1">
          Signed out
        </button>
      ),
      render: (visit) => visit.sign_out_time ? (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
          <span className="text-slate-600">{formatDateTime(visit.sign_out_time)}</span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          On site
        </span>
      ),
    },
    {
      key: 'Duration',
      header: (
        <button type="button" onClick={() => handleSort('duration')} className="inline-flex items-center gap-1">
          Duration
        </button>
      ),
      render: (visit) => formatVisitDuration(visit),
    },
    {
      key: 'Notes',
      header: <span>Notes</span>,
      render: (visit) => visit.reason || '--',
    },
    // PERSONAL FIELDS
    {
      key: 'Email',
      header: <span>Email</span>,
      render: (visit) => visit.email || '--',
    },
    {
      key: 'Mobile',
      header: <span>Mobile</span>,
      render: (visit) => visit.phone || '--',
    },
    {
      key: 'Role',
      header: <span>Role</span>,
      render: (visit) => visit.role || '--',
    },
  ];

  // Separate columns into sections for the settings panel
  const VISIT_DETAIL_COLS = ['Name', 'Photo', 'Site', 'Group', 'Company Name', 'Signed in', 'Signed out', 'Duration', 'Notes'];
  const PERSONAL_FIELD_COLS = ['Email', 'Mobile', 'Role'];

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <Toaster position="top-right" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8 pt-8 pb-8">

        {/* ── No sites yet banner ─────────────────────────────────── */}
        {sites.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#2b4594]/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2b4594" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">No sites created yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Go to <strong>Manage → Sites</strong> and create your first site to start tracking visitor activity.
              </p>
            </div>
            <a href="/admin/manage/sites"
              className="px-5 py-2 bg-[#2b4594] hover:bg-[#1e326e] text-white rounded-lg text-sm font-semibold transition-colors">
              Create a site
            </a>
          </div>
        )}

        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-800">
            Hi {adminName}, here&apos;s the latest at
          </h1>

          <div className="relative" ref={siteRef}>
            <button
              type="button"
              onClick={() => setSiteOpen((current) => !current)}
              className="inline-flex items-center gap-1 border-b border-dashed border-slate-400 text-4xl font-light tracking-tight text-slate-600 hover:text-slate-800"
            >
              {siteName}
              <ChevronDown size={22} />
            </button>

            {siteOpen && (
              <div className="absolute left-0 top-full z-30 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <button
                  type="button"
                  onClick={() => { setSelectedSiteId('all'); setSelectedVisitIds([]); setSiteOpen(false); }}
                  className={`block w-full px-4 py-3 text-left text-sm font-medium border-b border-slate-100 ${
                    selectedSiteId === 'all'
                      ? 'bg-slate-50 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  style={{ color: selectedSiteId === 'all' ? '#2b4594' : undefined }}
                >
                  All sites
                </button>
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => {
                      setSelectedSiteId(site.id);
                      setSelectedVisitIds([]);
                      setSiteOpen(false);
                    }}
                    className={`block w-full px-4 py-3 text-left text-sm font-medium ${
                      site.id === selectedSiteId
                        ? 'bg-slate-50 font-semibold' + ' text-blue-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    style={{ color: site.id === selectedSiteId ? '#2b4594' : undefined }}
                  >
                    {site.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-b border-slate-200">
          <div className="flex items-center gap-8">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-4 pb-4 pt-1 text-xl font-medium ${
                  activeTab === tab.id
                    ? 'border-[#2b4594] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'visits' && (
          <>
            <div className="flex flex-wrap gap-4">
              <StatCard label="Total in" value={stats.totalIn ?? 0} />
              {(stats.groupCounts || []).map((gc) => (
                <StatCard key={gc.group} label={`${gc.group} in`} value={gc.count} />
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[280px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                  />
                </div>

                <div className="relative" ref={dateRef}>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker((current) => !current)}
                    className="inline-flex items-center gap-3 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-500">
                      {datePreset === 'today'
                        ? 'Today'
                        : datePreset === 'yesterday'
                          ? 'Yesterday'
                          : datePreset === 'last7'
                            ? 'Last 7 days'
                            : datePreset === 'last30'
                              ? 'Last 30 days'
                              : 'Custom'}
                    </span>
                    <span>
                      {formatDate(dateFrom)} - {formatDate(dateTo)}
                    </span>
                    <CalendarDays size={16} className="text-slate-400" />
                  </button>

                  {showDatePicker && (
                    <div className="absolute left-0 top-full z-30 mt-2 w-[340px] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                        <button type="button" onClick={() => handleDatePreset('today')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Today</button>
                        <button type="button" onClick={() => handleDatePreset('yesterday')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Yesterday</button>
                        <button type="button" onClick={() => handleDatePreset('last7')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Last 7 days</button>
                        <button type="button" onClick={() => handleDatePreset('last30')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Last 30 days</button>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(event) => handleCustomDateChange('from', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(event) => handleCustomDateChange('to', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${
                    showFilters
                      ? 'border-[#2b4594] bg-blue-50 text-[#2b4594]'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Filter size={15} />
                  Filters
                </button>

                <div className="flex-1" />

                <div className="relative" ref={actionsRef}>
                  <button
                    type="button"
                    onClick={() => setActionsOpen((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Actions
                    <ChevronDown size={14} />
                  </button>

                  {actionsOpen && (
                    <div className="absolute right-0 top-full z-30 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setShowExport(true);
                          setActionsOpen(false);
                        }}
                        className="block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Export All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionsOpen(false);
                          handleBulkSignOut();
                        }}
                        className="block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Sign out selected
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionsOpen(false);
                          handleBulkDelete();
                        }}
                        className="block w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete selected
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewVisit(true)}
                  className="rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
                >
                  New visit
                </button>

                {/* Column visibility — in toolbar so it renders above the table scroll */}
                <div className="relative" ref={colRef}>
                  <button
                    type="button"
                    onClick={() => setShowColSettings(c => !c)}
                    className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    title="Show/hide columns"
                  >
                    <Settings size={15} />
                  </button>
                  {showColSettings && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl max-h-80 overflow-y-auto">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Visit details</p>
                      {visitColumns.filter(c => VISIT_DETAIL_COLS.includes(c.key)).map((column) => (
                        <label key={column.key} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                          <input
                            type="checkbox"
                            checked={visibleCols.includes(column.key)}
                            onChange={() => setVisibleCols(cur =>
                              cur.includes(column.key) ? cur.filter(i => i !== column.key) : [...cur, column.key]
                            )}
                            className="h-4 w-4 accent-[#2b4594]"
                          />
                          {column.key}
                        </label>
                      ))}
                      <p className="mt-3 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Personal fields</p>
                      {visitColumns.filter(c => PERSONAL_FIELD_COLS.includes(c.key)).map((column) => (
                        <label key={column.key} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1">
                          <input
                            type="checkbox"
                            checked={visibleCols.includes(column.key)}
                            onChange={() => setVisibleCols(cur =>
                              cur.includes(column.key) ? cur.filter(i => i !== column.key) : [...cur, column.key]
                            )}
                            className="h-4 w-4 accent-[#2b4594]"
                          />
                          {column.key}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {showFilters && (
                <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                    >
                      {['All', 'In', 'Out'].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Group</label>
                    <select
                      value={groupFilter}
                      onChange={(event) => setGroupFilter(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2b4594] focus:ring-1 focus:ring-[#2b4594]"
                    >
                      <option value="All">All</option>
                      {(groups.length > 0 ? groups : [
                        {id:'v', name:'Visitors'}, {id:'e', name:'Employees'}, {id:'d', name:'Deliveries'}
                      ]).map((group) => (
                        <option key={group.id} value={group.name}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

      <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisits}
                        className="h-4 w-4 accent-[#2b4594]"
                      />
                    </th>

                    {visitColumns
                      .filter((column) => visibleCols.includes(column.key))
                      .map((column) => (
                        <th key={column.key} className="px-4 py-3">
                          {column.header}
                        </th>
                      ))}

                    <th className="w-14 px-4 py-3" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {visibleVisits.map((visit) => (
                    <tr
                      key={visit.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => { setSelectedVisit(visit); setDrawerOpen(true); }}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedVisitIds.includes(visit.id)}
                          onChange={() => toggleVisitSelection(visit.id)}
                          className="h-4 w-4 accent-[#2b4594]"
                        />
                      </td>

                      {visitColumns
                        .filter((column) => visibleCols.includes(column.key))
                        .map((column) => (
                          <td key={`${visit.id}-${column.key}`} className="px-4 py-3 text-slate-600">
                            {column.render(visit)}
                          </td>
                        ))}

                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              setOpenVisitMenuId((current) => (current === visit.id ? null : visit.id));
                            }}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <MoreHorizontal size={15} />
                          </button>

                          {openVisitMenuId === visit.id && (
                            <div className="absolute right-0 top-full z-50 mt-1 min-w-[170px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                              {!visit.sign_out_time && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                  onClick={() => {
                                    setOpenVisitMenuId(null);
                                    handleSignOutVisit(visit.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <LogOut size={14} />
                                  Sign out
                                </button>
                              )}
                              <button
                                type="button"
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                onClick={() => {
                                  setOpenVisitMenuId(null);
                                  setEditingVisit(visit);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil size={14} />
                                Edit visit
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                onClick={() => {
                                  setOpenVisitMenuId(null);
                                  handleDeleteVisit(visit.id);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                                Delete visit
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loadingVisits && visibleVisits.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                  <p className="text-lg font-semibold text-slate-600">There is no visitor activity</p>
                  <p className="text-sm">Activity appears here when someone signs in at {siteName}.</p>
                  <button
                    type="button"
                    onClick={() => setShowNewVisit(true)}
                    className="mt-1 rounded-lg bg-[#2b4594] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e326e]"
                  >
                    New visit
                  </button>
                </div>
              )}

              {loadingVisits && (
                <div className="py-12 text-center text-sm text-slate-500">Loading visits...</div>
              )}
            </div>
            </div>
          </>
        )}

        {activeTab === 'prereg' && selectedSiteId && (
          <PreRegTab
            siteId={selectedSiteId}
            siteName={siteName}
            groups={groups}
            onVisitsChanged={() => {
              loadVisits();
              loadVisitStats(selectedSiteId);
            }}
          />
        )}

        {activeTab === 'deliveries' && (
          <DeliveriesTab siteId={selectedSiteId} siteName={siteName} />
        )}
      </div>

      {showNewVisit && (
        <NewVisitModal
          sites={sites}
          selectedSiteId={selectedSiteId || sites[0]?.id || ''}
          groups={groups}
          onClose={() => setShowNewVisit(false)}
          onSaved={() => {
            loadVisits();
            loadVisitStats(selectedSiteId);
          }}
        />
      )}

      {showExport && (
        <ExportModal
          visits={visibleVisits}
          groups={groups}
          siteName={siteName}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* ── Visit detail slide-out drawer ─────────────────────── */}
      <SlideOutDrawer
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedVisit(null); }}
        title=""
        actions={
          selectedVisit && !selectedVisit.sign_out_time ? (
            <button
              type="button"
              onClick={async () => {
                await handleSignOutVisit(selectedVisit.id);
                setDrawerOpen(false);
                setSelectedVisit(null);
              }}
              className="w-full rounded-lg bg-[#2b4594] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e326e]"
            >
              Sign out
            </button>
          ) : null
        }
      >
        {selectedVisit && (
          <div className="space-y-6">
            {/* Avatar + name + group */}
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                {selectedVisit.image_url
                  ? <img src={selectedVisit.image_url} alt={selectedVisit.name} className="w-16 h-16 rounded-full object-cover" />
                  : (
                    <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600">
                      {(selectedVisit.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )
                }
                <span className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${selectedVisit.sign_out_time ? 'bg-slate-400' : 'bg-green-500'}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{selectedVisit.name}</p>
                <p className="text-sm text-slate-500">{selectedVisit.group || '—'}</p>
              </div>
            </div>

            {/* In and out */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">In and out</p>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <span className="text-slate-500">Site</span>
                <span className="font-medium text-slate-800">{selectedVisit.site || siteName}</span>

                <span className="text-slate-500">Signed in</span>
                <div>
                  <span className="font-medium text-slate-800">
                    {formatDateTime(selectedVisit.sign_in_time)}
                  </span>
                  {selectedVisit.checked_in_by && (
                    <p className="text-xs text-slate-400 mt-0.5">by {selectedVisit.checked_in_by}</p>
                  )}
                </div>

                <span className="text-slate-500">Signed out</span>
                <span className="font-medium text-slate-800">
                  {selectedVisit.sign_out_time ? formatDateTime(selectedVisit.sign_out_time) : '—'}
                </span>

                <span className="text-slate-500">Total time</span>
                <span className="font-medium text-slate-800">{selectedVisit.duration || '—'}</span>
              </div>
            </div>

            {/* Sign in fields */}
            {(selectedVisit.trade || selectedVisit.employee_company_name || selectedVisit.car_reg || selectedVisit.reason) && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sign in fields</p>
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-sm">
                  {selectedVisit.trade && (
                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-slate-500">Trade</span>
                      <span className="font-medium text-slate-800">{selectedVisit.trade}</span>
                    </div>
                  )}
                  {selectedVisit.employee_company_name && (
                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-slate-500">Company name</span>
                      <span className="font-medium text-slate-800">{selectedVisit.employee_company_name}</span>
                    </div>
                  )}
                  {selectedVisit.car_reg && (
                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-slate-500">Car registration</span>
                      <span className="font-medium text-slate-800">{selectedVisit.car_reg}</span>
                    </div>
                  )}
                  {selectedVisit.reason && (
                    <div className="grid grid-cols-2 gap-2">
                      <span className="text-slate-500">Notes</span>
                      <span className="font-medium text-slate-800">{selectedVisit.reason}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Actions</p>
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSelectedVisit(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <User size={16} className="text-slate-400" />
                  View profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setSelectedVisit(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <History size={16} className="text-slate-400" />
                  View visit history
                </button>
                {!selectedVisit.sign_out_time && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleSignOutVisit(selectedVisit.id);
                      setDrawerOpen(false);
                      setSelectedVisit(null);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut size={16} className="text-slate-400" />
                    Sign out now
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingVisit(selectedVisit);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Pencil size={16} className="text-slate-400" />
                  Edit visit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleDeleteVisit(selectedVisit.id);
                    setDrawerOpen(false);
                    setSelectedVisit(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} className="text-red-400" />
                  Delete visit
                </button>
              </div>
            </div>
          </div>
        )}
      </SlideOutDrawer>

      {editingVisit && (
        <EditVisitModal
          visit={editingVisit}
          sites={sites}
          groups={groups}
          onClose={() => setEditingVisit(null)}
          onSaved={(updatedVisit) => {
            loadVisits();
            if (selectedSiteId) loadVisitStats(selectedSiteId);
            if (selectedVisit && selectedVisit.id === editingVisit.id) {
              setSelectedVisit(updatedVisit);
            }
          }}
        />
      )}
    </div>
  );
};

export default ActivityPage;
