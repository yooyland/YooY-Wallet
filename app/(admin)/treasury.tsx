import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View, ScrollView, TextInput } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import { router, Redirect, useRootNavigationState } from 'expo-router';
import { adminSetInternalYoyTreasuryUid } from '@/lib/internalYoyTreasuryConfig';

// Firestore가 있으면 사용, 없으면 화면만 표시
let firestore: any = null;
let doc: any = null;
let getDoc: any = null;
let onSnapshot: any = null;
let collection: any = null;
let query: any = null;
let orderBy: any = null;
let limit: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fb = require('firebase/firestore');
  firestore = require('@/lib/firebase').firestore;
  doc = fb.doc;
  getDoc = fb.getDoc;
  onSnapshot = fb.onSnapshot;
  collection = fb.collection;
  query = fb.query;
  orderBy = fb.orderBy;
  limit = fb.limit;
} catch {}

type Bal = { balanceYoy?: number; updatedAt?: any };
type TopRow = { id: string; balanceYoy: number; updatedAtMs: number | null };

function numberOr0(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatYoy(n: number): string {
  try {
    return Math.floor(n).toLocaleString('en-US');
  } catch {
    return String(Math.floor(n));
  }
}

function parseUpdatedAtMs(v: any): number | null {
  try {
    if (!v) return null;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (typeof v?.seconds === 'number') return Math.floor(v.seconds * 1000);
    return null;
  } catch {
    return null;
  }
}

export default function AdminTreasury() {
  const { currentUser } = useAuth();
  const admin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!admin) return <Redirect href="/(tabs)/dashboard" />;

  const defaultTreasuryId =
    (process.env.EXPO_PUBLIC_YOY_TREASURY_UID as string | undefined) ||
    (process.env.YOY_TREASURY_UID as string | undefined) ||
    '__treasury__';

  const [treasuryId, setTreasuryId] = React.useState(defaultTreasuryId);
  const [userId, setUserId] = React.useState(currentUser?.uid || '');
  const [treasury, setTreasury] = React.useState<Bal | null>(null);
  const [user, setUser] = React.useState<Bal | null>(null);
  const [topN, setTopN] = React.useState<TopRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string>('');

  const loadOne = React.useCallback(async (id: string): Promise<Bal | null> => {
    if (!firestore || !doc || !getDoc) return null;
    const snap = await getDoc(doc(firestore, 'internal_yoy_balances', String(id)));
    if (!snap.exists()) return { balanceYoy: 0 };
    return (snap.data() || {}) as Bal;
  }, []);

  const refresh = React.useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const [t, u] = await Promise.all([
        treasuryId ? loadOne(treasuryId) : Promise.resolve(null),
        userId ? loadOne(userId) : Promise.resolve(null),
      ]);
      setTreasury(t);
      setUser(u);
    } catch (e: any) {
      setErr(String(e?.message || e || 'load_failed'));
    } finally {
      setLoading(false);
    }
  }, [loadOne, treasuryId, userId]);

  const saveTreasuryUid = React.useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const next = String(treasuryId || '').trim();
      const res = await adminSetInternalYoyTreasuryUid(next);
      if (!res.ok) {
        setErr(res.error || 'save_failed');
        return;
      }
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e || 'save_failed'));
    } finally {
      setLoading(false);
    }
  }, [treasuryId, refresh]);

  // 실시간 반영(가능한 경우)
  React.useEffect(() => {
    if (!firestore || !doc || !onSnapshot) return;
    let unsubT: any = null;
    let unsubU: any = null;
    let unsubTop: any = null;
    try {
      if (treasuryId) {
        unsubT = onSnapshot(doc(firestore, 'internal_yoy_balances', String(treasuryId)), (s: any) => {
          setTreasury(s.exists() ? (s.data() as any) : { balanceYoy: 0 });
        });
      }
    } catch {}
    try {
      if (userId) {
        unsubU = onSnapshot(doc(firestore, 'internal_yoy_balances', String(userId)), (s: any) => {
          setUser(s.exists() ? (s.data() as any) : { balanceYoy: 0 });
        });
      }
    } catch {}
    try {
      if (collection && query && orderBy && limit) {
        unsubTop = onSnapshot(
          query(collection(firestore, 'internal_yoy_balances'), orderBy('balanceYoy', 'desc'), limit(50)),
          (snap: any) => {
            const arr: TopRow[] = [];
            snap.forEach((d: any) => {
              const v = d.data() || {};
              arr.push({
                id: String(d.id),
                balanceYoy: numberOr0(v.balanceYoy),
                updatedAtMs: parseUpdatedAtMs(v.updatedAt),
              });
            });
            setTopN(arr);
          },
          () => {}
        );
      }
    } catch {}
    return () => {
      try { unsubT?.(); } catch {}
      try { unsubU?.(); } catch {}
      try { unsubTop?.(); } catch {}
    };
  }, [treasuryId, userId]);

  React.useEffect(() => { void refresh(); }, []);

  const tBal = formatYoy(numberOr0(treasury?.balanceYoy));
  const uBal = formatYoy(numberOr0(user?.balanceYoy));
  const tUp = parseUpdatedAtMs((treasury as any)?.updatedAt);
  const uUp = parseUpdatedAtMs((user as any)?.updatedAt);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Internal YOY Balances</ThemedText>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn} disabled={loading}>
          <ThemedText style={styles.refreshText}>{loading ? '...' : '⟳'}</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Treasury</ThemedText>
          <ThemedText style={styles.muted}>관리자 재원(보상/수수료)이 쌓이는 계정</ThemedText>
          <TextInput
            value={treasuryId}
            onChangeText={setTreasuryId}
            style={styles.input}
            placeholder="treasury uid (EXPO_PUBLIC_YOY_TREASURY_UID)"
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
          <View style={[styles.row, { justifyContent: 'flex-end' }]}>
            <TouchableOpacity onPress={saveTreasuryUid} style={[styles.smallBtn, { opacity: loading ? 0.6 : 1 }]} disabled={loading}>
              <ThemedText style={styles.smallBtnText}>Set Treasury UID</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <ThemedText style={styles.big}>{tBal} YOY</ThemedText>
          </View>
          <ThemedText style={styles.muted}>
            updatedAt: {tUp ? new Date(tUp).toLocaleString('ko-KR') : '-'}
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>User</ThemedText>
          <ThemedText style={styles.muted}>특정 사용자 UID의 내부 YOY 잔고</ThemedText>
          <TextInput
            value={userId}
            onChangeText={setUserId}
            style={styles.input}
            placeholder="user uid"
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <ThemedText style={styles.big}>{uBal} YOY</ThemedText>
          </View>
          <ThemedText style={styles.muted}>
            updatedAt: {uUp ? new Date(uUp).toLocaleString('ko-KR') : '-'}
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Top Holders</ThemedText>
          <ThemedText style={styles.muted}>internal_yoy_balances · balanceYoy desc · top 50</ThemedText>
          {!firestore || !collection ? (
            <ThemedText style={[styles.muted, { marginTop: 8 }]}>Firestore를 사용할 수 없는 환경입니다.</ThemedText>
          ) : topN.length === 0 ? (
            <ThemedText style={[styles.muted, { marginTop: 8 }]}>No data</ThemedText>
          ) : (
            <View style={{ marginTop: 10 }}>
              <View style={styles.topHeader}>
                <ThemedText style={[styles.topHeadText, { flex: 0.2 }]}>#</ThemedText>
                <ThemedText style={[styles.topHeadText, { flex: 1.2 }]}>UID</ThemedText>
                <ThemedText style={[styles.topHeadText, { flex: 0.7, textAlign: 'right' }]}>YOY</ThemedText>
              </View>
              {topN.map((r, idx) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.topRow}
                  onPress={() => {
                    setUserId(r.id);
                    try { void refresh(); } catch {}
                  }}
                >
                  <ThemedText style={[styles.topCell, { flex: 0.2, color: '#9CA3AF' }]}>{idx + 1}</ThemedText>
                  <View style={{ flex: 1.2 }}>
                    <ThemedText style={[styles.topCell, { fontWeight: '800' }]} numberOfLines={1}>{r.id}</ThemedText>
                    <ThemedText style={[styles.muted, { marginTop: 2 }]} numberOfLines={1}>
                      {r.updatedAtMs ? new Date(r.updatedAtMs).toLocaleString('ko-KR') : '-'}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.topCell, { flex: 0.7, textAlign: 'right' }]}>{formatYoy(r.balanceYoy)}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {err ? (
          <View style={[styles.card, { borderColor: '#7F1D1D' }]}>
            <ThemedText style={{ color: '#FCA5A5', fontWeight: '800' }}>Error</ThemedText>
            <ThemedText style={{ color: '#FCA5A5' }}>{err}</ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  headerRow: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  backBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  headerTitle: { color: '#EDEDED', fontSize: 15, fontWeight: '800' },
  refreshBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  card: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 12 },
  cardTitle: { color: '#FFD700', fontWeight: '900', fontSize: 14, marginBottom: 2 },
  muted: { color: '#9CA3AF', fontSize: 12, marginTop: 6 },
  input: { marginTop: 10, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: '#EDEDED', backgroundColor: '#0A0A0A' },
  row: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  big: { color: '#EDEDED', fontSize: 22, fontWeight: '900' },
  topHeader: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  topHeadText: { color: '#9CA3AF', fontSize: 12, fontWeight: '800' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1F1F1F' },
  topCell: { color: '#EDEDED', fontSize: 12 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#2A2A2A' },
  smallBtnText: { color: '#FFD700', fontWeight: '900' },
});

