import ProfileSheet from '@/components/profile-sheet';
import HamburgerMenu from '@/components/hamburger-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { mockBalances } from '@/data/balances';
import { mockMarkets } from '@/data/markets';
import { formatCurrency, getExchangeRates, formatPercentage, formatCrypto } from '@/lib/currency';
import { t } from '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { 
  Button, 
  StyleSheet, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PHOTO_KEY = 'profile.photoUri';

export default function HomeScreen() {
  const { signOut, currentUser } = useAuth();
  const { currency, language } = usePreferences();
  const total = mockBalances.reduce((s, b) => s + b.valueUSD, 0);
  const topMarkets = mockMarkets.slice(0, 3);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [rates, setRates] = useState<any>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<'Crypto' | 'KRW' | 'USD' | 'JPY' | 'CNY' | 'EUR'>('Crypto');
  const [dropdownOpen, setDropdownOpen] = useState(false);

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

  // Calculate total assets in different currencies
  const getTotalInCurrency = (currency: string) => {
    if (currency === 'Crypto') {
      // Convert all assets to ETH equivalent
      const ethTotal = mockBalances.reduce((sum, balance) => {
        // Simple conversion: assume 1 ETH = $2000, other cryptos have different rates
        const ethRate = 2000;
        return sum + (balance.valueUSD / ethRate);
      }, 0);
      return { amount: ethTotal, symbol: 'ETH' };
    } else {
      const total = mockBalances.reduce((sum, balance) => sum + balance.valueUSD, 0);
      const converted = rates ? total * rates[currency] : total;
      return { amount: converted, symbol: currency };
    }
  };

  const getBackgroundImage = (currency: string) => {
    switch (currency) {
      case 'Crypto': return require('@/assets/images/card-crypto.png');
      case 'KRW': return require('@/assets/images/card-krw.png');
      case 'USD': return require('@/assets/images/card-usd.png');
      case 'JPY': return require('@/assets/images/card-jpy.png');
      case 'CNY': return require('@/assets/images/card-cny.png');
      case 'EUR': return require('@/assets/images/card-eur.png');
      default: return require('@/assets/images/card-crypto.png');
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
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
        onAvatarPress={() => setProfileOpen(true)} 
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri} 
      />
      
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Slogan */}
        <View style={styles.sloganContainer}>
          <ThemedText style={styles.slogan}>YooY Land is starting a new golden era with you.</ThemedText>
        </View>

        {/* Asset Card */}
        <View style={styles.assetCard}>
          <Image source={getBackgroundImage(selectedCurrency)} style={styles.cardBackground} contentFit="cover" />
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
                {formatNumber(getTotalInCurrency(selectedCurrency).amount)} {getTotalInCurrency(selectedCurrency).symbol}
              </ThemedText>
              <ThemedText style={styles.assetCount}>{mockBalances.length}개 자산</ThemedText>
            </View>
            
            <View style={styles.cardFooter}>
              <View style={styles.logoContainer}>
                <ThemedText style={styles.cardLogo}>YooY</ThemedText>
              </View>
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
              <View style={styles.holdingsList}>
                {mockBalances.map((balance, index) => (
                  <View key={index} style={styles.holdingItem}>
                    <View style={styles.holdingInfo}>
                      <ThemedText style={styles.holdingSymbol}>{balance.symbol}</ThemedText>
                      <ThemedText style={styles.holdingName}>{balance.name}</ThemedText>
                    </View>
                    <View style={styles.holdingAmount}>
                      <ThemedText style={styles.holdingValue}>
                        {formatNumber(balance.amount)} {balance.symbol}
                      </ThemedText>
                      <ThemedText style={styles.holdingUSD}>
                        ${formatNumber(balance.valueUSD)}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.transactionList}>
                <ThemedText style={styles.transactionTitle}>거래 내역</ThemedText>
                <ThemedText style={styles.transactionText}>최근 거래 내역이 여기에 표시됩니다.</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <ThemedText style={styles.sectionTitle}>빠른 액션</ThemedText>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>📤</ThemedText>
              <ThemedText style={styles.actionText}>전송</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>📥</ThemedText>
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
          
          <View style={styles.filterOptions}>
            <TouchableOpacity style={styles.filterOption}>
              <View style={[styles.filterDot, { backgroundColor: '#FFD700' }]} />
              <ThemedText style={styles.filterText}>즐겨찾기</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterOption}>
              <View style={[styles.filterDot, { backgroundColor: '#FF69B4' }]} />
              <ThemedText style={styles.filterText}>보유 1위</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterOption}>
              <View style={[styles.filterDot, { backgroundColor: '#32CD32' }]} />
              <ThemedText style={styles.filterText}>보유 2위</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterOption}>
              <View style={[styles.filterDot, { backgroundColor: '#87CEEB' }]} />
              <ThemedText style={styles.filterText}>보유 3위</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterOption}>
              <View style={[styles.filterDot, { backgroundColor: '#FFFFFF' }]} />
              <ThemedText style={styles.filterText}>기타</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.cryptoGrid}>
            {/* YOY Card */}
            <View style={styles.cryptoCard}>
              <View style={styles.cryptoHeader}>
                <ThemedText style={styles.cryptoName}>YOY *</ThemedText>
                <ThemedText style={styles.cryptoChange}>-2.88%</ThemedText>
              </View>
              <View style={styles.cryptoIcon}>
                <ThemedText style={styles.cryptoIconText}>Y</ThemedText>
              </View>
              <ThemedText style={styles.cryptoAmount}>50.00M YOY</ThemedText>
              <ThemedText style={styles.cryptoValue}>₩6677.09B</ThemedText>
              <ThemedText style={styles.cryptoValueUSD}>$4.82B</ThemedText>
            </View>

            {/* BTC Card */}
            <View style={styles.cryptoCard}>
              <View style={styles.cryptoHeader}>
                <ThemedText style={styles.cryptoName}>BTC *</ThemedText>
                <ThemedText style={styles.cryptoChange}>-2.50%</ThemedText>
              </View>
              <View style={styles.cryptoIcon}>
                <ThemedText style={styles.cryptoIconText}>B</ThemedText>
              </View>
              <ThemedText style={styles.cryptoAmount}>2.44 BTC</ThemedText>
              <ThemedText style={styles.cryptoValue}>₩539.93B</ThemedText>
              <ThemedText style={styles.cryptoValueUSD}>$389.84M</ThemedText>
            </View>

            {/* ETH Card */}
            <View style={styles.cryptoCard}>
              <View style={styles.cryptoHeader}>
                <ThemedText style={styles.cryptoName}>ETH *</ThemedText>
                <ThemedText style={[styles.cryptoChange, { color: '#32CD32' }]}>+1.80%</ThemedText>
              </View>
              <View style={styles.cryptoIcon}>
                <ThemedText style={styles.cryptoIconText}>E</ThemedText>
              </View>
              <ThemedText style={styles.cryptoAmount}>3.16 ETH</ThemedText>
              <ThemedText style={styles.cryptoValue}>₩1,234.56M</ThemedText>
              <ThemedText style={styles.cryptoValueUSD}>$890.12M</ThemedText>
            </View>

            {/* SOL Card */}
            <View style={styles.cryptoCard}>
              <View style={styles.cryptoHeader}>
                <ThemedText style={styles.cryptoName}>SOL *</ThemedText>
                <ThemedText style={styles.cryptoChange}>-5.20%</ThemedText>
              </View>
              <View style={styles.cryptoIcon}>
                <ThemedText style={styles.cryptoIconText}>S</ThemedText>
              </View>
              <ThemedText style={styles.cryptoAmount}>34.00 SOL</ThemedText>
              <ThemedText style={styles.cryptoValue}>₩123.45M</ThemedText>
              <ThemedText style={styles.cryptoValueUSD}>$89.01M</ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
      
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} onSaved={(uri) => setAvatarUri(uri)} />
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
      </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  sloganContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  slogan: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  assetCard: {
    margin: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
    overflow: 'hidden',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cardBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardContent: {
    padding: 20,
    zIndex: 1,
  },
  currencyTabs: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  currencyTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeTab: {
    backgroundColor: '#FFD700',
  },
  tabText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#0A0A0A',
    fontSize: 12,
    fontWeight: '600',
  },
  mainBalance: {
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceAmount: {
    color: '#90EE90',
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    flex: 1,
  },
  cardLogo: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
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
  },
  quickActionsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  holdingsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
  },
  cryptoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cryptoCard: {
    width: '48%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
    padding: 12,
    marginBottom: 12,
  },
  cryptoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cryptoName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cryptoChange: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '500',
  },
  cryptoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cryptoIconText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cryptoAmount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  cryptoValue: {
    color: '#FFFFFF',
    fontSize: 11,
    opacity: 0.8,
    marginBottom: 2,
  },
  cryptoValueUSD: {
    color: '#FFFFFF',
    fontSize: 11,
    opacity: 0.6,
  },
  dropdownMenu: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  holdingInfo: {
    flex: 1,
  },
  holdingSymbol: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  holdingName: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.7,
  },
  holdingAmount: {
    alignItems: 'flex-end',
  },
  holdingValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  holdingUSD: {
    color: '#FFFFFF',
    fontSize: 11,
    opacity: 0.6,
  },
  transactionList: {
    padding: 16,
    alignItems: 'center',
  },
  transactionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  transactionText: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.7,
  },
});
