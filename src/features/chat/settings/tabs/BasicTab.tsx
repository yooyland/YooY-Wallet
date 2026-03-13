import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Switch } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';

export default function BasicTab({ settings, onChange, onSave, onLeave }: RoomSettingsModalProps) {
  const s = settings.basic;
  return (
    <View>
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>대표 이미지</Text>
      <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:6 }}>
        <View style={{ width:70, height:70, borderRadius:10, overflow:'hidden', borderWidth:1, borderColor:'#2A2A2A' }}>
          {!!s.imageUrl && <Image source={{ uri: s.imageUrl }} style={{ width:'100%', height:'100%' }} />}
        </View>
        <TouchableOpacity
          onPress={async()=>{ try {
            const IP = await import('expo-image-picker');
            const Picker: any = (IP as any).ImagePicker || IP;
            const res: any = await Picker.launchImageLibraryAsync?.({ mediaTypes: Picker.MediaTypeOptions.Images, allowsMultipleSelection:false, quality:0.9 });
            if (res && !res.canceled && res.assets?.[0]?.uri) {
              onChange({ basic:{ ...s, imageUrl: String(res.assets[0].uri) } } as any);
            }
          } catch {} }}
          style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}>
          <Text style={{ color:'#CFCFCF', fontWeight:'800' }}>변경</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>방 이름</Text>
      <TextInput value={s.title} onChangeText={(v)=>onChange({ basic:{...s, title:v} } as any)}
        placeholder="방 이름" placeholderTextColor="#666"
        style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>방 설명</Text>
      <TextInput value={s.description||''} onChangeText={(v)=>onChange({ basic:{...s, description:v} } as any)}
        placeholder="설명" placeholderTextColor="#666" multiline
        style={{ marginTop:6, minHeight:70, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>참가 인원수 제한</Text>
      <TextInput keyboardType="numeric"
        value={s.participantLimit==null? '' : String(s.participantLimit)}
        onChangeText={(v)=>onChange({ basic:{...s, participantLimit:(Number(v.replace(/[^0-9]/g,''))||0)||null} } as any)}
        placeholder="제한 없음 (0 또는 공란)" placeholderTextColor="#666"
        style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />

      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>태그 (쉼표로 구분)</Text>
      <TextInput value={(settings.basic.tags||[]).join(', ')}
        onChangeText={(v)=>onChange({ basic:{...s, tags: v.split(',').map(x=>x.trim()).filter(Boolean) } } as any)}
        placeholder="#travel, #food" placeholderTextColor="#666"
        style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />

      {/* 공개/비공개 + 비번 */}
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>공개 설정</Text>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <Text style={{ color:'#CFCFCF' }}>{s.isPublic ? '공개' : '비공개'}</Text>
        <Switch
          value={s.isPublic}
          onValueChange={(v)=> onChange({ basic:{...s, isPublic:v}, permissions:{ ...settings.permissions, lockEnabled: !v } } as any)}
        />
      </View>
      {!s.isPublic && (
        <TextInput
          value={settings.permissions.lockPassword||''}
          onChangeText={(v)=> onChange({ permissions:{ ...settings.permissions, lockPassword:v, lockEnabled:true } } as any)}
          placeholder="비밀번호"
          placeholderTextColor="#666"
          secureTextEntry
          style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
        />
      )}

      {/* 저장/나가기는 모달 하단 공통 버튼을 사용합니다. */}
    </View>
  );
}

