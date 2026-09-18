import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Check, ChevronDown, Download, LogIn, LogOut, RefreshCw, Search, ShieldCheck, X, Bell, Package } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { TRIPOD_LOGO_BASE64 } from '../assets/logoBase64';
import {
  getAccessibleSites,
  getPreRegistrations,
  getVisits,
  getVisitorGroups,
  markPreRegisteredArrival,
  signInVisitor,
  signOutVisit,
} from '../services/enterprisePortal';

// ── Helpers ────────────────────────────────────────────────────────────────
const toApiDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDateShort = (d) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// Extract just the date: "16 Sep 2026"
const fmtDateOnly = (val) =>
  val ? new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Extract just the time: "09:15"
const fmtTimeOnly = (val) =>
  val ? new Date(val).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

// Compute duration between two timestamps: returns "2h 15m", "45 min", or "—"
const fmtDuration = (from, to) => {
  if (!from || !to) return '—';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
};

// DD-MM-YYYY for filenames
const formatDateFile = (d) => {
  const date = d || new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const TABS = ['On Site', 'Signed Out', 'Expected'];

const fmtDetailDate = (val) => {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return val; }
};

const PersonDetailsModal = ({ visible, onClose, person }) => {
  if (!person) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, padding: 20, elevation: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Person Details</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color="#9ca3af" /></TouchableOpacity>
          </View>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: person.sign_out_time ? '#e5e7eb' : '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: person.sign_out_time ? '#6b7280' : '#16a34a' }}>
                {(person.name || 'P')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' }}>{person.name}</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>{person.group || 'Visitor'}</Text>
          </View>
          <View style={{ gap: 12 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Status</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: person.sign_out_time ? '#ef4444' : '#16a34a', marginTop: 2 }}>
                {person.sign_out_time ? 'Signed Out' : person.expected_date ? 'Expected (Pre-Registered)' : 'On-Site (Active)'}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Time</Text>
              <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>
                {fmtDetailDate(person.sign_in_time || person.expected_date || person.check_in_time)}
              </Text>
            </View>
            {person.sign_out_time ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Sign Out</Text>
                <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>{fmtDetailDate(person.sign_out_time)}</Text>
              </View>
            ) : null}
            {person.notes ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Notes</Text>
                <Text style={{ fontSize: 14, color: '#4b5563', marginTop: 2, fontStyle: 'italic' }}>{person.notes}</Text>
              </View>
            ) : null}
            {person.email ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Email</Text>
                <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>{person.email}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const fmtTime = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
  } catch {
    return value;
  }
  return String(value).slice(0, 5);
};

const CheckInModal = ({
  visible,
  onClose,
  onSubmit,
  loading,
  visitorGroups,
  defaultGroup,
}) => {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [carRegistration, setCarRegistration] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (visible) {
      setName('');
      setNotes('');
      setCarRegistration('');
      setCompanyName('');
      // The company field is intentionally hidden until the guard chooses a type.
      setGroup('');
    }
  }, [visible, defaultGroup, visitorGroups]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Sign in person</Text>
          <Text style={s.modalBody}>Enter the person’s name, choose their group, then sign them in.</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor="#9ca3af"
            style={s.input}
          />

          <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={s.groupPicker}>
            {['Visitor', 'Worker', 'Contractor', 'Employee'].map((groupName) => {
              const active = group === groupName;
              return (
                <TouchableOpacity
                  key={groupName}
                  onPress={() => { setGroup(groupName); setCompanyName(''); }}
                  style={[s.groupChip, active && s.groupChipActive]}
                >
                  <Text style={[s.groupChipText, active && s.groupChipTextActive]}>{groupName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput value={carRegistration} onChangeText={setCarRegistration} placeholder="Car registration number" placeholderTextColor="#9ca3af" style={s.input} autoCapitalize="characters" />
          {!!group && (
            <TextInput value={companyName} onChangeText={setCompanyName} placeholder={`${group} Company Name (optional)`} placeholderTextColor="#9ca3af" style={s.input} />
          )}

          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional note"
            placeholderTextColor="#9ca3af"
            style={[s.input, s.notesInput]}
            multiline
          />

          <View style={s.modalBtns}>
            <TouchableOpacity onPress={onClose} style={s.modalCancelBtn}>
              <Text style={s.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!name.trim()) {
                  Alert.alert('Name required', 'Please enter the visitor or staff name.');
                  return;
                }
                if (!group) {
                  Alert.alert('Person type required', 'Please choose Visitor, Worker, Contractor, or Employee.');
                  return;
                }
                onSubmit({ name: name.trim(), group, notes: notes.trim(), carRegistration: carRegistration.trim(), companyName: companyName.trim() });
              }}
              disabled={loading}
              style={s.modalConfirmBtn}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmTxt}>Sign in</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const SecurityGuardScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('On Site');
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [onSite, setOnSite] = useState([]);
  const [signedOut, setSignedOut] = useState([]);
  const [expected, setExpected] = useState([]);
  const [visitorGroups, setVisitorGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [signOutTarget, setSignOutTarget] = useState(null);
  const [signingOutVisitor, setSigningOutVisitor] = useState(false);
  const [arrivingId, setArrivingId] = useState(null);
  const [arrivalTarget, setArrivalTarget] = useState(null);
  const [arrivalCarRegistration, setArrivalCarRegistration] = useState('');
  const [arrivalCompanyName, setArrivalCompanyName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);    // Date | null — for export date filter
  const [dateTo, setDateTo]     = useState(null);    // Date | null
  const [showDatePicker, setShowDatePicker] = useState(null); // 'from' | 'to' | null

  // Export report options
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportOptionalFields, setExportOptionalFields] = useState({
    carReg: true,
    expectedArrival: true,
    description: true,
  });

  const toggleOptionalField = (key) => {
    setExportOptionalFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const guardName = user?.name || user?.firstName || 'Security Guard';

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  const loadSiteData = useCallback(async (siteIdOverride) => {
    const siteId = siteIdOverride || selectedSite?.id;
    if (!siteId) return;

    const [currentVisits, signedOutVisits, preRegistered, groups] = await Promise.all([
      getVisits({ siteId, status: 'In' }).catch(() => []),
      getVisits({ siteId, status: 'Out' }).catch(() => []),
      getPreRegistrations({ siteId, status: 'Pending' }).catch(() => []),
      getVisitorGroups(siteId).catch(() => []),
    ]);

    setOnSite(currentVisits);
    setSignedOut(signedOutVisits);
    setExpected(preRegistered);
    setVisitorGroups(groups);
  }, [selectedSite]);

  const load = useCallback(async () => {
    try {
      const siteList = await getAccessibleSites(user?.project_id);
      setSites(siteList);

      let resolvedSite = selectedSite;
      if (!resolvedSite && siteList.length) {
        resolvedSite = siteList[0];
        setSelectedSite(siteList[0]);
      }

      if (resolvedSite?.id) {
        await loadSiteData(resolvedSite.id);
      }
    } catch (error) {
      console.log('SecurityGuardScreen load error:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSiteData, selectedSite, user?.project_id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const safeFilename = (name) =>
    String(name || 'Site')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40);

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const handleExport = async (format = 'pdf', optionalFields = exportOptionalFields) => {
    setExporting(true);
    try {
      const siteName = selectedSite?.name || 'Site';
      const tabName  = activeTab;
      const SERVER_BASE = api.defaults.baseURL?.replace(/\/api\/?$/, '') || 'https://tripod-signin-app.onrender.com';
      const reportTitle = `Security Report — ${tabName}`;

      // If date filters are set, fetch a date-filtered list from the API
      let exportList;
      if ((dateFrom || dateTo) && selectedSite?.id) {
        const status = activeTab === 'Signed Out' ? 'Out' : 'In';
        const records = await getVisits({
          siteId: selectedSite.id,
          status,
          dateFrom: toApiDate(dateFrom),
          dateTo:   toApiDate(dateTo),
        }).catch(() => []);
        exportList = filterItems(records);
      } else {
        exportList = activeTab === 'On Site' ? filteredOnSite
          : activeTab === 'Signed Out' ? filteredSignedOut
          : filteredExpected;
      }

      if (!exportList.length) {
        Alert.alert('Nothing to export', 'There are no records for the selected date range.');
        return;
      }

      // ── Build Dynamic Columns ─────────────────────────────────────────────
      // Core columns always included with proportional weights and nowrap rules:
      const columns = [
        { label: 'Date', key: 'date', weight: 10, nowrap: true, getVal: (item) => fmtDateOnly(item.sign_in_time || item.expected_date || item.createdAt) },
        { label: 'Name', key: 'name', weight: 18, nowrap: false, getVal: (item) => item.name || '—' },
        { label: 'Role', key: 'role', weight: 10, nowrap: false, getVal: (item) => item.group || item.visitor_group_name || '—' },
        { label: 'Sign In', key: 'signIn', weight: 8, nowrap: true, getVal: (item) => fmtTimeOnly(item.sign_in_time) },
        { label: 'Sign Out', key: 'signOut', weight: 8, nowrap: true, getVal: (item) => fmtTimeOnly(item.sign_out_time) },
        { label: 'Duration', key: 'duration', weight: 8, nowrap: true, getVal: (item) => fmtDuration(item.sign_in_time, item.sign_out_time) },
        { label: 'Company Name', key: 'company', weight: 14, nowrap: false, getVal: (item) => item.employee_company_name || item.employeeCompanyName || item.trade || item.company_name || '—' },
      ];

      // Optional columns based on user checklist selection:
      if (optionalFields?.carReg) {
        columns.push({ label: 'Car Registration', key: 'carReg', weight: 11, nowrap: true, getVal: (item) => item.car_reg || '—' });
      }
      if (optionalFields?.expectedArrival) {
        columns.push({
          label: 'Expected Arrival',
          key: 'expectedArrival',
          weight: 12,
          nowrap: true,
          getVal: (item) => item.expected_date ? `${fmtDateOnly(item.expected_date)} ${fmtTimeOnly(item.expected_date)}` : '—',
        });
      }
      if (optionalFields?.description) {
        columns.push({ label: 'Description', key: 'description', weight: 13, nowrap: false, getVal: (item) => item.notes || item.description || item.reason || '—' });
      }

      const totalWeight = columns.reduce((acc, c) => acc + c.weight, 0);
      const colWidths = columns.map((c) => Math.round((c.weight / totalWeight) * 100));
      const sumRounded = colWidths.reduce((a, b) => a + b, 0);
      if (colWidths.length > 0) {
        colWidths[colWidths.length - 1] += (100 - sumRounded);
      }

      const theadHtml = columns
        .map((col, i) => `<th style="width:${colWidths[i]}%">${escapeHtml(col.label)}</th>`)
        .join('');

      const tbodyHtml = exportList
        .map((item, idx) => {
          const cells = columns
            .map((col, i) => `<td style="width:${colWidths[i]}%;${col.nowrap ? 'white-space:nowrap;' : ''}">${escapeHtml(col.getVal(item))}</td>`)
            .join('');
          return `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}">${cells}</tr>`;
        })
        .join('');

      const periodLabel =
        dateFrom || dateTo
          ? `${dateFrom ? formatDateShort(dateFrom) : 'All dates'} — ${dateTo ? formatDateShort(dateTo) : 'Today'}`
          : 'All dates';

      const generatedOn = new Date().toLocaleString('en-GB', {
        dateStyle: 'long', timeStyle: 'short',
      });
      const totalRows = exportList.length;
      const filename = `Security_Report_${safeFilename(siteName)}_${formatDateFile(new Date())}.pdf`;

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(filename)}</title>
  <style>
    @page { margin: 0; size: A4 landscape; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #111827; background: #ffffff; }
    .report-shell { padding: 15mm 15mm 22mm 15mm; box-sizing: border-box; width: 100%; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; }
    th { background: #1e3a8a; color: #ffffff; padding: 9px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; overflow: hidden; }
    td { border-bottom: 1px solid #e2e8f0; padding: 9px 8px; vertical-align: middle; line-height: 1.35; overflow: hidden; word-break: break-word; color: #1e293b; }
    .report-head { display: flex; align-items: center; gap: 18px; border-bottom: 3px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 18px; }
    .report-head img { height: 52px; max-width: 180px; object-fit: contain; }
    .report-head-copy { flex: 1; }
    .company-name { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: #1e3a8a; }
    .report-title { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }
    .report-meta { margin: 5px 0 0; font-size: 11px; color: #64748b; }
    .report-count { text-align: right; font-size: 11px; color: #64748b; }
    .report-count strong { display: block; font-size: 24px; font-weight: 700; color: #1e3a8a; }
    .report-end { margin-top: 24px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #64748b; text-align: center; }
    .footer { position: fixed; left: 15mm; right: 15mm; bottom: 8mm; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; background: #ffffff; }
    .page-number::after { content: "Page " counter(page); }
  </style>
</head>
<body>
  <div class="report-shell">
    <!-- ── Header ── -->
    <div class="report-head">
      <img src="${TRIPOD_LOGO_BASE64}" alt="Tripod Services logo" />
      <div class="report-head-copy">
        <p class="company-name">Tripod Services</p>
        <h2 class="report-title">${escapeHtml(reportTitle)}</h2>
        <p class="report-meta">
          ${escapeHtml(siteName)} &nbsp;·&nbsp; Period: ${escapeHtml(periodLabel)} &nbsp;·&nbsp; Generated ${escapeHtml(generatedOn)}
        </p>
      </div>
      <div class="report-count">
        <strong>${totalRows}</strong>
        <div>record${totalRows !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <!-- ── Table ── -->
    <table>
      <thead>
        <tr>${theadHtml}</tr>
      </thead>
      <tbody>${tbodyHtml}</tbody>
    </table>

    <div class="report-end">End of report</div>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <span>Tripod Services &nbsp;·&nbsp; Official Security Report</span>
    <span>${escapeHtml(siteName)}</span>
    <span class="page-number"></span>
  </div>

</body>
</html>`;

      if (format === 'pdf') {
        const { uri: tempUri } = await Print.printToFileAsync({ html, base64: false });
        const destUri = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${filename}`;

        await FileSystem.deleteAsync(destUri, { idempotent: true });
        await FileSystem.copyAsync({ from: tempUri, to: destUri });

        await Sharing.shareAsync(destUri, {
          mimeType:    'application/pdf',
          dialogTitle: 'Security Report (PDF)',
          UTI:         'com.adobe.pdf',
        });
      } else {
        const filename = `Security_Report_${safeFilename(siteName)}_${formatDateFile(new Date())}.xls`;
        const destUri  = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + filename;

        await FileSystem.writeAsStringAsync(destUri, html, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(destUri, {
          mimeType:    'application/vnd.ms-excel',
          dialogTitle: 'Security Report (Excel)',
        });
      }
    } catch (err) {
      Alert.alert('Export failed', err?.message || 'Could not export data.');
    } finally {
      setExporting(false);
    }
  };

  const handleCheckIn = async ({ name, group, notes, carRegistration, companyName }) => {
    if (!selectedSite?.id) {
      Alert.alert('Site required', 'Please select a site before signing someone in.');
      return;
    }

    setSubmittingCheckIn(true);
    try {
      await signInVisitor({
        siteId: selectedSite.id,
        name,
        group,
        notes,
        carRegistration,
        companyName,
      });
      setCheckInOpen(false);
      await loadSiteData(selectedSite.id);
      setActiveTab('On Site');
    } catch (error) {
      Alert.alert('Sign-in failed', error?.response?.data?.error || 'Could not sign this person in.');
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  const handleSignOutVisitor = async () => {
    if (!signOutTarget?.id) return;
    setSigningOutVisitor(true);
    try {
      await signOutVisit(signOutTarget.id);
      setSignOutTarget(null);
      await loadSiteData(selectedSite?.id);
    } catch (error) {
      Alert.alert('Sign-out failed', error?.response?.data?.error || 'Could not sign this person out.');
    } finally {
      setSigningOutVisitor(false);
    }
  };

  const handleArrive = async (item) => {
    setArrivalTarget(item);
    setArrivalCarRegistration('');
    setArrivalCompanyName(item?.company_name || '');
  };

  const completeArrival = async () => {
    const item = arrivalTarget;
    if (!item?.id) return;
    setArrivingId(item.id);
    try {
      await markPreRegisteredArrival(item.id, { carRegistration: arrivalCarRegistration, companyName: arrivalCompanyName });

      // Auto-notify manager about arrival in chat without high-priority red alert icons
      try {
        await api.post('/messages', {
          text: `📢 Info: Pre-registered visitor ${item.name} has arrived on site.`,
          site_id: selectedSite?.id,
          type: 'message',
        });
      } catch (msgErr) {
        console.log('Failed to post arrival message:', msgErr.message);
      }

      await loadSiteData(selectedSite?.id);
      setActiveTab('On Site');
      setArrivalTarget(null);
    } catch (error) {
      Alert.alert('Arrival failed', error?.response?.data?.error || 'Could not mark this visitor as arrived.');
    } finally {
      setArrivingId(null);
    }
  };

  const handleAlertArrival = async (item) => {
    if (!selectedSite?.id) return;
    Alert.alert(
      'Alert Manager',
      `Send an alert to the manager about ${item.name}'s arrival?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Alert',
          onPress: async () => {
            try {
              await api.post('/messages', {
                text: `🔔 Visitor pre-registered: ${item.name} is at the gate.`,
                site_id: selectedSite.id,
                type: 'alert',
              });
              Alert.alert('Sent', 'Manager has been notified.');
            } catch (err) {
              Alert.alert('Failed', err.response?.data?.error || 'Could not send notification.');
            }
          },
        },
      ]
    );
  };

  const filterItems = useCallback(
    (items) =>
      items.filter((item) => {
        if (!search.trim()) return true;
        const query = search.replace(/\s+/g, '').toLowerCase();
        const value = `${item?.name || ''}${item?.group || ''}${item?.trade || ''}${item?.company_name || ''}`.replace(/\s+/g, '').toLowerCase();
        return value.includes(query);
      }),
    [search],
  );

  const filteredOnSite = useMemo(() => filterItems(onSite), [filterItems, onSite]);
  const filteredSignedOut = useMemo(() => filterItems(signedOut), [filterItems, signedOut]);
  const filteredExpected = useMemo(() => filterItems(expected), [expected, filterItems]);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#2b4594" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.shieldIcon}>
            <ShieldCheck size={20} color="#fff" />
          </View>
          <View>
            <Text style={s.headerTitle}>Security Portal</Text>
            <Text style={s.headerSub}>{guardName}</Text>
          </View>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={handleLogout} style={[s.refreshBtn, { marginRight: 8 }]}>
            <LogOut size={18} color="#ef4444" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowExportModal(true)}
            style={[s.refreshBtn, { marginRight: 8 }]}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator size="small" color="#2b4594" /> : <Download size={18} color="#2b4594" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={load} style={s.refreshBtn}>
            <RefreshCw size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.actionCard}>
        <Text style={s.actionTitle}>Visitor Control</Text>
        <Text style={s.actionSub}>Sign people in, sign them out, and record expected arrivals.</Text>
        <View style={s.actionButtons}>
          <TouchableOpacity onPress={() => setCheckInOpen(true)} style={s.primaryBtn}>
            <LogIn size={17} color="#fff" />
            <Text style={s.primaryBtnText}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Deliveries', { siteId: selectedSite?.id })} style={s.secondaryBtn}>
            <Package size={17} color="#2b4594" />
            <Text style={s.secondaryBtnText}>Delivery</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.sitePickerWrap}>
        <TouchableOpacity onPress={() => setSiteOpen((value) => !value)} style={s.sitePickerBtn}>
          <Text style={s.sitePickerText}>{selectedSite?.name || 'Select site'}</Text>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>
      {/* Site Picker Modal guarantees it renders on top */}
      <Modal visible={siteOpen} transparent={true} animationType="fade" onRequestClose={() => setSiteOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setSiteOpen(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, maxHeight: '70%' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Select site</Text>
              <TouchableOpacity onPress={() => setSiteOpen(false)}><X size={20} color="#9ca3af" /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ paddingHorizontal: 16 }}>
              {sites.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: '#6b7280' }}>No sites available</Text>
                </View>
              ) : sites.map((site) => (
                <TouchableOpacity
                  key={site.id}
                  onPress={async () => {
                    setSelectedSite(site);
                    setSiteOpen(false);
                    setRefreshing(true);
                    await loadSiteData(site.id);
                    setRefreshing(false);
                  }}
                  style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 16, color: selectedSite?.id === site.id ? '#2b4594' : '#111827', fontWeight: selectedSite?.id === site.id ? '700' : '400' }}>
                    {site.name}
                  </Text>
                  {selectedSite?.id === site.id && <ShieldCheck size={18} color="#2b4594" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={s.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[s.tab, activeTab === tab && s.tabActive]}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
            {tab === 'On Site' && filteredOnSite.length > 0 ? (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeTxt}>{filteredOnSite.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.searchRow}>
        <Search size={16} color="#9ca3af" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, company or role"
          placeholderTextColor="#9ca3af"
          style={s.searchInput}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={16} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Date range row — used to filter the export */}
      <View style={s.dateFilterRow}>
        <TouchableOpacity style={s.dateFilterBtn} onPress={() => setShowDatePicker('from')}>
          <CalendarDays size={14} color="#2b4594" />
          <Text style={[s.dateFilterText, !dateFrom && s.dateFilterPlaceholder]}>
            {dateFrom ? formatDateShort(dateFrom) : 'From date'}
          </Text>
          {dateFrom ? (
            <TouchableOpacity onPress={() => setDateFrom(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <X size={12} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity style={s.dateFilterBtn} onPress={() => setShowDatePicker('to')}>
          <CalendarDays size={14} color="#2b4594" />
          <Text style={[s.dateFilterText, !dateTo && s.dateFilterPlaceholder]}>
            {dateTo ? formatDateShort(dateTo) : 'To date'}
          </Text>
          {dateTo ? (
            <TouchableOpacity onPress={() => setDateTo(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <X size={12} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </View>

      {showDatePicker ? (
        <DateTimePicker
          value={showDatePicker === 'from' ? (dateFrom || new Date()) : (dateTo || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selectedDate) => {
            if (Platform.OS === 'android') setShowDatePicker(null);
            if (selectedDate) {
              if (showDatePicker === 'from') setDateFrom(selectedDate);
              else setDateTo(selectedDate);
            }
            if (Platform.OS === 'ios') setShowDatePicker(null);
          }}
        />
      ) : null}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2b4594" />}
        contentContainerStyle={s.scrollContent}
      >
        {activeTab === 'On Site' && (
          <>
            <Text style={s.sectionTitle}>{filteredOnSite.length} currently on site</Text>
            {filteredOnSite.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>Nobody is currently signed in.</Text>
              </View>
            ) : (
              filteredOnSite.map((visit) => (
                <TouchableOpacity key={visit.id} style={s.visitCard} onPress={() => setSelectedPerson(visit)} activeOpacity={0.75}>
                  <View style={[s.visitAvatar, s.visitAvatarActive, { position: 'relative' }]}>
                    <Text style={[s.visitAvatarTxt, s.visitAvatarTxtActive]}>{visit.name[0]?.toUpperCase()}</Text>
                    <View style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, backgroundColor: '#16a34a', borderRadius: 7, borderWidth: 2, borderColor: '#fff' }} />
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{visit.name}</Text>
                    <Text style={s.visitSub}>{visit.group} · in {fmtTime(visit.sign_in_time)}</Text>
                    {visit.pre_registered ? <Text style={s.visitNote}>Pre-registered arrival</Text> : null}
                  </View>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setSignOutTarget(visit); }} style={s.signOutChip}>
                    <LogOut size={14} color="#ef4444" />
                    <Text style={s.signOutChipTxt}>Sign out</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === 'Signed Out' && (
          <>
            <Text style={s.sectionTitle}>Recently signed out</Text>
            {filteredSignedOut.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No one has signed out yet.</Text>
              </View>
            ) : (
              filteredSignedOut.map((visit) => (
                <TouchableOpacity key={visit.id} style={s.visitCard} onPress={() => setSelectedPerson(visit)} activeOpacity={0.75}>
                  <View style={s.visitAvatar}>
                    <Text style={s.visitAvatarTxt}>{visit.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{visit.name}</Text>
                    <Text style={s.visitSub}>
                      {visit.group} · in {fmtTime(visit.sign_in_time)} · out {fmtTime(visit.sign_out_time)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === 'Expected' && (
          <>
            <Text style={s.sectionTitle}>Expected Visitors</Text>
            {filteredExpected.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No Expected Visitors Right Now.</Text>
              </View>
            ) : (
              filteredExpected.map((item) => (
                <TouchableOpacity key={item.id} style={s.visitCard} onPress={() => setSelectedPerson(item)} activeOpacity={0.75}>
                  <View style={s.visitAvatar}>
                    <Text style={s.visitAvatarTxt}>{item.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{item.name}</Text>
                    <Text style={s.visitSub}>Expected at {fmtTime(item.expected_date)}</Text>
                    {item.notes ? <Text style={s.visitNote}>{item.notes}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleAlertArrival(item); }} style={s.alertArrivalBtn}>
                      <Bell size={14} color="#2b4594" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleArrive(item); }} style={s.arriveBtn} disabled={arrivingId === item.id}>
                      {arrivingId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <LogIn size={14} color="#fff" />
                          <Text style={s.arriveBtnTxt}>Arrived</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>

      <CheckInModal
        visible={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        onSubmit={handleCheckIn}
        loading={submittingCheckIn}
        visitorGroups={visitorGroups.length ? visitorGroups : [{ id: 'visitor', name: 'Visitor' }]}
      />

      <Modal visible={Boolean(arrivalTarget)} transparent animationType="fade" onRequestClose={() => setArrivalTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Record arrival</Text>
            <Text style={s.modalBody}>Both fields below are optional — fill in what's available.</Text>
            <TextInput value={arrivalCarRegistration} onChangeText={setArrivalCarRegistration} placeholder="Car registration (optional)" placeholderTextColor="#9ca3af" style={s.input} autoCapitalize="characters" />
            <TextInput value={arrivalCompanyName} onChangeText={setArrivalCompanyName} placeholder="Company name (optional)" placeholderTextColor="#9ca3af" style={s.input} />
            <View style={s.modalBtns}>
              <TouchableOpacity onPress={() => setArrivalTarget(null)} style={s.modalCancelBtn}><Text style={s.modalCancelTxt}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={completeArrival} disabled={arrivingId === arrivalTarget?.id} style={s.modalConfirmBtn}>{arrivingId === arrivalTarget?.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmTxt}>Arrived</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(signOutTarget)} transparent animationType="fade" onRequestClose={() => setSignOutTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Sign out {signOutTarget?.name}?</Text>
            <Text style={s.modalBody}>Confirm that this person has now left the site.</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity onPress={() => setSignOutTarget(null)} style={s.modalCancelBtn}>
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSignOutVisitor} disabled={signingOutVisitor} style={s.signOutConfirmBtn}>
                {signingOutVisitor ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.modalConfirmTxt}>Sign out</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PersonDetailsModal
        visible={Boolean(selectedPerson)}
        onClose={() => setSelectedPerson(null)}
        person={selectedPerson}
      />

      {/* Export Security Report Modal */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={s.exportModalBackdrop}>
          <View style={s.exportModalCard}>
            <View style={s.exportModalHeader}>
              <Text style={s.exportModalTitle}>Export Security Report</Text>
              <TouchableOpacity onPress={() => setShowExportModal(false)}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748b' }}>Choose file format:</Text>
            <View style={s.formatRow}>
              <TouchableOpacity
                style={[s.formatBtn, exportFormat === 'pdf' && s.formatBtnActive]}
                onPress={() => setExportFormat('pdf')}
              >
                <Text style={[s.formatBtnText, exportFormat === 'pdf' && s.formatBtnTextActive]}>
                  PDF Document
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.formatBtn, exportFormat === 'excel' && s.formatBtnActive]}
                onPress={() => setExportFormat('excel')}
              >
                <Text style={[s.formatBtnText, exportFormat === 'excel' && s.formatBtnTextActive]}>
                  Excel (.xls)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 4, marginBottom: 8 }}>
              Optional Columns to Include:
            </Text>

            <TouchableOpacity
              style={s.checkboxRow}
              onPress={() => toggleOptionalField('carReg')}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, exportOptionalFields.carReg && s.checkboxChecked]}>
                {exportOptionalFields.carReg && <Check size={14} color="#fff" strokeWidth={3} />}
              </View>
              <Text style={s.checkboxLabel}>Car Registration</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.checkboxRow}
              onPress={() => toggleOptionalField('expectedArrival')}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, exportOptionalFields.expectedArrival && s.checkboxChecked]}>
                {exportOptionalFields.expectedArrival && <Check size={14} color="#fff" strokeWidth={3} />}
              </View>
              <Text style={s.checkboxLabel}>Expected Arrival</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.checkboxRow}
              onPress={() => toggleOptionalField('description')}
              activeOpacity={0.7}
            >
              <View style={[s.checkbox, exportOptionalFields.description && s.checkboxChecked]}>
                {exportOptionalFields.description && <Check size={14} color="#fff" strokeWidth={3} />}
              </View>
              <Text style={s.checkboxLabel}>Description / Notes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.confirmExportBtn}
              onPress={() => {
                setShowExportModal(false);
                handleExport(exportFormat, exportOptionalFields);
              }}
            >
              <Text style={s.confirmExportTxt}>Download Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    zIndex: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  shieldIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2b4594',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280' },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  actionCard: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  actionSub: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 19 },
  actionButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2b4594',
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: '#2b4594', fontWeight: '700', fontSize: 15 },
  sitePickerWrap: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 10, backgroundColor: '#fff' },
  sitePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
  },
  sitePickerText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  siteDropdown: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 148, // below header + actionCard + sitePickerWrap
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  siteOption: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  siteOptionTxt: { fontSize: 15, color: '#111827' },
  siteOptionTxtActive: { color: '#2b4594', fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2b4594' },
  tabText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#2b4594', fontWeight: '700' },
  tabBadge: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  dateFilterRow: { flexDirection: 'row', gap: 8, backgroundColor: '#fff', paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dateFilterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#f9fafb' },
  dateFilterText: { flex: 1, fontSize: 12, color: '#111827', fontWeight: '500' },
  dateFilterPlaceholder: { color: '#94a3b8', fontWeight: '400' },
  // Extra bottom padding so actions aren't hidden behind bottom tabs
  scrollContent: { padding: 16, paddingBottom: 120 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  visitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  visitAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitAvatarActive: { backgroundColor: '#dcfce7' },
  visitAvatarTxt: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  visitAvatarTxtActive: { color: '#16a34a' },
  visitMeta: { flex: 1 },
  visitName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  visitSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  visitNote: { fontSize: 12, color: '#2b4594', marginTop: 3 },
  signOutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signOutChipTxt: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  arriveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2b4594',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 84,
    justifyContent: 'center',
  },
  arriveBtnTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
  alertArrivalBtn: {
    borderWidth: 1.5,
    borderColor: '#2b4594',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  addPreregBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2b4594',
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 16,
  },
  addPreregTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalBody: { fontSize: 14, color: '#6b7280', lineHeight: 21, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  notesInput: { minHeight: 82, textAlignVertical: 'top' },
  groupPicker: { marginBottom: 12, maxHeight: 42 },
  groupChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  groupChipActive: { backgroundColor: '#2b4594', borderColor: '#2b4594' },
  groupChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  groupChipTextActive: { color: '#fff' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  modalCancelTxt: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  modalConfirmBtn: {
    backgroundColor: '#2b4594',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 96,
    alignItems: 'center',
  },
  signOutConfirmBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 96,
    alignItems: 'center',
  },
  modalConfirmTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Export report modal
  exportModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  exportModalCard: { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  exportModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  exportModalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  formatRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 14 },
  formatBtn: { flex: 1, paddingVertical: 11, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, alignItems: 'center' },
  formatBtnActive: { borderColor: '#2b4594', backgroundColor: '#eff6ff' },
  formatBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  formatBtnTextActive: { color: '#2b4594' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#2b4594', borderColor: '#2b4594' },
  checkboxLabel: { fontSize: 14, color: '#334155', fontWeight: '500' },
  confirmExportBtn: { backgroundColor: '#2b4594', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  confirmExportTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

export default SecurityGuardScreen;
