import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

type SavedOrder = {
  orderId?: string;
  status?: string;
  symbol?: string;
  price?: number;
  quantity?: number;
  createdAt?: number;
};

export default function OrdersIndex() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const email = (currentUser as any)?.email || 'user@example.com';
  const storageKey = useMemo(() => `user_orders_${email}`, [email]);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'open' | 'all' | 'fills'>('open');
  const [sideFilter, setSideFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<any>(null);
  const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || (process.env.API_BASE_URL as string) || 'https://api-test.yooyland.com';
  const API_TOKEN = (process.env.EXPO_PUBLIC_API_TOKEN as string) || (process.env.API_TOKEN as string) || '';

  const getAuthHeader = useCallback(async () => {
    try {
      const idToken = (await (currentUser as any)?.getIdToken?.(true)) as string | undefined;
      if (idToken) return { Authorization: `Bearer ${idToken}` };
    } catch {}
    // fallback (테스트용 고정 토큰)
    return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
  }, [currentUser, API_TOKEN]);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const list: SavedOrder[] = raw ? JSON.parse(raw) : [];
      if (list.length === 0) {
        // 샘플 30건 생성 (임시 확인용)
        const sides = ['buy', 'sell'] as const;
        const statuses = ['pending', 'open', 'partially_filled', 'filled', 'rejected'] as const;
        const symbols = ['YOY/USDT', 'BTC/USDT', 'ETH/USDT', 'YOY/KRW', 'BTC/KRW'];
        const samples: SavedOrder[] = Array.from({ length: 30 }).map((_, i) => ({
          orderId: `sample_${Date.now()}_${i}`,
          status: statuses[i % statuses.length],
          symbol: symbols[i % symbols.length],
          price: Number((Math.random() * 0.01 + 0.0005).toFixed(6)),
          quantity: Math.floor(Math.random() * 5000) + 100,
          createdAt: Date.now() - i * 3600_000,
          // @ts-ignore - keep side for filtering
          side: sides[i % sides.length]
        } as any));
        await AsyncStorage.setItem(storageKey, JSON.stringify(samples));
        setOrders(samples);
      } else {
        setOrders(list);
      }
    } catch (e) {
      setOrders([]);
    }
  }, [storageKey]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 서버에서 최신 주문 가져오기
  const fetchServerOrders = useCallback(async () => {
    try {
      if (!API_BASE) return;
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/v1/orders`, { headers });
      if (!res.ok) return;
      const list = await res.json();
      if (Array.isArray(list)) setOrders(list);
    } catch {}
  }, [API_BASE, API_TOKEN, getAuthHeader]);

  useEffect(() => { fetchServerOrders(); }, [fetchServerOrders]);

  // 프로필(사진/이름) 로드 - uid 스코프 키 사용
  useEffect(() => {
    (async () => {
      try {
        const uid = (currentUser as any)?.uid;
        const photoKey = uid ? `u:${uid}:profile.photoUri` : 'profile.photoUri';
        const infoKey = uid ? `u:${uid}:profile.info` : 'profile.info';
        const savedPhoto = await AsyncStorage.getItem(photoKey);
        if (savedPhoto) setAvatarUri(savedPhoto);
        const info = await AsyncStorage.getItem(infoKey);
        if (info) {
          try { setSavedInfo(JSON.parse(info)); } catch {}
        }
      } catch {}
    })();
  }, [currentUser]);

  const cancelOrder = useCallback(async (orderId?: string) => {
    if (!orderId) return;
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert('주문 취소', '정말 취소하시겠습니까?', [
        { text: '아니오', style: 'cancel', onPress: () => resolve(false) },
        { text: '예', style: 'destructive', onPress: () => resolve(true) }
      ]);
    });
    if (!ok) return;
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('취소 실패', err.message || '서버 오류');
        return;
      }
      // 로컬 목록 반영
      setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, status: 'cancelled' } : o));
    } catch (e) {
      Alert.alert('취소 실패', '네트워크 오류');
    }
  }, [API_BASE, API_TOKEN]);

  const filtered = useMemo(() => {
    let list = orders;
    if (activeTab === 'open') list = list.filter(o => !o.status || o.status === 'pending' || o.status === 'open' || o.status === 'partially_filled');
    if (activeTab === 'fills') list = list.filter(o => o.status === 'filled');
    if (sideFilter !== 'all') list = list.filter((o: any) => (o.type || o.side) === sideFilter);
    return list;
  }, [orders, activeTab, sideFilter]);

  const renderItem = ({ item }: { item: SavedOrder }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/orders/${item.orderId ?? ''}`)}
    >
      <View style={styles.rowBetween}>
        <ThemedText style={styles.title}>{item.symbol ?? '-'}</ThemedText>
        <View style={styles.row}
        >
          {(!item.status || item.status === 'pending' || (item as any).status === 'open' || (item as any).status === 'partially_filled') && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelOrder(item.orderId)}>
              <ThemedText style={styles.cancelBtnText}>취소</ThemedText>
            </TouchableOpacity>
          )}
          <ThemedText style={[styles.badge, item.status === 'filled' ? styles.badgeFilled : item.status === 'rejected' ? styles.badgeRejected : item.status === 'cancelled' ? styles.badgeCancelled : styles.badgePending]}>
            {item.status ?? 'pending'}
          </ThemedText>
        </View>
      </View>
      <View style={styles.rowBetween}>
        <ThemedText style={styles.sub}>수량 {item.quantity ?? 0}</ThemedText>
        <ThemedText style={styles.sub}>가격 {item.price ?? 0}</ThemedText>
      </View>
      <ThemedText style={styles.time}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</ThemedText>
    </TouchableOpacity>
  );

  const dnRaw = savedInfo?.username || (currentUser as any)?.displayName || ((currentUser as any)?.email?.split?.('@')?.[0]) || 'Guest';
  const displayName = String(dnRaw).trim().toLowerCase()==='user' ? 'Guest' : dnRaw;

  return (
    <View style={styles.container}>
      {/* 네이티브 상단바 제목 및 우측 필터 */}
      <Stack.Screen
        key={`orders_header_${displayName}`}
        options={{
          headerTitle: () => (
            <View style={styles.headerTitleRow}>
              {avatarUri ? (
                <View style={styles.headerAvatarWrap}>
                  {/* react-native-web Image may need regular Image; using View background if absent */}
                  <img src={avatarUri} style={{ width: 24, height: 24, borderRadius: 12, objectFit: 'cover' }} />
                </View>
              ) : null}
              <ThemedText style={styles.headerTitleText}>{displayName} 주문내역</ThemedText>
            </View>
          ),
          headerRight: () => (
            <View style={styles.headerIconsRow}>
              <TouchableOpacity onPress={() => setSideFilter('all')}>
                <Ionicons name="layers-outline" size={18} color={sideFilter === 'all' ? '#D4AF37' : '#CCCCCC'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSideFilter('buy')} style={{ marginLeft: 10 }}>
                <Ionicons name="trending-up-outline" size={18} color={sideFilter === 'buy' ? '#D4AF37' : '#CCCCCC'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSideFilter('sell')} style={{ marginLeft: 10 }}>
                <Ionicons name="trending-down-outline" size={18} color={sideFilter === 'sell' ? '#D4AF37' : '#CCCCCC'} />
              </TouchableOpacity>
            </View>
          )
        }}
      />
      {/* 탭 */}
      <View style={styles.tabsRow}>
        {[
          { k: 'open', label: '미체결' },
          { k: 'all', label: '전체주문' },
          { k: 'fills', label: '체결내역' }
        ].map(t => (
          <TouchableOpacity key={t.k} style={[styles.tab, activeTab === (t.k as any) && styles.tabActive]} onPress={() => setActiveTab(t.k as any)}>
            <ThemedText style={[styles.tabText, activeTab === (t.k as any) && styles.tabTextActive]}>{t.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(o, i) => (o.orderId ?? String(i))}
        renderItem={renderItem}
        ListEmptyComponent={<ThemedText style={styles.empty}>주문내역이 없습니다.</ThemedText>}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0A0A0A' },
  header: { fontSize: 20, fontWeight: '800', marginBottom: 4, color: '#D4AF37' },
  subHeader: { fontSize: 12, color: '#B8A25A', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatarWrap: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden' },
  headerTitleText: { color: '#FFFFFF', fontWeight: '700' },
  card: { backgroundColor: '#141414', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#3A3A3A' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  sub: { fontSize: 12, color: '#CCCCCC' },
  time: { marginTop: 6, fontSize: 11, color: '#888888' },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', textTransform: 'uppercase', borderWidth: 1, borderColor: '#2C2C2C' },
  badgeFilled: { color: '#00C176', backgroundColor: '#0b2f26', borderColor: '#00C176' },
  badgePending: { color: '#D4AF37', backgroundColor: '#2a2312', borderColor: '#D4AF37' },
  badgeRejected: { color: '#FF6B6B', backgroundColor: '#3a1717', borderColor: '#FF6B6B' },
  badgeCancelled: { color: '#AAAAAA', backgroundColor: '#2A2A2A', borderColor: '#555' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#AAAAAA' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#3A3A3A', marginRight: 8, backgroundColor: '#121212' },
  tabActive: { borderColor: '#D4AF37', backgroundColor: '#1B1B1B' },
  tabText: { color: '#CCCCCC', fontSize: 12 },
  tabTextActive: { color: '#D4AF37', fontWeight: '700' },
  filterChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#3A3A3A', marginLeft: 6 },
  filterChipActive: { borderColor: '#D4AF37', backgroundColor: '#1B1B1B' },
  filterChipText: { color: '#CCCCCC', fontSize: 12 },
  filterChipTextActive: { color: '#D4AF37', fontWeight: '700' },
  cancelBtn: { backgroundColor: '#2A2A2A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#444' },
  cancelBtnText: { color: '#FF6B6B', fontSize: 12, fontWeight: '700' }
  ,headerChipsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#121212', marginLeft: 6 },
  headerChipActive: { borderColor: '#D4AF37', backgroundColor: '#1B1B1B' },
  headerChipText: { color: '#CCCCCC', fontSize: 12 },
  headerChipTextActive: { color: '#D4AF37', fontWeight: '700' }
  ,headerIconsRow: { flexDirection: 'row', alignItems: 'center' }
});


