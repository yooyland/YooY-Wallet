import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, Image, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';

type RecommendedUser = { uid: string; name: string; avatar?: string; email?: string; score?: number };

const ADMIN_EMAILS = ['admin@yooyland.com','jch4389@gmail.com','landyooy@gmail.com'];

function tokenizeProfileText(raw: string | null | undefined): string[] {
  const s = String(raw || '')
    .toLowerCase()
    .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣#@.\s_-]/gi, ' ');
  const parts = s.split(/\s+/).filter((w) => w.length >= 2);
  return Array.from(new Set(parts)).slice(0, 12);
}

export default function AddFriendRecommendedScreen() {
  const { language } = usePreferences();
  const currentProfile = useChatProfileStore((s) => s.currentProfile);
  const [data, setData] = React.useState<RecommendedUser[]>([]);
  const [friendsSet, setFriendsSet] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);

  const me = firebaseAuth.currentUser?.uid || '';

  const loadFriends = React.useCallback(async () => {
    if (!me) return {} as Record<string, boolean>;
    try {
      const snap = await getDocs(collection(firestore, 'users', me, 'friends'));
      const set: Record<string, boolean> = {};
      snap.forEach(d => { set[d.id] = true; });
      setFriendsSet(set);
      return set;
    } catch { return {}; }
  }, [me]);

  const fetchAdmins = React.useCallback(async (): Promise<RecommendedUser[]> => {
    try {
      const q = query(collection(firestore, 'users'), where('email', 'in', ADMIN_EMAILS));
      const snap = await getDocs(q);
      const arr: RecommendedUser[] = [];
      snap.forEach(d => {
        const u: any = d.data() || {};
        arr.push({ uid: d.id, name: u.chatName || u.displayName || u.name || u.email || d.id, avatar: u.avatar || u.photoURL, email: u.email, score: 1000 });
      });
      // 혹시 문서가 없으면 이메일만으로 Fallback 항목 생성
      if (arr.length < ADMIN_EMAILS.length) {
        ADMIN_EMAILS.forEach(em => {
          if (!arr.find(x => x.email === em)) {
            arr.push({ uid: em, name: em.split('@')[0], email: em, score: 1000 });
          }
        });
      }
      return arr;
    } catch { return []; }
  }, []);

  /** Firestore tags + 내 채팅 프로필(소개·상태·태그)에서 토큰을 모아 공통 관심사 기반 추천 */
  const fetchByTags = React.useCallback(async (): Promise<RecommendedUser[]> => {
    try {
      const termSet = new Set<string>();
      try {
        const meDoc = await getDoc(doc(firestore, 'users', me));
        const d: any = meDoc.exists() ? meDoc.data() : {};
        if (Array.isArray(d.tags)) {
          d.tags.forEach((t: any) => termSet.add(String(t).toLowerCase().trim()));
        }
        tokenizeProfileText(d.bio).forEach((w) => termSet.add(w));
        tokenizeProfileText(d.customStatus || d.statusMessage).forEach((w) => termSet.add(w));
      } catch {}
      try {
        if (currentProfile?.tags?.length) {
          currentProfile.tags.forEach((t) => termSet.add(String(t).toLowerCase().trim()));
        }
        tokenizeProfileText(currentProfile?.bio).forEach((w) => termSet.add(w));
        tokenizeProfileText(currentProfile?.customStatus).forEach((w) => termSet.add(w));
        if (currentProfile?.chatName) {
          tokenizeProfileText(currentProfile.chatName).forEach((w) => termSet.add(w));
        }
      } catch {}
      const myTags = Array.from(termSet).filter(Boolean).slice(0, 10);
      if (myTags.length === 0) return [];
      const q = query(collection(firestore, 'users'), where('tags', 'array-contains-any', myTags), limit(30));
      const snap = await getDocs(q);
      const arr: RecommendedUser[] = [];
      snap.forEach((d) => {
        if (d.id === me) return;
        const u: any = d.data() || {};
        const tags: string[] = Array.isArray(u.tags) ? u.tags.map((t: any) => String(t).toLowerCase()) : [];
        const bioWords = tokenizeProfileText(u.bio);
        let score = myTags.filter((t) => tags.includes(t)).length;
        score += bioWords.filter((w) => myTags.includes(w)).length;
        arr.push({
          uid: d.id,
          name: u.chatName || u.displayName || u.name || u.email || d.id,
          avatar: u.avatar || u.photoURL,
          email: u.email,
          score,
        });
      });
      return arr;
    } catch {
      return [];
    }
  }, [me, currentProfile?.tags, currentProfile?.bio, currentProfile?.customStatus, currentProfile?.chatName]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const friendSet = await loadFriends();
    const [admins, byTags] = await Promise.all([fetchAdmins(), fetchByTags()]);
    // 병합: 관리자 상단 고정 → 태그 추천 정렬
    const merged: RecommendedUser[] = [];
    const seen: Record<string, boolean> = {};
    const pushIf = (u: RecommendedUser) => {
      if (!u || seen[u.uid] || u.uid === me || friendSet[u.uid]) return;
      seen[u.uid] = true; merged.push(u);
    };
    admins.forEach(pushIf);
    byTags.sort((a,b)=> (b.score||0) - (a.score||0));
    byTags.forEach(pushIf);
    setData(merged);
    setLoading(false);
  }, [fetchAdmins, fetchByTags, loadFriends, me]);

  React.useEffect(() => {
    try {
      useChatProfileStore.getState().initialize?.();
    } catch {}
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const onAddFriend = useCallback(async (u: RecommendedUser) => {
    try {
      if (!me || !u?.uid) return;
      if (u.email && ADMIN_EMAILS.includes(u.email) && u.uid.includes('@')) {
        Alert.alert(t('error', language), '이 항목은 앱 가입 계정이 아닙니다. ID 검색으로 추가해 주세요.');
        return;
      }
      await Promise.all([
        setDoc(
          doc(firestore, 'users', me, 'friends', u.uid),
          {
            userId: u.uid,
            displayName: u.name,
            email: u.email || null,
            status: 'linked',
            createdAt: serverTimestamp(),
          },
          { merge: true },
        ),
        setDoc(
          doc(firestore, 'users', u.uid, 'friends', me),
          {
            userId: me,
            displayName: firebaseAuth.currentUser?.displayName || '',
            status: 'linked',
            createdAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);
      Alert.alert(t('addFriend', language), `${u.name} ${t('addedAsFriend', language)}`);
      setFriendsSet((s) => ({ ...s, [u.uid]: true }));
    } catch { Alert.alert(t('error', language), t('addFriendFailed', language)); }
  }, [me, language]);

  // FlatList renderItem 최적화: useCallback으로 추출
  const renderRecommendedItem = useCallback(({ item }: { item: RecommendedUser }) => (
    <View style={styles.item}>
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name||item.email||'U').charAt(0)}</Text></View>
      )}
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.name}>{item.name}</ThemedText>
        {!!item.email && (<Text style={{ color:'#888', fontSize: 11 }}>{item.email}</Text>)}
      </View>
      <TouchableOpacity
        style={[styles.addBtn, friendsSet[item.uid] && { opacity: 0.5 }]}
        disabled={!!friendsSet[item.uid]}
        onPress={() => onAddFriend(item)}
      >
        <Text style={styles.addText}>{friendsSet[item.uid] ? t('friendAdded', language) : t('addFriend', language)}</Text>
      </TouchableOpacity>
    </View>
  ), [friendsSet, onAddFriend, language]);

  return (
    <>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={20} color="#FFD700" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>{t('recommendedFriends', language)}</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <FlatList
          data={data}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={{ padding: 12 }}
          refreshing={loading}
          onRefresh={load}
          renderItem={renderRecommendedItem}
          ListEmptyComponent={!loading ? (
            <View style={{ paddingVertical: 40, alignItems:'center' }}>
              <Text style={{ color:'#888' }}>{t('noRecommendedFriends', language)}</Text>
            </View>
          ) : null}
        />
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
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#212121' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarImage: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarText: { color: '#FFD700', fontWeight: '700' },
  name: { color: '#EDEDED' },
  addBtn: { paddingHorizontal: 10, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700', backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#0C0C0C', fontWeight: '900' },
});


