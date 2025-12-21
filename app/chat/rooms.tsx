import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { router, Stack } from 'expo-router';
import { firebaseAuth, firestore, ensureAuthedUid } from '@/lib/firebase';
import { collection, getDocs, getDoc, limit, orderBy, query, where, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert, TextInput, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatRoomsScreen() {
  const { currentProfile } = useChatProfileStore();
  const roomsStore = useKakaoRoomsStore();
  const { rooms } = roomsStore;
  const { language } = usePreferences();
  const insets = useSafeAreaInsets();
  // DM 표시용 프로필 캐시/내 UID
  const [dmProfiles, setDmProfiles] = React.useState<Record<string, { displayName: string; avatar?: string }>>({});
  const myUid = React.useMemo(() => firebaseAuth.currentUser?.uid || 'me', []);
  const [remotePublicRooms, setRemotePublicRooms] = React.useState<any[]>([]);
  // TTL 만료 방 숨김 + 원격 공개방 병합
  const visibleRooms = React.useMemo(() => {
    const now = Date.now();
    const local = (rooms || []).filter((r: any) => {
      if (String(r?.type) !== 'ttl') return true;
      const exp = Number(r?.expiresAt || 0);
      return !exp || exp > now;
    });
    // 정렬: 공지(notice) 최상단, 나머지는 최근 메시지 시간 desc (로컬 lastMessageAt)
    const notice = local.filter((r:any)=> String(r?.type)==='notice');
    const others = local.filter((r:any)=> String(r?.type)!=='notice');
    others.sort((a:any,b:any)=> (Number(b?.lastMessageAt||0) - Number(a?.lastMessageAt||0)));
    return [...notice, ...others];
  }, [rooms]);
  const leaveRoomAct = useKakaoRoomsStore((s) => s.leaveRoom);
  // 멤버십 확인: 로컬 배열 → Firestore members → users/joinedRooms 순으로 확인
  const isMemberOfRoom = React.useCallback(async (room: any): Promise<boolean> => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      if (Array.isArray(room?.members) && room.members.includes(uid)) return true;
      const mref = doc(firestore, 'rooms', String(room.id), 'members', uid);
      const ms = await getDoc(mref).catch(()=>null);
      if (ms && ms.exists()) return true;
      const uref = doc(firestore, 'users', uid, 'joinedRooms', String(room.id));
      const us = await getDoc(uref).catch(()=>null);
      return !!(us && us.exists());
    } catch { return false; }
  }, []);

  // 비밀번호 요구 모달 상태
  const [pwdAsk, setPwdAsk] = React.useState<null | { roomId: string; title: string }>(null);
  const [pwdInput, setPwdInput] = React.useState('');
  const [pwdError, setPwdError] = React.useState<string>('');
  const [pwdVisible, setPwdVisible] = React.useState(false);
  const [pwdLoading, setPwdLoading] = React.useState(false);

  const handleConfirmEnter = async () => {
    if (!pwdAsk) return;
    if (!pwdInput.trim()) { setPwdError('비밀번호를 입력하세요'); return; }
    setPwdLoading(true);
    try {
      const roomId = pwdAsk.roomId;
      try { await (useKakaoRoomsStore as any).getState().load?.(roomId); } catch {}
      const settings: any = (useKakaoRoomsStore as any).getState().roomSettings?.[roomId] || {};
      const pwd = String(settings?.security?.passwordLock || '').trim();
      if (pwd && pwd === pwdInput.trim()) {
        setPwdAsk(null); setPwdInput(''); setPwdError(''); setPwdVisible(false);
        router.push({ pathname: '/chat/room/[id]', params: { id: roomId, type: (useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type } });
      } else {
        setPwdError('비밀번호가 일치하지 않습니다.');
      }
    } finally { setPwdLoading(false); }
  };

  // 관리 모드: 방 다중 선택 후 나가기 수행
  const [manageMode, setManageMode] = React.useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = React.useState<Set<string>>(new Set());
  const toggleManage = () => {
    setManageMode((v) => {
      if (v) setSelectedRoomIds(new Set());
      return !v;
    });
  };
  const toggleSelect = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      return next;
    });
  };
  const clearSelection = () => setSelectedRoomIds(new Set());
  const selectAll = () => {
    setSelectedRoomIds(new Set((rooms || []).map((r:any)=>r.id)));
  };
  const handleLeaveSelected = async () => {
    let uid = firebaseAuth.currentUser?.uid || '';
    if (!uid) {
      try { uid = await ensureAuthedUid(); } catch { uid = firebaseAuth.currentUser?.uid || 'me'; }
    }
    const ids = Array.from(selectedRoomIds);
    if (ids.length === 0) return;
    try { console.log('[rooms] leave click', { count: ids.length, uid }); } catch {}
    if (Platform.OS === 'web') {
      const ok = (()=>{ try { return window.confirm(`${ids.length}개의 방에서 나가시겠습니까?`); } catch { return true; } })();
      if (!ok) return;
      try { console.log('[rooms] leave confirm(web)'); } catch {}
      for (const id of ids) {
        // 낙관적 업데이트: 먼저 로컬에서 제거 후 서버 시도
        try { useKakaoRoomsStore.setState((s:any)=>({ rooms: (s.rooms||[]).filter((r:any)=>r.id!==id) })); } catch {}
        try { await leaveRoomAct(id, uid); } catch {}
      }
      clearSelection();
      setManageMode(false);
      try { Alert.alert('완료','선택한 방에서 나갔습니다.'); } catch {}
      return;
    }
    Alert.alert('방 나가기', `${ids.length}개의 방에서 나가시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: async () => {
        try { console.log('[rooms] leave confirm'); } catch {}
        for (const id of ids) {
          try { useKakaoRoomsStore.setState((s:any)=>({ rooms: (s.rooms||[]).filter((r:any)=>r.id!==id) })); } catch {}
          try { await leaveRoomAct(id, uid); } catch {}
        }
        clearSelection();
        setManageMode(false);
        try { Alert.alert('완료','선택한 방에서 나갔습니다.'); } catch {}
      } }
    ]);
  };

  // 원격 공개방 주기적 로드 (공지 포함)
  React.useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const roomsRef = collection(firestore, 'rooms');
        const q1 = query(roomsRef, where('isPublic','==', true), orderBy('lastActiveAt','desc'), limit(100));
        const q2 = query(roomsRef, where('type','==','notice'), orderBy('lastActiveAt','desc'), limit(100));
        const [s1, s2] = await Promise.all([getDocs(q1).catch(()=>null), getDocs(q2).catch(()=>null)]);
        const rows: any[] = [];
        if (s1 && !s1.empty) rows.push(...s1.docs.map(d=>({ id:d.id, ...(d.data() as any), _remote:true })));
        if (s2 && !s2.empty) rows.push(...s2.docs.map(d=>({ id:d.id, ...(d.data() as any), _remote:true })));
        if (live) setRemotePublicRooms(rows);
      } catch { if (live) setRemotePublicRooms([]); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const joinAndOpen = async (room: any) => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      if (!(rooms||[]).some((r:any)=> String(r.id)===String(room.id))) {
        useKakaoRoomsStore.setState((s:any)=>({ rooms: [{ id: room.id, title: room.title||'채팅방', members:[uid], unreadCount:0, lastMessageAt: room.lastActiveAt||Date.now(), type: room.type||'group', expiresAt: room.expiresAt, messageTtlMs: room.messageTtlMs }, ...(s.rooms||[]) ] }));
      }
      try {
        const roomRef = doc(firestore, 'rooms', String(room.id));
        const memberRef = doc(firestore, 'rooms', String(room.id), 'members', uid);
        const userRoomRef = doc(firestore, 'users', uid, 'joinedRooms', String(room.id));
        void setDoc(memberRef, { joinedAt: serverTimestamp() }, { merge: true });
        void setDoc(userRoomRef, { joinedAt: serverTimestamp(), title: room.title || '채팅방' }, { merge: true });
        void updateDoc(roomRef, { updatedAt: serverTimestamp() } as any).catch(async()=>{ try { await setDoc(roomRef, { updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
      } catch {}
      router.push({ pathname: '/chat/room/[id]', params: { id: String(room.id), type: room.type } });
    } catch {}
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.container}>
        {/* 통일 상단바: 좌 60%(프로필), 우 40%(아이콘) - 로고 제거 */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/chat/profile-settings')}
            >
              <View style={styles.profileImage}>
                {currentProfile?.avatar ? (
                  <Image 
                    source={{ uri: currentProfile.avatar }} 
                    style={styles.profileImagePlaceholder}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.profileText}>👤</Text>
                )}
              </View>
              {currentProfile && (
                <View style={styles.profileStatus}>
                  <Text style={styles.profileStatusText}>
                    {currentProfile.status === 'online' && '🟢'}
                    {currentProfile.status === 'idle' && '🟡'}
                    {currentProfile.status === 'dnd' && '🔴'}
                    {currentProfile.status === 'offline' && '⚫'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {currentProfile && (
              <View style={styles.profilePreview}>
                <ThemedText style={styles.profilePreviewName}>{currentProfile.displayName}</ThemedText>
                <ThemedText style={styles.profilePreviewStatus}>
                  {currentProfile.customStatus || 
                   (currentProfile.status === 'online' && t('online', language)) ||
                   (currentProfile.status === 'idle' && t('idle', language)) ||
                   (currentProfile.status === 'dnd' && t('dnd', language)) ||
                   (currentProfile.status === 'offline' && t('offline', language))}
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.headerIcons}>
            <TouchableOpacity 
              style={styles.headerIcon}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { try { router.push('/chat/notifications' as any); } catch {} }}
            >
              <Text style={styles.iconText}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerIcon}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => router.push('/chat/friends')}
            >
              <Text style={styles.iconText}>👥</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerIcon}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => router.push('/chat/rooms')}
            >
              <Text style={styles.iconText}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerIcon}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => router.push('/chat/settings')}
            >
              <Text style={styles.iconText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

      {/* 친구 페이지의 상단바 아래 빠른 검색/추가 영역 복원 */}
      <View style={styles.addRow}>
        <View style={styles.addItem}>
          <TouchableOpacity style={styles.addCircle} onPress={toggleManage}>
            <MaterialIcons name="settings" size={22} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.addLabel}>{t('chatRoomManage', language)}{manageMode && selectedRoomIds.size ? ` (${selectedRoomIds.size})` : ''}</Text>
        </View>
        <View style={styles.addItem}>
          <TouchableOpacity style={styles.addCircle} onPress={() => router.push('/chat/add-friend-qr')}>
            <MaterialIcons name="qr-code-2" size={22} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.addLabel}>{t('qrCode', language)}</Text>
        </View>
        <View style={styles.addItem}>
          <TouchableOpacity style={styles.addCircle} onPress={() => router.push({ pathname: '/chat/search-rooms', params: { tab: 'rooms' } as any })}>
            <MaterialIcons name="mail-outline" size={22} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.addLabel}>{t('inviteLetter', language)}</Text>
        </View>
        <View style={styles.addItem}>
          <TouchableOpacity style={styles.addCircle} onPress={() => router.push('/chat/create-room')}>
            <MaterialIcons name="add-circle-outline" size={22} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.addLabel}>{t('createRoom', language)}</Text>
        </View>
        <View style={styles.addItem}>
          <TouchableOpacity style={styles.addCircle} onPress={() => router.push({ pathname: '/chat/search-rooms', params: { tab: 'rooms' } as any })}>
            <MaterialIcons name="search" size={22} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.addLabel}>{t('searchAction', language)}</Text>
        </View>
      </View>

      {/* 방 리스트 */}
      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, paddingBottom: Math.max(insets.bottom, 12) + 90 }}
        showsVerticalScrollIndicator
      >
          {visibleRooms.length === 0 ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ThemedText style={{ color: '#B8B8B8' }}>{t('noChatRooms', language)}</ThemedText>
            </View>
          ) : (
            visibleRooms.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={styles.roomItem}
                onPress={() => {
                  if (manageMode) { toggleSelect(room.id); return; }
                  (async () => {
                    try {
                      // 최신 설정 로드 (비공개/비번 확인)
                      try { await (useKakaoRoomsStore as any).getState().load?.(room.id); } catch {}
                      const settings: any = (useKakaoRoomsStore as any).getState().roomSettings?.[room.id] || {};
                      const isPrivate = (settings?.basic?.isPublic === false) || (room.isPublic === false);
                      const pwd = String(settings?.security?.passwordLock || '').trim();
                      if (isPrivate && pwd) {
                        const member = await isMemberOfRoom(room);
                        if (!member) {
                          setPwdAsk({ roomId: room.id, title: room.title || '채팅방' });
                          setPwdInput(''); setPwdError(''); setPwdVisible(false);
                          return;
                        }
                      }
                      router.push({ pathname: '/chat/room/[id]', params: { id: room.id, type: room.type } });
                    } catch {}
                  })();
                }}
                onLongPress={() => { if (!manageMode) { setManageMode(true); toggleSelect(room.id); } }}
              >
                {manageMode && (
                  <View style={styles.selectWrap}>
                    <View style={[styles.selectCircle, selectedRoomIds.has(room.id) && styles.selectCircleOn]}>
                      {selectedRoomIds.has(room.id) && <Text style={styles.selectMark}>✔</Text>}
                    </View>
                  </View>
                )}
                <View style={styles.roomAvatar}>
                  {String(room.type)==='dm'
                    ? (() => {
                        try {
                          const other = (Array.isArray(room.members)? room.members.find((u:string)=>u!==myUid):'') || '';
                          const p = dmProfiles[other];
                          if (p?.avatar) return <Image source={{ uri: p.avatar }} style={styles.roomAvatarImg} />;
                          return (
                    <View style={styles.roomAvatarFallback}>
                              <Text style={styles.roomAvatarText}>{(p?.displayName || room.title || 'D').charAt(0)}</Text>
                    </View>
                          );
                        } catch {
                          return <View style={styles.roomAvatarFallback}><Text style={styles.roomAvatarText}>{(room.title||'D').charAt(0)}</Text></View>;
                        }
                      })()
                    : (room.avatarUrl
                        ? <Image source={{ uri: room.avatarUrl }} style={styles.roomAvatarImg} />
                        : <View style={styles.roomAvatarFallback}><Text style={styles.roomAvatarText}>{(room.title||'G').charAt(0)}</Text></View>
                      )
                  }
                </View>
                <View style={styles.roomInfo}>
                  <View style={styles.roomHeaderRow}>
                    <View style={{ flexDirection:'row', alignItems:'center' }}>
                      {(() => { try { const settings: any = (useKakaoRoomsStore as any).getState().roomSettings?.[room.id] || {}; const isPrivate = (settings?.basic?.isPublic === false) || (room.isPublic === false); if (!isPrivate) return null; return (<Text style={{ marginRight: 6 }}>🔒</Text>); } catch { return null; } })()}
                      <ThemedText style={styles.roomName}>
                        {String(room.type)==='dm'
                          ? (dmProfiles[(Array.isArray(room.members)? room.members.find((u:string)=>u!==myUid):'') || '']?.displayName || room.title)
                          : room.title}
                        {(Array.isArray(room.members)?`(${room.members.length})`: '')}
                      </ThemedText>
                    </View>
                    <View style={[styles.typeBadge, room.type==='ttl'&&styles.typeTtl, room.type==='secret'&&styles.typeSecret, room.type==='group'&&styles.typeGroup, room.type==='dm'&&styles.typeDm]}>
                      <Text style={styles.typeBadgeText}>
                        {room.type==='ttl'?t('ttl', language): room.type==='secret'?t('secret', language): room.type==='group'?t('group', language): room.type==='dm'?t('dm', language):t('notice', language)}
                      </Text>
                    </View>
                  </View>
                  <ThemedText style={styles.lastMessage} numberOfLines={1}>{room.lastMessage || t('noMessages', language)}</ThemedText>
                </View>
                <View style={styles.metaCol}>
                  {!!room.lastMessageAt && (
                    <Text style={styles.timeText}>{new Date(room.lastMessageAt).toLocaleTimeString(language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                  )}
                  {Number(room.unreadCount||0) > 0 && (
                    <View style={styles.unreadBadge}><Text style={styles.unreadText}>{Number(room.unreadCount) > 99 ? '99+' : room.unreadCount}</Text></View>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

      {/* 관리 하단 액션바 */}
      {manageMode && (
        <View style={[styles.manageBar, { zIndex: 4000, elevation: 20, bottom: 60 + Math.max(insets.bottom, 0) }]}>
          <TouchableOpacity style={[styles.mngBtn,{ borderColor:'#555' }]} onPress={selectAll}><Text style={styles.mngTxt}>{t('selectAll', language)}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.mngBtn,{ borderColor:'#666' }]} onPress={clearSelection}><Text style={styles.mngTxt}>{t('clearSelection', language)}</Text></TouchableOpacity>
          <Text style={[styles.mngTxt,{ marginHorizontal: 8 }]}>{`${t('selectedCount', language)} ${selectedRoomIds.size}`}</Text>
          <TouchableOpacity style={[styles.mngBtn,{ borderColor:'#7A1F1F' }]} onPress={handleLeaveSelected}><Text style={[styles.mngTxt,{ color:'#FF6B6B' }]}>{t('leave', language)}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.mngBtn,{ borderColor:'#FFD700' }]} onPress={toggleManage}><Text style={[styles.mngTxt,{ color:'#FFD700' }]}>{t('done', language)}</Text></TouchableOpacity>
        </View>
      )}
      </ThemedView>
      {/* 비밀번호 입력 모달 */}
      {pwdAsk && (
        <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.55)', alignItems:'center', justifyContent:'center' }}>
          <View style={{ width: 300, borderRadius: 14, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', padding: 14 }}>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <Text style={{ color:'#F6F6F6', fontWeight:'800' }}>{pwdAsk.title}</Text>
              <Text style={{ color:'#FFD700', fontSize:16 }}>🔒</Text>
            </View>
            <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>입장 비밀번호를 입력하세요</Text>
            <View style={{ marginTop:10, flexDirection:'row', alignItems:'center', borderWidth:1, borderColor: pwdError? '#7A1F1F' : '#2A2A2A', borderRadius:10, backgroundColor:'#111', paddingHorizontal:10 }}>
              <TextInput
                style={{ flex:1, color:'#F6F6F6', paddingVertical:10 }}
                value={pwdInput}
                onChangeText={(t: string)=>{ setPwdInput(t); setPwdError(''); }}
                placeholder="비밀번호"
                placeholderTextColor="#666"
                secureTextEntry={!pwdVisible}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={()=>setPwdVisible(v=>!v)} style={{ paddingHorizontal:6, paddingVertical:4 }}><Text style={{ color:'#FFD700' }}>{pwdVisible?'보기':'숨김'}</Text></TouchableOpacity>
            </View>
            {!!pwdError && (<Text style={{ color:'#FF6B6B', fontSize:11, marginTop:6 }}>{pwdError}</Text>)}
            <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:12, gap:8 }}>
              <TouchableOpacity disabled={pwdLoading} onPress={()=>{ setPwdAsk(null); setPwdInput(''); setPwdError(''); }} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:10 }}>
                <Text style={{ color:'#CFCFCF' }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={pwdLoading} onPress={handleConfirmEnter} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:10, backgroundColor:'transparent' }}>
                <Text style={{ color:'#FFD700', fontWeight:'800' }}>{pwdLoading?'확인중...':'입장'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <ChatBottomBar active="chat" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#0C0C0C', borderBottomWidth: 1, borderBottomColor: '#D4AF37',
  },
  profileButton: { width: 40, height: 40 },
  profileImage: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#D4AF37',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD700',
  },
  profileImagePlaceholder: { width: 36, height: 36, borderRadius: 18 },
  profileText: { fontSize: 20 },
  profileStatus: {
    position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#0C0C0C', borderWidth: 2, borderColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center',
  },
  profileStatusText: { fontSize: 8 },
  profilePreview: { marginLeft: 8, flex: 1, justifyContent: 'center' },
  profilePreviewName: { fontSize: 16, fontWeight: 'bold', color: '#F6F6F6', marginBottom: 2 },
  profilePreviewStatus: { fontSize: 12, color: '#B8B8B8' },
  headerLeft: { flexDirection:'row', alignItems:'center', flex: 6, minWidth: 0 },
  logoContainer: { display:'none' },
  logoImage: { width: 0, height: 0 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 4, justifyContent:'flex-end' },
  headerIcon: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#D4AF37',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C0C0C',
  },
  iconText: { fontSize: 12 },
  addRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#0C0C0C',
    borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
  },
  addItem: { alignItems: 'center', justifyContent: 'center', width: 72 },
  addCircle: {
    paddingVertical: 0, paddingHorizontal: 0,
    backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center',
  },
  addLabel: { marginTop: 2, color: '#CFCFCF', fontSize: 11, lineHeight: 11 },
  list: { flex: 1 },
  roomItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A'
  },
  selectWrap: { marginRight: 8 },
  selectCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  selectCircleOn: { borderColor: '#FFD700', backgroundColor: '#2A2A2A' },
  selectMark: { color: '#FFD700', fontSize: 12, lineHeight: 12 },
  roomAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 10, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  roomAvatarImg: { width: 44, height: 44 },
  roomAvatarFallback: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  roomAvatarText: { color: '#D4AF37', fontWeight: '700' },
  roomInfo: { flex: 1 },
  roomHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomName: { color: '#F6F6F6', fontSize: 15, fontWeight: '700' },
  typeBadge: { marginLeft: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#555' },
  typeBadgeText: { color: '#B8B8B8', fontSize: 10 },
  typeTtl: { borderColor: '#FFD700' },
  typeSecret: { borderColor: '#9C27B0' },
  typeGroup: { borderColor: '#03A9F4' },
  typeDm: { borderColor: '#4CAF50' },
  lastMessage: { color: '#9BA1A6', fontSize: 12, marginTop: 2 },
  metaCol: { alignItems: 'flex-end', minWidth: 56 },
  timeText: { color: '#777', fontSize: 10, marginBottom: 6 },
  unreadBadge: { minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: '#FF5252', alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 16, bottom: 66,
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FFD700'
  },
  fabText: { color: '#0C0C0C', fontWeight: '900', fontSize: 28, lineHeight: 28 },
  manageBar: { position:'absolute', left: 0, right: 0, bottom: 60, flexDirection:'row', alignItems:'center', justifyContent:'space-around', padding: 10, backgroundColor:'#0F0F0F', borderTopWidth:1, borderColor:'#1E1E1E' },
  mngBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth:1, borderRadius: 10 },
  mngTxt: { color:'#CFCFCF', fontWeight:'700' },
});


