import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router, Stack } from 'expo-router';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { addDoc, collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { ADMINS } from '@/constants/admins';

export default function AddFriendIdScreen() {
  const { language } = usePreferences();
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; displayName?: string; username?: string; email?: string; avatar?: string; phone?: string; installed?: boolean }>>([]);
  const [friendIds, setFriendIds] = useState<Record<string, boolean>>({});
  const profilesMap = useChatProfileStore((s) => s.profiles);

  // 내 친구 목록(IDs) 로드 → 이미 친구인 경우 버튼 비활성화
  useEffect(() => {
    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) return;
        const ref = collection(firestore, 'users', uid, 'friends');
        const snap = await getDocs(ref);
        const map: Record<string, boolean> = {};
        snap.forEach((d) => { map[d.id] = true; });
        setFriendIds(map);
      } catch {}
    })();
  }, []);

  const onSearch = async () => {
    const kw = keyword.trim();
    if (!kw) { setResults([]); return; }
    setLoading(true);
    try {
      const lower = kw.toLowerCase();
      const usersRef = collection(firestore, 'users');
      const qs = [
        // exact equality fallbacks
        query(usersRef, where('username', '==', kw), limit(10)),
        query(usersRef, where('email', '==', kw), limit(10)),
        query(usersRef, where('displayName', '==', kw), limit(10)),
        // lower-case equality (if fields exist)
        query(usersRef, where('usernameLower', '==', lower), limit(10)),
        query(usersRef, where('emailLower', '==', lower), limit(10)),
        query(usersRef, where('displayNameLower', '==', lower), limit(10)),
        // prefix range queries for partial match (require lower-case fields)
        query(usersRef, where('usernameLower', '>=', lower), where('usernameLower', '<=', lower + '\uf8ff'), limit(10)),
        query(usersRef, where('displayNameLower', '>=', lower), where('displayNameLower', '<=', lower + '\uf8ff'), limit(10)),
        query(usersRef, where('emailLower', '>=', lower), where('emailLower', '<=', lower + '\uf8ff'), limit(10)),
        // prefix range queries on original fields too (대소문자 구분)
        query(usersRef, where('username', '>=', kw), where('username', '<=', kw + '\\uf8ff'), limit(10)),
        query(usersRef, where('displayName', '>=', kw), where('displayName', '<=', kw + '\\uf8ff'), limit(10)),
        query(usersRef, where('email', '>=', kw), where('email', '<=', kw + '\\uf8ff'), limit(10)),
      ];
      const map = new Map<string, any>();
      for (const qy of qs) {
        try {
          const snap = await getDocs(qy);
          snap.forEach((d) => {
            if (!map.has(d.id)) map.set(d.id, { id: d.id, ...(d.data() as any), installed: true });
          });
        } catch {}
      }
      // 채팅 프로필(로컬 저장) 병합 검색: displayName 포함/일치, userId 일치
      try {
        const values = Object.values(profilesMap || {}) as any[];
        for (const p of values) {
          const pid = String(p.userId || p.id || '');
          if (!pid) continue;
          const dn = String(p.displayName || '').toLowerCase();
          const match = dn.includes(lower) || pid === kw;
          if (match) {
            if (!map.has(pid)) {
              map.set(pid, { id: pid, displayName: p.displayName, avatar: p.avatar, phone: null, email: null });
            } else {
              const ex = map.get(pid);
              map.set(pid, { ...ex, displayName: ex.displayName || p.displayName, avatar: ex.avatar || p.avatar });
            }
          }
        }
      } catch {}
      // UID 직접 입력 시 조회
      try {
        const byId = await getDoc(doc(firestore, 'users', kw));
        if (byId.exists()) { const u = byId.data() as any; map.set(byId.id, { id: byId.id, ...u, installed: true }); }
      } catch {}
      // 전화번호 검색: 숫자만 입력이고 7자리 이상일 때 정규화 변형으로 exact 매칭
      const digits = kw.replace(/\D/g, '');
      if (digits.length >= 7) {
        const variants = new Set<string>();
        variants.add(digits);
        if (digits.startsWith('0') && digits.length >= 9) {
          variants.add('82' + digits.slice(1));
          variants.add('+82' + digits.slice(1));
        }
        if (digits.startsWith('82')) {
          variants.add('0' + digits.slice(2));
          variants.add('+' + digits);
          variants.add('+82' + digits.slice(2));
        }
        for (const v of Array.from(variants)) {
          try {
            const snap = await getDocs(query(usersRef, where('phone', '==', v), limit(10)));
            snap.forEach((d) => { if (!map.has(d.id)) map.set(d.id, { id: d.id, ...(d.data() as any), installed: true }); });
          } catch {}
        }
      }
      // Admins 상수 기반 보강: 이메일 로컬파트/전체 매칭 → Firestore에서 ID 역조회 시도
      try {
        const kwLower = lower;
        const isEmail = kw.includes('@');
        const hits = ADMINS.filter(a => {
          if (isEmail) return a.email.toLowerCase().startsWith(kwLower);
          const local = a.email.split('@')[0].toLowerCase();
          return local.startsWith(kwLower);
        });
        for (const a of hits) {
          let gotId: string | null = null;
          try {
            const s = await getDocs(query(usersRef, where('email', '==', a.email), limit(1)));
            if (!s.empty) gotId = s.docs[0].id;
          } catch {}
          const key = gotId || `admin:${a.email}`;
          if (!map.has(key)) {
            map.set(key, { id: key, displayName: a.email.split('@')[0], email: a.email, installed: !!gotId });
          }
        }
      } catch {}
      const arrRaw = Array.from(map.values()).map((u: any) => ({
        id: String(u.id),
        displayName: u.displayName || u.username || u.email || u.id,
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        phone: u.phone,
        installed: !!u.installed,
      }));
      // 설치 사용자만 노출
      const arr = arrRaw.filter((u) => u.installed);
      setResults(arr);
    } finally {
      setLoading(false);
    }
  };

  const addFriend = async (user: { id: string; displayName?: string; email?: string; phone?: string; installed?: boolean; username?: string }) => {
    try {
      const me = firebaseAuth.currentUser?.uid;
      if (!me) { alert('로그인이 필요합니다.'); return; }
      if (user.id === me) { alert('본인은 추가할 수 없습니다.'); return; }
      // 대상 사용자 문서 ID 확보 시도(이메일/아이디 기반 역조회)
      let targetId = user.id;
      try {
        const usersRef = collection(firestore, 'users');
        if (targetId.startsWith('admin:') || user.installed === false) {
          if (user.email) {
            const s = await getDocs(query(usersRef, where('email', '==', user.email), limit(1)));
            if (!s.empty) targetId = s.docs[0].id;
          } else if (user.username) {
            const s = await getDocs(query(usersRef, where('username', '==', user.username), limit(1)));
            if (!s.empty) targetId = s.docs[0].id;
          }
        }
      } catch {}

      // 여전히 실사용자 ID를 찾지 못한 경우엔 초대(최후수단)
      if (!targetId || targetId.startsWith('admin:')) {
        try {
          const now = Date.now();
          await addDoc(collection(firestore, 'invites'), { inviterId: me, email: user.email || null, phone: user.phone || null, status: 'pending', createdAt: now });
          // 로컬 친구 리스트에도 즉시 반영(초대 상태)
          try {
            const key = 'local.friends';
            const raw = await AsyncStorage.getItem(key);
            const list: any[] = raw ? JSON.parse(raw) : [];
            const pseudoId = `invite:${user.email || user.phone || kw}`;
            const next = list.filter((x) => x.id !== pseudoId);
            next.unshift({ id: pseudoId, name: user.displayName || user.email || user.phone || String(kw), status: 'invited', phone: user.phone, email: user.email, addedAt: now });
            await AsyncStorage.setItem(key, JSON.stringify(next));
          } catch {}
          alert('초대를 보냈습니다.');
          try { router.push('/chat/friends'); } catch {}
          return;
        } catch {
          alert('초대에 실패했습니다.');
          return;
        }
      }

      const ref = doc(firestore, 'users', me, 'friends', targetId);
      const now = Date.now();
      await setDoc(ref, {
        displayName: user.displayName || '',
        email: user.email || null,
        phone: user.phone || null,
        status: 'linked',
        createdAt: now,
      }, { merge: true });
      // 로컬 캐시에도 즉시 반영(친구 상태 linked)
      try {
        const key = 'local.friends';
        const raw = await AsyncStorage.getItem(key);
        const list: any[] = raw ? JSON.parse(raw) : [];
        const next = list.filter((x) => x.id !== targetId);
        next.unshift({ id: targetId, name: user.displayName || user.email || user.phone || targetId, status: 'linked', phone: user.phone, email: user.email, addedAt: now });
        await AsyncStorage.setItem(key, JSON.stringify(next));
      } catch {}
      setFriendIds((m) => ({ ...m, [targetId]: true }));
      alert('친구로 추가되었습니다.');
      try { router.push('/chat/friends'); } catch {}
    } catch {
      alert('추가에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={20} color="#FFD700" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>{t('addFriendByIdTitle', language)}</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('friendIdOrEmail', language)}
            placeholderTextColor="#777"
            value={keyword}
            onChangeText={setKeyword}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={onSearch}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
            <Text style={styles.searchBtnText}>{t('search', language)}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 12 }}>
          {loading && (
            <View style={styles.resultBox}><ThemedText style={styles.resultText}>{t('processing', language)}</ThemedText></View>
          )}
          {!loading && results.length === 0 && (
            <View style={styles.resultBox}><ThemedText style={styles.resultText}>{t('noSearchResults', language)}</ThemedText></View>
          )}
          {!loading && results.map((u) => (
            <View key={u.id} style={styles.resultRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.resultName}>{u.displayName}</ThemedText>
                <ThemedText style={styles.resultMeta}>{u.username || u.email || u.id}{u.installed === false ? ' · 미설치(초대 가능)' : ''}</ThemedText>
              </View>
              <TouchableOpacity
                style={[styles.addBtn, friendIds[u.id] && { borderColor: '#2A2A2A', opacity: 0.6 }]}
                onPress={() => addFriend(u)}
                disabled={!!friendIds[u.id]}
              >
                <Text style={[styles.addBtnText, friendIds[u.id] && { color: '#999' }]}>{t('addFriend', language)}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ThemedView>
      <ChatBottomBar active="chat" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#EDEDED', backgroundColor: '#141414' },
  searchBtn: { paddingHorizontal: 12, height: 36, borderRadius: 8, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD700' },
  searchBtnText: { color: '#0C0C0C', fontWeight: '900' },
  resultBox: { marginTop: 6, padding: 12, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultText: { color: '#EDEDED' },
  resultRow: { marginTop: 8, padding: 12, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultName: { color: '#F6F6F6', fontWeight: '700' },
  resultMeta: { color: '#9BA1A6', fontSize: 12, marginTop: 2 },
  addBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFD700',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addBtnText: { color: '#FFD700', fontWeight: '800', letterSpacing: 0.2 },
});


