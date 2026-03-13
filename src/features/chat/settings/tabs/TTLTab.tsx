import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';

export default function TTLTab({ settings, onChange }: RoomSettingsModalProps) {
  const ttl = settings.ttl;

  const extend = (ms: number) => {
    const now = Date.now();
    const current = ttl.expiresAtMs || now;
    const next = Math.min(current + ms, now + 90*24*60*60*1000); // 90일 제한
    onChange({ ttl: { ...ttl, expiresAtMs: next } } as any);
  };

  return (
    <View>
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>TTL 잔여 시간</Text>
      <Text style={{ color:'#CFCFCF', marginTop:6 }}>
        {ttl.expiresAtMs ? `만료 시각: ${new Date(ttl.expiresAtMs).toLocaleString()}` : '미설정'}
      </Text>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>TTL 만료 시 메시지 삭제</Text>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <Text style={{ color:'#CFCFCF' }}>ON/OFF</Text>
        <Switch value={ttl.messageDeleteOnExpiry} onValueChange={(v)=>onChange({ ttl:{ ...ttl, messageDeleteOnExpiry:v } } as any)} />
      </View>

      <View style={{ flexDirection:'row', gap:8, marginTop:12 }}>
        <TouchableOpacity onPress={()=>extend(24*60*60*1000)} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8 }}>
          <Text style={{ color:'#CFCFCF' }}>+24시간 연장</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={()=>extend(30*24*60*60*1000)} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8 }}>
          <Text style={{ color:'#CFCFCF' }}>+30일 연장</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

