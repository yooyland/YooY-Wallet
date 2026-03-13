import React from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';

export default function NotificationTab({ settings, onChange }: RoomSettingsModalProps) {
  const n = settings.notifications;
  return (
    <View>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <Text style={{ color:'#CFCFCF' }}>알림</Text>
        <Switch value={n.enabled} onValueChange={(v)=>onChange({ notifications:{...n, enabled:v} } as any)} />
      </View>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>알림 방식</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
        {(['sound','vibrate','mute'] as const).map(mode => (
          <TouchableOpacity key={mode} onPress={()=>onChange({ notifications:{...n, mode} } as any)}
            style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: n.mode===mode ? '#FFD700':'#333' }}>
            <Text style={{ color: n.mode===mode ? '#FFD700':'#CFCFCF' }}>{mode==='sound'?'소리':mode==='vibrate'?'진동':'무음'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>키워드 알림</Text>
      <TextInput value={(n.keywordAlerts||[]).join(', ')}
        onChangeText={(v)=>onChange({ notifications:{...n, keywordAlerts: v.split(',').map(x=>x.trim()).filter(Boolean)} } as any)}
        placeholder="예: 급, 중요" placeholderTextColor="#666"
        style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />

      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
        <Text style={{ color:'#CFCFCF' }}>멘션 알림</Text>
        <Switch value={n.mentionAlertEnabled} onValueChange={(v)=>onChange({ notifications:{...n, mentionAlertEnabled:v} } as any)} />
      </View>
    </View>
  );
}

