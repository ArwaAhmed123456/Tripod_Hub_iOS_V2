import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Calendar, Camera, Clock, ImagePlus, Package, X } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const DeliveryFormScreen = ({ navigation, route }) => {
  const { user } = useAuth();
  const scrollRef = useRef(null);

  const [name, setName]                             = useState('');
  const [supplier, setSupplier]                     = useState('');
  const [product, setProduct]                       = useState('');
  const [deliveryDocumentNumber, setDeliveryDocumentNumber] = useState('');
  const [netWeight, setNetWeight]                   = useState('');
  const [description, setDescription]               = useState('');
  const [carRegistration, setCarRegistration]       = useState('');
  const [receivedAt, setReceivedAt]                 = useState(new Date());
  const [pickerMode, setPickerMode]                 = useState(null);
  const [saving, setSaving]                         = useState(false);
  const [deliveryImage, setDeliveryImage]           = useState(null);

  // ── Camera permissions ────────────────────────────────────────────────────
  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a photo.');
      return false;
    }
    return true;
  };

  const requestGalleryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Gallery access is required to select a photo.');
      return false;
    }
    return true;
  };

  // ── Photo handlers ────────────────────────────────────────────────────────
  const handleCamera = async () => {
    if (!(await requestCameraPermission())) return;
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setDeliveryImage({ uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: `delivery_${Date.now()}.jpg` });
      }
    } catch {
      Alert.alert('Error', 'Could not open camera. Please try again.');
    }
  };

  const handleGallery = async () => {
    if (!(await requestGalleryPermission())) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setDeliveryImage({ uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: `delivery_${Date.now()}.jpg` });
      }
    } catch {
      Alert.alert('Error', 'Could not open photo library. Please try again.');
    }
  };

  const handleAddPhoto = () => {
    Alert.alert('Delivery Picture', 'Choose how to attach a photo', [
      { text: '📷  Take Photo',          onPress: handleCamera  },
      { text: '🖼️  Choose from Gallery', onPress: handleGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!name.trim() || !supplier.trim() || !product.trim()) {
      Alert.alert('Required fields', 'Please enter Name, Supplier, and Product.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        site_id:                  route?.params?.siteId || user?.project_id || user?.site_id,
        name:                     name.trim(),
        supplier:                 supplier.trim(),
        product:                  product.trim(),
        delivery_document_number: deliveryDocumentNumber.trim(),
        net_weight:               netWeight.trim(),
        item_name:                product.trim(),   // legacy field kept for backward compat
        description:              description.trim(),
        car_registration:         carRegistration.trim(),
        company:                  supplier.trim(),  // legacy alias
        received_at:              receivedAt.toISOString(),
      };

      if (deliveryImage) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => fd.append(k, v));
        fd.append('delivery_image', {
          uri:  deliveryImage.uri,
          type: deliveryImage.type,
          name: deliveryImage.name,
        });
        await api.post('/deliveries', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/deliveries', payload);
      }

      Alert.alert('Delivery recorded', 'The delivery has been recorded successfully.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Could not record delivery', error?.response?.data?.error || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Helper: scroll the view up when a field is focused so it stays visible ─
  // We pass the y-offset of each field's View to scrollRef on focus.
  const scrollToY = (y) => {
    // Small delay so the keyboard has started animating before we scroll
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }, 120);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* KeyboardAvoidingView wraps ONLY the scroll area so the header stays fixed */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Package size={22} color="#2b4594" />
        <Text style={s.title}>Record delivery</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.intro}>Record delivery details for this site.</Text>

          {/* ── Name ── */}
          <View onLayout={(e) => {}}>
            <Text style={s.label}>Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={s.input}
              placeholder="Driver or contact name"
              returnKeyType="next"
              onFocus={(e) => scrollToY(e.nativeEvent?.target ? 0 : 0)}
            />
          </View>

          {/* ── Site (read-only) ── */}
          <Text style={s.label}>Site / Project</Text>
          <TextInput
            value={user?.siteName || user?.project_name || 'Assigned site'}
            editable={false}
            style={[s.input, s.readOnly]}
          />

          {/* ── Date / Time ── */}
          <Text style={s.label}>Date / Time</Text>
          <View style={s.dateRow}>
            <TouchableOpacity onPress={() => setPickerMode('date')} style={s.dateBtn}>
              <Calendar size={18} color="#2b4594" />
              <Text style={s.dateBtnLabel}>Date</Text>
              <Text style={s.dateBtnValue}>{receivedAt.toLocaleDateString('en-GB')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPickerMode('time')} style={s.dateBtn}>
              <Clock size={18} color="#2b4594" />
              <Text style={s.dateBtnLabel}>Time</Text>
              <Text style={s.dateBtnValue}>
                {receivedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          </View>
          {pickerMode ? (
            <DateTimePicker
              value={receivedAt}
              mode={pickerMode}
              is24Hour
              display="default"
              onChange={(event, value) => {
                setPickerMode(null);
                if (value) setReceivedAt(value);
              }}
            />
          ) : null}

          {/* ── Supplier ── */}
          <View onLayout={(e) => { e._supplierY = e.nativeEvent.layout.y; }}>
            <Text style={s.label}>Supplier *</Text>
            <TextInput
              value={supplier}
              onChangeText={setSupplier}
              style={s.input}
              placeholder="Supplier name"
              returnKeyType="next"
              onFocus={(e) => scrollToY(e.nativeEvent?.layout?.y || 200)}
            />
          </View>

          {/* ── Vehicle Reg ── */}
          <Text style={s.label}>Vehicle Reg</Text>
          <TextInput
            value={carRegistration}
            onChangeText={setCarRegistration}
            style={s.input}
            placeholder="Car registration number"
            autoCapitalize="characters"
            returnKeyType="next"
            onFocus={(e) => scrollToY(e.nativeEvent?.layout?.y || 300)}
          />

          {/* ── Delivery Document Number ── */}
          <Text style={s.label}>
            Delivery Document Number{' '}
            <Text style={s.labelOptional}>(Optional)</Text>
          </Text>
          <TextInput
            value={deliveryDocumentNumber}
            onChangeText={setDeliveryDocumentNumber}
            style={s.input}
            placeholder="Document or reference number"
            returnKeyType="next"
            onFocus={(e) => scrollToY(e.nativeEvent?.layout?.y || 400)}
          />

          {/* ── Product ── */}
          <Text style={s.label}>Product *</Text>
          <TextInput
            value={product}
            onChangeText={setProduct}
            style={s.input}
            placeholder="Product or cargo description"
            returnKeyType="next"
            onFocus={(e) => scrollToY(e.nativeEvent?.layout?.y || 500)}
          />

          {/* ── Net Weight ── */}
          <Text style={s.label}>
            Net Weight <Text style={s.labelOptional}>(Optional)</Text>
          </Text>
          <TextInput
            value={netWeight}
            onChangeText={setNetWeight}
            style={s.input}
            placeholder="e.g. 1,250 kg"
            returnKeyType="next"
            onFocus={(e) => scrollToY(e.nativeEvent?.layout?.y || 580)}
          />

          {/* ── Description ── */}
          <Text style={s.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[s.input, s.description]}
            placeholder="Additional details"
            multiline
            returnKeyType="done"
            onFocus={(e) => scrollToY(e.nativeEvent?.layout?.y || 660)}
          />

          {/* ── Delivery Picture ── */}
          <Text style={s.label}>
            Image <Text style={s.labelOptional}>(Optional)</Text>
          </Text>
          <View style={s.photoSection}>
            <Text style={s.label}>Attach vehicle or delivery image</Text>
            {deliveryImage ? (
              <View>
                <Image source={{ uri: deliveryImage.uri }} style={s.photoPreview} resizeMode="cover" />
                <View style={s.photoActions}>
                  <TouchableOpacity onPress={handleAddPhoto} style={s.retakeBtn}>
                    <Camera size={15} color="#2b4594" />
                    <Text style={s.retakeBtnText}>Retake / Replace</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDeliveryImage(null)} style={s.removeBtn}>
                    <X size={15} color="#dc2626" />
                    <Text style={s.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={handleAddPhoto} style={s.photoPlaceholder}>
                <ImagePlus size={28} color="#94a3b8" />
                <Text style={s.photoPlaceholderText}>Tap to take or select a photo</Text>
                <Text style={s.photoPlaceholderSub}>Camera · Gallery</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Submit ── */}
          <TouchableOpacity onPress={save} style={s.button} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>Record delivery</Text>}
          </TouchableOpacity>

          {/* Bottom padding so the button is never hidden behind the keyboard */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#f9fafb' },
  header:             { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title:              { fontSize: 18, fontWeight: '700', color: '#111827' },
  form:               { padding: 20, paddingBottom: 40 },
  intro:              { fontSize: 14, color: '#6b7280', marginBottom: 22 },
  label:              { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 7 },
  labelOptional:      { fontSize: 12, fontWeight: '400', color: '#9ca3af' },
  input:              { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 13, fontSize: 15, marginBottom: 16 },
  readOnly:           { color: '#64748b', backgroundColor: '#f1f5f9' },
  description:        { minHeight: 90, textAlignVertical: 'top' },
  dateRow:            { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dateBtn:            { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 12 },
  dateBtnLabel:       { fontSize: 12, color: '#2b4594', fontWeight: '700', marginTop: 6, marginBottom: 4 },
  dateBtnValue:       { fontSize: 15, fontWeight: '700', color: '#111827' },
  // Photo
  photoSection:       { marginBottom: 20 },
  photoPlaceholder:   { borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 16, padding: 28, alignItems: 'center', backgroundColor: '#f8fafc', gap: 8 },
  photoPlaceholderText:{ fontSize: 14, fontWeight: '600', color: '#64748b', marginTop: 4 },
  photoPlaceholderSub:{ fontSize: 12, color: '#94a3b8' },
  photoPreview:       { width: '100%', height: 200, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f1f5f9' },
  photoActions:       { flexDirection: 'row', gap: 12, marginTop: 10 },
  retakeBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#2b4594', backgroundColor: '#eff6ff' },
  retakeBtnText:      { fontSize: 13, fontWeight: '600', color: '#2b4594' },
  removeBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  removeBtnText:      { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  button:             { backgroundColor: '#2b4594', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  buttonText:         { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default DeliveryFormScreen;
