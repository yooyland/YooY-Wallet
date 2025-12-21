import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { firestore } from '@/lib/firebase';
import { collection, getDocs, limit, orderBy, query, startAfter, where, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { firebaseAuth } from '@/lib/firebase';
import { router, useLocalSearchParams } from 'expo-router';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';

export default function SearchRoomsScreen() {
  const { language } = usePreferences();
  // 공개 방 가입 처리(언어/라우터 클로저 포함)
  const handleJoinLocal = (room: any) => {
    try {
      if (room && room.isPublic === false) {
        Alert.alert(t('invite', language), t('allowInvites', language));
        return;
      }
      const uid = firebaseAuth.currentUser?.uid || 'me';
      const add = {
        id: room.id,
        title: room.title || t('chatAction', language),
        members: [uid],
        unreadCount: 0,
        lastMessageAt: room.lastActiveAt || Date.now(),
        type: room.type || 'group',
        expiresAt: room.expiresAt,
        messageTtlMs: (room.type === 'ttl' ? room.messageTtlMs : null),
      } as any;
      useKakaoRoomsStore.setState((s:any)=>{
        if ((s.rooms||[]).some((r:any)=>r.id===room.id)) return s;
        return { rooms: [add, ...(s.rooms||[])] };
      });
      // Firestore 멤버십 기록 (best-effort)
      try {
        const roomRef = doc(firestore, 'rooms', String(room.id));
        const memberRef = doc(firestore, 'rooms', String(room.id), 'members', uid);
        const userRoomRef = doc(firestore, 'users', uid, 'joinedRooms', String(room.id));
        void setDoc(memberRef, { joinedAt: serverTimestamp() }, { merge: true });
        void setDoc(userRoomRef, { joinedAt: serverTimestamp(), title: room.title || t('chatAction', language) }, { merge: true });
        void updateDoc(roomRef, { updatedAt: serverTimestamp() } as any).catch(async()=>{ try { await setDoc(roomRef, { updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
      } catch {}
      Alert.alert(t('done', language), t('chatRoomsList', language));
      try { router.push({ pathname: '/chat/room/'+String(room.id) } as any); } catch {}
    } catch {
      Alert.alert(t('error', language), t('orderRejected', language));
    }
  };
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'friends'|'rooms'>((String(params?.tab||'')==='friends')?'friends':'rooms');
  const [qText, setQText] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const lastDocRef = useRef<any>(null);
  const [preview, setPreview] = useState<any|null>(null);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const localRooms = useKakaoRoomsStore((s) => s.rooms);
  const { currentProfile } = useChatProfileStore();
  const profilesMap = useChatProfileStore((s) => s.profiles);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsResults, setFriendsResults] = useState<any[]>([]);
  const [friendsRecLoading, setFriendsRecLoading] = useState(false);
  const [friendsRecommended, setFriendsRecommended] = useState<any[]>([]);

  const runSearch = async (isLoadMore = false) => {
    try {
      setLoading(true);
      const roomsRef = collection(firestore, 'rooms');
      const text = (qText || '').trim().toLowerCase();
      const tagLower = (tag || '').trim().toLowerCase();

      let rows: any[] = [];
      // 1차: 인덱스가 있으면 정규 쿼리 (공개 + 공지)
      try {
        const tasks: Promise<any>[] = [];
        if (text) {
          try { tasks.push(getDocs(query(roomsRef, where('isPublic','==', true), where('title_lower','>=', text), where('title_lower','<=', text+"\uf8ff"), limit(100)))); } catch {}
          try { tasks.push(getDocs(query(roomsRef, where('type','==','notice'), where('title_lower','>=', text), where('title_lower','<=', text+"\uf8ff"), limit(100)))); } catch {}
        }
        if (tagLower) {
          try { tasks.push(getDocs(query(roomsRef, where('isPublic','==', true), where('tags_lower','array-contains', tagLower), limit(100)))); } catch {}
          try { tasks.push(getDocs(query(roomsRef, where('type','==','notice'), where('tags_lower','array-contains', tagLower), limit(100)))); } catch {}
        }
        if (!text && !tagLower) {
          try { tasks.push(getDocs(query(roomsRef, where('isPublic','==', true), orderBy('lastActiveAt','desc'), limit(100)))); } catch {}
          try { tasks.push(getDocs(query(roomsRef, where('type','==','notice'), orderBy('lastActiveAt','desc'), limit(100)))); } catch {}
        }
        if (tasks.length) {
          const snaps = await Promise.all(tasks);
          snaps.forEach((snap:any) => { if (snap && !snap.empty) rows.push(...snap.docs.map((d:any)=>({ id:d.id, ...(d.data() as any) }))); });
        }
      } catch {}

      // 안전한 2단계: 넉넉히 가져와 클라이언트 필터 (인덱스 미구성 환경 대응)
      try {
        // 공개 여부 필드가 없는 기존 방도 검색되도록 isPublic 필터 제거 후 클라이언트 필터링
        let qPublic = query(roomsRef, orderBy('lastActiveAt', 'desc'), limit(200));
        if (isLoadMore && lastDocRef.current) qPublic = query(roomsRef, orderBy('lastActiveAt', 'desc'), startAfter(lastDocRef.current), limit(200));
        const snap = await getDocs(qPublic);
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
        rows = [...rows, ...snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))];
      } catch {
        rows = rows || [];
      }
      // 로컬 방과 병합 후 태그/텍스트 기준으로 보강
      const local = (localRooms||[]).map((r:any)=>({ id:r.id, title:r.title, lastActiveAt:r.lastMessageAt||0, memberCount:Array.isArray(r.members)?r.members.length:0, tags:r.tags||[], isPublic:true, type:r.type, _local:true }));
      const uniq = new Map<string, any>();
      [...rows, ...local].forEach((it:any)=>{ if (it && it.id) uniq.set(it.id, it); });
      let out = Array.from(uniq.values());
      // 공개/공지 허용: isPublic이 false가 아닌 것 + type notice
      out = out.filter((r:any) => (r.isPublic !== false) || String(r.type)==='notice');
      const t = text; const tg = tagLower;
      if (t || tg) {
        out = out.filter((r:any)=>{
          const hitTitle = t ? String(r.title||'').toLowerCase().includes(t) : true;
          const hitTag = tg ? (Array.isArray(r.tags) && (r.tags.includes(tg) || (r.tags_lower||[]).includes(tg))) : true;
          return hitTitle && hitTag;
        });
      }
      setRooms(prev => isLoadMore ? [...prev, ...out] : out);
    } finally { setLoading(false); }
  };

  const normalizePhone = (v: string) => (v||'').replace(/\D/g,'');
  const runFriendSearch = async () => {
    try {
      setFriendsLoading(true);
      const text = (qText||'').trim().toLowerCase();
      const tagLower = (tag||'').trim().toLowerCase();
      const out: Record<string, any> = {};
      // 1) 로컬 채팅 프로필 매칭: 대화명/태그
      try {
        Object.values(profilesMap||{}).forEach((p:any) => {
          const nameHit = text && String(p.displayName||'').toLowerCase().includes(text);
          const idHit = text && (String(p.userId||'').toLowerCase().includes(text) || String(p.id||'').toLowerCase().includes(text));
          const emailHit = text && String(p.email||'').toLowerCase().includes(text);
          const tagHit = tagLower && Array.isArray(p.tags) && p.tags.some((t:string)=>String(t||'').toLowerCase().includes(tagLower));
          // OR semantics between 영역1(text) and 영역2(tag)
          if ((!!text && (nameHit || idHit || emailHit)) || (!!tagLower && tagHit) || (!text && !tagLower)) {
            const id = p.userId || p.id || p.email || p.phone || String(Math.random());
            out[id] = {
              id,
              displayName: p.displayName,
              avatar: p.avatar,
              tags: p.tags || [],
              email: p.email,
              phone: p.phone,
              source: 'local',
            };
          }
        });
      } catch {}
      // 2) Firestore users 컬렉션(가능한 조건만)
      try {
        const usersRef = collection(firestore, 'users');
        const tasks: Promise<any>[] = [];
        if (text.includes('@')) {
          tasks.push(getDocs(query(usersRef, where('email','==', text), limit(10))));
        }
        const digits = normalizePhone(text);
        if (digits.length >= 7) {
          tasks.push(getDocs(query(usersRef, where('phone','==', digits), limit(10))));
          tasks.push(getDocs(query(usersRef, where('phone','==', `+82${digits.startsWith('0')?digits.slice(1):digits}`), limit(10))));
        }
        // 이름 prefix 필드가 있을 경우 사용
        try { tasks.push(getDocs(query(usersRef, where('displayName_lower','>=', text), where('displayName_lower','<=', text+"\uf8ff"), limit(10)))); } catch {}
        // id/username/handle 정확 매칭 시도
        try { tasks.push(getDocs(query(usersRef, where('id','==', text), limit(10)))); } catch {}
        try { tasks.push(getDocs(query(usersRef, where('username','==', text), limit(10)))); } catch {}
        try { tasks.push(getDocs(query(usersRef, where('handle','==', text), limit(10)))); } catch {}
        // 태그 포함(소문자 배열 필드가 있는 경우 우선)
        if (tagLower) {
          try { tasks.push(getDocs(query(usersRef, where('tags_lower','array-contains', tagLower), limit(10)))); } catch {}
          try { tasks.push(getDocs(query(usersRef, where('tags','array-contains', tagLower), limit(10)))); } catch {}
        }
        const snaps = await Promise.all(tasks);
        snaps.forEach((snap:any) => {
          if (!snap || snap.empty) return;
          snap.docs.forEach((d:any) => {
            const u = d.data() as any;
            const id = d.id;
            out[id] = {
              id,
              displayName: u.displayName || u.name || id,
              avatar: u.avatar,
              tags: Array.isArray(u.tags) ? u.tags : [],
              email: u.email,
              phone: u.phone,
              source: 'users',
            };
          });
        });
      } catch {}

      setFriendsResults(Object.values(out));
    } finally {
      setFriendsLoading(false);
    }
  };

  const loadRecommended = async () => {
    try {
      setLoadingRec(true);
      const roomsRef = collection(firestore, 'rooms');
      const q = query(roomsRef, where('isPublic', '==', true), orderBy('lastActiveAt', 'desc'), limit(10));
      const snap = await getDocs(q);
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // 로컬 방도 추천에 포함 (중복 제거)
      const localMapped = (localRooms || []).map((r:any) => ({
        id: r.id,
        title: r.title,
        lastActiveAt: r.lastMessageAt || 0,
        memberCount: Array.isArray(r.members) ? r.members.length : 0,
        tags: Array.isArray((r as any).tags) ? (r as any).tags : [],
        isPublic: true,
        type: r.type,
        _local: true,
      }));
      const uniq = new Map<string, any>();
      [...rows, ...localMapped].forEach((it) => { if (it && it.id) uniq.set(it.id, { ...it }); });
      const out = Array.from(uniq.values());
      const typedTag = (tag || '').trim().toLowerCase();
      out.sort((a:any,b:any) => {
        const localA = a._local ? 1 : 0;
        const localB = b._local ? 1 : 0;
        if (localA !== localB) return localB - localA; // 로컬 우선
        const scoreTagA = typedTag && Array.isArray(a.tags) && a.tags.includes(typedTag) ? 1 : 0;
        const scoreTagB = typedTag && Array.isArray(b.tags) && b.tags.includes(typedTag) ? 1 : 0;
        if (scoreTagA !== scoreTagB) return scoreTagB - scoreTagA; // 태그 매칭 우선
        return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
      });
      setRecommended(out);
    } finally { setLoadingRec(false); }
  };

  const loadRecommendedFriends = async () => {
    try {
      setFriendsRecLoading(true);
      const out: any[] = [];
      // 1) 로컬 프로필에서 추천(내 계정 제외) 최근 활동/이름 기준
      try {
        const arr = Object.values(profilesMap || {}) as any[];
        arr
          .filter(p => (p?.userId || p?.id) !== (currentProfile?.userId))
          .sort((a,b) => (b.lastActive||0) - (a.lastActive||0))
          .slice(0, 10)
          .forEach((p) => out.push({
            id: p.userId || p.id,
            displayName: p.displayName,
            avatar: p.avatar,
            tags: p.tags || [],
            email: p.email,
            phone: p.phone,
            source: 'local'
          }));
      } catch {}
      // 2) Firestore users: 최근 가입/활성 기준(필드가 있을 경우)
      try {
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, orderBy('lastActive','desc'), limit(10));
        const snap = await getDocs(q);
        snap.docs.forEach((d:any)=>{
          const u = d.data() as any;
          const id = d.id;
          if (id === currentProfile?.userId) return;
          out.push({ id, displayName: u.displayName || id, avatar: u.avatar, tags: u.tags || [], email: u.email, phone: u.phone, source: 'users' });
        });
      } catch {}
      // 중복 제거
      const uniq = new Map<string, any>();
      out.forEach((x)=> { if (x && x.id) uniq.set(x.id, x); });
      setFriendsRecommended(Array.from(uniq.values()));
    } finally {
      setFriendsRecLoading(false);
    }
  };

  useEffect(() => { runSearch(false).catch(()=>{}); loadRecommended().catch(()=>{}); loadRecommendedFriends().catch(()=>{}); }, [localRooms.length, Object.keys(profilesMap||{}).length]);
  // 탭이 변경될 때마다 각 탭 데이터 초기화/재로딩
  useEffect(() => {
    if (activeTab==='friends') {
      setRooms([]);
      runFriendSearch().catch(()=>{});
      loadRecommendedFriends().catch(()=>{});
    } else {
      runSearch(false).catch(()=>{});
      loadRecommended().catch(()=>{});
    }
  }, [activeTab]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { try { router.back(); } catch {} }}>
          <Text style={{ color:'#FFD700', fontSize:18, fontWeight:'700' }}>←</Text>
        </TouchableOpacity>
        <ThemedText style={[styles.title,{ marginLeft: 8 }]}>{t('chatSearch', language)}</ThemedText>
      </View>
      {/* 탭: 친구찾기 / 대화방 찾기 (1/2 영역 세그먼트) */}
      <View style={styles.tabsRow}>
        <TouchableOpacity onPress={() => setActiveTab('friends')} style={[styles.tabItem, activeTab==='friends' && styles.tabItemActive]}>
          <Text style={[styles.tabLabel, activeTab==='friends' && styles.tabLabelActive]}>{t('findFriends', language)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('rooms')} style={[styles.tabItem, activeTab==='rooms' && styles.tabItemActive]}>
          <Text style={[styles.tabLabel, activeTab==='rooms' && styles.tabLabelActive]}>{t('findRooms', language)}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <TextInput style={styles.input} value={qText} onChangeText={setQText} placeholder={activeTab==='friends' ? t('searchFriendsPlaceholder', language) : t('searchRoomsPlaceholder', language)} placeholderTextColor="#666"/>
        <TextInput style={styles.input} value={tag} onChangeText={setTag} placeholder={t('tags', language)} placeholderTextColor="#666"/>
        <TouchableOpacity style={styles.btn} onPress={() => { if (activeTab==='rooms') runSearch(false); else { runFriendSearch().catch(()=>{}); } }}>
          <Text style={styles.btnText}>{t('search', language)}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding: 12 }}>
        {/* 방 검색 결과 - 방 탭에서만 노출 */}
        {activeTab==='rooms' && (
          <>
            {rooms.length === 0 && !loading ? (
              <View style={{ paddingVertical: 10 }} />
            ) : rooms.map((r) => (
              <View key={`res-${r.id}`} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.itemTitle}>{r.title}</ThemedText>
                  <Text style={styles.itemMeta}>인원 {r.memberCount || 0} · 최근 {formatKoreanDate(r.lastActiveAt)}</Text>
                  {Array.isArray(r.tags) && r.tags.length>0 && (
                    <Text style={styles.itemTags}>#{(r.tags || []).slice(0,3).join(' #')}</Text>
                  )}
                </View>
                <TouchableOpacity style={styles.joinBtn} onPress={() => setPreview(r)}><Text style={styles.joinText}>미리보기</Text></TouchableOpacity>
              </View>
            ))}
            {loading && <ActivityIndicator style={{ marginVertical: 12 }} />}
            {!loading && rooms.length>=20 && (
              <TouchableOpacity style={[styles.btn,{ alignSelf:'center', marginTop: 8 }]} onPress={() => runSearch(true)}>
                <Text style={styles.btnText}>더 불러오기</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* 친구 결과 - 친구 탭에서 노출 */}
        {activeTab==='friends' && (
          <View style={{ marginTop: 8 }}>
            {friendsLoading && <ActivityIndicator />}
            {!friendsLoading && friendsResults.length === 0 && (
              <View style={{ paddingVertical: 10 }} />
            )}
            {!friendsLoading && friendsResults.map((u) => (
              <View key={`friend-${u.id}`} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.itemTitle}>{u.displayName}</ThemedText>
                  {!!u.email && <Text style={styles.itemMeta}>{u.email}</Text>}
                  {!!u.tags && Array.isArray(u.tags) && u.tags.length>0 && (
                    <Text style={styles.itemTags}>#{(u.tags||[]).slice(0,3).join(' #')}</Text>
                  )}
                </View>
                <TouchableOpacity style={styles.joinBtn} onPress={() => { try { router.push('/chat/add-friend-id'); } catch {} }}><Text style={styles.joinText}>{t('addFriend', language)}</Text></TouchableOpacity>
              </View>
            ))}

            {/* 추천 친구 섹션 */}
            <View style={{ marginTop: 16 }}>
              <ThemedText style={{ color:'#FFD700', marginBottom: 6 }}>{t('recommendedFriends', language)}</ThemedText>
              {friendsRecLoading && <ActivityIndicator />}
              {!friendsRecLoading && friendsRecommended.map((u) => (
                <View key={`friend-rec-${u.id}`} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.itemTitle}>{u.displayName}</ThemedText>
                    {!!u.email && <Text style={styles.itemMeta}>{u.email}</Text>}
                    {!!u.tags && Array.isArray(u.tags) && u.tags.length>0 && (
                      <Text style={styles.itemTags}>#{(u.tags||[]).slice(0,3).join(' #')}</Text>
                    )}
                  </View>
                  <TouchableOpacity style={styles.joinBtn} onPress={() => { try { router.push('/chat/add-friend-id'); } catch {} }}><Text style={styles.joinText}>{t('addFriend', language)}</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 추천 방 리스트 - 방 탭에서만 노출 */}
        {activeTab==='rooms' && (
        <View style={{ marginTop: 16 }}>
          <ThemedText style={{ color:'#FFD700', marginBottom: 6 }}>{t('chatRoomsList', language)}</ThemedText>
          {loadingRec && <ActivityIndicator />}
          {!loadingRec && recommended
            .filter((r) => rooms.findIndex((x)=>x.id===r.id) === -1)
            .map((r) => (
            <View key={`rec-${r.id}`} style={styles.item}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.itemTitle}>{r.title}</ThemedText>
                <Text style={styles.itemMeta}>인원 {r.memberCount || 0} · 최근 {formatKoreanDate(r.lastActiveAt)}</Text>
                {Array.isArray(r.tags) && r.tags.length>0 && (
                  <Text style={styles.itemTags}>#{(r.tags || []).slice(0,3).join(' #')}</Text>
                )}
              </View>
              <TouchableOpacity style={styles.joinBtn} onPress={() => setPreview(r)}><Text style={styles.joinText}>미리보기</Text></TouchableOpacity>
            </View>
          ))}
        </View>
        )}
      </ScrollView>

      {/* 미리보기 모달 */}
      {!!preview && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPreview(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ThemedText style={styles.modalTitle}>{preview.title}</ThemedText>
              <Text style={styles.modalMeta}>최근활성: {formatKoreanDate(preview.lastActiveAt)} · 인원 {preview.memberCount||0}</Text>
              {Array.isArray(preview.tags) && preview.tags.length>0 && (
                <Text style={styles.modalTags}>#{(preview.tags||[]).join(' #')}</Text>
              )}
              <View style={{ flexDirection:'row', gap:8, marginTop: 12 }}>
                <TouchableOpacity style={[styles.btn,{ flex:1 }]} onPress={() => setPreview(null)}><Text style={styles.btnText}>닫기</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btn,{ flex:1, borderColor:'#D4AF37' }]} onPress={() => { setPreview(null); handleJoinLocal(preview); }}><Text style={styles.btnText}>입장하기</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1E1E1E', flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#F6F6F6' },
  tabsRow: { paddingHorizontal: 12, flexDirection:'row', alignItems:'center', borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  tabItem: { flex:1, alignItems:'center', justifyContent:'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: '#FFD700' },
  tabLabel: { color: '#B8B8B8', fontSize: 13 },
  tabLabelActive: { color: '#FFD700', fontWeight: '700' },
  controls: { padding: 12, flexDirection:'row', alignItems: 'center' },
  input: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color:'#F6F6F6', backgroundColor:'#141414', marginRight: 6 },
  btn: { height: 36, minWidth: 60, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor:'#FFD700', alignItems:'center', justifyContent:'center', backgroundColor:'#1A1A1A' },
  btnText: { color:'#FFD700', fontWeight:'700' },
  item: { flexDirection:'row', alignItems:'center', gap:8, borderBottomWidth:1, borderBottomColor:'#1E1E1E', paddingVertical: 10 },
  itemTitle: { color:'#F6F6F6', fontSize: 15, fontWeight:'700' },
  itemMeta: { color:'#9BA1A6', fontSize: 12, marginTop: 2 },
  itemTags: { color:'#CFCFCF', fontSize: 11, marginTop: 2 },
  joinBtn: { borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:6, backgroundColor:'#141414' },
  joinText: { color:'#CFCFCF' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center' },
  modalCard: { width: 320, backgroundColor:'#0F0F0F', borderRadius:12, borderWidth:1, borderColor:'#2A2A2A', padding:14 },
  modalTitle: { color:'#F6F6F6', fontSize:16, fontWeight:'700' },
  modalMeta: { color:'#9BA1A6', fontSize:12, marginTop:4 },
  modalTags: { color:'#CFCFCF', fontSize:12, marginTop:6 },
});

// 안전한 날짜 포맷터
function formatKoreanDate(input: any): string {
  try {
    if (input === null || input === undefined || input === '' || Number.isNaN(input)) return '—';
    // Firestore Timestamp-like
    if (typeof input === 'object' && input && typeof input.toMillis === 'function') {
      const ms = input.toMillis();
      return new Date(ms).toLocaleString('ko-KR');
    }
    if (typeof input === 'object' && input && typeof input.seconds === 'number') {
      const ms = (input.seconds * 1000) + Math.floor((input.nanoseconds || 0) / 1e6);
      return new Date(ms).toLocaleString('ko-KR');
    }
    // number or numeric string
    const n = typeof input === 'string' ? Number(input) : input;
    const d = new Date(typeof n === 'number' && isFinite(n) ? n : input);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ko-KR');
  } catch { return '—'; }
}


