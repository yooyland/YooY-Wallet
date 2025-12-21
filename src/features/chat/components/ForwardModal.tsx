// @ts-nocheck
/* eslint-disable */
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useForwardModalStore } from '@/src/features/chat/store/forward-modal.store';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { firebaseAuth } from '@/lib/firebase';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';

export default function ForwardModal() {
  const visible = useForwardModalStore((s) => s.visible);
  const payload = useForwardModalStore((s) => s.payload);
  const close = useForwardModalStore((s) => s.close);
  const roomsAll = useKakaoRoomsStore((s) => s.rooms);
  const profilesMap = useChatProfileStore((s) => s.profiles || {});
  const me = firebaseAuth.currentUser?.uid || 'me';
  const friends = useMemo(() => {
    try {
      const arr = Object.entries(profilesMap).map(([id, p]: any) => ({ id, name: p?.displayName || id })).filter((x) => x.id && x.id !== me);
      return arr.slice(0, 300);
    } catch { return []; }
  }, [profilesMap, me]);

  const [tab, setTab] = useState<'rooms'|'friends'>('rooms');
  const [q, setQ] = useState('');

  const selectableRooms = useMemo(() => {
    return (roomsAll || []).slice(0, 200);
  }, [roomsAll]);

  const handleForwardToRoom = (roomId: string) => {
    try {
      const myUid = firebaseAuth.currentUser?.uid || 'me';
      if (payload?.kind === 'invite' && payload?.imageUrl) {
        const content = `${payload.roomTitle || '초대장'}\n${payload.webUrl || payload.deepLink || ''}`.trim();
        useKakaoRoomsStore.getState().sendMessage(roomId, myUid, content, 'image', payload.imageUrl);
      } else if (payload?.imageUrl) {
        useKakaoRoomsStore.getState().sendMessage(roomId, myUid, payload?.display || '', 'image', payload.imageUrl);
      } else {
        const content = payload?.display || (payload?.fileUrl ? `📎 ${payload?.name||'file'}: ${payload?.fileUrl}` : '');
        if (content) useKakaoRoomsStore.getState().sendMessage(roomId, myUid, content, payload?.fileUrl ? 'file' : 'text');
      }
    } catch {}
    close();
  };

  const handleForwardToFriend = (friendId: string) => {
    try {
      const myUid = firebaseAuth.currentUser?.uid || 'me';
      // DM 방이 없으면 생성
      let dm = (useKakaoRoomsStore.getState().rooms || []).find((r) => (r.type === 'dm') && Array.isArray(r.members) && r.members.includes(friendId) && r.members.includes(myUid));
      if (!dm) {
        dm = useKakaoRoomsStore.getState().createRoom('DM', [myUid, friendId], 'dm');
      }
      if (!dm) return;
      handleForwardToRoom(dm.id);
    } catch {}
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.5)', zIndex: 2147483647, elevation: 99999 }}>
        <TouchableOpacity style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }} onPress={close} />
        <View style={{ backgroundColor:'#FFFFFF', borderColor:'#E5E5E5', borderWidth:1, width: 320, borderRadius: 12, overflow:'hidden' }}>
          <Text style={{ paddingHorizontal:14, paddingVertical:10, fontWeight:'700', color:'#222' }}>전달 대상 선택</Text>
          <View style={{ flexDirection:'row', gap:8, paddingHorizontal:12, paddingBottom:8 }}>
            <TouchableOpacity onPress={()=>setTab('rooms')} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: tab==='rooms'?'#111':'#DDD', backgroundColor: tab==='rooms'?'#111':'#FFF' }}>
              <Text style={{ color: tab==='rooms'?'#FFF':'#111', fontSize:12 }}>채팅방</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setTab('friends')} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: tab==='friends'?'#111':'#DDD', backgroundColor: tab==='friends'?'#111':'#FFF' }}>
              <Text style={{ color: tab==='friends'?'#FFF':'#111', fontSize:12 }}>친구</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal:12, paddingBottom:8 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={tab==='rooms' ? '방 이름 검색' : '친구 검색'}
              placeholderTextColor="#999"
              style={{ borderWidth:1, borderColor:'#EEE', borderRadius:8, paddingHorizontal:10, paddingVertical:6, color:'#111' }}
            />
          </View>
          <View style={{ maxHeight: 240 }}>
            <ScrollView>
              {tab==='rooms' ? (
                selectableRooms.filter((r)=>{ const t=(r.title||r.id||'').toLowerCase(); return !q || t.includes(q.toLowerCase()); }).map((r) => (
                  <TouchableOpacity key={r.id} style={{ paddingHorizontal:14, paddingVertical:10, borderTopWidth:1, borderTopColor:'#F2F2F2' }} onPress={() => handleForwardToRoom(r.id)}>
                    <Text style={{ color:'#111' }} numberOfLines={1}>{r.title || r.id}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                friends.filter((f)=>{ const n=(f.name||'').toLowerCase(); const i=(f.id||'').toLowerCase(); const qq=q.toLowerCase(); return !q || n.includes(qq) || i.includes(qq); }).map((f) => (
                  <TouchableOpacity key={f.id} style={{ paddingHorizontal:14, paddingVertical:10, borderTopWidth:1, borderTopColor:'#F2F2F2' }} onPress={() => handleForwardToFriend(f.id)}>
                    <Text style={{ color:'#111' }} numberOfLines={1}>{f.name} ({f.id})</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
          <TouchableOpacity style={{ paddingHorizontal:14, paddingVertical:12, borderTopWidth:1, borderTopColor:'#EEE' }} onPress={close}>
            <Text style={{ color:'#777', textAlign:'center' }}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}


