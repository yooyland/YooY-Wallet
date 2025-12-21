import ChatBottomBar from '@/components/ChatBottomBar';
// Revert: use local header in friends
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { firebaseAuth, firestore, ensureAuthedUid } from '@/lib/firebase';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, where, limit, getDocs } from 'firebase/firestore';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, usePathname } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useChatSettingsStore } from '@/src/features/chat/store/chat-settings.store';
import { useNotificationStore } from '@/src/features/chat/store/notification.store';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatFriendsScreen() {
  const insets = useSafeAreaInsets();
  const { currentProfile, initialize } = useChatProfileStore();
  const chatSettings = useChatSettingsStore();
  const unread = useNotificationStore((s) => s.unreadCount);
  const pathname = usePathname();
  const [notiOpen, setNotiOpen] = React.useState(false);
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const deleteNotification = useNotificationStore((s) => s.deleteNotification);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const [notiExpanded, setNotiExpanded] = React.useState<Set<string>>(new Set());
  const [notiSavedIds, setNotiSavedIds] = React.useState<Set<string>>(new Set());
  const { language } = usePreferences();
  React.useEffect(() => { initialize(); }, [initialize]);
  useFocusEffect(React.useCallback(() => { initialize(); return () => {}; }, [initialize]));
  useFocusEffect(React.useCallback(() => {
    (async () => {
      try {
        const last = await AsyncStorage.getItem('chat.profile.lastAvatar');
        if (last) {
          try {
            const { updateProfile } = useChatProfileStore.getState();
            updateProfile({ avatar: last });
          } catch {}
        }
      } catch {}
    })();
    return () => {};
  }, []));
  const [friends, setFriends] = React.useState<{ id: string; name: string; status: string; phone?: string; email?: string; addedAt?: number }[]>([]);
  const [favorites, setFavorites] = React.useState<Record<string, boolean>>({});
  const [contactNameByPhone, setContactNameByPhone] = React.useState<Record<string, string>>({});
  const [registeredPhones, setRegisteredPhones] = React.useState<Record<string, boolean>>({});
  const [registeredEmails, setRegisteredEmails] = React.useState<Record<string, boolean>>({});
  const [registeredIds, setRegisteredIds] = React.useState<Record<string, boolean>>({});
  const [nameToDigits, setNameToDigits] = React.useState<Record<string, string[]>>({});

  const normalizePhone = (v?: string) => (v || '').replace(/\D/g, '');
  const [nameOverrides, setNameOverrides] = React.useState<Record<string,string>>({});
  React.useEffect(() => {
    (async () => {
      try { const raw = await AsyncStorage.getItem('friends.nameOverrides'); setNameOverrides(raw ? JSON.parse(raw) : {}); } catch {}
    })();
  }, []);
  useFocusEffect(React.useCallback(() => {
    (async () => {
      try { const raw = await AsyncStorage.getItem('friends.nameOverrides'); setNameOverrides(raw ? JSON.parse(raw) : {}); } catch {}
    })();
    return () => {};
  }, []));

  const displayName = React.useCallback((f: { id: string; name?: string; phone?: string }) => {
    const o = nameOverrides[f.id];
    if (o && o.trim()) return o;
    return f.name || (f.phone || f.id);
  }, [nameOverrides]);
  const mapName = (row: { id: string; name?: string; phone?: string }): string => {
    // 1) 사용자가 저장한 로컬 오버라이드 우선
    const override = nameOverrides[row.id];
    if (override && override.trim()) return override;
    // 2) 기본(서버/로컬 캐시)
    const base = row.name || '';
    if (base && !/^\+?\d+$/.test(base)) return base;
    // 3) 연락처 동기화 이름 매핑
    const dn = row.phone ? contactNameByPhone[normalizePhone(row.phone)] || contactNameByPhone['+'+normalizePhone(row.phone)] : undefined;
    return dn || base || row.phone || row.id;
  };

  React.useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    // 1) 로컬 캐시 우선 표시
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('local.friends');
        const cached = await AsyncStorage.getItem('contacts.cached');
        if (cached) {
          const arr = JSON.parse(cached) as { name: string; phone: string|null }[];
          const m: Record<string,string> = {};
          const nm: Record<string, string[]> = {};
          arr.forEach(c => {
            if (c.phone) {
              const k = normalizePhone(c.phone);
              m[k] = c.name; m['+'+k] = c.name;
              const nk = (c.name || '').trim().toLowerCase();
              if (nk) { (nm[nk] = nm[nk] || []).push(k); }
            }
          });
          setContactNameByPhone(m);
          setNameToDigits(nm);
        }
        if (raw) {
          const arr = JSON.parse(raw) as any[];
          setFriends((prev) => {
            const byPhone = new Map<string, any>();
            const addEntry = (e: any) => {
              const key = e.phone ? normalizePhone(e.phone) : undefined;
              if (key) {
                const exist = byPhone.get(key);
                if (!exist || (exist.status !== 'linked' && e.status === 'linked')) byPhone.set(key, e);
              } else {
                byPhone.set(e.id, e);
              }
            };
            prev.forEach(addEntry);
            arr.forEach((x) => {
              const nk = (x.name || '').trim().toLowerCase();
              if (nk && x.phone) { (nameToDigits[nk] = nameToDigits[nk] || []).push(normalizePhone(x.phone)); }
              addEntry({ id: x.id, name: mapName({ id: x.id, name: x.name, phone: x.phone }), status: x.status || 'invited', phone: x.phone });
            });
            return Array.from(byPhone.values());
          });
        }
      } catch {}
    })();
    if (!uid) return;
    // Firestore: 내 친구 목록 실시간 구독
    const friendsRef = collection(firestore, 'users', uid, 'friends');
    const startFriendsSub = async () => {
      try { try { if (!firebaseAuth.currentUser) { await (await import('firebase/auth')).signInAnonymously(firebaseAuth).catch(()=>{}); } } catch {} try { await ensureAuthedUid(); } catch {}
      } catch {}
      return onSnapshot(query(friendsRef, orderBy('createdAt', 'desc')), (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        name: mapName({ id: d.id, name: (d.data() as any).displayName || undefined, phone: (d.data() as any).phone || undefined }),
        status: (d.data() as any).status || 'linked',
        phone: (d.data() as any).phone || undefined,
        email: (d.data() as any).email || undefined,
      }));
      setFriends((prev) => {
        const byPhone = new Map<string, any>();
        const addEntry = (e: any) => {
          const key = e.phone ? normalizePhone(e.phone) : undefined;
          if (key) {
            const exist = byPhone.get(key);
            if (!exist || (exist.status !== 'linked' && e.status === 'linked')) byPhone.set(key, e);
          } else {
            byPhone.set(e.id, e);
          }
        };
        // Firestore 우선으로 덮어쓰기
        rows.forEach(addEntry);
        prev.forEach(addEntry);
        const merged = Array.from(byPhone.values());
        return merged;
      });
      }, (err) => { console.warn('[friends] onSnapshot error', err?.code||err); });
    };
    const unsub1Promise = startFriendsSub();

    // Firestore: 내가 보낸 초대(대기)도 표시
    const invitesRef = collection(firestore, 'invites');
    const startInvitesSub = async () => {
      try { try { if (!firebaseAuth.currentUser) { await (await import('firebase/auth')).signInAnonymously(firebaseAuth).catch(()=>{}); } } catch {} try { await ensureAuthedUid(); } catch {} } catch {}
      return onSnapshot(query(invitesRef, where('inviterId', '==', uid), where('status', '==', 'pending')), (snap) => {
      const rows = snap.docs.map((d) => ({
        id: `invite-${d.id}`,
        name: mapName({ id: `invite-${d.id}`, name: undefined, phone: (d.data() as any).phone || undefined }),
        status: 'invited' as const,
        phone: (d.data() as any).phone || undefined,
        email: undefined,
      }));
      setFriends((prev) => {
        const byPhone = new Map<string, any>();
        const addEntry = (e: any) => {
          const key = e.phone ? normalizePhone(e.phone) : undefined;
          if (key) {
            const exist = byPhone.get(key);
            if (!exist || (exist.status !== 'linked' && e.status === 'linked')) byPhone.set(key, e);
          } else {
            byPhone.set(e.id, e);
          }
        };
        prev.forEach(addEntry);
        rows.forEach(addEntry);
        return Array.from(byPhone.values());
      });
      }, (err) => { console.warn('[invites] onSnapshot error', err?.code||err); });
    };
    const unsub2Promise = startInvitesSub();

    return () => { (async()=>{ try { (await unsub1Promise)(); } catch {} try { (await unsub2Promise)(); } catch {} })(); };
  }, []);

  // 포커스 시 로컬 캐시 재로딩 (연락처에서 추가 후 즉시 반영)
  useFocusEffect(React.useCallback(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('local.friends');
        if (!raw) return;
        const arr = JSON.parse(raw) as any[];
        setFriends(() => {
          const byPhone = new Map<string, any>();
          const addEntry = (e: any) => {
            const key = e.phone ? normalizePhone(e.phone) : undefined;
            if (key) {
              const exist = byPhone.get(key);
              if (!exist || (exist.status !== 'linked' && e.status === 'linked')) byPhone.set(key, e);
            } else {
              byPhone.set(e.id, e);
            }
          };
          arr.forEach(addEntry);
          return Array.from(byPhone.values());
        });
      } catch {}
    })();
    return () => {};
  }, []));

  // 유틸: 섹션 만들기
  const now = Date.now();
  const recentAdded = friends.filter(f => f.addedAt && now - (f.addedAt as number) <= 3600_000);
  const favList = friends.filter(f => favorites[f.id]);
  const allList = friends; // 즐겨찾기와 무관하게 전체 목록 유지

  const groupByInitial = (list: typeof friends) => {
    const groups: Record<string, typeof friends> = {} as any;
    list.forEach((f) => {
      const ch = (f.name || '?').charAt(0).toUpperCase();
      const key = /[A-Z]/.test(ch) ? ch : /[0-9]/.test(ch) ? '0-9' : '기타';
      (groups[key] = groups[key] || []).push(f);
    });
    return Object.keys(groups).sort().map((k) => ({ key: k, items: groups[k].sort((a,b)=>a.name.localeCompare(b.name,'ko')) }));
  };
  const groupedAll = React.useMemo(() => groupByInitial(allList), [allList]);
  const orderedAll = React.useMemo(() => {
    return groupedAll.flatMap((s) => s.items).filter((f, idx, arr) => {
      const key = f.phone ? normalizePhone(f.phone) : f.id;
      return arr.findIndex(x => (x.phone ? normalizePhone(x.phone) : x.id) === key) === idx;
    });
  }, [groupedAll]);

  // 최근 추가 표시 토글
  const [showAllRecent, setShowAllRecent] = React.useState(false);

  // 등록된 사용자(앱 설치) 캐시 로드: 전화번호/이메일 중 한 가지라도 일치하면 설치 사용자로 간주
  React.useEffect(() => {
    (async () => {
      try {
        const directPhones = Array.from(new Set(orderedAll.map(f => f.phone ? normalizePhone(f.phone) : '').filter(Boolean)));
        // 이름 기반으로 연결된 연락처 번호들도 포함 (친구 객체에 phone이 없어도 설치 사용자 판별 가능)
        const fromNames = Array.from(new Set(Object.values(nameToDigits).flat().filter(Boolean)));
        const phones = Array.from(new Set([...directPhones, ...fromNames]));
        const emails = Array.from(new Set(orderedAll.map(f => (f.email || '').trim().toLowerCase()).filter(Boolean)));
        const out: Record<string, boolean> = {};
        const outEmail: Record<string, boolean> = {};
        const outIds: Record<string, boolean> = {};
        for (const d of phones) {
          const variants = new Set<string>();
          // 기본
          variants.add(d);
          variants.add(`+${d}`);
          // 한국 변환 (0xxxxxxxxx <-> +82xxxxxxxxx)
          if (d.startsWith('0') && d.length >= 9) {
            variants.add(`82${d.slice(1)}`);
            variants.add(`+82${d.slice(1)}`);
          }
          if (d.startsWith('82')) {
            variants.add(`0${d.slice(2)}`);
            variants.add(`+${d}`);
            variants.add(`+82${d.slice(2)}`);
          }
          // 국제번호 일반화: 이미 +가 붙은 경우 제거 버전도 추가
          if (d.startsWith('1') || d.startsWith('44') || d.startsWith('81')) {
            variants.add(`+${d}`);
          }
          try {
            const usersRef = collection(firestore, 'users');
            let found = false;
            for (const v of Array.from(variants)) {
              const snap = await getDocs(query(usersRef, where('phone', '==', v), limit(1)));
              if (!snap.empty) { found = true; break; }
            }
            out[d] = found;
          } catch {}
        }
        // 이메일 매칭
        try {
          const usersRef = collection(firestore, 'users');
          for (const e of emails) {
            try {
              const snap = await getDocs(query(usersRef, where('email', '==', e), limit(1)));
              outEmail[e] = !snap.empty;
            } catch { outEmail[e] = false; }
          }
        } catch {}
        // 사용자 ID 존재 여부 확인 (문서 존재 시 설치 사용자로 간주)
        try {
          for (const f of orderedAll) {
            if (!f.id || f.id.startsWith('invite-')) continue;
            try {
              const snap = await getDoc(doc(firestore, 'users', f.id));
              outIds[f.id] = snap.exists();
            } catch { outIds[f.id] = false; }
          }
        } catch {}

        setRegisteredPhones(out);
        setRegisteredEmails(outEmail);
        setRegisteredIds(outIds);
      } catch {}
    })();
  }, [orderedAll, nameToDigits]);

  const isRegisteredUser = React.useCallback((f: { id: string; phone?: string; email?: string; name?: string }) => {
    // 1) 사용자 문서 존재
    if (registeredIds[f.id]) return true;
    // 2) 이메일 매칭
    if (f.email && registeredEmails[(f.email || '').trim().toLowerCase()]) return true;
    // 3) 전화번호 매칭(친구 객체의 phone 또는 연락처 동기화 이름→번호 매핑)
    const tryNumbers: string[] = [];
    if (f.phone) tryNumbers.push(normalizePhone(f.phone));
    const keyName = (f.name || '').trim().toLowerCase();
    if (keyName && nameToDigits[keyName]) tryNumbers.push(...nameToDigits[keyName]);
    for (const d of tryNumbers) { if (registeredPhones[d]) return true; }
    return false;
  }, [registeredEmails, registeredIds, registeredPhones, nameToDigits]);

  // 즐겨찾기 로드/저장
  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('friends.favorites');
        if (raw) setFavorites(JSON.parse(raw));
      } catch {}
    })();
  }, []);
  const toggleFavorite = async (id: string) => {
    const next = { ...favorites, [id]: !favorites[id] };
    setFavorites(next);
    try { await AsyncStorage.setItem('friends.favorites', JSON.stringify(next)); } catch {}
  };

  // 다중 선택
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = React.useState<'invite'|'chat'|null>(null);
  const toggleSelectInvite = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(selectMode === 'invite' ? prev : [] as any);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSelectMode('invite');
  };
  const toggleSelectChat = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(selectMode === 'chat' ? prev : [] as any);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSelectMode('chat');
  };
  const toggleSelectGeneric = (id: string) => {
    if (selectMode === 'chat') toggleSelectChat(id);
    else toggleSelectInvite(id);
  };
  const clearSelection = () => { setSelectedIds(new Set()); setSelectMode(null); };
  const handleInviteMany = () => {
    alert(`${selectedIds.size}명에게 초대 링크를 보냅니다.`);
    clearSelection();
  };
  const handleChatMany = () => {
    router.push('/chat/create-room');
    clearSelection();
  };

  // 액션: 초대/대화/삭제
  const handleInviteSend = (f: { id: string; name: string; phone?: string }) => {
    alert(`${f.name}에게 초대 링크를 보냈습니다.`);
  };
  const handleChatStart = async (f: { id: string; name: string }) => {
    try {
      const me = firebaseAuth.currentUser?.uid;
      if (!me) { try { await ensureAuthedUid(); } catch {} }
      const myId = firebaseAuth.currentUser?.uid || 'me';
      if (!f?.id || f.id === myId) { router.push('/chat/create-room'); return; }
      // 기존 DM 우선 → 없으면 생성(양쪽 멤버십 포함)
      const id = await (useKakaoRoomsStore as any).getState().getOrCreateDmRoom(myId, f.id);
      router.push({ pathname: '/chat/room/[id]', params: { id, type: 'dm' } });
    } catch { router.push('/chat/create-room'); }
  };
  const handleDelete = async (f: { id: string; status: string; phone?: string }) => {
    const uid = firebaseAuth.currentUser?.uid;
    // 0) 즉시 UI에서 제거 (낙관적 업데이트)
    setFriends((prev) => prev.filter((x) => {
      if (x.id === f.id) return false;
      if (f.phone && x.phone) {
        return normalizePhone(x.phone) !== normalizePhone(f.phone);
      }
      return true;
    }));
    // 즐겨찾기에서 제거
    setFavorites((cur) => {
      if (!cur[f.id]) return cur;
      const { [f.id]: _omit, ...rest } = cur;
      (async () => { try { await AsyncStorage.setItem('friends.favorites', JSON.stringify(rest)); } catch {} })();
      return rest;
    });

    // 로컬 캐시에서도 제거
    try {
      const key = 'local.friends';
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const nphone = f.phone ? normalizePhone(f.phone) : undefined;
      const filtered = list.filter((x) => {
        if (x.id === f.id) return false;
        if (nphone && x.phone) return normalizePhone(x.phone) !== nphone;
        return true;
      });
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    } catch {}

    if (!uid) return;
    try {
      if (f.id.startsWith('invite-')) {
        const inviteId = f.id.replace('invite-','');
        await deleteDoc(doc(firestore, 'invites', inviteId));
      } else {
        await deleteDoc(doc(firestore, 'users', uid, 'friends', f.id));
      }
    } catch {}
  };

  return (
    <>
      <ThemedView style={styles.container}>
        {/* 통일 상단바: 좌 60%(프로필), 우 40%(아이콘) - 로고 제거 */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) }]}>
          <View style={{ flexDirection:'row', alignItems:'center', flex: 6, minWidth: 0 }}>
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
                <View style={{ position:'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#0C0C0C', borderWidth: 2, borderColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 8 }}>
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
                   t('offline', language)}
                </ThemedText>
              </View>
            )}
          </View>

          <View style={[styles.headerIcons, { flex: 4, justifyContent: 'flex-end' }]}>
            <View style={{ position:'relative' }}>
              <TouchableOpacity 
                style={styles.headerIcon}
                onPress={() => setNotiOpen(v=>!v)}
              >
                <Text style={styles.iconText}>🔔</Text>
              </TouchableOpacity>
              {Number(unread||0) > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{Number(unread)>99?'99+':unread}</Text></View>
              )}
            </View>
            <TouchableOpacity 
              style={styles.headerIcon}
              onPress={() => router.push('/chat/friends')}
            >
              <Text style={styles.iconText}>👥</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerIcon}
              onPress={() => router.push('/chat/rooms')}
            >
              <Text style={styles.iconText}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerIcon}
              onPress={() => router.push('/chat/settings')}
            >
              <Text style={styles.iconText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 알림 패널 */}
        {notiOpen && (
          <View style={styles.notiPanel} pointerEvents="auto">
            <View style={styles.notiHeader}>
              <Text style={{ color:'#E0E0E0', fontWeight:'600', fontSize: 13 }}>{t('notes', language)}</Text>
              <View style={{ flex:1 }} />
              <TouchableOpacity onPress={() => { try { markAllAsRead(); } catch {} }} style={[styles.notiAction,{ borderColor:'#77DD77' }]}><Text style={[styles.notiActionText,{ color:'#77DD77', fontWeight:'600' }]}>{t('markAllAsRead', language)}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setNotiOpen(false)} style={[styles.notiAction,{ borderColor:'#AEC6CF' }]}><Text style={[styles.notiActionText,{ color:'#AEC6CF', fontWeight:'600' }]}>{t('close', language)}</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator persistentScrollbar>
              {(notifications || []).length === 0 ? (
                <View style={{ alignItems:'center', paddingVertical: 16 }}><Text style={{ color:'#8A8A8A', fontSize: 12, fontWeight: '400' }}>{t('noNewNotes', language)}</Text></View>
              ) : (
                notifications.map((n) => {
                  const titleName = (n as any).senderName || t('newMemo', language);
                  const ts = (n as any).timestamp ? new Date((n as any).timestamp).toLocaleTimeString(language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US',{hour:'2-digit',minute:'2-digit'}) : '';
                  const displayTitle = ts ? `${titleName} - ${ts}` : titleName;
                  const isExpanded = notiExpanded.has((n as any).id) || (n as any).isRead;
                  const saved = notiSavedIds.has((n as any).id);
                  return (
                    <View key={n.id} style={styles.notiItem}>
                      <TouchableOpacity onPress={() => setNotiExpanded(prev => { const next = new Set(prev); next.has((n as any).id) ? next.delete((n as any).id) : next.add((n as any).id); return next; })} style={{ flex: 1 }}>
                        <Text style={[styles.notiTitle,{ fontWeight:'600' }]} numberOfLines={1}>{displayTitle}</Text>
                        <Text style={[styles.notiContent,{ color:'#BDBDBD', fontSize:12 }]} numberOfLines={isExpanded ? undefined : 2}>{n.content}</Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection:'row', alignItems:'center', gap: 6 }}>
                        {!n.isRead && (
                          <TouchableOpacity onPress={() => { try { markAsRead(n.id); } catch {}; setNotiExpanded(prev => { const next = new Set(prev); next.add((n as any).id); return next; }); }} style={[styles.notiMiniBtn,{ borderColor:'#FFB3BA' }]}><Text style={[styles.notiMiniBtnText,{ color:'#FFB3BA', fontWeight:'600' }]}>{t('read', language)}</Text></TouchableOpacity>
                        )}
                        {!saved && (
                          <TouchableOpacity onPress={async () => {
                        try {
                          const uid = firebaseAuth.currentUser?.uid || 'anonymous';
                          const key = `u:${uid}:treasure.items`;
                          const raw = await AsyncStorage.getItem(key);
                          const list: any[] = raw ? JSON.parse(raw) : [];
                          const item = { type: (/^https?:\/\//i.test(String(n.content||''))) ? 'link' : 'text', text: `${n.title}\n${n.content}`.trim(), url: (/^https?:\/\//i.test(String(n.content||''))) ? String(n.content) : undefined, createdAt: Date.now() };
                          list.unshift(item);
                          await AsyncStorage.setItem(key, JSON.stringify(list));
                            setNotiSavedIds(prev => { const next = new Set(prev); next.add((n as any).id); return next; });
                        } catch {}
                        }} style={[styles.notiMiniBtn,{ borderColor:'#CFCFFF' }]}><Text style={[styles.notiMiniBtnText,{ color:'#CFCFFF', fontWeight:'600' }]}>{t('saveToTreasure', language)}</Text></TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => { try { deleteNotification(n.id); } catch {} }} style={[styles.notiMiniBtn,{ borderColor:'#E6E6FA' }]}><Text style={[styles.notiMiniBtnText,{ color:'#E6E6FA', fontWeight:'600' }]}>{t('delete', language)}</Text></TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {/* 친구추가 빠른 액션 */}
          <View style={styles.addRow}>
          <View style={styles.addItem}>
            <TouchableOpacity style={styles.addCircle} onPress={() => router.push('/chat/add-friend-qr')}>
              <MaterialIcons name="qr-code-2" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{t('qrCode', language)}</Text>
          </View>
          <View style={styles.addItem}>
            <TouchableOpacity style={styles.addCircle} onPress={() => router.push('/chat/add-friend-contacts')}>
              <MaterialIcons name="contacts" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{t('contacts', language)}</Text>
          </View>
          <View style={styles.addItem}>
            <TouchableOpacity style={styles.addCircle} onPress={() => router.push('/chat/add-friend-id')}>
              <MaterialIcons name="person-search" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{t('addById', language)}</Text>
          </View>
          <View style={styles.addItem}>
            <TouchableOpacity style={styles.addCircle} onPress={() => router.push('/chat/add-friend-recommended')}>
              <MaterialIcons name="stars" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{t('recommendedFriends', language)}</Text>
          </View>
          <View style={styles.addItem}>
            <TouchableOpacity style={styles.addCircle} onPress={() => router.push({ pathname: '/chat/search-rooms', params: { tab: 'friends' } as any })}>
              <MaterialIcons name="search" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{t('searchAction', language)}</Text>
          </View>
        </View>

        {/* 친구 리스트 섹션 */}
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
          {/* 내 프로필 */}
          {currentProfile && (
            <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
              <ThemedText style={{ color: '#CFCFCF', marginBottom: 6 }}>{t('myProfile', language)}</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  try {
                    const uid = firebaseAuth.currentUser?.uid || 'me';
                    router.push({ pathname: '/chat/friend-profile', params: { id: uid, name: currentProfile.displayName, avatar: currentProfile.avatar } as any });
                  } catch {}
                }}
                style={styles.friendItem}
              >
                <View style={styles.friendAvatar}>
                  {currentProfile.avatar ? (
                    <Image source={{ uri: currentProfile.avatar }} style={styles.friendAvatarImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(currentProfile.displayName||'?').charAt(0)}</Text></View>
                  )}
                </View>
                <View style={styles.friendInfo}>
                  <ThemedText style={styles.friendName}>{currentProfile.displayName}</ThemedText>
                  <ThemedText style={styles.friendStatus}>{currentProfile.customStatus || t('online', language)}</ThemedText>
                </View>
              </TouchableOpacity>
              <View style={{ flexDirection:'row', gap:8, marginTop:8 }}>
                <TouchableOpacity onPress={() => router.push('/chat/profile-settings')} style={[styles.actBtn, { borderColor:'#FFD700' }]}>
                  <Text style={styles.actText}>{t('settings', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/chat/profile-username')} style={[styles.actBtn, { borderColor:'#FFD700' }]}>
                  <Text style={styles.actText}>{t('userId', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 최근 추가(1시간) */}
          {recentAdded.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <ThemedText style={{ color: '#CFCFCF', marginBottom: 6 }}>{t('recentlyAdded', language)} ({recentAdded.length})</ThemedText>
                <TouchableOpacity onPress={() => setShowAllRecent(v => !v)}>
                  <ThemedText style={{ color:'#FFD700' }}>{showAllRecent ? t('hide', language) : t('more', language)}</ThemedText>
                </TouchableOpacity>
              </View>
              {(showAllRecent ? recentAdded : recentAdded.slice(0, 3)).map(f => (
                <View key={`recent-${f.id}`} style={[styles.friendItem, selectedIds.has(f.id) && styles.friendItemSelected]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <TouchableOpacity onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: f.id, name: displayName(f) } as any }); } catch {} }}>
                      <View style={styles.friendAvatar}><View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(f.name||'?').charAt(0)}</Text></View></View>
                    </TouchableOpacity>
                    <View style={styles.friendInfo}>
                      <ThemedText style={styles.friendName}>{displayName(f)}</ThemedText>
                      <ThemedText style={styles.friendStatus}>{''}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.actionsRow}>
                    {!favorites[f.id] && (
                      <TouchableOpacity onPress={() => toggleFavorite(f.id)} style={styles.starBtn}>
                        <Text style={styles.starWhite}>☆</Text>
                      </TouchableOpacity>
                    )}
                    {f.status !== 'linked' && (chatSettings.hideInviteForInstalled ? !isRegisteredUser(f) : true) && (
                      <TouchableOpacity onPress={() => toggleSelectInvite(f.id)} style={[styles.actBtn, selectMode==='invite' && selectedIds.has(f.id) && styles.actBtnActive]}><Text style={styles.actText}>{t('invite', language)}</Text></TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => toggleSelectChat(f.id)} style={[styles.actBtn, selectMode==='chat' && selectedIds.has(f.id) && styles.actBtnActive]}><Text style={styles.actText}>{t('chatAction', language)}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(f)} style={styles.actBtn}><Text style={styles.actText}>{t('delete', language)}</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 즐겨찾기 */}
              {favList.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ color: '#CFCFCF', marginBottom: 6 }}>{t('favoritesList', language)} ({favList.length})</ThemedText>
              {favList.map(f => (
                <View key={`fav-${f.id}`} style={[styles.friendItem, selectedIds.has(f.id) && styles.friendItemSelected]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <TouchableOpacity onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: f.id, name: displayName(f) } as any }); } catch {} }}>
                      <View style={styles.friendAvatar}><View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(f.name||'?').charAt(0)}</Text></View></View>
                    </TouchableOpacity>
                    <View style={styles.friendInfo}>
                      <ThemedText style={styles.friendName}>{displayName(f)}</ThemedText>
                      <ThemedText style={styles.friendStatus}>{''}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => toggleFavorite(f.id)} style={styles.starBtn}><Text style={styles.starGold}>★</Text></TouchableOpacity>
                    {f.status !== 'linked' && (chatSettings.hideInviteForInstalled ? !isRegisteredUser(f) : true) && (
                      <TouchableOpacity onPress={() => toggleSelectInvite(f.id)} style={[styles.actBtn, selectMode==='invite' && selectedIds.has(f.id) && styles.actBtnActive]}><Text style={styles.actText}>{t('invite', language)}</Text></TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => toggleSelectChat(f.id)} style={[styles.actBtn, selectMode==='chat' && selectedIds.has(f.id) && styles.actBtnActive]}><Text style={styles.actText}>{t('chatAction', language)}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(f)} style={styles.actBtn}><Text style={styles.actText}>{t('delete', language)}</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 전체 친구: 정렬만 적용, 그룹 라벨은 비표시 */}
          <View>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
              <ThemedText style={{ color: '#CFCFCF' }}>{t('allFriends', language)} ({friends.length})</ThemedText>
              {selectMode==='invite' && selectedIds.size > 0 && (
                <View style={{ flexDirection:'row', gap: 6 }}>
                  <TouchableOpacity style={styles.actBtn} onPress={() => handleInviteMany()}><Text style={styles.actText}>{`${t('invite', language)}(${selectedIds.size})`}</Text></TouchableOpacity>
                </View>
              )}
              {selectMode==='chat' && selectedIds.size > 0 && (
                <View style={{ flexDirection:'row', gap: 6 }}>
                  <TouchableOpacity style={styles.actBtn} onPress={() => handleChatMany()}><Text style={styles.actText}>{`${t('chatAction', language)}(${selectedIds.size})`}</Text></TouchableOpacity>
                </View>
              )}
            </View>
            {orderedAll.map(f => (
              <View key={f.id} style={[styles.friendItem, selectedIds.has(f.id) && styles.friendItemSelected]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <TouchableOpacity onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: f.id, name: displayName(f) } as any }); } catch {} }}>
                    <View style={styles.friendAvatar}><View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(f.name||'?').charAt(0)}</Text></View></View>
                  </TouchableOpacity>
                  <View style={styles.friendInfo}>
                    <ThemedText style={styles.friendName}>{displayName(f)}</ThemedText>
                    <ThemedText style={styles.friendStatus}>{''}</ThemedText>
                  </View>
                </View>
                <View style={styles.actionsRow}>
                  {!favorites[f.id] && (
                    <TouchableOpacity onPress={() => toggleFavorite(f.id)} style={styles.starBtn}>
                      <Text style={styles.starWhite}>☆</Text>
                    </TouchableOpacity>
                  )}
                  {f.status !== 'linked' && (chatSettings.hideInviteForInstalled ? !isRegisteredUser(f) : true) && (
                    <TouchableOpacity onPress={() => toggleSelectInvite(f.id)} style={[styles.actBtn, selectMode==='invite' && selectedIds.has(f.id) && styles.actBtnActive]}><Text style={styles.actText}>{t('invite', language)}</Text></TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => toggleSelectChat(f.id)} style={[styles.actBtn, selectMode==='chat' && selectedIds.has(f.id) && styles.actBtnActive]}><Text style={styles.actText}>{t('chatAction', language)}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(f)} style={styles.actBtn}><Text style={styles.actText}>{t('delete', language)}</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </ThemedView>
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
  profileButton: { width: 40, height: 40 },
  profileImage: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD700' },
  profileImagePlaceholder: { width: 36, height: 36, borderRadius: 18 },
  profileText: { fontSize: 20 },
  profilePreview: { marginLeft: 8, flex: 1, justifyContent: 'center' },
  profilePreviewName: { fontSize: 16, fontWeight: 'bold', color: '#F6F6F6', marginBottom: 2 },
  profilePreviewStatus: { fontSize: 12, color: '#B8B8B8' },
  logoContainer: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 20 },
  logoImage: { width: 62, height: 62 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 0 },
  iconText: { fontSize: 18 },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#0C0C0C', fontSize: 9, fontWeight: '800' },
  notiPanel: { position:'absolute', left: 12, right: 12, top: 64, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#FFFFFF', borderRadius:12, zIndex: 9999, padding: 10 },
  notiHeader: { flexDirection:'row', alignItems:'center', marginBottom: 8 },
  notiAction: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth:1, borderColor:'#FFD700', marginLeft: 6 },
  notiActionText: { color:'#FFD700', fontWeight:'800' },
  notiItem: { flexDirection:'row', alignItems:'center', gap: 8, borderWidth:1, borderColor:'#1E1E1E', borderRadius: 10, padding: 8, marginBottom: 8, backgroundColor:'#101010' },
  notiTitle: { color:'#F6F6F6', fontWeight:'700' },
  notiContent: { color:'#CFCFCF', fontSize: 12, marginTop: 2 },
  notiMiniBtn: { paddingHorizontal: 8, paddingVertical: 6, borderWidth:1, borderColor:'#FFD700', borderRadius: 8 },
  notiMiniBtnText: { color:'#FFD700', fontSize: 12, fontWeight:'700' },
  list: { flex: 1 },
  friendItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 10, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  friendAvatarImg: { width: 44, height: 44 },
  friendAvatarFallback: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  friendAvatarText: { color: '#D4AF37', fontWeight: '700' },
  friendInfo: { flex: 1 },
  friendName: { color: '#F6F6F6', fontSize: 15, fontWeight: '700' },
  friendStatus: { color: '#9BA1A6', fontSize: 12, marginTop: 2 },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD700' },
  addBtnText: { color: '#0C0C0C', fontWeight: '900', fontSize: 20, lineHeight: 20 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actBtn: { minWidth: 40, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414', paddingHorizontal: 6 },
  actText: { color: '#CFCFCF', fontSize: 12 },
  selectBtn: { minWidth: 48, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1A', paddingHorizontal: 6 },
  selectBtnActive: { backgroundColor: '#2A2A2A' },
  actBtnActive: { borderColor: '#FFD700' },
  starBtn: { minWidth: 28, height: 28, alignItems:'center', justifyContent:'center', backgroundColor:'transparent' },
  starGold: { color: '#FFD700', fontSize: 14 },
  starWhite: { color: '#FFFFFF', fontSize: 14 },
});




