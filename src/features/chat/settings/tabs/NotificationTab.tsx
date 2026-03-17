import React, { useCallback } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';
import { playNotificationSound, getVolumeFromLevel } from '@/lib/notificationSound';
import type { NotificationSoundType } from '../types';

// 방별 알림 음량 (저장값: low | medium | high | max)
const VOLUME_OPTIONS: { value: 'low' | 'medium' | 'high' | 'max'; label: string }[] = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'max', label: '최대' },
];

const SOUND_OPTIONS: { value: NotificationSoundType; label: string }[] = [
  { value: 'gold', label: 'Gold (YooY 기본)' },
  { value: 'simple', label: 'Simple' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'dm_message', label: 'DM Message' },
  { value: 'coin_reward', label: 'Coin Reward' },
  { value: 'mention', label: 'Mention' },
  { value: 'system_notice', label: 'System Notice' },
  { value: 'warning', label: 'Warning' },
  { value: 'system_default', label: 'System Default' },
  { value: 'silent', label: 'Silent' },
];

export default function NotificationTab({ settings, onChange }: RoomSettingsModalProps) {
  const n = settings.notifications;
  const volumeLevel = (n?.notificationVolume || 'medium') as 'low' | 'medium' | 'high' | 'max';

  const soundType = (n?.notificationSound || 'gold') as NotificationSoundType;
  const handleTestSound = useCallback(async () => {
    const mode = (n?.mode || 'sound') as 'sound' | 'vibrate' | 'mute';
    if (mode === 'sound') {
      await playNotificationSound('sound', getVolumeFromLevel(volumeLevel), soundType, 'normal');
    } else {
      await playNotificationSound(mode);
    }
  }, [n?.mode, volumeLevel, soundType]);

  return (
    <View>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <Text style={{ color:'#CFCFCF' }}>알림</Text>
        <Switch value={n?.enabled !== false} onValueChange={(v)=>onChange({ notifications:{...n, enabled:v} } as any)} />
      </View>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>알림 방식</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
        {(['sound','vibrate','mute'] as const).map(mode => (
          <TouchableOpacity key={mode} onPress={()=>onChange({ notifications:{...n, mode} } as any)} hitSlop={{ top:12, bottom:12, left:12, right:12 }}
            style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: (n?.mode||'sound')===mode ? '#FFD700':'#333' }}>
            <Text style={{ color: (n?.mode||'sound')===mode ? '#FFD700':'#CFCFCF' }}>{mode==='sound'?'소리':mode==='vibrate'?'진동':'무음'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 알림 소리 선택 (소리 모드일 때만) */}
      {(n?.mode || 'sound') === 'sound' && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color:'#9BA1A6', fontSize:12 }}>알림 소리</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {SOUND_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => onChange({ notifications: { ...n, notificationSound: opt.value } } as any)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: soundType === opt.value ? '#FFD700' : '#333',
                  backgroundColor: soundType === opt.value ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                }}
              >
                <Text style={{ color: soundType === opt.value ? '#FFD700' : '#CFCFCF', fontSize: 12 }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color:'#9BA1A6', fontSize:12, marginTop: 12 }}>알림 음량</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {VOLUME_OPTIONS.map(level => (
              <TouchableOpacity
                key={level.value}
                onPress={()=>onChange({ notifications:{...n, notificationVolume: level.value} } as any)}
                hitSlop={{ top:12, bottom:12, left:12, right:12 }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: volumeLevel === level.value ? '#FFD700' : '#333',
                  backgroundColor: volumeLevel === level.value ? 'rgba(255, 215, 0, 0.1)' : 'transparent'
                }}
              >
                <Text style={{ color: volumeLevel === level.value ? '#FFD700' : '#CFCFCF', fontSize: 13 }}>
                  {level.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={handleTestSound}
            hitSlop={{ top:12, bottom:12, left:12, right:12 }}
            style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#1A1A1A', alignSelf: 'flex-start' }}
          >
            <Text style={{ color: '#CFCFCF', fontSize: 13 }}>🔔 테스트 재생</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>키워드 알림</Text>
      <Text style={{ color:'#7A7A7A', fontSize:11, marginTop:2 }}>저장한 키워드가 메시지에 포함되면 알림 OFF여도 알림됩니다.</Text>
      <TextInput value={(n?.keywordAlerts||[]).join(', ')}
        onChangeText={(v)=>onChange({ notifications:{...n, keywordAlerts: v.split(',').map(x=>x.trim()).filter(Boolean)} } as any)}
        placeholder="예: 급, 중요 (쉼표로 구분)" placeholderTextColor="#666"
        style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />

      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
        <Text style={{ color:'#CFCFCF' }}>멘션 알림</Text>
        <Switch value={n?.mentionAlertEnabled !== false} onValueChange={(v)=>onChange({ notifications:{...n, mentionAlertEnabled:v} } as any)} />
      </View>
    </View>
  );
}

