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
import { 
  FlatList, 
  Pressable, 
  StyleSheet, 
  View, 
  ScrollView, 
  TouchableOpacity,
  TextInput,
  Dimensions 
} from 'react-native';
import { useEffect, useState } from 'react';

const { width } = Dimensions.get('window');

export default function ExchangeScreen() {
  const { currentUser } = useAuth();
  const { currency } = usePreferences();
  const [rates, setRates] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('KRW');
  const [searchText, setSearchText] = useState('');

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

  const filteredMarkets = mockMarkets.filter(market => 
    market.base.toLowerCase().includes(searchText.toLowerCase()) ||
    market.quote.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title="Exchange" 
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri} 
      />
      
      <ScrollView style={styles.container}>
        {/* 검색바 */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="코인명/심볼 검색"
            placeholderTextColor="#666"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {/* 탭 메뉴 */}
        <View style={styles.tabContainer}>
          {['KRW', 'BTC', 'USDT'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, selectedTab === tab && styles.activeTab]}
              onPress={() => setSelectedTab(tab)}
            >
              <ThemedText style={[styles.tabText, selectedTab === tab && styles.activeTabText]}>
                {tab}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* 마켓 리스트 헤더 */}
        <View style={styles.listHeader}>
          <ThemedText style={styles.headerText}>코인명</ThemedText>
          <ThemedText style={styles.headerText}>현재가</ThemedText>
          <ThemedText style={styles.headerText}>24h 변동</ThemedText>
          <ThemedText style={styles.headerText}>거래량</ThemedText>
        </View>

        {/* 마켓 리스트 */}
        <FlatList
          data={filteredMarkets}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const isUp = item.change24hPct >= 0;
            return (
              <Link href={{ pathname: '/market/[id]', params: { id: item.id } }} asChild>
                <Pressable style={styles.marketRow}>
                  <View style={styles.coinInfo}>
                    <View style={styles.coinIcon}>
                      <ThemedText style={styles.coinSymbol}>{item.base.charAt(0)}</ThemedText>
                    </View>
                    <View>
                      <ThemedText style={styles.coinName}>{item.base}</ThemedText>
                      <ThemedText style={styles.coinPair}>{item.quote}</ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.priceInfo}>
                    <ThemedText style={styles.price}>
                      {formatCurrency(item.price, currency, rates)}
                    </ThemedText>
                    <ThemedText style={[styles.change, { color: isUp ? '#00C851' : '#FF4444' }]}>
                      {formatPercentage(item.change24hPct)}
                    </ThemedText>
                  </View>
                  
                  <View style={styles.volumeInfo}>
                    <ThemedText style={styles.volume}>
                      {formatCurrency(item.volume24h, currency, rates)}
                    </ThemedText>
                  </View>
                </Pressable>
              </Link>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </ScrollView>
      
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#FFD700',
  },
  tabText: {
    fontSize: 16,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFD700',
  },
  listHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0A0A0A',
  },
  coinInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  coinSymbol: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  coinName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  coinPair: {
    fontSize: 12,
    color: '#999',
  },
  priceInfo: {
    flex: 1.5,
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  change: {
    fontSize: 12,
    fontWeight: '600',
  },
  volumeInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  volume: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  separator: {
    height: 1,
    backgroundColor: '#333',
    marginLeft: 60,
  },
});


