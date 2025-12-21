import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useWallet } from '@/contexts/WalletContext';
import { fetchJsonWithProxy } from '@/lib/upbit';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function NFTInline() {
  const { isConnected, connect, address } = useWallet();
  const [items, setItems] = useState<{ id: string; name: string; image: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const apiKey = (process as any)?.env?.EXPO_PUBLIC_OPENSEA_API_KEY || (global as any)?.OPENSEA_API_KEY;
        // Try OpenSea API v2 (if key present). Fallback to placeholder images.
        if (apiKey) {
          const url = 'https://api.opensea.io/api/v2/collection/minjo/nfts?limit=20';
          const data = await fetchJsonWithProxy(url, { headers: { 'X-API-KEY': apiKey } as any });
          const mapped = (data?.nfts || []).map((n: any) => ({
            id: n.identifier || n.nft_id || String(Math.random()),
            name: n.name || `minjo #${n.identifier || ''}`,
            image: n.image_url || n.display_image_url || ''
          }));
          if (mapped.length) {
            setItems(mapped);
            return;
          }
        }
        // Fallback: placeholder 10 items
        const ph = Array.from({ length: 10 }).map((_, i) => ({
          id: String(i + 1),
          name: `minjo #${i + 1}`,
          image: `https://picsum.photos/seed/minjo${i + 1}/800/800`
        }));
        setItems(ph);
      } catch (e) {
        const ph = Array.from({ length: 10 }).map((_, i) => ({
          id: String(i + 1),
          name: `minjo #${i + 1}`,
          image: `https://picsum.photos/seed/minjo${i + 1}/800/800`
        }));
        setItems(ph);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      {/* 인라인 헤더 */}
      <View style={styles.header}>
        <ThemedText style={styles.logo}>YOY NFT</ThemedText>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' }}>
          {isConnected ? (
            <ThemedText style={styles.addr}>{address?.slice(0, 6)}...{address?.slice(-4)}</ThemedText>
          ) : (
            <TouchableOpacity style={styles.connect} onPress={connect}>
              <ThemedText style={styles.connectText}>Connect YOY Wallet</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 본문 - 컬렉션 프리뷰 (minjo) */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 160 }} showsVerticalScrollIndicator={true}>
        <ThemedText style={styles.section}>minjo collection (yooyland)</ThemedText>
        <View style={styles.gridSingle}>
          {(items.length ? items : []).map((it) => (
            <View key={it.id} style={styles.cardSingle}>
              <Image source={{ uri: it.image }} style={styles.thumbLarge} resizeMode="cover" />
              <ThemedText style={styles.cardTitle}>{it.name}</ThemedText>
              <ThemedText style={styles.cardSub}>Floor 1.23 YOY</ThemedText>
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', backgroundColor: '#0A0A0A' },
  logo: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  connect: { backgroundColor: '#1F2937', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  connectText: { color: '#FFD700', fontWeight: '700', fontSize: 12 },
  addr: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  section: { color: '#FFF', fontWeight: '700', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48%', backgroundColor: '#111', borderRadius: 10, padding: 10, marginBottom: 10 },
  thumb: { height: 100, backgroundColor: '#222', borderRadius: 8, marginBottom: 8 },
  gridSingle: { },
  cardSingle: { width: '100%', backgroundColor: '#111', borderRadius: 10, padding: 10, marginBottom: 12 },
  thumbLarge: { height: 280, backgroundColor: '#222', borderRadius: 8, marginBottom: 8, width: '100%' },
  cardTitle: { color: '#FFF', fontWeight: '700' },
  cardSub: { color: '#AAA', fontSize: 12 },
});


