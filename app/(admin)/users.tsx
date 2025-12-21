import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View, TextInput, ScrollView, Image, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import { router, Redirect, useRootNavigationState } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firestore가 있으면 사용, 없으면 로컬로 동작
let firestore: any = null;
let collection: any = null;
let onSnapshot: any = null;
let doc: any = null;
let setDoc: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fb = require('firebase/firestore');
  firestore = require('@/lib/firebase').firestore;
  collection = fb.collection;
  onSnapshot = fb.onSnapshot;
  doc = fb.doc;
  setDoc = fb.setDoc;
} catch {}

export default function AdminUsers() {
  const { currentUser } = useAuth();
  const admin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!admin) return <Redirect href="/(tabs)/dashboard" />;

  const [query, setQuery] = React.useState('');
  const [list, setList] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [blackMap, setBlackMap] = React.useState<Record<string, boolean>>({});

  // 로컬 블랙리스트 저장소
  const loadLocalBlack = React.useCallback(async () => {
    try { const raw = await AsyncStorage.getItem('admin.blacklist'); return raw ? (JSON.parse(raw) as string[]) : []; } catch { return []; }
  }, []);
  const saveLocalBlack = React.useCallback(async (uids: string[]) => {
    try { await AsyncStorage.setItem('admin.blacklist', JSON.stringify(Array.from(new Set(uids)))); } catch {}
  }, []);

  React.useEffect(() => {
    let unsub: any = null;
    (async () => {
      setLoading(true);
      try {
        if (firestore && collection && onSnapshot) {
          unsub = onSnapshot(collection(firestore, 'users'), (snap: any) => {
            const arr: any[] = [];
            snap.forEach((d: any) => { const v = d.data() || {}; arr.push({ id: d.id, ...v }); });
            setList(arr);
            setLoading(false);
          }, () => setLoading(false));
        } else {
          // 폴백: 로컬에 저장된 최근 사용자 목록이 있다면 표시
          const raw = await AsyncStorage.getItem('admin.users.cache');
          setList(raw ? JSON.parse(raw) : []);
          setLoading(false);
        }
      } catch { setLoading(false); }
      // 블랙맵 초기화
      try {
        const local = await loadLocalBlack();
        setBlackMap(Object.fromEntries(local.map(uid => [uid, true])));
      } catch {}
    })();
    return () => { try { unsub?.(); } catch {} };
  }, [loadLocalBlack]);

  const toggleBlack = async (u: any) => {
    const uid = String(u?.id || u?.uid || '');
    if (!uid) return;
    const next = !blackMap[uid];
    setBlackMap(prev => ({ ...prev, [uid]: next }));
    try {
      if (firestore && doc && setDoc) {
        await setDoc(doc(firestore, 'users', uid), { blacklisted: next }, { merge: true });
      }
      const local = await loadLocalBlack();
      const nextArr = next ? Array.from(new Set([...local, uid])) : local.filter(v => v !== uid);
      await saveLocalBlack(nextArr);
    } catch {
      Alert.alert('오류', '상태 저장 중 문제가 발생했습니다.');
    }
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) => {
      const name = String(u.displayName || u.name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const uid = String(u.id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || uid.includes(q);
    });
  }, [list, query]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Users</ThemedText>
      </View>

      <View style={[styles.card, { marginBottom: 8 }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.search}
          placeholder="Search by name, email, uid"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
      </View>

      <View style={[styles.card, { paddingHorizontal:0, paddingVertical:0 }]}>
        <ScrollView style={{ maxHeight: '78%' }}>
          {loading ? (
            <View style={{ padding:12 }}><ThemedText style={{ color:'#9CA3AF' }}>Loading...</ThemedText></View>
          ) : filtered.length === 0 ? (
            <View style={{ padding:12 }}><ThemedText style={{ color:'#9CA3AF' }}>No users</ThemedText></View>
          ) : (
            filtered.map((u) => {
              const uid = String(u?.id || '');
              const isBlack = !!blackMap[uid] || !!u?.blacklisted;
              return (
                <View key={uid} style={styles.row}>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:10, flex:1 }}>
                    {u?.avatar ? (
                      <Image source={{ uri: String(u.avatar) }} style={{ width:28, height:28, borderRadius:14 }} />
                    ) : (
                      <View style={{ width:28, height:28, borderRadius:14, backgroundColor:'#333' }} />
                    )}
                    <View style={{ flex:1 }}>
                      <ThemedText style={{ color:'#EDEDED', fontWeight:'700' }} numberOfLines={1}>{u.displayName || u.name || uid}</ThemedText>
                      <ThemedText style={{ color:'#9CA3AF', fontSize:12 }} numberOfLines={1}>{u.email || '-'}</ThemedText>
                    </View>
                  </View>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    {isBlack ? (
                      <View style={styles.badgeBlack}><ThemedText style={styles.badgeBlackText}>BLACK</ThemedText></View>
                    ) : null}
                    <TouchableOpacity
                      onPress={()=>toggleBlack(u)}
                      style={[styles.actionBtn, isBlack ? { borderColor:'#7A1F1F' } : {}]}
                    >
                      <ThemedText style={[styles.actionText, isBlack ? { color:'#FF6B6B' } : {}]}>{isBlack ? 'Unblacklist' : 'Blacklist'}</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D' },
  headerRow: { flexDirection:'row', alignItems:'center', gap:8, padding:16, paddingBottom:8 },
  backBtn: { width:32, height:32, borderRadius:6, borderWidth:1, borderColor:'#2A2A2A', alignItems:'center', justifyContent:'center', backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:16 },
  headerTitle: { color:'#FFFFFF', fontWeight:'900', fontSize:18 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginHorizontal:16, marginBottom:12 },
  search: { backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, paddingHorizontal:10, paddingVertical:8 },
  row: { paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#141414', flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  actionBtn: { paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#FFD700' },
  actionText: { color:'#FFD700', fontWeight:'800' },
  badgeBlack: { paddingHorizontal:8, paddingVertical:4, borderRadius:6, backgroundColor:'#3B0F0F', borderWidth:1, borderColor:'#7A1F1F' },
  badgeBlackText: { color:'#FF6B6B', fontWeight:'900', fontSize:10 },
});


