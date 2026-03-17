import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';

export default function MembersTab({ settings, onInvite, roomId }: RoomSettingsModalProps) {
  const { ownerUserId, userIdToRole, participantUserIds } = settings.members;
  const room = useKakaoRoomsStore((s)=> (s.rooms||[]).find(r=> r.id === roomId));
  // createdBy(서버) 우선, 없으면 설정값 폴백
  const ownerId = React.useMemo(() => String(((room as any)?.createdBy || ownerUserId || '')), [room, ownerUserId]);
  const roomMemberIds: string[] = Array.isArray((room as any)?.members) ? ((room as any).members as string[]) : [];
  // 서버 멤버 컬렉션 보정(스토어에 비어있을 때) + 실시간 동기화
  const [remoteMemberIds, setRemoteMemberIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      try {
        if (!roomId) return;
        const { firestore } = require('@/lib/firebase');
        const { collection, onSnapshot } = require('firebase/firestore');
        unsub = onSnapshot(collection(firestore, 'rooms', roomId, 'members'), (snap: any) => {
          try {
            const ids: string[] = [];
            snap.forEach((d: any) => { try { if (d?.id) ids.push(String(d.id)); } catch {} });
            setRemoteMemberIds(ids);
          } catch {}
        }, () => {});
      } catch {}
    })();
    return () => { try { unsub && unsub(); } catch {} };
  }, [roomId]);
  // 프로필/대화명 조회 (로컬 스토어 브리지)
  const getProfile = (uid: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const store = require('@/src/features/chat/store/chat-profile.store');
      const profile = store.useChatProfileStore.getState().getProfile(uid);
      return profile || null;
    } catch { return null; }
  };
  // 미존재 프로필은 Firestore에서 즉시 로드하여 스토어에 채운다 (owner + participants + room.members + remote members)
  React.useEffect(() => {
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const store = require('@/src/features/chat/store/chat-profile.store');
        const uidList: string[] = Array.from(new Set([
          ownerId,
          ...(participantUserIds||[]),
          ...(roomMemberIds||[]),
          ...(remoteMemberIds||[]),
        ].filter(Boolean).map(String)));
        const missing = uidList.filter((u) => !getProfile(u));
        if (missing.length === 0) return;
        const { firestore } = require('@/lib/firebase');
        const { doc, getDoc } = require('firebase/firestore');
        for (const uid of missing) {
          try {
            const snap = await getDoc(doc(firestore, 'users', uid));
            const data: any = snap.exists() ? (snap.data() as any) : {};
            const displayName: string =
              data?.chatName || data?.displayName || data?.username || data?.name || uid;
            let avatar: string | undefined =
              data?.avatarUrl || data?.photoURL || data?.avatar || undefined;
            const now = Date.now();
            const chatProfile = {
              id: `chat_profile_${uid}`,
              userId: uid,
              displayName,
              chatName: displayName,
              useHashInChat: false,
              avatar,
              status: 'online',
              createdAt: now,
              lastActive: now,
            };
            // 프로필 맵에 병합
            store.useChatProfileStore.setState((s: any) => ({
              profiles: { ...(s?.profiles || {}), [uid]: { ...(s?.profiles?.[uid]||{}), ...chatProfile } },
            }));
            // avatar가 http가 아닐 경우(Storage 경로) 다운로드 URL로 치환
            try {
              if (avatar && !/^https?:\/\//i.test(String(avatar))) {
                const { ref: storageRef, getDownloadURL } = require('firebase/storage');
                const { firebaseStorage } = require('@/lib/firebase');
                const r = storageRef(firebaseStorage, String(avatar));
                const url = await getDownloadURL(r);
                store.useChatProfileStore.setState((s:any)=>({ profiles: { ...(s?.profiles||{}), [uid]: { ...(s?.profiles?.[uid]||{}), avatar: url } } }));
              }
            } catch {}
          } catch {}
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, JSON.stringify(participantUserIds||[]), JSON.stringify(roomMemberIds||[]), JSON.stringify(remoteMemberIds||[])]);
  // 참가자 목록 계산: 방장 + 설정 참가자 + 방 객체 멤버 + 원격 members 컬렉션 → 중복 제거
  // 정렬: 방장(유일 admin) 먼저, 그 다음 일반 멤버
  const allIds: string[] = React.useMemo(() => {
    const set = new Set<string>([
      ...((participantUserIds||[]) as string[]),
      ...((roomMemberIds||[]) as string[]),
      ...((remoteMemberIds||[]) as string[]),
    ].filter(Boolean).map(String));
    if (ownerId) set.add(String(ownerId));
    const ids = Array.from(set);
    // 정렬: owner 먼저, 그 다음 나머지
    ids.sort((a, b) => {
      const aIsOwner = a === ownerId;
      const bIsOwner = b === ownerId;
      if (aIsOwner && !bIsOwner) return -1;
      if (!aIsOwner && bIsOwner) return 1;
      return 0;
    });
    return ids;
  }, [ownerId, userIdToRole, JSON.stringify(participantUserIds||[]), JSON.stringify(roomMemberIds||[]), JSON.stringify(remoteMemberIds||[])]);
  return (
    <View>
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>운영자</Text>
      <View style={{ marginTop:6 }}>
        {(() => {
          const p = getProfile(ownerId);
          return (
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <View style={{ width:28, height:28, borderRadius:14, overflow:'hidden', backgroundColor:'#333' }}>
                {!!p?.avatar && <Image source={{ uri: p.avatar }} style={{ width:'100%', height:'100%' }} />}
              </View>
              <Text style={{ color:'#F6F6F6', fontWeight:'800' }}>방장 {p?.chatName || p?.displayName || ownerId}</Text>
            </View>
          );
        })()}
      </View>
      {/* 요청사항: 방장도 참가자 목록에 포함 */}
      <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>참가자 목록 ({allIds.length})</Text>
      <View style={{ marginTop:6 }}>
        {allIds.map(uid => {
          const p = getProfile(uid);
          return (
            <TouchableOpacity
              key={uid}
              activeOpacity={0.9}
              onPress={() => { try { require('expo-router').router.push({ pathname: '/chat/friend-profile', params: { id: String(uid), name: String(p?.chatName || p?.displayName || uid) } as any }); } catch {} }}
              style={{ paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#1E1E1E', flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
            >
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <View style={{ width:24, height:24, borderRadius:12, overflow:'hidden', backgroundColor:'#333' }}>
                  {!!p?.avatar && <Image source={{ uri: p.avatar }} style={{ width:'100%', height:'100%' }} />}
                </View>
                <Text style={{ color:'#CFCFCF' }}>{p?.chatName || p?.displayName || uid}</Text>
              </View>
              <Text style={{ color:'#9BA1A6', fontSize:12 }}>{uid===ownerId ? 'admin' : 'member'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection:'row', gap:10, marginTop:14 }}>
        <TouchableOpacity onPress={onInvite} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:10 }}>
          <Text style={{ color:'#CFCFCF', fontWeight:'800' }}>초대 코드/QR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

