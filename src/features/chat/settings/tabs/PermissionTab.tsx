import React from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity, Alert } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';

export default function PermissionTab({ settings, onChange, onResetForMe, onExportChat }: RoomSettingsModalProps) {
  const p = settings.permissions;
  const [pwd, setPwd] = React.useState(p.lockPassword||'');

  return (
    <View>
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>비밀번호 잠금</Text>
      <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:6 }}>
        <Switch value={p.lockEnabled} onValueChange={(v)=>onChange({ permissions:{...p, lockEnabled:v} } as any)} />
        <TextInput value={pwd} onChangeText={setPwd} placeholder="********" placeholderTextColor="#666" secureTextEntry
          style={{ flex:1, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />
        <TouchableOpacity onPress={()=>onChange({ permissions:{...p, lockPassword:pwd} } as any)}
          style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}>
          <Text style={{ color:'#FFD700', fontWeight:'800' }}>적용</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
        <Text style={{ color:'#CFCFCF' }}>2단계 인증 사용</Text>
        <Switch value={p.twoFactorEnabled} onValueChange={(v)=>onChange({ permissions:{...p, twoFactorEnabled:v} } as any)} />
      </View>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>이 방에서 해시 표시</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
        {(['DEFAULT','HASH','NICKNAME'] as const).map(mode => (
          <TouchableOpacity key={mode} onPress={()=>onChange({ permissions:{...p, displayNameMode:mode} } as any)}
            style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: p.displayNameMode===mode ? '#FFD700':'#333' }}>
            <Text style={{ color: p.displayNameMode===mode ? '#FFD700':'#CFCFCF' }}>
              {mode==='DEFAULT'?'기본':mode==='HASH'?'해시':'닉네임'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>블랙리스트</Text>
      <TextInput placeholder="차단할 사용자 UID" placeholderTextColor="#666"
        onSubmitEditing={(e)=>{ const uid = String(e.nativeEvent.text||'').trim(); if (uid) onChange({ permissions:{...p, blacklistUserIds: [...(p.blacklistUserIds||[]), uid] } } as any); }}
        style={{ borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414', marginTop:6 }} />

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:16 }}>데이터</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
        <TouchableOpacity
          onPress={() => {
            try {
              Alert.alert('채팅방 초기화', '이 방을 나만 초기화할까요?\n(다른 참가자에게는 영향이 없습니다)', [
                { text: '취소', style: 'cancel' },
                { text: '초기화', style: 'destructive', onPress: () => { try { onResetForMe?.(); } catch {} } },
              ]);
            } catch { try { onResetForMe?.(); } catch {} }
          }}
          style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}
        >
          <Text style={{ color:'#CFCFCF' }}>채팅방 초기화</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { try { onExportChat?.(); } catch {} }}
          style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}
        >
          <Text style={{ color:'#CFCFCF' }}>대화 내보내기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

