import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function AdminCEVScreen() {
  // Placeholder list
  const items = [
    { id: '1', symbol: 'YOY', name: 'YooY Land', status: 'Pending' },
    { id: '2', symbol: 'ABC', name: 'ABC Token', status: 'Pending' },
  ];

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ThemedText style={styles.title}>A-CEV (Admin)</ThemedText>
        <ThemedText style={styles.desc}>사용자 신청 목록을 검토하고 승인/반려하세요.</ThemedText>

        {items.map(item => (
          <View key={item.id} style={styles.row}>
            <ThemedText style={styles.symbol}>{item.symbol}</ThemedText>
            <ThemedText style={styles.name}>{item.name}</ThemedText>
            <ThemedText style={styles.status}>{item.status}</ThemedText>
            <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
              <TouchableOpacity style={styles.approve}><ThemedText style={styles.approveText}>Approve</ThemedText></TouchableOpacity>
              <TouchableOpacity style={styles.reject}><ThemedText style={styles.rejectText}>Reject</ThemedText></TouchableOpacity>
            </View>
          </View>
        ))}

        <Link href="/exchange" asChild><TouchableOpacity style={styles.back}><ThemedText style={styles.backText}>Back to Exchange</ThemedText></TouchableOpacity></Link>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  title: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  desc: { color: '#CCC', fontSize: 12, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  symbol: { color: '#FFD700', fontWeight: '700', width: 60 },
  name: { color: '#FFF', flex: 1 },
  status: { color: '#CCC', marginRight: 8 },
  approve: { backgroundColor: '#1F7A1F', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginRight: 8 },
  approveText: { color: '#FFF', fontWeight: '700' },
  reject: { backgroundColor: '#7A1F1F', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  rejectText: { color: '#FFF', fontWeight: '700' },
  back: { marginTop: 16, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  backText: { color: '#FFF' },
});



