import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router, Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { firebaseApp } from '@/lib/firebase';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';

type PhoneContact = {
  id: string;
  name: string;
  phone: string | null;
};

export default function AddFriendContactsScreen() {
  const { language } = usePreferences();
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [query, setQuery] = useState('');
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [friendNameByPhone, setFriendNameByPhone] = useState<Record<string, string>>({});
  const [addedPhones, setAddedPhones] = useState<Record<string, boolean>>({}); // 이번 세션에 추가 완료된 번호 표시
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkProcessed, setBulkProcessed] = useState(0);

  const normalizePhone = useCallback((v: string | null | undefined) => (v ?? '').replace(/\D/g, ''), []);

  // 새 번호 추가 모달 상태
  const [addVisible, setAddVisible] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addName, setAddName] = useState('');

  const loadContacts = useCallback(async () => {
    let Contacts: any = null;
    try { Contacts = require('expo-contacts'); } catch { Contacts = null; }
    if (!Contacts) {
      setSupported(false);
      return;
    }
    setSupported(true);
    setLoading(true);
    try {
      // 0) 캐시 즉시 표시로 체감 속도 개선
      try {
        const cached = await AsyncStorage.getItem('contacts.cached');
        if (cached) {
          const arr = JSON.parse(cached) as PhoneContact[];
          if (Array.isArray(arr) && arr.length) setContacts(arr);
        }
      } catch {}

      const { status } = await Contacts.requestPermissionsAsync();
      setPermission(status);
      if (status !== 'granted') return;

      // 1) 페이지네이션으로 점진적 로딩 (체감 속도 개선)
      const pageSize = 800;
      let pageOffset = 0;
      const all: PhoneContact[] = [];
      // 일부 플랫폼에서 pageOffset/pageSize가 없으면 단일 호출로 폴백
      let supportsPaging = true;
      try {
        // 첫 페이지
        const first = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], sort: 'firstName', pageSize, pageOffset });
        const pushNormalize = (rows: any[]) => {
          const normalized: PhoneContact[] = (rows || []).map((c: any) => ({
            id: String(c.id),
            name: [c.name, c.firstName, c.lastName].filter(Boolean)[0] || '이름없음',
            phone: c.phoneNumbers?.[0]?.number ?? null,
          }));
          all.push(...normalized);
          // 부분 결과를 즉시 반영
          setContacts(prev => {
            const merged = [...prev, ...normalized];
            merged.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            return merged;
          });
        };
        pushNormalize(first.data);
        // 다음 페이지들
        while (first.hasNextPage) {
          pageOffset += pageSize;
          const res = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], sort: 'firstName', pageSize, pageOffset });
          pushNormalize(res.data);
          if (!res.hasNextPage) break;
          // 이벤트 루프에 기회 제공
          await new Promise(r => setTimeout(r, 10));
        }
      } catch {
        supportsPaging = false;
      }
      if (!supportsPaging) {
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], sort: 'firstName' });
      const normalized: PhoneContact[] = (data || []).map((c: any) => ({
        id: String(c.id),
        name: [c.name, c.firstName, c.lastName].filter(Boolean)[0] || '이름없음',
        phone: c.phoneNumbers?.[0]?.number ?? null,
      }));
      normalized.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setContacts(normalized);
        all.splice(0, all.length, ...normalized);
      }
      // 캐시 + 제외 맵 로드/저장
      try {
        const rawEx = await AsyncStorage.getItem('contacts.excluded');
        if (rawEx) setExcluded(JSON.parse(rawEx));
        await AsyncStorage.setItem('contacts.cached', JSON.stringify(all));
      } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // 백그라운드 동기화(화면 비활성화 중에도 시작)
  const startBackgroundSync = useCallback(() => {
    try {
      setTimeout(() => { loadContacts().catch(()=>{}); }, 0);
      Alert.alert('안내', '연락처 동기화를 백그라운드에서 진행합니다.');
    } catch {}
  }, [loadContacts]);

  // 친구 전화번호 → 이름 맵 로드 (로컬 캐시 + Firestore)
  useEffect(() => {
    (async () => {
      try {
        const map: Record<string,string> = {};
        const localRaw = await AsyncStorage.getItem('local.friends');
        if (localRaw) {
          const arr = JSON.parse(localRaw) as any[];
          arr.forEach(x => {
            if (x.phone) {
              const p = String(x.phone);
              const pure = p.replace(/\D/g,'');
              const add = (k: string) => { if (k) map[k] = x.name || p; };
              add(pure); add('+'+pure);
              if (pure.startsWith('82') && pure.length >= 10) add('0'+pure.slice(2));
              if (pure.startsWith('0') && pure.length >= 10) { add('82'+pure.slice(1)); add('+82'+pure.slice(1)); }
            }
          });
        }
        const uid = firebaseAuth.currentUser?.uid;
        if (uid) {
          const snap = await getDocs(collection(firestore, 'users', uid, 'friends'));
          snap.forEach(d => {
            const p = (d.data() as any).phone as string | undefined;
            const n = (d.data() as any).displayName as string | undefined;
            if (p) {
              const pure = p.replace(/\D/g,'');
              const add = (k: string) => { if (k) map[k] = n || p; };
              add(pure); add('+'+pure);
              if (pure.startsWith('82') && pure.length >= 10) add('0'+pure.slice(2));
              if (pure.startsWith('0') && pure.length >= 10) { add('82'+pure.slice(1)); add('+82'+pure.slice(1)); }
            }
          });
        }
        setFriendNameByPhone(map);
      } catch {}
    })();
  }, []);

  // 샘플 주입 기능 제거됨

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }, [contacts, query]);

  const isAlreadyFriend = useCallback((digits: string) => {
    if (!digits) return false;
    return !!friendNameByPhone[digits] || !!friendNameByPhone['+'+digits];
  }, [friendNameByPhone]);

  const addFriendInternal = useCallback(async (rawDigits: string, name: string) => {
    const digits = normalizePhone(rawDigits);
    if (!digits) { Alert.alert('안내', '올바른 전화번호를 입력해 주세요.'); return; }
    setAddedPhones((prev) => ({ ...prev, [digits]: true }));
    // 로컬 즉시 반영
    try {
      const key = 'local.friends';
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const normalized = `+${digits}`;
      const filtered = list.filter((x) => x.phone !== normalized);
      const entry = { id: `local-${Date.now()}`, name, phone: normalized, status: 'invited', addedAt: Date.now() };
      filtered.unshift(entry);
      await AsyncStorage.setItem(key, JSON.stringify(filtered.slice(0, 200)));
    } catch {}

    try {
      let status: 'linked' | 'invited' | 'already' | 'self' | undefined = 'invited';
      if (Platform.OS === 'web') {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) {
          try { router.push('/chat/friends?t=' + Date.now()); } catch {}
          return;
        }
        const usersRef = collection(firestore, 'users');
        let targetSnap = await getDocs(query(usersRef, where('phone', '==', `+${digits}`), limit(1)));
        if (targetSnap.empty) {
          const altSnap = await getDocs(query(usersRef, where('phone', '==', digits), limit(1)));
          if (!altSnap.empty) targetSnap = altSnap;
        }
        if (!targetSnap.empty) {
          const targetId = targetSnap.docs[0].id;
          await setDoc(doc(firestore, 'users', uid, 'friends', targetId), {
            displayName: (targetSnap.docs[0].data() as any).displayName || name,
            phone: `+${digits}`,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          const me = firebaseAuth.currentUser;
          await setDoc(doc(firestore, 'users', targetId, 'friends', uid), {
            displayName: me?.displayName || 'Unknown',
            phone: null,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          status = 'linked';
        } else {
          await addDoc(collection(firestore, 'invites'), {
            phone: `+${digits}`,
            inviterId: uid,
            inviterName: firebaseAuth.currentUser?.displayName || 'Unknown',
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          status = 'invited';
        }
      } else {
        // 네이티브도 웹과 동일하게 Firestore 직접 처리 (클라우드 함수 의존 제거)
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) {
          try { router.push('/chat/friends?t=' + Date.now()); } catch {}
          return;
        }
        const usersRef = collection(firestore, 'users');
        let targetSnap = await getDocs(query(usersRef, where('phone', '==', `+${digits}`), limit(1)));
        if (targetSnap.empty) {
          const altSnap = await getDocs(query(usersRef, where('phone', '==', digits), limit(1)));
          if (!altSnap.empty) targetSnap = altSnap;
        }
        if (!targetSnap.empty) {
          const targetId = targetSnap.docs[0].id;
          await setDoc(doc(firestore, 'users', uid, 'friends', targetId), {
            displayName: (targetSnap.docs[0].data() as any).displayName || name,
            phone: `+${digits}`,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          const me = firebaseAuth.currentUser;
          await setDoc(doc(firestore, 'users', targetId, 'friends', uid), {
            displayName: me?.displayName || 'Unknown',
            phone: null,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          status = 'linked';
        } else {
          await addDoc(collection(firestore, 'invites'), {
            phone: `+${digits}`,
            inviterId: uid,
            inviterName: firebaseAuth.currentUser?.displayName || 'Unknown',
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          status = 'invited';
        }
      }
      try { router.push('/chat/friends?t=' + Date.now()); } catch {}
      if (status === 'linked') Alert.alert(t('addFriend', language), `${name} (+${digits}) ${t('linkedAsFriend', language)}`);
      else Alert.alert('초대됨', `${name} (+${digits})에게 초대를 생성했습니다.`);
    } catch (e) {
      Alert.alert(t('error', language), t('addFriendError', language));
    }
  }, [normalizePhone]);

  const onInvite = useCallback((c: PhoneContact) => {
    if (!c.phone) { Alert.alert('안내', '전화번호가 없습니다.'); return; }
    addFriendInternal(c.phone, c.name);
  }, [addFriendInternal]);

  const onInviteByPhone = useCallback((phone: string, presetName?: string) => {
    const digits = normalizePhone(phone);
    if (!digits) { Alert.alert('안내', '올바른 전화번호를 입력해 주세요.'); return; }
    setAddPhone(digits);
    setAddName((presetName || '').trim());
    setAddVisible(true);
  }, [normalizePhone]);

  const confirmAddFriend = useCallback(async () => {
    const name = addName.trim() || '새 친구';
    const phone = addPhone;
    setAddVisible(false);
    // 1) 즉시 로컬에 '초대중'으로 반영 (서버 실패해도 목록에 보이도록)
    try {
      const key = 'local.friends';
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      const filtered = list.filter((x) => x.phone !== normalized);
      const entry = { id: `local-${Date.now()}`, name, phone: normalized, status: 'invited', addedAt: Date.now() };
      filtered.unshift(entry);
      await AsyncStorage.setItem(key, JSON.stringify(filtered.slice(0, 200)));
    } catch {}

    // 2) 서버 함수 호출(웹은 CORS 회피를 위해 바로 Firestore fallback 경로 사용)
    try {
      let status: 'linked' | 'invited' | 'already' | 'self' | undefined;
      if (Platform.OS === 'web') {
        // Web: 직접 Firestore에 기록(상대가 존재하면 linked, 아니면 invited)
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) {
          // 로그인 전이라도 로컬 목록은 즉시 반영되므로 목록으로 이동
          try { router.push('/chat/friends?t=' + Date.now()); } catch {}
          throw new Error('no-auth');
        }
        const normalized = phone.startsWith('+') ? phone : `+${phone}`;
        const pure = normalized.replace(/\D/g, '');
        const usersRef = collection(firestore, 'users');
        let targetSnap = await getDocs(query(usersRef, where('phone', '==', `+${pure}`), limit(1)));
        if (targetSnap.empty) {
          const altSnap = await getDocs(query(usersRef, where('phone', '==', pure), limit(1)));
          if (!altSnap.empty) targetSnap = altSnap;
        }
        if (!targetSnap.empty) {
          const targetId = targetSnap.docs[0].id;
          // 양방향 friends 생성
          await setDoc(doc(usersRef, uid, 'friends', targetId), {
            displayName: (targetSnap.docs[0].data() as any).displayName || name,
            phone: `+${pure}`,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          const me = firebaseAuth.currentUser;
          await setDoc(doc(usersRef, targetId, 'friends', uid), {
            displayName: me?.displayName || 'Unknown',
            phone: null,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          status = 'linked';
        } else {
          await addDoc(collection(firestore, 'invites'), {
            phone: `+${pure}`,
            inviterId: uid,
            inviterName: firebaseAuth.currentUser?.displayName || 'Unknown',
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          status = 'invited';
        }
      } else {
        // 네이티브: Firestore 직접 처리
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) throw new Error('no uid');
        const usersRef = collection(firestore, 'users');
        const pure = phone.replace(/\D/g,'');
        let targetSnap = await getDocs(query(usersRef, where('phone', '==', `+${pure}`), limit(1)));
        if (targetSnap.empty) {
          const altSnap = await getDocs(query(usersRef, where('phone', '==', pure), limit(1)));
          if (!altSnap.empty) targetSnap = altSnap;
        }
        if (!targetSnap.empty) {
          const targetId = targetSnap.docs[0].id;
          await setDoc(doc(usersRef, uid, 'friends', targetId), {
            displayName: (targetSnap.docs[0].data() as any).displayName || name,
            phone: `+${pure}`,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          const me = firebaseAuth.currentUser;
          await setDoc(doc(usersRef, targetId, 'friends', uid), {
            displayName: me?.displayName || 'Unknown',
            phone: null,
            status: 'linked',
            createdAt: serverTimestamp(),
          });
          status = 'linked';
        } else {
          await addDoc(collection(firestore, 'invites'), {
            phone: `+${pure}`,
            inviterId: uid,
            inviterName: firebaseAuth.currentUser?.displayName || 'Unknown',
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          status = 'invited';
        }
      }
      // 서버 결과에 맞춰 로컬 상태 보정
      try {
        const key = 'local.friends';
        const raw = await AsyncStorage.getItem(key);
        const list: any[] = raw ? JSON.parse(raw) : [];
        const normalized = phone.startsWith('+') ? phone : `+${phone}`;
        const updated = list.map((x) => x.phone === normalized ? { ...x, status: status === 'linked' ? 'linked' : x.status } : x);
        await AsyncStorage.setItem(key, JSON.stringify(updated));
      } catch {}

      // 목록으로 즉시 이동 (웹/네이티브 공통)
      try { router.push('/chat/friends?t=' + Date.now()); } catch {}

      if (status === 'linked') {
        Alert.alert('친구 추가', `${name} (${phone}) 친구로 연결되었습니다.`);
      } else if (status === 'invited') {
        Alert.alert('초대됨', `${name} (${phone})에게 초대를 생성했습니다.`, [
          { text: '확인' }
        ]);
      } else if (status === 'already') {
        Alert.alert('안내', '이미 친구로 등록되어 있습니다.');
      } else if (status === 'self') {
        Alert.alert('안내', '본인 번호는 추가할 수 없습니다.');
      } else {
        Alert.alert('안내', '처리 결과를 확인할 수 없습니다.');
      }
    } catch (e) {
      Alert.alert('오류', '친구 추가 처리 중 오류가 발생했습니다.');
    }
  }, [addName, addPhone]);

  // 전체 친구 추가 (동기화된 연락처 → 친구로 일괄 추가)
  const addAllContactsToFriends = useCallback(async () => {
    setLoading(true);
    setBulkProcessed(0);
    try {
      let success = 0, invited = 0, skipped = 0;
      const key = 'local.friends';
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const seenPhones = new Set<string>(list.map(x => (x.phone || '').replace(/\D/g,'')));
      const eligibleSet = new Set(
        contacts
          .filter(c => !excluded[c.id])
          .map(c => normalizePhone(c.phone))
          .filter(d => d && !isAlreadyFriend(d) && !addedPhones[d] && !seenPhones.has(d))
      );
      setBulkTotal(eligibleSet.size);
      for (const c of contacts) {
        if (excluded[c.id]) { skipped++; continue; }
        const digits = normalizePhone(c.phone);
        if (!digits) { skipped++; continue; }
        if (seenPhones.has(digits)) { skipped++; continue; }
        try {
          // 1) 로컬 즉시 반영 (초대 상태)
          const entry = { id: `local-${Date.now()}-${digits}`, name: c.name, phone: `+${digits}`, status: 'invited', addedAt: Date.now() };
          list.unshift(entry);
          seenPhones.add(digits);
          invited++;
          setAddedPhones((prev)=>({ ...prev, [digits]: true }));
          setBulkProcessed(p=>p+1);

          // 2) 서버 반영 (웹: uid 없으면 생략)
          if (Platform.OS === 'web') {
            const uid = firebaseAuth.currentUser?.uid;
            if (!uid) { continue; }
            const usersRef = collection(firestore, 'users');
            let targetSnap = await getDocs(query(usersRef, where('phone', '==', `+${digits}`), limit(1)));
            if (targetSnap.empty) {
              const altSnap = await getDocs(query(usersRef, where('phone', '==', digits), limit(1)));
              if (!altSnap.empty) targetSnap = altSnap;
            }
            if (!targetSnap.empty) {
              const targetId = targetSnap.docs[0].id;
              await setDoc(doc(usersRef, uid, 'friends', targetId), {
                displayName: (targetSnap.docs[0].data() as any).displayName || c.name,
                phone: `+${digits}`,
                status: 'linked',
                createdAt: serverTimestamp(),
              });
              const me = firebaseAuth.currentUser;
              await setDoc(doc(usersRef, targetId, 'friends', uid), {
                displayName: me?.displayName || 'Unknown',
                phone: null,
                status: 'linked',
                createdAt: serverTimestamp(),
              });
              success++;
            } else {
              await addDoc(collection(firestore, 'invites'), {
                phone: `+${digits}`,
                inviterId: uid,
                inviterName: firebaseAuth.currentUser?.displayName || 'Unknown',
                status: 'pending',
                createdAt: serverTimestamp(),
              });
            }
          } else {
            // 네이티브: Firestore 직접 처리
            const uid = firebaseAuth.currentUser?.uid;
            if (uid) {
              const usersRef = collection(firestore, 'users');
              let targetSnap = await getDocs(query(usersRef, where('phone', '==', `+${digits}`), limit(1)));
              if (targetSnap.empty) {
                const altSnap = await getDocs(query(usersRef, where('phone', '==', digits), limit(1)));
                if (!altSnap.empty) targetSnap = altSnap;
              }
              if (!targetSnap.empty) {
                const targetId = targetSnap.docs[0].id;
                await setDoc(doc(usersRef, uid, 'friends', targetId), {
                  displayName: (targetSnap.docs[0].data() as any).displayName || c.name,
                  phone: `+${digits}`,
                  status: 'linked',
                  createdAt: serverTimestamp(),
                });
                const me = firebaseAuth.currentUser;
                await setDoc(doc(usersRef, targetId, 'friends', uid), {
                  displayName: me?.displayName || 'Unknown',
                  phone: null,
                  status: 'linked',
                  createdAt: serverTimestamp(),
                });
                success++;
              } else {
                await addDoc(collection(firestore, 'invites'), {
                  phone: `+${digits}`,
                  inviterId: uid,
                  inviterName: firebaseAuth.currentUser?.displayName || 'Unknown',
                  status: 'pending',
                  createdAt: serverTimestamp(),
                });
              }
            }
          }
        } catch {
          // 서버 실패는 로컬 반영 유지
          continue;
        }
      }
      await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, 500)));
      Alert.alert(
        t('bulkAddFriends', language),
        `연결 ${success}명, 초대 ${invited}명, 제외/실패 ${skipped}명`,
        [
          { text: '확인', onPress: () => router.push('/chat/friends') }
        ]
      );
    } finally {
      setLoading(false);
      setTimeout(()=>{ setBulkProcessed(0); setBulkTotal(0); }, 500);
    }
  }, [contacts, excluded, normalizePhone]);

  return (
    <>
      <ThemedView style={styles.container}>
        {/* 커스텀 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <MaterialIcons name="arrow-back" size={20} color="#FFD700" />
            </TouchableOpacity>
            <ThemedText style={styles.titleLeft}>{t('addFriendByContacts', language)}</ThemedText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* 안내 배너 */}
        {!supported && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>연락처 기능이 설치되지 않았습니다. `expo-contacts` 설치 후 이용해 주세요.</Text>
          </View>
        )}
        {supported && permission === 'denied' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>연락처 접근 권한이 필요합니다. 설정에서 허용해 주세요.</Text>
          </View>
        )}

        {/* 본문 상단: 동기화 + 검색 */}
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
          <View style={{ flexDirection:'row', justifyContent:'center', gap: 8, flexWrap:'wrap' }}>
            <TouchableOpacity style={[styles.syncBtn, styles.syncBtnBig]} onPress={loadContacts}>
              <Text style={styles.syncBtnText}>{t('syncPhone', language)}</Text>
            </TouchableOpacity>
            {contacts.length > 0 && (
            <TouchableOpacity style={[styles.syncBtn, styles.syncBtnBig, { backgroundColor:'#2E003E', borderColor:'#9575CD', opacity: loading ? 0.7 : 1 }]} onPress={addAllContactsToFriends} disabled={loading}>
                <Text style={styles.syncBtnText}>
                  {(() => {
                    const eligible = contacts
                      .filter(c => !excluded[c.id])
                      .map(c => normalizePhone(c.phone))
                      .filter(d => !!d);
                    const totalEligible = new Set(eligible).size;
                    const addable = eligible
                      .filter(d => d && !isAlreadyFriend(d) && !addedPhones[d]);
                    const addableCount = new Set(addable).size;
                    return loading ? `${t('processing', language)} (${bulkProcessed}/${bulkTotal || addableCount})` : `${t('bulkAddFriends', language)} (${addableCount}/${totalEligible})`;
                  })()}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('searchNameOrNumber', language)}
              placeholderTextColor="#888"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* 요약/컨트롤 바 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
          <Text style={{ color: '#CFCFCF', fontSize: 12 }}>{t('totalLabel', language)} {contacts.length}{t('peopleSuffix', language)}</Text>
          <Text style={{ color: '#777', fontSize: 12 }}>{t('excludedLabel', language)} {Object.keys(excluded).filter(k=>excluded[k]).length}{t('peopleSuffix', language)}</Text>
        </View>

        {/* 목록 */}
        {/* 로딩 중에도 목록은 사용 가능 - 하단에 진행 상태만 표시 */}
          <FlatList
            data={(() => {
              const qd = normalizePhone(query);
              const matchId = qd.length >= 7 ? contacts.find(c => normalizePhone(c.phone) === qd)?.id : undefined;
              return filtered.filter(c => c.id !== matchId);
            })()}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
            ListHeaderComponent={() => {
              const qd = normalizePhone(query);
              if (qd.length < 7) return null;
              const matched = contacts.find(c => normalizePhone(c.phone) === qd);
              const friendExactName = friendNameByPhone[qd] || friendNameByPhone['+'+qd];
              const suggestions = (() => {
                const fromContacts = contacts.filter(c => (c.phone ?? '').replace(/\D/g,'').includes(qd)).map(c => ({ name: c.name, phone: c.phone || '' }));
                const fromFriends: { name: string; phone: string }[] = [];
                Object.keys(friendNameByPhone).forEach(k => {
                  const pure = k.replace(/\D/g,'');
                  if (pure.includes(qd)) { fromFriends.push({ name: friendNameByPhone[k], phone: k }); }
                });
                const seen = new Set<string>();
                const merged: { name: string; phone: string }[] = [];
                [...fromContacts, ...fromFriends].forEach(item => {
                  const key = (item.phone || '').replace(/\D/g,'');
                  if (!seen.has(key) && key) { seen.add(key); merged.push(item); }
                });
                return merged.slice(0, 10);
              })();
              return (
                <View>
                  {/* 새 번호/정확 일치 카드 */}
                  <View style={styles.itemRow}>
                    <View style={styles.itemCol}>
                      <ThemedText style={styles.name}>{matched?.name || friendExactName || qd}</ThemedText>
                      <Text style={styles.phone}>{matched?.phone || (friendExactName ? '친구 번호 일치' : '새 번호')}</Text>
                    </View>
                    {(() => { const done = addedPhones[qd] === true || isAlreadyFriend(qd); return (
                      <TouchableOpacity style={[styles.addBtn, done && styles.addBtnDone]} disabled={done} onPress={() => matched ? onInvite(matched) : onInviteByPhone(qd)}>
                        <Text style={[styles.addBtnText, done && styles.addBtnTextDone]}>{done ? t('done', language) : t('addFriend', language)}</Text>
                      </TouchableOpacity>
                    ); })()}
                  </View>
                  {/* 일치하는 친구 리스트 */}
                  {suggestions.length > 0 && (
                    <View style={{ paddingVertical: 6 }}>
                      <Text style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>일치하는 친구</Text>
                      {suggestions.map(s => (
                        <View key={`sugg-${s.phone}`} style={styles.itemRow}>
                          <View style={styles.itemCol}>
                            <ThemedText style={styles.name}>{s.name}</ThemedText>
                            <Text style={styles.phone}>{s.phone}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            }}
            renderItem={({ item }) => (
              <View style={styles.itemRow}>
                <View style={styles.itemCol}>
                  <ThemedText style={styles.name}>{item.name}</ThemedText>
                  <Text style={styles.phone}>{item.phone ?? '번호없음'}</Text>
                </View>
                <TouchableOpacity onPress={async () => {
                  const id = item.id;
                  const next = { ...excluded, [id]: !excluded[id] };
                  setExcluded(next);
                  try { await AsyncStorage.setItem('contacts.excluded', JSON.stringify(next)); } catch {}
                }} style={[styles.excludeBtn, excluded[item.id] && { backgroundColor: '#444', borderColor: '#666' }]}>
                  <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 16 }}>-</Text>
                </TouchableOpacity>
                {(() => { const d = normalizePhone(item.phone); const done = !!addedPhones[d] || isAlreadyFriend(d); return (
                  <TouchableOpacity style={[styles.addBtn, done && styles.addBtnDone]} disabled={done} onPress={() => onInvite(item)}>
                    <Text style={[styles.addBtnText, done && styles.addBtnTextDone]}>{done ? t('done', language) : t('addFriend', language)}</Text>
                  </TouchableOpacity>
                ); })()}
              </View>
            )}
            ListEmptyComponent={
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ThemedText style={{ color: '#B8B8B8' }}>{t('noContactsToShow', language)}</ThemedText>
              </View>
            }
            ListFooterComponent={loading ? (
              <View style={{ paddingVertical: 12, alignItems:'center', justifyContent:'center' }}>
                <ActivityIndicator size="small" color="#FFD700" />
                <Text style={{ color:'#AAA', fontSize:12, marginTop:6 }}>동기화 중...</Text>
              </View>
            ) : null}
          />

        {/* 새 번호 추가 모달 */}
        {addVisible && (
          <View style={styles.overlay} pointerEvents="auto">
            <View style={styles.card}>
              <Text style={styles.cardTitle}>새 번호 추가</Text>
              <View style={styles.field}>
                <Text style={styles.label}>전화번호</Text>
                <Text style={styles.value}>{addPhone}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>친구 이름</Text>
                <TextInput
                  style={styles.input}
                  placeholder="이름 입력"
                  placeholderTextColor="#888"
                  value={addName}
                  onChangeText={setAddName}
                />
              </View>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btn} onPress={() => setAddVisible(false)}>
                  <Text style={styles.btnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={confirmAddFriend}>
                  <Text style={styles.btnPrimaryText}>추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ThemedView>
      <ChatBottomBar active="chat" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#D4AF37',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleLeft: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  syncBtn: { paddingHorizontal: 18, height: 40, borderRadius: 10, backgroundColor: '#4A148C', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7E57C2' },
  syncBtnBig: { alignSelf: 'center', marginBottom: 12, paddingHorizontal: 22, height: 46, borderRadius: 12 },
  syncBtnText: { color: '#EDE7F6', fontWeight: '900', fontSize: 14 },
  banner: { backgroundColor: '#231F00', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#3A3000' },
  bannerText: { color: '#FFD700', fontSize: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, height: 36 },
  searchInput: { flex: 1, color: '#EDEDED', fontSize: 13 },
  refreshBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD700' },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#212121' },
  itemCol: { flex: 1, paddingRight: 10 },
  name: { color: '#F6F6F6', fontSize: 15, fontWeight: '700' },
  phone: { color: '#9BA1A6', fontSize: 12, marginTop: 2 },
  inlineInput: { marginTop: 6, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: '#EDEDED', backgroundColor: '#1A1A1A' },
  addBtn: { paddingHorizontal: 12, height: 32, borderRadius: 8, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD700' },
  addBtnText: { color: '#0C0C0C', fontWeight: '900', fontSize: 12 },
  addBtnDone: { backgroundColor: '#1A1A1A', borderColor: '#2A2A2A' },
  addBtnTextDone: { color: '#9BA1A6' },
  excludeBtn: { marginRight: 8, width: 32, height: 32, borderRadius: 8, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 300, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 14 },
  cardTitle: { color: '#FFF', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  field: { marginBottom: 10 },
  label: { color: '#B8B8B8', fontSize: 12, marginBottom: 4 },
  value: { color: '#EDEDED', fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#EDEDED', backgroundColor: '#1A1A1A' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  btn: { paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#DDD' },
  btnPrimary: { backgroundColor: '#D4AF37', borderColor: '#FFD700' },
  btnPrimaryText: { color: '#0C0C0C', fontWeight: '900' },
});


