import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
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
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// ── Helpers ────────────────────────────────────────────────────────────────
const formatDate = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const formatDateShort = (d) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

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

// ── Component ──────────────────────────────────────────────────────────────
export default function DeliveriesScreen({ navigation, route }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const siteId = route?.params?.siteId || user?.project_id || user?.site_id;

  // Derive server root URL for building image URLs in PDF (strip trailing /api)
  const SERVER_BASE = api.defaults.baseURL?.replace(/\/api\/?$/, '') || 'https://tripod-signin-app.onrender.com';

  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(null);   // Date | null
  const [dateTo, setDateTo]     = useState(null);   // Date | null
  const [showPicker, setShowPicker] = useState(null); // 'from' | 'to' | null
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
  const exportReport = async (format, reportItems = list, reportTitle = 'Delivery Report', includePhotos = true) => {
    if (!reportItems.length) {
      return Alert.alert('Nothing to export', 'No deliveries match the current filters.');
    }
    setExporting(true);
    try {
      // ── Report columns match ONLY the mobile DeliveryFormScreen fields ──
      const rows = reportItems
        .map(
          (d) => `<tr>
            <td>${esc(d.itemName || d.item_name || '—')}</td>
            <td>${esc(d.company || '—')}</td>
            <td>${esc(d.description || d.notes || '—')}</td>
            <td>${esc(d.carRegistration || d.car_registration || '—')}</td>
            <td>${esc(formatDate(d.receivedAt || d.createdAt))}</td>
            <td>${d.collected ? 'Collected' : 'Pending collection'}</td>
            <td>${d.collected ? esc(formatDate(d.collectedAt)) : '—'}</td>
          </tr>`,
        )
        .join('');

      // Delivery picture section — only rendered when includePhotos is TRUE and image exists
      const singleDelivery = reportItems.length === 1 ? reportItems[0] : null;
      let imageSection = '';
      if (includePhotos && singleDelivery?.deliveryImageUrl) {
        imageSection = `<div style="margin-top:28px">
            <h3 style="font-size:14px;color:#374151;margin-bottom:10px">Delivery Picture</h3>
            <img src="${SERVER_BASE}${singleDelivery.deliveryImageUrl}"
              style="max-width:400px;max-height:300px;border:1px solid #e2e8f0;border-radius:8px;display:block" />
           </div>`;
      } else if (includePhotos && reportItems.length > 1) {
        const deliveriesWithPics = reportItems.filter(d => d.deliveryImageUrl);
        if (deliveriesWithPics.length > 0) {
          imageSection = `<div style="margin-top:32px;page-break-before:always">
            <h3 style="font-size:16px;color:#111827;margin-bottom:14px">Attached Delivery Pictures</h3>
            <div style="display:flex;flex-wrap:wrap;gap:16px">
              ${deliveriesWithPics.map(d => `
                <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;width:280px">
                  <div style="font-size:12px;font-weight:bold;margin-bottom:6px">${esc(d.itemName || d.item_name || 'Item')} — ${esc(d.company || '—')}</div>
                  <img src="${SERVER_BASE}${d.deliveryImageUrl}" style="width:100%;height:180px;object-fit:cover;border-radius:6px" />
                </div>
              `).join('')}
            </div>
          </div>`;
        }
      }

      const html = `<html><body style="font-family:Arial;padding:24px;color:#111827">
        <h2>${esc(reportTitle)}</h2>
        <p>Period: ${dateFrom ? formatDateShort(dateFrom) : 'All dates'} — ${dateTo ? formatDateShort(dateTo) : 'Today'}</p>
        <table style="width:100%;border-collapse:collapse" border="1" cellpadding="7">
          <thead><tr style="background:#f8fafc;font-weight:bold">
            <th>Item Name</th><th>Company</th><th>Description</th>
            <th>Vehicle Reg.</th><th>Received</th><th>Status</th><th>Collected At</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${imageSection}
      </body></html>`;

      if (format === 'pdf') {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Delivery report (PDF)' });
      } else {
        const file = new File(Paths.cache, 'delivery-report.xls');
        await file.writeAsStringAsync(html);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/vnd.ms-excel', dialogTitle: 'Delivery report (Excel)' });
      }
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not create the report.');
    } finally {
      setExporting(false);
    }
  };

  // ── Delivery detail sheet ───────────────────────────────────────────────
  const renderDetail = (d) => (
    <Modal visible={!!d} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.detailHeader}>
            <Text style={s.detailTitle}>Delivery Details</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <X size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={s.packageIcon}><Package size={30} color="#c2410c" /></View>
          <Text style={s.itemTitle}>{d?.itemName || d?.recipient || 'Delivery'}</Text>
          <Text style={s.status}>{d?.collected ? '✓ Collected' : '⏳ Pending collection'}</Text>

          {[
            // ── Only fields that match the mobile DeliveryFormScreen form ──
            ['Item Name',       d?.itemName],
            ['Company',         d?.company],
            ['Description',     d?.description || d?.notes],
            ['Car Registration', d?.carRegistration || d?.car_registration],
            ['Received',        formatDate(d?.receivedAt || d?.createdAt)],
            ['Collected At',    d?.collected ? formatDate(d?.collectedAt) : 'Not yet collected'],
          ].map(([label, value]) => (
            <View key={label} style={s.detailRow}>
              <Text style={s.detailLabel}>{label}</Text>
              <Text style={s.detailValue}>{value || '—'}</Text>
            </View>
          ))}

          {/* Delivery Picture — only shown when an image was captured */}
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
                { text: 'PDF', onPress: () => exportReport('pdf', [d], 'Delivery Details', detailIncludePhoto) },
                { text: 'Excel (.xls)', onPress: () => exportReport('excel', [d], 'Delivery Details', false) },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
          >
            <Download size={18} color="#fff" />
            <Text style={s.buttonText}>Download Details</Text>
          </TouchableOpacity>
        </View>
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
        {/* Search */}
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

        {/* Date range pickers */}
        <View style={s.dateRow}>
          <TouchableOpacity style={s.dateInput} onPress={() => setShowPicker('from')}>
            <CalendarDays size={15} color="#2b4594" />
            <Text style={[s.dateText, !dateFrom && s.datePlaceholder]}>
              {dateFrom ? formatDateShort(dateFrom) : 'From date'}
            </Text>
            {dateFrom ? (
              <TouchableOpacity onPress={() => setDateFrom(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              <TouchableOpacity onPress={() => setDateTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={13} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* Download filtered report button */}
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
      <Modal visible={showExportModal} transparent animationType="fade" onRequestClose={() => setShowExportModal(false)}>
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
                <Text style={[s.formatBtnText, exportFormat === 'pdf' && s.formatBtnTextActive]}>PDF Document</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.formatBtn, exportFormat === 'excel' && s.formatBtnActive]}
                onPress={() => setExportFormat('excel')}
              >
                <Text style={[s.formatBtnText, exportFormat === 'excel' && s.formatBtnTextActive]}>Excel (.xls)</Text>
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

      {/* Native date picker (renders as dialog on Android, inline on iOS) */}
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
            <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.75}>
              <View style={s.icon}><Package size={20} color="#c2410c" /></View>
              <View style={s.meta}>
                <Text style={s.name}>{item.itemName || item.recipient || 'Delivery'}</Text>
                <Text style={s.sub}>
                  For {item.recipient || 'site reception'}{item.company ? ` · ${item.company}` : ''}
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

      {/* Add Delivery FAB — positioned above bottom nav using safe-area insets */}
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
  page:         { flex: 1, backgroundColor: '#f8fafc' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title:        { flex: 1, fontSize: 19, fontWeight: '800', color: '#111827' },
  filters:      { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, height: 43 },
  searchInput:  { flex: 1, fontSize: 14, color: '#111827' },
  dateRow:      { flexDirection: 'row', gap: 8, marginTop: 8 },
  dateInput:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#f9fafb' },
  dateText:     { flex: 1, fontSize: 13, color: '#111827', fontWeight: '500' },
  datePlaceholder: { color: '#94a3b8', fontWeight: '400' },
  reportBtn:    { marginTop: 9, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10, borderRadius: 10, backgroundColor: '#eef2ff' },
  reportText:   { fontWeight: '700', fontSize: 13, color: '#2b4594' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:         { padding: 16 },
  empty:        { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle:   { marginTop: 14, fontSize: 17, fontWeight: '700', color: '#334155' },
  emptyCopy:    { marginTop: 6, fontSize: 14, color: '#64748b', textAlign: 'center' },
  card:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  icon:         { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  meta:         { flex: 1 },
  name:         { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub:          { fontSize: 13, color: '#475569', marginTop: 2 },
  date:         { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  add:          { position: 'absolute', right: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2b4594', borderRadius: 28, paddingHorizontal: 18, paddingVertical: 14, elevation: 6, shadowColor: '#2b4594', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  addText:      { color: '#fff', fontWeight: '800', fontSize: 15 },
  overlay:      { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36, maxHeight: '90%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  detailTitle:  { fontSize: 19, fontWeight: '800', color: '#111827' },
  packageIcon:  { marginTop: 16, width: 54, height: 54, borderRadius: 16, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  itemTitle:    { fontSize: 20, fontWeight: '800', marginTop: 10, color: '#111827' },
  status:       { color: '#b45309', fontWeight: '700', marginTop: 3, marginBottom: 8 },
  detailRow:    { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  detailLabel:  { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue:  { fontSize: 15, color: '#111827', marginTop: 2 },
  detailImageSection: { marginTop: 14, marginBottom: 4 },
  detailImage:  { width: '100%', height: 200, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  photoToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  photoToggleLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  detailExport: { backgroundColor: '#2b4594', borderRadius: 12, padding: 14, marginTop: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  buttonText:   { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard:    { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: '#111827' },
  formatRow:    { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 16 },
  formatBtn:    { flex: 1, paddingVertical: 11, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, alignItems: 'center' },
  formatBtnActive: { borderColor: '#2b4594', backgroundColor: '#eff6ff' },
  formatBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  formatBtnTextActive: { color: '#2b4594' },
  confirmBtn:   { backgroundColor: '#2b4594', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
