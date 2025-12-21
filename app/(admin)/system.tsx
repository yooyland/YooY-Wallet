import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/contexts/AuthContext';
import { useMarket } from '@/contexts/MarketContext';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function AdminSystemScreen() {
  const { currentUser } = useAuth();
  const { yoyPriceUSD, yoyPriceKRW, usdkrw, setYoyPriceUSD } = useMarket();
  const [input, setInput] = useState<string>(yoyPriceUSD ? String(yoyPriceUSD) : '0.0347');

  const handleSave = async () => {
    if (!currentUser?.email || !isAdmin(currentUser.email)) {
      Alert.alert('Unauthorized', 'Admin only');
      return;
    }
    const v = parseFloat(input);
    if (!v || !Number.isFinite(v) || v <= 0) {
      Alert.alert('Invalid', 'Enter a valid positive number');
      return;
    }
    await setYoyPriceUSD(v);
    Alert.alert('Saved', 'YOY price updated');
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>System Settings</ThemedText>
      <View style={styles.card}>
        <ThemedText style={styles.label}>YOY Price (USD)</ThemedText>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={input}
          onChangeText={setInput}
          placeholder="0.0347"
        />
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <ThemedText style={styles.saveText}>Save</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.hint}>Current: ${yoyPriceUSD?.toFixed(6) || '—'}</ThemedText>
        <ThemedText style={styles.hint}>USDKRW: {usdkrw ? usdkrw.toFixed(6) : '—'}</ThemedText>
        <ThemedText style={styles.hint}>YOY(KRW): {yoyPriceKRW ? `₩${Math.round(yoyPriceKRW).toLocaleString()}` : '—'}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#D4AF37', borderRadius: 10, padding: 12 },
  label: { marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#D4AF37', borderRadius: 8, padding: 10, marginBottom: 10 },
  saveBtn: { backgroundColor: '#D4AF37', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  saveText: { color: '#000', fontWeight: '700' },
  hint: { marginTop: 6 },
});







