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
      {/* 커스텀 헤더 */}
      <View style={styles.customHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <ThemedText style={styles.logoText}>Y</ThemedText>
            </View>
            <ThemedText style={styles.headerTitle}>거래소</ThemedText>
          </View>
        </View>
        
        <View style={styles.headerCenter}>
          <ThemedText style={styles.mainLogo}>yooay</ThemedText>
        </View>
        
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon}>
            <ThemedText style={styles.iconText}>⚙️</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <ThemedText style={styles.iconText}>🔔</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuOpen(true)}>
            <ThemedText style={styles.iconText}>☰</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* 메인 탭 */}
      <View style={styles.mainTabContainer}>
        <TouchableOpacity 
          style={[styles.mainTab, selectedTab === '거래소' && styles.activeMainTab]}
          onPress={() => setSelectedTab('거래소')}
        >
          <ThemedText style={[styles.mainTabText, selectedTab === '거래소' && styles.activeMainTabText]}>
            거래소
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, selectedTab === 'NFT' && styles.activeMainTab]}
          onPress={() => setSelectedTab('NFT')}
        >
          <ThemedText style={[styles.mainTabText, selectedTab === 'NFT' && styles.activeMainTabText]}>
            NFT
          </ThemedText>
        </TouchableOpacity>
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

          {/* 사용자 보유자산 */}
          <View style={styles.assetSummary}>
            <View style={styles.assetRow}>
              <ThemedText style={styles.assetLabel}>총 매수</ThemedText>
              <ThemedText style={styles.assetValue}>₩{userAssets.totalPurchase.toLocaleString()}</ThemedText>
            </View>
            <View style={styles.assetRow}>
              <ThemedText style={styles.assetLabel}>평가손익</ThemedText>
              <ThemedText style={[styles.assetValue, { color: userAssets.unrealizedPnl >= 0 ? '#FF4444' : '#00C851' }]}>
                ₩{userAssets.unrealizedPnl.toLocaleString()}
              </ThemedText>
            </View>
            <View style={styles.assetRow}>
              <ThemedText style={styles.assetLabel}>총 평가</ThemedText>
              <ThemedText style={styles.assetValue}>₩{userAssets.totalValue.toLocaleString()}</ThemedText>
            </View>
            <View style={styles.assetRow}>
              <ThemedText style={styles.assetLabel}>수익률</ThemedText>
              <ThemedText style={[styles.assetValue, { color: userAssets.returnRate >= 0 ? '#FF4444' : '#00C851' }]}>
                {userAssets.returnRate >= 0 ? '+' : ''}{userAssets.returnRate.toFixed(2)}%
              </ThemedText>
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

          {/* 마켓 리스트 헤더 */}
          <View style={styles.listHeader}>
            <ThemedText style={styles.headerText}>한글명</ThemedText>
            <ThemedText style={styles.headerText}>현재가</ThemedText>
            <ThemedText style={styles.headerText}>전일대비</ThemedText>
            <ThemedText style={styles.headerText}>거래대금</ThemedText>
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
                      <ThemedText style={[styles.changeAmount, { color: isUp ? '#FF4444' : '#00C851' }]}>
                        {isUp ? '+' : ''}{((item.price * item.change24hPct) / 100).toLocaleString()}
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
  // 커스텀 헤더
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerLeft: {
    flex: 1,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  mainLogo: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  headerIcon: {
    marginLeft: 12,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 18,
  },

  // 메인 탭
  mainTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  mainTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeMainTab: {
    borderBottomColor: '#FFD700',
  },
  mainTabText: {
    fontSize: 16,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  activeMainTabText: {
    color: '#FFD700',
    fontWeight: '600',
  },

  // 컨테이너
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
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

  // 사용자 보유자산
  assetSummary: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  assetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  assetLabel: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  assetValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    flex: 1,
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    textAlign: 'center',
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
  changeAmount: {
    fontSize: 11,
    marginTop: 2,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
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


