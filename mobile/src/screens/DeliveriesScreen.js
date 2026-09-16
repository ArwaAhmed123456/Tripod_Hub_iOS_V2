import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarDays, Download, FileText, Package, Plus, RefreshCw, Search, X } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// ── Helpers ────────────────────────────────────────────────────────────────
const formatDate = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// Extract just the date portion: "15 Sep 2026"
const fmtDateOnly = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Extract just the time portion: "14:35"
const fmtTimeOnly = (value) =>
  value ? new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

// Compute duration in minutes between two ISO timestamps; returns "47 min" or "—"
const fmtDuration = (from, to) => {
  if (!from || !to) return '—';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const hrs  = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
};

const formatDateShort = (d) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const formatDateTimeCell = (value) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

// DD-MM-YYYY for filenames
const formatDateFile = (d) => {
  const date = d || new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const toApiDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Sanitise a string for use as a filename component
const safeFilename = (str) =>
  String(str || 'Site')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);

const getDeliveryName = (delivery) => delivery?.recipient || delivery?.name || '—';
const getDeliverySupplier = (delivery) => delivery?.supplier || delivery?.company || delivery?.sender || '—';
const getDeliveryProduct = (delivery) => delivery?.product || delivery?.itemName || delivery?.item_name || '—';
const getVehicleRegistration = (delivery) => delivery?.carRegistration || delivery?.car_registration || '—';
const getDeliveryDocumentNumber = (delivery) => delivery?.deliveryDocumentNumber || delivery?.delivery_document_number || '—';
const getNetWeight = (delivery) => delivery?.netWeight || delivery?.net_weight || '—';

// ── Component ──────────────────────────────────────────────────────────────
export default function DeliveriesScreen({ navigation, route }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const siteId = route?.params?.siteId || user?.project_id || user?.site_id;
  const siteName = route?.params?.siteName || user?.siteName || user?.project_name || 'Site';

  // Derive server root URL for building image URLs in PDF (strip trailing /api)
  const SERVER_BASE = api.defaults.baseURL?.replace(/\/api\/?$/, '') || 'https://tripod-signin-app.onrender.com';

  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo]     = useState(null);
  const [showPicker, setShowPicker] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailIncludePhoto, setDetailIncludePhoto] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportIncludePhotos, setExportIncludePhotos] = useState(true);
  const [exporting, setExporting] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!siteId) { setLoading(false); return; }
    try {
      const response = await api.get('/deliveries', {
        params: {
          site_id: siteId,
          search: search || undefined,
          date_from: toApiDate(dateFrom) || undefined,
          date_to:   toApiDate(dateTo)   || undefined,
        },
      });
      setDeliveries(response.data || []);
    } catch (err) {
      Alert.alert('Could not load deliveries', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [siteId, search, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (route?.params?.deliveryId && deliveries.length) {
      setSelected(
        deliveries.find((d) => String(d._id || d.id) === String(route.params.deliveryId)) || null,
      );
    }
  }, [deliveries, route?.params?.deliveryId]);

  const list = useMemo(() => deliveries, [deliveries]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportReport = async (
    format,
    reportItems = list,
    reportTitle = 'Delivery Report',
    includePhotos = true,
  ) => {
    if (!reportItems.length) {
      return Alert.alert('Nothing to export', 'No deliveries match the current filters.');
    }
    setExporting(true);
    try {
      // ── Report columns ──────────────────────────────────────────────────
      // Use only the current Delivery Report field set and avoid legacy
      // collection/status fields from the previous template.
      const rows = reportItems
        .map(
          (d, idx) => {
            const arrival = d.receivedAt || d.createdAt;
            return `
          <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}">
            <td style="padding:8px 10px">${esc(getDeliveryName(d))}</td>
            <td style="padding:8px 10px">${esc(siteName)}</td>
            <td style="padding:8px 10px;white-space:nowrap">${esc(fmtDateOnly(arrival))}</td>
            <td style="padding:8px 10px;white-space:nowrap">${esc(fmtTimeOnly(arrival))}</td>
            <td style="padding:8px 10px">${esc(fmtDuration(arrival, d.collectedAt) )}</td>
            <td style="padding:8px 10px">${esc(getDeliverySupplier(d))}</td>
            <td style="padding:8px 10px">${esc(getVehicleRegistration(d))}</td>
            <td style="padding:8px 10px">${esc(getDeliveryDocumentNumber(d))}</td>
            <td style="padding:8px 10px">${esc(getDeliveryProduct(d))}</td>
            <td style="padding:8px 10px">${esc(getNetWeight(d))}</td>
          </tr>`;
          },
        )
        .join('');

      // ── Delivery picture section ─────────────────────────────────────────
      const singleDelivery = reportItems.length === 1 ? reportItems[0] : null;
      let imageSection = '';
      if (includePhotos && singleDelivery?.deliveryImageUrl) {
        imageSection = `
          <div style="margin-top:28px;page-break-inside:avoid">
            <h3 style="font-size:13px;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Delivery Picture</h3>
            <img src="${SERVER_BASE}${singleDelivery.deliveryImageUrl}"
              style="max-width:400px;max-height:280px;border:1px solid #e2e8f0;border-radius:8px;display:block" />
          </div>`;
      } else if (includePhotos && reportItems.length > 1) {
        const withPics = reportItems.filter((d) => d.deliveryImageUrl);
        if (withPics.length > 0) {
          imageSection = `
          <div style="margin-top:32px;page-break-before:always">
            <h3 style="font-size:15px;color:#111827;margin-bottom:14px">Attached Delivery Pictures</h3>
            <div style="display:flex;flex-wrap:wrap;gap:16px">
              ${withPics.map((d) => `
                <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;width:260px;page-break-inside:avoid">
                  <div style="font-size:12px;font-weight:bold;color:#374151;margin-bottom:6px">
                    ${esc(getDeliveryName(d))} — ${esc(getDeliverySupplier(d))}
                  </div>
                  <img src="${SERVER_BASE}${d.deliveryImageUrl}"
                    style="width:100%;height:170px;object-fit:cover;border-radius:6px" />
                </div>`).join('')}
            </div>
          </div>`;
        }
      }

      // ── Period label ─────────────────────────────────────────────────────
      const periodLabel =
        dateFrom || dateTo
          ? `${dateFrom ? formatDateShort(dateFrom) : 'All dates'} — ${dateTo ? formatDateShort(dateTo) : 'Today'}`
          : 'All dates';

      // ── Full HTML ────────────────────────────────────────────────────────
      const generatedOn = new Date().toLocaleString('en-GB', {
        dateStyle: 'long', timeStyle: 'short',
      });
      const totalRows = reportItems.length;
      const filename = `Delivery_Report_${safeFilename(siteName)}_${formatDateFile(new Date())}.pdf`;

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(filename)}</title>
  <style>
    @page { margin: 20mm 15mm; size: A4 landscape; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; margin: 0; padding: 0; }
    .report-shell { padding-bottom: 64px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1e3a8a; color: #ffffff; padding: 9px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .report-head { display:flex; align-items:center; gap:16px; border-bottom:3px solid #1e3a8a; padding-bottom:14px; margin-bottom:16px; }
    .report-head img { height:52px; max-width:170px; object-fit:contain; }
    .report-head-copy { flex:1; }
    .company-name { margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:1.1px; text-transform:uppercase; color:#1e3a8a; }
    .report-title { margin:0; font-size:22px; color:#111827; }
    .report-meta { margin:4px 0 0; font-size:11px; color:#64748b; }
    .report-count { text-align:right; font-size:11px; color:#64748b; }
    .report-count strong { display:block; font-size:22px; font-weight:700; color:#1e3a8a; }
    .report-end { margin-top:22px; padding-top:10px; border-top:1px solid #cbd5e1; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b; text-align:center; }
    .footer { position: fixed; left: 0; right: 0; bottom: 0; border-top: 1px solid #e5e7eb; padding: 10px 15mm 0; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; background: #ffffff; }
    .page-number::after { content: "Page " counter(page); }
  </style>
</head>
<body>
  <div class="report-shell">
    <!-- ── Header ── -->
    <div class="report-head">
      <img src="${SERVER_BASE}/Tipod_Final_Logo_high_pixel.png" alt="Tripod Services logo" />
      <div class="report-head-copy">
        <p class="company-name">Tripod Services</p>
        <h2 class="report-title">${esc(reportTitle)}</h2>
        <p class="report-meta">
          ${esc(siteName)} &nbsp;·&nbsp; Period: ${esc(periodLabel)} &nbsp;·&nbsp; Generated ${esc(generatedOn)}
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
        <tr>
          <th>Name</th>
          <th>Site / Project</th>
          <th>Date</th>
          <th>Time</th>
          <th>Duration</th>
          <th>Supplier</th>
          <th>Vehicle Reg</th>
          <th>Delivery Doc No.</th>
          <th>Product</th>
          <th>Net Weight</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${imageSection}

    <div class="report-end">End of report</div>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <span>Tripod Services &nbsp;·&nbsp; Official Delivery Report</span>
    <span>${esc(siteName)}</span>
    <span class="page-number"></span>
  </div>

</body>
</html>`;

      if (format === 'pdf') {
        // Generate to a temp URI first, then copy with a descriptive name
        const { uri: tempUri } = await Print.printToFileAsync({ html, base64: false });
        const destUri = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${filename}`;

        await FileSystem.deleteAsync(destUri, { idempotent: true });
        await FileSystem.copyAsync({ from: tempUri, to: destUri });

        await Sharing.shareAsync(destUri, {
          mimeType:    'application/pdf',
          dialogTitle: 'Delivery Report (PDF)',
          UTI:         'com.adobe.pdf',
        });
      } else {
        // Excel — named file
        const filename = `Delivery_Report_${safeFilename(siteName)}_${formatDateFile(new Date())}.xls`;
        const destUri  = FileSystem.cacheDirectory + filename;

        await FileSystem.writeAsStringAsync(destUri, html, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(destUri, {
          mimeType:    'application/vnd.ms-excel',
          dialogTitle: 'Delivery Report (Excel)',
        });
      }
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not create the report.');
    } finally {
      setExporting(false);
    }
  };

  // ── Delivery detail sheet ─────────────────────────────────────────────────
  const renderDetail = (d) => (
    <Modal visible={!!d} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={s.overlay}>
        <ScrollView
          style={s.sheet}
          contentContainerStyle={{ paddingBottom: 36 }}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.detailHeader}>
            <Text style={s.detailTitle}>Delivery Details</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <X size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={s.packageIcon}><Package size={30} color="#c2410c" /></View>

          {/* Title shows the PRODUCT, not the name */}
          <Text style={s.itemTitle}>{d?.product || d?.itemName || d?.item_name || 'Delivery'}</Text>
          <Text style={s.itemSub}>{d?.recipient || d?.name || ''}</Text>

          {/* ── Only current DeliveryFormScreen fields — no Status, no Collected At ── */}
          {[
            ['Name',                    d?.recipient || d?.name],
            ['Supplier',                d?.supplier || d?.company || d?.sender],
            ['Product',                 d?.product || d?.itemName || d?.item_name],
            ['Vehicle Registration',    d?.carRegistration || d?.car_registration],
            ['Delivery Document No.',   d?.deliveryDocumentNumber || d?.delivery_document_number],
            ['Net Weight',              d?.netWeight || d?.net_weight],
            ['Description',             d?.description || d?.notes],
            ['Date',                    fmtDateOnly(d?.receivedAt || d?.createdAt)],
            ['Time',                    fmtTimeOnly(d?.receivedAt || d?.createdAt)],
          ]
            .filter(([, value]) => value)   // hide empty rows
            .map(([label, value]) => (
              <View key={label} style={s.detailRow}>
                <Text style={s.detailLabel}>{label}</Text>
                <Text style={s.detailValue}>{String(value)}</Text>
              </View>
            ))}

          {/* Delivery picture */}
          {d?.deliveryImageUrl ? (
            <View style={s.detailImageSection}>
              <Text style={s.detailLabel}>Delivery Picture</Text>
              <Image
                source={{ uri: `${SERVER_BASE}${d.deliveryImageUrl}` }}
                style={s.detailImage}
                resizeMode="cover"
              />
              <View style={s.photoToggleRow}>
                <Text style={s.photoToggleLabel}>Include picture in printable report</Text>
                <Switch
                  value={detailIncludePhoto}
                  onValueChange={setDetailIncludePhoto}
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={detailIncludePhoto ? '#2b4594' : '#f1f5f9'}
                />
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={s.detailExport}
            onPress={() =>
              Alert.alert('Download this delivery', 'Choose a format', [
                {
                  text: 'PDF',
                  onPress: () => exportReport('pdf', [d], 'Delivery Details', detailIncludePhoto),
                },
                {
                  text: 'Excel (.xls)',
                  onPress: () => exportReport('excel', [d], 'Delivery Details', false),
                },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
          >
            <Download size={18} color="#fff" />
            <Text style={s.buttonText}>Download Details</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Date picker handler ───────────────────────────────────────────────────
  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowPicker(null);
    if (selectedDate) {
      if (showPicker === 'from') setDateFrom(selectedDate);
      else setDateTo(selectedDate);
    }
    if (Platform.OS === 'ios') setShowPicker(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.page} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={23} color="#111827" />
        </TouchableOpacity>
        <Package size={21} color="#2b4594" />
        <Text style={s.title}>Deliveries</Text>
        <TouchableOpacity onPress={load}>
          <RefreshCw size={19} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={s.filters}>
        <View style={s.searchRow}>
          <Search size={16} color="#64748b" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search item, recipient or company"
            placeholderTextColor="#94a3b8"
            style={s.searchInput}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={s.dateRow}>
          <TouchableOpacity style={s.dateInput} onPress={() => setShowPicker('from')}>
            <CalendarDays size={15} color="#2b4594" />
            <Text style={[s.dateText, !dateFrom && s.datePlaceholder]}>
              {dateFrom ? formatDateShort(dateFrom) : 'From date'}
            </Text>
            {dateFrom ? (
              <TouchableOpacity
                onPress={() => setDateFrom(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={13} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity style={s.dateInput} onPress={() => setShowPicker('to')}>
            <CalendarDays size={15} color="#2b4594" />
            <Text style={[s.dateText, !dateTo && s.datePlaceholder]}>
              {dateTo ? formatDateShort(dateTo) : 'To date'}
            </Text>
            {dateTo ? (
              <TouchableOpacity
                onPress={() => setDateTo(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={13} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          disabled={exporting}
          onPress={() => setShowExportModal(true)}
          style={s.reportBtn}
        >
          {exporting ? (
            <ActivityIndicator color="#2b4594" />
          ) : (
            <>
              <Download size={17} color="#2b4594" />
              <Text style={s.reportText}>Download Filtered Report</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Export Options Modal */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Export Delivery Report</Text>
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

            {exportFormat === 'pdf' && (
              <View style={s.photoToggleRow}>
                <Text style={s.photoToggleLabel}>Include delivery pictures</Text>
                <Switch
                  value={exportIncludePhotos}
                  onValueChange={setExportIncludePhotos}
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={exportIncludePhotos ? '#2b4594' : '#f1f5f9'}
                />
              </View>
            )}

            <TouchableOpacity
              style={s.confirmBtn}
              onPress={() => {
                setShowExportModal(false);
                exportReport(exportFormat, list, 'Delivery Report', exportIncludePhotos);
              }}
            >
              <Text style={s.confirmBtnText}>Download Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Native date picker */}
      {showPicker ? (
        <DateTimePicker
          value={showPicker === 'from' ? (dateFrom || new Date()) : (dateTo || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
        />
      ) : null}

      {/* Delivery list */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#2b4594" /></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => String(item._id || item.id)}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          contentContainerStyle={
            list.length
              ? [s.list, { paddingBottom: insets.bottom + 100 }]
              : s.empty
          }
          ListEmptyComponent={
            <>
              <Package size={42} color="#cbd5e1" />
              <Text style={s.emptyTitle}>No deliveries found</Text>
              <Text style={s.emptyCopy}>Change the filters or add a delivery.</Text>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => setSelected(item)}
              activeOpacity={0.75}
            >
              <View style={s.icon}><Package size={20} color="#c2410c" /></View>
              <View style={s.meta}>
                {/* Card title = PRODUCT; sub = driver name */}
                <Text style={s.name}>
                  {item.product || item.itemName || item.item_name || 'Delivery'}
                </Text>
                <Text style={s.sub}>
                  {item.recipient || item.name
                    ? `From ${item.recipient || item.name}`
                    : ''}
                  {(item.supplier || item.company)
                    ? ` · ${item.supplier || item.company}`
                    : ''}
                </Text>
                <Text style={s.date}>{formatDate(item.receivedAt || item.createdAt)}</Text>
              </View>
              <FileText size={18} color="#64748b" />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Delivery detail modal */}
      {renderDetail(selected)}

      {/* Add Delivery FAB */}
      <TouchableOpacity
        style={[s.add, { bottom: insets.bottom + 16 }]}
        onPress={() => navigation.navigate('DeliveryForm', { siteId })}
      >
        <Plus size={20} color="#fff" />
        <Text style={s.addText}>Add Delivery</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:            { flex: 1, backgroundColor: '#f8fafc' },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title:           { flex: 1, fontSize: 19, fontWeight: '800', color: '#111827' },
  filters:         { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  searchRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, height: 43 },
  searchInput:     { flex: 1, fontSize: 14, color: '#111827' },
  dateRow:         { flexDirection: 'row', gap: 8, marginTop: 8 },
  dateInput:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#f9fafb' },
  dateText:        { flex: 1, fontSize: 13, color: '#111827', fontWeight: '500' },
  datePlaceholder: { color: '#94a3b8', fontWeight: '400' },
  reportBtn:       { marginTop: 9, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10, borderRadius: 10, backgroundColor: '#eef2ff' },
  reportText:      { fontWeight: '700', fontSize: 13, color: '#2b4594' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:            { padding: 16 },
  empty:           { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle:      { marginTop: 14, fontSize: 17, fontWeight: '700', color: '#334155' },
  emptyCopy:       { marginTop: 6, fontSize: 14, color: '#64748b', textAlign: 'center' },
  card:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  icon:            { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  meta:            { flex: 1 },
  name:            { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub:             { fontSize: 13, color: '#475569', marginTop: 2 },
  date:            { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  add:             { position: 'absolute', right: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2b4594', borderRadius: 28, paddingHorizontal: 18, paddingVertical: 14, elevation: 6, shadowColor: '#2b4594', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  addText:         { color: '#fff', fontWeight: '800', fontSize: 15 },
  // Detail modal
  overlay:         { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '90%' },
  detailHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  detailTitle:     { fontSize: 19, fontWeight: '800', color: '#111827' },
  packageIcon:     { marginTop: 16, width: 54, height: 54, borderRadius: 16, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  itemTitle:       { fontSize: 20, fontWeight: '800', marginTop: 10, color: '#111827' },
  itemSub:         { fontSize: 14, color: '#64748b', marginTop: 2, marginBottom: 8 },
  status:          { color: '#b45309', fontWeight: '700', marginTop: 3, marginBottom: 8 },
  detailRow:       { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  detailLabel:     { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue:     { fontSize: 15, color: '#111827', marginTop: 2 },
  detailImageSection: { marginTop: 14, marginBottom: 4 },
  detailImage:     { width: '100%', height: 200, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  photoToggleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  photoToggleLabel:{ fontSize: 13, fontWeight: '600', color: '#334155' },
  detailExport:    { backgroundColor: '#2b4594', borderRadius: 12, padding: 14, marginTop: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  buttonText:      { color: '#fff', fontWeight: '800', fontSize: 15 },
  // Export modal
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard:       { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  formatRow:       { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 16 },
  formatBtn:       { flex: 1, paddingVertical: 11, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, alignItems: 'center' },
  formatBtnActive: { borderColor: '#2b4594', backgroundColor: '#eff6ff' },
  formatBtnText:   { fontSize: 13, fontWeight: '700', color: '#64748b' },
  formatBtnTextActive: { color: '#2b4594' },
  confirmBtn:      { backgroundColor: '#2b4594', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  confirmBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
});
