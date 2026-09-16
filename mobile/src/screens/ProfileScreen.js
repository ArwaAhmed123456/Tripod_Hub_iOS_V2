import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, User, ChevronDown, Trash2 } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

const ProfileScreen = ({ navigation }) => {
  const { user, logout, deleteAccount } = useAuth();

  // Settings state
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [autoSignIn, setAutoSignIn]     = useState(false);
  const [autoReminder, setAutoReminder] = useState(false);
  const [hostNotifs, setHostNotifs]     = useState(true);
  const [language, setLanguage]         = useState('English (UK)');
  const [reminders, setReminders]       = useState([]);
  const [deleting, setDeleting]         = useState(false);

  const memberName = user?.name || (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null) || user?.email?.split('@')[0] || 'Member';
  const rawGroup   = user?.group || user?.role || 'Employee';
  // Title-case each word so "guard" → "Guard", "security guard" → "Security Guard"
  const group      = rawGroup.replace(/\b\w/g, c => c.toUpperCase());
  const org        = user?.organization || 'Observant Security Services';

  const handleDisconnect = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone and will remove all your personal data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              Alert.alert('Account Deleted', 'Your account and personal data have been permanently deleted.');
            } catch (err) {
              const msg = err.response?.data?.error || 'Failed to delete account. Please try again or contact support.';
              Alert.alert('Error', msg);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const BG  = '#f3f4f6';
  const BG2 = '#ffffff';
  const T1  = '#111827';
  const T2  = '#6b7280';
  const BD  = '#e5e7eb';

  const Card = ({ children, style }) => (
    <View style={[{ backgroundColor: BG2, borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: BD }, style]}>
      {children}
    </View>
  );

  const Row = ({ label, value, onPress, right }) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BD }}>
      <Text style={{ fontSize: 15, color: T1 }}>{label}</Text>
      {right || (value ? <Text style={{ fontSize: 15, color: T2 }}>{value}</Text> : null)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[{ flex: 1 }, { backgroundColor: BG }]} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: T1 }}>{org}</Text>
        <TouchableOpacity
          onPress={handleDisconnect}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#ff3b30', borderRadius: 20 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Extra bottom padding so content (e.g., Log Out) is not hidden behind the bottom tab bar */}
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, paddingHorizontal: 12 }} contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}>

        {/* Profile card */}
        <Card>
          <TouchableOpacity onPress={() => setProfileExpanded(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: profileExpanded ? 1 : 0, borderBottomColor: BD }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <User size={26} color="#9ca3af" />
              </View>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: T1 }}>{memberName}</Text>
                <Text style={{ fontSize: 14, color: T2, marginTop: 2 }}>{group}</Text>
              </View>
            </View>
            <View style={{ transform: [{ rotate: profileExpanded ? '180deg' : '0deg' }] }}>
              <ChevronDown size={20} color={T2} />
            </View>
          </TouchableOpacity>
          {profileExpanded && (
            <View style={{ padding: 16 }}>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: T2, fontWeight: '600', marginBottom: 4 }}>EMAIL</Text>
                <Text style={{ fontSize: 15, color: T1 }}>{user?.email || 'Not provided'}</Text>
              </View>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: T2, fontWeight: '600', marginBottom: 4 }}>PHONE</Text>
                <Text style={{ fontSize: 15, color: T1 }}>{user?.phone || 'Not provided'}</Text>
              </View>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: T2, fontWeight: '600', marginBottom: 4 }}>SITE</Text>
                <Text style={{ fontSize: 15, color: T1 }}>{user?.siteName || user?.organization || 'No site assigned'}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('QRCode')} style={{ backgroundColor: '#2b4594', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>View My QR Code</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Permissions */}
        <Card>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: T1 }}>Permissions</Text>
              <Text style={{ fontSize: 13, color: T2, marginTop: 2 }}>Your Companion permissions</Text>
            </View>
            <ChevronDown size={20} color={T2} />
          </TouchableOpacity>
        </Card>

        {/* Auto sign in/out */}
        <Card>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: BD }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T1 }}>Automatically sign in/out</Text>
            <Text style={{ fontSize: 13, color: T2, marginTop: 2 }}>Automatically sign in and out as you arrive and leave.</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 15, color: T1 }}>Enable auto sign in/out</Text>
            <Switch value={autoSignIn} onValueChange={setAutoSignIn} trackColor={{ true: '#2b4594', false: '#cbd5e1' }} thumbColor="#fff" />
          </View>
        </Card>

        {/* Auto reminder */}
        <Card>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: BD }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T1 }}>Auto reminder</Text>
            <Text style={{ fontSize: 13, color: T2, marginTop: 2 }}>Get a reminder automatically as you arrive or leave</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 15, color: T1 }}>Enable auto reminder</Text>
            <Switch value={autoReminder} onValueChange={setAutoReminder} trackColor={{ true: '#2b4594', false: '#cbd5e1' }} thumbColor="#fff" />
          </View>
        </Card>

        {/* Scheduled Reminders */}
        <Card>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: BD }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T1 }}>Scheduled Reminders</Text>
            <Text style={{ fontSize: 13, color: T2, marginTop: 2 }}>Set reminders to sign in or sign out</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              const now = new Date();
              now.setMinutes(0, 0, 0);
              Alert.alert(
                'Add Reminder',
                'Choose a reminder time:',
                [
                  ...['07:00','08:00','08:30','09:00','17:00','17:30','18:00'].map(t => ({
                    text: t,
                    onPress: () => setReminders(r => [...r, t]),
                  })),
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ fontSize: 22, color: T2 }}>⊕</Text>
            <Text style={{ fontSize: 15, color: T1 }}>Add Reminder</Text>
          </TouchableOpacity>
          {reminders.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: BD }}>
              <Text style={{ fontSize: 15, color: T1 }}>{r}</Text>
              <TouchableOpacity onPress={() => setReminders(prev => prev.filter((_, idx) => idx !== i))}>
                <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Card>

        {/* Notifications */}
        <Card>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: BD }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T1 }}>Notifications</Text>
            <Text style={{ fontSize: 13, color: T2, marginTop: 2 }}>Stay up to date</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BD }}>
            <Text style={{ fontSize: 15, color: T1 }}>Host notifications</Text>
            <Switch value={hostNotifs} onValueChange={setHostNotifs} trackColor={{ true: '#2b4594', false: '#cbd5e1' }} thumbColor="#fff" />
          </View>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T1, marginBottom: 4 }}>Notification Type</Text>
            <Text style={{ fontSize: 13, color: T2, marginBottom: 10 }}>Select how you would like to be notified</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, color: T1 }}>Push</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: T1 }}>Manage</Text>
            </View>
          </View>
        </Card>

        {/* Language */}
        <Card style={{ padding: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T1, marginBottom: 4 }}>Language</Text>
          <Text style={{ fontSize: 13, color: T2, marginBottom: 12 }}>Set your default language</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Language', 'Choose your language', [
              { text: 'English (UK)', onPress: () => setLanguage('English (UK)') },
              { text: 'English (US)', onPress: () => setLanguage('English (US)') },
              { text: 'Cancel', style: 'cancel' },
            ])}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: BD, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: BG }}
          >
            <Text style={{ fontSize: 15, color: T1 }}>{language}</Text>
            <ChevronDown size={16} color={T2} />
          </TouchableOpacity>
        </Card>

        {/* Delete Account */}
        <Card style={{ borderColor: '#fecaca', backgroundColor: '#fff5f5' }}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Trash2 size={20} color="#dc2626" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#991b1b' }}>Delete Account</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 14, lineHeight: 18 }}>
              Permanently delete your account and remove all personal data. This action cannot be undone.
            </Text>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={deleting}
              style={{
                backgroundColor: '#dc2626',
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                opacity: deleting ? 0.7 : 1,
              }}
            >
              {deleting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Trash2 size={16} color="#ffffff" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#ffffff' }}>Delete My Account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Log Out */}
        <TouchableOpacity onPress={handleDisconnect}
          style={{ backgroundColor: '#ff3b30', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#ffffff' }}>Log Out</Text>
        </TouchableOpacity>

        <Text style={{ textAlign: 'center', color: T2, fontSize: 13, marginBottom: 8 }}>Version 1.1.0 (10001)</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileScreen;
