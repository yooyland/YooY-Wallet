import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import TopBar from '@/components/top-bar';
import { getActiveChain } from '@/src/wallet/chains';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function NetworkSettings() {
  const { language } = usePreferences();
  const chain = getActiveChain();
  const isMainnet = chain.name === 'mainnet';

  return (
    <ThemedView style={styles.container}>
      <TopBar title={language === 'en' ? 'Network' : '네트워크'} />
      <View style={styles.content}>
        <ThemedText style={styles.label}>{language === 'en' ? 'Current Network' : '현재 네트워크'}</ThemedText>
        <ThemedText style={[styles.value, isMainnet ? styles.ok : styles.warn]}>
          {isMainnet ? 'Mainnet' : 'Sepolia (Testnet)'}
        </ThemedText>

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>{language === 'en' ? 'Details' : '상세 정보'}</ThemedText>
          <ThemedText style={styles.line}>Chain ID: {chain.chainIdDec}</ThemedText>
          <ThemedText style={styles.line}>RPC: {chain.rpcUrl}</ThemedText>
          <ThemedText style={styles.note}>
            {language === 'en'
              ? 'Default is Mainnet. This app build is configured for Mainnet by default.'
              : '기본값은 메인넷입니다. 이 빌드는 기본적으로 메인넷으로 설정되어 있습니다.'}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { padding: 16 },
  label: { color: '#9CA3AF', fontSize: 14, marginBottom: 8 },
  value: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  ok: { color: '#4ADE80' },
  warn: { color: '#F59E0B' },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    padding: 16,
    gap: 8,
  },
  cardTitle: { color: '#FFD700', fontWeight: '700', marginBottom: 8 },
  line: { color: '#E5E7EB', fontSize: 13 },
  note: { color: '#9CA3AF', fontSize: 12, marginTop: 8 },
});

