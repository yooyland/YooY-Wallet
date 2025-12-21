import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View, TextInput, ScrollView, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import { router, Redirect, useRootNavigationState } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTransactionStore } from '@/src/stores/transaction.store';

export default function AdminTransactions() {
  const { currentUser } = useAuth();
  const admin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!admin) return <Redirect href="/(tabs)/dashboard" />;

  const { getTransactions } = useTransactionStore();
  const [query, setQuery] = React.useState('');
  const [reportedOnly, setReportedOnly] = React.useState(false);
  const txs = React.useMemo(() => getTransactions({ limit: 2000 }), [getTransactions]);
  const [reportedMap, setReportedMap] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('admin.reported.tx');
        const arr: string[] = raw ? JSON.parse(raw) : [];
        setReportedMap(Object.fromEntries(arr.map(id => [id, true])));
      } catch {}
    })();
  }, []);

  const toggleReport = async (id: string) => {
    const next = !reportedMap[id];
    setReportedMap(prev => ({ ...prev, [id]: next }));
    try {
      const raw = await AsyncStorage.getItem('admin.reported.tx');
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const out = next ? Array.from(new Set([...arr, id])) : arr.filter(x => x !== id);
      await AsyncStorage.setItem('admin.reported.tx', JSON.stringify(out));
    } catch {
      Alert.alert('오류', '신고 상태 저장에 실패했습니다.');
    }
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return txs
      .filter((t: any) => !reportedOnly || reportedMap[t.id])
      .filter((t: any) => {
        if (!q) return true;
        const fields = [
          t.id,
          t.type,
          t.symbol,
          t.status,
          String(t.amount),
          String(t.change),
          t.from,
          t.to,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return fields.includes(q);
      })
      .sort((a: any, b: any) => (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  }, [txs, query, reportedOnly, reportedMap]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Transactions</ThemedText>
      </View>

      <View style={[styles.card, { marginBottom: 8 }]}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={styles.search}
            placeholder="Search (id, type, symbol, addr...)"
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={()=>setReportedOnly(v=>!v)} style={[styles.pill, reportedOnly && styles.pillActive]}>
            <ThemedText style={[styles.pillText, reportedOnly && styles.pillTextActive]}>Reported</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { paddingHorizontal:0, paddingVertical:0 }]}>
        <ScrollView style={{ maxHeight: '78%' }}>
          {filtered.length === 0 ? (
            <View style={{ padding:12 }}><ThemedText style={{ color:'#9CA3AF' }}>No transactions</ThemedText></View>
          ) : (
            filtered.map((tx: any) => {
              const rep = !!reportedMap[tx.id];
              return (
                <View key={tx.id} style={styles.row}>
                  <View style={{ flex:1 }}>
                    <ThemedText style={{ color:'#EDEDED', fontWeight:'700' }} numberOfLines={1}>{tx.type?.toUpperCase?.() || 'TX'} · {tx.symbol || ''} · {tx.amount ?? tx.change ?? ''}</ThemedText>
                    <ThemedText style={{ color:'#9CA3AF', fontSize:12 }} numberOfLines={1}>{new Date(tx.timestamp).toLocaleString()}</ThemedText>
                    {!!(tx.from||tx.to) && (
                      <ThemedText style={{ color:'#777', fontSize:11 }} numberOfLines={1}>{(tx.from||'').slice(0,10)} → {(tx.to||'').slice(0,10)}</ThemedText>
                    )}
                  </View>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    {rep ? (<View style={styles.badge}><ThemedText style={styles.badgeText}>REPORTED</ThemedText></View>) : null}
                    <TouchableOpacity onPress={()=>toggleReport(tx.id)} style={[styles.actionBtn, rep && { borderColor:'#7A1F1F' }]}>
                      <ThemedText style={[styles.actionText, rep && { color:'#FF6B6B' }]}>{rep ? 'Unreport' : 'Report'}</ThemedText>
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
  search: { flex:1, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, paddingHorizontal:10, paddingVertical:8 },
  pill: { paddingHorizontal:10, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' },
  pillActive: { borderColor:'#FFD700' },
  pillText: { color:'#9CA3AF' },
  pillTextActive: { color:'#FFD700', fontWeight:'800' },
  row: { paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#141414', flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  actionBtn: { paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#FFD700' },
  actionText: { color:'#FFD700', fontWeight:'800' },
  badge: { paddingHorizontal:8, paddingVertical:4, borderRadius:6, backgroundColor:'#3B0F0F', borderWidth:1, borderColor:'#7A1F1F' },
  badgeText: { color:'#FF6B6B', fontWeight:'900', fontSize:10 },
});


