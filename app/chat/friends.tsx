import ChatBottomBar from '@/components/ChatBottomBar';
// Revert: use local header in friends
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { firebaseAuth, firestore, ensureAuthedUid, firebaseStorage } from '@/lib/firebase';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, where, limit, getDocs } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, usePathname } from 'expo-router';
import * as SMS from 'expo-sms';
import { Linking, Platform } from 'react-native';
import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Alert, Keyboard, Share } from 'react-native';
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
        const uid = firebaseAuth.currentUser?.uid || 'me';
        const last = await AsyncStorage.getItem(`u:${uid}:chat.profile.lastAvatar`);
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
  const [friends, setFriends] = React.useState<{ id: string; uid?: string; name: string; status: string; phone?: string; email?: string; addedAt?: number }[]>([]);
  // 전역 채팅 프로필(아바타/대화명)도 함께 참고하여 친구 아바타를 보완 표시
  const globalProfiles = useChatProfileStore((s:any) => s.profiles || {});
  const [favorites, setFavorites] = React.useState<Record<string, boolean>>({});
  const [contactNameByPhone, setContactNameByPhone] = React.useState<Record<string, string>>({});
  const [registeredPhones, setRegisteredPhones] = React.useState<Record<string, boolean>>({});
  const [registeredEmails, setRegisteredEmails] = React.useState<Record<string, boolean>>({});
  const [registeredIds, setRegisteredIds] = React.useState<Record<string, boolean>>({});
  const [nameToDigits, setNameToDigits] = React.useState<Record<string, string[]>>({});
  const [friendProfiles, setFriendProfiles] = React.useState<Record<string, { displayName?: string; username?: string; chatName?: string; customStatus?: string; avatar?: string }>>({});
  const [editingUserId, setEditingUserId] = React.useState(false);
  const [userIdInput, setUserIdInput] = React.useState('');

  const normalizePhone = (v?: string) => (v || '').replace(/\D/g, '');
  // 로그인 상태가 초기 렌더에 바로 준비되지 않을 수 있어 uid를 상태로 추적(로그인 후 친구 구독이 누락되는 문제 방지)
  const [authedUid, setAuthedUid] = React.useState<string | null>(() => firebaseAuth.currentUser?.uid || null);
  React.useEffect(() => {
    try {
      const { onAuthStateChanged } = require('firebase/auth');
      const unsub = onAuthStateChanged(firebaseAuth, (u: any) => {
        try { setAuthedUid(u?.uid ? String(u.uid) : null); } catch { setAuthedUid(null); }
      });
      return () => { try { unsub?.(); } catch {} };
    } catch {
      // fallback: no-op
      return () => {};
    }
  }, []);

  const inviteStoreUrl = React.useMemo(() => {
    // 스토어 링크는 "최신 버전"을 강제 지정할 수는 없고, 항상 스토어의 현재 최신 배포본으로 유도하는 링크를 사용한다.
    // (직접 APK/AAB 링크를 보내면 캐시/파일로 인해 "이전 버전"처럼 보일 수 있음)
    const androidId = String(process.env.EXPO_PUBLIC_ANDROID_PACKAGE_ID || 'com.yooyland.wallet');
    const iosUrl = String(process.env.EXPO_PUBLIC_IOS_APPSTORE_URL || '').trim();
    const play = `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidId)}&referrer=${encodeURIComponent('utm_source=invite&utm_medium=share&utm_campaign=yooyland_invite')}`;
    if (Platform.OS === 'ios' && iosUrl) return iosUrl;
    return play;
  }, []);
  // ===== 연락처 선택 팝업(앱 친구 추가) =====
  type ContactRow = { id: string; name: string; phones: string[]; emails: string[] };
  const [contactsOpen, setContactsOpen] = React.useState(false);
  const [contactsLoading, setContactsLoading] = React.useState(false);
  const [contactsError, setContactsError] = React.useState<string | null>(null);
  const [contactsAll, setContactsAll] = React.useState<ContactRow[]>([]);
  const [contactsProgress, setContactsProgress] = React.useState<number>(0); // 0~1 진행률(대략, 시간+실제 로딩 혼합)
  const [contactsQuery, setContactsQuery] = React.useState('');
  const [contactsSelected, setContactsSelected] = React.useState<Set<string>>(new Set());
  const [contactsShowCount, setContactsShowCount] = React.useState(300);
  // 수동 입력으로 앱 친구 추가(핸드폰 저장 아님)
  const [manualAddOpen, setManualAddOpen] = React.useState(false);
  const [manualName, setManualName] = React.useState('');
  const [manualPhone, setManualPhone] = React.useState('');
  const [manualEmail, setManualEmail] = React.useState('');
  const openContactsModal = React.useCallback(() => {
    setContactsOpen(true);
    setContactsShowCount(300);
  }, []);
  const closeContactsModal = React.useCallback(() => {
    setContactsOpen(false);
    setContactsQuery('');
    setContactsSelected(new Set());
    setContactsError(null);
  }, []);
  const toggleContactSelect = React.useCallback((id: string) => {
    setContactsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAllFiltered = React.useCallback((ids: string[]) => {
    setContactsSelected(new Set(ids));
  }, []);
  const invertFiltered = React.useCallback((ids: string[]) => {
    setContactsSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, []);
  const clearAllSelected = React.useCallback(() => setContactsSelected(new Set()), []);
  const [nameOverrides, setNameOverrides] = React.useState<Record<string,string>>({});
  React.useEffect(() => {
    (async () => {
      try { const uid = firebaseAuth.currentUser?.uid || 'me'; const raw = await AsyncStorage.getItem(`u:${uid}:friends.nameOverrides`); setNameOverrides(raw ? JSON.parse(raw) : {}); } catch {}
    })();
  }, []);
  useFocusEffect(React.useCallback(() => {
    (async () => {
      try { const uid = firebaseAuth.currentUser?.uid || 'me'; const raw = await AsyncStorage.getItem(`u:${uid}:friends.nameOverrides`); setNameOverrides(raw ? JSON.parse(raw) : {}); } catch {}
    })();
    return () => {};
  }, []));

  // [핸드폰 동기화] 한 번에 연락처를 친구 목록(로컬)에 추가
  const syncContactsQuick = React.useCallback(async () => {
    let Contacts: any = null;
    try { Contacts = require('expo-contacts'); } catch { Contacts = null; }
    if (!Contacts) { alert('연락처 기능(expo-contacts)이 필요합니다.'); return; }
    try {
      const myUid = firebaseAuth.currentUser?.uid || 'me';
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') { alert('연락처 접근 권한이 필요합니다.'); return; }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], sort: 'firstName' });
      const pairs: Array<{ name: string; digits: string }> = (data || []).map((c: any) => {
        const name = [c.name, c.firstName, c.lastName].filter(Boolean)[0] || '이름없음';
        const num = c.phoneNumbers?.[0]?.number ?? '';
        return { name, digits: normalizePhone(num) };
      }).filter(x => x.digits);
      // 캐시 저장
      try {
        const cached = pairs.map((p, i) => ({ id: String(i+1), name: p.name, phone: `+${p.digits}` }));
        await AsyncStorage.setItem('contacts.cached', JSON.stringify(cached));
      } catch {}
      // 로컬 친구 병합 (사용자별 네임스페이스)
      const key = `u:${firebaseAuth.currentUser?.uid || 'me'}:local.friends`;
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const seen = new Set<string>(list.map(x => String(x.phone||'').replace(/\D/g,'')));
      let added = 0;
      const now = Date.now();
      // 연락처 이름 → 번호 매핑으로 대화명 동기화 준비
      const contactNameByDigits: Record<string,string> = {};
      for (let i = 0; i < pairs.length; i++) {
        const { name, digits } = pairs[i];
        if (digits) contactNameByDigits[digits] = name;
        if (!digits || seen.has(digits)) continue;
        list.unshift({ id: `local-${now}-${i}`, name, phone: `+${digits}`, status: 'invited', addedAt: now + i });
        seen.add(digits);
        added++;
        if ((i % 50) === 0) {
          await AsyncStorage.setItem(key, JSON.stringify(list));
          await new Promise(r => setTimeout(r, 1));
        }
      }
      await AsyncStorage.setItem(key, JSON.stringify(list));
      // 내 친구 목록에 전화번호가 있는 항목의 대화명을 연락처 이름으로 로컬 오버라이드 저장
      try {
        const overrideKey = `u:${myUid}:friends.nameOverrides`;
        const rawOver = await AsyncStorage.getItem(overrideKey);
        const overrides: Record<string,string> = rawOver ? JSON.parse(rawOver) : {};
        (friends || []).forEach(f => {
          const digits = f.phone ? normalizePhone(f.phone) : '';
          const cn = digits ? contactNameByDigits[digits] : undefined;
          const cnSafe = String(cn || '');
          if (cnSafe.trim()) {
            overrides[f.id] = cnSafe.trim();
          }
        });
        await AsyncStorage.setItem(overrideKey, JSON.stringify(overrides));
        setNameOverrides(overrides);
      } catch {}
      alert(`핸드폰 연락처 동기화 완료: ${added}명 추가`);
      try { router.push('/chat/friends?t=' + Date.now()); } catch {}
    } catch {
      alert('연락처 동기화 중 오류가 발생했습니다.');
    }
  }, []);

  // 연락처 팝업: 기기 연락처를 읽어서 목록으로 보여주기 (추가/동기화는 "앱 친구"에만 반영)
  React.useEffect(() => {
    if (!contactsOpen) return;
    // 이미 한번 불러온 연락처가 있으면 OS 연락처를 다시 전체 조회하지 않는다(대용량 주소록에서 반복 로딩 지연 방지)
    if (contactsAll && contactsAll.length > 0) {
      setContactsShowCount(300);
      return;
    }
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      setContactsError(null);
      // 새로 열릴 때는 아주 조금만 채워둔 상태에서 시작 (0%가 아닌 5% 정도)
      setContactsProgress(0.05);
      try {
        let Contacts: any = null;
        try { Contacts = require('expo-contacts'); } catch { Contacts = null; }
        if (!Contacts) throw new Error('expo-contacts 필요');
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') throw new Error('연락처 접근 권한 필요');
        // 페이지네이션을 모두 따라가서 기기 연락처 전체를 불러온다.
        let all: any[] = [];
        let pageOffset = 0;
        let hasNextPage = true;
        let pageCount = 0;
        while (hasNextPage) {
          const { data, hasNextPage: more, pageOffset: nextOffset } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
            sort: 'firstName',
            pageSize: 1000,
            pageOffset,
          });
          all = all.concat(data || []);
          hasNextPage = !!more;
          pageOffset = nextOffset || 0;
          pageCount += 1;
          // 페이지 단위로 "최소 진행 보장"만 살짝 올려준다(시간 기반 진행과 겹치지 않게 70% 이하까지만)
          if (!cancelled) {
            setContactsProgress((prev) => {
              const byPage = pageCount * 0.15; // 페이지 수에 따라 최대 0.75 근처까지
              const target = Math.min(0.75, byPage);
              return prev < target ? target : prev;
            });
          }
          if (!more) break;
        }
        const rows: ContactRow[] = (all || []).map((c: any) => {
          const name = String([c.name, c.firstName, c.lastName].filter(Boolean)[0] || '이름없음');
          const phones = Array.isArray(c.phoneNumbers) ? c.phoneNumbers.map((p: any) => normalizePhone(p?.number || '')).filter(Boolean) : [];
          const emails = Array.isArray(c.emails) ? c.emails.map((e: any) => String(e?.email || '').trim().toLowerCase()).filter(Boolean) : [];
          return { id: String(c.id || `${name}-${phones[0] || emails[0] || Math.random()}`), name, phones: Array.from(new Set(phones)), emails: Array.from(new Set(emails)) };
        }).filter((r) => r.phones.length > 0 || r.emails.length > 0);
        if (!cancelled) setContactsProgress(1);
        // 캐시(검색/표시용)
        try {
          const cached = rows.map((r) => ({ id: r.id, name: r.name, phone: r.phones[0] ? `+${r.phones[0]}` : null }));
          await AsyncStorage.setItem('contacts.cached', JSON.stringify(cached));
        } catch {}
        if (cancelled) return;
        setContactsAll(rows);
        setContactsShowCount(300);
      } catch (e: any) {
        if (!cancelled) setContactsError(String(e?.message || e || '연락처 로드 실패'));
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contactsOpen]);

  // 진행바가 중간에서 멈춘 것처럼 보이지 않도록,
  // 로딩 중에는 일정 간격으로 조금씩 전진시키는 타임 기반 보정.
  React.useEffect(() => {
    if (!contactsLoading) {
      // 로딩이 끝나면 100%로 고정
      setContactsProgress((prev) => (prev < 1 ? 1 : prev));
      return;
    }
    let cancelled = false;
    const id = setInterval(() => {
      if (cancelled) return;
      setContactsProgress((prev) => {
        // 실제 로딩에서 이미 90% 이상이면 더 건드리지 않는다.
        if (prev >= 0.9) return prev;
        // 0.02씩 살짝 전진 (약간의 흔들림 느낌)
        const next = prev + 0.02;
        return next > 0.9 ? 0.9 : next;
      });
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [contactsLoading]);

  const contactsFiltered = React.useMemo(() => {
    const q = String(contactsQuery || '').trim().toLowerCase();
    const list = Array.isArray(contactsAll) ? contactsAll : [];
    if (!q) return list;
    return list.filter((c) => {
      const name = String(c.name || '').toLowerCase();
      const phone = (c.phones || []).join('');
      const email = (c.emails || []).join(' ');
      return name.includes(q) || phone.includes(q.replace(/\D/g,'')) || email.includes(q);
    });
  }, [contactsAll, contactsQuery]);

  const addSelectedContactsToAppFriends = React.useCallback(async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      const key = `u:${uid}:local.friends`;
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const seenPhones = new Set<string>(list.map(x => String(x.phone || '').replace(/\D/g,'')));
      const now = Date.now();
      const selectedIds = new Set(contactsSelected);
      const selectedRows = contactsFiltered.filter((c) => selectedIds.has(c.id));
      let added = 0;
      for (let i = 0; i < selectedRows.length; i++) {
        const c = selectedRows[i];
        const digits = String((c.phones && c.phones[0]) || '').replace(/\D/g,'');
        const email = String((c.emails && c.emails[0]) || '').trim().toLowerCase();
        // 전화번호가 있으면 전화번호 기준으로 중복 방지
        if (digits) {
          if (seenPhones.has(digits)) continue;
          list.unshift({ id: `local-${now}-${i}`, name: c.name, phone: `+${digits}`, email: email || undefined, status: 'invited', addedAt: now + i });
          seenPhones.add(digits);
          added++;
        } else if (email) {
          // 이메일만 있는 경우: id 기준 중복 방지
          const exists = list.some((x) => String(x.email || '').toLowerCase() === email);
          if (exists) continue;
          list.unshift({ id: `local-${now}-${i}`, name: c.name, email, status: 'invited', addedAt: now + i });
          added++;
        }
      }
      await AsyncStorage.setItem(key, JSON.stringify(list));
      // UI 반영: 로컬 캐시 기준으로 재구성(가벼운 set)
      try {
        setFriends(() => {
          const byPhone = new Map<string, any>();
          const addEntry = (e: any) => {
            const k = e.phone ? normalizePhone(e.phone) : undefined;
            if (k) byPhone.set(k, e);
            else byPhone.set(e.id, e);
          };
          list.forEach(addEntry);
          return Array.from(byPhone.values());
        });
      } catch {}
      Alert.alert('완료', `선택한 연락처 ${added}명을 친구 목록에 추가했습니다.`);
      closeContactsModal();
    } catch {
      Alert.alert('오류', '연락처 동기화에 실패했습니다.');
    }
  }, [contactsSelected, contactsFiltered, closeContactsModal]);

  // FlatList renderItem 최적화: useCallback으로 추출
  const renderContactItem = useCallback(({ item }: { item: { id: string; name: string; phones?: string[]; emails?: string[] } }) => {
    const sel = contactsSelected.has(item.id);
    const phone = item.phones?.[0] ? `+${item.phones[0]}` : '';
    const email = item.emails?.[0] ? item.emails[0] : '';
    const alreadyFriend = isRegisteredUser({ id: item.id, name: item.name, phone, email });
    return (
      <TouchableOpacity
        onPress={() => toggleContactSelect(item.id)}
        activeOpacity={0.75}
        style={{ flexDirection:'row', alignItems:'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#141414' }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: sel ? '#FFD700' : '#555', alignItems:'center', justifyContent:'center', marginRight: 10, backgroundColor: sel ? 'rgba(255,215,0,0.12)' : 'transparent' }}>
          <Text style={{ color: sel ? '#FFD700' : '#666', fontWeight:'800' }}>{sel ? '✓' : ''}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color:'#EDEDED', fontWeight:'700' }}>{item.name}</Text>
          <Text numberOfLines={1} style={{ color:'#9E9E9E', fontSize: 12 }}>{[phone, email].filter(Boolean).join('  ·  ')}</Text>
        </View>
        <TouchableOpacity
          disabled={alreadyFriend}
          onPress={() => {
            if (alreadyFriend) return;
            setContactsSelected(new Set([item.id]));
            setTimeout(()=>addSelectedContactsToAppFriends(), 0);
          }}
          style={[
            styles.actBtn,
            { paddingHorizontal: 10, borderColor: alreadyFriend ? '#444' : styles.actBtn.borderColor },
          ]}
        >
          <Text style={[styles.actText, alreadyFriend && { color: '#777' }]}>
            {alreadyFriend ? '추가됨' : '추가'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [contactsSelected, isRegisteredUser, toggleContactSelect, addSelectedContactsToAppFriends]);

  const addManualToAppFriends = React.useCallback(async () => {
    try {
      const name = String(manualName || '').trim();
      const digits = normalizePhone(manualPhone || '');
      const email = String(manualEmail || '').trim().toLowerCase();
      if (!name && !digits && !email) {
        Alert.alert('안내', '이름/전화번호/이메일 중 하나는 입력해 주세요.');
        return;
      }
      const uid = firebaseAuth.currentUser?.uid || 'me';
      const key = `u:${uid}:local.friends`;
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      if (digits) {
        const exists = list.some((x) => normalizePhone(x.phone || '') === digits);
        if (exists) { Alert.alert('안내', '이미 친구 목록에 있는 전화번호입니다.'); return; }
      }
      if (email) {
        const exists = list.some((x) => String(x.email || '').toLowerCase() === email);
        if (exists) { Alert.alert('안내', '이미 친구 목록에 있는 이메일입니다.'); return; }
      }
      list.unshift({
        id: `manual-${now}`,
        name: name || (digits ? `+${digits}` : email),
        phone: digits ? `+${digits}` : undefined,
        email: email || undefined,
        status: 'invited',
        addedAt: now,
      });
      await AsyncStorage.setItem(key, JSON.stringify(list));
      setFriends(() => {
        const byPhone = new Map<string, any>();
        const addEntry = (e: any) => {
          const k = e.phone ? normalizePhone(e.phone) : undefined;
          if (k) byPhone.set(k, e);
          else byPhone.set(e.id, e);
        };
        list.forEach(addEntry);
        return Array.from(byPhone.values());
      });
      setManualAddOpen(false);
      setManualName(''); setManualPhone(''); setManualEmail('');
      Alert.alert('완료', '친구 목록에 추가했습니다.');
    } catch {
      Alert.alert('오류', '추가에 실패했습니다.');
    }
  }, [manualName, manualPhone, manualEmail]);
  const displayName = React.useCallback((f: { id: string; uid?: string; name?: string; phone?: string }) => {
    const o = nameOverrides[f.id];
    if (String(o || '').trim()) return String(o).trim();
    const key = f.uid || f.id;
    const prof = friendProfiles[key];
    {
      const v = String(prof?.chatName ?? '');
      if (v.trim()) return v;
    }
    {
      const v = String(prof?.displayName ?? '');
      if (v.trim()) return v;
    }
    if (prof?.username && String(prof.username).trim()) return String(prof.username);
    return String(f.name || f.phone || f.id || '');
  }, [nameOverrides, friendProfiles]);
  const mapName = (row: { id: string; uid?: string; name?: string; phone?: string }): string => {
    // 1) 사용자가 저장한 로컬 오버라이드 우선
    const override = nameOverrides[row.id];
    if (String(override || '').trim()) return String(override).trim();
    // 2) 기본(서버/로컬 캐시)
    const base = String(row.name || '');
    if (base && !/^\+?\d+$/.test(base)) return base;
    // 3) 연락처 동기화 이름 매핑
    const ph = String(row.phone || '');
    const dn = ph ? contactNameByPhone[normalizePhone(ph)] || contactNameByPhone['+'+normalizePhone(ph)] : undefined;
    return String(dn || base || ph || row.id || '');
  };

  React.useEffect(() => {
    const uid = authedUid;
    // 1) 로컬 캐시 우선 표시
    (async () => {
      try {
        const uidCur = uid || 'me';
        const raw = await AsyncStorage.getItem(`u:${uidCur}:local.friends`);
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
          // 대량 연락처(수천 명)에서도 진입 시 멈추지 않도록,
          // 이전 friends 상태(prev)를 병합하지 않고 로컬 캐시 한 번만 기준으로 정리합니다.
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
            arr.forEach((x) => {
              const nk = String(x.name || '').trim().toLowerCase();
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
    // 로그인된 경우에만 실시간 구독 시작 (익명 자동로그인으로 세션 오염 방지)
    const friendsRef = collection(firestore, 'users', uid, 'friends');
    const startFriendsSub = async () => {
      if (!firebaseAuth.currentUser?.uid) {
        // 로그인 상태가 아니면 구독을 건너뜀
        return () => {};
      }
      return onSnapshot(query(friendsRef, orderBy('createdAt', 'desc')), (snap) => {
      const rows = snap.docs.map((d) => {
        const data: any = d.data() || {};
        const uid = data.userId || d.id; // 우선 userId 사용, 없으면 문서ID
        return {
          id: d.id,
          uid,
          name: mapName({ id: d.id, uid, name: data.chatName || data.displayName || undefined, phone: data.phone || undefined }),
          status: data.status || 'linked',
          phone: data.phone || undefined,
          email: (data.email || '').toLowerCase() || undefined,
        };
      });
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
      if (!firebaseAuth.currentUser?.uid) {
        // 로그인 상태가 아니면 구독 생략
        return () => {};
      }
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
  }, [authedUid]);

  // 친구 프로필(대화명/아바타) 로드
  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        // uid, email, id 모두 후보로 사용하여 프로필을 찾는다.
        const ids = Array.from(
          new Set(
            (friends || [])
              .flatMap(f => [f.uid, f.email, f.id])
              .filter(id => id && !String(id).startsWith('invite-'))
          )
        );
        const out: Record<string, { displayName?: string; username?: string; chatName?: string; customStatus?: string; avatar?: string }> = {};
        for (const id of ids) {
          try {
            // 1차: 문서 ID 로 조회 (uid 인 경우)
            let snap = await getDoc(doc(firestore, 'users', id));
            let docId = id;
            // 2차: username 또는 email 로 조회
            // - 문서가 아예 없거나
            // - 존재하지만 displayName/chatName/username/email/avatar 어느 것도 없는 "빈 문서"인 경우
            let needsFallback = false;
            if (!snap.exists()) {
              needsFallback = true;
            } else {
              const dTmp = snap.data() as any;
              if (
                !dTmp?.displayName &&
                !dTmp?.chatName &&
                !dTmp?.username &&
                !dTmp?.email &&
                !dTmp?.avatar &&
                !dTmp?.avatarUrl &&
                !dTmp?.photoURL
              ) {
                needsFallback = true;
              }
            }
            if (needsFallback) {
              // email 형태면 email 로, 아니면 usernameLower 로 검색
              if (/@/.test(id)) {
                const qy = query(collection(firestore, 'users'), where('email', '==', id), limit(1));
                const qs = await getDocs(qy);
                if (!qs.empty) {
                  snap = qs.docs[0];
                  docId = qs.docs[0].id;
                }
              } else {
                const lower = String(id || '').toLowerCase();
                const qy = query(collection(firestore, 'users'), where('usernameLower', '==', lower), limit(1));
                const qs = await getDocs(qy);
                if (!qs.empty) {
                  snap = qs.docs[0];
                  docId = qs.docs[0].id;
                }
              }
            }
            if (snap.exists()) {
              const d = snap.data() as any;
              let avatar: string | undefined = d.avatarUrl || d.photoURL || d.avatar || undefined;
              // Storage 경로(예: users/... 또는 gs://...)일 경우 즉시 다운로드 URL로 변환 시도
              try {
                if (avatar && !/^https?:\/\//i.test(String(avatar)) && !/^data:/i.test(String(avatar))) {
                  const r = storageRef(firebaseStorage, String(avatar));
                  avatar = await getDownloadURL(r);
                }
              } catch {}
              const basis = d.chatName || d.displayName || d.username || d.email || docId;
              const profile = { displayName: d.displayName, username: d.username, chatName: d.chatName, customStatus: d.customStatus, avatar };
              // uid 기준으로 friendProfiles/globalProfiles 를 채우고,
              // 예전 데이터(id 가 userId/이메일인 경우)를 위해 원래 id 키에도 같은 프로필을 매핑
              out[docId] = profile;
              if (docId !== id) out[id] = profile;
              try {
                useChatProfileStore.setState((s:any) => ({
                  profiles: {
                    ...(s?.profiles || {}),
                    [docId]: {
                      ...(s?.profiles?.[docId] || {
                        id: `chat_profile_${docId}`,
                        userId: docId,
                        displayName: d.displayName || basis,
                        status: 'online',
                        createdAt: Date.now(),
                        lastActive: Date.now(),
                      }),
                      chatName: d.chatName || d.displayName || basis,
                      avatar,
                    },
                  },
                }));
              } catch {}
            }
          } catch {}
        }
        if (live) setFriendProfiles(prev => ({ ...prev, ...out }));
      } catch {}
    })();
    const t = setInterval(async () => {
      try {
        // uid, email, id 모두 감시 대상으로 삼아, 어떤 방식으로 저장된 친구라도 프로필을 실시간으로 가져온다.
        const ids = Array.from(
          new Set(
            (friends || [])
              .flatMap(f => [f.uid, f.email, f.id])
              .filter(id => id && !String(id).startsWith('invite-'))
          )
        );
        const out: Record<string, { displayName?: string; username?: string; chatName?: string; customStatus?: string; avatar?: string }> = {};
        for (const id of ids) {
          try {
            let snap = await getDoc(doc(firestore, 'users', id));
            let docId = id;
            let needsFallback = false;
            if (!snap.exists()) {
              needsFallback = true;
            } else {
              const dTmp = snap.data() as any;
              if (
                !dTmp?.displayName &&
                !dTmp?.chatName &&
                !dTmp?.username &&
                !dTmp?.email &&
                !dTmp?.avatar &&
                !dTmp?.avatarUrl &&
                !dTmp?.photoURL
              ) {
                needsFallback = true;
              }
            }
            if (needsFallback) {
              if (/@/.test(id)) {
                const qy = query(collection(firestore, 'users'), where('email','==', id), limit(1));
                const qs = await getDocs(qy);
                if (!qs.empty) { snap = qs.docs[0]; docId = qs.docs[0].id; }
              } else {
                const lower = String(id || '').toLowerCase();
                const qy = query(collection(firestore, 'users'), where('usernameLower','==', lower), limit(1));
                const qs = await getDocs(qy);
                if (!qs.empty) { snap = qs.docs[0]; docId = qs.docs[0].id; }
              }
            }
            if (snap.exists()) {
              const d = snap.data() as any;
              let avatar: string | undefined = d.avatarUrl || d.photoURL || d.avatar || undefined;
              try {
                if (avatar && !/^https?:\/\//i.test(String(avatar))) {
                  const r = storageRef(firebaseStorage, String(avatar));
                  avatar = await getDownloadURL(r);
                }
              } catch {}
              const basis = d.chatName || d.displayName || d.username || d.email || docId;
              if (!avatar) {
                avatar = uiAvatar(String(basis));
              }
              const profile = { displayName: d.displayName, username: d.username, chatName: d.chatName, customStatus: d.customStatus, avatar };
              out[docId] = profile;
              if (docId !== id) out[id] = profile;
              try {
                useChatProfileStore.setState((s:any) => ({
                  profiles: {
                    ...(s?.profiles || {}),
                    [docId]: {
                      ...(s?.profiles?.[docId] || {
                        id: `chat_profile_${docId}`,
                        userId: docId,
                        displayName: d.displayName || basis,
                        status: 'online',
                        createdAt: Date.now(),
                        lastActive: Date.now(),
                      }),
                      chatName: d.chatName || d.displayName || basis,
                      avatar,
                    },
                  },
                }));
              } catch {}
            }
          } catch {}
        }
        setFriendProfiles(prev => ({ ...prev, ...out }));
      } catch {}
    }, 60000);
    return () => { live = false; clearInterval(t); };
  }, [friends]);

  // 친구 프로필 실시간 구독(onSnapshot)으로 즉시 반영
  const profileSubsRef = React.useRef<Record<string, () => void>>({});
  React.useEffect(() => {
    const ids = Array.from(new Set((friends || []).map(f => (f.uid || f.id)).filter(id => id && !String(id).startsWith('invite-'))));
    // 신규 구독
    ids.forEach((id) => {
      if (profileSubsRef.current[id]) return;
      try {
        const unsub = onSnapshot(doc(firestore, 'users', id), (snap) => {
          (async () => {
            try {
              if (!snap.exists()) return;
              const d: any = snap.data() || {};
              let avatarRaw: string | undefined = d.avatarUrl || d.photoURL || d.avatar || undefined;
              const basis = d.chatName || d.displayName || d.username || d.email || id;
              // avatarRaw가 Storage 경로이면 즉시 다운로드 URL로 변환 시도
              let finalAvatar: string | undefined = undefined;
              if (avatarRaw) {
                if (/^https?:\/\//i.test(String(avatarRaw)) || /^data:/i.test(String(avatarRaw))) {
                  finalAvatar = String(avatarRaw);
                } else {
                  try {
                    const r = storageRef(firebaseStorage, String(avatarRaw));
                    finalAvatar = await getDownloadURL(r);
                  } catch {
                    finalAvatar = undefined;
                  }
                }
              }
              setFriendProfiles((prev) => ({
                ...prev,
                [id]: {
                  displayName: d.displayName,
                  username: d.username,
                  chatName: d.chatName,
                  customStatus: d.customStatus,
                  avatar: finalAvatar || prev[id]?.avatar, // 가능하면 기존 URL 유지
                },
              }));
              // 전역 채팅 프로필에도 반영
              try {
                useChatProfileStore.setState((s:any) => ({
                  profiles: {
                    ...(s?.profiles || {}),
                    [id]: {
                      ...(s?.profiles?.[id] || {
                        id: `chat_profile_${id}`,
                        userId: id,
                        displayName: d.displayName || basis,
                        status: 'online',
                        createdAt: Date.now(),
                        lastActive: Date.now(),
                      }),
                      chatName: d.chatName || d.displayName || basis,
                      avatar: finalAvatar || s?.profiles?.[id]?.avatar,
                    },
                  },
                }));
              } catch {}
            } catch {}
          })();
        }, () => {});
        // 이메일 키일 경우: email로 보조 구독
        let unsubEmail: undefined | (() => void);
        if (/@/.test(id)) {
          const qy = query(collection(firestore, 'users'), where('email','==', id), limit(1));
          unsubEmail = onSnapshot(qy, (qs) => {
            (async () => {
              try {
                if (qs.empty) return;
                const d: any = qs.docs[0].data() || {};
                const uid = String(qs.docs[0].id || id);
                let avatarRaw: string | undefined = d.avatarUrl || d.photoURL || d.avatar || undefined;
                const basis = d.chatName || d.displayName || d.username || d.email || id;
                let finalAvatar: string | undefined = undefined;
                if (avatarRaw) {
                  if (/^https?:\/\//i.test(String(avatarRaw)) || /^data:/i.test(String(avatarRaw))) {
                    finalAvatar = String(avatarRaw);
                  } else {
                    try {
                      const r = storageRef(firebaseStorage, String(avatarRaw));
                      finalAvatar = await getDownloadURL(r);
                    } catch {
                      finalAvatar = undefined;
                    }
                  }
                }
                const profile = {
                  displayName: d.displayName,
                  username: d.username,
                  chatName: d.chatName,
                  customStatus: d.customStatus,
                  avatar: finalAvatar,
                } as any;
                setFriendProfiles((prev)=> ({ ...prev, [id]: profile, [uid]: profile }));
                try {
                  useChatProfileStore.setState((s:any) => ({
                    profiles: {
                      ...(s?.profiles || {}),
                      [uid]: {
                        ...(s?.profiles?.[uid] || {
                          id: `chat_profile_${uid}`,
                          userId: uid,
                          displayName: d.displayName || basis,
                          status: 'online',
                          createdAt: Date.now(),
                          lastActive: Date.now(),
                        }),
                        chatName: d.chatName || d.displayName || basis,
                        avatar: finalAvatar || s?.profiles?.[uid]?.avatar,
                      },
                    },
                  }));
                } catch {}
              } catch {}
            })();
          }, () => {});
        }
        profileSubsRef.current[id] = () => { try { unsub(); } catch {} try { unsubEmail && unsubEmail(); } catch {} };
      } catch {}
    });
    // 더 이상 필요 없는 구독 해제
    Object.keys(profileSubsRef.current).forEach((id) => {
      if (!ids.includes(id)) {
        try { profileSubsRef.current[id](); } catch {}
        delete profileSubsRef.current[id];
      }
    });
    return () => {
      try {
        Object.values(profileSubsRef.current).forEach((fn) => { try { fn(); } catch {} });
        profileSubsRef.current = {};
      } catch {}
    };
  }, [friends]);

  // 전체 친구: 검색/정렬/더보기 가공 리스트
  const allFilteredSorted = React.useMemo(() => {
    const list = Array.isArray(friends) ? friends : [];
    const q = String(allQuery || '').trim().toLowerCase();
    const byQuery = q
      ? list.filter(f => {
          const name = String(displayName(f) || '').toLowerCase();
          const phone = String(f.phone || '').replace(/\D/g,'');
          const email = String(f.email || '').toLowerCase();
          return name.includes(q) || phone.includes(q) || email.includes(q);
        })
      : list.slice();
    const safeDisplay = (x: any) => String(displayName(x) || '');
    const cmpName = (a: any, b: any) => safeDisplay(a).localeCompare(safeDisplay(b), 'ko');
    const cmpRecent = (a: any, b: any) => (Number(b?.addedAt || 0) - Number(a?.addedAt || 0));
    const safeIsReg = (typeof isRegisteredUser === 'function')
      ? isRegisteredUser
      : ((_: any) => false);
    const cmpInstalled = (a: any, b: any) => {
      const A = safeIsReg(a) ? 1 : 0;
      const B = safeIsReg(b) ? 1 : 0;
      if (A !== B) return B - A;
      return safeDisplay(a).localeCompare(safeDisplay(b), 'ko');
    };
    const key = (sortKey === 'name' || sortKey === 'recent' || sortKey === 'installed') ? sortKey : 'name';
    byQuery.sort(key === 'name' ? cmpName : key === 'recent' ? cmpRecent : cmpInstalled);
    return byQuery;
  }, [friends, allQuery, sortKey, displayName, isRegisteredUser]);

  // 포커스 시 로컬 캐시 재로딩 (연락처에서 추가 후 즉시 반영)
  useFocusEffect(React.useCallback(() => {
    (async () => {
      try {
        const uidCur = firebaseAuth.currentUser?.uid || 'me';
        const raw = await AsyncStorage.getItem(`u:${uidCur}:local.friends`);
        if (!raw) return;
        const arr = JSON.parse(raw) as any[];
        // 포커스 시에도 prev 병합 없이, 로컬 캐시 기준으로만 정리하여
        // 수천 명 데이터에서도 연산량을 최소화합니다.
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
  // 전체 친구: 검색/정렬/더보기 상태
  const [allQuery, setAllQuery] = React.useState('');
  const [allQueryInput, setAllQueryInput] = React.useState('');
  // 디바운스: 150ms
  React.useEffect(() => {
    const h = setTimeout(() => setAllQuery(String(allQueryInput || '')), 150);
    return () => clearTimeout(h);
  }, [allQueryInput]);
  const [sortKey, setSortKey] = React.useState<'name'|'recent'|'installed'>('name');
  // 초기에는 최대 300명만 렌더링하고, 필요 시 '더보기'로 추가 노출 (대량 연락처에서도 진입 시 멈춤 방지)
  const [showCount, setShowCount] = React.useState<number>(300);
  const handleInviteMany = async () => {
    try {
      const idSet = new Set(selectedIds);
      const targets = friends.filter(f => idSet.has(f.id) && f.phone && f.status !== 'linked');
      const digitsList = Array.from(new Set(targets.map(f => String(f.phone || '').replace(/\D/g,'')).filter(Boolean)));
      if (digitsList.length === 0) { alert('선택된 초대 대상의 전화번호가 없습니다.'); return; }
      const inviteUrl = inviteStoreUrl;
      const body = `유이랜드(YooY Land) 앱에 초대합니다.\n아래 링크로 설치/업데이트 후 대화에서 연결해요.\n${inviteUrl}`;

      // 번호 포맷: 한국(0으로 시작 10~11자리)은 0으로 시작(국내 표기) / 국제표기는 +82로 정규화
      const toDomesticOrE164 = (d: string) => {
        if (/^0\d{9,10}$/.test(d)) return d;          // 예: 010xxxxxxxx
        if (/^82\d+/.test(d)) return `+${d}`;        // 82로 시작 → +82...
        if (/^\d{10,15}$/.test(d)) return d;         // 기타 숫자만: 그대로
        if (/^\+?\d{10,15}$/.test(d)) return d.startsWith('+') ? d : `+${d}`;
        return d;
      };
      const recipients = digitsList.map(toDomesticOrE164);

      // 전송 방식 선택: 문자(SMS) 또는 공유 시트(메신저 선택)
      Alert.alert('보내기 방식', '어떤 방법으로 초대할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '공유(메신저 선택)', onPress: async () => {
            try { await Share.share({ message: body }); } catch {}
            clearSelection();
          } 
        },
        { text: '문자(SMS)', onPress: async () => {
            let sent = false;
            try {
              const isAvailable = await SMS.isAvailableAsync();
              if (isAvailable) {
                for (let i = 0; i < recipients.length; i += 50) {
                  const batch = recipients.slice(i, i + 50);
                  await SMS.sendSMSAsync(batch, body);
                }
                sent = true;
              }
            } catch {}
            if (!sent) {
              // 폴백: 첫 번째 수신자
              const first = recipients[0];
              const url = `sms:${encodeURIComponent(first)}?body=${encodeURIComponent(body)}`;
              try { await Linking.openURL(url); sent = true; } catch {}
            }
            if (sent) alert(`${recipients.length}명에게 초대를 보냈습니다.`);
            else alert('전송을 시작할 수 없습니다. 기본 메시지/메신저를 확인해 주세요.');
            clearSelection();
          } 
        },
      ]);
    } catch {
      clearSelection();
    }
  };
  const handleChatMany = () => {
    router.push('/chat/create-room');
    clearSelection();
  };

  // 연락처 새 항목 생성 (OS 기본 연락처 편집 화면)
  const createPhoneContact = React.useCallback(async () => {
    let Contacts: any = null;
    try { Contacts = require('expo-contacts'); } catch { Contacts = null; }
    if (!Contacts) { alert('연락처 기능(expo-contacts)이 필요합니다.'); return; }
    try {
      // 1) READ 권한
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') { alert('연락처 접근 권한이 필요합니다.'); return; }
      // 2) 가능한 경우 WRITE 권한 시도 (SDK별 가변)
      try { await (Contacts.requestWritePermissionsAsync?.() ?? Promise.resolve()); } catch {}
      // 3) 편집 UI 우선, 실패 시 직접 추가, 또 실패 시 시스템 연락처 앱으로 폴백
      let done = false;
      try {
        if (Contacts.presentFormAsync) {
          await Contacts.presentFormAsync(null, { name: '', phoneNumbers: [{ number: '' }] });
          done = true;
        }
      } catch {}
      if (!done) {
        try {
          await Contacts.addContactAsync({ name: '', phoneNumbers: [{ number: '' }] });
          done = true;
        } catch {}
      }
      if (!done) {
        // 안드로이드 기본 연락처 앱의 "새 연락처" 화면 시도
        const candidates = [
          'content://com.android.contacts/contacts/new',
          'content://contacts/people/',
          'content://com.android.contacts/contacts'
        ];
        for (const u of candidates) {
          try { await Linking.openURL(u); done = true; break; } catch {}
        }
      }
      if (!done) { alert('이 기기에서 연락처 추가 UI를 열 수 없습니다. 연락처 앱에서 직접 추가해 주세요.'); }
      // 4) 추가 이후, 로컬 동기화
      try { await syncContactsQuick(); } catch {}
    } catch {
      alert('연락처 추가 중 오류가 발생했습니다.');
    }
  }, [syncContactsQuick]);

  // 액션: 초대/대화/삭제
  const handleInviteSend = async (f: { id: string; name: string; phone?: string }) => {
    try {
      const raw = String(f.phone || '').replace(/\D/g,'');
      if (!raw) { alert('전화번호가 없어 초대를 보낼 수 없습니다.'); return; }
      const inviteUrl = inviteStoreUrl;
      const body = `유이랜드(YooY Land) 앱에 초대합니다.\n아래 링크로 설치/업데이트 후 대화에서 연결해요.\n${inviteUrl}`;
      const toDomesticOrE164 = (d: string) => {
        if (/^0\d{9,10}$/.test(d)) return d;
        if (/^82\d+/.test(d)) return `+${d}`;
        if (/^\d{10,15}$/.test(d)) return d;
        if (/^\+?\d{10,15}$/.test(d)) return d.startsWith('+') ? d : `+${d}`;
        return d;
      };
      const number = toDomesticOrE164(raw);
      Alert.alert('보내기 방식', `${f.name}에게 어떤 방법으로 보낼까요?`, [
        { text: '취소', style: 'cancel' },
        { text: '공유(메신저 선택)', onPress: async () => { try { await Share.share({ message: body }); } catch {} } },
        { text: '문자(SMS)', onPress: async () => {
            let sent = false;
            try {
              const isAvailable = await SMS.isAvailableAsync();
              if (isAvailable) { await SMS.sendSMSAsync([number], body); sent = true; }
            } catch {}
            if (!sent) {
              const url = `sms:${encodeURIComponent(number)}?body=${encodeURIComponent(body)}`;
              try { await Linking.openURL(url); sent = true; } catch {}
            }
            if (sent) alert('초대 메시지를 보냈습니다.');
            else alert('전송을 시작할 수 없습니다. 기본 메시지/메신저를 확인해 주세요.');
          } 
        },
      ]);
    } catch {
      alert('초대 전송 중 오류가 발생했습니다.');
    }
  };
  const handleChatStart = async (f: { id: string; name: string }) => {
    try {
      const me = firebaseAuth.currentUser?.uid;
      if (!me) { try { await ensureAuthedUid(); } catch {} }
      const myId = firebaseAuth.currentUser?.uid || 'me';
      if (!f?.id || f.id === myId) { router.push('/chat/create-room'); return; }
      // 기존 DM 우선 → 없으면 생성(양쪽 멤버십 포함)
      const roomId = await (useKakaoRoomsStore as any).getState().getOrCreateDmRoom(myId, f.id);
      // 상대방에게 방 초대 알림 전달 (Firestore에 저장 → 상대 앱에서 구독해 표시)
      try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const inviterName = (useChatProfileStore.getState().currentProfile as any)?.chatName
          || (useChatProfileStore.getState().currentProfile as any)?.displayName
          || firebaseAuth.currentUser?.displayName
          || '누군가';
        const notifRef = doc(firestore, 'users', f.id, 'notifications', `room_${roomId}_${Date.now()}`);
        await setDoc(notifRef, {
          type: 'room_invite',
          roomId,
          title: language === 'ko' ? '대화 초대' : 'Chat invite',
          content: language === 'ko' ? `${inviterName}님이 대화를 시작했습니다.` : `${inviterName} started a chat.`,
          senderId: myId,
          senderName: inviterName,
          timestamp: serverTimestamp(),
        });
      } catch (_) { /* 알림 저장 실패해도 대화 진입은 유지 */ }
      router.push({ pathname: '/chat/room/[id]', params: { id: roomId, type: 'dm' } });
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
      const key = `u:${firebaseAuth.currentUser?.uid || 'me'}:local.friends`;
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
                <ThemedText style={styles.profilePreviewName}>{(currentProfile as any)?.chatName || currentProfile.displayName}</ThemedText>
                <ThemedText style={styles.profilePreviewStatus}>
                  {(currentProfile as any)?.customStatus ? String((currentProfile as any).customStatus) : ''}
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
                  const titleName = (n as any).senderName || (n.title || t('newMemo', language));
                  const ts = (n as any).timestamp ? new Date((n as any).timestamp).toLocaleTimeString(language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US',{hour:'2-digit',minute:'2-digit'}) : '';
                  const displayTitle = ts ? `${titleName} - ${ts}` : titleName;
                  const isExpanded = notiExpanded.has((n as any).id) || (n as any).isRead;
                  const saved = notiSavedIds.has((n as any).id);
                  return (
                    <View key={n.id} style={styles.notiItem}>
                      <TouchableOpacity
                        onPress={() => {
                          try { markAsRead(n.id); } catch {}
                          setNotiExpanded(prev => {
                            const next = new Set(prev);
                            next.add((n as any).id);
                            return next;
                          });
                        }}
                        style={{ flex: 1 }}
                      >
                        <Text style={[styles.notiTitle,{ fontWeight:'600' }]} numberOfLines={1}>{displayTitle}</Text>
                        <Text style={[styles.notiContent,{ color:'#BDBDBD', fontSize:12 }]} numberOfLines={isExpanded ? undefined : 2}>{n.content}</Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection:'row', alignItems:'center', gap: 6 }}>
                        {!n.isRead && (
                          <TouchableOpacity onPress={() => { try { markAsRead(n.id); } catch {}; setNotiExpanded(prev => { const next = new Set(prev); next.add((n as any).id); return next; }); }} style={[styles.notiMiniBtn,{ borderColor:'#FFB3BA' }]}><Text style={[styles.notiMiniBtnText,{ color:'#FFB3BA', fontWeight:'600' }]}>{t('read', language)}</Text></TouchableOpacity>
                        )}
                        {(n as any).roomId && (
                          <TouchableOpacity
                            onPress={() => {
                              try { markAsRead(n.id); } catch {};
                              setNotiOpen(false);
                              router.push({ pathname: '/chat/room/[id]', params: { id: String((n as any).roomId) } });
                            }}
                            style={[styles.notiMiniBtn, { borderColor: '#FFD700' }]}
                          >
                            <Text style={[styles.notiMiniBtnText, { color: '#FFD700', fontWeight: '600' }]}>
                              {language === 'ko' ? '입장하기' : 'Enter'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!saved && (
                          <TouchableOpacity onPress={async () => {
                        try {
                          const uid = firebaseAuth.currentUser?.uid || 'anonymous';
                          const key = `u:${uid}:treasure.items`;
                          const raw = await AsyncStorage.getItem(key);
                          const list: any[] = raw ? JSON.parse(raw) : [];
                          const tTitle = String(n.title || '');
                          const tContent = String(n.content || '');
                          const item = { type: (/^https?:\/\//i.test(tContent)) ? 'link' : 'text', text: `${tTitle}\n${tContent}`.trim(), url: (/^https?:\/\//i.test(tContent)) ? tContent : undefined, createdAt: Date.now() };
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
            <TouchableOpacity style={styles.addCircle} onPress={openContactsModal}>
              <MaterialIcons name="contacts" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{t('contacts', language)}</Text>
          </View>
          <View style={styles.addItem}>
            <TouchableOpacity style={styles.addCircle} onPress={() => setManualAddOpen(true)}>
              <MaterialIcons name="person-add" size={22} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.addLabel}>{language==='ko'?'연락처 추가':language==='ja'?'連絡先追加':language==='zh'?'添加联系人':'Add Contact'}</Text>
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

        {/* 연락처 선택 팝업: 검색 + 선택 + 동기화(앱 친구 추가) */}
        <Modal visible={contactsOpen} animationType="slide" transparent onRequestClose={closeContactsModal}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', paddingTop: Math.max(insets.top, 12), paddingBottom: 12 }}>
            <View style={{ marginHorizontal: 12, backgroundColor: '#0C0C0C', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', overflow: 'hidden', flex: 1 }}>
              <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
                <ThemedText style={{ color:'#EDEDED', fontWeight:'800', fontSize: 14 }}>연락처에서 추가</ThemedText>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={closeContactsModal} style={[styles.actBtn, { borderColor:'#444' }]}><Text style={styles.actText}>닫기</Text></TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
                <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
                  <View style={{ flex: 1, flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#141414', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, height:40 }}>
                    <MaterialIcons name="search" size={18} color="#888" />
                    <TextInput
                      style={{ flex:1, color:'#EDEDED', fontSize:14 }}
                      placeholder="이름/전화번호/이메일 검색"
                      placeholderTextColor="#888"
                      value={contactsQuery}
                      onChangeText={(v) => { setContactsQuery(v); setContactsShowCount(300); }}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="search"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    {!!String(contactsQuery || '').length && (
                      <TouchableOpacity onPress={() => { setContactsQuery(''); Keyboard.dismiss(); }}>
                        <Text style={{ color:'#AAA', fontSize:14 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ flexDirection:'row', gap:6 }}>
                    <TouchableOpacity onPress={() => selectAllFiltered(contactsFiltered.map(c=>c.id))} style={[styles.actBtn,{ paddingHorizontal:10 }]}><Text style={styles.actText}>전체</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => invertFiltered(contactsFiltered.map(c=>c.id))} style={[styles.actBtn,{ paddingHorizontal:10 }]}><Text style={styles.actText}>반전</Text></TouchableOpacity>
                    <TouchableOpacity onPress={clearAllSelected} style={[styles.actBtn,{ paddingHorizontal:10 }]}><Text style={styles.actText}>해제</Text></TouchableOpacity>
                  </View>
                </View>

                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <View>
                    <Text style={{ color:'#BDBDBD', fontSize: 12 }}>
                      {contactsLoading ? '연락처를 불러오는 중입니다...' : (contactsError ? `오류: ${contactsError}` : `검색결과 ${contactsFiltered.length}명 / 선택 ${contactsSelected.size}명`)}
                    </Text>
                    {contactsLoading && (
                      <View style={{ marginTop:4, width:160, height:4, borderRadius:2, backgroundColor:'#333' }}>
                        <View style={{ width: `${Math.round(contactsProgress*100)}%`, height:4, borderRadius:2, backgroundColor:'#FFD700' }} />
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    disabled={contactsSelected.size === 0 || contactsLoading}
                    onPress={addSelectedContactsToAppFriends}
                    style={[styles.actBtn, { borderColor: (contactsSelected.size === 0 || contactsLoading) ? '#333' : '#FFD700' }]}
                  >
                    <Text style={[styles.actText, { color: (contactsSelected.size === 0 || contactsLoading) ? '#777' : '#FFD700' }]}>
                      선택 동기화
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flex: 1, marginTop: 10 }}>
                {contactsLoading ? (
                  <View style={{ paddingTop: 24, alignItems:'center' }}>
                    <ActivityIndicator color="#FFD700" />
                    <Text style={{ color:'#BDBDBD', marginTop: 10 }}>연락처를 불러오는 중...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={contactsFiltered.slice(0, contactsShowCount)}
                    keyExtractor={(it) => it.id}
                    initialNumToRender={30}
                    windowSize={7}
                    maxToRenderPerBatch={30}
                    removeClippedSubviews
                    onEndReachedThreshold={0.4}
                    onEndReached={() => setContactsShowCount((c) => c + 300)}
                    renderItem={renderContactItem}
                  />
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* 수동 추가: 앱 친구리스트에 직접 추가(기기 연락처 저장 아님) */}
        <Modal visible={manualAddOpen} animationType="fade" transparent onRequestClose={() => setManualAddOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', paddingTop: Math.max(insets.top, 12), padding: 12, justifyContent:'center' }}>
            <View style={{ backgroundColor:'#0C0C0C', borderRadius: 12, borderWidth: 1, borderColor:'#2A2A2A', padding: 12 }}>
              <ThemedText style={{ color:'#EDEDED', fontWeight:'800', fontSize: 14, marginBottom: 10 }}>친구 수동 추가</ThemedText>
              <TextInput value={manualName} onChangeText={setManualName} placeholder="이름" placeholderTextColor="#777" style={{ height: 40, borderWidth:1, borderColor:'#2A2A2A', borderRadius: 8, paddingHorizontal: 10, color:'#FFF', marginBottom: 8 }} />
              <TextInput value={manualPhone} onChangeText={setManualPhone} placeholder="전화번호(선택)" placeholderTextColor="#777" keyboardType="phone-pad" style={{ height: 40, borderWidth:1, borderColor:'#2A2A2A', borderRadius: 8, paddingHorizontal: 10, color:'#FFF', marginBottom: 8 }} />
              <TextInput value={manualEmail} onChangeText={setManualEmail} placeholder="이메일(선택)" placeholderTextColor="#777" autoCapitalize="none" style={{ height: 40, borderWidth:1, borderColor:'#2A2A2A', borderRadius: 8, paddingHorizontal: 10, color:'#FFF', marginBottom: 12 }} />
              <View style={{ flexDirection:'row', justifyContent:'flex-end', gap: 8 }}>
                <TouchableOpacity onPress={() => setManualAddOpen(false)} style={[styles.actBtn, { borderColor:'#444' }]}><Text style={styles.actText}>취소</Text></TouchableOpacity>
                <TouchableOpacity onPress={addManualToAppFriends} style={[styles.actBtn, { borderColor:'#FFD700' }]}><Text style={[styles.actText,{ color:'#FFD700' }]}>추가</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 친구 리스트 섹션 */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
          {/* 내 프로필 */}
          {currentProfile && (
            <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
              <ThemedText style={{ color: '#CFCFCF', marginBottom: 6 }}>{t('myProfile', language)}</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  try {
                    const uid = firebaseAuth.currentUser?.uid || 'me';
                    const nm = (currentProfile as any)?.chatName || currentProfile.displayName;
                    router.push({ pathname: '/chat/friend-profile', params: { id: uid, name: nm, avatar: currentProfile.avatar } as any });
                  } catch {}
                }}
                style={styles.friendItem}
              >
                <View style={styles.friendAvatar}>
                  {currentProfile.avatar ? (
                    <Image source={{ uri: currentProfile.avatar }} style={styles.friendAvatarImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(((currentProfile as any)?.chatName || currentProfile.displayName || '?') as string).charAt(0)}</Text></View>
                  )}
                </View>
                <View style={styles.friendInfo}>
                  <ThemedText style={styles.friendName}>{(currentProfile as any)?.chatName || currentProfile.displayName}</ThemedText>
                  <ThemedText style={styles.friendStatus}>{(currentProfile as any)?.customStatus ? String((currentProfile as any).customStatus) : ''}</ThemedText>
                </View>
              </TouchableOpacity>
              {/* 아이디 표시/편집 영역 */}
              <View style={{ marginTop:8 }}>
                {editingUserId ? (
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    <TextInput
                      value={userIdInput}
                      onChangeText={setUserIdInput}
                      placeholder={t('userId', language)}
                      placeholderTextColor="#777"
                      style={{ flex:1, height:36, paddingHorizontal:10, borderWidth:1, borderColor:'#FFD700', borderRadius:8, color:'#FFF', backgroundColor:'#111' }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const raw = String(userIdInput || '').trim();
                          const valid = /^[a-z0-9_.-]{3,20}$/i.test(raw);
                          if (!valid) { alert(language==='en'?'3-20 letters/digits/_.- only':'3~20자 영문/숫자/_.- 만 허용됩니다'); return; }
                          const uid = firebaseAuth.currentUser?.uid;
                          if (!uid) { alert(language==='en'?'Login required':'로그인이 필요합니다'); return; }
                          const lower = raw.toLowerCase();
                          // 중복 확인
                          const usersRef = collection(firestore, 'users');
                          const snap = await getDocs(query(usersRef, where('usernameLower','==', lower), limit(1)));
                          if (!snap.empty && snap.docs[0].id !== uid) {
                            alert(language==='en'?'ID is already in use':'이미 사용 중인 아이디입니다');
                            return;
                          }
                          await (async () => {
                            const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
                            await setDoc(doc(firestore, 'users', uid), { username: raw, usernameLower: lower, updatedAt: serverTimestamp() } as any, { merge: true });
                          })();
                          try { useChatProfileStore.getState().updateProfile?.({ username: raw } as any); } catch {}
                          setEditingUserId(false);
                        } catch {
                          alert(language==='en'?'Failed to save ID':'아이디 저장 실패');
                        }
                      }}
                      style={[styles.actBtn, { borderColor:'#FFD700' }]}
                    >
                      <Text style={styles.actText}>{language==='en'?'Save':'저장'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingUserId(false); setUserIdInput(''); }} style={[styles.actBtn, { borderColor:'#444' }]}>
                      <Text style={styles.actText}>{language==='en'?'Cancel':'취소'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setEditingUserId(true); setUserIdInput(String((currentProfile as any)?.username || '')); }} style={[styles.actBtn, { alignSelf:'flex-start', borderColor:'#FFD700' }]}>
                    <Text style={styles.actText}>
                      {(currentProfile as any)?.username ? String((currentProfile as any).username) : t('userId', language)}
                    </Text>
                  </TouchableOpacity>
                )}
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
              <TouchableOpacity onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: (f.uid || f.id), name: displayName(f) } as any }); } catch {} }}>
                      <View style={styles.friendAvatar}>
                  {(() => {
                    const key = String(f.uid || f.id || '').trim();
                    const av = String(
                      friendProfiles[key]?.avatar ||
                      (globalProfiles as any)?.[key]?.avatar ||
                      ''
                    );
                    const isUrl = /^https?:\/\//i.test(av) || /^data:/i.test(av);
                    return isUrl
                      ? <Image source={{ uri: av }} style={styles.friendAvatarImg} resizeMode="cover" />
                      : <View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(displayName(f)||'?').charAt(0)}</Text></View>;
                  })()}
                      </View>
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
                      <View style={styles.friendAvatar}>
                        {(() => {
                          const key = String(f.uid || f.id || '').trim();
                          const av = String(
                            friendProfiles[key]?.avatar ||
                            (globalProfiles as any)?.[key]?.avatar ||
                            ''
                          );
                          const isUrl = /^https?:\/\//i.test(av) || /^data:/i.test(av);
                          return isUrl
                            ? <Image source={{ uri: av }} style={styles.friendAvatarImg} resizeMode="cover" />
                            : <View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(displayName(f)||'?').charAt(0)}</Text></View>;
                        })()}
                      </View>
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

          {/* 전체 친구: 정렬만 적용, 그룹 라벨은 비표시 (항상 전체 친구 기준) */}
          <View>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
              <ThemedText style={{ color: '#CFCFCF' }}>{t('allFriends', language)} ({friends.length})</ThemedText>
            </View>
            {/* 전체 친구: 검색/정렬 바 */}
            <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
              <View style={{ flex:1, flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#141414', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, height:40 }}>
                <MaterialIcons name="search" size={18} color="#888" />
                <TextInput
                  style={{ flex:1, color:'#EDEDED', fontSize:14 }}
                  placeholder={t('searchNameOrNumber', language)}
                  placeholderTextColor="#888"
                  value={allQueryInput}
                  onChangeText={setAllQueryInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {!!String(allQueryInput || '').length && (
                  <TouchableOpacity onPress={() => { setAllQueryInput(''); Keyboard.dismiss(); }}>
                    <Text style={{ color:'#AAA', fontSize:14 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={() => setSortKey(k => k==='name'?'recent':k==='recent'?'installed':'name')} style={[styles.actBtn,{ paddingHorizontal:10 }]}>
                <Text style={styles.actText}>{sortKey==='name'?'이름순':sortKey==='recent'?'최근추가':'설치우선'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAllQueryInput(''); Keyboard.dismiss(); }} style={[styles.actBtn,{ paddingHorizontal:10 }]}>
                <Text style={styles.actText}>{t('close', language) || '취소'}</Text>
              </TouchableOpacity>
            </View>
            {allFilteredSorted.slice(0, showCount).map(f => (
              <View key={f.id} style={[styles.friendItem, selectedIds.has(f.id) && styles.friendItemSelected]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <TouchableOpacity onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: f.id, name: displayName(f) } as any }); } catch {} }}>
                      <View style={styles.friendAvatar}>
                        {(() => {
                          const key = String(f.uid || f.id || '').trim();
                          const av = String(
                            friendProfiles[key]?.avatar ||
                            (globalProfiles as any)?.[key]?.avatar ||
                            ''
                          );
                          const isUrl = /^https?:\/\//i.test(av) || /^data:/i.test(av);
                          return isUrl
                            ? <Image source={{ uri: av }} style={styles.friendAvatarImg} resizeMode="cover" />
                            : <View style={styles.friendAvatarFallback}><Text style={styles.friendAvatarText}>{(displayName(f)||'?').charAt(0)}</Text></View>;
                        })()}
                      </View>
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
            {allFilteredSorted.length > showCount && (
              <View style={{ alignItems:'center', paddingVertical: 10 }}>
                <TouchableOpacity style={[styles.actBtn,{ paddingHorizontal:12 }]} onPress={() => setShowCount(c => c + 500)}>
                  <Text style={styles.actText}>더보기 ({showCount}/{allFilteredSorted.length})</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </ThemedView>
      {/* 하단 고정: 선택된 친구들 초대/대화 바 (친구 목록 하단에 항상 동일한 UX) */}
      {selectMode && selectedIds.size > 0 && (
        <View style={{ position:'absolute', left:0, right:0, bottom:60, backgroundColor:'#0F0F0F', borderTopWidth:1, borderTopColor:'#2A2A2A', paddingHorizontal:12, paddingVertical:8 }}>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flexDirection:'row', alignItems:'center', flex:1, minWidth:0 }}>
              <Text style={{ color:'#EDEDED', fontSize:12 }}>{`선택됨 ${selectedIds.size}명`}</Text>
            </View>
            <View style={{ flexDirection:'row', gap:8 }}>
              <TouchableOpacity style={styles.actBtn} onPress={clearSelection}>
                <Text style={styles.actText}>{t('close', language) || '해제'}</Text>
              </TouchableOpacity>
              {selectMode === 'invite' && (
                <TouchableOpacity style={[styles.actBtn, { borderColor:'#FFD700' }]} onPress={handleInviteMany}>
                  <Text style={[styles.actText,{ color:'#FFD700' }]}>{`${t('invite', language)}(${selectedIds.size})`}</Text>
                </TouchableOpacity>
              )}
              {selectMode === 'chat' && (
                <TouchableOpacity style={[styles.actBtn, { borderColor:'#FFD700' }]} onPress={handleChatMany}>
                  <Text style={[styles.actText,{ color:'#FFD700' }]}>{`${t('chatAction', language)}(${selectedIds.size})`}</Text>
                </TouchableOpacity>
              )}
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
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#0C0C0C',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  // 작은 디바이스에서도 6개 아이콘이 한 줄에 보이도록 flex 기반 레이아웃
  addItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
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




