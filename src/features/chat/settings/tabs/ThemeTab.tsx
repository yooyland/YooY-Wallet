import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';

export default function ThemeTab({ settings, onChange }: RoomSettingsModalProps) {
  const t = settings.theme;
  return (
    <View>
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>테마</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
        {(['default','dark','custom'] as const).map(kind => (
          <TouchableOpacity key={kind} onPress={()=>onChange({ theme:{...t, theme:kind} } as any)}
            style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: t.theme===kind ? '#FFD700':'#333' }}>
            <Text style={{ color: t.theme===kind ? '#FFD700':'#CFCFCF' }}>{kind==='default'?'기본':kind==='dark'?'다크':'커스텀'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {t.theme==='custom' && (
        <View style={{ marginTop:12 }}>
          <Text style={{ color:'#9BA1A6', fontSize:12 }}>채팅 배경색</Text>
          <TextInput value={t.backgroundColorHex||''} onChangeText={(v)=>onChange({ theme:{...t, backgroundColorHex:v} } as any)}
            placeholder="#0C0C0C" placeholderTextColor="#666"
            style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />
          <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>말풍선 색상</Text>
          <TextInput value={t.bubbleColorHex||''} onChangeText={(v)=>onChange({ theme:{...t, bubbleColorHex:v} } as any)}
            placeholder="#D4AF37" placeholderTextColor="#666"
            style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />
          <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>배경 이미지</Text>
          <View style={{ flexDirection:'row', gap:8, marginTop:6, alignItems:'center' }}>
            <TextInput
              value={t.backgroundImageUrl||''}
              onChangeText={(v)=>onChange({ theme:{...t, backgroundImageUrl:v||undefined} } as any)}
              placeholder="https://... 또는 기기에서 선택"
              placeholderTextColor="#666"
              style={{ flex:1, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
            />
            <TouchableOpacity
              onPress={async()=>{ try {
                const IP = await import('expo-image-picker');
                const Picker: any = (IP as any).ImagePicker || IP;
                const res: any = await Picker.launchImageLibraryAsync?.({ mediaTypes: Picker.MediaTypeOptions.Images, allowsMultipleSelection:false, quality:0.9 });
                if (res && !res.canceled && res.assets?.[0]?.uri) {
                  onChange({ theme:{ ...t, backgroundImageUrl: String(res.assets[0].uri) } } as any);
                }
              } catch {} }}
              style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8 }}
            >
              <Text style={{ color:'#CFCFCF' }}>선택</Text>
            </TouchableOpacity>
            {!!t.backgroundImageUrl && (
              <TouchableOpacity
                onPress={()=> onChange({ theme:{ ...t, backgroundImageUrl: undefined } } as any)}
                style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#7A1F1F', borderRadius:8 }}
              >
                <Text style={{ color:'#FF6B6B' }}>삭제</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>글자 크기 (1=작게, 5=크게)</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:6, alignItems:'center' }}>
        {[1,2,3,4,5].map(level => {
          const sizePx = [12,14,16,18,20][level - 1];
          const selected = (t.fontScaleLevel || 3) === level;
          return (
            <TouchableOpacity
              key={level}
              onPress={()=>onChange({ theme:{...t, fontScaleLevel: level as 1|2|3|4|5 } } as any)}
              hitSlop={{ top:12, bottom:12, left:12, right:12 }}
              style={{ paddingHorizontal:14, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor: selected ? '#FFD700' : '#333', backgroundColor: selected ? 'rgba(255,215,0,0.1)' : 'transparent' }}
            >
              <Text style={{ color: selected ? '#FFD700' : '#CFCFCF', fontSize: sizePx, fontWeight: '700' }}>{level}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

