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
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [nameLanguage, setNameLanguage] = useState<'en' | 'ko'>('ko');

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

  const toggleFavorite = (coinId: string) => {
    setFavorites(prev => 
      prev.includes(coinId) 
        ? prev.filter(id => id !== coinId)
        : [...prev, coinId]
    );
  };

  const handleSort = (column: string) => {
    if (column === 'name') {
      setNameLanguage(prev => prev === 'en' ? 'ko' : 'en');
    } else {
      setSortBy(column);
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    }
  };

  const filteredMarkets = mockMarkets
    .filter(market => {
      if (selectedMarket === 'FAV') {
        return favorites.includes(market.id);
      }
      if (selectedMarket === 'MY') {
        // 사용자 보유 자산이 있는 코인만 표시 (mock)
        return ['BTC-KRW', 'ETH-KRW', 'SOL-KRW'].includes(market.id);
      }
      if (selectedMarket === 'USDT') {
        // USDT 마켓: USDT 페어 또는 주요 코인들
        return market.quote === 'USDT' || ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'].includes(market.base);
      }
      if (selectedMarket === 'ETH') {
        // ETH 마켓: ETH 페어 또는 주요 코인들
        return market.quote === 'ETH' || ['BTC', 'SOL', 'BNB', 'XRP', 'ADA'].includes(market.base);
      }
      if (selectedMarket === 'BTC') {
        // BTC 마켓: BTC 페어 또는 주요 코인들
        return market.quote === 'BTC' || ['ETH', 'SOL', 'BNB', 'XRP', 'ADA'].includes(market.base);
      }
      return market.quote === selectedMarket;
    })
    .filter(market => 
      market.base.toLowerCase().includes(searchText.toLowerCase()) ||
      market.name.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'volume':
          return (b.volume24h - a.volume24h) * multiplier;
        case 'change':
          return (b.change24hPct - a.change24hPct) * multiplier;
        case 'price':
          return (b.price - a.price) * multiplier;
        case 'name':
          return a.base.localeCompare(b.base) * multiplier;
        default:
          return 0;
      }
    });


  return (
    <ThemedView style={{ flex: 1 }}>
      {/* 거래소 상단바 */}
      <View style={styles.exchangeTopBar}>
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
          <TouchableOpacity style={styles.exchangeIcon} onPress={() => setShowSearchModal(true)}>
            <ThemedText style={styles.iconText}>🔍</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangeIcon}>
            <ThemedText style={styles.iconText}>⚙️</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exchangeIcon}>
            <ThemedText style={styles.iconText}>💬</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {selectedTab === '거래소' && (
        <View style={styles.container}>
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
            <TouchableOpacity 
              style={styles.headerColumn}
              onPress={() => handleSort('name')}
            >
              <ThemedText style={[styles.headerText, nameLanguage === 'ko' && styles.activeHeaderText]}>
                {selectedMarket === 'MY' ? 'Coin/Market' : 'Coin/Market'}
              </ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerColumn}
              onPress={() => handleSort('price')}
            >
              <ThemedText style={[styles.headerText, sortBy === 'price' && styles.activeHeaderText]}>
                {selectedMarket === 'MY' ? '현재가/n매수가' : '현재가'}
              </ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerColumn}
              onPress={() => handleSort('change')}
            >
              <ThemedText style={[styles.headerText, sortBy === 'change' && styles.activeHeaderText]}>
                {selectedMarket === 'MY' ? '수익률/n수익금' : '전일대비'}
              </ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerColumn}
              onPress={() => handleSort('volume')}
            >
              <ThemedText style={[styles.headerText, sortBy === 'volume' && styles.activeHeaderText]}>
                {selectedMarket === 'MY' ? '총보유금액' : '거래금액'}
              </ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
          </View>

          {/* 마켓 리스트 */}
          <FlatList
            data={filteredMarkets}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingBottom: 80 }}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
            renderItem={({ item }) => {
              const isUp = item.change24hPct >= 0;
              const isFavorite = favorites.includes(item.id);
              const isMyTab = selectedMarket === 'MY';
              const displayPrice = selectedMarket === 'KRW' ? 
                `₩${item.price.toLocaleString()}` : 
                selectedMarket === 'USDT' ? 
                  `$${item.price.toLocaleString()}` :
                  selectedMarket === 'ETH' ?
                    `${(item.price / 3200000).toFixed(4)} ETH` :
                    selectedMarket === 'BTC' ?
                      `${(item.price / 45000000).toFixed(6)} BTC` :
                      `$${item.price.toLocaleString()}`;
              
              return (
                <View style={styles.marketRow}>
                  <View style={styles.coinInfo}>
                    <TouchableOpacity 
                      style={styles.favoriteButton}
                      onPress={() => toggleFavorite(item.id)}
                    >
                      <ThemedText style={[styles.favoriteIcon, isFavorite && styles.favoriteActive]}>
                        {isFavorite ? '★' : '☆'}
                      </ThemedText>
                    </TouchableOpacity>
                    <Link href={{ pathname: '/market/[id]', params: { id: item.id } }} asChild>
                      <Pressable style={styles.coinInfoLink}>
                        <View style={styles.coinIcon}>
                          <ThemedText style={styles.coinSymbol}>{item.base.charAt(0)}</ThemedText>
                        </View>
                        <View style={styles.coinDetails}>
                          <ThemedText style={styles.coinName}>
                            {nameLanguage === 'ko' ? item.name : item.base}
                          </ThemedText>
                          <ThemedText style={styles.coinPair}>{item.base}/{item.quote}</ThemedText>
                        </View>
                      </Pressable>
                    </Link>
                  </View>
                  
                  <View style={styles.priceInfo}>
                    <ThemedText style={styles.price}>
                      {displayPrice}
                    </ThemedText>
                    {isMyTab && (
                      <ThemedText style={styles.buyPrice}>
                        매수가: {displayPrice}
                      </ThemedText>
                    )}
                  </View>
                  
                  <View style={styles.changeInfo}>
                    <ThemedText style={[styles.change, { color: isUp ? '#FF4444' : '#00C851' }]}>
                      {isUp ? '+' : ''}{item.change24hPct.toFixed(2)}%
                    </ThemedText>
                    {isMyTab && (
                      <ThemedText style={[styles.profit, { color: isUp ? '#FF4444' : '#00C851' }]}>
                        {isUp ? '+' : ''}₩{(item.price * 0.1).toFixed(0)}
                      </ThemedText>
                    )}
                  </View>
                  
                  <View style={styles.volumeInfo}>
                    <ThemedText style={styles.volume}>
                      {isMyTab ? 
                        `₩${(item.price * 1.5).toLocaleString()}` : 
                        `₩${(item.volume24h / 100000000).toFixed(0)}백만`
                      }
                    </ThemedText>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      )}

      {/* 검색 모달 */}
      {showSearchModal && (
        <View style={styles.searchModal}>
          <View style={styles.searchModalContent}>
            <View style={styles.searchInputContainer}>
              <ThemedText style={styles.searchIcon}>🔍</ThemedText>
              <TextInput
                style={styles.searchInput}
                placeholder="코인명/심볼 검색"
                placeholderTextColor="#666"
                value={searchText}
                onChangeText={setSearchText}
                autoFocus={true}
              />
            </View>
            <TouchableOpacity 
              style={styles.searchCloseButton}
              onPress={() => setShowSearchModal(false)}
            >
              <ThemedText style={styles.searchCloseText}>✕</ThemedText>
            </TouchableOpacity>
          </View>
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
    paddingVertical: 4,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    backgroundColor: '#010925',
  },
  activeMarketTab: {
    borderBottomColor: '#FFD700',
    backgroundColor: '#010925',
  },
  marketTabText: {
    fontSize: 14,
    color: '#FFFFFF',
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
  favoriteButton: {
    marginRight: 4,
    padding: 2,
    position: 'absolute',
    left: 0,
    zIndex: 10,
  },
  coinInfoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 20,
    flex: 1,
  },
  favoriteIcon: {
    color: '#666',
    fontSize: 16,
  },
  favoriteActive: {
    color: '#FFD700',
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
  buyPrice: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  profit: {
    fontSize: 10,
    marginTop: 2,
  },
  activeHeaderText: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  separator: {
    height: 0,
  },

  // 검색 모달
  searchModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1000,
    elevation: 1000,
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  searchModalContent: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchCloseButton: {
    marginLeft: 12,
    padding: 8,
  },
  searchCloseText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
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


