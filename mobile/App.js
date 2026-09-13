import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ActivityIndicator, View, Platform, KeyboardAvoidingView } from 'react-native';
import api from './src/services/api';

import { CheckCircle, Calendar as CalendarIcon, ShieldCheck, AlertTriangle, User, Users, MessageCircle, Video } from 'lucide-react-native';

// Companion screens
import TodayScreen        from './src/screens/TodayScreen';
import CalendarScreen     from './src/screens/CalendarScreen';
import EvacuationScreen   from './src/screens/EvacuationScreen';
import ProfileScreen      from './src/screens/ProfileScreen';
import QRCodeScreen       from './src/screens/QRCodeScreen';
import OnboardingScreen   from './src/screens/OnboardingScreen';
import InviteCodeScreen   from './src/screens/InviteCodeScreen';
import SignInFlowScreen   from './src/screens/SignInFlowScreen';
import PreregisterScreen  from './src/screens/PreregisterScreen';
import MessagesScreen     from './src/screens/MessagesScreen';
import DeliveryFormScreen from './src/screens/DeliveryFormScreen';
import DeliveriesScreen   from './src/screens/DeliveriesScreen';

// Role-specific screens
import ManagerScreen       from './src/screens/ManagerScreen';
import SecurityGuardScreen from './src/screens/SecurityGuardScreen';
import GuardLogin          from './src/screens/GuardLogin';
import GuardSignup         from './src/screens/GuardSignup';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// Tab style uses insets so it never overlaps the phone's gesture bar
const useTabStyle = () => {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 8);
  return {
    headerShown: false,
    tabBarActiveTintColor: '#2b4594',
    tabBarInactiveTintColor: '#9ca3af',
    tabBarStyle: {
      borderTopWidth: 1.5,
      borderTopColor: '#cbd5e1', // Darker, clear separator line
      elevation: 0,
      shadowOpacity: 0,
      height: 62 + bottomPad,
      paddingBottom: bottomPad,
      paddingTop: 8,
      backgroundColor: '#ffffff',
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    tabBarShowLabel: true,
  };
};

// ── Standard employee tab navigator ─────────────────────────────────────────
const EmployeeTabs = () => {
  const tabStyle = useTabStyle();
  return (
    <Tab.Navigator screenOptions={tabStyle}>
      <Tab.Screen name="Today"        component={TodayScreen}      options={{ tabBarLabel: 'Today', tabBarIcon: ({ color }) => <CheckCircle    color={color} size={22} /> }} />
      <Tab.Screen name="Calendar"     component={CalendarScreen}   options={{ tabBarLabel: 'Calendar', tabBarIcon: ({ color }) => <CalendarIcon   color={color} size={22} /> }} />
      <Tab.Screen name="Messages"     component={MessagesScreen}   options={{ tabBarLabel: 'Messages', tabBarIcon: ({ color }) => <MessageCircle  color={color} size={22} /> }} />
      <Tab.Screen name="EvacuationTab"component={EvacuationScreen} options={{ tabBarLabel: 'Evacuation', tabBarIcon: ({ color }) => <ShieldCheck    color={color} size={22} /> }} />
      <Tab.Screen name="Profile"      component={ProfileScreen}    options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <User           color={color} size={22} /> }} />
    </Tab.Navigator>
  );
};

// ── Manager tab navigator ────────────────────────────────────────────────────
const ManagerTabs = () => {
  const tabStyle = useTabStyle();
  const [canViewCameras, setCanViewCameras] = React.useState(false);
  React.useEffect(() => {
    api.get('/cameras/access').then(res => setCanViewCameras(Boolean(res.data?.can_view_cameras))).catch(() => setCanViewCameras(false));
  }, []);
  return (
    <Tab.Navigator screenOptions={tabStyle}>
      <Tab.Screen name="ManagerHome"  component={ManagerScreen}    options={{ tabBarLabel: 'Portal', tabBarIcon: ({ color }) => <Users          color={color} size={22} /> }} />
      {canViewCameras && <Tab.Screen name="Cameras" component={ManagerScreen} initialParams={{ initialTab: 'Cameras' }} options={{ tabBarLabel: 'Cameras', tabBarIcon: ({ color }) => <Video color={color} size={22} /> }} />}
      <Tab.Screen name="Messages"     component={MessagesScreen}   options={{ tabBarLabel: 'Messages', tabBarIcon: ({ color }) => <MessageCircle  color={color} size={22} /> }} />
      <Tab.Screen name="EvacuationTab"component={EvacuationScreen} options={{ tabBarLabel: 'Evacuation', tabBarIcon: ({ color }) => <ShieldCheck    color={color} size={22} /> }} />
      <Tab.Screen name="Profile"      component={ProfileScreen}    options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <User           color={color} size={22} /> }} />
    </Tab.Navigator>
  );
};

// ── Security Guard tab navigator ─────────────────────────────────────────────
const GuardTabs = () => {
  const tabStyle = useTabStyle();
  return (
    <Tab.Navigator screenOptions={tabStyle}>
      <Tab.Screen name="GuardHome"    component={SecurityGuardScreen} options={{ tabBarLabel: 'Portal', tabBarIcon: ({ color }) => <ShieldCheck    color={color} size={22} /> }} />
      <Tab.Screen name="Messages"     component={MessagesScreen}      options={{ tabBarLabel: 'Messages', tabBarIcon: ({ color }) => <MessageCircle  color={color} size={22} /> }} />
      <Tab.Screen name="EvacuationTab"component={EvacuationScreen}    options={{ tabBarLabel: 'Evacuation', tabBarIcon: ({ color }) => <AlertTriangle  color={color} size={22} /> }} />
      <Tab.Screen name="Profile"      component={ProfileScreen}       options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <User           color={color} size={22} /> }} />
    </Tab.Navigator>
  );
};

// ── Role-based main tab selection ────────────────────────────────────────────
const getRoleNavigator = (role) => {
  const r = String(role || '').toLowerCase();
  if (r.includes('manager') || r.includes('supervisor')) return ManagerTabs;
  if (r.includes('guard') || r.includes('security')) return GuardTabs;
  if (r.includes('admin')) return ManagerTabs;
  return EmployeeTabs;
};

const Navigation = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2b4594" />
      </View>
    );
  }

  const MainTabs = user ? getRoleNavigator(user.mobileRole || user.role || user.group) : null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="MainTabs"    component={MainTabs} />
            <Stack.Screen name="QRCode"      component={QRCodeScreen}      options={{ presentation: 'modal' }} />
            <Stack.Screen name="SignInFlow"  component={SignInFlowScreen}  options={{ presentation: 'modal' }} />
            <Stack.Screen name="Preregister" component={PreregisterScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="DeliveryForm" component={DeliveryFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Deliveries" component={DeliveriesScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Messages"    component={MessagesScreen}    options={{ presentation: 'modal' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Onboarding"     component={OnboardingScreen} />
            <Stack.Screen name="InviteCode"     component={InviteCodeScreen} />
            <Stack.Screen name="GuardLogin"     component={GuardLogin} />
            <Stack.Screen name="GuardSignup"    component={GuardSignup} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
