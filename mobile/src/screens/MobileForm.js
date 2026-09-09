import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, User, Briefcase, Car, Calendar, ArrowLeft, CheckCircle, AlertCircle, Lock, LogOut, Camera, Trash2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';

const StyledView = View;
const StyledText = Text;
const StyledTextInput = TextInput;
const StyledTouchableOpacity = TouchableOpacity;
const StyledScrollView = ScrollView;

const MobileForm = ({ navigation }) => {
    const [project, setProject] = useState(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [image, setImage] = useState(null);

    // Time picker states
    const [showTimeInPicker, setShowTimeInPicker] = useState(false);
    const [showTimeOutPicker, setShowTimeOutPicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Permission state
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState(null);
    const [permissionRequestId, setPermissionRequestId] = useState(null);
    const [restrictedDate, setRestrictedDate] = useState('');
    const [checkInterval, setCheckInterval] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        trade: '',
        car_reg: '',
        user_type: 'Employee',
        employee_company_name: '',
        date: new Date().toISOString().split('T')[0],
        time_in: '',
        time_out: '',
        reason: ''
    });

    const format12h = (time24) => {
        if (!time24) return '--:--';
        const [h, m] = time24.split(':');
        let hours = parseInt(h);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}:${m} ${ampm}`;
    };

    useEffect(() => {
        loadProject();
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        setFormData(prev => ({
            ...prev,
            time_in: `${hours}:${minutes}`
        }));
    }, []);

    const loadProject = async () => {
        const p = await AsyncStorage.getItem('currentProject');
        if (!p) {
            navigation.navigate('Landing');
            return;
        }
        const parsed = JSON.parse(p);
        if (!parsed || !parsed.code) {
            await AsyncStorage.removeItem('currentProject');
            navigation.navigate('Landing');
            return;
        }
        setProject(parsed);
    };

    const takePhoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Camera access is required to take photos of number plates.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                aspect: [16, 9],
                quality: 0.7,
            });

            if (!result.canceled) {
                setImage(result.assets[0].uri);
            }
        } catch (err) {
            console.error('Camera Error:', err);
            Alert.alert('Error', 'Could not open camera.');
        }
    };

    const startPolling = (id) => {
        if (checkInterval) clearInterval(checkInterval);

        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/requests/${id}`);
                const status = res.data?.status;

                if (status === 'approved') {
                    clearInterval(interval);
                    setPermissionStatus('approved');
                    setShowPermissionModal(false);
                    Alert.alert("Success", "Permission granted! You can now submit data for this date.");
                } else if (status === 'rejected') {
                    clearInterval(interval);
                    setPermissionStatus('rejected');
                }
            } catch (error) {
                console.log("Polling error:", error);
            }
        }, 3000);
        setCheckInterval(interval);
    };

    const submitPermissionRequest = async () => {
        if (!project?.code || !formData.name || !restrictedDate) {
            Alert.alert("Missing Info", "Please ensure your name is entered before requesting permission.");
            return;
        }

        try {
            const res = await api.post('/requests', {
                project_code: project.code,
                user_name: formData.name,
                requested_date: restrictedDate,
                reason: formData.reason || 'Restricted date entry'
            });

            if (res.data.success) {
                setPermissionRequestId(res.data.id);
                setPermissionStatus('pending');
                startPolling(res.data.id);
            }
        } catch (error) {
            console.error("Permission Request Error:", error);
            Alert.alert("Error", "Failed to send permission request. Please try again.");
        }
    };

    useEffect(() => {
        return () => {
            if (checkInterval) clearInterval(checkInterval);
        };
    }, []);

    const validate = () => {
        const errors = {};
        if (!formData.name.trim()) errors.name = "Full Name is required";
        if (!formData.trade.trim()) errors.trade = "Company is required";
        if (!formData.car_reg.trim()) errors.car_reg = "Registration is required";
        if (!formData.date) errors.date = "Date is required";
        if (!formData.time_in) errors.time_in = "Time In is required";

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async () => {
        if (!project?.code) {
            Alert.alert('Error', 'Project data missing. Reloading...');
            loadProject();
            return;
        }

        if (!validate()) {
            setError('Please fill in all required fields correctly.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const data = new FormData();
            data.append('project_code', project.code);
            data.append('name', formData.name.trim());
            data.append('trade', formData.trade.trim());
            data.append('car_reg', formData.car_reg.trim());
            data.append('user_type', formData.user_type);
            if (formData.user_type === 'Employee' && formData.employee_company_name?.trim()) {
                data.append('employee_company_name', formData.employee_company_name.trim());
            }
            data.append('date', formData.date);
            data.append('time_in', formData.time_in);
            data.append('reason', formData.reason || '');

            if (image) {
                const filename = image.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image/jpeg`;
                data.append('image', { uri: image, name: filename, type });
            }

            const res = await api.post('/logs', data, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const today = new Date().toISOString().split('T')[0];
            const storageItems = [['lastCheckInDate', today]];

            if (res.data.id || res.data._id) {
                const logId = (res.data.id || res.data._id).toString();
                storageItems.push(['currentWorkerLogId', logId]);
                storageItems.push(['lastCheckInName', formData.name.trim()]);
                storageItems.push(['lastCheckInCar', formData.car_reg.trim()]);
            }

            await AsyncStorage.multiSet(storageItems);
            setSuccess(true);
        } catch (err) {
            console.error('[MobileForm] Submission Error:', err);
            const detail = err.response?.data?.error || err.message || 'Unknown network error';
            setError(`Submission Failed: ${detail}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSkipToList = () => {
        navigation.navigate('WorkerListScreen');
    };

    const isDateRestricted = (dateStr) => {
        const today = new Date().toISOString().split('T')[0];
        return dateStr !== today;
    };

    const handleDateChange = (event, selectedDate) => {
        setShowDatePicker(false);
        if (selectedDate) {
            const dateStr = selectedDate.toISOString().split('T')[0];
            setFormData({ ...formData, date: dateStr });

            if (isDateRestricted(dateStr)) {
                setRestrictedDate(dateStr);
                if (permissionStatus !== 'approved') {
                    setShowPermissionModal(true);
                }
            }
        }
    };

    const handleTimeInChange = (event, selectedTime) => {
        setShowTimeInPicker(false);
        if (selectedTime) {
            const hours = selectedTime.getHours().toString().padStart(2, '0');
            const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
            setFormData({ ...formData, time_in: `${hours}:${minutes}` });
        }
    };

    useEffect(() => {
        if (success) {
            navigation.replace('WorkerListScreen');
        }
    }, [success]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            <StyledView className="bg-white border-b border-gray-100 px-4 py-3 flex-row items-center justify-between shadow-sm">
                <StyledView className="flex-row items-center">
                    <StyledTouchableOpacity onPress={() => navigation.goBack()} className="p-2 mr-1">
                        <ArrowLeft size={20} color="#64748b" />
                    </StyledTouchableOpacity>
                    <StyledView>
                        <StyledText className="text-xs font-bold text-primary uppercase leading-none mb-1">{project?.code || '...'}</StyledText>
                        <StyledText className="text-lg font-bold text-slate-900 leading-none" numberOfLines={1}>{project?.name || 'Loading...'}</StyledText>
                    </StyledView>
                </StyledView>
                <StyledView className="flex-row items-center gap-2">
                    <StyledTouchableOpacity onPress={async () => {
                        try {
                            await AsyncStorage.removeItem('currentProject');
                            await AsyncStorage.removeItem('currentWorkerLogId');
                            await AsyncStorage.removeItem('lastCheckInName');
                            await AsyncStorage.removeItem('lastCheckInCar');
                            await AsyncStorage.removeItem('lastCheckInDate');
                            navigation.replace('Landing');
                        } catch (e) {
                            console.error(e);
                            navigation.replace('Landing');
                        }
                    }} className="p-2 bg-slate-100 rounded-full">
                        <LogOut size={20} color="#64748b" />
                    </StyledTouchableOpacity>
                    <Image
                        source={require('../../assets/Tipod_Final_Logo_high_pixel.png')}
                        style={{ width: 40, height: 40 }}
                        resizeMode="contain"
                    />
                </StyledView>
            </StyledView>

            <StyledScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
                {error && (
                    <StyledView className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r flex-row">
                        <AlertCircle size={20} color="#ef4444" />
                        <StyledView className="ml-3">
                            <StyledText className="font-bold text-sm text-red-700">Submission Error</StyledText>
                            <StyledText className="text-sm text-red-600">{error}</StyledText>
                        </StyledView>
                    </StyledView>
                )}

                <StyledView className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-6 font-Inter">
                    <StyledText className="text-xs font-bold text-slate-400 uppercase mb-4 font-Inter_Bold">Worker Details</StyledText>

                    <StyledView className="mb-4">
                        <StyledText className="text-sm font-medium text-slate-700 mb-1">Full Name *</StyledText>
                        <StyledView className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:border-primary">
                            <User size={18} color="#94a3b8" />
                            <StyledTextInput
                                className="flex-1 ml-3 text-slate-900 font-medium"
                                placeholder="Enter full name"
                                value={formData.name}
                                onChangeText={(text) => setFormData({ ...formData, name: text })}
                            />
                        </StyledView>
                        {fieldErrors.name && <StyledText className="text-red-500 text-[10px] mt-1 ml-1">{fieldErrors.name}</StyledText>}
                    </StyledView>

                    <StyledView className="mb-4">
                        <StyledText className="text-sm font-medium text-slate-700 mb-1">Company *</StyledText>
                        <StyledView className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:border-primary">
                            <Briefcase size={18} color="#94a3b8" />
                            <StyledTextInput
                                className="flex-1 ml-3 text-slate-900 font-medium"
                                placeholder="Enter company name"
                                value={formData.trade}
                                onChangeText={(text) => setFormData({ ...formData, trade: text })}
                            />
                        </StyledView>
                        {fieldErrors.trade && <StyledText className="text-red-500 text-[10px] mt-1 ml-1">{fieldErrors.trade}</StyledText>}
                    </StyledView>

                    <StyledView className="mb-4">
                        <StyledText className="text-sm font-medium text-slate-700 mb-2">Role *</StyledText>
                        <StyledView className="flex-row gap-2">
                            <StyledTouchableOpacity
                                onPress={() => setFormData({ ...formData, user_type: 'Employee' })}
                                className={`flex-1 py-3 rounded-2xl border-2 items-center justify-center transition-all ${formData.user_type === 'Employee' ? 'bg-primary/10 border-primary' : 'bg-slate-50 border-slate-200'}`}
                            >
                                <StyledText className={`font-bold ${formData.user_type === 'Employee' ? 'text-primary' : 'text-slate-400'}`}>Employee</StyledText>
                            </StyledTouchableOpacity>
                            <StyledTouchableOpacity
                                onPress={() => setFormData({ ...formData, user_type: 'Visitor', employee_company_name: '' })}
                                className={`flex-1 py-3 rounded-2xl border-2 items-center justify-center transition-all ${formData.user_type === 'Visitor' ? 'bg-primary/10 border-primary' : 'bg-slate-50 border-slate-200'}`}
                            >
                                <StyledText className={`font-bold ${formData.user_type === 'Visitor' ? 'text-primary' : 'text-slate-400'}`}>Visitor</StyledText>
                            </StyledTouchableOpacity>
                        </StyledView>
                    </StyledView>

                    {formData.user_type === 'Employee' && (
                        <StyledView className="mb-4">
                            <StyledText className="text-sm font-medium text-slate-700 mb-1">
                                Employee Company Name <StyledText className="text-slate-400 font-normal italic text-xs">(Optional)</StyledText>
                            </StyledText>
                            <StyledView className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:border-primary">
                                <Briefcase size={18} color="#94a3b8" />
                                <StyledTextInput
                                    className="flex-1 ml-3 text-slate-900 font-medium"
                                    placeholder="Enter employee company name"
                                    value={formData.employee_company_name || ''}
                                    onChangeText={(text) => setFormData({ ...formData, employee_company_name: text })}
                                />
                            </StyledView>
                        </StyledView>
                    )}

                    <StyledView>
                        <StyledText className="text-sm font-medium text-slate-700 mb-1">
                            Number Plate * <StyledText className="text-slate-400 font-normal italic text-xs">(Photo Optional)</StyledText>
                        </StyledText>
                        <StyledView className="flex-row gap-2">
                            <StyledView className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:border-primary">
                                <Car size={18} color="#94a3b8" />
                                <StyledTextInput
                                    className="flex-1 ml-3 text-slate-900 uppercase font-black tracking-widest"
                                    placeholder="REG-PLATE"
                                    value={formData.car_reg}
                                    onChangeText={(text) => setFormData({ ...formData, car_reg: text })}
                                />
                            </StyledView>
                            <StyledTouchableOpacity
                                onPress={takePhoto}
                                className={`p-4 rounded-2xl flex-row items-center border shadow-sm ${image ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}
                            >
                                <Camera size={20} color={image ? "#22c55e" : "#64748b"} />
                            </StyledTouchableOpacity>
                        </StyledView>

                        {image && (
                            <StyledView className="mt-3 relative shadow-md">
                                <Image source={{ uri: image }} style={{ width: '100%', height: 180, borderRadius: 20 }} resizeMode="cover" />
                                <StyledTouchableOpacity
                                    onPress={() => setImage(null)}
                                    className="absolute top-2 right-2 bg-red-500 p-2 rounded-full shadow-lg"
                                >
                                    <Trash2 size={16} color="white" />
                                </StyledTouchableOpacity>
                                <StyledView className="absolute bottom-2 left-2 bg-black/40 px-2 py-1 rounded-lg">
                                    <StyledText className="text-white text-[10px] font-bold">VEHICLE PHOTO ATTACHED</StyledText>
                                </StyledView>
                            </StyledView>
                        )}
                        {fieldErrors.car_reg && <StyledText className="text-red-500 text-[10px] mt-1 ml-1">{fieldErrors.car_reg}</StyledText>}
                    </StyledView>
                </StyledView>

                <StyledView className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 mb-10">
                    <StyledText className="text-xs font-bold text-slate-400 uppercase mb-4">Entry Log</StyledText>

                    <StyledView className="mb-4">
                        <StyledText className="text-sm font-medium text-slate-700 mb-1">Date (Locked)</StyledText>
                        <StyledView className="flex-row items-center bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3">
                            <Calendar size={18} color="#94a3b8" />
                            <StyledText className="flex-1 ml-3 text-slate-500 font-bold">{formData.date || 'Today'}</StyledText>
                            <Lock size={16} color="#94a3b8" />
                        </StyledView>
                    </StyledView>

                    <StyledView className="flex-row gap-4 mb-4">
                        <StyledView className="flex-1">
                            <StyledText className="text-sm font-medium text-slate-700 mb-1">Time In</StyledText>
                            <StyledTouchableOpacity
                                onPress={() => setShowTimeInPicker(true)}
                                className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3"
                            >
                                <Clock size={16} color="#94a3b8" />
                                <StyledText className="flex-1 ml-2 text-slate-900 font-bold">{format12h(formData.time_in)}</StyledText>
                            </StyledTouchableOpacity>
                        </StyledView>
                    </StyledView>

                    {showDatePicker && (
                        <DateTimePicker
                            value={formData.date ? new Date(formData.date) : new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleDateChange}
                        />
                    )}

                    {showTimeInPicker && (
                        <DateTimePicker
                            value={new Date()}
                            mode="time"
                            is24Hour={false}
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleTimeInChange}
                        />
                    )}

                    <StyledView>
                        <StyledText className="text-sm font-medium text-slate-700 mb-1">Reason / Notes</StyledText>
                        <StyledTextInput
                            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 h-24 text-top font-medium"
                            multiline
                            numberOfLines={4}
                            placeholder="Add optional notes here..."
                            value={formData.reason}
                            onChangeText={(text) => setFormData({ ...formData, reason: text })}
                            textAlignVertical="top"
                        />
                    </StyledView>
                </StyledView>

                <StyledTouchableOpacity
                    onPress={handleSubmit}
                    disabled={loading}
                    className={`bg-primary py-5 rounded-2xl shadow-xl flex-row justify-center items-center mb-10 border-b-4 border-secondary ${loading ? 'opacity-70' : ''}`}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <StyledText className="text-white font-black text-xl uppercase tracking-widest italic">Submit Digital Log</StyledText>
                    )}
                </StyledTouchableOpacity>

                <StyledTouchableOpacity
                    onPress={handleSkipToList}
                    className="py-3 mb-10"
                >
                    <StyledText className="text-slate-400 font-bold text-center">Already checked in? View Site List</StyledText>
                </StyledTouchableOpacity>
            </StyledScrollView>

            <Modal visible={showPermissionModal} transparent animationType="fade">
                <StyledView className="flex-1 bg-slate-900/80 justify-center p-6 backdrop-blur-sm">
                    <StyledView className="bg-white rounded-[40px] p-8 items-center shadow-2xl">
                        <StyledView className="bg-blue-100 p-6 rounded-full mb-4">
                            <Calendar size={48} color="#2b4594" />
                        </StyledView>
                        <StyledText className="text-2xl font-black text-slate-900">Approval Required</StyledText>
                        <StyledText className="text-slate-500 text-center mt-3 text-base leading-relaxed px-4">
                            Log for <StyledText className="font-bold text-slate-900">{restrictedDate}</StyledText> requires administrator approval.
                        </StyledText>

                        {!permissionStatus && (
                            <StyledView className="w-full mt-8">
                                <StyledTouchableOpacity
                                    onPress={submitPermissionRequest}
                                    className="bg-primary py-4 rounded-2xl shadow-lg shadow-blue-200 border-b-2 border-secondary"
                                >
                                    <StyledText className="text-white text-center font-bold text-lg">Send Request</StyledText>
                                </StyledTouchableOpacity>
                                <StyledTouchableOpacity
                                    onPress={() => {
                                        setShowPermissionModal(false);
                                        setFormData({ ...formData, date: new Date().toISOString().split('T')[0] });
                                    }}
                                    className="py-3 mt-2"
                                >
                                    <StyledText className="text-slate-400 text-center font-bold">Cancel</StyledText>
                                </StyledTouchableOpacity>
                            </StyledView>
                        )}

                        {permissionStatus === 'pending' && (
                            <StyledView className="mt-8 items-center">
                                <ActivityIndicator color="#2b4594" size="large" />
                                <StyledText className="font-bold text-slate-800 text-lg mt-4 text-center">Waiting for Site Manager...</StyledText>
                                <StyledText className="text-[12px] text-slate-400 mt-2 text-center">Auto-closing when approved.</StyledText>
                            </StyledView>
                        )}
                    </StyledView>
                </StyledView>
            </Modal>
        </SafeAreaView>
    );
};

export default MobileForm;
