import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
  Platform,
} from 'react-native';
import { Bell, CalendarDays, CheckCircle, ChevronDown, Download, MessageSquare, RefreshCw, X, LogOut, UserPlus, Search, Package, Video, VideoOff } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  getAccessibleSites,
  getPendingGuards,
  getPreRegistrations,
  getPresentGuards,
  updateGuardApproval,
  getVisits,
  getVisitStats,
} from '../services/enterprisePortal';

const TABS = ['Overview', 'On-Site', 'Signed Out', 'Deliveries', 'Pre-Registration', 'Approvals', 'Guards', 'Cameras'];

const LiveCameraModal = ({ visible, onClose, camera, streamSession, loading, onPtzStart, onPtzStop, onPreset }) => {
  const streamUrl = streamSession?.low_res_hls_url || streamSession?.hls_url;
  const player = useVideoPlayer(streamUrl ? { uri: streamUrl } : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const [showPtz, setShowPtz]         = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const PtzBtn = ({ label, dir, icon }) => (
    <TouchableOpacity
      onPressIn={() => onPtzStart?.(camera?.id, dir)}
      onPressOut={() => onPtzStop?.(camera?.id, dir)}
      style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
      accessibilityLabel={label}
    >
      <Text style={{ color: '#fff', fontSize: 18 }}>{icon}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center' }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 18, paddingTop: 48, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b' }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{camera?.name || 'Camera Feed'}</Text>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{camera?.location || 'Site Location'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {camera?.ptz_supported && (
              <TouchableOpacity
                onPress={() => setShowPtz(v => !v)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: showPtz ? '#2b4594' : 'rgba(255,255,255,0.12)' }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>PTZ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Video */}
        <View style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', aspectRatio: 16 / 9, width: '100%' }}>
          {loading ? (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={{ color: '#94a3b8', fontSize: 14 }}>Connecting to live stream...</Text>
            </View>
          ) : streamUrl ? (
            <VideoView
              style={{ width: '100%', height: '100%' }}
              player={player}
              allowsFullscreen
              allowsPictureInPicture
              nativeControls
            />
          ) : (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#ef4444', fontSize: 28 }}>📷</Text>
              <Text style={{ color: '#ef4444', fontSize: 14 }}>Camera feed is currently offline</Text>
            </View>
          )}
        </View>

        {/* PTZ Controls */}
        {showPtz && camera?.ptz_supported && (
          <View style={{ backgroundColor: '#1e293b', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              {/* D-pad */}
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                  <PtzBtn label="Up"    dir="up"    icon="▲" />
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <PtzBtn label="Left"  dir="left"  icon="◀" />
                  <TouchableOpacity
                    onPress={() => camera?.id && api.post(`/cameras/${camera.id}/ptz`, { action: 'stop' }).catch(() => {})}
                    style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#64748b', fontSize: 16 }}>■</Text>
                  </TouchableOpacity>
                  <PtzBtn label="Right" dir="right" icon="▶" />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                  <PtzBtn label="Down"  dir="down"  icon="▼" />
                </View>
              </View>
              {/* Zoom */}
              <View style={{ gap: 4 }}>
                <PtzBtn label="Zoom In"  dir="zoom_in"  icon="＋" />
                <PtzBtn label="Zoom Out" dir="zoom_out" icon="－" />
              </View>
              {/* Presets */}
              <View style={{ gap: 4 }}>
                <TouchableOpacity
                  onPress={() => setShowPresets(v => !v)}
                  style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: showPresets ? '#2b4594' : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>P</Text>
                </TouchableOpacity>
                {showPresets && [1, 2, 3, 4].map(n => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => onPreset?.(camera?.id, n)}
                    style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const toApiDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatFilterDate = (value) => value
  ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '';

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

const fmtDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

const PersonDetailsModal = ({ visible, onClose, person }) => {
  if (!person) return null;

  const fmtDetailDate = (val) => {
    if (!val) return '—';
    try {
      return new Date(val).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return val;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Person Details</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: person.sign_out_time ? '#e5e7eb' : '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: person.sign_out_time ? '#6b7280' : '#16a34a' }}>
                {(person.name || person.firstName || 'P')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' }}>{person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim()}</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 2, fontWeight: '500' }}>{person.group || person.role || 'Visitor'}</Text>
          </View>

          <View style={{ gap: 12 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: person.sign_out_time ? '#ef4444' : '#16a34a', marginTop: 2 }}>
                {person.sign_out_time ? 'Signed Out' : 'On-Site (Active)'}
              </Text>
            </View>

            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sign In Time</Text>
              <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>
                {fmtDetailDate(person.sign_in_time || person.expected_date || person.check_in_time)}
              </Text>
            </View>

            {person.sign_out_time ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sign Out Time</Text>
                <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>
                  {fmtDetailDate(person.sign_out_time)}
                </Text>
              </View>
            ) : null}

            {person.notes || person.reason ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</Text>
                <Text style={{ fontSize: 14, color: '#4b5563', marginTop: 2, fontStyle: 'italic' }}>
                  {person.notes || person.reason}
                </Text>
              </View>
            ) : null}

            {person.email ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</Text>
                <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>{person.email}</Text>
              </View>
            ) : null}

            {person.phone ? (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</Text>
                <Text style={{ fontSize: 14, color: '#111827', marginTop: 2 }}>{person.phone}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const ManagerScreen = ({ navigation, route }) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || 'Overview');
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [onSite, setOnSite] = useState([]);
  const [signedOut, setSignedOut] = useState([]);
  const [expected, setExpected] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [pendingGuards, setPendingGuards] = useState([]);
  const [presentGuards, setPresentGuards] = useState([]);
  const [counts, setCounts] = useState({ total: 0, visitors: 0, employees: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifOn, setNotifOn] = useState(true);
  const [notificationCentreOpen, setNotificationCentreOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingApproval, setUpdatingApproval] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(null);
  const knownArrivalIds = useRef(new Set());
  const arrivalsInitialised = useRef(false);

  const managerName = user?.name || user?.firstName || 'Manager';

  // ── Camera state ──────────────────────────────────────────────────────────
  const [cameras, setCameras]               = useState([]);
  const [camerasLoading, setCamerasLoading] = useState(false);
  const [activeCameraModal, setActiveCameraModal] = useState(null);   // { camera, session }
  const [sessionLoading, setSessionLoading] = useState(false);
  const [ptzSpeed, setPtzSpeed]             = useState(4);
  const activePtzDir = React.useRef(null);

  const fetchCameras = useCallback(async (siteId) => {
    if (!siteId) return;
    setCamerasLoading(true);
    try {
      const res = await api.get(`/cameras?site_id=${siteId}`);
      setCameras(res.data || []);
    } catch {
      setCameras([]);
    } finally {
      setCamerasLoading(false);
    }
  }, []);

  // Reload cameras when Cameras tab is opened or site changes
  useEffect(() => {
    if (activeTab === 'Cameras' && selectedSite?.id) {
      fetchCameras(selectedSite.id);
    }
  }, [activeTab, selectedSite?.id, fetchCameras]);

  const openCameraFeed = async (camera) => {
    setSessionLoading(true);
    setActiveCameraModal({ camera, session: null });
    try {
      const res = await api.post(`/cameras/${camera.id}/stream-session`);
      setActiveCameraModal({ camera, session: res.data.stream });
    } catch {
      setActiveCameraModal({ camera, session: null });
    } finally {
      setSessionLoading(false);
    }
  };

  const sendPtz = useCallback(async (cameraId, action, direction, speed) => {
    try {
      await api.post(`/cameras/${cameraId}/ptz`, { action, direction, speed });
    } catch { /* silent — PTZ errors shouldn't disrupt the UI */ }
  }, []);

  const handlePtzStart = (cameraId, direction) => {
    activePtzDir.current = direction;
    sendPtz(cameraId, 'start', direction, ptzSpeed);
  };

  const handlePtzStop = (cameraId, direction) => {
    if (activePtzDir.current !== direction) return;
    activePtzDir.current = null;
    sendPtz(cameraId, 'stop', direction, 0);
  };

  const handlePreset = (cameraId, preset) => {
    api.post(`/cameras/${cameraId}/ptz`, { action: 'goto_preset', preset }).catch(() => {});
  };

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

    const [currentVisits, signedOutVisits, preRegistered, stats, pending, present, siteDeliveries] = await Promise.all([
      getVisits({ siteId, status: 'In' }).catch(() => []),
      getVisits({ siteId, status: 'Out' }).catch(() => []),
      getPreRegistrations({ siteId, status: 'Pending' }).catch(() => []),
      getVisitStats(siteId).catch(() => ({ totalIn: 0, visitorsIn: 0, employeesIn: 0 })),
      getPendingGuards({ siteId }).catch(() => []),
      getPresentGuards({ siteId }).catch(() => []),
      api.get('/deliveries', { params: { site_id: siteId } }).then((response) => response.data || []).catch(() => []),
    ]);

    setOnSite(currentVisits);
    setSignedOut(signedOutVisits);
    setExpected(preRegistered);
    setDeliveries(siteDeliveries);
    setPendingGuards(pending);
    setPresentGuards(present);
    // The list is the source of truth: the legacy stats endpoint does not reliably
    // distinguish groups and may return stale zero values.
    setCounts({
      total: currentVisits.length,
      visitors: currentVisits.filter((visit) => !String(visit.group).toLowerCase().includes('employee')).length,
      employees: currentVisits.filter((visit) => String(visit.group).toLowerCase().includes('employee')).length,
    });
  }, [selectedSite]);

  const load = useCallback(async () => {
    try {
      const siteList = await getAccessibleSites(user?.project_id || user?.site_id);
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
      console.log('ManagerScreen load error:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSiteData, selectedSite, user?.project_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the manager view current while it is open. This also lets the arrival
  // detector raise its on-screen alert and vibration without requiring a manual refresh.
  useEffect(() => {
    if (!selectedSite?.id) return undefined;
    const timer = setInterval(() => {
      loadSiteData(selectedSite.id).catch((error) => console.log('Manager refresh error:', error?.message));
    }, 10000);
    return () => clearInterval(timer);
  }, [selectedSite?.id, loadSiteData]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // ── Export ─────────────────────────────────────────────────────────
  const fmtExportTime = (val) => {
    if (!val) return '';
    try { return new Date(val).toLocaleString('en-GB'); } catch { return val; }
  };

  const safeFilename = (name) =>
    String(name || 'export')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 140);

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const buildHtmlTable = (rows, headers) => {
    const th = headers.map((h) => `<th style="text-align:left;padding:10px;border:1px solid #e5e7eb;background:#f8fafc">${escapeHtml(h)}</th>`).join('');
    const tr = rows
      .map((r) => `<tr>${headers.map((h) => `<td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(r[h])}</td>`).join('')}</tr>`)
      .join('');
    return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  };

  const shareExcel = async ({ title, headers, rows, filenameBase }) => {
    const table = buildHtmlTable(rows, headers);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><h2 style="font-family:Arial,sans-serif">${escapeHtml(title)}</h2>${table}</body></html>`;
    const file = new File(Paths.cache, `${safeFilename(filenameBase)}.xls`);
    file.write(html);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.ms-excel',
      dialogTitle: 'Export (Excel)',
    });
  };

  const sharePdf = async ({ title, headers, rows, filenameBase }) => {
    const table = buildHtmlTable(rows, headers);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111827}
        h2{margin:0 0 12px 0}
        p{margin:0 0 18px 0;color:#6b7280}
      </style>
    </head><body><h2>${escapeHtml(title)}</h2><p>Generated: ${escapeHtml(new Date().toLocaleString('en-GB'))}</p>${table}</body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Export (PDF)',
      UTI: 'com.adobe.pdf',
    });
  };

  const handleExport = async (format) => {
    // Routine attendance reports use visit data only, never a pre-registration's
    // expected-arrival value.
    const unfilteredList = activeTab === 'Signed Out' ? signedOut : activeTab === 'Deliveries' ? deliveries : onSite;
    let list = unfilteredList.filter(matchesSearch);

    setExporting(true);
    try {
      const siteName = selectedSite?.name || 'Site';
      const dateStr  = new Date().toLocaleDateString('en-GB');
      if ((dateFrom || dateTo) && activeTab !== 'Deliveries') {
        const status = activeTab === 'Signed Out' ? 'Out' : 'In';
        const records = await getVisits({ siteId: selectedSite?.id, status, search, dateFrom: toApiDate(dateFrom), dateTo: toApiDate(dateTo) });
        list = records.filter(matchesSearch);
      }
      if ((dateFrom || dateTo) && activeTab === 'Deliveries') {
        const response = await api.get('/deliveries', {
          params: { site_id: selectedSite?.id, search, date_from: toApiDate(dateFrom) || undefined, date_to: toApiDate(dateTo) || undefined },
        });
        list = (response.data || []).filter(matchesSearch);
      }
      if (!list.length) {
        Alert.alert('Nothing to export', 'No records match the selected filters.');
        return;
      }
      const reportTitle = `Security Report — ${siteName} — ${dateStr}`;
      const filenameBase = `${siteName}-Report-${dateStr}`;

      const isDeliveryReport = activeTab === 'Deliveries';
      const headers = isDeliveryReport
        ? ['Item', 'Recipient', 'Sender', 'Carrier', 'Company', 'Recorded', 'Collected']
        : ['Name', 'Role', 'Sign In', 'Sign Out', 'Car Registration', 'Company', 'Checked in by'];

      const rows = list.map(item => isDeliveryReport ? ({
        Item: item.itemName || item.recipient || '',
        Recipient: item.recipient || '',
        Sender: item.sender || '',
        Carrier: item.carrier || '',
        Company: item.company || '',
        Recorded: fmtExportTime(item.receivedAt || item.createdAt),
        Collected: item.collected ? fmtExportTime(item.collectedAt) : 'No',
      }) : ({
        Name: item.name || '', Role: item.group || '',
        'Sign In': fmtExportTime(item.sign_in_time), 'Sign Out': fmtExportTime(item.sign_out_time),
        'Car Registration': item.car_reg || '', Company: item.trade || item.company_name || '',
        'Checked in by': item.checked_in_by || '',
      }));

      if (format === 'excel') {
        await shareExcel({ title: reportTitle, headers, rows, filenameBase });
      } else {
        await sharePdf({ title: reportTitle, headers, rows, filenameBase });
      }
    } catch (err) {
      Alert.alert('Export failed', err?.message || 'Could not export.');
    } finally {
      setExporting(false);
    }
  };

  const approveGuard = async (guardId, action) => {
    setApprovingId(guardId);
    try {
      // Use the dedicated approval endpoint which sets approvalStatus field correctly
      await api.put(`/guards/${guardId}/approval`, { status: action === 'approve' ? 'approved' : 'rejected' });
      Alert.alert(
        action === 'approve' ? '✓ Approved' : '✗ Rejected',
        `Guard has been ${action === 'approve' ? 'approved and can now log in' : 'rejected'}.`
      );
      await loadSiteData(selectedSite?.id);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not update guard status.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproval = async (guardId, status) => {
    const siteId = selectedSite?.id;
    if (!guardId) return;
    setUpdatingApproval(`${guardId}:${status}`);
    try {
      await updateGuardApproval({ guardId, status });
      await loadSiteData(siteId);
    } catch (err) {
      Alert.alert('Update failed', err?.response?.data?.error || err?.message || 'Could not update approval status.');
    } finally {
      setUpdatingApproval(null);
    }
  };

  const notifications = useMemo(
    () =>
      [...onSite, ...signedOut]
        .filter((visit) => visit.pre_registered && visit.checked_in_by_guard)
        .sort((a, b) => new Date(b.sign_in_time || 0) - new Date(a.sign_in_time || 0))
        .slice(0, 20),
    [onSite, signedOut],
  );

  useEffect(() => {
    const arrivalIds = onSite
      .filter((visit) => visit.pre_registered && visit.checked_in_by_guard)
      .map((visit) => String(visit.id));
    if (!arrivalsInitialised.current) {
      arrivalIds.forEach((id) => knownArrivalIds.current.add(id));
      arrivalsInitialised.current = true;
      return;
    }
    const newArrivalId = arrivalIds.find((id) => !knownArrivalIds.current.has(id));
    arrivalIds.forEach((id) => knownArrivalIds.current.add(id));
    if (newArrivalId && notifOn) {
      const visitor = onSite.find((visit) => String(visit.id) === newArrivalId);
      Vibration.vibrate([0, 300, 150, 300]);
      Alert.alert('Visitor Arrived', `${visitor?.name || 'A pre-registered visitor'} has arrived at ${selectedSite?.name || 'the site'}.`);
    }
  }, [onSite, notifOn, selectedSite?.name]);

  const matchesSearch = (item) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.group, item.role, item.trade, item.company_name, item.companyName,
      item.itemName, item.recipient, item.sender, item.carrier, item.company]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  };
  const visibleOnSite = onSite.filter(matchesSearch);
  const visibleSignedOut = signedOut.filter(matchesSearch);
  const visibleExpected = expected.filter(matchesSearch);
  const visibleDeliveries = deliveries.filter(matchesSearch);

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
        <View>
          <Text style={s.headerTitle}>Manager Portal</Text>
          <Text style={s.headerSub}>{managerName}</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={handleLogout} style={[s.notifBtn, { marginRight: 8 }]}>
            <LogOut size={20} color="#ef4444" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Preregister', { siteId: selectedSite?.id, siteName: selectedSite?.name })} style={[s.notifBtn, { marginRight: 8 }]}>
            <UserPlus size={20} color="#2b4594" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert(
              'Export',
              'Choose export format',
              [
                { text: 'Excel (.xls)', onPress: () => handleExport('excel') },
                { text: 'PDF', onPress: () => handleExport('pdf') },
                { text: 'Cancel', style: 'cancel' },
              ]
            )}
            style={[s.notifBtn, { marginRight: 8 }]}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator size="small" color="#2b4594" /> : <Download size={20} color="#2b4594" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setNotificationCentreOpen(true)} style={[s.notifBtn, notifications.length > 0 && s.notifBtnActive]}>
            <Bell size={20} color={notifications.length > 0 ? '#fff' : '#6b7280'} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.sitePicker}>
        <TouchableOpacity onPress={() => setSiteOpen((value) => !value)} style={s.sitePickerBtn}>
          <Text style={s.sitePickerText}>{selectedSite?.name || 'Select site'}</Text>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>
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
                  {selectedSite?.id === site.id && <CheckCircle size={18} color="#2b4594" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={notificationCentreOpen} transparent animationType="slide" onRequestClose={() => setNotificationCentreOpen(false)}>
        <View style={s.notificationOverlay}>
          <View style={s.notificationSheet}>
            <View style={s.notificationHeader}>
              <Text style={s.notificationTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotificationCentreOpen(false)}><X size={21} color="#6b7280" /></TouchableOpacity>
            </View>
            <View style={s.notificationSetting}>
              <Text style={s.notificationSettingText}>Arrival Alerts</Text>
              <Switch value={notifOn} onValueChange={setNotifOn} trackColor={{ true: '#2b4594', false: '#d1d5db' }} />
            </View>
            <ScrollView>
              {notifications.length ? notifications.map((visit) => (
                <View key={visit.id} style={s.notificationItem}>
                  <Bell size={17} color="#2b4594" />
                  <View style={{ flex: 1 }}><Text style={s.notificationItemTitle}>Pre-registered Visitor Arrived</Text><Text style={s.notificationItemText}>{visit.name} checked in at {fmtTime(visit.sign_in_time)}.</Text></View>
                </View>
              )) : <Text style={s.notificationEmpty}>You have no arrival notifications.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={s.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab} onPress={() => tab === 'Pre-Registration' ? navigation.navigate('Preregister', { siteId: selectedSite?.id, siteName: selectedSite?.name }) : setActiveTab(tab)} style={[s.tab, activeTab === tab && s.tabActive]}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.managerSearchRow}>
        <Search size={16} color="#9ca3af" />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search by name, company or role" placeholderTextColor="#9ca3af" style={s.managerSearchInput} />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><X size={16} color="#9ca3af" /></TouchableOpacity> : null}
      </View>
      <View style={s.dateFilterRow}>
        <TouchableOpacity style={s.dateFilterInput} onPress={() => setShowDatePicker('from')}>
          <CalendarDays size={15} color="#2b4594" />
          <Text style={[s.dateFilterText, !dateFrom && s.dateFilterPlaceholder]}>{dateFrom ? formatFilterDate(dateFrom) : 'From date'}</Text>
          {dateFrom ? <TouchableOpacity onPress={() => setDateFrom(null)}><X size={14} color="#9ca3af" /></TouchableOpacity> : null}
        </TouchableOpacity>
        <TouchableOpacity style={s.dateFilterInput} onPress={() => setShowDatePicker('to')}>
          <CalendarDays size={15} color="#2b4594" />
          <Text style={[s.dateFilterText, !dateTo && s.dateFilterPlaceholder]}>{dateTo ? formatFilterDate(dateTo) : 'To date'}</Text>
          {dateTo ? <TouchableOpacity onPress={() => setDateTo(null)}><X size={14} color="#9ca3af" /></TouchableOpacity> : null}
        </TouchableOpacity>
      </View>
      {showDatePicker ? <DateTimePicker
        value={showDatePicker === 'from' ? (dateFrom || new Date()) : (dateTo || new Date())}
        mode="date"
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        onChange={(_, value) => {
          if (Platform.OS === 'android') setShowDatePicker(null);
          if (value) (showDatePicker === 'from' ? setDateFrom : setDateTo)(value);
          if (Platform.OS === 'ios') setShowDatePicker(null);
        }}
      /> : null}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2b4594" />}
        contentContainerStyle={s.scrollContent}
      >
        {activeTab === 'Overview' && (
          <>
            <View style={s.countGrid}>
              {[
                { label: 'On-Site Now', value: counts.total, color: '#2b4594' },
                { label: 'Visitors', value: counts.visitors, color: '#0891b2' },
                { label: 'Employees', value: counts.employees, color: '#16a34a' },
              ].map((item) => (
                <View key={item.label} style={[s.countCard, { borderLeftColor: item.color }]}>
                  <Text style={[s.countVal, { color: item.color }]}>{item.value}</Text>
                  <Text style={s.countLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionTitle}>Expected Visitors</Text>
            {visibleExpected.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No pending pre-registrations for this site.</Text>
              </View>
            ) : (
              visibleExpected.slice(0, 4).map((item) => (
                <TouchableOpacity key={item.id} style={s.visitCard} onPress={() => setSelectedPerson(item)} activeOpacity={0.75}>
                  <View style={s.visitAvatar}>
                    <Text style={s.visitAvatarTxt}>{item.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{item.name}</Text>
                    <Text style={s.visitSub}>{fmtDate(item.expected_date)} at {fmtTime(item.expected_date)}</Text>
                    {item.notes ? <Text style={s.visitNote}>{item.notes}</Text> : null}
                  </View>
                  <View style={s.pendingBadge}>
                    <Text style={s.pendingBadgeTxt}>Pending</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <Text style={[s.sectionTitle, s.sectionTopSpacing]}>Currently On-Site</Text>
            {visibleOnSite.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>Nobody is currently signed in.</Text>
              </View>
            ) : (
              visibleOnSite.slice(0, 5).map((visit) => (
                <TouchableOpacity key={visit.id} style={s.visitCard} onPress={() => setSelectedPerson(visit)} activeOpacity={0.75}>
                  <View style={[s.visitAvatar, s.visitAvatarActive, { position: 'relative' }]}>
                    <Text style={[s.visitAvatarTxt, s.visitAvatarTxtActive]}>{visit.name[0]?.toUpperCase()}</Text>
                    <View style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, backgroundColor: '#16a34a', borderRadius: 7, borderWidth: 2, borderColor: '#fff' }} />
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{visit.name}</Text>
                    <Text style={s.visitSub}>{visit.group} · signed in {fmtTime(visit.sign_in_time)}</Text>
                  </View>
                  <CheckCircle size={18} color="#16a34a" />
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === 'On-Site' && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>{visibleOnSite.length} Currently Signed In</Text>
              <TouchableOpacity onPress={load}>
                <RefreshCw size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            {visibleOnSite.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>Nobody is on-site right now.</Text>
              </View>
            ) : (
              visibleOnSite.map((visit) => (
                <TouchableOpacity key={visit.id} style={s.visitCard} onPress={() => setSelectedPerson(visit)} activeOpacity={0.75}>
                  <View style={[s.visitAvatar, s.visitAvatarActive, { position: 'relative' }]}>
                    <Text style={[s.visitAvatarTxt, s.visitAvatarTxtActive]}>{visit.name[0]?.toUpperCase()}</Text>
                    <View style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, backgroundColor: '#16a34a', borderRadius: 7, borderWidth: 2, borderColor: '#fff' }} />
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{visit.name}</Text>
                    <Text style={s.visitSub}>{visit.group} · in {fmtTime(visit.sign_in_time)}</Text>
                    {visit.pre_registered && visit.checked_in_by_guard ? (
                      <Text style={s.visitNote}>Pre-registered visitor checked in by security</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {activeTab === 'Signed Out' && (
          <>
            <Text style={s.sectionTitle}>Signed Out Today</Text>
            {visibleSignedOut.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No sign-outs recorded yet.</Text>
              </View>
            ) : (
              visibleSignedOut.map((visit) => (
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

        {activeTab === 'Deliveries' && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Deliveries</Text>
              <TouchableOpacity onPress={() => navigation.navigate('DeliveryForm', { siteId: selectedSite?.id })} style={s.deliveryAddBtn}>
                <Package size={16} color="#fff" />
                <Text style={s.deliveryAddText}>Add Delivery</Text>
              </TouchableOpacity>
            </View>
            {visibleDeliveries.length === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>No deliveries found for this site.</Text></View>
            ) : visibleDeliveries.map((delivery) => (
              <TouchableOpacity key={delivery._id || delivery.id} style={s.visitCard} onPress={() => navigation.navigate('Deliveries', { siteId: selectedSite?.id, deliveryId: delivery._id || delivery.id })} activeOpacity={0.75}>
                <View style={[s.visitAvatar, { backgroundColor: '#fff7ed' }]}><Package size={20} color="#c2410c" /></View>
                <View style={s.visitMeta}>
                  <Text style={s.visitName}>{delivery.itemName || delivery.recipient || 'Delivery'}</Text>
                  <Text style={s.visitSub}>For {delivery.recipient || 'site reception'}{delivery.carrier ? ` · ${delivery.carrier}` : ''}</Text>
                  <Text style={s.visitNote}>{delivery.collected ? 'Collected' : 'Awaiting collection'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {activeTab === 'Approvals' && (
          <>
            <Text style={s.sectionTitle}>Pending registrations ({pendingGuards.length})</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              These Guards registered via the app and are waiting for your approval.
            </Text>
            {pendingGuards.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No pending registrations.</Text>
              </View>
            ) : (
              pendingGuards.map((guard) => (
                <View key={guard.id} style={[s.visitCard, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
                    <View style={[s.visitAvatar, { backgroundColor: '#fef3c7' }]}>
                      <Text style={[s.visitAvatarTxt, { color: '#92400e' }]}>{(guard.name||'?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={s.visitMeta}>
                      <Text style={s.visitName}>{guard.name}</Text>
                      <Text style={s.visitSub}>{guard.email || 'No email'} · {guard.role || 'Guard'}</Text>
                      {guard.site && <Text style={s.visitNote}>Site: {guard.site}</Text>}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                    <TouchableOpacity
                      onPress={() => approveGuard(guard.id, 'approve')}
                      disabled={approvingId === guard.id}
                      style={{ flex: 1, backgroundColor: '#2b4594', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                    >
                      {approvingId === guard.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>✓ Approve</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => approveGuard(guard.id, 'reject')}
                      disabled={approvingId === guard.id}
                      style={{ flex: 1, backgroundColor: '#fef2f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' }}
                    >
                      <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 14 }}>✕ Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'Notifications' && (
          <>
            <View style={s.notifSettingsRow}>
              <Text style={s.sectionTitle}>Guard Arrival Notifications</Text>
              <TouchableOpacity onPress={() => setNotifOn((value) => !value)} style={[s.togglePill, notifOn && s.togglePillOn]}>
                <Text style={notifOn ? s.toggleTextOn : s.toggleTextOff}>{notifOn ? 'On' : 'Off'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.notifDesc}>Notifications list visitors who were pre-registered and then checked in by security.</Text>

            {notifications.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No Pre-registered Guard Arrivals Yet.</Text>
              </View>
            ) : (
              notifications.map((item) => (
                <View key={item.id} style={s.notifCard}>
                  <View style={[s.visitAvatar, s.notifAvatar]}>
                    <Text style={[s.visitAvatarTxt, s.notifAvatarTxt]}>{item.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{item.name} arrived</Text>
                    <Text style={s.visitSub}>
                      {item.group} · {fmtDate(item.sign_in_time)} · {fmtTime(item.sign_in_time)}
                    </Text>
                    <Text style={s.visitNote}>Checked In by {item.checked_in_by || 'Security Guard'}</Text>
                  </View>
                  <Bell size={16} color="#2b4594" />
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'Guards' && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Pending Guard Approvals</Text>
              <TouchableOpacity onPress={load}>
                <RefreshCw size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {pendingGuards.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No Guards waiting for approval.</Text>
              </View>
            ) : (
              pendingGuards.map((g) => (
                <View key={g.id} style={s.visitCard}>
                  <View style={s.visitAvatar}>
                    <Text style={s.visitAvatarTxt}>{(g.name || 'G')[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={s.visitMeta}>
                    <Text style={s.visitName}>{g.name || 'Guard'}</Text>
                    <Text style={s.visitSub}>{g.email || ''}</Text>
                    <Text style={s.visitNote}>Approval required</Text>
                  </View>

                  <View style={s.approvalActions}>
                    <TouchableOpacity
                      onPress={() => handleApproval(g.id, 'approved')}
                      style={[s.approveBtn, updatingApproval === `${g.id}:approved` && { opacity: 0.7 }]}
                      disabled={Boolean(updatingApproval)}
                    >
                      {updatingApproval === `${g.id}:approved`
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.approveBtnTxt}>Approve</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleApproval(g.id, 'rejected')}
                      style={[s.rejectBtn, updatingApproval === `${g.id}:rejected` && { opacity: 0.7 }]}
                      disabled={Boolean(updatingApproval)}
                    >
                      {updatingApproval === `${g.id}:rejected`
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.rejectBtnTxt}>Reject</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <View style={[s.sectionRow, s.sectionTopSpacing]}>
              <Text style={s.sectionTitle}>Guards Present On-Site</Text>
              <TouchableOpacity onPress={load}>
                <RefreshCw size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {presentGuards.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No Guards currently signed in.</Text>
              </View>
            ) : (
              presentGuards.map((g) => (
                <View key={g.id} style={[s.visitCard, { alignItems: 'center' }]}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
                    onPress={() => setSelectedPerson(g)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.visitAvatar, s.visitAvatarActive, { position: 'relative' }]}>
                      <Text style={[s.visitAvatarTxt, s.visitAvatarTxtActive]}>{(g.name || 'G')[0]?.toUpperCase()}</Text>
                      <View style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, backgroundColor: '#16a34a', borderRadius: 7, borderWidth: 2, borderColor: '#fff' }} />
                    </View>
                    <View style={s.visitMeta}>
                      <Text style={s.visitName}>{g.name || 'Guard'}</Text>
                      <Text style={s.visitSub}>Signed in {fmtTime(g.check_in_time)}</Text>
                      {g.email ? <Text style={s.visitNote}>{g.email}</Text> : null}
                    </View>
                  </TouchableOpacity>
                  {/* DM button — navigate to Messages tab with this guard as DM contact */}
                  {g.member_id && navigation && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('Messages', {
                        receiverId:   String(g.member_id),
                        receiverName: g.name,
                        siteId:       selectedSite?.id,
                        siteName:     selectedSite?.name,
                      })}
                      style={s.dmBtn}
                    >
                      <MessageSquare size={18} color="#2b4594" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ── Cameras tab ───────────────────────────────────────────────── */}
        {activeTab === 'Cameras' && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Live Camera Feeds</Text>
              <TouchableOpacity onPress={() => fetchCameras(selectedSite?.id)}>
                <RefreshCw size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {camerasLoading ? (
              <View style={s.emptyCard}>
                <ActivityIndicator color="#2b4594" />
                <Text style={[s.emptyText, { marginTop: 8 }]}>Loading cameras…</Text>
              </View>
            ) : cameras.length === 0 ? (
              <View style={s.emptyCard}>
                <VideoOff size={28} color="#9ca3af" />
                <Text style={[s.emptyText, { marginTop: 8 }]}>No cameras configured for this site.</Text>
              </View>
            ) : (
              cameras.map((cam) => (
                <View key={cam.id} style={[s.visitCard, { flexDirection: 'column', gap: 0, paddingBottom: 0 }]}>
                  {/* Camera info row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12, gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: cam.status === 'online' ? '#dcfce7' : '#fee2e2', alignItems: 'center', justifyContent: 'center' }}>
                      {cam.status === 'online'
                        ? <Video size={20} color="#16a34a" />
                        : <VideoOff size={20} color="#ef4444" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.visitName}>{cam.name}</Text>
                      <Text style={s.visitSub}>{cam.location}</Text>
                      {cam.ptz_supported && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#2b4594' }} />
                          <Text style={{ fontSize: 11, color: '#2b4594', fontWeight: '600' }}>PTZ</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => openCameraFeed(cam)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#2b4594', borderRadius: 10 }}
                      disabled={cam.status !== 'online'}
                    >
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                        {cam.status === 'online' ? 'View' : 'Offline'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

      </ScrollView>

      <PersonDetailsModal
        visible={Boolean(selectedPerson)}
        onClose={() => setSelectedPerson(null)}
        person={selectedPerson}
      />

      {/* Live camera modal */}
      <LiveCameraModal
        visible={Boolean(activeCameraModal)}
        onClose={() => setActiveCameraModal(null)}
        camera={activeCameraModal?.camera}
        streamSession={activeCameraModal?.session}
        loading={sessionLoading}
        onPtzStart={handlePtzStart}
        onPtzStop={handlePtzStop}
        onPreset={handlePreset}
      />
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
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  notifBtnActive: { backgroundColor: '#2b4594', borderColor: '#2b4594' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  sitePicker: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    zIndex: 10,
  },
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
    top: 54,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 5,
  },
  siteOption: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  siteOptionTxt: { fontSize: 15, color: '#111827' },
  siteOptionTxtActive: { color: '#2b4594', fontWeight: '700' },
  // A wrapped action grid keeps every option visible without horizontal scrolling.
  tabBar: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 6 },
  managerSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  managerSearchInput: { flex: 1, fontSize: 15, color: '#111827' },
  dateFilterRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 8 },
  dateFilterInput: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  dateFilterText: { flex: 1, color: '#111827', fontSize: 13 },
  dateFilterPlaceholder: { color: '#9ca3af' },
  tab: { width: '25%', minHeight: 34, justifyContent: 'center', alignItems: 'center', borderRadius: 8, paddingHorizontal: 4 },
  tabActive: { backgroundColor: '#e8edfb' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#2b4594', fontWeight: '700' },
  // Extra bottom padding so lists/buttons aren't hidden behind bottom tabs
  scrollContent: { padding: 16, paddingBottom: 120 },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  countCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderLeftWidth: 4,
  },
  countVal: { fontSize: 28, fontWeight: '700', marginBottom: 2 },
  countLabel: { fontSize: 12, color: '#6b7280' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 10 },
  sectionTopSpacing: { marginTop: 20 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  deliveryAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2b4594', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  deliveryAddText: { color: '#fff', fontWeight: '700', fontSize: 12 },
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
  visitSub: { fontSize: 13, color: '#9ca3af', marginTop: 1 },
  visitNote: { fontSize: 12, color: '#2b4594', marginTop: 3 },
  pendingBadge: { backgroundColor: '#fef3c7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeTxt: { fontSize: 12, fontWeight: '600', color: '#92400e' },
  approvalActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  approveBtn: { backgroundColor: '#2b4594', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minWidth: 86, alignItems: 'center' },
  approveBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rejectBtn: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minWidth: 76, alignItems: 'center' },
  rejectBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  notificationOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  notificationSheet: { maxHeight: '70%', backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  notificationTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  notificationSetting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  notificationSettingText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  notificationItem: { flexDirection: 'row', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  notificationItemTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  notificationItemText: { fontSize: 13, color: '#64748b', marginTop: 3 },
  notificationEmpty: { paddingVertical: 30, textAlign: 'center', color: '#64748b', fontSize: 14 },
  notifSettingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  notifDesc: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 18 },
  notifCard: {
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
  notifAvatar: { backgroundColor: '#eff6ff' },
  notifAvatarTxt: { color: '#2b4594' },
  togglePill: { backgroundColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  togglePillOn: { backgroundColor: '#2b4594' },
  toggleTextOn: { color: '#fff', fontSize: 13, fontWeight: '600' },
  toggleTextOff: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  dmBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

export default ManagerScreen;
