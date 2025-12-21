import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useWallet } from '@/contexts/WalletContext';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function NFTScreen() {
  const { isConnected, connect, address } = useWallet();

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      {/* Header */}
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

      {/* Body - placeholder collections */}
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ThemedText style={styles.section}>Trending Collections</ThemedText>
        <View style={styles.grid}>
          {[1,2,3,4,5,6].map(i => (
            <View key={i} style={styles.card}>
              <View style={styles.thumb} />
              <ThemedText style={styles.cardTitle}>Collection #{i}</ThemedText>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { width: '48%', backgroundColor: '#111', borderRadius: 10, padding: 10, marginBottom: 10, marginRight: '4%' },
  thumb: { height: 100, backgroundColor: '#222', borderRadius: 8, marginBottom: 8 },
  cardTitle: { color: '#FFF', fontWeight: '700' },
  cardSub: { color: '#AAA', fontSize: 12 },
});



