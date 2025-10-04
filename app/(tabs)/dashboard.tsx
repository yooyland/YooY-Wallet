import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { mockBalances } from '@/data/balances';
import { mockMarkets } from '@/data/markets';
import { t } from '@/i18n';
import { formatCurrency, formatPercentage, getExchangeRates } from '@/lib/currency';
import { convertKRWToUSD, getUpbitPrices, getUSDKRWRate } from '@/lib/upbit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const PHOTO_KEY = 'profile.photoUri';

export default function DashboardScreen() {
  const { signOut, currentUser } = useAuth();
  const { currency, language } = usePreferences();
  const total = mockBalances.reduce((s, b) => s + b.valueUSD, 0);
  const topMarkets = mockMarkets.slice(0, 3);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [rates, setRates] = useState<any>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<'Crypto' | 'KRW' | 'USD' | 'JPY' | 'CNY' | 'EUR'>('Crypto');
  const [realTimeBalances, setRealTimeBalances] = useState(mockBalances);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
      
      // Fetch real-time prices from Upbit
      try {
        const cryptoSymbols = mockBalances
          .filter(balance => ['YOY', 'BTC', 'ETH', 'SOL', 'DOT', 'BNB', 'AVAX', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'].includes(balance.symbol))
          .map(balance => balance.symbol);
        
        console.log('Fetching prices for symbols:', cryptoSymbols);
        const upbitPrices = await getUpbitPrices(cryptoSymbols);
        const usdKrwRate = await getUSDKRWRate();
        
        console.log('Upbit prices received:', upbitPrices);
        console.log('USD/KRW rate:', usdKrwRate);
        
        const updatedBalances = mockBalances.map(balance => {
          const upbitPrice = upbitPrices.find(price => price.symbol === balance.symbol);
          if (upbitPrice) {
            const usdPrice = convertKRWToUSD(upbitPrice.price, usdKrwRate);
            const newValueUSD = balance.amount * usdPrice;
            console.log(`${balance.symbol}: ${balance.amount} * ${usdPrice} = ${newValueUSD}`);
            return {
              ...balance,
              valueUSD: newValueUSD,
              currentPrice: usdPrice
            };
          }
          console.log(`No price found for ${balance.symbol}, using original value`);
          return balance;
        });
        
        setRealTimeBalances(updatedBalances);
      } catch (error) {
        console.error('Failed to fetch real-time prices:', error);
        setRealTimeBalances(mockBalances);
      }
    })();
  }, [currency]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(PHOTO_KEY);
      if (saved) setAvatarUri(saved);
    })();
  }, []);

  // Calculate total assets in different currencies
  const getTotalInCurrency = (currency: string) => {
    if (currency === 'Crypto') {
      // Convert all crypto assets to ETH equivalent (ETH is the base currency)
      const ethTotal = realTimeBalances.reduce((sum, balance) => {
        if (balance.symbol === 'ETH') {
          return sum + balance.amount;
        } else if (['YOY', 'BTC', 'SOL', 'DOT', 'BNB', 'AVAX', 'XMR', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'].includes(balance.symbol)) {
          // Convert other cryptos to ETH: assume 1 ETH = $3,800
          const ethRate = 3800;
          return sum + (balance.valueUSD / ethRate);
        }
        return sum;
      }, 0);
      return { amount: ethTotal, symbol: 'ETH' };
    } else {
      // For fiat currencies, show the actual fiat amount
      const fiatBalance = realTimeBalances.find(balance => balance.symbol === currency);
      if (fiatBalance) {
        return { amount: fiatBalance.amount, symbol: currency };
      }
      
      // Fallback to USD conversion if fiat currency not found
      const total = realTimeBalances.reduce((sum, balance) => sum + balance.valueUSD, 0);
      const converted = rates ? total * rates[currency] : total;
      return { amount: converted, symbol: currency };
    }
  };

  const getBackgroundImage = (currency: string) => {
    try {
      switch (currency) {
        case 'Crypto': return require('@/assets/images/card-crypto.png');
        case 'KRW': return require('@/assets/images/card-krw.png');
        case 'USD': return require('@/assets/images/card-usd.png');
        case 'JPY': return require('@/assets/images/card-jpy.png');
        case 'CNY': return require('@/assets/images/card-cny.png');
        case 'EUR': return require('@/assets/images/card-eur.png');
        default: return require('@/assets/images/card-crypto.png');
      }
    } catch (error) {
      // Fallback to gradient background if images don't exist
      return null;
    }
  };

  const formatNumber = (num: number, currency: string) => {
    // Currencies that don't use decimal places
    const noDecimalCurrencies = ['KRW', 'JPY'];
    
    if (noDecimalCurrencies.includes(currency)) {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num);
    } else if (num >= 1000) {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } else {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(num);
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title={currentUser?.email?.split('@')[0] || 'admin'} 
        onProfilePress={() => setProfileOpen(true)}
        avatarUri={avatarUri}
      />
      
      <ScrollView style={styles.container}>
        {/* Slogan */}
        <View style={styles.sloganContainer}>
          <ThemedText style={styles.slogan}>YooY Land is starting</ThemedText>
          <ThemedText style={styles.slogan}>a new golden era with you.</ThemedText>
        </View>

        {/* Asset Card */}
        <View style={styles.assetCard}>
          {getBackgroundImage(selectedCurrency) ? (
            <Image 
              source={getBackgroundImage(selectedCurrency)} 
              style={styles.cardBackground} 
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#4A148C', '#7B1FA2', '#9C27B0']}
              style={styles.cardBackground}
            />
          )}
          <View style={styles.cardContent}>
            <View style={styles.currencyTabs}>
              {(['Crypto', 'KRW', 'USD', 'JPY', 'CNY', 'EUR'] as const).map((currency) => (
                <TouchableOpacity 
                  key={currency}
                  style={[styles.currencyTab, selectedCurrency === currency && styles.activeTab]}
                  onPress={() => setSelectedCurrency(currency)}
                >
                  <ThemedText style={selectedCurrency === currency ? styles.activeTabText : styles.tabText}>
                    {currency}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.mainBalance}>
              <ThemedText style={styles.balanceAmount}>
                {formatNumber(getTotalInCurrency(selectedCurrency).amount, selectedCurrency)} {getTotalInCurrency(selectedCurrency).symbol}
              </ThemedText>
              <ThemedText style={styles.assetCount}>
                {selectedCurrency === 'Crypto' 
                  ? realTimeBalances.filter(balance => 
                      ['YOY', 'BTC', 'ETH', 'SOL', 'DOT', 'BNB', 'AVAX', 'XMR', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'].includes(balance.symbol)
                    ).length
                  : 1
                } {t('assets', language)}
              </ThemedText>
            </View>
            
            <View style={styles.cardFooter}>
              <TouchableOpacity 
                style={styles.dropdownButton}
                onPress={() => setDropdownOpen(!dropdownOpen)}
              >
                <ThemedText style={styles.dropdownIcon}>{dropdownOpen ? '▲' : '▼'}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <View style={styles.dropdownMenu}>
            {selectedCurrency === 'Crypto' ? (
              <ScrollView 
                style={styles.holdingsList}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {realTimeBalances.filter(balance => 
                  ['YOY', 'BTC', 'ETH', 'SOL', 'DOT', 'BNB', 'AVAX', 'XMR', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'].includes(balance.symbol)
                ).map((balance, index) => (
                  <View key={index} style={styles.holdingItem}>
                    <View style={styles.holdingInfo}>
                      <ThemedText style={styles.holdingSymbol}>{balance.symbol}</ThemedText>
                      <ThemedText style={styles.holdingName}>{balance.name}</ThemedText>
                    </View>
                    <View style={styles.holdingAmount}>
                      <ThemedText style={styles.holdingValue}>
                        {formatNumber(balance.amount, balance.symbol)} {balance.symbol}
                      </ThemedText>
                      <ThemedText style={styles.holdingUSD}>
                        ${formatNumber(balance.valueUSD, 'USD')}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.transactionList}>
                <ThemedText style={styles.transactionTitle}>{t('transactions', language)}</ThemedText>
                <ThemedText style={styles.transactionText}>Recent transactions will be displayed here.</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <ThemedText style={styles.sectionTitle}>빠른 액션</ThemedText>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>✈️</ThemedText>
              <ThemedText style={styles.actionText}>전송</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>⬇️</ThemedText>
              <ThemedText style={styles.actionText}>수신</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>📱</ThemedText>
              <ThemedText style={styles.actionText}>QR코드</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>🔄</ThemedText>
              <ThemedText style={styles.actionText}>거래내역</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>📅</ThemedText>
              <ThemedText style={styles.actionText}>calendar</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>❓</ThemedText>
              <ThemedText style={styles.actionText}>일일출석보상</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>❓</ThemedText>
              <ThemedText style={styles.actionText}>일일출석보상</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>⋯</ThemedText>
              <ThemedText style={styles.actionText}>더보기</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Holdings Section */}
        <View style={styles.holdingsSection}>
          <ThemedText style={styles.sectionTitle}>보유자산</ThemedText>
          
          {/* Legend */}
          <View style={styles.legendContainer}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
              <ThemedText style={styles.legendText}>즐겨찾기</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF8C00' }]} />
              <ThemedText style={styles.legendText}>보유 1위</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#8A2BE2' }]} />
              <ThemedText style={styles.legendText}>보유 2위</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4169E1' }]} />
              <ThemedText style={styles.legendText}>보유 3위</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#808080' }]} />
              <ThemedText style={styles.legendText}>기타</ThemedText>
            </View>
          </View>

          {/* Asset Cards Grid */}
          <View style={styles.assetCardsGrid}>
            {realTimeBalances.map((balance, index) => {
              // 각 자산별 색상 정의
              const getCardColor = (symbol: string) => {
                const colors = [
                  '#FFD700', // YOY - 골드
                  '#FF8C00', // BTC - 오렌지
                  '#8A2BE2', // ETH - 보라
                  '#4169E1', // SOL - 파랑
                  '#32CD32', // DOT - 라임
                  '#FFD700', // BNB - 골드
                  '#FF4500', // AVAX - 레드오렌지
                  '#FF69B4', // XMR - 핫핑크
                  '#C0C0C0', // LTC - 실버
                  '#00CED1', // LINK - 다크터콰이즈
                  '#1E90FF', // ADA - 도저블루
                  '#FF6347', // ATOM - 토마토
                  '#9370DB', // XLM - 미디엄퍼플
                  '#20B2AA', // XRP - 라이트시그린
                  '#FFA500', // DOGE - 오렌지
                  '#DC143C', // TRX - 크림슨
                  '#00FF00', // USDT - 라임
                  '#0000FF', // USDC - 블루
                  '#FF0000', // KRW - 레드
                  '#008000', // USD - 그린
                  '#800080', // JPY - 퍼플
                  '#FFC0CB', // CNY - 핑크
                  '#FFFF00', // EUR - 옐로우
                ];
                return colors[index % colors.length];
              };

              const cardColor = getCardColor(balance.symbol);
              const isPositive = Math.random() > 0.5; // 랜덤으로 상승/하락 표시
              const changePercent = (Math.random() * 10 - 5).toFixed(2); // -5% ~ +5% 랜덤

              return (
                <View key={index} style={[styles.assetCard, { backgroundColor: cardColor }]}>
                  <View style={styles.cardHeader}>
                    <ThemedText style={styles.cardSymbol}>{balance.symbol} ★</ThemedText>
                    <View style={styles.priceChangeContainer}>
                      <ThemedText style={[styles.priceChange, { color: isPositive ? '#00FF00' : '#FF4444' }]}>
                        {isPositive ? '+' : ''}{changePercent}%
                      </ThemedText>
                      <ThemedText style={[styles.priceChangeIcon, { color: isPositive ? '#00FF00' : '#FF4444' }]}>
                        {isPositive ? '↑' : '↓'}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.cardContent}>
                    <ThemedText style={styles.cardAmount}>
                      {formatNumber(balance.amount, balance.symbol)} {balance.symbol}
                    </ThemedText>
                    <ThemedText style={styles.cardValue}>
                      ${formatNumber(balance.valueUSD, 'USD')}
                    </ThemedText>
                  </View>
                  <View style={styles.cardIcon}>
                    <View style={[styles.iconCircle, { backgroundColor: cardColor }]}>
                      <ThemedText style={styles.iconText}>{balance.symbol.charAt(0)}</ThemedText>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Top Markets */}
        <View style={styles.topMarketsSection}>
          <ThemedText style={styles.sectionTitle}>Top Markets</ThemedText>
          {topMarkets.map((market, index) => (
            <Link key={index} href={`/market/${market.id}`} asChild>
              <TouchableOpacity style={styles.marketItem}>
                <View style={styles.marketInfo}>
                  <ThemedText style={styles.marketSymbol}>{market.symbol}</ThemedText>
                  <ThemedText style={styles.marketName}>{market.name}</ThemedText>
                </View>
                <View style={styles.marketPrice}>
                  <ThemedText style={styles.marketPriceValue}>
                    {formatCurrency(market.price, currency, rates)}
                  </ThemedText>
                  <ThemedText style={[styles.marketChange, { color: market.change >= 0 ? '#4CAF50' : '#F44336' }]}>
                    {formatPercentage(market.change)}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            </Link>
          ))}
        </View>
      </ScrollView>

      <ProfileSheet 
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSaved={(newAvatarUri) => {
          setAvatarUri(newAvatarUri);
          setProfileOpen(false);
        }}
      />

      <HamburgerMenu 
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        avatarUri={avatarUri}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  sloganContainer: {
    padding: 20,
    alignItems: 'center',
  },
  slogan: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
  },
  assetCard: {
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  cardBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  cardContent: {
    padding: 20,
    zIndex: 1,
  },
  currencyTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  currencyTab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  activeTab: {
    backgroundColor: 'rgba(255,215,0,0.3)',
  },
  tabText: {
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  mainBalance: {
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceAmount: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  assetCount: {
    color: '#90EE90',
    fontSize: 14,
    opacity: 0.8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownIcon: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dropdownMenu: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginTop: -10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
  },
  holdingsList: {
    maxHeight: 200,
  },
  holdingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  holdingInfo: {
    flex: 1,
  },
  holdingSymbol: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  holdingName: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  holdingAmount: {
    alignItems: 'flex-end',
  },
  holdingValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  holdingUSD: {
    color: '#90EE90',
    fontSize: 12,
  },
  transactionList: {
    padding: 16,
  },
  transactionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  transactionText: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  quickActionsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '22%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  holdingsSection: {
    padding: 20,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    width: '48%',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  assetCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  assetCard: {
    width: '48%',
    height: 120,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardSymbol: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  priceChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceChange: {
    color: '#FF4444',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 4,
  },
  priceChangeIcon: {
    color: '#FF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardValue: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
  },
  cardIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  topMarketsSection: {
    padding: 20,
  },
  marketItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  marketInfo: {
    flex: 1,
  },
  marketSymbol: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  marketName: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  marketPrice: {
    alignItems: 'flex-end',
  },
  marketPriceValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  marketChange: {
    fontSize: 12,
    fontWeight: '500',
  },
});
