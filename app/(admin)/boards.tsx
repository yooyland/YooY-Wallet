import React, { useEffect, useMemo, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View, TextInput, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Redirect, useRootNavigationState } from 'expo-router';

type BoardType = 'bug' | 'inquiry' | 'report';
type Post = {
  id: string;
  uid: string;
  email: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  reply?: string;
  status?: 'open' | 'answered';
};

export default function AdminBoardsOverview() {
  const { currentUser } = useAuth();
  const admin = currentUser?.email ? isAdmin(currentUser.email) : false;

  const [all, setAll] = useState<Array<Post & { board: BoardType }>>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all'|'open'|'answered'>('all');
  const [start, setStart] = useState<string>(''); // YYYY-MM-DD
  const [end, setEnd] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const keys: Array<[BoardType, string]> = [
          ['bug','board:bug'],
          ['inquiry','board:inquiry'],
          ['report','board:report'],
        ];
        const lists: Array<Post & { board: BoardType }>[] = [];
        for (const [board, key] of keys) {
          const raw = await AsyncStorage.getItem(key);
          const list: Post[] = raw ? JSON.parse(raw) : [];
          lists.push(...list.map(p => ({ ...p, board })));
        }
        setAll(lists.sort((a,b)=>b.createdAt-a.createdAt));
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = start ? new Date(start.replace(/-/g,'/')).getTime() : -Infinity;
    const e = end ? new Date(end.replace(/-/g,'/')).getTime() + 24*3600*1000 - 1 : Infinity;
    const qq = q.trim().toLowerCase();
    return all.filter(p => {
      if (status !== 'all' && (p.status||'open') !== status) return false;
      if (!(p.createdAt>=s && p.createdAt<=e)) return false;
      if (qq && !(`${p.title} ${p.content} ${p.email}`.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [all, q, status, start, end]);

  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!admin) return <Redirect href="/(tabs)/dashboard" />;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Boards Overview</ThemedText>
      </View>

      {/* Filters */}
      <View style={styles.card}>
        <View style={styles.filterRow}>
          <View style={{ flex:1 }}>
            <ThemedText style={styles.label}>검색</ThemedText>
            <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="제목/내용/이메일" placeholderTextColor="#666" />
          </View>
        </View>
        <View style={styles.filterRow}>
          <View style={{ flex:1 }}>
            <ThemedText style={styles.label}>시작일(YYYY-MM-DD)</ThemedText>
            <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="예: 2025-01-01" placeholderTextColor="#666" />
          </View>
          <View style={{ width:10 }} />
          <View style={{ flex:1 }}>
            <ThemedText style={styles.label}>종료일(YYYY-MM-DD)</ThemedText>
            <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="예: 2025-12-31" placeholderTextColor="#666" />
          </View>
        </View>
        <View style={styles.filterRow}>
          <ThemedText style={styles.label}>상태</ThemedText>
          <View style={{ flexDirection:'row', gap:8 }}>
            {(['all','open','answered'] as const).map(st=>(
              <TouchableOpacity key={st} onPress={()=>setStatus(st)} style={[styles.statusBtn, status===st && styles.statusBtnActive]}>
                <ThemedText style={[styles.statusText, status===st && styles.statusTextActive]}>{st.toUpperCase()}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {filtered.length === 0 ? (
          <View style={styles.card}><ThemedText style={{ color:'#9CA3AF' }}>일치하는 글이 없습니다.</ThemedText></View>
        ) : filtered.map(p => (
          <TouchableOpacity key={`${p.board}-${p.id}`} style={styles.card} onPress={()=>router.push(`/support/${p.board}?focus=${p.id}` as any)}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <ThemedText style={{ color:'#FFD700', fontWeight:'800' }}>{p.board.toUpperCase()}</ThemedText>
              <ThemedText style={[styles.status, { color:(p.status||'open')==='answered'?'#22C55E':'#FFD700' }]}>{(p.status||'open').toUpperCase()}</ThemedText>
            </View>
            <ThemedText style={styles.postTitle}>{p.title}</ThemedText>
            <ThemedText style={styles.postMeta}>{p.email} · {new Date(p.createdAt).toLocaleString()}</ThemedText>
            <ThemedText style={styles.postBody}>{p.content}</ThemedText>
            {p.reply ? (
              <View style={{ marginTop:8, borderTopWidth:1, borderTopColor:'#222', paddingTop:8 }}>
                <ThemedText style={{ color:'#FFD700', fontWeight:'800', marginBottom:4 }}>답변</ThemedText>
                <ThemedText style={{ color:'#E5E7EB' }}>{p.reply}</ThemedText>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  filterRow: { flexDirection:'row', alignItems:'center', marginBottom:8 },
  label: { color:'#E5E7EB', marginBottom:4 },
  input: { backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, paddingHorizontal:10, paddingVertical:8 },
  statusBtn: { paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#333' },
  statusBtnActive: { backgroundColor:'#FFD700', borderColor:'#FFD700' },
  statusText: { color:'#E5E7EB', fontWeight:'700' },
  statusTextActive: { color:'#000', fontWeight:'900' },
  postTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:16 },
  postMeta: { color:'#9CA3AF', marginBottom:6 },
  postBody: { color:'#E5E7EB' },
  status: { fontWeight:'800' },
});


