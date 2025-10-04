import TopBar from '@/components/top-bar';
import HamburgerMenu from '@/components/hamburger-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { mockMarkets } from '@/data/markets';
import { formatCurrency, getExchangeRates, formatPercentage } from '@/lib/currency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

export default function ExchangeScreen() {
  const { currentUser } = useAuth();
  const { currency } = usePreferences();
  const [rates, setRates] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('profile.photoUri');
      if (saved) setAvatarUri(saved);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
    })();
  }, [currency]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title={currentUser?.email?.split('@')[0] || 'admin'} 
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri} 
      />
      <View style={styles.container}>
        <ThemedText type="title">Markets</ThemedText>
      <View style={{ height: 8 }} />
      <FlatList
        data={mockMarkets}
        keyExtractor={(m) => m.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const isUp = item.change24hPct >= 0;
          return (
            <Link href={{ pathname: '/market/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.row}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">{item.base}/{item.quote}</ThemedText>
                  <ThemedText style={styles.sub}>Vol 24h: {formatCurrency(item.volume24h, currency, rates)}</ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText type="defaultSemiBold">{formatCurrency(item.price, currency, rates)}</ThemedText>
                  <ThemedText style={{ color: isUp ? '#2ecc71' : '#e74c3c', fontWeight: '600' }}>
                    {formatPercentage(item.change24hPct)}
                  </ThemedText>
                </View>
              </Pressable>
            </Link>
          );
        }}
      />
      </View>
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.dark.icon,
    opacity: 0.2,
  },
  sub: {
    opacity: 0.7,
  }
});


