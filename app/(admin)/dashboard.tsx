import React, { useEffect, useMemo, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import { useTransactionStore } from '@/src/stores/transaction.store';
import { router, Redirect, useRootNavigationState } from 'expo-router';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { language } = usePreferences();
  const isUserAdmin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const { getTransactions } = useTransactionStore();

  const txs = useMemo(() => getTransactions({ limit: 1000 }), [getTransactions]);
  const totalTx = txs.length;
  const rewardTx = txs.filter(tx => tx.type === 'reward' || tx.type === 'daily_reward' || tx.type === 'event_reward').length;
  const swapTx = txs.filter(tx => tx.type === 'swap').length;
  const stakingTx = txs.filter(tx => tx.type === 'staking').length;
  const latest5 = txs
    .slice()
    .sort((a,b)=> new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  // Support inbox (bug/inquiry/report) - admin overview
  type BoardType = 'bug'|'inquiry'|'report';
  type Post = { id:string; uid:string; email:string; title:string; content:string; createdAt:number; updatedAt:number; reply?:string; status?:'open'|'answered' };
  const [supportCounts, setSupportCounts] = useState<{ total:number; open:number; answered:number; byBoard: Record<BoardType, { total:number; open:number; answered:number }> }>({
    total: 0, open: 0, answered: 0, byBoard: { bug:{ total:0, open:0, answered:0 }, inquiry:{ total:0, open:0, answered:0 }, report:{ total:0, open:0, answered:0 } }
  });
  const [latestSupport, setLatestSupport] = useState<Array<Post & { board: BoardType }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const keys: Array<[BoardType, string]> = [['bug','board:bug'], ['inquiry','board:inquiry'], ['report','board:report']];
        const all: Array<Post & { board: BoardType }>[] = [];
        const byBoard: Record<BoardType, { total:number; open:number; answered:number }> = { bug:{ total:0, open:0, answered:0 }, inquiry:{ total:0, open:0, answered:0 }, report:{ total:0, open:0, answered:0 } };
        for (const [board, key] of keys) {
          const raw = await AsyncStorage.getItem(key);
          const list: Post[] = raw ? JSON.parse(raw) : [];
          byBoard[board].total = list.length;
          byBoard[board].open = list.filter(p => (p.status || 'open') === 'open').length;
          byBoard[board].answered = list.filter(p => (p.status || 'open') === 'answered').length;
          all.push(...list.map(p => ({ ...p, board })));
        }
        const totals = {
          total: Object.values(byBoard).reduce((a,b)=>a+b.total,0),
          open: Object.values(byBoard).reduce((a,b)=>a+b.open,0),
          answered: Object.values(byBoard).reduce((a,b)=>a+b.answered,0),
          byBoard
        };
        setSupportCounts(totals);
        setLatestSupport(all.sort((a,b)=> b.createdAt - a.createdAt).slice(0,5));
      } catch {}
    })();
  }, []);
  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!isUserAdmin) return <Redirect href="/(tabs)/dashboard" />;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding:16, gap: 12 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={async()=>{ try { await AsyncStorage.setItem('ui.menuOpenOnce','1'); } catch {} router.push('/(tabs)/dashboard'); }}
            style={styles.backBtn}
          >
            <ThemedText style={styles.backText}>←</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.header}>Admin Dashboard</ThemedText>
        </View>

        <View style={styles.grid}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>총 트랜잭션</ThemedText>
            <ThemedText style={styles.statValue}>{totalTx}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>리워드</ThemedText>
            <ThemedText style={styles.statValue}>{rewardTx}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>스왑</ThemedText>
            <ThemedText style={styles.statValue}>{swapTx}</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statLabel}>스테이킹</ThemedText>
            <ThemedText style={styles.statValue}>{stakingTx}</ThemedText>
          </View>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity style={styles.statCard} onPress={()=>router.push('/(admin)/boards')}>
            <ThemedText style={styles.statLabel}>지원 문의 총계</ThemedText>
            <ThemedText style={styles.statValue}>{supportCounts.total}</ThemedText>
            <ThemedText style={styles.smallMuted}>대기 {supportCounts.open} · 완료 {supportCounts.answered}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={()=>router.push('/support/bug')}>
            <ThemedText style={styles.statLabel}>버그 신고</ThemedText>
            <ThemedText style={styles.statValue}>{supportCounts.byBoard.bug.total}</ThemedText>
            <ThemedText style={styles.smallMuted}>대기 {supportCounts.byBoard.bug.open} · 완료 {supportCounts.byBoard.bug.answered}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={()=>router.push('/support/inquiry')}>
            <ThemedText style={styles.statLabel}>문의하기</ThemedText>
            <ThemedText style={styles.statValue}>{supportCounts.byBoard.inquiry.total}</ThemedText>
            <ThemedText style={styles.smallMuted}>대기 {supportCounts.byBoard.inquiry.open} · 완료 {supportCounts.byBoard.inquiry.answered}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={()=>router.push('/support/report')}>
            <ThemedText style={styles.statLabel}>신고하기</ThemedText>
            <ThemedText style={styles.statValue}>{supportCounts.byBoard.report.total}</ThemedText>
            <ThemedText style={styles.smallMuted}>대기 {supportCounts.byBoard.report.open} · 완료 {supportCounts.byBoard.report.answered}</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>최근 5개 트랜잭션</ThemedText>
          {latest5.length === 0 ? (
            <ThemedText style={styles.muted}>트랜잭션이 없습니다.</ThemedText>
          ) : (
            latest5.map(tx => (
              <View key={tx.id} style={styles.txRow}>
                <ThemedText style={[styles.txCell, {flex:1.2}]} numberOfLines={1}>{new Date(tx.timestamp).toLocaleString()}</ThemedText>
                <ThemedText style={[styles.txCell, {flex:0.8}]} numberOfLines={1}>{String(tx.type).toUpperCase()}</ThemedText>
                <ThemedText style={[styles.txCell, {flex:1.2}]} numberOfLines={1}>
                  {tx.amount ?? tx.change ?? 0} {tx.symbol ?? tx.fromToken ?? tx.toToken ?? ''}
                </ThemedText>
                <ThemedText style={[styles.txCell, {flex:1.2}]} numberOfLines={1}>{tx.status || (tx.success ? 'completed' : 'failed')}</ThemedText>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
            <ThemedText style={styles.sectionTitle}>최근 5개 신고/문의/버그</ThemedText>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/(admin)/boards')}>
              <ThemedText style={styles.linkText}>Boards 전체보기</ThemedText>
            </TouchableOpacity>
          </View>
          {latestSupport.length === 0 ? (
            <ThemedText style={styles.muted}>등록된 내용이 없습니다.</ThemedText>
          ) : (
            latestSupport.map(p => (
              <TouchableOpacity key={`${p.board}-${p.id}`} style={styles.txRow} onPress={()=>router.push(`/support/${p.board}?focus=${p.id}` as any)}>
                <ThemedText style={[styles.txCell, { flex:0.6, color:'#FFD700', fontWeight:'800' }]} numberOfLines={1}>{p.board.toUpperCase()}</ThemedText>
                <ThemedText style={[styles.txCell, { flex:1.6 }]} numberOfLines={1}>{p.title}</ThemedText>
                <ThemedText style={[styles.txCell, { flex:1.2 }]} numberOfLines={1}>{p.email}</ThemedText>
                <ThemedText style={[styles.txCell, { flex:1.2 }]} numberOfLines={1}>{new Date(p.createdAt).toLocaleString()}</ThemedText>
                <ThemedText style={[styles.txCell, { flex:0.6, color: (p.status||'open')==='answered' ? '#22C55E' : '#FFD700', fontWeight:'800' }]} numberOfLines={1}>
                  {(p.status||'open').toUpperCase()}
                </ThemedText>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.sectionTitle}>빠른 이동</ThemedText>
          <View style={styles.links}>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/(tabs)/dashboard')}>
              <ThemedText style={styles.linkText}>앱 대시보드</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/(admin)/boards')}>
              <ThemedText style={styles.linkText}>Boards</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/(admin)/users')}>
              <ThemedText style={styles.linkText}>Users</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/(admin)/transactions')}>
              <ThemedText style={styles.linkText}>Transactions</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/(admin)/reports')}>
              <ThemedText style={styles.linkText}>Reports</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/settings/quick-actions')}>
              <ThemedText style={styles.linkText}>빠른 액션 설정</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={()=>router.push('/settings/profile')}>
              <ThemedText style={styles.linkText}>프로필</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  headerRow: { flexDirection:'row', alignItems:'center', gap:8 },
  backBtn: { width:32, height:32, borderRadius:6, borderWidth:1, borderColor:'#2A2A2A', alignItems:'center', justifyContent:'center', backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:16 },
  header: { color:'#FFD700', fontWeight:'900', fontSize:18, paddingHorizontal:4 },
  grid: { flexDirection:'row', flexWrap:'wrap', gap:10 },
  statCard: { flexBasis: '48%', backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12 },
  statLabel: { color:'#9CA3AF', marginBottom:4 },
  statValue: { color:'#FFFFFF', fontWeight:'900', fontSize:20 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12 },
  title: { color:'#FFFFFF', fontWeight:'800', fontSize:18, marginBottom:8 },
  warn: { color:'#FFD700', marginBottom:12 },
  button: { backgroundColor:'#FFD700', borderRadius:8, paddingVertical:10, alignItems:'center' },
  buttonText: { color:'#000', fontWeight:'900' },
  sectionTitle: { color:'#FFFFFF', fontWeight:'800', marginBottom:8 },
  muted: { color:'#9CA3AF' },
  txRow: { flexDirection:'row', borderTopWidth:1, borderTopColor:'#222', paddingVertical:8 },
  txCell: { color:'#E5E7EB' },
  links: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  linkBtn: { backgroundColor:'#1A1A1A', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingVertical:8, paddingHorizontal:12 },
  linkText: { color:'#E5E7EB', fontWeight:'700' },
  smallMuted: { color:'#9CA3AF', marginTop:4, fontSize:12 },
});


