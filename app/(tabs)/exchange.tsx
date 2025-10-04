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
  const [sortBy, setSortBy] = useState('volume'); // volume, change, name

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

  const filteredMarkets = mockMarkets
    .filter(market => 
      market.base.toLowerCase().includes(searchText.toLowerCase()) ||
      market.name.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return b.volume24h - a.volume24h;
        case 'change':
          return b.change24hPct - a.change24hPct;
        case 'name':
          return a.base.localeCompare(b.base);
        default:
          return 0;
      }
    });

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title="거래소" 
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri} 
      />
      
      <View style={styles.container}>
        {/* 검색 및 정렬 바 */}
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="코인명/심볼 검색"
              placeholderTextColor="#666"
              value={searchText}
              onChangeText={setSearchText}
            />
            <TouchableOpacity style={styles.sortButton}>
              <ThemedText style={styles.sortText}>정렬</ThemedText>
            </TouchableOpacity>
          </View>
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
          <TouchableOpacity 
            style={styles.headerColumn}
            onPress={() => setSortBy('name')}
          >
            <ThemedText style={styles.headerText}>코인명</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerColumn}
            onPress={() => setSortBy('volume')}
          >
            <ThemedText style={styles.headerText}>현재가</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerColumn}
            onPress={() => setSortBy('change')}
          >
            <ThemedText style={styles.headerText}>24h 변동</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerColumn}
            onPress={() => setSortBy('volume')}
          >
            <ThemedText style={styles.headerText}>거래량</ThemedText>
          </TouchableOpacity>
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
                    <View style={styles.coinDetails}>
                      <ThemedText style={styles.coinName}>{item.base}</ThemedText>
                      <ThemedText style={styles.coinFullName}>{item.name}</ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.priceInfo}>
                    <ThemedText style={styles.price}>
                      ₩{item.price.toLocaleString()}
                    </ThemedText>
                  </View>
                  
                  <View style={styles.changeInfo}>
                    <ThemedText style={[styles.change, { color: isUp ? '#00C851' : '#FF4444' }]}>
                      {isUp ? '+' : ''}{item.change24hPct.toFixed(2)}%
                    </ThemedText>
                  </View>
                  
                  <View style={styles.volumeInfo}>
                    <ThemedText style={styles.volume}>
                      ₩{(item.volume24h / 1000000000).toFixed(1)}B
                    </ThemedText>
                  </View>
                </Pressable>
              </Link>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
      
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchContainer: {
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#212529',
    borderWidth: 1,
    borderColor: '#DEE2E6',
    marginRight: 8,
  },
  sortButton: {
    backgroundColor: '#6C757D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  sortText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
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
    fontSize: 14,
    color: '#6C757D',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFD700',
    fontWeight: '600',
  },
  listHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    paddingVertical: 8,
  },
  headerColumn: {
    flex: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 11,
    color: '#6C757D',
    fontWeight: '500',
  },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  coinInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  coinSymbol: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 10,
  },
  coinDetails: {
    flex: 1,
  },
  coinName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 2,
  },
  coinFullName: {
    fontSize: 11,
    color: '#6C757D',
  },
  priceInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212529',
  },
  changeInfo: {
    flex: 1,
    alignItems: 'flex-end',
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
    fontSize: 11,
    color: '#6C757D',
  },
  separator: {
    height: 0,
  },
});


