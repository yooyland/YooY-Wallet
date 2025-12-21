import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import TopBar from '@/components/top-bar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getActiveChain } from '@/src/wallet/chains';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function SettingsHome() {
  const { language } = usePreferences();
  const chain = getActiveState();

  const items = [
    { title: '네트워크', subtitle: chain.label, href: '/settings/network', icon: 'globe' as const },
    { title: '프로필', subtitle: '이름 / 아바타', href: '/settings/profile', icon: 'person.crop.circle' as const },
    { title: '언어', subtitle: language === 'en' ? 'English' : '한국어', href: '/settings/language', icon: 'textformat.abc' as const },
    { title: '테마', subtitle: '라이트/다크', href: '/settings/theme', icon: 'paintbrush' as const },
    { title: '통화 단위', subtitle: '통화 표시', href: '/settings/currency', icon: 'dollarsign.circle' as const },
    { title: '알림', subtitle: '푸시/알림 설정', href: '/settings/notifications', icon: 'bell.fill' as const },
    { title: '보안', subtitle: '잠금/인증', href: '/settings/security', icon: 'lock.fill' as const },
    { title: '퀵액션', subtitle: '바로가기/정렬', href: '/settings/quick-actions', icon: 'slider.horizontal.3' as const },
    { title: 'WalletConnect', subtitle: '연결 관리', href: '/settings/walletconnect', icon: 'bolt.horizontal' as const },
    { title: '할 일 설정', subtitle: '뷰/알림', href: '/settings/todo-settings', icon: 'checkmark.seal' as const },
  ];

  return (
    <ThemedView style={styles.container}>
      <TopBar title={language === 'en' ? 'Settings' : '설정'} />
      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>{language === 'en' ? 'General' : '일반'}</ThemedText>
          {items.map((it, idx) => (
            <Link key={idx} href={it.href} asChild>
              <TouchableOpacity style={styles.row}>
                <View style={styles.iconWrap}>
                  <IconSymbol name={it.icon} size={18} color="#FFD700" />
                </View>
                <View style={styles.textWrap}>
                  <ThemedText style={styles.title}>{it.title}</ThemedText>
                  {it.subtitle ? <ThemedText style={styles.subtitle}>{it.subtitle}</ThemedText> : null}
                </View>
                <IconSymbol name="chevron.right" size={18} color="#666" />
              </TouchableOpacity>
            </Link>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function getActiveState() {
  const c = getActiveChain();
  return {
    key: c.name,
    label: c.name === 'mainnet' ? 'Mainnet' : 'Sepolia',
    rpc: c.rpcUrl,
    chainId: c.chainIdDec,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  scroll: { flex: 1 },
  section: { gap: 8 },
  sectionTitle: { color: '#9CA3AF', fontWeight: '700', marginVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#262F36',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontWeight: '700' },
  subtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
});

