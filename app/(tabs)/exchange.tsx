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
  Dimensions,
  Image
} from 'react-native';
import { useEffect, useState } from 'react';

const { width } = Dimensions.get('window');

export default function ExchangeScreen() {
  const { currentUser } = useAuth();
  const { currency } = usePreferences();
  const [rates, setRates] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('거래소');
  const [selectedMarket, setSelectedMarket] = useState('KRW');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('volume');
  const [showNotice, setShowNotice] = useState(true);

  // 사용자 보유자산 데이터 (mock)
  const userAssets = {
    totalPurchase: 0,
    unrealizedPnl: 0,
    totalValue: 0,
    returnRate: 0.00
  };

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
      {/* 업비트 스타일 헤더 */}
      <View style={styles.upbitHeader}>
        <View style={styles.statusBar}>
          <ThemedText style={styles.statusText}>SKT 19:48</ThemedText>
          <ThemedText style={styles.statusText}>UP</ThemedText>
          <ThemedText style={styles.batteryText}>77%</ThemedText>
        </View>
        
        <View style={styles.mainNavContainer}>
          <TouchableOpacity 
            style={[styles.mainNavTab, selectedTab === '거래소' && styles.activeMainNavTab]}
            onPress={() => setSelectedTab('거래소')}
          >
            <ThemedText style={[styles.mainNavText, selectedTab === '거래소' && styles.activeMainNavText]}>
              거래소
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mainNavTab, selectedTab === 'NFT' && styles.activeMainNavTab]}
            onPress={() => setSelectedTab('NFT')}
          >
            <ThemedText style={[styles.mainNavText, selectedTab === 'NFT' && styles.activeMainNavText]}>
              NFT
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {selectedTab === '거래소' && (
        <View style={styles.container}>
          {/* 검색바 */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <ThemedText style={styles.searchIcon}>🔍</ThemedText>
              <TextInput
                style={styles.searchInput}
                placeholder="코인명/심볼 검색"
                placeholderTextColor="#666"
                value={searchText}
                onChangeText={setSearchText}
              />
            </View>
          </View>

          {/* 마켓 탭 */}
          <View style={styles.marketTabContainer}>
            {['USDT', 'KRW', 'ETH', 'BTC', 'MY', 'FAV'].map((market) => (
              <TouchableOpacity
                key={market}
                style={[styles.marketTab, selectedMarket === market && styles.activeMarketTab]}
                onPress={() => setSelectedMarket(market)}
              >
                <ThemedText style={[styles.marketTabText, selectedMarket === market && styles.activeMarketTabText]}>
                  {market}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* 마켓 리스트 헤더 - 고정 */}
          <View style={styles.listHeader}>
            <TouchableOpacity style={styles.headerColumn}>
              <ThemedText style={styles.headerText}>한글명</ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerColumn}>
              <ThemedText style={styles.headerText}>현재가</ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerColumn}>
              <ThemedText style={styles.headerText}>전일대비</ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerColumn}>
              <ThemedText style={styles.headerText}>거래대금</ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
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
                        <ThemedText style={styles.coinName}>{item.name}</ThemedText>
                        <ThemedText style={styles.coinPair}>{item.base}/{item.quote}</ThemedText>
                      </View>
                    </View>
                    
                    <View style={styles.priceInfo}>
                      <ThemedText style={styles.price}>
                        ₩{item.price.toLocaleString()}
                      </ThemedText>
                    </View>
                    
                    <View style={styles.changeInfo}>
                      <ThemedText style={[styles.change, { color: isUp ? '#FF4444' : '#00C851' }]}>
                        {isUp ? '+' : ''}{item.change24hPct.toFixed(2)}%
                      </ThemedText>
                    </View>
                    
                    <View style={styles.volumeInfo}>
                      <ThemedText style={styles.volume}>
                        ₩{(item.volume24h / 100000000).toFixed(0)}백만
                      </ThemedText>
                    </View>
                  </Pressable>
                </Link>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      )}

      {/* 공지사항 */}
      {showNotice && (
        <View style={styles.noticeBanner}>
          <ThemedText style={styles.noticeText}>
            공지 [업비트 ATH 이벤트] 비트코인 ATH 기념! 풍성한 한가위에...
          </ThemedText>
          <TouchableOpacity onPress={() => setShowNotice(false)}>
            <ThemedText style={styles.noticeClose}>✕</ThemedText>
          </TouchableOpacity>
        </View>
      )}
      
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // 업비트 스타일 헤더
  upbitHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: 20,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
  },
  batteryText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
  },
  mainNavContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  mainNavTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeMainNavTab: {
    borderBottomColor: '#4285F4',
  },
  mainNavText: {
    fontSize: 16,
    color: '#6C757D',
    fontWeight: '500',
  },
  activeMainNavText: {
    color: '#4285F4',
    fontWeight: '600',
  },

  // 컨테이너
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // 검색바
  searchContainer: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  searchIcon: {
    color: '#6C757D',
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#212529',
    fontSize: 14,
  },

  // 마켓 탭
  marketTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  marketTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeMarketTab: {
    borderBottomColor: '#FFD700',
  },
  marketTabText: {
    fontSize: 14,
    color: '#6C757D',
    fontWeight: '500',
  },
  activeMarketTabText: {
    color: '#FFD700',
    fontWeight: '600',
  },

  // 리스트 헤더
  listHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 12,
    color: '#6C757D',
    fontWeight: '500',
    marginRight: 4,
  },
  sortIcon: {
    fontSize: 10,
    color: '#6C757D',
  },

  // 마켓 행
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  coinSymbol: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 8,
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
  coinPair: {
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

  // 공지사항
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#4285F4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 60, // 하단 네비게이션 바 공간 확보
  },
  noticeText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
  },
  noticeClose: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 8,
  },
});


