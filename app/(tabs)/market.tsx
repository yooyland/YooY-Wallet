import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { useAuth } from '@/contexts/AuthContext';
import { getAllSupportedCoins, getCoinPriceByCurrency, updateRealTimePrices } from '@/lib/priceManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api-test.yooyland.com';
const isDevelopment = !process.env.EXPO_PUBLIC_API_BASE_URL || /localhost|127\.0\.0\.1/i.test(process.env.EXPO_PUBLIC_API_BASE_URL || '');

export default function MarketTab() {
  const router = useRouter();
  const { currentUser, accessToken } = useAuth();
  const { language } = usePreferences();
  const locale = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US';
  const [coins, setCoins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'KRW' | 'EUR' | 'JPY' | 'CNY'>('USD');
  const [sortBy, setSortBy] = useState<'marketCap' | 'price' | 'change'>('marketCap');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [selectedMainTab, setSelectedMainTab] = useState<'market' | 'order' | 'orderHistory'>('order');
  
  // 주문 관련 상태
  const [selectedOrderMarket, setSelectedOrderMarket] = useState('Market');
  const [selectedOrderCoin, setSelectedOrderCoin] = useState('Coin');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [orderPrice, setOrderPrice] = useState('169,162,000');
  const [orderQuantity, setOrderQuantity] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [showCoinSelector, setShowCoinSelector] = useState(false);
  const [marketButtonLayout, setMarketButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [coinButtonLayout, setCoinButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [showVariancePicker, setShowVariancePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [priceCurrency, setPriceCurrency] = useState<'KRW'|'USDT'|'USD'|'EUR'|'JPY'|'CNY'|'BTC'|'ETH'>('KRW');
  const [varianceButtonLayout, setVarianceButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [currencyButtonLayout, setCurrencyButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  // 결제방식 상태
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'basic' | 'stablecoin' | 'yoy'>('basic');
  // 결제코인별 비중/보유량
  const [paymentMethods, setPaymentMethods] = useState<Array<{coin:'USDT'|'USDC'|'BUSD'|'DAI'|'YOY', percentage:number, amount:number}>>([
    { coin: 'USDT', percentage: 60, amount: 533 },
    { coin: 'USDC', percentage: 0, amount: 120 },
    { coin: 'BUSD', percentage: 0, amount: 0 },
    { coin: 'DAI',  percentage: 0, amount: 0 },
    { coin: 'YOY',  percentage: 40, amount: 20000000 },
  ]);
  const [usdtPercentage, setUsdtPercentage] = useState(60);
  const [yoyPercentage, setYoyPercentage] = useState(40);
  // 스테이블코인 보유 (합산 적용)
  const [usdtBalance, setUsdtBalance] = useState(533);
  const [usdcBalance, setUsdcBalance] = useState(120);
  const [busdBalance, setBusdBalance] = useState(0);
  const [daiBalance, setDaiBalance] = useState(0);
  const [yoyBalance, setYoyBalance] = useState(20000000);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [usedByCoin, setUsedByCoin] = useState<Record<string, number>>({});
  const usedUsdt = usedByCoin['USDT'] || 0; // USDT(eqv) 총사용은 사용처에서 eqv로 표기, 여기선 USDT 사용량 표시
  const usedYoy = usedByCoin['YOY'] || 0;
  const [maxQuantityCap, setMaxQuantityCap] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [usdtTrackWidth, setUsdtTrackWidth] = useState(0);
  const [yoyTrackWidth, setYoyTrackWidth] = useState(0);
  const [overByCoin, setOverByCoin] = useState<Record<string, boolean>>({});
  const usdtOver = !!(overByCoin['USDT'] || overByCoin['USDC'] || overByCoin['BUSD'] || overByCoin['DAI']);
  const yoyOver = !!overByCoin['YOY'];
  const [orderFilter, setOrderFilter] = useState<'all'|'buy'|'sell'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderSortKey, setOrderSortKey] = useState<'time'|'price'|'quantity'>('time');
  const [orderSortOrder, setOrderSortOrder] = useState<'asc'|'desc'>('desc');
  const [orderPage, setOrderPage] = useState(1);
  const ORDERS_PER_PAGE = 10;
  const [orderDetailVisible, setOrderDetailVisible] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const [pendingReorderPrice, setPendingReorderPrice] = useState<string>('');
  const [cancelledOrders, setCancelledOrders] = useState<Record<string, boolean>>({});

  // 블록 탐색기 URL 생성 헬퍼
  const isTestnetEnv = (process.env.EXPO_PUBLIC_NETWORK || '').toLowerCase().includes('test');
  const getExplorerBase = (network?: string, isTestnet?: boolean) => {
    const net = (network || '').toLowerCase();
    const test = !!isTestnet;
    // YooyLand 네트워크: 메인/테스트 넷 개별 환경변수 우선, 없으면 퍼블릭 익스플로러 폴백
    if (net === 'yooy' || net === 'yooyland') {
      const main = process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_MAIN || process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE;
      if (main && main.length > 0) return main.replace(/\/$/, '').replace(/\/address\/?$/i, '');
      return 'https://etherscan.io';
    }
    if (net === 'yooy-test' || net === 'yooyland-test') {
      const testBase = process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_TEST || process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE;
      if (testBase && testBase.length > 0) return testBase.replace(/\/$/, '').replace(/\/address\/?$/i, '');
      return 'https://sepolia.etherscan.io';
    }
    if (net.includes('ethereum') || net === 'eth') {
      return test ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
    }
    if (net.includes('polygon') || net === 'matic') {
      return test ? 'https://mumbai.polygonscan.com' : 'https://polygonscan.com';
    }
    if (net.includes('bsc') || net.includes('binance')) {
      return test ? 'https://testnet.bscscan.com' : 'https://bscscan.com';
    }
    if (net.includes('arbitrum')) {
      return test ? 'https://sepolia.arbiscan.io' : 'https://arbiscan.io';
    }
    if (net.includes('optimism') || net.includes('op')) {
      return test ? 'https://sepolia-optimistic.etherscan.io' : 'https://optimistic.etherscan.io';
    }
    if (net.includes('base')) {
      return test ? 'https://sepolia.basescan.org' : 'https://basescan.org';
    }
    // 기본값(이더리움)
    return test ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
  };
  const buildExplorerTxUrl = (network?: string, txHash?: string, isTestnet?: boolean) => {
    if (!txHash) return undefined;
    const base = getExplorerBase(network, isTestnet);
    return `${base}/tx/${txHash}`;
  };
  const buildExplorerBlockUrl = (network?: string, blockNumber?: number | string, isTestnet?: boolean) => {
    if (blockNumber === undefined || blockNumber === null || blockNumber === '') return undefined;
    const base = getExplorerBase(network, isTestnet);
    return `${base}/block/${blockNumber}`;
  };
  const buildExplorerAddressUrl = (network?: string, address?: string, isTestnet?: boolean) => {
    if (!address) return undefined;
    const base = getExplorerBase(network, isTestnet);
    return `${base}/address/${address}`;
  };
  // 숫자 포맷 유틸 (천단위 구분, 소수점은 천단위 없음, 최소 4자리 유지)
  const unformatNumber = (v: string) => v.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const formatWithThousands = (raw: string) => {
    if (!raw) return '';
    // 하나의 소수점만 허용
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
    const [intPart = '', decPart = ''] = cleaned.split('.');
    const intFormatted = intPart ? Number(intPart).toLocaleString() : '';
    if (cleaned.includes('.')) {
      const decMin4 = decPart.length < 4 ? decPart.padEnd(4, '0') : decPart; // 최소 4자리
      return `${intFormatted || '0'}.${decMin4}`;
    }
    return intFormatted;
  };
  // 현재가 계산 헬퍼 (현재 선택 코인과 통화 기준)
  const getCurrentPriceSafe = (): number => {
    try {
      const p = getCoinPriceByCurrency(selectedOrderCoin, priceCurrency as any);
      return typeof p === 'number' && isFinite(p) ? p : 0;
    } catch { return 0; }
  };
  const getCurrentPriceForSymbol = (symbol?: string): number => {
    try {
      if (!symbol) return getCurrentPriceSafe();
      const coin = symbol.toUpperCase();
      const p = getCoinPriceByCurrency(coin, priceCurrency as any);
      return typeof p === 'number' && isFinite(p) ? p : 0;
    } catch { return 0; }
  };
  
  // Load username and avatar on component mount
  useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
        const photo = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.photoUri`);
        
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
        
        setAvatarUri(photo);
      }
    })();
  }, [currentUser?.uid, profileUpdated]);

  // 코인 로고 가져오기
  const getCoinLogo = useCallback((symbol: string) => {
    const safeImages: Record<string, any> = {
      'btc': require('@/assets/images/btc.png'),
      'eth': require('@/assets/images/eth.png'),
      'usdt': require('@/assets/images/usdt.png'),
      'usdc': require('@/assets/images/usdc.png'),
      'yoy': require('@/assets/images/yoy.png'),
      'link': require('@/assets/images/LINK.png'),
      'ada': require('@/assets/images/ada.png'),
      'atom': require('@/assets/images/ATOM.png'),
      'avax': require('@/assets/images/AVAX.png'),
      'bnb': require('@/assets/images/bnb.png'),
      'doge': require('@/assets/images/DOGE.png'),
      'dot': require('@/assets/images/DOT.png'),
      'sol': require('@/assets/images/SOL.png'),
      'trx': require('@/assets/images/TRX.png'),
      'xlm': require('@/assets/images/XLM.png'),
      'xrp': require('@/assets/images/XRP.png'),
    };
    
    const lowerSymbol = symbol.toLowerCase();
    if (safeImages[lowerSymbol]) {
      return safeImages[lowerSymbol];
    }
    
    return { uri: `https://static.upbit.com/logos/${symbol.toUpperCase()}.png` };
  }, []);

  // 코인 이름 매핑
  const coinNames: Record<string, string> = {
    'YOY': 'YooY Token',
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'BNB': 'Binance Coin',
    'AAVE': 'Aave',
    'SOL': 'Solana',
    'XMR': 'Monero',
    'USDT': 'Tether',
    'USDC': 'USD Coin',
    'ADA': 'Cardano',
    'DOT': 'Polkadot',
    'LINK': 'Chainlink',
    'UNI': 'Uniswap',
    'LTC': 'Litecoin',
    'BCH': 'Bitcoin Cash',
    'XRP': 'Ripple',
    'DOGE': 'Dogecoin',
    'SHIB': 'Shiba Inu',
    'MATIC': 'Polygon',
    'AVAX': 'Avalanche',
    'ATOM': 'Cosmos',
    'TRX': 'TRON',
    'XLM': 'Stellar',
    'ALGO': 'Algorand',
    'VET': 'VeChain',
    'ICP': 'Internet Computer',
    'FIL': 'Filecoin',
    'THETA': 'Theta Network',
    'EOS': 'EOS',
    'XTZ': 'Tezos',
  };

  // 실시간 가격 업데이트
  useEffect(() => {
    const loadCoins = async () => {
      try {
        setLoading(true);
        await updateRealTimePrices();
        
        const supportedCoins = getAllSupportedCoins();
        const coinsData = supportedCoins.map(symbol => {
          const price = getCoinPriceByCurrency(symbol, selectedCurrency);
          const change = (Math.random() - 0.5) * 20; // 임시 변동률
          const marketCap = price * (Math.random() * 1000000000 + 100000000); // 임시 시가총액
          
          return {
            symbol,
            name: coinNames[symbol] || symbol,
            price,
            change,
            marketCap,
            volume24h: Math.random() * 1000000000,
            logo: getCoinLogo(symbol),
          };
        });
        
        setCoins(coinsData);
      } catch (error) {
        console.error('Failed to load coins:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadCoins();
    // 1분마다 가격 업데이트
    const interval = setInterval(loadCoins, 60000);
    return () => clearInterval(interval);
  }, [selectedCurrency, getCoinLogo]);

  // 검색 및 정렬된 코인 목록
  const filteredAndSortedCoins = [...coins]
    .filter(coin => 
      coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      coin.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'marketCap':
          comparison = a.marketCap - b.marketCap;
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'change':
          comparison = a.change - b.change;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleCoinPress = (symbol: string) => {
    // KRW 마켓이 있으면 KRW로, 없으면 USDT로 이동
    const krwMarket = `KRW-${symbol}`;
    const usdtMarket = `USDT-${symbol}`;
    
    // KRW 마켓 우선으로 이동
    router.push(`/market/${krwMarket}?tab=주문`);
  };

  const formatPrice = (price: number) => {
    if (price < 0.01) {
      return price.toFixed(6);
    } else if (price < 1) {
      return price.toFixed(4);
    } else if (price < 100) {
      return price.toFixed(2);
    } else {
      return price.toLocaleString();
    }
  };

  const getCurrencySymbol = () => {
    switch (selectedCurrency) {
      case 'USD': return '$';
      case 'KRW': return '₩';
      case 'EUR': return '€';
      case 'JPY': return '¥';
      case 'CNY': return '¥';
      default: return '$';
    }
  };

  // 소수점 표기: 3자리 금지, 2 또는 4/6 고정
  const formatForDisplay = (value: number) => {
    if (!isFinite(value)) return '0';
    if (value >= 100) return Math.round(value).toLocaleString();
    if (value >= 1) return value.toFixed(2);
    if (value >= 0.0001) return value.toFixed(4);
    return value.toFixed(6);
  };

  // 숫자 포맷터: 정수부만 천단위, 소수부는 그대로
  const formatAmount = (value: number, fractionDigits: number = 2) => {
    if (!isFinite(value)) return '0';
    const fixed = value.toFixed(fractionDigits);
    const parts = fixed.split('.');
    const intWithSep = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? `${intWithSep}.${parts[1]}` : intWithSep;
  };

  // 주문 관련 함수들
  const marketCoins: Record<string, string[]> = {
    'KRW': ['BTC', 'ETH', 'YOY', 'SOL', 'DOT', 'LINK', 'ADA', 'AVAX', 'XRP', 'DOGE', 'TRX', 'XLM', 'ATOM'],
    'USDT': ['BTC', 'ETH', 'YOY', 'SOL', 'DOT', 'LINK', 'ADA', 'AVAX', 'XRP', 'DOGE', 'TRX', 'XLM', 'ATOM'],
    'BTC': ['ETH', 'YOY', 'SOL', 'DOT', 'LINK', 'ADA', 'AVAX', 'XRP', 'DOGE', 'TRX', 'XLM', 'ATOM'],
    'ETH': ['YOY', 'SOL', 'DOT', 'LINK', 'ADA', 'AVAX', 'XRP', 'DOGE', 'TRX', 'XLM', 'ATOM']
  };

  const availableMarkets = ['KRW', 'USDT', 'BTC', 'ETH'];

  const handleMarketButtonPress = () => {
    setShowMarketSelector(!showMarketSelector);
    setShowCoinSelector(false);
  };

  const handleCoinButtonPress = () => {
    setShowCoinSelector(!showCoinSelector);
    setShowMarketSelector(false);
  };

  const handleMarketSelect = (market: string) => {
    setSelectedOrderMarket(market);
    setShowMarketSelector(false);
    // 마켓 변경 시 코인을 기본값으로 리셋
    setSelectedOrderCoin('Coin');
  };

  const handleCoinSelect = (coin: string) => {
    setSelectedOrderCoin(coin);
    setShowCoinSelector(false);
  };

  // 마켓·코인 선택 시 자동으로 현재가 적용
  useEffect(() => {
    if (selectedOrderMarket !== 'Market' && selectedOrderCoin !== 'Coin') {
      try {
        const price = getCoinPriceByCurrency(selectedOrderCoin, priceCurrency as any);
        setOrderPrice(formatForDisplay(price));
      } catch {
        // 가격 조회 실패 시 비움
        setOrderPrice('');
      }
    } else {
      setOrderPrice('');
    }
  }, [selectedOrderMarket, selectedOrderCoin, priceCurrency]);

  const handleCurrentPrice = () => {
    if (selectedOrderCoin === 'Coin') {
      Alert.alert(t('notice', language) || 'Notice', t('pleaseSelectMarketAndCoin', language));
      return;
    }
    const price = getCoinPriceByCurrency(selectedOrderCoin, priceCurrency as any) || 0;
    setOrderPrice(formatForDisplay(price));
  };

  // 결제금액/사용 수량 계산
  useEffect(() => {
    const priceNum = parseFloat((orderPrice || '0').toString().replace(/,/g, ''));
    const quantityNum = parseFloat(orderQuantity || '0');
    if (!isFinite(priceNum) || !isFinite(quantityNum)) {
      setPaymentAmount(0);
      setUsedUsdt(0);
      setUsedYoy(0);
      return;
    }

    const subtotalInMarket = priceNum * quantityNum; // 선택된 통화 기준 결제 총액
    setPaymentAmount(subtotalInMarket);

    try {
      // 환율 기준은 "가격"이 표시되는 통화(priceCurrency)와 일치해야 함
      const baseCurrency = priceCurrency as any;
      const usdtRateInMarket = getCoinPriceByCurrency('USDT', baseCurrency) || 0; // 1 USDT = ? 선택통화
      const usdcRateInMarket = getCoinPriceByCurrency('USDC', baseCurrency) || usdtRateInMarket;
      const busdRateInMarket = getCoinPriceByCurrency('BUSD', baseCurrency) || usdtRateInMarket;
      const daiRateInMarket  = getCoinPriceByCurrency('DAI',  baseCurrency) || usdtRateInMarket;
      const yoyRateInMarket = getCoinPriceByCurrency('YOY', baseCurrency) || 0;   // 1 YOY = ? 선택통화

      const yoyLegValue = subtotalInMarket * (yoyPercentage / 100);
      const yoyUsed = yoyRateInMarket > 0 ? yoyLegValue / yoyRateInMarket : 0;

      // 2분기(USDT/YOY) 기준 초과 계산: USDT 사용량이 보유량 초과 시 레드
      const usdtLegValue = subtotalInMarket * (usdtPercentage / 100);
      const usdtUseQty = usdtRateInMarket > 0 ? usdtLegValue / usdtRateInMarket : 0;
      const usdtOverNow = usdtUseQty > usdtBalance + 1e-9;

      setUsedByCoin({ USDT: usdtUseQty, YOY: yoyUsed });
      setOverByCoin({ USDT: usdtOverNow, YOY: yoyUsed > yoyBalance + 1e-9 });
      // Max 계산용 상한(잔액 기준 주문 가능 최대 합계)
      const caps: number[] = [];
      if (usdtPercentage > 0 && usdtRateInMarket > 0) {
        const stableCap = (usdtBalance * usdtRateInMarket) / Math.max(1e-9, (usdtPercentage / 100));
        caps.push(stableCap);
      }
      if (yoyPercentage > 0 && yoyRateInMarket > 0) {
        caps.push((yoyBalance * yoyRateInMarket) / (yoyPercentage / 100));
      }
      const allowableSubtotal = caps.length ? Math.min(...caps) : 0;
      setMaxQuantityCap(priceNum > 0 ? allowableSubtotal / priceNum : 0);
    } catch {
      setUsedUsdt(0);
      setUsedYoy(0);
      setMaxQuantityCap(0);
      setUsdtOver(false);
      setYoyOver(false);
    }
  }, [orderPrice, orderQuantity, selectedOrderMarket, usdtPercentage, yoyPercentage]);

  const normalizePercents = (a: number, b: number) => {
    const sum = a + b;
    if (sum === 100) return { a, b };
    if (sum <= 0) return { a: 60, b: 40 };
    return { a: (a / sum) * 100, b: (b / sum) * 100 };
  };

  const getVisibleStableCoins = () => (
    [
      { key: 'USDT', balance: usdtBalance },
      { key: 'USDC', balance: usdcBalance },
      { key: 'BUSD', balance: busdBalance },
      { key: 'DAI',  balance: daiBalance  },
    ].filter(c => c.balance > 0)
  );

  const getSymbolForCurrency = (code: string) => {
    switch (code) {
      case 'KRW': return '₩';
      case 'USDT': return '₮';
      case 'BTC': return '₿';
      case 'ETH': return 'Ξ';
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'JPY': return '¥';
      case 'CNY': return '¥';
      default: return '';
    }
  };

  const handleMax = () => {
    const priceNum = parseFloat((orderPrice || '0').toString().replace(/,/g, ''));
    if (!priceNum || priceNum <= 0) {
      Alert.alert(t('notice', language) || 'Notice', t('pleaseSetPrice', language));
      return;
    }
    if (maxQuantityCap <= 0) return;
    setOrderQuantity(maxQuantityCap.toString());
  };

  // 슬라이더 스와이프 핸들러 (합계 100% 유지)
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const setUsdtFromX = (x: number) => {
    if (!usdtTrackWidth) return;
    const pct = clamp((x / usdtTrackWidth) * 100);
    setUsdtPercentage(pct);
    setYoyPercentage(100 - pct);
  };
  const setYoyFromX = (x: number) => {
    if (!yoyTrackWidth) return;
    const pct = clamp((x / yoyTrackWidth) * 100);
    setYoyPercentage(pct);
    setUsdtPercentage(100 - pct);
  };

  const handleSetMaxPct = (asset: 'USDT' | 'YOY') => {
    const subtotal = paymentAmount; // already in selected market currency
    if (subtotal <= 0) return;
    // 가격 통화 기준 환율 사용 (priceCurrency)
    const rate = getCoinPriceByCurrency(asset, priceCurrency as any) || 0;
    const balance = asset === 'USDT' ? usdtBalance : yoyBalance;
    if (rate <= 0) return;
    const maxPct = clamp(((balance * rate) / subtotal) * 100);
    if (asset === 'USDT') {
      setUsdtPercentage(maxPct);
      setYoyPercentage(100 - maxPct);
    } else {
      setYoyPercentage(maxPct);
      setUsdtPercentage(100 - maxPct);
    }
  };

  const safeParseJson = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      const text = await response.text();
      return { error: true, message: text } as any;
    }
  };

  // 주문 취소
  const handleCancelOrder = async (orderId: string) => {
    try {
      if (!orderId) return;
      if (isDevelopment) {
        await new Promise(r=>setTimeout(r,800));
        setCancelledOrders(prev=>({ ...prev, [orderId]: true }));
        Alert.alert(t('orderCancelledDone', language), t('orderCancelledDone', language));
        return;
      }
      if (!accessToken) {
        Alert.alert(t('loginRequired', language), t('loginRequired', language));
        return;
      }
      const res = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const body = await safeParseJson(res as any);
        throw new Error(body?.message || `${t('orderRejected', language)} (${res.status})`);
      }
      setCancelledOrders(prev=>({ ...prev, [orderId]: true }));
      Alert.alert(t('orderCancelledDone', language), t('orderCancelledDone', language));
    } catch (e:any) {
      Alert.alert(t('error', language), e?.message || t('orderRejected', language));
    }
  };

  const handleOrder = async () => {
    if (isOrdering) return;
    
    // 마켓/코인이 기본값인 경우 안내
    if (selectedOrderMarket === 'Market' || selectedOrderCoin === 'Coin') {
      Alert.alert(t('notice', language) || 'Notice', t('pleaseSelectMarketAndCoin', language));
      return;
    }

    if (!orderPrice || !orderQuantity) {
      Alert.alert(t('error', language), `${t('enterPrice', language)} & ${t('quantity', language)}`);
      return;
    }

    setIsOrdering(true);

    try {
      const symbol = `${selectedOrderMarket}-${selectedOrderCoin}`;
      const priceNum = parseFloat((orderPrice || '0').toString().replace(/,/g, ''));
      const quantityNum = parseFloat(orderQuantity || '0');

      // 개발 환경 모킹
      if (isDevelopment) {
        await new Promise(r => setTimeout(r, 1200));
        setIsOrdering(false);
        Alert.alert(t('done', language), `MOCK ${orderType.toUpperCase()} ${symbol}\n${t('price', language)}: ${priceNum.toLocaleString()}\n${t('quantity', language)}: ${quantityNum}`);
        setOrderQuantity('');
        return;
      }

      if (!accessToken) {
        setIsOrdering(false);
        Alert.alert(t('loginRequired', language), t('loginRequired', language));
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          symbol,
          side: orderType === 'buy' ? 'BUY' : 'SELL',
          type: 'LIMIT',
          price: priceNum,
          quantity: quantityNum,
          payment: {
            method: selectedPaymentMethod,
            usdtPct: usdtPercentage,
            yoyPct: yoyPercentage,
          },
        }),
      });

      if (!response.ok) {
        const err = await safeParseJson(response);
        throw new Error(err?.message || `${t('orderRejected', language)} (${response.status})`);
      }

      const data = await safeParseJson(response);
      setIsOrdering(false);
      Alert.alert(t('done', language), `${t('orderCreated', language)} ID: ${data?.id || 'N/A'}`);
      setOrderQuantity('');
    } catch (e: any) {
      setIsOrdering(false);
      Alert.alert(t('error', language), e?.message || t('processing', language));
    }
  };

  const handleQuickOrder = (symbol: string) => {
    setSelectedOrderCoin(symbol);
    setOrderPrice('');
    setOrderQuantity('');
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <ThemedText style={styles.loadingText}>{t('loadingPrices', language)}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TopBar 
        title={username}
        onProfilePress={() => setProfileOpen(true)}
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri}
        profileUpdated={profileUpdated}
      />

      {/* 메인 제목탭 */}
      <View style={styles.mainTabsContainer}>
        <TouchableOpacity
          style={[styles.mainTab, selectedMainTab === 'market' && styles.mainTabActive]}
          onPress={() => setSelectedMainTab('market')}
        >
          <ThemedText style={[styles.mainTabText, selectedMainTab === 'market' && styles.mainTabTextActive]}>
            Market
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, selectedMainTab === 'order' && styles.mainTabActive]}
          onPress={() => setSelectedMainTab('order')}
        >
          <ThemedText style={[styles.mainTabText, selectedMainTab === 'order' && styles.mainTabTextActive]}>
            {t('tabOrder', language)}
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, selectedMainTab === 'orderHistory' && styles.mainTabActive]}
          onPress={() => setSelectedMainTab('orderHistory')}
        >
          <ThemedText style={[styles.mainTabText, selectedMainTab === 'orderHistory' && styles.mainTabTextActive]}>
            {t('history', language)}
          </ThemedText>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {selectedMainTab === 'market' && (
          <>
            {/* 필터 및 정렬 */}
            <View style={styles.filterContainer}>
          <View style={styles.currencySelector}>
            {(['USD', 'KRW', 'EUR', 'JPY', 'CNY'] as const).map((currency) => (
              <TouchableOpacity
                key={currency}
                style={[
                  styles.currencyButton,
                  selectedCurrency === currency && styles.currencyButtonActive
                ]}
                onPress={() => setSelectedCurrency(currency)}
              >
                <ThemedText style={[
                  styles.currencyButtonText,
                  selectedCurrency === currency && styles.currencyButtonTextActive
                ]}>
                  {currency}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.searchAndSortContainer}>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder={t('coinSearch', language)}
                placeholderTextColor="#888888"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <View style={styles.sortContainer}>
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setSortBy('marketCap')}
              >
                <ThemedText style={[
                  styles.sortButtonText,
                  sortBy === 'marketCap' && styles.sortButtonTextActive
                ]}>
                  {t('marketCap', language)}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setSortBy('price')}
              >
                <ThemedText style={[
                  styles.sortButtonText,
                  sortBy === 'price' && styles.sortButtonTextActive
                ]}>
                  {t('price', language)}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setSortBy('change')}
              >
                <ThemedText style={[
                  styles.sortButtonText,
                  sortBy === 'change' && styles.sortButtonTextActive
                ]}>
                  {t('change', language)}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sortOrderButton}
                onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                <ThemedText style={styles.sortOrderText}>
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 코인 목록 */}
        <View style={styles.coinList}>
          {filteredAndSortedCoins.map((coin, index) => (
            <TouchableOpacity
              key={coin.symbol}
              style={styles.coinItem}
              onPress={() => handleCoinPress(coin.symbol)}
            >
              <View style={styles.coinLeft}>
                <View style={styles.rankContainer}>
                  <ThemedText style={styles.rankText}>{index + 1}</ThemedText>
                </View>
                <Image source={coin.logo} style={styles.coinLogo} />
                <View style={styles.coinInfo}>
                  <View style={styles.coinHeader}>
                    <ThemedText style={styles.coinSymbol}>{coin.symbol}</ThemedText>
                    <ThemedText style={styles.coinName}>{coin.name}</ThemedText>
                  </View>
                </View>
              </View>
              
              <View style={styles.coinRight}>
                <View style={styles.priceContainer}>
                  <ThemedText style={styles.priceText}>
                    {getCurrencySymbol()}{formatPrice(coin.price)}
                  </ThemedText>
                  <ThemedText style={[
                    styles.changeText,
                    coin.change >= 0 ? styles.positiveChange : styles.negativeChange
                  ]}>
                    {coin.change >= 0 ? '+' : ''}{coin.change.toFixed(2)}%
                  </ThemedText>
                </View>
                <View style={styles.marketCapContainer}>
                  <ThemedText style={styles.marketCapText}>
                    {t('marketCap', language)}: {getCurrencySymbol()}{(coin.marketCap / 1000000000).toFixed(2)}B
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 푸터 */}
            <View style={styles.footer}>
              <ThemedText style={styles.footerText}>
                {searchQuery ? `${filteredAndSortedCoins.length}개 검색 결과` : `총 ${coins.length}개 코인`} • 실시간 업데이트
              </ThemedText>
            </View>
          </>
        )}

        {selectedMainTab === 'order' && (
          <View style={styles.orderSection}>
            {/* 거래 유형 (상단으로 이동) */}
            <View style={styles.orderTypeContainer}>
              <View style={styles.orderTypeButtons}>
                <TouchableOpacity
                  style={[styles.orderTypeButton, orderType === 'buy' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('buy')}
                >
                  <ThemedText style={[styles.orderTypeButtonText, orderType === 'buy' && styles.orderTypeButtonTextActive]}>
                    {t('buy', language)}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderTypeButton, orderType === 'sell' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('sell')}
                >
                  <ThemedText style={[styles.orderTypeButtonText, orderType === 'sell' && styles.orderTypeButtonTextActive]}>
                    {t('sell', language)}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.orderTypeDivider} />

            {/* 종목 선택 - 제목 포함 1줄 구성 */}
            <View style={styles.assetSelectionContainer}>
              <View style={styles.assetSelectionRow}>
                <ThemedText style={[styles.sectionTitle, styles.inlineSectionTitle]}>{t('symbolSelection', language)}</ThemedText>
                {/* 마켓 선택 */}
                <View style={styles.marketSelector}>
                  <TouchableOpacity 
                    style={styles.selectorButton}
                    onPress={handleMarketButtonPress}
                    onLayout={(event) => {
                      const { x, y, width, height } = event.nativeEvent.layout;
                      setMarketButtonLayout({ x, y, width, height });
                    }}
                  >
                    <ThemedText style={styles.selectorButtonText}>{selectedOrderMarket}</ThemedText>
                    <ThemedText style={styles.selectorArrow}>▼</ThemedText>
                  </TouchableOpacity>
                  
                  {showMarketSelector && (
                    <Modal
                      visible={showMarketSelector}
                      transparent={true}
                      animationType="none"
                      onRequestClose={() => setShowMarketSelector(false)}
                    >
                      <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowMarketSelector(false)}
                      >
                        <ScrollView 
                          style={[
                            styles.selectorDropdown,
                            {
                              position: 'absolute',
                              top: marketButtonLayout.y + marketButtonLayout.height + 4,
                              left: marketButtonLayout.x,
                              width: marketButtonLayout.width,
                            }
                          ]}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled={true}
                        >
                          {availableMarkets.map((market) => (
                            <TouchableOpacity
                              key={market}
                              style={[
                                styles.selectorOption,
                                selectedOrderMarket === market && styles.selectorOptionActive
                              ]}
                              onPress={() => handleMarketSelect(market)}
                            >
                              <ThemedText style={[
                                styles.selectorOptionText,
                                selectedOrderMarket === market && styles.selectorOptionTextActive
                              ]}>
                                {market}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </TouchableOpacity>
                    </Modal>
                  )}
                </View>

                {/* 코인 선택 */}
                <View style={styles.coinSelector}>
                  <TouchableOpacity 
                    style={styles.selectorButton}
                    onPress={handleCoinButtonPress}
                    onLayout={(event) => {
                      const { x, y, width, height } = event.nativeEvent.layout;
                      setCoinButtonLayout({ x, y, width, height });
                    }}
                  >
                    <ThemedText style={styles.selectorButtonText}>{selectedOrderCoin}</ThemedText>
                    <ThemedText style={styles.selectorArrow}>▼</ThemedText>
                  </TouchableOpacity>
                  
                  {showCoinSelector && (
                    <Modal
                      visible={showCoinSelector}
                      transparent={true}
                      animationType="none"
                      onRequestClose={() => setShowCoinSelector(false)}
                    >
                      <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowCoinSelector(false)}
                      >
                        <ScrollView 
                          style={[
                            styles.selectorDropdown,
                            styles.coinDropdownRight,
                            {
                              position: 'absolute',
                              top: coinButtonLayout.y + coinButtonLayout.height + 4,
                            }
                          ]}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled={true}
                        >
                          {(marketCoins[selectedOrderMarket] || []).map((coin) => (
                            <TouchableOpacity
                              key={coin}
                              style={[
                                styles.selectorOption,
                                selectedOrderCoin === coin && styles.selectorOptionActive
                              ]}
                              onPress={() => handleCoinSelect(coin)}
                            >
                              <ThemedText style={[
                                styles.selectorOptionText,
                                selectedOrderCoin === coin && styles.selectorOptionTextActive
                              ]}>
                                {coin}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </TouchableOpacity>
                    </Modal>
                  )}
                </View>
              </View>
            </View>

            

            {/* 가격 표시: 제목 포함 1줄 */}
            <View style={styles.priceDisplayContainer}>
              <View style={[styles.priceDisplayRow, { alignItems:'center' }]}>
                <ThemedText style={[styles.sectionTitle, styles.inlineSectionTitle]}>{t('price', language)}</ThemedText>
                <View style={[styles.priceDisplayField,{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}]}>
                  <ThemedText style={styles.priceDisplayText}>
                    {getSymbolForCurrency(priceCurrency)} {orderPrice}
                  </ThemedText>
                  <TouchableOpacity onPress={handleCurrentPrice}>
                    <ThemedText style={styles.refreshButtonText}>↻</ThemedText>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity 
                  style={styles.priceDropdownButton}
                  onPress={() => setShowVariancePicker(v => !v)}
                  onLayout={(e) => {
                    const { x, y, width, height } = e.nativeEvent.layout;
                    setVarianceButtonLayout({ x, y, width, height });
                  }}
                >
                  <ThemedText style={styles.priceDropdownText}>±%▼</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.priceDropdownButton}
                  onPress={() => setShowCurrencyPicker(v => !v)}
                  onLayout={(e) => {
                    const { x, y, width, height } = e.nativeEvent.layout;
                    setCurrencyButtonLayout({ x, y, width, height });
                  }}
                >
                  <ThemedText style={styles.priceDropdownText}>{getSymbolForCurrency(priceCurrency)}▼</ThemedText>
                </TouchableOpacity>
              </View>

              {/* 변동폭 모달 */}
              {showVariancePicker && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setShowVariancePicker(false)}>
                  <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowVariancePicker(false)}>
                    <View style={[
                      styles.selectorDropdown,
                      {
                        position:'absolute',
                        top: varianceButtonLayout.y + varianceButtonLayout.height + 4,
                        left: varianceButtonLayout.x,
                        width: Math.max(120, varianceButtonLayout.width)
                      }
                    ]}> 
                      {[20,15,10,5,0,-5,-10,-15,-20].map(v => (
                        <TouchableOpacity key={v} style={styles.selectorOption} onPress={() => {
                          const base = getCoinPriceByCurrency(selectedOrderCoin, priceCurrency as any) || 0;
                          const newPrice = base > 0 ? base * (1 + v/100) : 0;
                          setOrderPrice(newPrice >= 100 ? newPrice.toLocaleString() : newPrice.toString());
                          setShowVariancePicker(false);
                        }}>
                          <ThemedText style={styles.selectorOptionText}>{v > 0 ? `+${v}%` : `${v}%`}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}
              {/* 화폐 모달 */}
              {showCurrencyPicker && (
                <Modal visible transparent animationType="fade" onRequestClose={() => setShowCurrencyPicker(false)}>
                  <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCurrencyPicker(false)}>
                    <View style={[
                      styles.selectorDropdown,
                      {
                        position:'absolute',
                        top: currencyButtonLayout.y + currencyButtonLayout.height + 4,
                        left: currencyButtonLayout.x,
                        width: Math.max(120, currencyButtonLayout.width)
                      }
                    ]}> 
                      {['KRW','USDT','USD','EUR','JPY','CNY','BTC','ETH'].map(code => (
                        <TouchableOpacity key={code} style={styles.selectorOption} onPress={() => {
                          setPriceCurrency(code as any);
                          const current = getCoinPriceByCurrency(selectedOrderCoin, code as any) || 0;
                          if (current > 0) setOrderPrice(current >= 100 ? current.toLocaleString() : current.toString());
                          setShowCurrencyPicker(false);
                        }}>
                          <ThemedText style={styles.selectorOptionText}>{code}</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </TouchableOpacity>
                </Modal>
              )}
            </View>

            {/* 수량 입력: 제목 포함 1줄 */}
            <View style={styles.quantityInputContainer}>
              <View style={[styles.quantityInputRow, { alignItems:'center' }]}>
                <ThemedText style={[styles.sectionTitle, styles.inlineSectionTitle]}>{t('quantity', language)}</ThemedText>
                <TextInput
                  style={styles.quantityInputField}
                  placeholder={t('enterOrderQty', language)}
                  placeholderTextColor="#666"
                  value={orderQuantity}
                  onChangeText={setOrderQuantity}
                  keyboardType="numeric"
                />
                <ThemedText style={styles.quantityUnit}>{selectedOrderCoin}</ThemedText>
              </View>
            </View>

            {/* 결제방식: 제목 포함 1줄 */}
            <View style={styles.paymentMethodContainer}>
              <View style={[styles.paymentMethodTabs, { alignItems:'center' }]}>
                <ThemedText style={[styles.sectionTitle, styles.inlineSectionTitle]}>{t('paymentMethod', language)}</ThemedText>
                <TouchableOpacity
                  style={[styles.paymentMethodTab, selectedPaymentMethod === 'basic' && styles.paymentMethodTabActive]}
                  onPress={() => {
                    setSelectedPaymentMethod('basic');
                    const { a, b } = normalizePercents(usdtPercentage, yoyPercentage);
                    setUsdtPercentage(a);
                    setYoyPercentage(b);
                  }}
                >
                  <ThemedText style={[styles.paymentMethodTabText, selectedPaymentMethod === 'basic' && styles.paymentMethodTabTextActive]}>
                    {t('default', language)}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentMethodTab, selectedPaymentMethod === 'stablecoin' && styles.paymentMethodTabActive]}
                  onPress={() => {
                    setSelectedPaymentMethod('stablecoin');
                    setUsdtPercentage(100);
                    setYoyPercentage(0);
                  }}
                >
                  <ThemedText style={[styles.paymentMethodTabText, selectedPaymentMethod === 'stablecoin' && styles.paymentMethodTabTextActive]}>
                    USDT
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentMethodTab, selectedPaymentMethod === 'yoy' && styles.paymentMethodTabActive]}
                  onPress={() => {
                    setSelectedPaymentMethod('yoy');
                    setUsdtPercentage(0);
                    setYoyPercentage(100);
                  }}
                >
                  <ThemedText style={[styles.paymentMethodTabText, selectedPaymentMethod === 'yoy' && styles.paymentMethodTabTextActive]}>
                    YOY
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* USDT 슬라이더 (스테이블 합계) */}
            {selectedPaymentMethod !== 'yoy' && (
            <View style={styles.paymentSliderContainer}>
              <ThemedText style={styles.paymentSliderLabel}>USDT</ThemedText>
              <View style={styles.sliderContainer}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  const x = e.nativeEvent.locationX;
                  setUsdtFromX(x);
                }}
                onResponderMove={(e) => {
                  const x = e.nativeEvent.locationX;
                  setUsdtFromX(x);
                }}
              >
                <View style={[
                  styles.sliderTrack,
                  usdtOver && styles.sliderTrackOver
                ]}
                  onLayout={(e) => setUsdtTrackWidth(e.nativeEvent.layout.width)}
                >
                  <View style={[styles.sliderFill, { width: `${usdtPercentage}%` }]} />
                  <View style={[styles.sliderThumb, { left: `${usdtPercentage}%` }]} />
                </View>
                <ThemedText style={styles.sliderPercentage}>{Math.round(usdtPercentage)}%</ThemedText>
                {usdtOver ? (
                  <TouchableOpacity style={styles.maxButton} onPress={() => handleSetMaxPct('USDT')}>
                    <ThemedText style={styles.maxButtonText}>{t('maximum', language) || 'MAX'}</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.paymentInfoRow}>
                <ThemedText style={styles.paymentInfoText}>{t('used', language)}: {formatAmount(usedUsdt, 2)} USDT(eqv.)</ThemedText>
                <ThemedText style={styles.holdingText}>{t('available2', language)}: {usdtBalance.toLocaleString()} USDT</ThemedText>
              </View>
            </View>
            )}

            {/* YOY 골든바: 스테이블 코인 아래에 위치 */}
            {selectedPaymentMethod !== 'stablecoin' && (
            <View style={styles.paymentSliderContainer}>
              <ThemedText style={styles.paymentSliderLabel}>YOY</ThemedText>
              <View style={styles.sliderContainer}
                onStartShouldSetResponder={() => true}
                onResponderGrant={(e) => {
                  const x = e.nativeEvent.locationX;
                  setYoyFromX(x);
                }}
                onResponderMove={(e) => {
                  const x = e.nativeEvent.locationX;
                  setYoyFromX(x);
                }}
              >
                <View style={[
                  styles.sliderTrack,
                  yoyOver && styles.sliderTrackOver
                ]}
                  onLayout={(e) => setYoyTrackWidth(e.nativeEvent.layout.width)}
                >
                  <View style={[styles.sliderFill, { width: `${yoyPercentage}%` }]} />
                  <View style={[styles.sliderThumb, { left: `${yoyPercentage}%` }]} />
                </View>
                <ThemedText style={styles.sliderPercentage}>{yoyPercentage}%</ThemedText>
                {yoyOver ? (
                  <TouchableOpacity style={styles.maxButton} onPress={() => handleSetMaxPct('YOY')}>
                    <ThemedText style={styles.maxButtonText}>{t('maximum', language) || 'MAX'}</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.paymentInfoRow}>
                <ThemedText style={styles.paymentInfoText}>{t('used', language)}: {formatAmount(usedYoy, 2)} YOY</ThemedText>
                <ThemedText style={styles.holdingText}>{t('available2', language)}: {yoyBalance.toLocaleString()} YOY</ThemedText>
              </View>
            </View>
            )}

            {/* 스테이블 코인 개별 라인 제거 (USDT/Yoy 2분기만 유지) */}

            {/* 결제금액 */}
            <View style={styles.paymentAmountContainer}>
              <ThemedText style={styles.sectionTitle}>{t('paymentAmount', language)}</ThemedText>
              <View style={styles.paymentAmountField}>
                <ThemedText style={styles.paymentAmountText}>{getSymbolForCurrency(priceCurrency)} {paymentAmount >= 100 ? paymentAmount.toLocaleString() : paymentAmount.toFixed(2)}</ThemedText>
              </View>
            </View>

            {/* 주문 버튼 */}
            <TouchableOpacity
              style={[
                styles.orderSubmitButton,
                orderType === 'buy' ? styles.buyOrderButton : styles.sellOrderButton,
                isOrdering && styles.orderButtonDisabled
              ]}
              onPress={handleOrder}
              disabled={isOrdering}
            >
              <ThemedText style={styles.orderSubmitButtonText}>
                {isOrdering ? t('processing', language) : (orderType === 'buy' ? t('placeBuy', language) : t('placeSell', language))}
              </ThemedText>
            </TouchableOpacity>

            {/* 인기 코인 빠른 주문 */}
            <View style={styles.quickOrderSection}>
              <ThemedText style={styles.quickOrderTitle}>{t('quickOrder', language)}</ThemedText>
              <View style={styles.quickOrderButtons}>
                {['BTC', 'ETH', 'YOY', 'SOL', 'DOT', 'LINK', 'ADA', 'AVAX'].map((symbol) => (
                  <TouchableOpacity
                    key={symbol}
                    style={[
                      styles.quickOrderButton,
                      selectedOrderCoin === symbol && styles.quickOrderButtonActive
                    ]}
                    onPress={() => handleQuickOrder(symbol)}
                  >
                    <ThemedText style={[
                      styles.quickOrderButtonText,
                      selectedOrderCoin === symbol && styles.quickOrderButtonTextActive
                    ]}>
                      {symbol}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {selectedMainTab === 'orderHistory' && (
          <View style={styles.orderHistorySection}>
            <ThemedText style={styles.sectionTitle}>{t('orderHistory', language)}</ThemedText>

            {/* 필터 탭 */}
            <View style={styles.orderFilterTabs}>
              {[
                { key: 'all', label: t('all', language) },
                { key: 'buy', label: t('buy', language) },
                { key: 'sell', label: t('sell', language) },
              ].map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.orderFilterTab, orderFilter === (f.key as any) && styles.orderFilterTabActive]}
                  onPress={() => setOrderFilter(f.key as 'all'|'buy'|'sell')}
                >
                  <ThemedText style={[styles.orderFilterText, orderFilter === (f.key as any) && styles.orderFilterTextActive]}>
                    {f.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* 검색 + 정렬 */}
            <View style={styles.orderSearchSortRow}>
              <View style={{flex:1}}>
                <TextInput
                  style={styles.orderSearchInput}
                  placeholder={t('searchSymbol', language)}
                  placeholderTextColor="#888"
                  value={orderSearch}
                  onChangeText={(t)=>{ setOrderSearch(t); setOrderPage(1);} }
                />
              </View>
              <View style={styles.orderSortButtons}>
                {[
                  { key:'time', label:t('time', language) },
                  { key:'price', label:t('price', language) },
                  { key:'quantity', label:t('quantity', language) },
                ].map(btn => (
                  <TouchableOpacity key={btn.key}
                    style={[styles.sortBtn, orderSortKey===btn.key && styles.sortBtnActive]}
                    onPress={()=>{
                      if (orderSortKey===btn.key) setOrderSortOrder(prev=> prev==='asc'?'desc':'asc');
                      else { setOrderSortKey(btn.key as any); setOrderSortOrder('desc'); }
                      setOrderPage(1);
                    }}
                  >
                    <ThemedText style={[styles.sortBtnText, orderSortKey===btn.key && styles.sortBtnTextActive]}>
                      {btn.label}{orderSortKey===btn.key ? (orderSortOrder==='asc'?' ↑':' ↓') : ''}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 주문 리스트 */}
            <View style={styles.orderTable}>
              <View style={styles.orderHeader}>
                <ThemedText style={[styles.orderHeadText, {flex:1.2}]}>{t('time', language)}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:0.8}]}>{t('type', language)}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:1}]}>{t('coinMarket', language)}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:1}]}>{t('price', language)}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:1}]}>{t('quantity', language)}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:0.8}]}>{t('status', language)}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:0.8}]}>{t('action', language)}</ThemedText>
              </View>

              {(() => {
                const mockOrders = [
                  { id: 'm1', timestamp: Date.now()-1000*60*15, side:'buy', symbol:'BTC/KRW', price: 112000000, quantity:0.001, status:'FILLED',
                    txHash:'0x5a4f...c1a2', network:'Ethereum', blockNumber: 20345678, gasUsed: 21000,
                    from:'0xAbCDEF1234567890abcdef1234567890ABCDEF12', to:'0x1111111111111111111111111111111111111111',
                    explorerUrl:'https://etherscan.io/tx/0x5a4fc1a2' },
                  { id: 'm2', timestamp: Date.now()-1000*60*50, side:'buy', symbol:'ETH/KRW', price: 4500000, quantity:0.1, status:'PENDING' },
                  { id: 'm3', timestamp: Date.now()-1000*60*60*5, side:'buy', symbol:'YOY/KRW', price: 150, quantity:1000, status:'CANCELLED',
                    txHash:'0xde01...77aa', network:'BSC', blockNumber: 38123456, gasUsed: 65000,
                    from:'0xCAFE00000000000000000000000000000000CAFE', to:'0x3333333333333333333333333333333333333333',
                    explorerUrl:'https://bscscan.com/tx/0xde0177aa' },
                ];
                // 필터
                const filtered = (orderFilter==='all' ? mockOrders : mockOrders.filter(o=>o.side===orderFilter))
                  .filter(o => o.symbol.toLowerCase().includes(orderSearch.toLowerCase()));
                // 정렬
                const sorted = [...filtered].sort((a,b)=>{
                  let aV=0, bV=0;
                  if (orderSortKey==='time') { aV=a.timestamp; bV=b.timestamp; }
                  else if (orderSortKey==='price') { aV=a.price; bV=b.price; }
                  else { aV=a.quantity; bV=b.quantity; }
                  return orderSortOrder==='asc' ? (aV-bV) : (bV-aV);
                });
                // 페이지네이션
                const totalPages = Math.max(1, Math.ceil(sorted.length/ORDERS_PER_PAGE));
                const page = Math.min(orderPage, totalPages);
                const start = (page-1)*ORDERS_PER_PAGE;
                const paged = sorted.slice(start, start+ORDERS_PER_PAGE);
                const fmtTime = (t:number) => new Date(t).toLocaleString(locale as any,{ month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
                return (
                  <>
                  {paged.map(o => (
                  <TouchableOpacity key={o.id} style={styles.orderRow} onPress={()=>{ setSelectedOrderDetail(o); setOrderDetailVisible(true); }}>
                    <ThemedText style={[styles.orderCell,{flex:1.2}]} numberOfLines={1}>{fmtTime(o.timestamp)}</ThemedText>
                    <ThemedText style={[styles.orderCell,{flex:0.8, color: o.side==='buy' ? '#02C076' : '#F23645'}]} numberOfLines={1}>
                      {o.side==='buy'?t('buy', language):t('sell', language)}
                    </ThemedText>
                    <ThemedText style={[styles.orderCell,{flex:1}]} numberOfLines={1}>{o.symbol}</ThemedText>
                    <ThemedText style={[styles.orderCell,{flex:1}]} numberOfLines={1}>{o.price.toLocaleString()}</ThemedText>
                    <ThemedText style={[styles.orderCell,{flex:1}]} numberOfLines={1}>{o.quantity.toFixed(4)}</ThemedText>
                    <ThemedText style={[styles.orderCell,{flex:0.8, color: (cancelledOrders[o.id] || o.status==='CANCELLED')? '#F23645' : o.status==='FILLED'? '#02C076' : '#FFD54F'}]} numberOfLines={1}>
                      {(cancelledOrders[o.id] || o.status==='CANCELLED') ? t('orderCancelled', language) : (o.status==='FILLED'?t('orderFilled', language):t('orderAccepted', language))}
                    </ThemedText>
                    <View style={{flex:0.8, alignItems:'center'}}>
                      {(cancelledOrders[o.id] || o.status!=='PENDING') ? (
                        <ThemedText style={[styles.orderCell,{color:'#666'}]}>-</ThemedText>
                      ) : (
                        <TouchableOpacity 
                          style={styles.cancelOrderBtn}
                          onPress={() => {
                            Alert.alert(t('cancelOrder', language), t('orderCancelConfirm', language),[
                              { text:t('no', language), style:'cancel' },
                              { text:t('yes', language), style:'destructive', onPress:async()=>{
                                await handleCancelOrder(o.id);
                              } }
                            ]);
                          }}
                        >
                          <ThemedText style={styles.cancelOrderBtnText}>{t('cancel', language)}</ThemedText>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                  ))}
                  {/* 페이지네이션 */}
                  <View style={styles.paginationRow}>
                    {Array.from({length: totalPages}).map((_,i)=> (
                      <TouchableOpacity key={`p-${i+1}`} style={[styles.pageBtn, page===(i+1) && styles.pageBtnActive]} onPress={()=>setOrderPage(i+1)}>
                        <ThemedText style={[styles.pageBtnText, page===(i+1) && styles.pageBtnTextActive]}>{i+1}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                  </>
                );
              })()}
            </View>
          </View>
        )}
      </ScrollView>
      {/* 주문 상세 모달 */}
      {orderDetailVisible && selectedOrderDetail && (
        <Modal visible transparent animationType="slide" onRequestClose={()=>setOrderDetailVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={()=>setOrderDetailVisible(false)}>
            <View style={styles.bottomSheetContainer}>
              <TouchableOpacity activeOpacity={1} onPress={()=>{}} style={[styles.detailModal, styles.detailSheet]}>
                <View style={styles.bottomSheetHandle} />
                <ThemedText style={styles.detailTitle}>{t('details', language)}</ThemedText>
                <View style={styles.detailRow}><ThemedText style={styles.detailKey}>{t('time', language)}</ThemedText><ThemedText style={styles.detailVal}>{new Date(selectedOrderDetail.timestamp).toLocaleString(locale as any)}</ThemedText></View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailKey}>{t('type', language)}</ThemedText>
                  <ThemedText style={[styles.detailVal, selectedOrderDetail.side==='buy'?{color:'#02C076'}:{color:'#F23645'}]}>
                    {selectedOrderDetail.side==='buy'?t('buy', language):t('sell', language)}
                  </ThemedText>
                </View>
                <View style={styles.detailRow}><ThemedText style={styles.detailKey}>{t('coinMarket', language)}</ThemedText><ThemedText style={styles.detailVal}>{selectedOrderDetail.symbol}</ThemedText></View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailKey}>{t('price', language)}</ThemedText>
                  {(() => {
                    const quote = ((selectedOrderDetail.symbol || '').split('/')[1] || priceCurrency) as any;
                    const sym = getSymbolForCurrency(quote);
                    return (
                      <ThemedText style={styles.detailVal}>{sym} {selectedOrderDetail.price.toLocaleString()}</ThemedText>
                    );
                  })()}
                </View>
                <View style={styles.detailRow}><ThemedText style={styles.detailKey}>{t('quantity', language)}</ThemedText><ThemedText style={styles.detailVal}>{selectedOrderDetail.quantity}</ThemedText></View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailKey}>{t('status', language)}</ThemedText>
                  <ThemedText style={[
                    styles.detailVal,
                    selectedOrderDetail.status==='FILLED' ? {color:'#02C076'} : selectedOrderDetail.status==='PENDING' ? {color:'#FFD54F'} : {color:'#F23645'}
                  ]}>
                    {selectedOrderDetail.status==='FILLED' ? t('orderFilled', language) : selectedOrderDetail.status==='PENDING' ? t('orderAccepted', language) : t('orderCancelled', language)}
                  </ThemedText>
                </View>
                {/* 블록체인 정보 (존재할 때만 표시) */}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.txHash ? (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailKey}>Tx Hash</ThemedText>
                    <TouchableOpacity onPress={()=>{
                      try {
                        const url = selectedOrderDetail.explorerUrl || buildExplorerTxUrl(selectedOrderDetail.network, selectedOrderDetail.txHash, isTestnetEnv);
                        if (!url) return;
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const { Linking } = require('react-native');
                        Linking.openURL(url);
                      } catch {}
                    }}>
                      <ThemedText style={[styles.detailVal, {textDecorationLine:'underline', color:'#4DA6FF'}]} numberOfLines={1} ellipsizeMode='middle'>
                        {selectedOrderDetail.txHash}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.network ? (
                  <View style={styles.detailRow}><ThemedText style={styles.detailKey}>{t('network', language)}</ThemedText><ThemedText style={styles.detailVal}>{selectedOrderDetail.network}</ThemedText></View>
                ) : null}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.blockNumber ? (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailKey}>{t('block', language)}</ThemedText>
                    <TouchableOpacity onPress={()=>{
                      try {
                        const url = buildExplorerBlockUrl(selectedOrderDetail.network, selectedOrderDetail.blockNumber, isTestnetEnv);
                        if (!url) return;
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const { Linking } = require('react-native');
                        Linking.openURL(url);
                      } catch {}
                    }}>
                      <ThemedText style={[styles.detailVal, {textDecorationLine:'underline', color:'#4DA6FF'}]}>
                        {String(selectedOrderDetail.blockNumber)}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.gasUsed ? (
                  <View style={styles.detailRow}><ThemedText style={styles.detailKey}>{t('gasUsed', language)}</ThemedText><ThemedText style={styles.detailVal}>{String(selectedOrderDetail.gasUsed)}</ThemedText></View>
                ) : null}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.from ? (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailKey}>From</ThemedText>
                    <TouchableOpacity onPress={()=>{
                      try {
                        const url = buildExplorerAddressUrl(selectedOrderDetail.network, selectedOrderDetail.from, isTestnetEnv);
                        if (!url) return;
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const { Linking } = require('react-native');
                        Linking.openURL(url);
                      } catch {}
                    }}>
                      <ThemedText style={[styles.detailVal, {textDecorationLine:'underline', color:'#4DA6FF'}]} numberOfLines={1} ellipsizeMode='middle'>
                        {selectedOrderDetail.from}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.to ? (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailKey}>To</ThemedText>
                    <TouchableOpacity onPress={()=>{
                      try {
                        const url = buildExplorerAddressUrl(selectedOrderDetail.network, selectedOrderDetail.to, isTestnetEnv);
                        if (!url) return;
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const { Linking } = require('react-native');
                        Linking.openURL(url);
                      } catch {}
                    }}>
                      <ThemedText style={[styles.detailVal, {textDecorationLine:'underline', color:'#4DA6FF'}]} numberOfLines={1} ellipsizeMode='middle'>
                        {selectedOrderDetail.to}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {selectedOrderDetail.status !== 'PENDING' && selectedOrderDetail.txHash ? (
                  <TouchableOpacity style={styles.explorerBtn} onPress={()=>{
                    try { 
                      const url = selectedOrderDetail.explorerUrl || buildExplorerTxUrl(selectedOrderDetail.network, selectedOrderDetail.txHash, isTestnetEnv);
                      if (!url) return;
                      // 웹/네이티브 모두에서 Linking 사용
                      // eslint-disable-next-line @typescript-eslint/no-var-requires
                      const { Linking } = require('react-native');
                      Linking.openURL(url);
                    } catch {}
                  }}>
                    <ThemedText style={styles.explorerBtnText}>{t('viewInExplorer', language)}</ThemedText>
                  </TouchableOpacity>
                ) : null}

                {/* PENDING 전용 액션/가이드 영역 */}
                {selectedOrderDetail.status === 'PENDING' && (
                  <View style={styles.pendingPanel}>
                    {(() => {
                      const base = (selectedOrderDetail.symbol || '').split('/')[0] || selectedOrderDetail.symbol || selectedOrderCoin || '';
                      const qty = Number(selectedOrderDetail.quantity) || 0;
                      const qtyText = qty >= 1 ? qty.toLocaleString() : qty.toFixed(4);
                      const isBuy = selectedOrderDetail.side === 'buy';
                      return (
                        <ThemedText style={[styles.pendingHeader, { textAlign:'center' }]}> 
                          {base} <ThemedText style={{ color:'#FFFFFF', fontWeight:'900' }}>{qtyText}{t('unitPiece', language)}</ThemedText> <ThemedText style={{ color: isBuy ? '#02C076' : '#F23645', fontWeight:'900' }}>{isBuy ? t('buy', language) : t('sell', language)}</ThemedText> {t('tradeHistory', language)}
                        </ThemedText>
                      );
                    })()}
                    <View style={styles.separator} />
                    {(() => {
                      const target = Number(selectedOrderDetail.price) || 0;
                      const curr = getCurrentPriceForSymbol((selectedOrderDetail.symbol || '').split('/')[0]);
                      const diff = target - curr; // 매수: 음수, 매도: 양수
                      const isBuy = selectedOrderDetail.side === 'buy';
                      const signOk = (isBuy && diff <= 0) || (!isBuy && diff >= 0);
                      const diffText = diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const quote = ((selectedOrderDetail.symbol || '').split('/')[1] || priceCurrency) as any;
                      const sym = getSymbolForCurrency(quote);
                      return (
                        <View style={{ gap: 6 }}>
                          <ThemedText style={styles.pendingMeta}>{t('targetPrice', language)}: {sym} {target.toLocaleString()}</ThemedText>
                          <ThemedText style={styles.pendingMeta}>{t('currentPriceLabel', language)}: {sym} {curr.toLocaleString()}</ThemedText>
                          <ThemedText style={[styles.pendingDiffText, signOk ? styles.metaOk : styles.metaWarn]}>
                            {t('difference', language)}: {sym} {diffText}
                          </ThemedText>
                        </View>
                      );
                    })()}
                    <View style={styles.separator} />
                    <View style={styles.pendingActions}>
                      {/* 가격수정 입력 + 재주문 */}
                      {(() => {
                        const base = (selectedOrderDetail.symbol || '').split('/')[0];
                        const curr = getCurrentPriceForSymbol(base);
                        const isBuy = selectedOrderDetail.side === 'buy';
                        const suggested = curr * (isBuy ? 0.95 : 1.05);
                        const quote = ((selectedOrderDetail.symbol || '').split('/')[1] || priceCurrency) as any;
                        const sym = getSymbolForCurrency(quote);
                        if (!pendingReorderPrice) setPendingReorderPrice(String(Math.round(suggested)));
                        return (
                          <View style={styles.reorderRow}>
                            <View style={styles.reorderInputWrap}>
                              <ThemedText style={styles.reorderSymbol}>{sym}</ThemedText>
                              <TextInput
                                style={styles.reorderInput}
                                keyboardType="numeric"
                                value={formatWithThousands(pendingReorderPrice)}
                                onChangeText={(t)=>{
                                  const raw = unformatNumber(t);
                                  setPendingReorderPrice(raw);
                                }}
                                placeholder={t('enterPrice', language)}
                                placeholderTextColor="#666"
                              />
                            </View>
                            <TouchableOpacity style={[styles.pendingBtn, styles.primaryBtn]} onPress={async()=>{
                              const v = Number(unformatNumber(pendingReorderPrice || ''));
                              if (!v || !isFinite(v)) {
                                Alert.alert(t('error', language), t('invalidPrice', language));
                                return;
                              }
                              // 주문 입력에 값 반영 및 주문 탭으로 이동
                              const base = (selectedOrderDetail.symbol || '').split('/')[0] || selectedOrderCoin;
                              const quote = (selectedOrderDetail.symbol || '').split('/')[1] || selectedOrderMarket;
                              setOrderPrice(String(v));
                              setOrderQuantity(String(selectedOrderDetail.quantity || ''));
                              setSelectedOrderCoin(base);
                              setSelectedOrderMarket(quote);
                              setSelectedMainTab('order');
                              setOrderDetailVisible(false);
                            }}>
                              <ThemedText style={[styles.pendingBtnText, { color:'#000' }]}>{t('reorder', language)}</ThemedText>
                            </TouchableOpacity>
                          </View>
                        );
                      })()}
                      <TouchableOpacity style={[styles.pendingBtn, styles.primaryBtn]} onPress={async()=>{
                        // 현재가로 정정: 주문가격을 현재가로 업데이트 (가상 로직)
                        try {
                          const base = (selectedOrderDetail.symbol || '').split('/')[0] || selectedOrderCoin;
                          const quote = (selectedOrderDetail.symbol || '').split('/')[1] || selectedOrderMarket;
                          const newPrice = getCurrentPriceForSymbol(base) || selectedOrderDetail.price;
                          setOrderPrice(String(newPrice));
                          setOrderQuantity(String(selectedOrderDetail.quantity || ''));
                          setSelectedOrderCoin(base);
                          setSelectedOrderMarket(quote);
                          setSelectedMainTab('order');
                          setOrderDetailVisible(false);
                        } catch {}
                      }}>
                        <ThemedText style={[styles.pendingBtnText, { color:'#000' }]}>{t('updateToCurrentPrice', language)}</ThemedText>
                      </TouchableOpacity>
                      {/* 기존 버튼 대체: 위 입력+재주문으로 대체 */}
                      <TouchableOpacity style={[styles.pendingBtn, styles.dangerBtn]} onPress={()=>{
                        Alert.alert(t('cancelOrder', language), t('orderCancelConfirm', language),[
                          { text:t('no', language), style:'cancel' },
                          { text:t('yes', language), style:'destructive', onPress:async()=>{
                            setOrderDetailVisible(false);
                            await handleCancelOrder(selectedOrderDetail.id);
                          } }
                        ]);
                      }}>
                        <ThemedText style={[styles.pendingBtnText, { color:'#000' }]}>{t('cancelOrder', language)}</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <TouchableOpacity style={[styles.cancelOrderBtn,{alignSelf:'flex-end', marginTop:12}]} onPress={()=>setOrderDetailVisible(false)}>
                  <ThemedText style={styles.cancelOrderBtnText}>{t('close', language)}</ThemedText>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      
      <HamburgerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        avatarUri={avatarUri}
      />
      
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  mainTabsContainer: {
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
  mainTabActive: {
    borderBottomColor: '#FFD700',
  },
  mainTabText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  mainTabTextActive: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    paddingBottom: 50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#CCCCCC',
  },
  filterContainer: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  currencySelector: {
    flexDirection: 'row',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 2,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyButtonActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  currencyButtonText: {
    fontSize: 13,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  currencyButtonTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  searchAndSortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchContainer: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonText: {
    fontSize: 11,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  sortButtonTextActive: {
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  sortOrderButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  sortOrderText: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  coinList: {
    padding: 16,
  },
  coinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  coinLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    color: '#888888',
    fontWeight: '500',
  },
  coinLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
    borderRadius: 16,
  },
  coinInfo: {
    flex: 1,
  },
  coinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  coinSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 8,
  },
  coinName: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  coinRight: {
    alignItems: 'flex-end',
  },
  priceContainer: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  positiveChange: {
    color: '#D4AF37',
  },
  negativeChange: {
    color: '#FF6B6B',
  },
  marketCapContainer: {
    alignItems: 'flex-end',
  },
  marketCapText: {
    fontSize: 10,
    color: '#888888',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  footerText: {
    fontSize: 12,
    color: '#D4AF37',
  },
  
  // 주문 관련 스타일
  orderSection: {
    padding: 16,
  },
  orderTypeDivider: {
    height: 1,
    backgroundColor: '#FFFFFF',
    opacity: 0.2,
    marginTop: 8,
    marginBottom: 12,
  },
  assetSelectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  inlineSectionTitle: {
    marginBottom: 0,
    alignSelf: 'center',
    marginRight: 8,
  },
  assetSelectionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  marketSelector: {
    flex: 1,
  },
  coinSelector: {
    flex: 1,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  selectorButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  selectorArrow: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  selectorDropdown: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  coinDropdownRight: {
    right: 20,
    width: 120,
    maxHeight: 280,
  },
  selectorOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#2A2A2A',
  },
  selectorOptionActive: {
    backgroundColor: '#FFD700',
  },
  selectorOptionText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  selectorOptionTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  orderTypeContainer: {
    marginBottom: 24,
  },
  orderTypeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  orderTypeButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  orderTypeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  orderTypeButtonTextActive: {
    color: '#000000',
  },
  
  // B 형식 새로운 스타일들
  priceDisplayContainer: {
    marginBottom: 20,
  },
  priceDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceDisplayField: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
  },
  priceDisplayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  priceDropdownButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
  },
  priceDropdownText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  refreshButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
  },
  refreshButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  
  quantityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityInputField: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
    fontSize: 16,
    color: '#FFFFFF',
  },
  quantityUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    minWidth: 40,
  },
  
  paymentMethodContainer: {
    marginBottom: 20,
  },
  paymentMethodTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentMethodTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
  },
  paymentMethodTabActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  paymentMethodTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  paymentMethodTabTextActive: {
    color: '#000000',
  },
  
  paymentSliderContainer: {
    marginBottom: 20,
  },
  paymentSliderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#444',
    borderRadius: 3,
    position: 'relative',
  },
  sliderTrackOver: {
    backgroundColor: '#7a2b2b',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 18,
    height: 18,
    backgroundColor: '#FFD700',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  sliderPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    minWidth: 30,
    textAlign: 'right',
  },
  paymentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentInfoText: {
    fontSize: 12,
    color: '#999',
  },
  holdingText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '800',
  },
  
  paymentAmountContainer: {
    marginBottom: 20,
  },
  paymentAmountField: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'flex-end',
  },
  paymentAmountText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  priceInputContainer: {
    marginBottom: 24,
  },
  quantityInputContainer: {
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceInput: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  quantityInput: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  currentPriceButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPriceButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  maxButton: {
    backgroundColor: '#444',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  orderSubmitButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  buyOrderButton: {
    backgroundColor: '#00C851',
  },
  sellOrderButton: {
    backgroundColor: '#FF4444',
  },
  orderButtonDisabled: {
    backgroundColor: '#666',
  },
  orderSubmitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  quickOrderSection: {
    marginBottom: 24,
  },
  quickOrderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  quickOrderButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickOrderButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  quickOrderButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  quickOrderButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  quickOrderButtonTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  orderHistorySection: {
    padding: 16,
    minHeight: 200,
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  orderFilterTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  orderSearchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  orderSearchInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
  },
  orderSortButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#1A1A1A',
  },
  sortBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  sortBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  sortBtnTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  detailModal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
    padding: 16,
    marginHorizontal: 24,
  },
  bottomSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 24,
    justifyContent: 'flex-end',
  },
  detailSheet: {
    marginHorizontal: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 0,
    paddingBottom: 24,
  },
  bottomSheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555',
    marginBottom: 12,
  },
  detailTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  detailKey: {
    color: '#AAA',
    fontSize: 12,
  },
  detailVal: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  explorerBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFD700',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  explorerBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  pendingPanel: {
    marginTop: 16,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
  },
  pendingHeader: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '800',
  },
  pendingWarning: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 10,
  },
  pendingMeta: {
    color: '#CCCCCC',
    fontSize: 12,
    textAlign: 'center',
  },
  metaOk: {
    color: '#02C076',
  },
  metaWarn: {
    color: '#F23645',
  },
  pendingDiffText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 10,
  },
  pendingActions: {
    flexDirection: 'column',
    gap: 8,
  },
  pendingBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  dangerBtn: {
    backgroundColor: '#FF5C5C',
    borderColor: '#FF5C5C',
  },
  pendingBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reorderInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reorderSymbol: {
    color: '#AAA',
    marginRight: 6,
    fontWeight: '700',
  },
  reorderInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    padding: 0,
  },
  orderFilterTab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  orderFilterTabActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  orderFilterText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  orderFilterTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  orderTable: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  orderHeadText: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '700',
  },
  orderRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  orderCell: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  pageBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  pageBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  pageBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pageBtnTextActive: {
    color: '#000000',
  },
  cancelOrderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#333',
    borderWidth: 1,
    borderColor: '#555',
    minWidth: 50,
    alignItems: 'center',
  },
  cancelOrderBtnText: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 12,
  },
});
