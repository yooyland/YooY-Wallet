import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';
import { setNotificationVolume, loadNotificationVolume, playNotificationSound } from '@/lib/notificationSound';

// 볼륨 레벨 옵션
const VOLUME_LEVELS = [
  { value: 0.3, label: '낮음' },
  { value: 0.5, label: '보통' },
  { value: 0.7, label: '높음' },
  { value: 1.0, label: '최대' },
];

export default function NotificationTab({ settings, onChange }: RoomSettingsModalProps) {
  const n = settings.notifications;
  const [volume, setVolume] = useState(0.7);
  
  // 볼륨 로드
  useEffect(() => {
    loadNotificationVolume().then(v => setVolume(v));
  }, []);
  
  // 볼륨 변경 핸들러
  const handleVolumeChange = useCallback(async (value: number) => {
    setVolume(value);
    await setNotificationVolume(value);
  }, []);
  
  // 테스트 버튼
  const handleTestSound = useCallback(async () => {
    await playNotificationSound('sound');
  }, []);

  // 가장 가까운 볼륨 레벨 찾기
  const currentLevel = VOLUME_LEVELS.reduce((prev, curr) => 
    Math.abs(curr.value - volume) < Math.abs(prev.value - volume) ? curr : prev
  );

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

      {/* 알림 음량 조절 (소리 모드일 때만 표시) */}
      {n.mode === 'sound' && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color:'#9BA1A6', fontSize:12 }}>알림 음량</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {VOLUME_LEVELS.map(level => (
              <TouchableOpacity 
                key={level.value}
                onPress={() => handleVolumeChange(level.value)}
                style={{ 
                  paddingHorizontal: 14, 
                  paddingVertical: 8, 
                  borderRadius: 8, 
                  borderWidth: 1, 
                  borderColor: currentLevel.value === level.value ? '#FFD700' : '#333',
                  backgroundColor: currentLevel.value === level.value ? 'rgba(255, 215, 0, 0.1)' : 'transparent'
                }}
              >
                <Text style={{ color: currentLevel.value === level.value ? '#FFD700' : '#CFCFCF', fontSize: 13 }}>
                  {level.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity 
            onPress={handleTestSound}
            style={{ 
              marginTop: 10, 
              paddingHorizontal: 14, 
              paddingVertical: 8, 
              borderRadius: 8, 
              borderWidth: 1, 
              borderColor: '#2A2A2A',
              backgroundColor: '#1A1A1A',
              alignSelf: 'flex-start'
            }}
          >
            <Text style={{ color: '#CFCFCF', fontSize: 13 }}>🔔 테스트 재생</Text>
          </TouchableOpacity>
        </View>
      )}

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

