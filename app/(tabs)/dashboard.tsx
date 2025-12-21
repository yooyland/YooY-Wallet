import CoinDetailModal from '@/components/CoinDetailModal';
import Footer from '@/components/footer';
import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import { ThemedText } from '@/components/themed-text';
import QuickActionsSettings from '@/components/QuickActionsSettings';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import TransactionDetailModal from '@/components/TransactionDetailModal';
import { useAuth } from '@/contexts/AuthContext';
import { useMarket } from '@/contexts/MarketContext';
 
import { useTransaction } from '@/contexts/TransactionContext';
import { mockMarkets } from '@/data/markets';
 
import { getExchangeRates } from '@/lib/currency';
import { getCoinPriceByCurrency, updateRealTimePrices } from '@/lib/priceManager';
// 중앙화된 가격 시스템 사용으로 기존 upbit import 제거
import { getMockBalancesForUser } from '@/lib/userBalances';
import { useTransactionStore } from '@/src/stores/transaction.store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router, useFocusEffect } from 'expo-router';
import { useQuickActions } from '@/contexts/QuickActionsContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
    RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PHOTO_KEY = 'profile.photoUri';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, isAuthenticated, currentUser } = useAuth();
  const { currency, language } = usePreferences();
  const { yoyPriceUSD } = useMarket();
  const { getRecentTransactions, addTransaction, updateTransactionMemo } = useTransaction();
  
  // 전역 거래 스토어 사용
  const { getTransactions, recordReward } = useTransactionStore();
  // 실제 사용자 이메일 사용
  const currentUserEmail = currentUser?.email || 'user@example.com';
  const baseBalances = getMockBalancesForUser(currentUserEmail);
  // 발행화폐(법정화폐) 제거: KRW, USD, JPY, CNY, EUR
  const cryptoOnlyBalances = baseBalances.filter(b => !['KRW', 'USD', 'JPY', 'CNY', 'EUR'].includes(b.symbol));
  const balances = cryptoOnlyBalances.map(b => b.symbol === 'YOY' && yoyPriceUSD ? ({ ...b, valueUSD: b.amount * yoyPriceUSD }) : b);
  const total = balances.reduce((s, b) => s + b.valueUSD, 0);
  const locale = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US';
  const [refreshingDash, setRefreshingDash] = useState(false);
  // TDZ 방지용 베이스 함수: 위에 선언하여 초기 렌더에서도 안전
  async function refreshBalancesBase() {
    if (!currentUserEmail) return;
    const storageKey = `user_balances_${currentUserEmail}`;
    try {
      const savedBalances = await AsyncStorage.getItem(storageKey);
      if (savedBalances) {
        let savedBalancesData: Record<string, number> = {};
        try {
          savedBalancesData = JSON.parse(savedBalances);
        } catch {
          setRealTimeBalances(balances);
          return;
        }
        const finalBalances = calculateFinalBalances(savedBalancesData);
        const convertedBalances = Object.entries(finalBalances).map(([symbol, amount]) => {
          const baseBalance = baseBalances.find(b => b.symbol === symbol);
          if (baseBalance) {
            const usdPerUnit = baseBalance.amount ? (baseBalance.valueUSD / baseBalance.amount) : 0;
            return {
              ...baseBalance,
              amount: amount as number,
              valueUSD: symbol === 'YOY' && yoyPriceUSD ? (amount as number) * yoyPriceUSD : (amount as number) * usdPerUnit
            };
          }
          return {
            symbol,
            amount: amount as number,
            valueUSD: symbol === 'YOY' && yoyPriceUSD ? (amount as number) * yoyPriceUSD : 0,
            name: symbol,
            change24h: 0,
            change24hPct: 0
          };
        });
        setRealTimeBalances(convertedBalances);
      } else {
        setRealTimeBalances(balances);
      }
    } catch {
      setRealTimeBalances(balances);
    }
  }
  const onRefreshDash = useCallback(async () => {
    setRefreshingDash(true);
    try {
      await refreshBalancesBase();
    } finally {
      setRefreshingDash(false);
    }
  }, [currentUserEmail, yoyPriceUSD, baseBalances, calculateFinalBalances]);
  const [realTimeBalances, setRealTimeBalances] = useState(balances);
  
  // 코인 상세 모달 상태
  const [coinDetailModalVisible, setCoinDetailModalVisible] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<any>(null);

  // 거래 내역을 기반으로 최종 잔액 계산 (함수 선언식으로 TDZ 방지)
  function calculateFinalBalances(initialBalances: Record<string, number>) {
    const transactions = getTransactions();
    console.log('Dashboard - All transactions:', transactions);
    console.log('Dashboard - Initial balances:', initialBalances);
    const finalBalances = { ...initialBalances };
    
    transactions.forEach(transaction => {
      console.log('Processing transaction:', {
        type: transaction.type,
        symbol: transaction.symbol,
        amount: transaction.amount,
        change: transaction.change,
        fromToken: transaction.fromToken,
        fromAmount: transaction.fromAmount,
        toToken: transaction.toToken,
        toAmount: transaction.toAmount
      });
      
      if (transaction.type === 'swap') {
        // 새로운 스왑 거래 구조: symbol과 change 사용
        if (transaction.symbol && transaction.change !== undefined) {
          console.log(`Updating ${transaction.symbol} by ${transaction.change} (current: ${finalBalances[transaction.symbol] || 0})`);
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) + transaction.change;
          console.log(`New balance for ${transaction.symbol}: ${finalBalances[transaction.symbol]}`);
        }
        // 기존 스왑 거래 구조도 지원
        else if (transaction.fromToken && transaction.fromAmount) {
          console.log(`Reducing ${transaction.fromToken} by ${transaction.fromAmount} (current: ${finalBalances[transaction.fromToken] || 0})`);
          finalBalances[transaction.fromToken] = (finalBalances[transaction.fromToken] || 0) - transaction.fromAmount;
          console.log(`New balance for ${transaction.fromToken}: ${finalBalances[transaction.fromToken]}`);
        }
        if (transaction.toToken && transaction.toAmount) {
          console.log(`Adding ${transaction.toToken} by ${transaction.toAmount} (current: ${finalBalances[transaction.toToken] || 0})`);
          finalBalances[transaction.toToken] = (finalBalances[transaction.toToken] || 0) + transaction.toAmount;
          console.log(`New balance for ${transaction.toToken}: ${finalBalances[transaction.toToken]}`);
        }
      } else if (transaction.type === 'reward' || transaction.type === 'daily_reward' || transaction.type === 'event_reward') {
        // 보상 거래: 해당 토큰 증가
        if (transaction.symbol && transaction.amount) {
          console.log(`Adding reward ${transaction.symbol} by ${transaction.amount} (current: ${finalBalances[transaction.symbol] || 0})`);
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) + transaction.amount;
          console.log(`New balance for ${transaction.symbol}: ${finalBalances[transaction.symbol]}`);
        }
      } else if (transaction.type === 'staking') {
        // 스테이킹 거래: 해당 토큰 차감
        if (transaction.symbol && transaction.amount) {
          console.log(`Reducing staking ${transaction.symbol} by ${transaction.amount} (current: ${finalBalances[transaction.symbol] || 0})`);
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) - transaction.amount;
          console.log(`New balance for ${transaction.symbol}: ${finalBalances[transaction.symbol]}`);
        }
      } else if (transaction.type === 'transfer') {
        const sym = transaction.symbol;
        if (sym) {
          if (typeof transaction.change === 'number' && isFinite(transaction.change)) {
            finalBalances[sym] = (finalBalances[sym] || 0) + (transaction.change as number);
            console.log(`Adjust ${sym} by ${transaction.change} (current: ${finalBalances[sym]})`);
          } else if (typeof transaction.amount === 'number' && isFinite(transaction.amount)) {
            // change가 없다면 방향 정보가 없어 안전하게 무시
            console.log(`Skip ambiguous transfer amount for ${sym}: ${transaction.amount}`);
          }
        }
      }
    });
    
    console.log('Final calculated balances:', finalBalances);
    return finalBalances;
  }
  
  // 잔액을 영구적으로 저장하고 불러오기 (payments.tsx와 동일한 키 사용)
  useEffect(() => {
    const loadRealTimeBalances = async () => {
      if (!currentUserEmail) return;
      
      const storageKey = `user_balances_${currentUserEmail}`;
      
      try {
        const savedBalances = await AsyncStorage.getItem(storageKey);
        
        if (savedBalances) {
          // payments.tsx에서 저장된 userBalances를 dashboard 형식으로 변환
          const savedBalancesData = JSON.parse(savedBalances);
          console.log('Dashboard - Parsed saved balances (initial load):', savedBalancesData);
          
          // 거래 내역을 기반으로 최종 잔액 계산
          const finalBalances = calculateFinalBalances(savedBalancesData);
          console.log('Dashboard - Final balances after transactions (initial load):', finalBalances);
          console.log('Dashboard - YOY balance:', finalBalances.YOY);
          
          const convertedBalancesAll = Object.entries(finalBalances).map(([symbol, amount]) => {
            const baseBalance = baseBalances.find(b => b.symbol === symbol);
            if (baseBalance) {
              return {
                ...baseBalance,
                amount: amount as number,
                valueUSD: symbol === 'YOY' && yoyPriceUSD ? (amount as number) * yoyPriceUSD : (amount as number) * (baseBalance.valueUSD / baseBalance.amount)
              };
            }
            return {
              symbol,
              amount: amount as number,
              valueUSD: symbol === 'YOY' && yoyPriceUSD ? (amount as number) * yoyPriceUSD : 0,
              name: symbol,
              change24h: 0,
              change24hPct: 0
            };
          });
          const email = (currentUser as any)?.email || '';
          const isAdmin = email === 'admin@yooyland.com';
          const yoyOnly = email === 'jch4389@gmail.com' || email === 'landyooy@gmail.com';
          const convertedBalances = isAdmin ? convertedBalancesAll : (yoyOnly ? convertedBalancesAll.filter(x => x.symbol === 'YOY') : []);
          setRealTimeBalances(convertedBalances);
        } else {
          setRealTimeBalances(balances);
        }
      } catch (error) {
        console.error('Error loading dashboard balances:', error);
        setRealTimeBalances(balances);
      }
    };

    loadRealTimeBalances();
  }, [currentUserEmail, yoyPriceUSD, calculateFinalBalances]);

  // realTimeBalances 변경 시 AsyncStorage에 저장 (payments.tsx와 동일한 형식으로)
  useEffect(() => {
    const saveRealTimeBalances = async () => {
      if (!currentUserEmail || realTimeBalances.length === 0) return;
      
      const storageKey = `user_balances_${currentUserEmail}`;
      try {
        // dashboard 형식을 payments.tsx 형식으로 변환하여 저장
        const userBalances: Record<string, number> = {};
        realTimeBalances.forEach(balance => {
          userBalances[balance.symbol] = balance.amount;
        });
        await AsyncStorage.setItem(storageKey, JSON.stringify(userBalances));
      } catch (error) {
        console.error('Error saving dashboard balances:', error);
      }
    };

    saveRealTimeBalances();
  }, [realTimeBalances, currentUserEmail]);

  // 잔액 새로고침 함수
  const refreshBalances = useCallback(async () => {
    await refreshBalancesBase();
  }, [currentUserEmail, yoyPriceUSD, baseBalances, calculateFinalBalances]);

  // 페이지 포커스 시 잔액 새로고침
  useFocusEffect(
    useCallback(() => {
      console.log('Dashboard focused - refreshing balances');
      refreshBalances();
    }, [refreshBalances])
  );

  // 강제 잔액 새로고침 함수 (디버깅용)
  const forceRefreshBalances = useCallback(async () => {
    console.log('Force refreshing balances...');
    await refreshBalances();
  }, [refreshBalances]);

  // 코인 클릭 핸들러
  const handleCoinPress = useCallback((coin: any) => {
    setSelectedCoin(coin);
    setCoinDetailModalVisible(true);
  }, []);

  // 모달 닫기 핸들러
  const handleCloseModal = useCallback(() => {
    setCoinDetailModalVisible(false);
    setSelectedCoin(null);
  }, []);

  // Wallet 페이지로 이동하는 함수
  const handleNavigateToWallet = useCallback((tab: 'send' | 'receive', coinSymbol: string) => {
    // 지갑이 있는 코인인지 확인 (YOY, USDT, USDC, BTC, ETH 등)
    const supportedCoins = ['YOY', 'USDT', 'USDC', 'BTC', 'ETH'];
    
    if (supportedCoins.includes(coinSymbol)) {
      // Wallet 페이지로 이동하고 해당 탭과 코인 선택
      router.push(`/(tabs)/wallet?tab=${tab}&coin=${coinSymbol}`);
    } else {
      // 지갑이 없는 코인의 경우 Wallet 페이지로 이동 (지갑 생성 기능은 Wallet 페이지에서 처리)
      router.push(`/(tabs)/wallet?tab=${tab}&coin=${coinSymbol}&create=true`);
    }
  }, []);

  // 마켓 페이지로 이동하는 함수
  const handleNavigateToMarket = useCallback(async (coinSymbol: string) => {
    try {
      // 먼저 KRW 마켓이 있는지 확인
      const krwMarketSymbol = coinSymbol === 'YOY' ? 'KRW-YOY' : `KRW-${coinSymbol}`;
      
      // 중앙화된 가격 시스템에서 지원하는 코인인지 확인
      const supportedCoins = ['YOY', 'BTC', 'ETH', 'BNB', 'AAVE', 'SOL', 'XMR', 'USDT', 'USDC', 'ADA', 'DOT', 'LINK', 'UNI', 'LTC', 'BCH', 'XRP', 'DOGE', 'SHIB', 'MATIC', 'AVAX', 'ATOM', 'TRX', 'XLM', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA', 'EOS', 'XTZ'];
      
      if (supportedCoins.includes(coinSymbol)) {
        // 지원하는 코인인 경우 KRW 마켓으로 이동
        router.push(`/market/${krwMarketSymbol}?tab=주문`);
      } else {
        // 지원하지 않는 코인인 경우 USDT 마켓으로 이동
        const usdtMarketSymbol = `USDT-${coinSymbol}`;
        router.push(`/market/${usdtMarketSymbol}?tab=주문`);
      }
    } catch (error) {
      console.error('마켓 정보 조회 오류:', error);
      // 오류 발생 시 기본 KRW 마켓으로 이동
      const marketSymbol = coinSymbol === 'YOY' ? 'KRW-YOY' : `KRW-${coinSymbol}`;
      router.push(`/market/${marketSymbol}?tab=주문`);
    }
  }, []);

  // 거래 타입별 색상
  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      'swap': '#9C27B0',
      'reward': '#4CAF50',
      'daily_reward': '#4CAF50',
      'event_reward': '#4CAF50',
      'staking': '#FF9800',
      'deposit': '#2196F3',
      'withdrawal': '#F44336',
      'transfer': '#607D8B',
      'trade': '#795548',
      'penalty': '#F44336',
      'fee': '#FF5722',
      'refund': '#4CAF50',
      'airdrop': '#E91E63',
      'burn': '#424242',
      'mint': '#3F51B5',
    };
    return colorMap[type] || '#FFFFFF';
  };

  // 주기적으로 잔액 새로고침 (5초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshBalances();
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshBalances]);

  const [favorites, setFavorites] = useState<string[]>([]);
  // 알림 설정 상태
  const [alertSettings, setAlertSettings] = useState<Record<string, { currency?: 'USD' | 'KRW' | 'ETH' | 'COIN'; priceTarget?: number; priceRisk?: number; plusChangePct?: number; minusChangePct?: number }>>({});
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState<string | null>(null);
  const [alertCurrency, setAlertCurrency] = useState<'USD' | 'KRW' | 'ETH' | 'COIN'>('USD');
  const [priceTarget, setPriceTarget] = useState<string>('');
  const [priceRisk, setPriceRisk] = useState<string>('');
  const [plusChangePct, setPlusChangePct] = useState<string>('');
  const [minusChangePct, setMinusChangePct] = useState<string>('');
  const [alerted, setAlerted] = useState<Record<string, boolean>>({});
  const [memoDraft, setMemoDraft] = useState('');
  
  // 즐겨찾기 우선순위로 정렬: 즐겨찾기 먼저, 그 다음 보유금액 순
  const sortedBalances = useMemo(() => {
    return realTimeBalances.sort((a, b) => {
      const aIsFavorite = favorites.includes(a.symbol);
      const bIsFavorite = favorites.includes(b.symbol);
      
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      
      return b.valueUSD - a.valueUSD;
    });
  }, [realTimeBalances, favorites]);
  
  const topMarkets = mockMarkets.slice(0, 3);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);
  // Back-to-menu once flag (used by admin/settings pages)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const flag = await AsyncStorage.getItem('ui.menuOpenOnce');
          if (flag === '1') {
            setMenuOpen(true);
            await AsyncStorage.removeItem('ui.menuOpenOnce');
          }
        } catch {}
      })();
    }, [])
  );
  const [username, setUsername] = useState<string>('');

  // Load saved avatar and username on component mount
  useEffect(() => {
    (async () => {
      if (isAuthenticated && currentUser?.uid) {
        const saved = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.photoUri`);
        if (saved) setAvatarUri(saved);
        
        // Load username
        const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
        if (info) {
          try {
            const parsedInfo = JSON.parse(info);
            setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          } catch {
            setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          }
        } else {
          setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
        }
      }
    })();
  }, [isAuthenticated, currentUser?.uid, profileUpdated]);

  // 알림 모달 열기
  const openAlertModal = (symbol: string) => {
    setAlertSymbol(symbol);
    const existing = alertSettings[symbol] || {};
    setAlertCurrency(existing.currency ?? 'USD');
    setPriceTarget(existing.priceTarget != null ? String(existing.priceTarget) : '');
    setPriceRisk(existing.priceRisk != null ? String(existing.priceRisk) : '');
    setPlusChangePct(existing.plusChangePct != null ? String(existing.plusChangePct) : '');
    setMinusChangePct(existing.minusChangePct != null ? String(existing.minusChangePct) : '');
    setAlertModalVisible(true);
  };

  // 알림 설정 저장
  const saveAlertSettings = async () => {
    if (!alertSymbol) return;
    const priceTargetNum = priceTarget.trim() === '' ? undefined : Number(priceTarget);
    const priceRiskNum = priceRisk.trim() === '' ? undefined : Number(priceRisk);
    const plusPctNum = plusChangePct.trim() === '' ? undefined : Number(plusChangePct);
    const minusPctNum = minusChangePct.trim() === '' ? undefined : Number(minusChangePct);
    const next = { ...alertSettings, [alertSymbol]: { currency: alertCurrency, priceTarget: priceTargetNum, priceRisk: priceRiskNum, plusChangePct: plusPctNum, minusChangePct: minusPctNum } } as Record<string, { currency?: 'USD' | 'KRW' | 'ETH'; priceTarget?: number; priceRisk?: number; plusChangePct?: number; minusChangePct?: number }>;
    if (priceTargetNum == null && priceRiskNum == null && plusPctNum == null && minusPctNum == null) {
      delete next[alertSymbol];
    }
    setAlertSettings({ ...next });
    // 저장 직후 알림 상태 초기화 (다시 트리거 가능)
    setAlerted(prev => ({ ...prev, [alertSymbol!]: false }));
    if (isAuthenticated && currentUser?.uid) {
      await AsyncStorage.setItem(`u:${currentUser.uid}:alerts.v1`, JSON.stringify(next));
    } else {
      await AsyncStorage.setItem('alerts.v1', JSON.stringify(next));
    }
    setAlertModalVisible(false);
  };

  // 통화 변환 유틸 (USD 기준 값과 선택 통화로 표시 값 산출)
  const convertByCurrency = (usdValue: number | undefined, currency: 'USD' | 'KRW' | 'ETH' | 'COIN', symbol: string, priceUSD?: number) => {
    if (usdValue == null) return undefined;
    switch (currency) {
      case 'USD':
        return usdValue;
      case 'KRW':
        return usdValue * 1300; // 간단 환산
      case 'ETH':
        return usdValue / 3000; // 간단 환산
      case 'COIN':
        // 코인 자체 단위: USD 가격을 해당 코인 가격(USD)로 나눠서 수량 기준으로 표시
        if (!priceUSD || priceUSD === 0) return undefined;
        return usdValue / priceUSD;
      default:
        return usdValue;
    }
  };

  // 알림 평가 함수
  const evaluateAlertsForBalances = (balancesToCheck: any[]) => {
    if (!balancesToCheck || Object.keys(alertSettings).length === 0) return;
    balancesToCheck.forEach((b) => {
      const setting = alertSettings[b.symbol];
      if (!setting) return;
      if (alerted[b.symbol]) return; // 이미 알림된 경우 중복 방지

      // 현재가 USD, 기준가 USD(여기서는 buyPrice를 전일대비 근사치로 사용)
      const currentPriceUSD: number | undefined = b.currentPrice;
      const buyPriceUSD: number | undefined = b.buyPrice;

      const priceInSel = convertByCurrency(currentPriceUSD, setting.currency ?? 'USD', b.symbol, currentPriceUSD);
      const baseInSel = convertByCurrency(buyPriceUSD, setting.currency ?? 'USD', b.symbol, currentPriceUSD);

      let triggered = false;
      let reason = '';

      if (setting.priceTarget != null && priceInSel != null && priceInSel >= setting.priceTarget) {
        triggered = true; reason = `목표 금액 도달 (${setting.priceTarget})`;
      }
      if (!triggered && setting.priceRisk != null && priceInSel != null && priceInSel <= setting.priceRisk) {
        triggered = true; reason = `위험금액 하회 (${setting.priceRisk})`;
      }
      if (!triggered && baseInSel != null && baseInSel > 0 && priceInSel != null) {
        const changePct = ((priceInSel - baseInSel) / baseInSel) * 100;
        if (setting.plusChangePct != null && changePct >= setting.plusChangePct) {
          triggered = true; reason = `+변동폭 ${setting.plusChangePct}% 이상`;
        }
        if (!triggered && setting.minusChangePct != null && changePct <= -Math.abs(setting.minusChangePct)) {
          triggered = true; reason = `-변동폭 ${setting.minusChangePct}% 이하`;
        }
      }

      if (triggered) {
        try {
          Alert.alert(`${b.symbol} 알림`, `${b.symbol}: ${reason}`);
        } catch (e) {
          console.log('Alert fallback:', b.symbol, reason);
        }
        setAlerted(prev => ({ ...prev, [b.symbol]: true }));
      }
    });
  };

  // Upbit 마켓 데이터 가져오기
  useEffect(() => {
    // 중앙화된 가격 시스템 사용으로 upbit markets fetch 제거
  }, []);


  const [rates, setRates] = useState<any>(null);
  // 중앙화된 가격 시스템 사용으로 usdKrw 제거
  const [selectedCurrency, setSelectedCurrency] = useState<'Crypto' | 'KRW' | 'USD' | 'JPY' | 'CNY' | 'EUR'>('Crypto');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Quick Actions (shared context)
  const { actions: quickActionsState } = useQuickActions();
  const quickEntries = useMemo(() => ([
    { key: 'send', labelEn: 'Send', labelKo: '보내기', icon: '↗' },
    { key: 'receive', labelEn: 'Receive', labelKo: '받기', icon: '↘' },
    { key: 'qr', labelEn: 'QR Code', labelKo: 'QR 코드', icon: '⊞' },
    { key: 'gift', labelEn: 'Gift', labelKo: '기프트', icon: '🎁' },
    { key: 'history', labelEn: 'History', labelKo: '히스토리', icon: '≡' },
    { key: 'schedule', labelEn: 'Schedule', labelKo: '일정', icon: '▣' },
    { key: 'reward', labelEn: 'Reward', labelKo: '리워드', icon: '★' },
    { key: 'chat', labelEn: 'Chat', labelKo: '채팅', icon: '○' },
    { key: 'shop', labelEn: 'Shop', labelKo: '상점', icon: '◊' },
    { key: 'nft', labelEn: 'NFT', labelKo: 'NFT', icon: '◆' },
    { key: 'buy', labelEn: 'Buy', labelKo: '매수', icon: '▲' },
    { key: 'sell', labelEn: 'Sell', labelKo: '매도', icon: '▼' },
    { key: 'diary', labelEn: 'Diary', labelKo: '일기', icon: '◯' },
    { key: 'accountBook', labelEn: 'Account Book', labelKo: '가계부', icon: '◐' },
    { key: 'memo', labelEn: 'Memo', labelKo: '메모', icon: '◑' },
  ]), [language]);

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
      
      // 중앙화된 가격 시스템 사용 (Exchange 페이지와 동일한 로직)
      try {
        console.log('🔄 대시보드 실시간 가격 업데이트 시작...');
        await updateRealTimePrices();
        
        const updatedBalances = realTimeBalances.map(balance => {
          const usdPrice = getCoinPriceByCurrency(balance.symbol, 'USD');
          if (usdPrice > 0) {
            const newValueUSD = balance.amount * usdPrice;
            console.log(`✅ ${balance.symbol}: ${balance.amount} * ${usdPrice} = ${newValueUSD}`);
            return {
              ...balance,
              valueUSD: newValueUSD,
              currentPrice: usdPrice
            };
          }
          console.log(`⚠️ ${balance.symbol} 가격 데이터 없음, 기본값 사용`);
          return balance;
        });
        
        setRealTimeBalances(updatedBalances);
        try {
          evaluateAlertsForBalances(updatedBalances);
        } catch (e) {
          console.log('evaluateAlertsForBalances error', e);
        }
        
        console.log('✅ 대시보드 가격 업데이트 완료');
      } catch (error) {
        console.error('❌ 대시보드 가격 업데이트 실패:', error);
        // 실패 시에도 YOY는 컨텍스트 가격으로 보정
        const adjusted = balances.map(b => b.symbol === 'YOY' && yoyPriceUSD ? ({ ...b, valueUSD: b.amount * yoyPriceUSD, currentPrice: yoyPriceUSD }) : b);
        setRealTimeBalances(adjusted);
      }
    })();
  }, [currency, currentUserEmail, yoyPriceUSD]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(PHOTO_KEY);
      if (saved) setAvatarUri(saved);
      
      // Check daily reward status
      if (isAuthenticated) {
        const today = new Date().toDateString();
        const rewardKey = `daily_reward_${currentUserEmail}_${today}`;
        const claimed = await AsyncStorage.getItem(rewardKey);
        setDailyRewardClaimed(!!claimed);
        
        // Load total rewards and consecutive days
        const totalRewardsKey = `total_rewards_${currentUserEmail}`;
        const consecutiveDaysKey = `consecutive_days_${currentUserEmail}`;
        const savedTotalRewards = await AsyncStorage.getItem(totalRewardsKey);
        const savedConsecutiveDays = await AsyncStorage.getItem(consecutiveDaysKey);
        
        setTotalRewards(savedTotalRewards ? parseInt(savedTotalRewards) : 0);
        setConsecutiveDays(savedConsecutiveDays ? parseInt(savedConsecutiveDays) : 0);
        
        // Load favorites (전역 즐겨찾기)
        const FAVORITES_KEY = currentUser?.uid ? `u:${currentUser.uid}:global.favorites.v1` : 'global.favorites.v1';
        const savedFavorites = await AsyncStorage.getItem(FAVORITES_KEY);
        setFavorites(savedFavorites ? JSON.parse(savedFavorites) : []);

      // Load alert settings (코인별 알림 설정)
      const ALERTS_KEY = currentUser?.uid ? `u:${currentUser.uid}:alerts.v1` : 'alerts.v1';
      const savedAlerts = await AsyncStorage.getItem(ALERTS_KEY);
      setAlertSettings(savedAlerts ? JSON.parse(savedAlerts) : {});
      }
    })();
  }, [isAuthenticated, currentUser?.uid]);

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
    } else {
      // For crypto currencies, always show 4 decimal places with thousand separators
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }).format(num);
    }
  };

  const formatCurrencyWithUnit = (amount: number, currency: string) => {
    const units = [
      { value: 1e12, symbol: 'T' },
      { value: 1e9, symbol: 'B' },
      { value: 1e6, symbol: 'M' },
      { value: 1e3, symbol: 'K' },
    ];

    for (const unit of units) {
      if (amount >= unit.value) {
        const formatted = (amount / unit.value).toFixed(2);
        return `${formatted}${unit.symbol}`;
      }
    }
    
    return amount.toFixed(2);
  };

  const formatAmountWithUnit = (amount: number) => {
    const units = [
      { value: 1e12, symbol: 'T' },
      { value: 1e9, symbol: 'B' },
      { value: 1e6, symbol: 'M' },
      { value: 1e3, symbol: 'K' },
    ];

    for (const unit of units) {
      if (amount >= unit.value) {
        const formatted = Math.round(amount / unit.value);
        return `${formatted}${unit.symbol}`;
      }
    }
    
    // 소수점 부분에는 천단위 구분자 없이 표시
    return amount.toFixed(4);
  };

  // Legacy quick action editor logic removed; centralized in settings/quick-actions

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dailyRewardClaimed, setDailyRewardClaimed] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [totalRewards, setTotalRewards] = useState(0);
  const [consecutiveDays, setConsecutiveDays] = useState(0);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [memoModalVisible, setMemoModalVisible] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [moreModalOpen, setMoreModalOpen] = useState(false);

  
  // 대시보드 전용 보유 코인 관리 데이터
  const [selectedMarket, setSelectedMarket] = useState('USDT');
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'profit' | 'value'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [nameLanguage, setNameLanguage] = useState<'en' | 'ko'>('en'); // 코인 이름 언어 (기본값: 영어)
  // 중앙화된 가격 시스템 사용으로 upbitMarkets 제거
  const [symbolNames, setSymbolNames] = useState<Record<string, { ko: string; en: string }>>({});
  const [holdingsData, setHoldingsData] = useState<Record<string, {
    buyPrice: number;
    buyAmount: number;
    totalInvested: number;
    currentValue: number;
    profitLoss: number;
    profitLossPercent: number;
    lastUpdated: string;
  }>>({});

  // 코인 이름 번역 함수
  const getCoinName = (symbol: string) => {
    return t(`coinNames.${symbol}`, language) || symbol;
  };

  // 중앙화된 가격 시스템 사용으로 convertUpbitToMarket 함수 제거

  // 대시보드 전용 Top Market 데이터 가져오기
  const getDashboardHoldingsData = () => {
    const allCoins = ['YOY', 'BTC', 'ETH', 'SOL', 'DOT', 'BNB', 'AVAX', 'XMR', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'];
    const holdingsList: any[] = [];
    
    // 보유한 코인과 보유하지 않은 코인을 분리
    const ownedCoins: string[] = [];
    const unownedCoins: string[] = [];
    
    allCoins.forEach(symbol => {
      const balance = sortedBalances.find(b => b.symbol === symbol);
      if (balance && balance.amount > 0) {
        ownedCoins.push(symbol);
      } else {
        unownedCoins.push(symbol);
      }
    });
    
    // 보유한 코인 먼저 처리
    [...ownedCoins, ...unownedCoins].forEach(symbol => {
      const balance = sortedBalances.find(b => b.symbol === symbol);
      const holdingData = holdingsData[symbol];
      
      // FAV 마켓인 경우 즐겨찾기한 코인만 필터링
      if (selectedMarket === 'FAV' && !favorites.includes(symbol)) {
        return;
      }
      
      // 보유하지 않은 코인의 경우 기본 데이터 생성
      if (!holdingData) {
        // 중앙화된 가격 시스템 사용 (Exchange 페이지와 동일한 로직)
        let currentPrice = 0;
        
        switch (selectedMarket) {
          case 'USDT':
            currentPrice = getCoinPriceByCurrency(symbol, 'USD');
            break;
            
          case 'KRW':
            currentPrice = getCoinPriceByCurrency(symbol, 'USD'); // USD로 통일
            break;
            
          case 'ETH':
            currentPrice = getCoinPriceByCurrency(symbol, 'USD'); // USD로 통일
            break;
            
          case 'FAV':
          default:
            currentPrice = getCoinPriceByCurrency(symbol, 'USD'); // USD로 통일
            break;
        }
        
        // YOY는 컨텍스트 가격 사용
        if (symbol === 'YOY' && yoyPriceUSD) {
          currentPrice = yoyPriceUSD;
        }
        
        holdingsList.push({
          symbol,
          name: symbolNames[symbol]?.ko || getCoinName(symbol),
          currentPrice,
          buyPrice: 0,
          amount: 0,
          totalInvested: 0,
          currentValue: 0,
          profitLoss: 0,
          profitLossPercent: 0,
          isFavorite: favorites.includes(symbol),
          lastUpdated: new Date().toISOString()
        });
        return;
      }
        
      // 중앙화된 가격 시스템 사용 (Exchange 페이지와 동일한 로직)
      let currentPrice = balance ? balance.valueUSD / balance.amount : 0; // 기본값
      
      switch (selectedMarket) {
        case 'USDT':
          currentPrice = getCoinPriceByCurrency(symbol, 'USD');
          break;
          
        case 'KRW':
          currentPrice = getCoinPriceByCurrency(symbol, 'USD'); // USD로 통일
          break;
          
        case 'ETH':
          currentPrice = getCoinPriceByCurrency(symbol, 'USD'); // USD로 통일
          break;
          
        case 'FAV':
        default:
          currentPrice = getCoinPriceByCurrency(symbol, 'USD'); // USD로 통일
          break;
      }
      
      // YOY는 컨텍스트 가격 사용
      if (symbol === 'YOY' && yoyPriceUSD) {
        currentPrice = yoyPriceUSD;
      }
      
      // 현재 가치와 수익/손실 재계산
      const currentValue = balance ? balance.amount * currentPrice : 0;
      const profitLoss = currentValue - holdingData.totalInvested;
      const profitLossPercent = (profitLoss / holdingData.totalInvested) * 100;
      
      holdingsList.push({
        symbol,
        name: symbolNames[symbol]?.ko || getCoinName(symbol),
        currentPrice,
        buyPrice: holdingData.buyPrice,
        amount: holdingData.buyAmount,
        totalInvested: holdingData.totalInvested,
        currentValue,
        profitLoss,
        profitLossPercent,
        isFavorite: favorites.includes(symbol),
        lastUpdated: new Date().toISOString()
      });
    });
    
    // 정렬: 보유한 코인 우선, 그 다음 즐겨찾기, 마지막으로 선택된 정렬 기준
    return holdingsList.sort((a: any, b: any) => {
      // 보유한 코인 우선 (amount > 0)
      const aHasBalance = a.amount > 0;
      const bHasBalance = b.amount > 0;
      if (aHasBalance && !bHasBalance) return -1;
      if (!aHasBalance && bHasBalance) return 1;
      
      // 보유한 코인 내에서 즐겨찾기 우선
      if (aHasBalance && bHasBalance) {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
      }
      
      // 선택된 정렬 기준에 따라 정렬
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          // Coin/Market: 언어에 따라 정렬
          if (nameLanguage === 'en') {
            comparison = a.symbol.localeCompare(b.symbol);
          } else {
            comparison = a.name.localeCompare(b.name);
          }
          break;
        case 'price':
          comparison = a.currentPrice - b.currentPrice;
          break;
        case 'profit':
          comparison = a.profitLossPercent - b.profitLossPercent;
          break;
        case 'value':
          comparison = a.currentValue - b.currentValue;
          break;
        default:
          comparison = b.profitLossPercent - a.profitLossPercent;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const handleActionPress = (actionId: string) => {
    if (actionId === 'todo') {
      router.push('/(tabs)/todo');
    } else if (actionId === 'chat') {
      router.push('/(tabs)/chat');
    } else if (actionId === 'quickSet') {
      setMoreModalOpen(true);
    } else if (actionId === 'reward') {
      handleDailyReward();
    } else if (actionId === 'send') {
      router.push('/(tabs)/wallet?tab=send');
    } else if (actionId === 'receive') {
      router.push('/(tabs)/wallet?tab=receive');
    } else if (actionId === 'qr') {
      router.push('/(tabs)/wallet?tab=receive');
    } else if (actionId === 'gift') {
      router.push('/(tabs)/wallet?tab=gift');
    } else if (actionId === 'history') {
      router.push('/(tabs)/wallet?tab=history');
    } else if (actionId === 'shop') {
      // Shop 기능이 구현되면 해당 페이지로 이동
      Alert.alert('알림', 'Shop 기능은 준비 중입니다.');
    } else if (actionId === 'nft') {
      // NFT 기능이 구현되면 해당 페이지로 이동
      Alert.alert('알림', 'NFT 기능은 준비 중입니다.');
    } else if (actionId === 'buy') {
      router.push('/(tabs)/exchange');
    } else if (actionId === 'sell') {
      router.push('/(tabs)/exchange');
    } else if (actionId === 'diary') {
      // Diary 기능이 구현되면 해당 페이지로 이동
      Alert.alert('알림', 'Diary 기능은 준비 중입니다.');
    } else if (actionId === 'account') {
      // Account Book 기능이 구현되면 해당 페이지로 이동
      Alert.alert('알림', 'Account Book 기능은 준비 중입니다.');
    } else if (actionId === 'memo') {
      // Memo 기능이 구현되면 해당 페이지로 이동
      Alert.alert('알림', 'Memo 기능은 준비 중입니다.');
    }
  };

  const handleDailyReward = async () => {
    if (dailyRewardClaimed) {
      Alert.alert('Already Claimed', 'You have already claimed today\'s reward.');
      return;
    }

    try {
      // Check if user is logged in
      if (!isAuthenticated) {
        Alert.alert('Error', 'Please log in to claim rewards.');
        return;
      }

      // 전역 거래 스토어에 일일보상 기록
      recordReward({
        symbol: 'YOY',
        amount: 1,
        description: '일일 출석 보상',
        type: 'daily_reward'
      });
      
      // 잔액 업데이트 (payments.tsx와 동일한 저장소 사용)
      const storageKey = `user_balances_${currentUserEmail}`;
      const currentBalances = await AsyncStorage.getItem(storageKey);
      let userBalances = currentBalances ? JSON.parse(currentBalances) : {};
      
      userBalances['YOY'] = (userBalances['YOY'] || 0) + 1;
      await AsyncStorage.setItem(storageKey, JSON.stringify(userBalances));
      
      // 대시보드 잔액도 업데이트
      setRealTimeBalances(prev => prev.map(balance => 
        balance.symbol === 'YOY' 
          ? { ...balance, amount: balance.amount + 1, valueUSD: (balance.amount + 1) * (yoyPriceUSD || 0) }
          : balance
      ));

      // Mark as claimed
      setDailyRewardClaimed(true);
      
      // Update total rewards and consecutive days
      const newTotalRewards = totalRewards + 1;
      const newConsecutiveDays = consecutiveDays + 1;
      
      setTotalRewards(newTotalRewards);
      setConsecutiveDays(newConsecutiveDays);
      
      // Save to AsyncStorage
      const today = new Date().toDateString();
      await AsyncStorage.setItem(`daily_reward_${currentUserEmail}_${today}`, 'claimed');
      await AsyncStorage.setItem(`total_rewards_${currentUserEmail}`, newTotalRewards.toString());
      await AsyncStorage.setItem(`consecutive_days_${currentUserEmail}`, newConsecutiveDays.toString());
      
      // Show reward modal
      setShowRewardModal(true);
      
    } catch (error) {
      console.error('Error claiming daily reward:', error);
      Alert.alert('Error', 'Failed to claim reward. Please try again.');
    }
  };

  const toggleFavorite = async (coinId: string) => {
    const newFavorites = favorites.includes(coinId) 
      ? favorites.filter(id => id !== coinId)
      : [...favorites, coinId];
    
    setFavorites(newFavorites);
    
    // Save to AsyncStorage (전역 즐겨찾기)
    if (isAuthenticated && currentUser?.uid) {
      const FAVORITES_KEY = `u:${currentUser.uid}:global.favorites.v1`;
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
    }
  };

  const handleSort = (column: 'name' | 'price' | 'profit' | 'value') => {
    if (column === 'name') {
      // Coin/Market: 언어 토글 (영어 ↔ 한글)
      setNameLanguage(prev => prev === 'en' ? 'ko' : 'en');
      // 언어 변경 시 정렬 방향도 토글
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 나머지 컬럼: 정렬 방향 토글
      if (sortBy === column) {
        // 같은 컬럼 클릭 시 정렬 방향 토글
        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        // 다른 컬럼 클릭 시 내림차순으로 설정
        setSortOrder('desc');
      }
    }
    setSortBy(column);
  };

  // 가상화폐만 필터링 (발행 화폐 제외)
  const cryptoBalances = realTimeBalances.filter(balance => 
    !['USD', 'KRW', 'JPY', 'EUR', 'GBP', 'CNY'].includes(balance.symbol)
  );


  // 보유 코인 데이터 초기화 및 업데이트
  useEffect(() => {
    const initializeHoldingsData = () => {
      const userHoldings = ['YOY', 'BTC', 'ETH', 'SOL', 'DOT', 'BNB', 'AVAX', 'XMR', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'];
      const newHoldingsData: Record<string, any> = {};
      
      userHoldings.forEach(symbol => {
        const balance = sortedBalances.find(b => b.symbol === symbol);
        if (balance && balance.amount > 0) {
          // 매수가를 현재가의 80-120% 범위에서 랜덤하게 설정
          const currentPrice = balance.valueUSD / balance.amount;
          const buyPrice = currentPrice * (0.8 + Math.random() * 0.4);
          const buyAmount = balance.amount;
          const totalInvested = buyPrice * buyAmount;
          const currentValue = balance.valueUSD;
          const profitLoss = currentValue - totalInvested;
          const profitLossPercent = (profitLoss / totalInvested) * 100;
          
          newHoldingsData[symbol] = {
            buyPrice,
            buyAmount,
            totalInvested,
            currentValue,
            profitLoss,
            profitLossPercent,
            lastUpdated: new Date().toISOString()
          };
        }
      });
      
      setHoldingsData(newHoldingsData);
    };
    
    initializeHoldingsData();
  }, [sortedBalances]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title={username}
        onProfilePress={() => setProfileOpen(true)}
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri}
        profileUpdated={profileUpdated}
      />
      {/* 상단바 하단 여백(대시보드만 확장) */}
      <View style={{ height: 12 }} />
      
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshingDash} onRefresh={onRefreshDash} tintColor="#FFD700" colors={['#FFD700']} />}
      >
        {/* Slogan */}
        <View style={styles.sloganContainer}>
          <ThemedText style={styles.slogan}>{t('sloganLine1', language)}</ThemedText>
          <ThemedText style={styles.slogan}>{t('sloganLine2', language)}</ThemedText>
        </View>

        {/* Asset Card */}
        <View style={styles.assetCard}>
          {/* DOM 안정화: 이미지/그라데이션 모두 렌더하고 opacity로 토글 */}
          <Image 
            source={getBackgroundImage(selectedCurrency) || undefined as any}
            style={[styles.cardBackground, { opacity: getBackgroundImage(selectedCurrency) ? 1 : 0 }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['#4A148C', '#7B1FA2', '#9C27B0']}
            style={[styles.cardBackground, { opacity: getBackgroundImage(selectedCurrency) ? 0 : 1 }]}
          />
          <View style={styles.cardContent}>
            <View style={styles.currencyTabs}>
              {(['Crypto', 'KRW', 'USD', 'JPY', 'CNY', 'EUR'] as const).map((currency) => (
                <TouchableOpacity 
                  key={currency}
                  style={[
                    styles.currencyTab, 
                    currency === 'Crypto' && styles.currencyTabWide,
                    selectedCurrency === currency && styles.activeTab
                  ]}
                  onPress={() => setSelectedCurrency(currency)}
                >
                  <ThemedText 
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    style={selectedCurrency === currency ? styles.activeTabText : styles.tabText}
                  >
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
              {/* YOY 현재가 표시 */}
              {/* YOY 가격 텍스트 노출 제거: 가격은 총자산/보유자산 계산에만 사용 */}
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

        {/* Dropdown Menu (DOM 안정화: 항상 렌더 + display 토글) */}
        <View style={[styles.dropdownMenu, { display: dropdownOpen ? 'flex' : 'none' }]}>
            {selectedCurrency === 'Crypto' ? (
              <ScrollView 
                style={styles.holdingsList}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {sortedBalances.filter(balance => 
                  ['YOY', 'BTC', 'ETH', 'SOL', 'DOT', 'BNB', 'AVAX', 'XMR', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', 'USDT', 'USDC'].includes(balance.symbol)
                ).map((balance) => (
                  <View key={balance.symbol} style={styles.holdingItem}>
                    <TouchableOpacity style={styles.holdingInfo} onPress={() => handleCoinPress(balance)} activeOpacity={0.7}>
                      <ThemedText style={styles.holdingSymbol}>{balance.symbol}</ThemedText>
                      <ThemedText style={styles.holdingName}>{balance.name}</ThemedText>
                    </TouchableOpacity>
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

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <ThemedText style={styles.sectionTitle}>{t('quickActions', language)}</ThemedText>
          <View style={styles.quickActionsGrid}>
            {quickEntries.filter(e => (quickActionsState as any)[e.key]).map((entry) => (
              <TouchableOpacity
                key={`qa-${entry.key}`}
                style={styles.actionButton}
                onPress={() => handleActionPress(entry.key === 'accountBook' ? 'account' : entry.key)}
              >
                <ThemedText style={styles.actionIcon}>{entry.icon}</ThemedText>
                <ThemedText style={styles.actionText}>{language==='en' ? entry.labelEn : entry.labelKo}</ThemedText>
                {entry.key === 'reward' && dailyRewardClaimed && (
                  <ThemedText style={styles.claimedBadge}>✓</ThemedText>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.actionButton} onPress={()=>router.push('/settings/quick-actions')}>
              <ThemedText style={styles.actionIcon}>⋯</ThemedText>
              <ThemedText style={styles.actionText}>Quick Set</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Holdings Section */}
        <View style={styles.holdingsSection}>
          <View style={styles.holdingsHeader}>
            <ThemedText style={styles.holdingsTitle}>{t('holdingsTitle', language)}</ThemedText>
            <View style={styles.holdingsLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
                <ThemedText style={styles.legendText}>{t('legendFavorite', language)}</ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF69B4' }]} />
                <ThemedText style={styles.legendText}>{t('legendTop1', language)}</ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#90EE90' }]} />
                <ThemedText style={styles.legendText}>{t('legendTop2', language)}</ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#87CEEB' }]} />
                <ThemedText style={styles.legendText}>{t('legendTop3', language)}</ThemedText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFFFFF' }]} />
                <ThemedText style={styles.legendText}>{t('legendOthers', language)}</ThemedText>
              </View>
            </View>
          </View>
          
          <View style={styles.holdingsGrid}>
            {(showAllAssets ? sortedBalances : sortedBalances.slice(0, 4)).map((balance, index) => {
              const isFavorite = favorites.includes(balance.symbol);
              let borderColor = '#FFFFFF'; // 기본 화이트
              
              if (isFavorite) {
                borderColor = '#FFD700'; // 즐겨찾기: 골드
              } else {
                // 즐겨찾기가 아닌 경우 보유금액 순으로 색상 할당
                const nonFavoriteIndex = sortedBalances.filter(b => !favorites.includes(b.symbol)).indexOf(balance);
                if (nonFavoriteIndex === 0) borderColor = '#FFB6C1'; // 파스텔 레드
                else if (nonFavoriteIndex === 1) borderColor = '#98FB98'; // 파스텔 그린
                else if (nonFavoriteIndex === 2) borderColor = '#ADD8E6'; // 파스텔 블루
                else borderColor = '#FFFFFF'; // 나머지: 화이트
              }
              
              return (
              <TouchableOpacity 
                key={balance.symbol} 
                style={[
                  styles.holdingCard,
                  { borderColor }
                ]}
                onPress={() => handleCoinPress(balance)}
                activeOpacity={0.7}
              >
                <View style={styles.holdingCardHeader}>
                  <View style={styles.holdingSymbolContainer}>
                    <ThemedText style={styles.holdingSymbol}>{balance.symbol}</ThemedText>
                  </View>
                  <View style={styles.holdingHeaderRight}>
                    <TouchableOpacity 
                      style={styles.favoriteButton}
                      onPress={() => toggleFavorite(balance.symbol)}
                    >
                      <ThemedText style={[
                        styles.favoriteIcon, 
                        favorites.includes(balance.symbol) && styles.favoriteActive
                      ]}>
                        {favorites.includes(balance.symbol) ? '★' : '☆'}
                      </ThemedText>
                    </TouchableOpacity>
                    <View style={styles.holdingChange}>
                      <ThemedText style={styles.changeIcon}>
                        {(balance as any).change24hPct >= 0 ? '↗' : '↘'}
                      </ThemedText>
                      <ThemedText style={[
                        styles.changePercent,
                        { color: (balance as any).change24hPct >= 0 ? '#4CAF50' : '#F44336' }
                      ]}>
                        {(balance as any).change24hPct >= 0 ? '+' : ''}{((balance as any).change24hPct || 0).toFixed(2)}%
                      </ThemedText>
                    </View>
                  </View>
                </View>
                
                <View style={styles.holdingCardBody}>
                  <View style={styles.holdingIcon}>
                    {balance.symbol === 'YOY' ? (
                      <Image 
                        source={require('@/assets/images/yoy.png')}
                        style={styles.coinLogo}
                      />
                    ) : (
                      <Image 
                        source={{ uri: `https://static.upbit.com/logos/${balance.symbol}.png` }}
                        style={styles.coinLogo}
                        defaultSource={{ uri: `https://static.upbit.com/logos/${balance.symbol}.png` }}
                      />
                    )}
                  </View>
                  
                  <View style={styles.holdingInfo}>
                    <ThemedText style={styles.holdingAmount}>
                      {formatAmountWithUnit(balance.amount)} {balance.symbol}
                    </ThemedText>
                    <ThemedText style={styles.holdingValueKRW}>
                      ₩{formatCurrencyWithUnit(balance.valueUSD * 1300, 'KRW')}
                    </ThemedText>
                    <ThemedText style={styles.holdingValueUSD}>
                      ${formatCurrencyWithUnit(balance.valueUSD, 'USD')}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
              );
            })}
          </View>
          
          <TouchableOpacity 
            style={[styles.showMoreButton, { display: realTimeBalances.length > 4 ? 'flex' : 'none' }]}
            onPress={() => setShowAllAssets(!showAllAssets)}
          >
            <ThemedText style={styles.showMoreIcon}>
              {showAllAssets ? '↗' : '↘'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* 대시보드 전용 보유 코인 관리 */}
        <View style={styles.coinMarketSection}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Top Market</ThemedText>
            </View>
          
          {/* 마켓 탭 */}
          <View style={styles.marketTabContainer}>
            {['USDT', 'KRW', 'ETH', 'FAV'].map((market) => (
              <TouchableOpacity
                key={market}
                style={[
                  market === 'FAV' ? styles.favTab : styles.marketTab, 
                  selectedMarket === market && styles.activeMarketTab
                ]}
                onPress={() => setSelectedMarket(market)}
              >
                <ThemedText style={[styles.marketTabText, selectedMarket === market && styles.activeMarketTabText]}>
                  {market}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* 보유 코인 리스트 헤더 */}
          <View style={styles.listHeader}>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerDivider]}
              onPress={() => handleSort('name')}
            >
              <ThemedText style={[
                styles.headerText,
                sortBy === 'name' && nameLanguage === 'ko' && styles.activeHeaderText
              ]}>
                Coin/Market
              </ThemedText>
              <ThemedText style={styles.sortIcon}>
                {sortBy === 'name' ? '↕' : '↕'}
              </ThemedText>
              <View style={styles.headerDividerLine} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerColumnRight, styles.headerDivider]}
              onPress={() => handleSort('price')}
            >
              <ThemedText style={[
                styles.headerText, 
                styles.headerTextRight,
                sortBy === 'price' && sortOrder === 'asc' && styles.activeHeaderText
              ]}>
                <View style={styles.headerTwoLine}>
                  <ThemedText style={styles.headerText}>Price</ThemedText>
                  <ThemedText style={[styles.headerTextSmall, styles.headerTextRight]}>Buy Price</ThemedText>
                </View>
              </ThemedText>
              <ThemedText style={styles.sortIcon}>
                {sortBy === 'price' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
              </ThemedText>
              <View style={styles.headerDividerLine} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerColumnRight, styles.headerDivider]}
              onPress={() => handleSort('profit')}
            >
              <ThemedText style={[
                styles.headerText, 
                styles.headerTextRight,
                sortBy === 'profit' && sortOrder === 'asc' && styles.activeHeaderText
              ]}>
                <View style={styles.headerTwoLine}>
                  <ThemedText style={styles.headerText}>Change</ThemedText>
                  <ThemedText style={[styles.headerTextSmall, styles.headerTextRight]}>P&L</ThemedText>
                </View>
              </ThemedText>
              <ThemedText style={styles.sortIcon}>
                {sortBy === 'profit' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
              </ThemedText>
              <View style={styles.headerDividerLine} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerColumnRight]}
              onPress={() => handleSort('value')}
            >
              <ThemedText style={[
                styles.headerText, 
                styles.headerTextRight,
                sortBy === 'value' && sortOrder === 'asc' && styles.activeHeaderText
              ]}>
                Total Value
              </ThemedText>
              <ThemedText style={styles.sortIcon}>
                {sortBy === 'value' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* 보유 코인 리스트 */}
          {(() => {
            const holdingsData = getDashboardHoldingsData();
            const displayData = showAllHoldings ? holdingsData : holdingsData.slice(0, 5);

            return displayData.length > 0 ? (
              displayData.map((holding) => {
                const isProfit = holding.profitLoss >= 0;
                
                return (
                  <View key={holding.symbol} style={styles.marketItem}>
                    <View style={styles.coinInfo}>
                      <TouchableOpacity 
                        style={styles.coinFavoriteButton}
                        onPress={() => toggleFavorite(holding.symbol)}
                      >
                        <ThemedText style={[styles.favoriteIcon, holding.isFavorite && styles.favoriteActive]}>
                          {holding.isFavorite ? '★' : '☆'}
                        </ThemedText>
                      </TouchableOpacity>
                      <Link href={{ pathname: '/market/[id]', params: { id: holding.symbol } }} asChild>
                        <TouchableOpacity style={styles.coinInfoLink}>
                          <View style={styles.coinIcon}>
                            {holding.symbol === 'YOY' ? (
                              <Image 
                                source={require('@/assets/images/yoy.png')}
                                style={styles.coinLogo}
                              />
                            ) : (
                              <Image 
                                source={{ uri: `https://static.upbit.com/logos/${holding.symbol}.png` }}
                                style={styles.coinLogo}
                                defaultSource={{ uri: `https://static.upbit.com/logos/${holding.symbol}.png` }}
                              />
                            )}
                          </View>
                          <View style={styles.coinDetails}>
                            <View style={styles.coinNameContainer}>
                              {nameLanguage === 'en' ? (
                                <ThemedText style={styles.coinNameEnglish}>
                                  {holding.symbol}
                                </ThemedText>
                              ) : (
                                <ThemedText style={styles.coinNameKorean}>
                                  {holding.name}
                                </ThemedText>
                              )}
                            </View>
                            <ThemedText style={styles.coinPair}>
                              {(() => {
                                switch (selectedMarket) {
                                  case 'USDT':
                                    return `${holding.symbol}/USDT`;
                                  case 'KRW':
                                    return `${holding.symbol}/KRW`;
                                  case 'ETH':
                                    return `${holding.symbol}/ETH`;
                                  case 'FAV':
                                    return `${holding.symbol}/USD`;
                                  default:
                                    return `${holding.symbol}/USD`;
                                }
                              })()}
                            </ThemedText>
                          </View>
                        </TouchableOpacity>
                      </Link>
                    </View>
                    
                    <View style={styles.priceInfo}>
                      <ThemedText style={styles.price}>
                        {(() => {
                          switch (selectedMarket) {
                            case 'USDT':
                              return `$${holding.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
                            case 'KRW':
                              return `₩${(holding.currentPrice * 1300).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                            case 'ETH':
                              return `${(holding.currentPrice / 3000).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH`;
                            case 'FAV':
                              return `$${holding.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
                            default:
                              return `$${holding.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
                          }
                        })()}
                      </ThemedText>
                      <ThemedText style={styles.buyPrice}>
                        {(() => {
                          switch (selectedMarket) {
                            case 'USDT':
                              return `$${holding.buyPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
                            case 'KRW':
                              return `₩${(holding.buyPrice * 1300).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                            case 'ETH':
                              return `${(holding.buyPrice / 3000).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH`;
                            case 'FAV':
                              return `$${holding.buyPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
                            default:
                              return `$${holding.buyPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
                          }
                        })()}
                      </ThemedText>
                    </View>
                    
                    <View style={styles.changeInfo}>
                      <ThemedText style={[styles.change, { color: isProfit ? '#FF4444' : '#00C851' }]}>
                        {isProfit ? '+' : ''}{holding.profitLossPercent.toFixed(2)}%
                      </ThemedText>
                      <ThemedText style={[styles.profit, { color: isProfit ? '#FF4444' : '#00C851' }]}>
                        {(() => {
                          const profitValue = Math.abs(holding.profitLoss);
                          switch (selectedMarket) {
                            case 'USDT':
                              return `${isProfit ? '+' : ''}$${profitValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            case 'KRW':
                              return `${isProfit ? '+' : ''}₩${(profitValue * 1300).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                            case 'ETH':
                              return `${isProfit ? '+' : ''}${(profitValue / 3000).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH`;
                            case 'FAV':
                              return `${isProfit ? '+' : ''}$${profitValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            default:
                              return `${isProfit ? '+' : ''}$${profitValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          }
                        })()}
                      </ThemedText>
                    </View>
                    
                  <View style={styles.volumeInfo}>
                      <ThemedText style={styles.volume}>
                        {(() => {
                          switch (selectedMarket) {
                            case 'USDT':
                              return `$${holding.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            case 'KRW':
                              return `₩${(holding.currentValue * 1300).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                            case 'ETH':
                              return `${(holding.currentValue / 3000).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH`;
                            case 'FAV':
                              return `$${holding.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            default:
                              return `$${holding.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          }
                        })()}
                      </ThemedText>
                      <TouchableOpacity
                        style={styles.alertButton}
                        onPress={() => openAlertModal(holding.symbol)}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={[
                          styles.alertBell,
                          alertSettings[holding.symbol] ? styles.alertBellActive : undefined
                        ]}>🔔</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyMarketState}>
                <ThemedText style={styles.emptyMarketText}>
                  {selectedMarket === 'FAV' ? t('noFavoriteCoins', language) : t('noCoinsToShow', language)}
                </ThemedText>
                <ThemedText style={styles.emptyMarketSubtext}>
                  {selectedMarket === 'FAV' ? t('addToFavorites', language) : t('tryDifferentMarket', language)}
                </ThemedText>
              </View>
            );
          })()}
          
          <TouchableOpacity 
            style={[styles.showMoreButton, { display: getDashboardHoldingsData().length > 5 ? 'flex' : 'none' }]}
            onPress={() => setShowAllHoldings(!showAllHoldings)}
          >
            <ThemedText style={styles.showMoreIcon}>
              {showAllHoldings ? '↗' : '↘'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* 알림 설정 모달 */}
        <Modal
          visible={alertModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAlertModalVisible(false)}
        >
          <BlurView intensity={20} tint="dark" style={styles.memoModalOverlay}>
            <View style={[styles.memoModalContent, { padding: 14, borderRadius: 14 }] }>
              <View style={styles.memoModalHeader}>
                <ThemedText style={styles.memoModalTitle}>
                  {alertSymbol} 코인 알람설정
                </ThemedText>
                <TouchableOpacity onPress={() => setAlertModalVisible(false)} style={styles.memoModalCloseButton}>
                  <ThemedText style={styles.memoCancelButtonText}>닫기</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={styles.alertGoldDivider} />
              <View style={[styles.memoModalBody, { paddingVertical: 6 }]}>
                {/* 통화 선택 */}
                <View style={styles.currencyRow}>
                  <ThemedText style={[styles.memoModalLabel, styles.alertLabelTitle]}>통화 선택</ThemedText>
                  <View style={[styles.chipsRow, styles.currencyChipsRight]}>
                    {(['USD','KRW','ETH'] as const).map(cur => (
                      <TouchableOpacity
                        key={cur}
                        onPress={() => setAlertCurrency(cur)}
                        style={[styles.chip, alertCurrency === cur ? styles.chipActive : styles.chipInactive]}
                        activeOpacity={0.8}
                      >
                        <ThemedText style={[styles.chipText, alertCurrency === cur ? styles.chipTextActive : undefined]}>
                          {cur}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* 금액설정 */}
                <ThemedText style={[styles.memoModalLabel, styles.alertLabelTitle]}>금액설정</ThemedText>
                <View style={styles.twoColumnRow}>
                  <View style={styles.col}>
                    <ThemedText style={[styles.memoModalLabel, styles.subLabel]}>목표 금액</ThemedText>
                    <TextInput
                      style={[styles.memoTextInput, styles.compactInput]}
                      placeholder="예: 50000"
                      placeholderTextColor="#777"
                      keyboardType="numeric"
                      value={priceTarget}
                      onChangeText={setPriceTarget}
                    />
                  </View>
                  <View style={styles.col}>
                    <ThemedText style={[styles.memoModalLabel, styles.subLabel]}>위험금액</ThemedText>
                    <TextInput
                      style={[styles.memoTextInput, styles.compactInput]}
                      placeholder="예: 45000"
                      placeholderTextColor="#777"
                      keyboardType="numeric"
                      value={priceRisk}
                      onChangeText={setPriceRisk}
                    />
                  </View>
                </View>

                {/* 변동폭 */}
                <ThemedText style={[styles.memoModalLabel, styles.alertLabelTitle, { marginTop: 12 }]}>변동폭 (%) - 전일대비 (기준)</ThemedText>
                <View style={styles.twoColumnRow}>
                  <View style={styles.col}>
                    <ThemedText style={[styles.memoModalLabel, styles.subLabel]}>+ 변동폭</ThemedText>
                    <TextInput
                      style={[styles.memoTextInput, styles.compactInput]}
                      placeholder="예: 5"
                      placeholderTextColor="#777"
                      keyboardType="numeric"
                      value={plusChangePct}
                      onChangeText={setPlusChangePct}
                    />
                  </View>
                  <View style={styles.col}>
                    <ThemedText style={[styles.memoModalLabel, styles.subLabel]}>- 변동폭</ThemedText>
                    <TextInput
                      style={[styles.memoTextInput, styles.compactInput]}
                      placeholder="예: 5"
                      placeholderTextColor="#777"
                      keyboardType="numeric"
                      value={minusChangePct}
                      onChangeText={setMinusChangePct}
                    />
                  </View>
                </View>

                <ThemedText style={{ color: '#888', fontSize: 11, marginTop: 8 }}>
                  변동폭 기준: 현재가 대비 상대 변화율 기준으로 계산합니다.
                </ThemedText>
              </View>
              <View style={[styles.memoModalFooter, { paddingTop: 8 }]}>
                <TouchableOpacity style={[styles.memoCancelButton, styles.compactBtn]} onPress={() => setAlertModalVisible(false)}>
                  <ThemedText style={styles.memoCancelButtonText}>취소</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.memoSaveButton, styles.compactBtn]} onPress={saveAlertSettings}>
                  <ThemedText style={styles.memoSaveButtonText}>저장</ThemedText>
                </TouchableOpacity>
              </View>
              {/* 책임 제한 공지 */}
              <View style={{ marginTop: 10 }}>
                <ThemedText style={{ color: '#AAA', fontSize: 11, lineHeight: 16 }}>
                  시스템 상황(거래소 API 지연/중단, 네트워크 혼잡, 단말기 상태 등)으로 인해
                  알림이 지연되거나 전달되지 않을 수 있습니다. 알림 기능은 참고용이며,
                  거래 손익 및 의사결정에 대한 책임은 사용자 본인에게 있습니다.
                </ThemedText>
              </View>
            </View>
          </BlurView>
        </Modal>

        {/* 거래내역 */}
        <View style={styles.transactionHistorySection}>
          <View style={styles.transactionSectionHeader}>
            <ThemedText style={styles.sectionTitle}>{t('transactionHistory', language)}</ThemedText>
          </View>
          
          <View style={styles.txTable}>
            <View style={styles.txHeader}>
              <ThemedText style={[styles.txHeadText, {flex:0.8}]}>{t('time', language)}</ThemedText>
              <ThemedText style={[styles.txHeadText, {flex:0.8}]}>{t('type', language)}</ThemedText>
              <ThemedText style={[styles.txHeadText, {flex:1.8}]}>{t('amount', language)}</ThemedText>
              <ThemedText style={[styles.txHeadText, {flex:0.8}]}>{t('status', language)}</ThemedText>
              <ThemedText style={[styles.txHeadText, {flex:1.0, textAlign:'right'}]}>{t('memo', language)}</ThemedText>
            </View>
          
          <View style={styles.transactionList}>
            {(() => {
              // 전역 거래 스토어에서 모든 거래 기록 가져오기 (필터 없이 모든 코인 포함)
              const allTransactions = getTransactions(); // 필터 없이 모든 거래 가져오기
              console.log('Dashboard - All transactions (no filter):', allTransactions);
              console.log('Dashboard - Transaction types:', allTransactions.map(tx => ({ 
                type: tx.type, 
                symbol: tx.symbol, 
                fromToken: tx.fromToken, 
                toToken: tx.toToken,
                description: tx.description
              })));
              const recentTransactions = allTransactions.slice(0, 10);
              
              return recentTransactions.map((transaction, index) => (
                <TouchableOpacity 
                  key={transaction.id} 
                  style={styles.txRow}
                  onPress={() => {
                    setSelectedTransaction({
                      id: transaction.id,
                      type: transaction.type,
                      amount: transaction.amount || transaction.fromAmount || transaction.toAmount || 0,
                      currency: transaction.symbol || transaction.fromToken || transaction.toToken || '',
                      status: transaction.status || (transaction.success ? 'completed' : 'failed'),
                      timestamp: transaction.timestamp,
                      memo: transaction.memo || '',
                      description: transaction.description
                    });
                    setTransactionModalVisible(true);
                  }}
                >
                  <ThemedText style={[styles.txCell, {flex:0.8}]} numberOfLines={1}>
                    {(() => {
                      try {
                        // ISO 형식 또는 기존 형식 모두 처리
                        let date: Date;
                        if (transaction.timestamp.includes('T')) {
                          // ISO 형식인 경우
                          date = new Date(transaction.timestamp);
                        } else {
                          // 기존 한국어 형식인 경우
                          date = new Date(transaction.timestamp.replace(/\./g, '-'));
                        }
                        
                        if (isNaN(date.getTime())) {
                          // 여전히 유효하지 않은 경우 현재 날짜 사용
                          date = new Date();
                        }
                        
                        return date.toLocaleDateString(locale as any, { 
                          month: 'short', 
                          day: 'numeric' 
                        });
                      } catch (error) {
                        // 오류 발생 시 현재 날짜 사용
                        return new Date().toLocaleDateString(locale as any, { 
                          month: 'short', 
                          day: 'numeric' 
                        });
                      }
                    })()}
                  </ThemedText>
                  <ThemedText style={[styles.txCell, {flex:0.8, color: getTypeColor(transaction.type)}]} numberOfLines={1}>
                    {transaction.type.toUpperCase()}
                  </ThemedText>
                  <ThemedText style={[styles.txCell, {flex:1.8}]} numberOfLines={1}>
                    {transaction.type === 'swap' 
                      ? transaction.swapType === 'from' 
                        ? `-${transaction.amount || transaction.change || 0} ${transaction.symbol || ''}`
                        : `+${transaction.amount || transaction.change || 0} ${transaction.symbol || ''}`
                      : `${transaction.amount || transaction.change || 0} ${transaction.symbol || ''}`
                    }
                  </ThemedText>
                  <ThemedText style={[styles.txCell, {flex:0.8, color: (transaction.status || (transaction.success ? 'completed' : 'failed'))==='completed'?'#4CAF50':(transaction.status || (transaction.success ? 'completed' : 'failed'))==='failed'?'#F44336':'#FFD54F'}]} numberOfLines={1}>
                    {(() => { const s = transaction.status || (transaction.success ? 'completed' : 'failed'); return s==='completed'? (t('orderFilled', language) || 'completed') : s==='failed'? (t('orderCancelled', language) || 'failed') : (t('processing', language) || 'pending'); })()}
                  </ThemedText>
                  <View style={[styles.txMemoCell, {flex:1.0}]}>
                    <TouchableOpacity 
                      onPress={() => {
                        setMemoDraft(transaction.memo || '');
                        setMemoModalVisible(true);
                        setSelectedTransaction({
                          id: transaction.id,
                          type: transaction.type,
                          amount: transaction.amount || transaction.fromAmount || transaction.toAmount || 0,
                          currency: transaction.symbol || transaction.fromToken || transaction.toToken || '',
                          status: transaction.status || (transaction.success ? 'completed' : 'failed'),
                          timestamp: transaction.timestamp,
                          memo: transaction.memo || '',
                          description: transaction.description
                        });
                      }}
                    >
                      <ThemedText style={[styles.txCell, {textAlign:'right', maxWidth: 80, color: transaction.memo ? '#FFFFFF' : '#FFD700'}]} numberOfLines={1} ellipsizeMode="tail">
                        {transaction.memo ? transaction.memo : '✎'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ));
            })()}
            <View style={[styles.emptyTransactionState, { display: getTransactions().length === 0 ? 'flex' : 'none' }]}>
              <ThemedText style={styles.emptyTransactionText}>{t('noTransactions', language)}</ThemedText>
              <ThemedText style={styles.emptyTransactionSubtext}>{t('startYourFirstTrade', language)}</ThemedText>
            </View>
          </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.showMoreButton, { display: getTransactions().length > 10 ? 'flex' : 'none' }]}
            onPress={() => {
              // 전체보기 기능 구현
              console.log('Show all transactions');
            }}
          >
            <ThemedText style={styles.showMoreIcon}>
              ↘
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Footer currentScreen="dashboard" />
      </ScrollView>

      <ProfileSheet 
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSaved={async (newAvatarUri) => {
          setAvatarUri(newAvatarUri);
          setProfileOpen(false);
          setProfileUpdated(prev => !prev); // 프로필 업데이트 상태 토글
          
          // username도 다시 로드
          if (currentUser?.uid) {
            const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
            if (info) {
              try {
                const parsedInfo = JSON.parse(info);
                setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              } catch {
                setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              }
            }
          }
        }}
      />

      <HamburgerMenu 
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        avatarUri={avatarUri}
      />

      {/* More Actions Modal */}
      {/* Reward Modal */}
      <Modal
        visible={showRewardModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRewardModal(false)}
      >
        <View style={styles.rewardModalOverlay}>
          <View style={styles.rewardModalContent}>
            <View style={styles.rewardHeader}>
              <ThemedText style={styles.rewardTitle}>🎉 Daily Reward Claimed!</ThemedText>
              <TouchableOpacity onPress={() => setShowRewardModal(false)}>
                <ThemedText style={styles.rewardCloseButton}>✕</ThemedText>
              </TouchableOpacity>
            </View>
            
            <View style={styles.rewardBody}>
              <View style={styles.rewardIconContainer}>
                <ThemedText style={styles.rewardIcon}>★</ThemedText>
              </View>
              
              <ThemedText style={styles.rewardAmount}>+1 YOY</ThemedText>
              <ThemedText style={styles.rewardDescription}>Daily Attendance Reward</ThemedText>
              
              <View style={styles.rewardStats}>
                <View style={styles.statItem}>
                  <ThemedText style={styles.statValue}>{totalRewards}</ThemedText>
                  <ThemedText style={styles.statLabel}>Total Rewards</ThemedText>
                </View>
                <View style={styles.statItem}>
                  <ThemedText style={styles.statValue}>{consecutiveDays}</ThemedText>
                  <ThemedText style={styles.statLabel}>Consecutive Days</ThemedText>
                </View>
              </View>
              
              <ThemedText style={styles.rewardMessage}>
                Keep up the great work! Your loyalty is rewarded.
              </ThemedText>
            </View>
            
            <TouchableOpacity 
              style={styles.rewardButton}
              onPress={() => setShowRewardModal(false)}
            >
              <ThemedText style={styles.rewardButtonText}>Continue</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <QuickActionsSettings visible={moreModalOpen} onClose={()=> setMoreModalOpen(false)} />

      {/* 거래내역 상세 모달 - 항상 렌더, visible로 제어 */}
      <TransactionDetailModal
        visible={!!selectedTransaction && transactionModalVisible}
        tx={(selectedTransaction as any) || ({} as any)}
        onClose={() => setTransactionModalVisible(false)}
        onSaveMemo={async(id, memo)=>{ await updateTransactionMemo(id, memo); setTransactionModalVisible(false); }}
        memoDraft={memoDraft}
        setMemoDraft={setMemoDraft}
      />

      {/* 메모 입력 모달 */}
      <Modal
        visible={memoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMemoModalVisible(false)}
      >
        <View style={styles.memoModalOverlay}>
          <View style={styles.memoModalContent}>
            <View style={styles.memoModalHeader}>
              <ThemedText style={styles.memoModalTitle}>{t('previewMemo', language)}</ThemedText>
              <TouchableOpacity onPress={() => setMemoModalVisible(false)}>
                <ThemedText style={styles.memoModalCloseButton}>✕</ThemedText>
              </TouchableOpacity>
            </View>
            
            <View style={styles.memoModalBody}>
              <ThemedText style={styles.memoModalLabel}>{t('memo', language)}</ThemedText>
              <TextInput
                style={styles.memoTextInput}
                value={memoText}
                onChangeText={setMemoText}
                placeholder={t('enterMemo', language) || t('enterCategoryName', language)}
                placeholderTextColor="#666"
                multiline
                maxLength={100}
              />
              <ThemedText style={styles.memoCharCount}>{memoText.length}/100</ThemedText>
            </View>
            
            <View style={styles.memoModalFooter}>
              <TouchableOpacity 
                style={styles.memoCancelButton}
                onPress={() => setMemoModalVisible(false)}
              >
                <ThemedText style={styles.memoCancelButtonText}>{t('cancel', language)}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.memoSaveButton}
                onPress={() => {
                  if (selectedTransaction) {
                    // 메모 저장 로직 (실제로는 데이터베이스나 상태 업데이트)
                    selectedTransaction.memo = memoText;
                    setMemoModalVisible(false);
                    // 거래 상세 모달의 메모 표시를 즉시 업데이트하기 위해 상태 강제 업데이트
                    setSelectedTransaction({...selectedTransaction});
                  }
                }}
              >
                <ThemedText style={styles.memoSaveButtonText}>{t('save', language)}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 코인 상세 모달 - 항상 렌더, visible로 제어 */}
      <CoinDetailModal
        visible={!!selectedCoin && coinDetailModalVisible}
        onClose={handleCloseModal}
        coin={{
          symbol: selectedCoin?.symbol || '',
          name: (selectedCoin?.name || selectedCoin?.symbol) || '',
          amount: selectedCoin?.amount || 0,
          valueUSD: selectedCoin?.valueUSD || 0,
          logo: selectedCoin?.symbol || '',
        }}
        onNavigateToWallet={handleNavigateToWallet}
        onNavigateToMarket={handleNavigateToMarket}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingBottom: 50, // 하단바 높이만큼 패딩 추가
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
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  currencyTab: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    marginHorizontal: 2,
    alignItems: 'center',
  },
  currencyTabWide: {
    flex: 1.4,
  },
  activeTab: {
    backgroundColor: 'rgba(255,215,0,0.3)',
  },
  tabText: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  yoyPrice: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '700',
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
  holdingName: {
    color: '#CCCCCC',
    fontSize: 12,
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
    paddingTop: 16,
    paddingBottom: 16,
    width: '100%',
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
    width: '23%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
    minHeight: 80,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
    color: '#FFFFFF',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  closeButton: {
    fontSize: 20,
    color: '#FFFFFF',
    padding: 5,
  },
  actionsList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionGridItem: {
    width: '30%',
    marginBottom: 12,
    alignItems: 'center',
  },
  actionItem: {
    width: '100%',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 0,
    marginBottom: 8,
    position: 'relative',
    minHeight: 80,
  },
  actionItemActive: {
    backgroundColor: '#2A2A2A',
  },
  actionItemIcon: {
    fontSize: 20,
    marginBottom: 6,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 4,
    padding: 4,
    minWidth: 28,
    minHeight: 28,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionItemText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  toggleButtonOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: '#666',
  },
  toggleButtonOverlayActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.9)',
    borderColor: '#FFD700',
  },
  toggleTextOverlay: {
    color: '#999',
    fontSize: 10,
    fontWeight: '600',
  },
  toggleTextOverlayActive: {
    color: '#000',
  },
  actionItemDragging: {
    opacity: 0.5,
    transform: [{ scale: 1.05 }],
  },
  actionItemDragOver: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  rewardClaimed: {
    backgroundColor: 'rgba(128, 0, 128, 0.2)',
    borderColor: '#800080',
  },
  rewardClaimedIcon: {
    fontSize: 24,
    marginBottom: 6,
    color: '#FFD700',
  },
  rewardClaimedText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  claimedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    color: '#800080',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rewardModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardModalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 350,
    borderWidth: 2,
    borderColor: '#FFD700',
    alignItems: 'center',
  },
  rewardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  rewardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    flex: 1,
    textAlign: 'center',
  },
  rewardCloseButton: {
    fontSize: 18,
    color: '#FFFFFF',
    padding: 5,
  },
  rewardBody: {
    alignItems: 'center',
    width: '100%',
  },
  rewardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  rewardIcon: {
    fontSize: 40,
    color: '#000',
  },
  rewardAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  rewardDescription: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 24,
  },
  rewardStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  rewardMessage: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  rewardButton: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  rewardButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  holdingsSection: {
    padding: 20,
  },
  holdingsHeader: {
    marginBottom: 16,
  },
  holdingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  holdingsLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    minWidth: '18%',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  holdingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  holdingCard: {
    width: '48%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 3,
  },
  holdingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  holdingSymbolContainer: {
    flex: 1,
  },
  holdingSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  holdingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteButton: {
    padding: 4,
  },
  favoriteIcon: {
    fontSize: 16,
    color: '#666',
  },
  favoriteActive: {
    color: '#FFD700',
  },
  holdingChange: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  changePercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  holdingCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  holdingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  holdingInfo: {
    flex: 1,
  },
  holdingAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  holdingValueKRW: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  holdingValueUSD: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  showMoreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  showMoreIcon: {
    fontSize: 20,
    color: '#000',
    fontWeight: 'bold',
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 16,
  },
  saveButton: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 코인마켓 섹션
  coinMarketSection: {
    paddingTop: 20,
    paddingBottom: 20,
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 40,
    paddingRight: 20,
  },
  transactionSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 40,
    paddingRight: 20,
  },
  viewAllText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  marketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  emptyMarketState: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  emptyMarketText: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyMarketSubtext: {
    color: '#888888',
    fontSize: 14,
  },
  
  // Exchange 스타일 마켓 탭
  marketTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 16,
    width: '100%',
  },
  marketTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  favTab: {
    flex: 1.5, // FAV 탭만 더 넓게
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeMarketTab: {
    borderBottomColor: '#FFD700',
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
  
  // Exchange 스타일 마켓 아이템
  coinInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinFavoriteButton: {
    marginRight: 8,
    padding: 2,
    position: 'absolute',
    left: 0,
    zIndex: 10,
  },
  coinInfoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 28,
    flex: 1,
  },
  coinIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  coinLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  coinDetails: {
    flex: 1,
  },
  coinNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  coinNameEnglish: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 6,
  },
  coinNameKorean: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  coinPair: {
    fontSize: 10,
    color: '#999',
  },
  priceInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  changeInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  change: {
    fontSize: 11,
    fontWeight: '600',
  },
  volumeInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  volume: {
    fontSize: 10,
    color: '#CCCCCC',
  },
  
  // Exchange 스타일 헤더
  listHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    width: '100%',
    borderBottomColor: '#333',
  },
  // Alert bell (rightmost column)
  alertButton: {
    marginTop: 4,
  },
  alertBell: {
    fontSize: 16,
    color: '#00C851',
  },
  alertBellActive: {
    color: '#FFD700',
  },
  headerColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDivider: {
    position: 'relative',
  },
  headerDividerLine: {
    position: 'absolute',
    right: 0,
    top: '15%',
    bottom: '15%',
    width: 1,
    backgroundColor: '#333',
  },
  headerColumnRight: {
    justifyContent: 'flex-end',
  },
  headerText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
    marginRight: 4,
    lineHeight: 14,
  },
  headerTextRight: {
    marginRight: 0,
    textAlign: 'right',
    lineHeight: 14,
  },
  headerTextSmall: {
    fontSize: 10,
    color: '#999',
    fontWeight: '400',
    lineHeight: 12,
  },
  headerTwoLine: {
    alignItems: 'flex-end',
  },
  sortIcon: {
    fontSize: 10,
    color: '#999',
    marginLeft: 4,
  },
  activeHeaderText: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  
  // MY 탭 스타일
  buyPrice: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  profit: {
    fontSize: 10,
    marginTop: 2,
  },
  
  // 거래내역 섹션
  transactionHistorySection: {
    paddingTop: 20,
    paddingBottom: 20,
    width: '100%',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescriptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionDescription: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  transactionTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  transactionTypeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  transactionTime: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  transactionAmountText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  amountIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 40,
    alignItems: 'center',
  },
  amountIndicatorText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  transactionStatus: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '500',
  },
  
  
  // 빈 거래내역 상태
  emptyTransactionState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTransactionText: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyTransactionSubtext: {
    color: '#666',
    fontSize: 14,
  },
  
  // 거래내역 상세 모달
  transactionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  transactionModalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  transactionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  transactionModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  transactionModalCloseButton: {
    fontSize: 20,
    color: '#FFFFFF',
    padding: 5,
  },
  transactionModalBody: {
    marginBottom: 20,
  },
  transactionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  transactionDetailLabel: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  transactionDetailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  transactionHashContainer: {
    flex: 2,
    alignItems: 'flex-end',
  },
  transactionHash: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#FFD700',
    marginBottom: 4,
    textAlign: 'right',
  },
  copyButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyButtonText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  transactionHashSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  transactionHashSectionTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  transactionHashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  addressContainer: {
    flex: 2,
    alignItems: 'flex-end',
  },
  walletAddress: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#FFD700',
    marginBottom: 4,
    textAlign: 'right',
  },
  walletAddressFull: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'left',
    flex: 1,
  },
  networkBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  networkText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transactionMemoSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  memoContainer: {
    flex: 2,
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memoEditButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 10,
  },
  memoEditButtonText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
  },
  transactionModalButton: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  transactionModalButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // 거래내역 테이블 스타일
  txTable: { 
    marginTop: 8, 
    borderWidth: 1, 
    borderColor: '#2A2A2A', 
    borderRadius: 10, 
    overflow: 'hidden' 
  },
  txHeader: { 
    flexDirection: 'row', 
    backgroundColor: '#121212', 
    paddingVertical: 8, 
    paddingHorizontal: 12 
  },
  txHeadText: { 
    color: '#AAAAAA', 
    fontWeight: '700', 
    fontSize: 12 
  },
  txRow: { 
    flexDirection: 'row', 
    backgroundColor: '#0E0E0E', 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderTopWidth: 1, 
    borderTopColor: '#1A1A1A' 
  },
  txCell: { 
    color: '#FFFFFF', 
    fontSize: 12 
  },
  txMemoCell: { 
    justifyContent: 'center', 
    alignItems: 'flex-end' 
  },
  transactionTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    width: '100%',
  },
  transactionHeaderText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    textAlign: 'center',
  },
  transactionHeaderColumn1: {
    flex: 1,
    alignItems: 'center',
  },
  transactionHeaderColumn2: {
    flex: 1.5,
    alignItems: 'center',
  },
  transactionHeaderColumn3: {
    flex: 1,
    alignItems: 'center',
  },
  transactionHeaderColumn4: {
    flex: 1,
    alignItems: 'center',
  },
  transactionHeaderColumn5: {
    flex: 2.5,
    alignItems: 'center',
  },
  transactionTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    width: '100%',
  },
  transactionTypeColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 16,
    paddingRight: 0,
    marginLeft: 0,
    marginRight: 0,
  },
  transactionAmountColumn: {
    flex: 1.5,
    alignItems: 'center',
  },
  transactionStatusColumn: {
    flex: 1,
    alignItems: 'center',
  },
  transactionTimeColumn: {
    flex: 1,
    alignItems: 'center',
  },
  transactionMemoColumn: {
    flex: 2.5,
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  memoText: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'right',
    flex: 1,
  },
  memoIcon: {
    fontSize: 16,
    color: '#FFD700',
  },
  transactionIconSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  transactionIconTextSmall: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  transactionTypeTextSmall: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'left',
  },

  // 메모 모달 스타일
  memoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  memoModalContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    width: '90%',
    maxWidth: 420,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  memoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  memoModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  memoModalCloseButton: {
    fontSize: 20,
    color: '#999',
    padding: 5,
  },
  memoModalBody: {
    marginBottom: 20,
  },
  memoModalLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  alertLabelTitle: {
    color: '#FFD700',
  },
  memoTextInput: {
    backgroundColor: '#111111',
    color: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    marginTop: 6,
  },
  compactInput: {
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 2,
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  currencyChipsRight: {
    marginLeft: 'auto',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  subLabel: {
    color: '#999',
    marginTop: 2,
    marginBottom: 2,
  },
  smallNote: {
    color: '#888',
    fontSize: 11,
    marginTop: 6,
    marginBottom: 6,
  },
  alertGoldDivider: {
    height: 2,
    backgroundColor: '#FFD700',
    marginBottom: 10,
    opacity: 0.9,
  },
  currencyLine: {
    color: '#BBB',
    fontSize: 12,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  currencyIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currencyEmoji: {
    fontSize: 16,
    color: '#FFD700',
    marginLeft: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
  },
  chipActive: {
    borderColor: '#FFD700',
  },
  chipInactive: {
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  chipTextActive: {
    color: '#FFD700',
  },
  compactBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  memoCharCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 5,
  },
  memoModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  memoCancelButton: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  memoCancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  memoSaveButton: {
    flex: 1,
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  memoSaveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
