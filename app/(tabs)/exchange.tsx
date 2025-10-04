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
  Image,
  Animated
} from 'react-native';
import { useEffect, useState, useRef } from 'react';

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
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

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

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { 
      useNativeDriver: false,
      listener: (event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        setIsScrolled(offsetY > 50);
      }
    }
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      {/* 거래소 상단바 - 스크롤 시 숨김 */}
      <Animated.View 
        style={[
          styles.exchangeTopBar,
          {
            transform: [{
              translateY: scrollY.interpolate({
                inputRange: [0, 100],
                outputRange: [0, -100],
                extrapolate: 'clamp',
              })
            }]
          }
        ]}
      >
        <TouchableOpacity 
          style={[styles.exchangeTab, selectedTab === '거래소' && styles.activeExchangeTab]}
          onPress={() => setSelectedTab('거래소')}
        >
          <ThemedText style={[styles.exchangeTabText, selectedTab === '거래소' && styles.activeExchangeTabText]}>
            거래소
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.exchangeTab, selectedTab === 'NFT' && styles.activeExchangeTab]}
          onPress={() => setSelectedTab('NFT')}
        >
          <ThemedText style={[styles.exchangeTabText, selectedTab === 'NFT' && styles.activeExchangeTabText]}>
            NFT
          </ThemedText>
        </TouchableOpacity>
        
        <View style={styles.exchangeIcons}>
          <TouchableOpacity style={styles.exchangeIcon}>
            <ThemedText style={styles.iconText}>⚙️</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangeIcon}>
            <ThemedText style={styles.iconText}>💬</ThemedText>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {selectedTab === '거래소' && (
        <View style={styles.container}>
          {/* 검색바 - 스크롤 시 숨김 */}
          <Animated.View 
            style={[
              styles.searchContainer,
              {
                transform: [{
                  translateY: scrollY.interpolate({
                    inputRange: [0, 100],
                    outputRange: [0, -100],
                    extrapolate: 'clamp',
                  })
                }]
              }
            ]}
          >
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
          </Animated.View>

          {/* 마켓 탭 + 코인 제목탭 - 스크롤 시 상단 고정 */}
          <Animated.View 
            style={[
              styles.fixedMarketSection,
              {
                transform: [{
                  translateY: scrollY.interpolate({
                    inputRange: [0, 100],
                    outputRange: [0, 0],
                    extrapolate: 'clamp',
                  })
                }]
              }
            ]}
          >
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

            {/* 마켓 리스트 헤더 */}
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
          </Animated.View>

          {/* 마켓 리스트 */}
          <FlatList
            data={filteredMarkets}
            keyExtractor={(m) => m.id}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingTop: 40, paddingBottom: 80 }}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
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
            Notice : [YooY Land] Wishing everyone great prosperity!
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
  // 거래소 상단바
  exchangeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  exchangeTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  activeExchangeTab: {
    backgroundColor: '#FFD700',
  },
  exchangeTabText: {
    fontSize: 14,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  activeExchangeTabText: {
    color: '#000000',
    fontWeight: '600',
  },
  exchangeIcons: {
    flexDirection: 'row',
    marginLeft: 'auto',
  },
  exchangeIcon: {
    marginLeft: 12,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 18,
  },

  // 컨테이너
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    height: '100%',
  },

  // 검색바
  searchContainer: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  searchIcon: {
    color: '#666',
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },

  // 고정 마켓 섹션
  fixedMarketSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: '#1A1A1A',
  },

  // 마켓 탭
  marketTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
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
    color: '#CCCCCC',
    fontWeight: '500',
  },
  activeMarketTabText: {
    color: '#FFD700',
    fontWeight: '600',
  },

  // 리스트 헤더
  listHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginRight: 4,
  },
  sortIcon: {
    fontSize: 10,
    color: '#999',
  },

  // 마켓 행
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    marginTop: 0,
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
    color: '#FFFFFF',
    marginBottom: 2,
  },
  coinPair: {
    fontSize: 11,
    color: '#999',
  },
  priceInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
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
    color: '#CCCCCC',
  },
  separator: {
    height: 0,
  },

  // 공지사항
  noticeBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 999,
    elevation: 999,
  },
  noticeText: {
    flex: 1,
    color: '#CCCCCC',
    fontSize: 12,
  },
  noticeClose: {
    color: '#999',
    fontSize: 16,
    marginLeft: 8,
  },
});


