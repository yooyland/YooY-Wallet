import ProfileSheet from '@/components/profile-sheet';
import HamburgerMenu from '@/components/hamburger-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { mockBalances } from '@/data/balances';
import { mockMarkets } from '@/data/markets';
import { formatCurrency, getExchangeRates, formatPercentage } from '@/lib/currency';
import { t } from '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';

const PHOTO_KEY = 'profile.photoUri';

export default function HomeScreen() {
  const { signOut } = useAuth();
  const { currency, language } = usePreferences();
  const total = mockBalances.reduce((s, b) => s + b.valueUSD, 0);
  const topMarkets = mockMarkets.slice(0, 3);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [rates, setRates] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
    })();
  }, [currency]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(PHOTO_KEY);
      if (saved) setAvatarUri(saved);
    })();
  }, []);

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title="admin" 
        onAvatarPress={() => setProfileOpen(true)} 
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri} 
      />
      <View style={{ padding: 16 }}>
        <ThemedText type="title">{t('dashboard', language)}</ThemedText>
        <View style={{ height: 6 }} />
        <ThemedText style={{ opacity: 0.7 }}>{t('totalAssets', language)}</ThemedText>
        <ThemedText type="subtitle">{formatCurrency(total, currency, rates)}</ThemedText>

        <View style={{ height: 16 }} />
        <ThemedText type="subtitle">{t('quickActions', language)}</ThemedText>
        <View style={styles.actionsRow}>
          <Link href="/(tabs)/payments" asChild><Button title={t('depositWithdraw', language)} onPress={() => {}} /></Link>
          <View style={{ width: 8 }} />
          <Link href="/(tabs)/wallet" asChild><Button title={t('send', language)} onPress={() => {}} /></Link>
          <View style={{ width: 8 }} />
          <Link href="/(tabs)/exchange" asChild><Button title={t('trade', language)} onPress={() => {}} /></Link>
        </View>

        <View style={{ height: 16 }} />
        <ThemedText type="subtitle">{t('topMarkets', language)}</ThemedText>
        {topMarkets.map((m) => (
          <View key={m.id} style={styles.marketRow}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">{m.base}/{m.quote}</ThemedText>
              <ThemedText style={{ opacity: 0.7 }}>Vol 24h: {formatCurrency(m.volume24h, currency, rates)}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText>{formatCurrency(m.price, currency, rates)}</ThemedText>
              <ThemedText style={{ color: m.change24hPct >= 0 ? '#2ecc71' : '#e74c3c', fontWeight: '600' }}>
                {formatPercentage(m.change24hPct)}
              </ThemedText>
            </View>
          </View>
        ))}

        <View style={{ height: 16 }} />
        <Button title={t('signOut', language)} onPress={async () => { await signOut(); }} />
      </View>
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} onSaved={(uri) => setAvatarUri(uri)} />
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  marketRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, opacity: 0.9 },
});
