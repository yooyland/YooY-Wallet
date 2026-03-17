import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import type { RoomSettings, RoomType } from '../types';
import BasicTab from '../tabs/BasicTab';
import MembersTab from '../tabs/MembersTab';
import NotificationTab from '../tabs/NotificationTab';
import ChatTab from '../tabs/ChatTab';
import ManagementTab from '../tabs/ManagementTab';
import TTLTab from '../tabs/TTLTab';

type TabKey = 'basic' | 'members' | 'notification' | 'chat' | 'manage' | 'ttl';

export interface RoomSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  roomType: RoomType;
  settings: RoomSettings;
  onChange: (partial: Partial<RoomSettings>) => void;
  onSave: () => Promise<void>;
  onLeave: () => Promise<void>;
  onInvite: () => Promise<void>;
  onResetForMe?: () => Promise<void> | void;
  onExportChat?: () => Promise<void> | void;
  initialTab?: 'basic' | 'members' | 'permission' | 'notification' | 'theme' | 'ttl';
}

export default function RoomSettingsModal(props: RoomSettingsModalProps) {
  const { visible, onClose, roomType, initialTab } = props;
  const [tab, setTab] = React.useState<TabKey>((initialTab || 'basic') as TabKey);
  React.useEffect(() => {
    if (visible && initialTab) setTab(initialTab as TabKey);
  }, [visible, initialTab]);
  // 키보드 높이 추적: 입력칸/하단 버튼 가림 방지
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  React.useEffect(() => {
    const sh = Keyboard.addListener('keyboardDidShow', (e:any) => { try { setKeyboardHeight(Number(e?.endCoordinates?.height||0)); } catch { setKeyboardHeight(0); } });
    const hd = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { try { sh.remove(); hd.remove(); } catch {} };
  }, []);

  // 순서: 기본, 멤버, 알림, 채팅, 관리 (TTL은 별도 모달)
  const pills: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'basic', label: '기본', show: true },
    { key: 'members', label: '멤버', show: true },
    { key: 'notification', label: '알림', show: true },
    { key: 'chat', label: '채팅', show: true },
    { key: 'manage', label: '관리', show: true },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center' }}>
        <View style={{ marginTop:60, width:320, maxWidth:'94%', backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:12, overflow:'hidden' }}>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1E1E1E' }}>
            <Text style={{ color:'#F6F6F6', fontWeight:'800' }}>방 설정</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top:12, bottom:12, left:12, right:12 }}><Text style={{ color:'#CFCFCF' }}>닫기</Text></TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:10, paddingVertical:8 }}>
            {pills.filter(p => p.show).map(p => (
              <TouchableOpacity key={p.key} onPress={()=>setTab(p.key)} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor: tab===p.key ? '#FFD700':'#333', marginRight:6 }}>
                <Text style={{ color: tab===p.key ? '#FFD700':'#CFCFCF', fontWeight:'700', fontSize:12 }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={{ maxHeight:420 }}
              contentContainerStyle={{ paddingHorizontal:12, paddingBottom: 12 + Math.max(0, keyboardHeight) }}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
            >
              {tab==='basic' && (<BasicTab {...props} />)}
              {tab==='members' && (<MembersTab {...props} />)}
              {tab==='notification' && (<NotificationTab {...props} />)}
              {tab==='chat' && (<ChatTab {...props} />)}
              {tab==='manage' && (<ManagementTab {...props} />)}
            </ScrollView>
          </KeyboardAvoidingView>
          {/* 하단 고정: 저장 / 나가기 버튼 (모든 탭 공통, 같은 줄) */}
          <View
            style={{
              flexDirection:'row',
              alignItems:'center',
              justifyContent:'space-between',
              gap:10,
              paddingHorizontal:12,
              paddingVertical:10,
              borderTopWidth:1,
              borderTopColor:'#1E1E1E',
              backgroundColor:'#0F0F0F',
            }}
          >
            <TouchableOpacity
              onPress={props.onSave}
              hitSlop={{ top:12, bottom:12, left:12, right:12 }}
              style={{
                flex:1,
                paddingHorizontal:16,
                paddingVertical:10,
                borderWidth:1,
                borderColor:'#FFD700',
                borderRadius:10,
                alignItems:'center',
                justifyContent:'center',
              }}
            >
              <Text style={{ color:'#FFD700', fontWeight:'800' }}>저장</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={props.onLeave}
              hitSlop={{ top:12, bottom:12, left:12, right:12 }}
              style={{
                flex:1,
                paddingHorizontal:16,
                paddingVertical:10,
                borderWidth:1,
                borderColor:'#7A1F1F',
                borderRadius:10,
                alignItems:'center',
                justifyContent:'center',
                backgroundColor:'rgba(122,31,31,0.12)',
              }}
            >
              <Text style={{ color:'#FF6B6B', fontWeight:'800' }}>나가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

