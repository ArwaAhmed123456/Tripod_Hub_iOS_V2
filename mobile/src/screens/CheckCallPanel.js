import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import api from '../services/api';

export default function CheckCallPanel({ siteId }) {
  const [shift, setShift] = useState(null);
  const [pending, setPending] = useState(null);
  const [interval, setIntervalValue] = useState('60');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { const { data } = await api.get('/check-calls/my'); setShift(data.shift); setPending(data.pending); } catch { /* unavailable offline */ }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const start = async (shiftType) => {
    try { const { data } = await api.post('/check-calls/shifts/start', { site_id: siteId, shift_type: shiftType, interval_minutes: Number(interval || 60) }); setShift(data.shift); }
    catch (e) { Alert.alert('Could not start shift', e.response?.data?.error || 'Please try again.'); }
  };
  const respond = async answer => {
    try { await api.post(`/check-calls/${pending._id}/respond`, { answer }); setPending(null); load(); }
    catch (e) { Alert.alert('Check call', e.response?.data?.error || 'This call could not be recorded.'); load(); }
  };
  const remaining = pending ? Math.max(0, Math.ceil((new Date(pending.expiresAt).getTime() - now) / 1000)) : 0;

  return <>
    <View style={s.card}>
      <Text style={s.title}>Check Call</Text>
      {shift ? <><Text style={s.active}>Shift active - {shift.shiftType}</Text><Text style={s.meta}>Calls every {shift.intervalMinutes} minutes. Each prompt stays open for 5 minutes.</Text></> : <>
        <Text style={s.meta}>Start your shift to enable automated check calls.</Text>
        <TextInput value={interval} onChangeText={setIntervalValue} keyboardType="number-pad" placeholder="Minutes" style={s.input} />
        <View style={s.row}><TouchableOpacity style={s.btn} onPress={() => start('Day')}><Text style={s.btnText}>Start Day</Text></TouchableOpacity><TouchableOpacity style={s.btn} onPress={() => start('Night')}><Text style={s.btnText}>Start Night</Text></TouchableOpacity></View>
      </>}
    </View>
    <Modal visible={Boolean(pending)} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.overlay}><View style={s.prompt}>
        <Text style={s.promptTitle}>Check call - are you okay?</Text>
        <Text style={s.promptSub}>This check call remains active until you respond. {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} remaining.</Text>
        <View style={s.row}><TouchableOpacity style={[s.answer, s.no]} onPress={() => respond('no')}><Text style={s.btnText}>No</Text></TouchableOpacity><TouchableOpacity style={[s.answer, s.yes]} onPress={() => respond('yes')}><Text style={s.btnText}>Yes</Text></TouchableOpacity></View>
      </View></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({ card:{marginHorizontal:16,marginBottom:12,padding:15,borderRadius:14,backgroundColor:'#eef2ff',borderWidth:1,borderColor:'#c7d2fe'},title:{fontWeight:'800',fontSize:16,color:'#1e326e'},active:{marginTop:4,fontWeight:'700',color:'#166534'},meta:{marginTop:4,fontSize:12,color:'#475569'},input:{marginTop:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#cbd5e1',borderRadius:8,padding:9},row:{flexDirection:'row',gap:10,marginTop:10},btn:{flex:1,backgroundColor:'#2b4594',padding:11,borderRadius:9,alignItems:'center'},btnText:{color:'#fff',fontWeight:'800'},overlay:{flex:1,backgroundColor:'rgba(15,23,42,.75)',justifyContent:'center',padding:22},prompt:{backgroundColor:'#fff',borderRadius:18,padding:22},promptTitle:{fontSize:21,fontWeight:'800',color:'#0f172a'},promptSub:{marginTop:10,color:'#475569',lineHeight:20},answer:{flex:1,padding:15,borderRadius:10,alignItems:'center'},yes:{backgroundColor:'#16a34a'},no:{backgroundColor:'#dc2626'} });
