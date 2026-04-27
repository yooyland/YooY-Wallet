import NewsList from '@/components/NewsList';
import PriceChart from '@/components/PriceChart';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/AuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { getCoinDisplayName, getCoinsByMarket } from '@/lib/managedCoins';
import { getCoinPriceByCurrency, getCoinSymbolFromMarket, getMarketDefaultCurrency, updateRealTimePrices } from '@/lib/priceManager';
import { fetchJsonWithProxy, getAllUpbitMarkets } from '@/lib/upbit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IOS_APP_STORE_SHELF, TRADING_UI_ENABLED } from '@/lib/featureFlags';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
    Linking
} from 'react-native';

const { width } = Dimensions.get('window');

export default function MarketDetailScreen() {
  if (IOS_APP_STORE_SHELF) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  const { id, tab } = useLocalSearchParams();
  const { currentUser, accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { yoyPriceKRW, yoyPriceUSD } = useMarket();
  const { currency: userPreferredCurrency, language } = usePreferences();
  
  // 상태 관리
  const [selectedTab, setSelectedTab] = useState(() => {
    const init = tab ? String(tab) : 'order';
    if (!TRADING_UI_ENABLED && (init === 'order' || init === 'orderbook')) return 'chart';
    return init;
  });

  // iOS 심사 대응: trading/order/orderbook 탭은 강제 차단 (라우팅으로 진입해도 chart로 보냄)
  useEffect(() => {
    if (TRADING_UI_ENABLED) return;
    if (selectedTab === 'order' || selectedTab === 'orderbook') {
      setSelectedTab('chart');
    }
  }, [selectedTab]);
  const [selectedOrderBookView, setSelectedOrderBookView] = useState<'full' | 'buy' | 'sell'>('full');
  const [coin, setCoin] = useState<any>(null);
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const defaultQuote = useMemo(() => {
    const market = String(id || '').toUpperCase();
    return market.includes('-') ? (market.split('-')[0] as any) : (getMarketDefaultCurrency(userPreferredCurrency) as any);
  }, [id, userPreferredCurrency]);
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'KRW' | 'EUR' | 'JPY' | 'CNY'>(defaultQuote);
  const [priceInput, setPriceInput] = useState('');
  const [priceInputRaw, setPriceInputRaw] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [quantityInputRaw, setQuantityInputRaw] = useState('');
  const [priceVariance, setPriceVariance] = useState(0);
  const [recommendedVariance, setRecommendedVariance] = useState<number | null>(null);
  // 결제방식 탭: 기본 | 스테이블코인 | YOY
  const [activePaymentTab, setActivePaymentTab] = useState<'default' | 'stable' | 'yoy'>('default');
  const [selectedPaymentCoin, setSelectedPaymentCoin] = useState<string>('USDT');
  const [upbitMarkets, setUpbitMarkets] = useState<{
    KRW: any[];
    USDT: any[];
    BTC: any[];
    ETH: any[];
  }>({ KRW: [], USDT: [], BTC: [], ETH: [] });
  const [paymentBarWidthByCoin, setPaymentBarWidthByCoin] = useState<Record<string, number>>({});
  const [gestureStartByCoin, setGestureStartByCoin] = useState<Record<string, { x: number; pct: number }>>({});
  const [paymentMethods, setPaymentMethods] = useState([
    { coin: 'USDT', percentage: 60, amount: 0, available: true, minPercentage: 0, maxPercentage: 100 },
    { coin: 'USDC', percentage: 0,  amount: 0, available: true, minPercentage: 0, maxPercentage: 100 },
    { coin: 'BUSD', percentage: 0,  amount: 0, available: true, minPercentage: 0, maxPercentage: 100 },
    { coin: 'DAI',  percentage: 0,  amount: 0, available: true, minPercentage: 0, maxPercentage: 100 },
    { coin: 'YOY',  percentage: 40, amount: 0, available: true, minPercentage: 0, maxPercentage: 100 },
  ]);
  const [showVariancePicker, setShowVariancePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  // AI Q&A 상태
  const [aiInput, setAiInput] = useState('');
  const [aiQAs, setAiQAs] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string }>>([]);

  // LLM 연동 함수(프록시 엔드포인트 사용)
  const fetchLLMAnswer = useCallback(async (question: string) => {
    try {
      // 환경변수: 프록시 서버 URL (서버에서 OpenAI/Anthropic 등 호출)
      const endpoint = (process as any)?.env?.EXPO_PUBLIC_LLM_PROXY_URL || '';
      const provider = ((process as any)?.env?.EXPO_PUBLIC_LLM_PROVIDER || 'openai').toLowerCase();
      // 요약 컨텍스트 생성
      const market = (coin?.market || String(id || '')).toUpperCase();
      const quote = market.includes('-') ? market.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
      const base = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
      const price = coin?.price || getCoinPriceByMarket(base, quote as any) || 0;
      const change = Number(coin?.change_24h || 0);
      const context = {
        pair: `${quote}/${base}`,
        base,
        quote,
        price,
        change24h: change,
        timestamp: Date.now(),
      };
      if (!endpoint) {
        // 프록시가 설정되지 않은 경우 간이 답변
        return `${base}/${quote} ${t('currentPriceLabel', language) || 'Price'}: ${getCurrencySymbol(quote)}${price.toLocaleString()} (${change>=0?'+':''}${change.toFixed(2)}%). ${t('llmNotConfigured', language)}`;
      }
      const resp = await fetch(String(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, provider }),
      });
      if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);
      const data = await resp.json();
      const answer = String(data?.answer || data?.content || data?.message || '');
      return answer || t('thinking', language) || 'Thinking...';
    } catch (e) {
      return t('thinking', language) || 'Thinking...';
    }
  }, [coin?.market, coin?.price, coin?.change_24h, id, userPreferredCurrency, language]);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // 주문내역 행 클릭 모달
  const [selectedOrderRow, setSelectedOrderRow] = useState<any>(null);
  const [showOrderRowModal, setShowOrderRowModal] = useState(false);
  const [cancelledMap, setCancelledMap] = useState<Record<string, boolean>>({});
  const [pendingReorderPrice, setPendingReorderPrice] = useState<string>('');

  // 익스플로러 URL 헬퍼 (market 탭과 동일 규칙)
  const isTestnetEnv = (process.env.EXPO_PUBLIC_NETWORK || '').toLowerCase().includes('test');
  const getExplorerBase = (network?: string, isTestnet?: boolean) => {
    const net = (network || '').toLowerCase();
    const test = !!isTestnet;
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
    if (net.includes('ethereum') || net === 'eth') return test ? 'https://sepolia.etherscan.io' : 'https://etherscan.io';
    if (net.includes('polygon') || net === 'matic') return test ? 'https://mumbai.polygonscan.com' : 'https://polygonscan.com';
    if (net.includes('bsc') || net.includes('binance')) return test ? 'https://testnet.bscscan.com' : 'https://bscscan.com';
    if (net.includes('arbitrum')) return test ? 'https://sepolia.arbiscan.io' : 'https://arbiscan.io';
    if (net.includes('optimism') || net.includes('op')) return test ? 'https://sepolia-optimistic.etherscan.io' : 'https://optimistic.etherscan.io';
    if (net.includes('base')) return test ? 'https://sepolia.basescan.org' : 'https://basescan.org';
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

  // 숫자 포맷 유틸
  const unformatNumber = (v: string) => (v || '').replace(/,/g, '').replace(/[^0-9.]/g, '');
  const formatWithThousands = (raw: string) => {
    if (!raw) return '';
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
    const [intPart = '', decPart = ''] = cleaned.split('.');
    const intFormatted = intPart ? Number(intPart).toLocaleString() : '';
    if (cleaned.includes('.')) {
      const decMin4 = decPart.length < 4 ? decPart.padEnd(4, '0') : decPart;
      return `${intFormatted || '0'}.${decMin4}`;
    }
    return intFormatted;
  };

  const getCurrentPriceForSymbol = (base?: string): number => {
    try {
      const coinBase = base || (coin?.base || '').toUpperCase();
      const p = getCoinPriceByCurrency(coinBase, selectedCurrency as any);
      return typeof p === 'number' && isFinite(p) ? p : 0;
    } catch { return 0; }
  };

  const getCurrencySymbol = (code: string) => {
    if (code === 'KRW') return '₩';
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    if (code === 'JPY') return '¥';
    return code;
  };

  // 주문 취소 (market 탭과 동일 동작)
  const handleCancelOrderRow = async (orderId: string) => {
    try {
      if (!orderId) return;
      const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || (process.env.API_BASE_URL as string) || 'https://api-test.yooyland.com';
      const isDev = !process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL.includes('localhost');
      if (isDev) {
        await new Promise(r=>setTimeout(r,600));
        setCancelledMap(prev=>({ ...prev, [orderId]: true }));
        return;
      }
      if (!accessToken) { return; }
      const res = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, { method:'DELETE', headers:{ 'Authorization':`Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`취소 실패 ${res.status}`);
      setCancelledMap(prev=>({ ...prev, [orderId]: true }));
    } catch {}
  };

  // 임시 보유 자산 데이터
  const balances: Record<string, number> = useMemo(() => ({
    'USDT': 1000,
    'USDC': 500,
    'DAI': 200,
    'BUSD': 300,
    'YOY': 10000,
    'BTC': 0.1,
    'ETH': 2.5
  }), []);

  // 스테이블코인 판별
  const isStableCoin = useCallback((symbol: string) => symbol.toUpperCase() === 'USDT', []);

  // 대시보드와 동일한 키로 보유자산 로드
  useEffect(() => {
    const loadBalancesForUser = async () => {
      try {
        const email = (currentUser as any)?.email || 'user@example.com';
        const storageKey = `user_balances_${email}`;
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) {
          const data: Record<string, number> = JSON.parse(saved);
          setPaymentMethods(prev => prev.map(pm => ({ ...pm, amount: data[pm.coin] ?? pm.amount })));
        }
      } catch (e) {
        console.warn('보유자산 로드 실패:', e);
      }
    };
    loadBalancesForUser();
  }, [currentUser]);

  // 결제방식 탭에 따른 표시 데이터
  const displayPaymentMethods = useMemo(() => {
    if (activePaymentTab === 'yoy') {
      return paymentMethods.filter(m => m.coin.toUpperCase() === 'YOY');
    }
    if (activePaymentTab === 'stable') {
      // 스테이블 탭에서는 USDT만 표시
      return paymentMethods.filter(m => m.coin.toUpperCase() === 'USDT');
    }
    return paymentMethods;
  }, [activePaymentTab, paymentMethods]);

  // 스테이블코인 총 보유가치(선택통화 기준)
  const getStableTotalValueInSelected = useCallback(() => {
    const stableCoins = ['USDT', 'USDC', 'BUSD', 'DAI'];
    return stableCoins.reduce((sum, c) => {
      const price = getCoinPriceByCurrency(c, selectedCurrency) || 0;
      const amt = paymentMethods.find(m => m.coin.toUpperCase() === c)?.amount || 0;
      return sum + price * amt;
    }, 0);
  }, [paymentMethods, selectedCurrency, getCoinPriceByCurrency]);

  // 현재 입력(가격/수량)과 보유자산을 기준으로 해당 결제코인의 최대 비중(%) 계산 (5% 스냅)
  const computeMaxPct = useCallback((coin: string): number => {
    const priceVal = parseFloat(priceInputRaw) || 0; // 선택 통화 기준 가격
    const qtyVal = parseFloat(quantityInputRaw) || 0; // 수량
    const totalInSelected = priceVal * qtyVal;
    if (totalInSelected <= 0) return 100; // 총액이 없으면 제한 없음
    let availableValue = 0;
    if (isStableCoin(coin)) {
      availableValue = getStableTotalValueInSelected();
    } else {
      const coinPriceInSelected = getCoinPriceByCurrency(coin, selectedCurrency) || 0;
      if (coinPriceInSelected <= 0) return 100;
      const availableQty = paymentMethods.find(m => m.coin === coin)?.amount || 0;
      availableValue = availableQty * coinPriceInSelected;
    }
    const rawPct = (availableValue / totalInSelected) * 100;
    const snapped = Math.max(0, Math.min(100, Math.round(rawPct / 5) * 5));
    return snapped;
  }, [priceInputRaw, quantityInputRaw, selectedCurrency, paymentMethods, getCoinPriceByCurrency, getStableTotalValueInSelected]);

  // 결제 비중 합계 100% 유지
  const normalizePayments = useCallback((list: typeof paymentMethods, scope: typeof displayPaymentMethods) => {
    const scopeCoins = new Set(scope.map(s => s.coin));
    const scoped = list.filter(m => scopeCoins.has(m.coin));
    if (scoped.length === 0) return list;
    if (scoped.length === 1) {
      return list.map(m => scopeCoins.has(m.coin) ? { ...m, percentage: 100 } : m);
    }
    const sum = scoped.reduce((a, b) => a + b.percentage, 0);
    if (Math.abs(sum - 100) < 0.001) return list;
    return list.map(m => scopeCoins.has(m.coin) ? { ...m, percentage: (m.percentage / (sum || 1)) * 100 } : m);
  }, []);

  useEffect(() => {
    setPaymentMethods(prev => normalizePayments(prev, displayPaymentMethods));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePaymentTab]);

  const updatePaymentPercentage = useCallback((coin: string, targetPct: number) => {
    setPaymentMethods(prev => {
      const list = [...prev];
      const scope = displayPaymentMethods;
      const clamped = Math.max(0, Math.min(100, targetPct));
      const scopeCoins = scope.map(s => s.coin);
      if (scopeCoins.length === 1) {
        return list.map(m => scopeCoins.includes(m.coin) ? { ...m, percentage: 100 } : m);
      }
      if (scopeCoins.length === 2) {
        const otherCoin = scopeCoins.find(c => c !== coin)!;
        return list.map(m => {
          if (!scopeCoins.includes(m.coin)) return m;
          if (m.coin === coin) return { ...m, percentage: clamped };
          if (m.coin === otherCoin) return { ...m, percentage: 100 - clamped };
          return m;
        });
      }
      // 3개 이상인 경우: 나머지를 비례 배분
      const others = scope.filter(s => s.coin !== coin);
      const othersSum = others.reduce((a, b) => a + b.percentage, 0) || 1;
      return list.map(m => {
        if (!scopeCoins.includes(m.coin)) return m;
        if (m.coin === coin) return { ...m, percentage: clamped };
        const ratio = others.find(o => o.coin === m.coin)?.percentage ?? 0;
        const newPct = (100 - clamped) * (ratio / othersSum);
        return { ...m, percentage: newPct };
      });
    });
  }, [displayPaymentMethods]);

  // 화폐 옵션
  const currencyOptions = [
    { value: 'KRW', label: '₩', symbol: '₩', name: '원화' },
    { value: 'USD', label: '$', symbol: '$', name: '달러' },
    { value: 'USDT', label: 'USDT', symbol: 'USDT', name: '테더' },
    { value: 'USDC', label: 'USDC', symbol: 'USDC', name: 'USD 코인' },
    { value: 'BTC', label: 'BTC', symbol: 'BTC', name: '비트코인' },
    { value: 'ETH', label: 'ETH', symbol: 'ETH', name: '이더리움' },
  ];

  // 변동폭 옵션 (중앙 0 유지, 위는 +, 아래는 -)
  const varianceOptions = [
    { value: 20, label: '+20%', type: 'positive' },
    { value: 15, label: '+15%', type: 'positive' },
    { value: 10, label: '+10%', type: 'positive' },
    { value: 8,  label: '+8%',  type: 'positive' },
    { value: 5,  label: '+5%',  type: 'positive' },
    { value: 3,  label: '+3%',  type: 'positive' },
    { value: 2,  label: '+2%',  type: 'positive' },
    { value: 1,  label: '+1%',  type: 'positive' },
    { value: 0,  label: '±%',   type: 'neutral'  },
    { value: -1, label: '-1%',  type: 'negative' },
    { value: -2, label: '-2%',  type: 'negative' },
    { value: -3, label: '-3%',  type: 'negative' },
    { value: -5, label: '-5%',  type: 'negative' },
    { value: -8, label: '-8%',  type: 'negative' },
    { value: -10,label: '-10%', type: 'negative' },
    { value: -15,label: '-15%', type: 'negative' },
    { value: -20,label: '-20%', type: 'negative' },
  ];

  // 중앙화된 가격 관리 시스템 사용
  const getCoinPriceByMarket = (coinId: string, currency: string) => {
    return getCoinPriceByCurrency(coinId, currency);
  };

  // 실시간 가격 업데이트
  useEffect(() => {
    const loadRealTimePrices = async () => {
      try {
        await updateRealTimePrices();
        console.log('✅ 실시간 가격 업데이트 완료');
      } catch (error) {
        console.error('❌ 실시간 가격 업데이트 실패:', error);
      }
    };
    
    loadRealTimePrices();
    // 1분마다 가격 업데이트
    const interval = setInterval(loadRealTimePrices, 60000);
    return () => clearInterval(interval);
  }, []);

  // 업비트 마켓 데이터 가져오기
  useEffect(() => {
    const fetchUpbitMarkets = async () => {
      try {
        console.log('Fetching Upbit market data for navigation...');
        const markets = await getAllUpbitMarkets();
        setUpbitMarkets(markets);
        console.log('Upbit markets loaded for navigation:', {
          KRW: markets.KRW.length,
          USDT: markets.USDT.length,
          BTC: markets.BTC.length
        });
      } catch (error) {
        console.error('Failed to fetch Upbit markets for navigation:', error);
      }
    };

    fetchUpbitMarkets();
  }, []);

  // 호가창 동적 막대 길이 계산 함수
  const calculateBarWidth = (orderTotal: number, allOrders: any[], isBuy: boolean) => {
    // 누적호가량 정규화 (0-1 범위)
    const maxTotal = Math.max(...allOrders.map(o => o.total));
    const normalizedTotal = orderTotal / maxTotal;
    
    // 등락률 가중치 (상승시 매수 강조, 하락시 매도 강조)
    const change24h = coin?.change_24h || 0;
    const trendWeight = isBuy 
      ? (change24h >= 0 ? 1.2 : 0.8)  // 상승시 매수 막대 더 길게
      : (change24h >= 0 ? 0.8 : 1.2); // 하락시 매도 막대 더 길게
    
    // 최종 막대 길이 (0-100%)
    const finalWidth = Math.min(normalizedTotal * trendWeight * 100, 100);
    return Math.max(finalWidth, 5); // 최소 5% 보장
  };

  // 호가창 동적 투명도 계산 함수
  const calculateBarOpacity = (orderTotal: number, allOrders: any[], isBuy: boolean) => {
    const change24h = coin?.change_24h || 0;
    const baseOpacity = 0.3;
    
    // 등락률에 따른 투명도 조정
    if (isBuy) {
      return change24h >= 0 ? Math.min(baseOpacity + 0.4, 1) : Math.max(baseOpacity - 0.1, 0.2);
    } else {
      return change24h >= 0 ? Math.max(baseOpacity - 0.1, 0.2) : Math.min(baseOpacity + 0.4, 1);
    }
  };

  // 애니메이션된 막대 컴포넌트
  const AnimatedBar = ({ width, opacity, isBuy }: { width: number, opacity: number, isBuy: boolean }) => {
    const animatedWidth = useRef(new Animated.Value(width)).current;
    const animatedOpacity = useRef(new Animated.Value(opacity)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(animatedWidth, {
          toValue: width,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(animatedOpacity, {
          toValue: opacity,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();
    }, [width, opacity]);

    return (
      <Animated.View 
        style={[
          styles.binanceStrengthBar, 
          isBuy ? styles.binanceBuyStrengthBar : styles.binanceSellStrengthBar, 
          {
            width: animatedWidth.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
            opacity: animatedOpacity,
          }
        ]} 
      />
    );
  };

  // 최근 거래 상태 관리
  const [lastTrade, setLastTrade] = useState<{price: number, side: 'buy' | 'sell', timestamp: number} | null>(null);
  const [highlightedOrder, setHighlightedOrder] = useState<{price: number, side: 'buy' | 'sell'} | null>(null);

  // 최근 거래 시뮬레이션 (실제로는 WebSocket이나 API에서 받아야 함)
  useEffect(() => {
    const simulateTrade = () => {
      if (!coin?.price) return;
      
      const currentPrice = coin.price;
      const priceStep = currentPrice * 0.0001; // 0.01% 단계
      
      // 호가 데이터와 일치하는 가격으로 거래 시뮬레이션
      const randomOffset = Math.floor(Math.random() * 5) + 1; // 1-5 단계
      const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
      
      const priceOffset = randomOffset * priceStep;
      const tradePrice = side === 'buy' 
        ? currentPrice - priceOffset  // 매수는 현재가보다 낮은 가격
        : currentPrice + priceOffset; // 매도는 현재가보다 높은 가격
      
      const newTrade = {
        price: Math.round(tradePrice * 100) / 100,
        side,
        timestamp: Date.now()
      };
      
      setLastTrade(newTrade);
      setHighlightedOrder({ price: newTrade.price, side: newTrade.side });
      
      console.log('🔥 거래 시뮬레이션:', newTrade);
      
      // 3초 후 하이라이트 제거
      setTimeout(() => {
        setHighlightedOrder(null);
      }, 3000);
    };

    // 3-5초마다 랜덤 거래 발생 (더 자주)
    const interval = setInterval(simulateTrade, 3000 + Math.random() * 2000);
    
    return () => clearInterval(interval);
  }, [coin?.price]);

  // 동적 호가 데이터 생성 함수
  const generateOrderBookData = (currentPrice: number, isBuy: boolean) => {
    const orders = [];
    const baseAmount = 0.1; // 기본 수량
    const priceStep = currentPrice * 0.0001; // 가격 단계 (0.01%)
    
    for (let i = 0; i < 10; i++) {
      const priceOffset = (i + 1) * priceStep;
      const price = isBuy 
        ? currentPrice - priceOffset  // 매수는 현재가보다 낮은 가격
        : currentPrice + priceOffset; // 매도는 현재가보다 높은 가격
      
      const amount = baseAmount * (1 + Math.random() * 2); // 랜덤 수량
      const total = price * amount;
      
      orders.push({
        price: Math.round(price * 100) / 100, // 소수점 2자리
        amount: Math.round(amount * 100000) / 100000, // 소수점 5자리
        total: Math.round(total * 100) / 100, // 소수점 2자리
      });
    }
    
    return orders.sort((a, b) => isBuy ? b.price - a.price : a.price - b.price);
  };

  // 변동폭 추천 (24h 변화율 기반, 가장 가까운 구간 추천)
  useEffect(() => {
    const recommend = async () => {
      try {
        const marketId = String(id);
        const sym = getCoinSymbolFromMarket(marketId);
        if (!sym) return;
        // 기본은 USDT 마켓 심볼 시도 (예: BTC -> BTCUSDT)
        const symbolUSDT = `${sym}USDT`;
        if (sym === 'YOY') {
          // YOY는 바이낸스 심볼이 없으므로 기본 추천값 사용
          setRecommendedVariance(8);
          return;
        }
        const data = await fetchJsonWithProxy(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolUSDT}`);
        const change = parseFloat(data.priceChangePercent); // 24h %
        if (isNaN(change)) return;
        const buckets = [1, 2, 3, 5, 8, 10, 15, 20];
        // 가장 가까운 버킷 찾기
        const abs = Math.abs(change);
        let nearest = buckets[0];
        let minDiff = Math.abs(abs - buckets[0]);
        for (let i = 1; i < buckets.length; i++) {
          const d = Math.abs(abs - buckets[i]);
          if (d < minDiff) { minDiff = d; nearest = buckets[i]; }
        }
        const signed = change >= 0 ? nearest : -nearest;
        setRecommendedVariance(signed);
      } catch (e) {
        // 실패 시 기본 추천값 8%
        setRecommendedVariance(8);
      }
    };
    recommend();
  }, [id]);

  // 코인 데이터 로드
  useEffect(() => {
    // URL 파라미터에서 코인 정보 추출 (예: "USDT-YOY" -> base: "YOY", quote: "USDT")
    const marketId = String(id);
    const coinSymbol = getCoinSymbolFromMarket(marketId);
    
    // 마켓별 기본 화폐단위 설정
    const marketDefaultCurrency = getMarketDefaultCurrency(marketId);
    setSelectedCurrency(marketDefaultCurrency as any);
    
    const currentPrice = getCoinPriceByMarket(coinSymbol, marketDefaultCurrency);
    
    console.log('가격 로드 (Exchange 페이지 로직):', { 
      marketId, 
      coinSymbol, 
      marketDefaultCurrency, 
      currentPrice 
    });
    
    // 임시 코인 데이터
    const mockCoin = {
      id: marketId,
      base: coinSymbol,
      quote: marketId.split('-')[0] || 'USDT',
      korean_name: coinSymbol,
      price: currentPrice, // 선택된 마켓의 가격
      change_24h: 2.5,
      volume_24h: 1000000,
      market_cap: 1000000000,
      image: `https://static.upbit.com/logos/${coinSymbol.toUpperCase()}.png`
    };
    setCoin(mockCoin);
  }, [id]);

  // 실시간 티커 폴링: 마켓 기준 화폐로 현재가/등락률 반영
  useEffect(() => {
    let timer: any;
    const poll = async () => {
      try {
        const marketId = String(id || '').toUpperCase();
        const quote = marketId.includes('-') ? marketId.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
        const base = marketId.includes('-') ? marketId.split('-')[1] : (coin?.base || 'BTC');
        if (quote === 'USDT' || quote === 'USD') {
          if (base !== 'YOY') {
            const symbolUSDT = `${base}USDT`;
            try {
              const data = await fetchJsonWithProxy(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolUSDT}`);
              const last = parseFloat(data.lastPrice) || 0;
              const changePct = parseFloat(data.priceChangePercent) || 0;
              setCoin((prev:any)=> prev ? { ...prev, price: last, change_24h: changePct } : prev);
              return;
            } catch {}
          }
        }
        // KRW 등: 가격매니저 사용 (등락률은 0으로 유지)
        const last = getCoinPriceByMarket(base, quote as any) || 0;
        setCoin((prev:any)=> prev ? { ...prev, price: last } : prev);
      } catch {}
      finally { timer = setTimeout(poll, 5000); }
    };
    poll();
    return ()=> { if (timer) clearTimeout(timer); };
  }, [id, userPreferredCurrency, coin?.base]);

  // 코인 데이터가 로드된 후 가격 입력창 설정
  useEffect(() => {
    if (coin && coin.price > 0) {
      const marketId = String(id);
      const coinSymbol = getCoinSymbolFromMarket(marketId);
      
      const currentPrice = getCoinPriceByMarket(coinSymbol, selectedCurrency);
      setPriceInputRaw(currentPrice.toString());
      setPriceInput(formatPriceInput(currentPrice.toString()));
      console.log('코인 로드 후 가격 입력창 설정 (중앙화된 시스템):', { 
        marketId,
        coinSymbol, 
        selectedCurrency, 
        currentPrice, 
        formatted: formatPriceInput(currentPrice.toString()) 
      });
    }
  }, [coin, selectedCurrency]);

  // 코인 로고 가져오기
  const getCoinLogo = useCallback((symbol: string) => {
    // 로그는 항상 대문자 심볼을 보여 사용자가 혼동하지 않도록 함
    console.log('코인 로고 요청:', symbol.toUpperCase());
    
    // 안전한 이미지들만 사용
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
      console.log('로컬 이미지 사용:', symbol.toUpperCase());
      return safeImages[lowerSymbol];
    }
    
    const remoteUri = { uri: `https://static.upbit.com/logos/${symbol.toUpperCase()}.png` };
    console.log('원격 이미지 사용:', remoteUri.uri);
    return remoteUri;
  }, []);

  // 가격 포맷팅 함수
  const formatPriceInput = (value: string) => {
    if (!value || value === '') return '';
    
    let cleanValue = value.replace(/[^\d.]/g, '');
    const parts = cleanValue.split('.');
    if (parts.length > 2) {
      cleanValue = parts[0] + '.' + parts.slice(1).join('');
    }
    
    if (cleanValue.endsWith('.')) {
      const integerPart = cleanValue.slice(0, -1);
      if (integerPart === '') return '';
      const num = parseInt(integerPart);
      if (isNaN(num)) return '';
      return `${num.toLocaleString('ko-KR')}.`;
    }
    
    if (cleanValue.startsWith('.')) {
      return '0' + cleanValue;
    }
    
    const numValue = parseFloat(cleanValue);
    if (isNaN(numValue)) return '';
    
    const integerPart = Math.floor(numValue);
    const decimalPart = numValue - integerPart;
    
    if (decimalPart === 0) {
      return integerPart.toLocaleString('ko-KR');
    } else {
      const decimalStr = decimalPart.toString().substring(1);
      return `${integerPart.toLocaleString('ko-KR')}${decimalStr}`;
    }
  };

  // 수량 포맷팅 함수 (정수는 천단위, 소수는 원문 유지, '.1' -> '0.1')
  const formatQuantityInput = (value: string) => {
    if (!value || value === '') return '';

    // 숫자와 소수점만 허용, 공백 제거
    let cleanValue = value.replace(/[^\d.]/g, '');

    // 여러 개의 '.'가 있으면 첫 번째만 유지
    const firstDot = cleanValue.indexOf('.');
    if (firstDot !== -1) {
      const before = cleanValue.slice(0, firstDot + 1);
      const after = cleanValue.slice(firstDot + 1).replace(/\./g, '');
      cleanValue = before + after;
    }

    // '.1' 형태는 '0.1'로 교정
    if (cleanValue.startsWith('.')) cleanValue = '0' + cleanValue;

    // '123.' 처럼 끝이 점이면 정수부만 포맷하고 점 유지
    if (cleanValue.endsWith('.')) {
      const intRaw = cleanValue.slice(0, -1);
      const intNum = intRaw === '' ? 0 : parseInt(intRaw, 10);
      return `${intNum.toLocaleString('ko-KR')}.`;
    }

    // 정수/소수 분리 (소수부는 원문 유지, 최대 8자리)
    const [intRaw, decRaw = ''] = cleanValue.split('.');
    const intNum = intRaw === '' ? 0 : parseInt(intRaw, 10);
    const intFmt = intNum.toLocaleString('ko-KR');
    const decLimited = decRaw.slice(0, 8);

    return decLimited ? `${intFmt}.${decLimited}` : intFmt;
  };

  // 가격 입력값 변경 처리
  const handlePriceInputChange = (value: string) => {
    setPriceInputRaw(value);
    const formatted = formatPriceInput(value);
    setPriceInput(formatted);
  };

  // 변동폭 변경 처리
  const handleVarianceChange = (variance: number) => {
    const marketId = String(id);
    const coinSymbol = getCoinSymbolFromMarket(marketId);
    const currentPrice = getCoinPriceByMarket(coinSymbol, selectedCurrency);
    
    if (currentPrice && variance !== 0) {
      const varianceAmount = currentPrice * (variance / 100);
      const newPrice = currentPrice + varianceAmount;
      const formattedPrice = formatPriceInput(newPrice.toString());
      setPriceInput(formattedPrice);
      setPriceInputRaw(formattedPrice);
    } else if (variance === 0) {
      // ±% 선택 시 현재 시장가로 설정
      if (currentPrice) {
        const formattedPrice = formatPriceInput(currentPrice.toString());
        setPriceInput(formattedPrice);
        setPriceInputRaw(formattedPrice);
      }
    }
  };

  // 수량 입력값 변경 처리
  const handleQuantityInputChange = (value: string) => {
    setQuantityInputRaw(value);
    const formatted = formatQuantityInput(value);
    setQuantityInput(formatted);
  };

  // 변동폭 선택
  const selectVariance = (variance: number) => {
    const marketId = String(id);
    const coinSymbol = getCoinSymbolFromMarket(marketId);
    
    setPriceVariance(variance);
    setShowVariancePicker(false);
    // 선택된 마켓의 현재가 기준으로 변동폭 적용
    const currentPrice = getCoinPriceByMarket(coinSymbol, selectedCurrency);
    const newPrice = currentPrice * (1 + variance / 100);
    console.log('변동폭 선택 (중앙화된 시스템):', { marketId, coinSymbol, selectedCurrency, currentPrice, variance, newPrice });
    
    setPriceInputRaw(newPrice.toString());
    setPriceInput(formatPriceInput(newPrice.toString()));
  };

  // 변동폭 선택 (별칭)
  const handleVarianceSelect = selectVariance;

  // 화폐 선택
  const selectCurrency = (currency: 'USD' | 'KRW' | 'EUR' | 'JPY' | 'CNY' | 'USDT' | 'USDC' | 'BTC' | 'ETH') => {
    const marketId = String(id);
    const coinSymbol = getCoinSymbolFromMarket(marketId);
    
    setSelectedCurrency(currency as 'USD' | 'KRW' | 'EUR' | 'JPY' | 'CNY');
    setShowCurrencyPicker(false);
    AsyncStorage.setItem('preferredCurrency', currency);
    
    // 선택된 마켓의 현재가를 직접 가져와서 입력창에 적용
    const currentPrice = getCoinPriceByMarket(coinSymbol, currency);
    console.log('화폐 변경 (중앙화된 시스템):', { marketId, coinSymbol, currency, currentPrice });
    
    if (currentPrice > 0) {
      setPriceInputRaw(currentPrice.toString());
      setPriceInput(formatPriceInput(currentPrice.toString()));
      console.log('화폐 변경 후 가격 적용:', { currentPrice, formatted: formatPriceInput(currentPrice.toString()) });
    } else {
      console.log('화폐 변경 후 가격이 0입니다:', { marketId, coinSymbol, currency });
    }
  };

  // 호가 가격 클릭 처리
  const handleOrderBookPriceClick = (price: number, type: 'buy' | 'sell') => {
    if (!TRADING_UI_ENABLED) return;
    setSelectedTab('order');
    setOrderType(type);
    setPriceInputRaw(price.toString());
    setPriceInput(formatPriceInput(price.toString()));
  };

  // 새로고침 처리
  const handleRefresh = () => {
    const marketId = String(id);
    const coinSymbol = getCoinSymbolFromMarket(marketId);
    
    const basePrice = getCoinPriceByMarket(coinSymbol, selectedCurrency);
    const newPrice = basePrice + (Math.random() - 0.5) * (basePrice * 0.01); // 1% 범위 내에서 변동
    console.log('새로고침 (중앙화된 시스템):', { marketId, coinSymbol, selectedCurrency, basePrice, newPrice });
    
    const updatedCoin = { ...coin, price: newPrice };
    setCoin(updatedCoin);
    
    // 선택된 마켓의 현재가를 입력창에 적용
    setPriceInputRaw(newPrice.toString());
    setPriceInput(formatPriceInput(newPrice.toString()));
  };

  // 현재가 적용
  const handleCurrentPriceClick = () => {
    const marketId = String(id);
    const coinSymbol = getCoinSymbolFromMarket(marketId);
    
    const currentPrice = getCoinPriceByMarket(coinSymbol, selectedCurrency);
    console.log('현재가 클릭 (중앙화된 시스템):', { marketId, coinSymbol, selectedCurrency, currentPrice });
    
    if (currentPrice > 0) {
      setPriceInputRaw(currentPrice.toString());
      setPriceInput(formatPriceInput(currentPrice.toString()));
      console.log('현재가 적용됨:', { currentPrice, formatted: formatPriceInput(currentPrice.toString()) });
    } else {
      console.log('현재가가 0입니다:', { marketId, coinSymbol, selectedCurrency });
    }
  };

  // 수량 비율 적용
  const handleQuantityPercentage = (percentage: number) => {
    // 보유 수량의 비율만큼 수량 설정
    const availableAmount = 1000; // 임시 보유 수량
    const quantity = (availableAmount * percentage) / 100;
    setQuantityInputRaw(quantity.toString());
    setQuantityInput(quantity.toFixed(4));
  };

  // 총 주문 금액 계산
  const calculateTotalAmount = () => {
    const price = parseFloat(priceInputRaw) || 0;
    const quantity = parseFloat(quantityInputRaw) || 0;
    const total = price * quantity;
    return total > 0 ? `$${total.toLocaleString()}` : '$0';
  };

  // 주문 처리 함수
  const handleOrder = async () => {
    if (isOrdering) return;
    
    try {
      setIsOrdering(true);
      
      const price = parseFloat(priceInputRaw) || 0;
      const qty = parseFloat(quantityInputRaw) || 0;
      
      // 입력 검증
      if (price <= 0 || qty <= 0) {
        alert(t('pleaseEnterQuantityAndPrice', language));
        return;
      }
      
      // 결제 비중에 따라 결제코인별 사용수량 계산
      const legs = displayPaymentMethods.map(pm => {
        const coin = pm.coin.toUpperCase();
        const coinPrice = getCoinPriceByCurrency(coin, selectedCurrency) || 0;
        const legValue = (price * qty) * (pm.percentage / 100);
        const legQty = coinPrice > 0 ? legValue / coinPrice : 0;
        return { coin, useQty: legQty, legValue };
      });
      
      // 보유 초과 여부 확인 (스테이블 합산)
      const stableTotalValue = ['USDT','USDC','BUSD','DAI'].reduce((sum, c) => {
        const price = getCoinPriceByCurrency(c, selectedCurrency) || 0;
        const amt = paymentMethods.find(p => p.coin.toUpperCase() === c)?.amount || 0;
        return sum + price * amt;
      }, 0);
      const over = legs.find(l => {
        if (['USDT','USDC','BUSD','DAI'].includes(l.coin)) {
          return l.legValue > stableTotalValue + 1e-9;
        }
        return (paymentMethods.find(p => p.coin === l.coin)?.amount || 0) < l.useQty;
      });
      if (over) {
        alert(`${over.coin} 보유 수량이 부족합니다.`);
        return;
      }
      
      // 주문 데이터 준비
      const orderData = {
        marketId: String(id),
        symbol: coin?.base || 'BTC',
        side: orderType,
        type: 'LIMIT',
        price: price,
        quantity: qty,
        currency: selectedCurrency,
        paymentLegs: legs,
        timestamp: Date.now()
      };
      
      // 서버에 주문 전송
      const token = accessToken;
      if (!token) {
        alert(t('error', language));
        return;
      }
      
      const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || (process.env.API_BASE_URL as string) || 'https://api-test.yooyland.com';
      
      // 개발 환경에서 모의 주문 처리
      const isDevelopment = !process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL.includes('localhost');
      
      let orderResponse;
      
      if (isDevelopment) {
        // 모의 주문 응답 생성
        orderResponse = {
          id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'PENDING',
          ...orderData,
          timestamp: Date.now()
        };
        
        // 2초 후 체결 시뮬레이션
        setTimeout(async () => {
          const fillData = {
            status: 'FILLED',
            filledQuantity: orderData.quantity,
            filledAmount: orderData.price * orderData.quantity,
            paymentLegs: legs.map(leg => ({
              coin: leg.coin,
              usedAmount: leg.useQty,
              receivedAmount: leg.useQty
            }))
          };
          
          await updateBalancesAfterFill(fillData);
          setOrderResult((prev: any) => ({ ...prev, status: 'FILLED', fillData }));
        }, 2000);
        
      } else {
        // 실제 서버 호출
        const response = await fetch(`${API_BASE}/api/v1/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(orderData)
        });
        
        if (!response.ok) {
          let errorMessage = t('orderRejected', language);
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // JSON이 아닌 응답 (예: "Not found")
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        
        orderResponse = await response.json();
        
        // 실제 서버에서 폴링 시작
        pollOrderStatus(orderResponse.id);
      }
      setOrderResult(orderResponse);
      
      // 영수증 모달 표시
      setShowReceiptModal(true);
      
    } catch (error) {
      console.error('주문 처리 오류:', error);
      alert(`주문 처리 중 오류가 발생했습니다: ${(error as Error).message}`);
    } finally {
      setIsOrdering(false);
    }
  };
  
  // 주문 상태 폴링 (실제 서버용)
  const pollOrderStatus = async (orderId: string) => {
    const maxAttempts = 30; // 30초간 폴링
    let attempts = 0;
    
    const poll = async () => {
      try {
        const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || (process.env.API_BASE_URL as string) || 'https://api-test.yooyland.com';
        const statusResponse = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (statusResponse.ok) {
          let statusData;
          try {
            statusData = await statusResponse.json();
          } catch {
            // JSON이 아닌 응답 처리
            const errorText = await statusResponse.text();
            console.error('주문 상태 응답 오류:', errorText);
            return;
          }
          
          if (statusData.status === 'FILLED') {
            // 체결 완료 - 잔액 업데이트
            await updateBalancesAfterFill(statusData);
            setOrderResult((prev: any) => ({ ...prev, status: 'FILLED', fillData: statusData }));
            return;
          } else if (statusData.status === 'CANCELLED' || statusData.status === 'REJECTED') {
            // 주문 실패
            setOrderResult((prev: any) => ({ ...prev, status: statusData.status, error: statusData.reason }));
            return;
          }
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000); // 1초 후 재시도
        } else {
          // 타임아웃
          setOrderResult((prev: any) => ({ ...prev, status: 'PENDING' }));
        }
      } catch (error) {
        console.error('주문 상태 폴링 오류:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        }
      }
    };
    
    poll();
  };
  
  // 체결 후 잔액 업데이트
  const updateBalancesAfterFill = async (fillData: any) => {
    try {
      const email = (currentUser as any)?.email || 'user@example.com';
      const storageKey = `user_balances_${email}`;
      const saved = await AsyncStorage.getItem(storageKey);
      const data: Record<string, number> = saved ? JSON.parse(saved) : {};
      
      // 체결된 수량만큼 잔액 업데이트
      if (orderType === 'buy') {
        // 매수: 코인 잔액 증가, 결제코인 잔액 감소
        data[coin?.base || 'BTC'] = (data[coin?.base || 'BTC'] || 0) + fillData.filledQuantity;
        fillData.paymentLegs?.forEach((leg: any) => {
          data[leg.coin] = (data[leg.coin] || 0) - leg.usedAmount;
        });
      } else {
        // 매도: 코인 잔액 감소, 결제코인 잔액 증가
        data[coin?.base || 'BTC'] = (data[coin?.base || 'BTC'] || 0) - fillData.filledQuantity;
        fillData.paymentLegs?.forEach((leg: any) => {
          data[leg.coin] = (data[leg.coin] || 0) + leg.receivedAmount;
        });
      }
      
      await AsyncStorage.setItem(storageKey, JSON.stringify(data));
      
      // UI 업데이트
      setPaymentMethods(prev => prev.map(pm => ({ ...pm, amount: data[pm.coin] ?? pm.amount })));
      
    } catch (error) {
      console.error('잔액 업데이트 오류:', error);
    }
  };
  
  // 주문 취소
  const handleCancelOrder = async (orderId: string) => {
    try {
      const token = accessToken;
      if (!token) {
        alert(t('error', language));
        return;
      }
      
      const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || (process.env.API_BASE_URL as string) || 'https://api-test.yooyland.com';
      const isDevelopment = !process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL.includes('localhost');
      
      if (isDevelopment) {
        // 모의 취소 처리
        setOrderResult((prev: any) => ({ ...prev, status: 'CANCELLED' }));
        alert(t('orderCancelled', language));
      } else {
        // 실제 서버 호출
        const response = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          setOrderResult((prev: any) => ({ ...prev, status: 'CANCELLED' }));
          alert(t('orderCancelled', language));
        } else {
          let errorMessage = t('orderRejected', language);
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }
      }
    } catch (error) {
      console.error('주문 취소 오류:', error);
      alert(t('orderRejected', language));
    }
  };

  if (!coin) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.loadingText}>로딩 중...</ThemedText>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {/* 헤더 */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
            {/* 코인 네비게이션 그룹 */}
            <View style={styles.coinNavGroup}>
              <TouchableOpacity 
                style={styles.navButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  // 이전 코인으로 이동 (현재 탭 유지, 동일 마켓 내에서만)
                  const currentMarket = String(id || '');
                  const [quote, base] = currentMarket.split('-');
                  
                  // 관리되는 코인에서 마켓별 코인 리스트 가져오기
                  const currentCoins = getCoinsByMarket(quote).map(coin => coin.symbol);
                  const currentIndex = currentCoins.indexOf(base);
                  
                  if (currentIndex > 0) {
                    // 이전 코인으로 이동
                    const prevCoin = currentCoins[currentIndex - 1];
                    const prevMarket = `${quote}-${prevCoin}`;
                    const tabParam = selectedTab ? `?tab=${selectedTab}` : '';
                    router.push(`/market/${prevMarket}${tabParam}`);
                  } else if (currentIndex === 0) {
                    // 첫 번째 코인에서 마지막 코인으로 순환
                    const lastCoin = currentCoins[currentCoins.length - 1];
                    const lastMarket = `${quote}-${lastCoin}`;
                    const tabParam = selectedTab ? `?tab=${selectedTab}` : '';
                    router.push(`/market/${lastMarket}${tabParam}`);
                  }
                }}
              >
                <ThemedText style={styles.navButtonText}>←</ThemedText>
              </TouchableOpacity>
              
              <View style={styles.headerCenter}>
                {coin && (
                  <>
                    <Image source={getCoinLogo(coin.base)} style={styles.coinLogo} />
                    <View style={styles.coinInfo}>
                      <ThemedText style={styles.headerTitle}>
                        {getCoinDisplayName(coin.base, language === 'ko' ? 'ko' : 'en')}
                      </ThemedText>
                      <ThemedText style={styles.coinSymbolMarket}>{coin.base}/{coin.quote}</ThemedText>
                    </View>
                  </>
                )}
              </View>
              
              <TouchableOpacity 
                style={styles.navButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  // 다음 코인으로 이동 (현재 탭 유지, 동일 마켓 내에서만)
                  const currentMarket = String(id || '');
                  const [quote, base] = currentMarket.split('-');
                  
                  // 관리되는 코인에서 마켓별 코인 리스트 가져오기
                  const currentCoins = getCoinsByMarket(quote).map(coin => coin.symbol);
                  const currentIndex = currentCoins.indexOf(base);
                  
                  if (currentIndex < currentCoins.length - 1) {
                    // 다음 코인으로 이동
                    const nextCoin = currentCoins[currentIndex + 1];
                    const nextMarket = `${quote}-${nextCoin}`;
                    const tabParam = selectedTab ? `?tab=${selectedTab}` : '';
                    router.push(`/market/${nextMarket}${tabParam}`);
                  } else if (currentIndex === currentCoins.length - 1) {
                    // 마지막 코인에서 첫 번째 코인으로 순환
                    const firstCoin = currentCoins[0];
                    const firstMarket = `${quote}-${firstCoin}`;
                    const tabParam = selectedTab ? `?tab=${selectedTab}` : '';
                    router.push(`/market/${firstMarket}${tabParam}`);
                  }
                }}
              >
                <ThemedText style={styles.navButtonText}>→</ThemedText>
              </TouchableOpacity>
            </View>
            
            {/* 닫기 버튼 */}
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => router.back()}
            >
              <ThemedText style={styles.closeButtonText}>✕</ThemedText>
            </TouchableOpacity>
          </View>

          {/* 탭 메뉴 */}
          <View style={styles.tabs}>
            {['order', 'orderbook', 'chart', 'news', 'info', 'ai-analysis']
              .filter((t) => (TRADING_UI_ENABLED ? true : (t !== 'order' && t !== 'orderbook')))
              .map((tabName) => (
              <TouchableOpacity
                key={tabName}
                style={[styles.tab, selectedTab === tabName && styles.activeTab]}
                onPress={() => setSelectedTab(tabName)}
                >
                <ThemedText 
                  style={[styles.tabText, selectedTab === tabName && styles.activeTabText]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {tabName === 'order' ? t('tabOrder', language) :
                   tabName === 'orderbook' ? t('tabOrderbook', language) :
                   tabName === 'chart' ? t('tabChart', language) :
                   tabName === 'news' ? t('tabNews', language) :
                   tabName === 'info' ? t('tabInfo', language) :
                   tabName === 'ai-analysis' ? 'AI' : tabName}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* 주문 탭 - 새로운 구조 */}
          {TRADING_UI_ENABLED && selectedTab === 'order' && (
            <View style={styles.orderContainer}>
              {/* Buy | Sell */}
              <View style={styles.orderTypeContainer}>
                <TouchableOpacity
                  style={[styles.orderTypeButton, orderType === 'buy' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('buy')}
                >
                  <ThemedText style={[styles.orderTypeText, orderType === 'buy' && styles.orderTypeTextActive]}>{t('buy', language)}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderTypeButton, orderType === 'sell' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('sell')}
                >
                  <ThemedText style={[styles.orderTypeText, orderType === 'sell' && styles.orderTypeTextActive]}>{t('sell', language)}</ThemedText>
                </TouchableOpacity>
              </View>

              {/* Price Section */}
              <View style={styles.priceSection}>
                <View style={styles.priceHeader}>
                  <ThemedText style={styles.priceLabel}>{t('price', language)}</ThemedText>
                  <View style={styles.priceHeaderButtons}>
                    <TouchableOpacity
                      style={styles.headerButton}
                      onPress={() => {
                        setShowVariancePicker(!showVariancePicker);
                        if (!showVariancePicker) setShowCurrencyPicker(false);
                      }}
                    >
                      <ThemedText style={styles.headerButtonText}>
                        {priceVariance === 0 ? '±%' : 
                         priceVariance > 0 ? `+${priceVariance}%` : `${priceVariance}%`}
                      </ThemedText>
                      <ThemedText style={styles.dropdownIcon}>▼</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.headerButton}
                      onPress={() => {
                        setShowCurrencyPicker(!showCurrencyPicker);
                        if (!showCurrencyPicker) setShowVariancePicker(false);
                      }}
                    >
                      <ThemedText style={styles.headerButtonText}>
                        {currencyOptions.find(c => c.value === selectedCurrency)?.symbol}
                      </ThemedText>
                      <ThemedText style={styles.dropdownIcon}>▼</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.priceInputContainer}>
                  <ThemedText style={styles.currencySymbol}>
                    {currencyOptions.find(c => c.value === selectedCurrency)?.symbol}
                  </ThemedText>
                  <TextInput
                    style={styles.priceInputField}
                    value={priceInput}
                    onChangeText={handlePriceInputChange}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                  <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
                    <ThemedText style={styles.refreshIcon}>↻</ThemedText>
                  </TouchableOpacity>
                </View>
                
                {/* 변동폭 펼침 메뉴 */}
                <Modal
                  visible={showVariancePicker}
                  transparent={true}
                  animationType="fade"
                  onRequestClose={() => setShowVariancePicker(false)}
                >
                  <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowVariancePicker(false)}
                  >
                    <View style={styles.variancePicker} accessibilityRole="menu">
                      {varianceOptions.map((option, index) => (
                      <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.varianceOption,
                            priceVariance === option.value && styles.varianceOptionSelected,
                          index === 8 && styles.varianceOptionCenter, // 가운데 옵션 (0%)
                          recommendedVariance === option.value && styles.varianceOptionRecommended,
                          ]}
                          onPress={() => {
                            setPriceVariance(option.value);
                            setShowVariancePicker(false);
                            handleVarianceChange(option.value);
                          }}
                          accessibilityRole="menuitem"
                          accessibilityLabel={`${option.label} 선택`}
                        >
                          <ThemedText style={[
                            styles.varianceOptionText,
                            priceVariance === option.value && styles.varianceOptionTextSelected,
                            option.type === 'positive' && styles.varianceOptionTextPositive,
                            option.type === 'negative' && styles.varianceOptionTextNegative,
                            option.value === 0 && styles.varianceOptionTextNeutral,
                          ]}>
                            {option.label}
                          </ThemedText>
                          {index < varianceOptions.length - 1 && <View style={styles.varianceOptionDivider} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </TouchableOpacity>
                </Modal>
              </View>

              {/* Quantity Section */}
              <View style={styles.quantitySection}>
                <ThemedText style={styles.quantityLabel}>{t('quantity', language)}</ThemedText>
                <View style={styles.quantityInputRow}>
                  <TextInput
                    style={styles.quantityInputField}
                    value={quantityInput}
                    onChangeText={handleQuantityInputChange}
                    placeholder={t('enterOrderQty', language)}
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                  <ThemedText style={styles.quantityUnit}>{coin?.base || 'YOY'}</ThemedText>
                </View>
              </View>

              {/* Payment Method */}
              <View style={styles.paymentMethodHeader}>
                <ThemedText style={styles.paymentMethodLabel}>{t('paymentMethod', language)}</ThemedText>
                <View style={styles.paymentMethodTabs}>
                  <TouchableOpacity
                    style={[styles.paymentMethodTab, activePaymentTab === 'default' && styles.paymentMethodTabActive]}
                    onPress={() => setActivePaymentTab('default')}
                  >
                    <ThemedText style={[styles.paymentMethodTabText, activePaymentTab === 'default' && styles.paymentMethodTabTextActive]}>{t('default', language)}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paymentMethodTab, activePaymentTab === 'stable' && styles.paymentMethodTabActive]}
                    onPress={() => setActivePaymentTab('stable')}
                  >
                    <ThemedText style={[styles.paymentMethodTabText, activePaymentTab === 'stable' && styles.paymentMethodTabTextActive]}>{t('stablecoin', language)}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paymentMethodTab, activePaymentTab === 'yoy' && styles.paymentMethodTabActive]}
                    onPress={() => setActivePaymentTab('yoy')}
                  >
                    <ThemedText style={[styles.paymentMethodTabText, activePaymentTab === 'yoy' && styles.paymentMethodTabTextActive]}>YOY</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 결제 강도 표시한 그래프 포함한 결제코인 */}
              <View style={styles.paymentMethods}>
                {/* 기본 탭: 스테이블 코인 먼저(보유 0은 숨김), YOY는 맨 아래 */}
                {(activePaymentTab === 'default'
                  ? [
                      ...displayPaymentMethods.filter(m => isStableCoin(m.coin)).filter(m => (paymentMethods.find(p => p.coin === m.coin)?.amount || 0) > 0),
                      ...displayPaymentMethods.filter(m => m.coin.toUpperCase() === 'YOY')
                    ]
                  : displayPaymentMethods
                ).map((method, index) => {
                  // 사용 수량 = (가격 × 수량) × 비중 × (선택통화→결제코인 환산)
                  const priceVal = parseFloat(priceInputRaw) || 0; // selectedCurrency 기준 가격
                  const qtyVal = parseFloat(quantityInputRaw) || 0; // 코인 수량
                  const totalInSelected = priceVal * qtyVal; // 선택 통화 기준 총액
                  const coinPriceInSelected = getCoinPriceByCurrency(method.coin, selectedCurrency) || 0; // 결제코인 1개 가격(선택통화)
                  const rateSelectedToCoin = coinPriceInSelected > 0 ? (1 / coinPriceInSelected) : 0;
                  const useQty = totalInSelected * (method.percentage / 100) * rateSelectedToCoin;
                  const isOver = useQty > (method.amount || 0);
                  const useQtyText = (useQty > 0 ? useQty : 0).toLocaleString('ko-KR', { maximumFractionDigits: 4 });
                  // 보유 0이면 숨김 (스테이블/YOY 모두 해당)
                  const available = paymentMethods.find(m => m.coin === method.coin)?.amount || 0;
                  if (available <= 0 && isStableCoin(method.coin)) return null;
                  return (
                  <View key={index} style={styles.paymentMethod}>
                    <View style={styles.paymentMethodHeader}>
                      <ThemedText style={styles.paymentMethodCoin}>{method.coin}</ThemedText>
                      <View
                        onStartShouldSetResponder={() => true}
                        onResponderGrant={(e: any) => {
                          const x = e.nativeEvent.pageX ?? 0;
                          setGestureStartByCoin(prev => ({ ...prev, [method.coin]: { x, pct: method.percentage } }));
                        }}
                        onResponderMove={(e: any) => {
                          const start = gestureStartByCoin[method.coin];
                          if (!start) return;
                          const x = e.nativeEvent.pageX ?? 0;
                          const dx = x - start.x;
                          const barWidth = paymentBarWidthByCoin[method.coin] ?? 1;
                          const deltaPct = (dx / barWidth) * 100;
                          const raw = start.pct + deltaPct;
                          const snapped = Math.round(Math.max(0, Math.min(100, raw)) / 5) * 5;
                          updatePaymentPercentage(method.coin, snapped);
                        }}
                      >
                        <ThemedText style={styles.paymentMethodPercentage}>
                          {method.percentage}%
                        </ThemedText>
                      </View>
                    </View>
                    <View
                      style={styles.paymentMethodBar}
                      onLayout={(ev) => {
                        const w = ev.nativeEvent.layout.width;
                        setPaymentBarWidthByCoin(prev => ({ ...prev, [method.coin]: w }));
                      }}
                      onStartShouldSetResponder={() => true}
                      onResponderGrant={(e) => {
                        const x = (e.nativeEvent as any).pageX ?? 0;
                        setGestureStartByCoin(prev => ({ ...prev, [method.coin]: { x, pct: method.percentage } }));
                      }}
                      onResponderMove={(e) => {
                        const start = gestureStartByCoin[method.coin];
                        if (!start) return;
                        const x = (e.nativeEvent as any).pageX ?? 0;
                        const dx = x - start.x;
                        const barWidth = paymentBarWidthByCoin[method.coin] ?? 1;
                        const deltaPct = (dx / barWidth) * 100;
                        const raw = start.pct + deltaPct;
                        const snapped = Math.round(Math.max(0, Math.min(100, raw)) / 5) * 5; // 5% 스냅
                        updatePaymentPercentage(method.coin, snapped);
                      }}
                    >
                      <View style={[styles.paymentMethodBarFill, { width: `${method.percentage}%`, backgroundColor: isOver ? '#FF6B6B' : '#F0B90B' }]} />
                      {isOver && (
                        <TouchableOpacity
                          style={styles.paymentMaxBadge}
                          onPress={() => updatePaymentPercentage(method.coin, computeMaxPct(method.coin))}
                        >
                          <ThemedText style={styles.paymentMaxBadgeText}>최대</ThemedText>
                        </TouchableOpacity>
                      )}
                      {/* 드래그 핸들 */}
                      <View
                        style={[styles.paymentHandle, { left: `${method.percentage}%`, backgroundColor: isOver ? '#FF6B6B' : '#D4AF37' }]}
                        onStartShouldSetResponder={() => true}
                        onResponderMove={(e) => {
                          const locationX = (e.nativeEvent as any).locationX ?? 0;
                          const barWidth = paymentBarWidthByCoin[method.coin] ?? 1;
                          const raw = Math.max(0, Math.min(100, (locationX / barWidth) * 100));
                          const snapped = Math.round(raw / 5) * 5; // 5% 스냅
                          updatePaymentPercentage(method.coin, snapped);
                        }}
                      />
                    </View>
                    <View style={styles.paymentAmountsRow}>
                      <ThemedText style={[styles.paymentAmountUse, isOver && { color: '#FF6B6B' }]}>
                        {t('used', language)}: {useQtyText} {method.coin}
                      </ThemedText>
                      <ThemedText style={styles.paymentAmountOwn}>
                        {t('available2', language)}: {Math.floor(method.amount).toLocaleString()} {method.coin}
                      </ThemedText>
                    </View>
                  </View>
                )})}
              </View>

              {/* Payment Amount */}
              <View style={styles.paymentAmountContainer}>
                <ThemedText style={styles.paymentAmountLabel}>{t('paymentAmount', language)}</ThemedText>
                <ThemedText style={styles.paymentAmountValue}>
                  {calculateTotalAmount()}
                </ThemedText>
              </View>

              {/* Order Button */}
              <TouchableOpacity
                style={[
                  styles.orderButton, 
                  orderType === 'buy' ? styles.buyButton : styles.sellButton,
                  isOrdering && styles.orderButtonDisabled
                ]}
                onPress={handleOrder}
                disabled={isOrdering}
              >
                <ThemedText style={styles.orderButtonText}>
                  {isOrdering ? t('processing', language) : (orderType === 'buy' ? t('placeBuy', language) : t('placeSell', language))}
                </ThemedText>
              </TouchableOpacity>

                {/* 화폐 선택 드롭다운 */}
                {showCurrencyPicker && (
                  <View style={styles.currencyPicker} accessibilityRole="menu">
                    {currencyOptions.map((currency, index) => (
                      <TouchableOpacity
                        key={currency.value}
                        style={[
                          styles.currencyOption,
                          selectedCurrency === currency.value && styles.currencyOptionSelected
                        ]}
                        onPress={() => selectCurrency(currency.value as any)}
                        accessibilityRole="menuitem"
                        accessibilityLabel={`${currency.symbol} ${currency.name} 선택`}
                      >
                        <ThemedText style={[
                          styles.currencyOptionText,
                          selectedCurrency === currency.value && styles.currencyOptionTextSelected
                        ]}>
                          {currency.symbol} {currency.name}
                        </ThemedText>
                        {index < currencyOptions.length - 1 && <View style={styles.currencyOptionDivider} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
            </View>
          )}

          {/* 주문내역 탭 제거: /market/[id]에서는 상단 탭에서 '주문'을 기본으로 사용 */}

          {/* 호가 탭 - trading UI (iOS에서는 숨김) */}
          {TRADING_UI_ENABLED && selectedTab === 'orderbook' && (
            <View style={styles.binanceOrderBookContainer}>
                {/* 상단 텍스트 탭들 */}
                <View style={styles.orderBookTabs}>
                  <TouchableOpacity 
                    style={[styles.orderBookTab, selectedOrderBookView === 'full' && styles.orderBookTabActive]}
                    onPress={() => setSelectedOrderBookView('full')}
                  >
                    <ThemedText style={[styles.orderBookTabText, selectedOrderBookView === 'full' && styles.orderBookTabTextActive]}>{t('tabOrderbook', language)}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.orderBookTab, selectedOrderBookView === 'buy' && styles.orderBookTabActive]}
                    onPress={() => setSelectedOrderBookView('buy')}
                  >
                    <ThemedText style={[styles.orderBookTabText, selectedOrderBookView === 'buy' && styles.orderBookTabTextActive]}>{t('buyOrders', language)}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.orderBookTab, selectedOrderBookView === 'sell' && styles.orderBookTabActive]}
                    onPress={() => setSelectedOrderBookView('sell')}
                  >
                    <ThemedText style={[styles.orderBookTabText, selectedOrderBookView === 'sell' && styles.orderBookTabTextActive]}>{t('sellOrders', language)}</ThemedText>
                  </TouchableOpacity>
                </View>


              {/* 호가 헤더 */}
              <View style={styles.binanceOrderBookHeader}>
                {(() => {
                  const market = (coin?.market || String(id || '')).toUpperCase();
                  const [quote = 'USDT'] = market.includes('-') ? [market.split('-')[0]] : [getMarketDefaultCurrency(userPreferredCurrency)];
                  const base = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
                  const priceLabel = `Price (${quote})`;
                  const amountLabel = `Amount (${base})`;
                  return (
                    <>
                      <ThemedText style={styles.binanceOrderBookHeaderText}>{priceLabel}</ThemedText>
                      <ThemedText style={styles.binanceOrderBookHeaderText}>{amountLabel}</ThemedText>
                      <ThemedText style={styles.binanceOrderBookHeaderText}>Total</ThemedText>
                    </>
                  );
                })()}
              </View>

              {/* 호가 내용 */}
              <View style={styles.binanceOrderBookContent}>
                {selectedOrderBookView === 'full' && (
                  <>
                    {/* 매도 호가 (위쪽) */}
                    <View style={styles.binanceSellOrders}>
                      {(() => {
                        const currentPrice = coin?.price || getCoinPriceByMarket(coin?.base || 'BTC', coin?.quote || 'KRW') || 100000;
                        const sellOrders = generateOrderBookData(currentPrice, false);
                        return sellOrders.map((order, index) => {
                          const barWidth = calculateBarWidth(order.total, sellOrders, false);
                          const barOpacity = calculateBarOpacity(order.total, sellOrders, false);
                          const isHighlighted = highlightedOrder && 
                            highlightedOrder.side === 'sell' && 
                            Math.abs(highlightedOrder.price - order.price) < 100; // 테스트용 관대한 조건
                          
                          if (isHighlighted) {
                            console.log('🔥 매도 호가 하이라이트:', { 
                              tradePrice: highlightedOrder.price, 
                              orderPrice: order.price, 
                              difference: Math.abs(highlightedOrder.price - order.price) 
                            });
                          }
                          
                          return (
                            <TouchableOpacity 
                              key={`sell-${order.price}`} 
                              style={styles.binanceOrderRow}
                              onPress={() => handleOrderBookPriceClick(order.price, 'sell')}
                            >
                              <ThemedText style={[styles.binanceOrderPrice, styles.binanceSellPrice]}>
                                {order.price.toFixed(2)}
                              </ThemedText>
                              <View style={[styles.binanceOrderAmountContainer, isHighlighted && styles.binanceOrderAmountHighlighted]}>
                                <ThemedText style={styles.binanceOrderAmount}>
                                  {order.amount.toFixed(5)}
                                </ThemedText>
                              </View>
                              <View style={styles.binanceOrderTotalContainer}>
                                <ThemedText style={styles.binanceOrderTotal}>
                                  {order.total > 1000 ? `${(order.total/1000).toFixed(2)}K` : order.total.toFixed(2)}
                                </ThemedText>
                                <AnimatedBar width={barWidth} opacity={barOpacity} isBuy={false} />
                              </View>
                            </TouchableOpacity>
                          );
                        });
                      })()}
                    </View>

                    {/* 현재가 (중앙) */}
                    <View style={styles.binanceCurrentPrice}>
                      {(() => {
                        const market = (coin?.market || String(id || '')).toUpperCase();
                        const quote = market.includes('-') ? market.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
                        const base = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
                        const last = coin?.price || getCoinPriceByMarket(base, quote as any) || 0;
                        const prev = coin?.change_24h ? last / (1 + coin.change_24h/100) : last;
                        const diff = last - prev;
                        const up = diff >= 0;
                        return (
                          <>
                            <ThemedText style={[styles.binanceCurrentPriceText, { color: up ? '#02C076' : '#F23645' }]}>{last.toLocaleString()}</ThemedText>
                            <ThemedText style={[styles.binanceCurrentPriceArrow, { color: up ? '#02C076' : '#F23645' }]}>{up ? '↑' : '↓'}</ThemedText>
                          </>
                        );
                      })()}
              {(() => {
                const market = (coin?.market || String(id || '')).toUpperCase();
                const quote = market.includes('-') ? market.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
                const coinSymbol = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
                const curr = coin?.price || getCoinPriceByMarket(coinSymbol, quote as any) || 0;
                return <ThemedText style={styles.binanceCurrentPriceDollar}>{getCurrencySymbol(quote)}{curr.toLocaleString()}</ThemedText>;
              })()}
                    </View>

                    {/* 매수 호가 (아래쪽) */}
                    <View style={styles.binanceBuyOrders}>
                      {(() => {
                        const currentPrice = coin?.price || getCoinPriceByMarket(coin?.base || 'BTC', coin?.quote || 'KRW') || 100000;
                        const buyOrders = generateOrderBookData(currentPrice, true);
                        return buyOrders.map((order, index) => {
                          const barWidth = calculateBarWidth(order.total, buyOrders, true);
                          const barOpacity = calculateBarOpacity(order.total, buyOrders, true);
                          const isHighlighted = highlightedOrder && 
                            highlightedOrder.side === 'buy' && 
                            Math.abs(highlightedOrder.price - order.price) < 100; // 테스트용 관대한 조건
                          
                          if (isHighlighted) {
                            console.log('🔥 매수 호가 하이라이트:', { 
                              tradePrice: highlightedOrder.price, 
                              orderPrice: order.price, 
                              difference: Math.abs(highlightedOrder.price - order.price) 
                            });
                          }
                          
                          return (
                            <TouchableOpacity 
                              key={`buy-${order.price}`} 
                              style={styles.binanceOrderRow}
                              onPress={() => handleOrderBookPriceClick(order.price, 'buy')}
                            >
                              <ThemedText style={[styles.binanceOrderPrice, styles.binanceBuyPrice]}>
                                {order.price.toFixed(2)}
                              </ThemedText>
                              <View style={[styles.binanceOrderAmountContainer, isHighlighted && styles.binanceOrderAmountHighlighted]}>
                                <ThemedText style={styles.binanceOrderAmount}>
                                  {order.amount.toFixed(5)}
                                </ThemedText>
                              </View>
                              <View style={styles.binanceOrderTotalContainer}>
                                <ThemedText style={styles.binanceOrderTotal}>
                                  {order.total > 1000 ? `${(order.total/1000).toFixed(2)}K` : order.total.toFixed(2)}
                                </ThemedText>
                                <AnimatedBar width={barWidth} opacity={barOpacity} isBuy={true} />
                              </View>
                            </TouchableOpacity>
                          );
                        });
                      })()}
                    </View>
                  </>
                )}

                {selectedOrderBookView === 'buy' && (
                  <>
                    {/* 현재가 (맨 위) */}
                    <View style={styles.binanceCurrentPrice}>
                      <ThemedText style={styles.binanceCurrentPriceText}>112,097.03</ThemedText>
                      <ThemedText style={styles.binanceCurrentPriceArrow}>↑</ThemedText>
              {(() => {
                const market = (coin?.market || String(id || '')).toUpperCase();
                const quote = market.includes('-') ? market.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
                const coinSymbol = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
                const curr = coin?.price || getCoinPriceByMarket(coinSymbol, quote as any) || 0;
                return <ThemedText style={styles.binanceCurrentPriceDollar}>{getCurrencySymbol(quote)}{curr.toLocaleString()}</ThemedText>;
              })()}
                    </View>

                    {/* 매수 호가만 (아래쪽) */}
                    <View style={styles.binanceBuyOrders}>
                      {(() => {
                        const currentPrice = coin?.price || getCoinPriceByMarket(coin?.base || 'BTC', coin?.quote || 'KRW') || 100000;
                        const buyOnlyOrders = generateOrderBookData(currentPrice, true);
                        return buyOnlyOrders.map((order, index) => {
                          const barWidth = calculateBarWidth(order.total, buyOnlyOrders, true);
                          const barOpacity = calculateBarOpacity(order.total, buyOnlyOrders, true);
                          const isTradeHighlighted = highlightedOrder && 
                            highlightedOrder.side === 'buy' && 
                            Math.abs(highlightedOrder.price - order.price) < 100; // 테스트용 관대한 조건
                          return (
                            <TouchableOpacity 
                              key={`buy-${order.price}`} 
                              style={styles.binanceOrderRow}
                              onPress={() => handleOrderBookPriceClick(order.price, 'buy')}
                            >
                              <ThemedText style={[styles.binanceOrderPrice, styles.binanceBuyPrice]}>
                                {order.price.toFixed(2)}
                              </ThemedText>
                              <View style={[styles.binanceOrderAmountContainer, isTradeHighlighted && styles.binanceOrderAmountHighlighted]}>
                                <ThemedText style={styles.binanceOrderAmount}>
                                  {order.amount.toFixed(5)}
                                </ThemedText>
                              </View>
                              <View style={styles.binanceOrderTotalContainer}>
                                <ThemedText style={styles.binanceOrderTotal}>
                                  {order.total > 1000 ? `${(order.total/1000).toFixed(2)}K` : order.total.toFixed(2)}
                                </ThemedText>
                                <AnimatedBar width={barWidth} opacity={barOpacity} isBuy={true} />
                              </View>
                            </TouchableOpacity>
                          );
                        });
                      })()}
                    </View>
                  </>
                )}

                {selectedOrderBookView === 'sell' && (
                  <>
                    {/* 매도 호가만 (위쪽) */}
                    <View style={styles.binanceSellOrders}>
                      {(() => {
                        const currentPrice = coin?.price || getCoinPriceByMarket(coin?.base || 'BTC', coin?.quote || 'KRW') || 100000;
                        const sellOnlyOrders = generateOrderBookData(currentPrice, false);
                        return sellOnlyOrders.map((order, index) => {
                          const barWidth = calculateBarWidth(order.total, sellOnlyOrders, false);
                          const barOpacity = calculateBarOpacity(order.total, sellOnlyOrders, false);
                          const isHighlighted = highlightedOrder && 
                            highlightedOrder.side === 'sell' && 
                            Math.abs(highlightedOrder.price - order.price) < 100; // 테스트용 관대한 조건
                          return (
                            <TouchableOpacity 
                              key={`sell-${order.price}`} 
                              style={styles.binanceOrderRow}
                              onPress={() => handleOrderBookPriceClick(order.price, 'sell')}
                            >
                              <ThemedText style={[styles.binanceOrderPrice, styles.binanceSellPrice]}>
                                {order.price.toFixed(2)}
                              </ThemedText>
                              <View style={[styles.binanceOrderAmountContainer, isHighlighted && styles.binanceOrderAmountHighlighted]}>
                                <ThemedText style={styles.binanceOrderAmount}>
                                  {order.amount.toFixed(5)}
                                </ThemedText>
                              </View>
                              <View style={styles.binanceOrderTotalContainer}>
                                <ThemedText style={styles.binanceOrderTotal}>
                                  {order.total > 1000 ? `${(order.total/1000).toFixed(2)}K` : order.total.toFixed(2)}
                                </ThemedText>
                                <AnimatedBar width={barWidth} opacity={barOpacity} isBuy={false} />
                              </View>
                            </TouchableOpacity>
                          );
                        });
                      })()}
                    </View>

                    {/* 현재가 (맨 아래) */}
                    <View style={styles.binanceCurrentPrice}>
                      <ThemedText style={styles.binanceCurrentPriceText}>112,099.99</ThemedText>
                      <ThemedText style={styles.binanceCurrentPriceArrow}>↓</ThemedText>
              {(() => {
                const market = (coin?.market || String(id || '')).toUpperCase();
                const quote = market.includes('-') ? market.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
                const coinSymbol = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
                const curr = coin?.price || getCoinPriceByMarket(coinSymbol, quote as any) || 0;
                return <ThemedText style={styles.binanceCurrentPriceDollar}>{getCurrencySymbol(quote)}{curr.toLocaleString()}</ThemedText>;
              })()}
                    </View>
                  </>
                )}
              </View>

              {/* 하단 강세 표시 */}
              <View style={styles.binanceMarketStrength}>
                <View style={styles.binanceBuyStrength}>
                  <ThemedText style={styles.binanceBuyStrengthText}>B 79.11%</ThemedText>
                  <View style={styles.binanceBuyStrengthBarIndicator} />
                </View>
                <View style={styles.binanceSellStrength}>
                  <View style={styles.binanceSellStrengthBarIndicator} />
                  <ThemedText style={styles.binanceSellStrengthText}>20.88% S</ThemedText>
                </View>
              </View>
            </View>
          )}

          {/* 차트 탭 */}
          {selectedTab === 'chart' && (
            <View style={styles.chartContainer}>
              {/* 시세 정보 헤더 */}
              <View style={styles.marketInfoHeader}>
                <View style={styles.marketPriceSection}>
                  <ThemedText style={styles.currentPriceLarge}>
                    {coin?.price ? coin.price.toLocaleString() : getCoinPriceByMarket(coin?.base || 'BTC', coin?.quote || 'KRW')?.toLocaleString() || '0'} {coin?.quote || 'KRW'}
                  </ThemedText>
                  <View style={styles.priceChangeRow}>
                    <ThemedText style={[
                      styles.priceChangeText,
                      { color: (coin?.change_24h || 0) >= 0 ? '#02C076' : '#F23645' }
                    ]}>
                      {(coin?.change_24h || 0) >= 0 ? '+' : ''}{(coin?.change_24h || 0).toFixed(2)}% 
                      {(coin?.change_24h || 0) >= 0 ? ' ▲' : ' ▼'} 
                      {coin?.price ? Math.abs(coin.price * (coin?.change_24h || 0) / 100).toLocaleString() : '0'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.miniChartContainer}>
                  <View style={styles.miniChart}>
                    {/* 미니 차트 - 간단한 추세 라인 */}
                    <View style={styles.miniChartLine} />
                  </View>
                </View>
              </View>
              
              {/* 시세 상세 정보 */}
              <View style={styles.marketDetails}>
                <View style={styles.marketDetailsColumnLeft}>
                  <View style={styles.marketDetailRow}>
                    <ThemedText style={styles.marketDetailLabel}>{t('high', language)}</ThemedText>
                    <ThemedText style={[styles.marketDetailValue, { color: '#02C076' }]}>
                      {coin?.price ? (coin.price * 1.02).toLocaleString() : '0'}
                    </ThemedText>
                  </View>
                  <View style={styles.marketDetailRow}>
                    <ThemedText style={styles.marketDetailLabel}>{t('low', language)}</ThemedText>
                    <ThemedText style={[styles.marketDetailValue, { color: '#F23645' }]}>
                      {coin?.price ? (coin.price * 0.98).toLocaleString() : '0'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.marketDetailsColumnRight}>
                  <View style={styles.marketDetailRow}>
                    <ThemedText style={styles.marketDetailLabel}>{t('volume24h', language)}</ThemedText>
                    <ThemedText style={styles.marketDetailValue}>
                      {coin?.base ? `${(Math.random() * 1000 + 1000).toFixed(3)} ${coin.base}` : '0 BTC'}
                    </ThemedText>
                  </View>
                  <View style={styles.marketDetailRow}>
                    <ThemedText style={styles.marketDetailLabel}>{t('tradeValue24h', language)}</ThemedText>
                    <ThemedText style={styles.marketDetailValue}>
                      {coin?.price ? (coin.price * Math.random() * 1000000).toLocaleString() : '0'} {coin?.quote || 'KRW'}
                    </ThemedText>
                  </View>
                </View>
              </View>
              
              <PriceChart
                coinSymbol={coin?.base || 'BTC'}
                baseCurrency={coin?.quote || 'KRW'}
                currentPrice={coin?.price || getCoinPriceByMarket(coin?.base || 'BTC', coin?.quote || 'KRW') || 0}
              />
            </View>
          )}

          {/* 뉴스 탭 */}
          {selectedTab === 'news' && (
            <NewsList coinSymbol={coin?.base || 'BTC'} />
          )}

          {/* 정보 탭 */}
          {selectedTab === 'info' && (
            <View style={styles.infoContainer}>
              {(() => {
                // 코인 기본 정보(간단 매핑) - 존재하지 않으면 일부 값은 '—'로 대체
                const market = (coin?.market || String(id || '')).toUpperCase();
                const quote = market.includes('-') ? market.split('-')[0] : getMarketDefaultCurrency(userPreferredCurrency);
                const base = market.includes('-') ? market.split('-')[1] : (coin?.base || 'BTC');
                const price = coin?.price || getCoinPriceByMarket(base, quote as any) || 0;
                const change24h = Number(coin?.change_24h || 0);
                
                const COIN_INFO: Record<string, any> = {
                  BTC: {
                    sector: 'Payment / Store of Value',
                    consensus: 'Proof of Work',
                    algorithm: 'SHA-256',
                    launch: '2009-01-03',
                    circulatingSupply: '19,7M+',
                    totalSupply: '—',
                    maxSupply: '21,000,000',
                    official: 'https://bitcoin.org',
                    whitepaper: 'https://bitcoin.org/bitcoin.pdf',
                    explorer: 'https://www.blockchain.com/explorer',
                    twitter: 'https://twitter.com/bitcoin',
                    about: {
                      en: 'Bitcoin is a decentralized digital currency without a central bank or single administrator.',
                      ko: '비트코인은 중앙 기관 없이 운영되는 탈중앙 디지털 자산이자 가치 저장 수단입니다.',
                      ja: 'ビットコインは中央管理者のいない分散型デジタル資産です。',
                      zh: '比特币是一种没有中央机构的去中心化数字资产。'
                    }
                  },
                  ETH: {
                    sector: 'Smart Contract Platform',
                    consensus: 'Proof of Stake',
                    algorithm: '—',
                    launch: '2015-07-30',
                    circulatingSupply: '120M+',
                    totalSupply: '—',
                    maxSupply: '—',
                    official: 'https://ethereum.org',
                    whitepaper: 'https://ethereum.org/en/whitepaper/',
                    explorer: 'https://etherscan.io',
                    twitter: 'https://twitter.com/ethereum',
                    about: {
                      en: 'Ethereum is a programmable blockchain for decentralized applications.',
                      ko: '이더리움은 탈중앙 애플리케이션을 위한 프로그래머블 블록체인입니다.',
                      ja: 'イーサリアムは分散型アプリケーションのためのプログラマブルなブロックチェーンです。',
                      zh: '以太坊是用于去中心化应用的可编程区块链。'
                    }
                  },
                  YOY: {
                    sector: 'Web3 Super App / Ecosystem',
                    consensus: '—',
                    algorithm: '—',
                    launch: '—',
                    circulatingSupply: '—',
                    totalSupply: '—',
                    maxSupply: '—',
                    official: 'https://yooyland.com/',
                    whitepaper: 'https://yooyland.com/wp-content/whitepaper.pdf',
                    explorer: '',
                    twitter: '',
                    about: {
                      en: 'YooY Land is a Web3 super app ecosystem integrating wallet, trading, chat and productivity.',
                      ko: 'YooY Land는 지갑, 거래, 채팅, 일정/메모 등을 통합한 Web3 슈퍼앱 생태계입니다.',
                      ja: 'YooY Landはウォレット・取引・チャット・生産性を統合するWeb3スーパーアプリです。',
                      zh: 'YooY Land 是集钱包、交易、聊天与效率于一体的 Web3 超级应用生态。'
                    }
                  }
                };
                const meta = COIN_INFO[base] || { about: { en: `${base} info.`, ko: `${base} 정보.`, ja: `${base} 情報。`, zh: `${base} 信息。` } };
                
                return (
                  <>
              {/* 개요 */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.sectionTitle}>{t('tabInfo', language)}</ThemedText>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>{t('pair', language) || 'Pair'}</ThemedText>
                        <ThemedText style={styles.infoVal}>{quote}/{base}</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>{t('price', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{getCurrencySymbol(quote)}{price.toLocaleString()}</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>24H</ThemedText>
                        <ThemedText style={[styles.infoVal, { color: change24h>=0?'#02C076':'#F23645' }]}>{change24h>=0?'+':''}{change24h.toFixed(2)}%</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>{t('high', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{(price * 1.02).toLocaleString()}</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>{t('low', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{(price * 0.98).toLocaleString()}</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>{t('volume24h', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{`${(Math.random() * 1000 + 1000).toFixed(3)} ${base}`}</ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <ThemedText style={styles.infoKey}>{t('marketCap', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>—</ThemedText>
                      </View>
              </View>
              
              {/* 토크노믹스 */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.sectionTitle}>{t('tokenomics', language) || 'Tokenomics'}</ThemedText>
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoKey}>{t('circulatingSupply', language) || 'Circulating Supply'}</ThemedText>
                  <ThemedText style={styles.infoVal}>{meta.circulatingSupply || '—'}</ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoKey}>{t('totalSupply', language) || 'Total Supply'}</ThemedText>
                  <ThemedText style={styles.infoVal}>{meta.totalSupply || '—'}</ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoKey}>{t('maxSupply', language) || 'Max Supply'}</ThemedText>
                  <ThemedText style={styles.infoVal}>{meta.maxSupply || '—'}</ThemedText>
                </View>
              </View>

              {/* 프로젝트 / 기술 */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.sectionTitle}>{t('project', language) || 'Project'}</ThemedText>
                <View style={styles.infoRow}><ThemedText style={styles.infoKey}>{t('sector', language) || 'Sector'}</ThemedText><ThemedText style={styles.infoVal}>{meta.sector || '—'}</ThemedText></View>
                <View style={styles.infoRow}><ThemedText style={styles.infoKey}>{t('consensus', language) || 'Consensus'}</ThemedText><ThemedText style={styles.infoVal}>{meta.consensus || '—'}</ThemedText></View>
                <View style={styles.infoRow}><ThemedText style={styles.infoKey}>{t('algorithm', language) || 'Algorithm'}</ThemedText><ThemedText style={styles.infoVal}>{meta.algorithm || '—'}</ThemedText></View>
                <View style={styles.infoRow}><ThemedText style={styles.infoKey}>{t('launch', language) || 'Launch'}</ThemedText><ThemedText style={styles.infoVal}>{meta.launch || '—'}</ThemedText></View>
              </View>

              {/* 링크 */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.sectionTitle}>{t('website', language)}</ThemedText>
                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 }}>
                  {(() => {
                    const baseSym = (coin?.base || (String(id||'').toUpperCase().split('-')[1] || 'BTC'));
                    const links = [
                      ...(meta.official ? [{ label: t('website', language), url: meta.official }] : []),
                      ...(meta.whitepaper ? [{ label: 'Whitepaper', url: meta.whitepaper }] : []),
                      ...(meta.explorer ? [{ label: 'Explorer', url: meta.explorer }] : []),
                      ...(meta.twitter ? [{ label: 'Twitter', url: meta.twitter }] : []),
                      { label: 'CoinMarketCap', url: `https://coinmarketcap.com/currencies/${String(baseSym).toLowerCase()}/` },
                      { label: 'CoinGecko', url: `https://www.coingecko.com/en/coins/${String(baseSym).toLowerCase()}` },
                    ];
                    return links.map(l => {
                      const disabled = !l.url;
                      return (
                        <TouchableOpacity
                          key={l.label}
                          disabled={disabled}
                          onPress={() => { try { if (l.url) Linking.openURL(l.url); } catch {} }}
                          style={[styles.linkChip, disabled && { opacity: 0.4 }]}
                        >
                          <ThemedText style={styles.linkChipText}>{l.label}</ThemedText>
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </View>
              </View>
              
              {/* 소개 */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.sectionTitle}>{t('about', language)}</ThemedText>
                <ThemedText style={styles.infoAbout}>
                  {meta.about?.[language as any] || meta.about?.en}
                </ThemedText>
              </View>
                  </>
                );
              })()}
            </View>
          )}

          {/* AI 분석 탭 */}
          {selectedTab === 'ai-analysis' && (
            <View style={styles.aiContainer}>
              <View style={styles.aiCard}>
                <ThemedText style={styles.sectionTitle}>{t('aiAnalysis', language)}</ThemedText>
                {(() => {
                  const change = Number(coin?.change_24h || 0);
                  const abs = Math.abs(change);
                  const momentum = change > 0 ? 'Bullish' : change < 0 ? 'Bearish' : 'Neutral';
                  const volatility = abs > 5 ? 'High' : abs > 2 ? 'Medium' : 'Low';
                  const signal = change > 1.5 ? t('buy', language) : change < -1.5 ? t('sell', language) : (t('hold', language) || 'Hold');
                  const risk = abs > 5 ? 'High' : abs > 2 ? 'Medium' : 'Low';
                  return (
                    <>
                      <View style={styles.aiRow}>
                        <ThemedText style={styles.infoKey}>{t('signal', language)}</ThemedText>
                        <ThemedText style={[styles.infoVal, { color: signal === t('buy', language) ? '#02C076' : signal === t('sell', language) ? '#F23645' : '#FFD700' }]}>{signal}</ThemedText>
                      </View>
                      <View style={styles.aiRow}>
                        <ThemedText style={styles.infoKey}>{t('momentum', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{momentum} ({change >= 0 ? '+' : ''}{change.toFixed(2)}%)</ThemedText>
                      </View>
                      <View style={styles.aiRow}>
                        <ThemedText style={styles.infoKey}>{t('volatility', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{volatility}</ThemedText>
                      </View>
                      <View style={styles.aiRow}>
                        <ThemedText style={styles.infoKey}>{t('risk', language)}</ThemedText>
                        <ThemedText style={styles.infoVal}>{risk}</ThemedText>
                      </View>
                      <ThemedText style={styles.aiNote}>{t('disclaimer', language)}</ThemedText>
                    </>
                  );
                })()}
              </View>

              {/* AI 질문/답변 */}
              <View style={styles.aiQAContainer}>
                <ThemedText style={styles.sectionTitle}>{t('askAI', language)}</ThemedText>
                <View style={styles.aiQAList}>
                  {aiQAs.length === 0 ? (
                    <ThemedText style={styles.aiQAPlaceholder}>{t('typeYourQuestion', language)}</ThemedText>
                  ) : (
                    aiQAs.map(m => (
                      <View key={m.id} style={[styles.aiQAMessage, m.role==='user'?styles.aiQAMessageUser:styles.aiQAMessageAi]}>
                        <ThemedText style={styles.aiQAMessageAuthor}>{m.role==='user'?t('you', language):t('aiAssistant', language)}</ThemedText>
                        <ThemedText style={styles.aiQAMessageText}>{m.text}</ThemedText>
                      </View>
                    ))
                  )}
                </View>
                <View style={styles.aiInputRow}>
                  <TextInput
                    style={styles.aiInput}
                    placeholder={t('typeYourQuestion', language) as any}
                    placeholderTextColor="#6B7280"
                    value={aiInput}
                    onChangeText={setAiInput}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.aiSendBtn, !aiInput.trim() && { opacity: 0.5 }]}
                    disabled={!aiInput.trim()}
                    onPress={() => {
                      const q = aiInput.trim();
                      if (!q) return;
                      const idQ = String(Date.now());
                      setAiQAs(list => [...list, { id: idQ+'q', role:'user', text: q }]);
                      setAiInput('');
                      // LLM 연동 또는 폴백 답변
                      fetchLLMAnswer(q)
                        .then(ans => setAiQAs(list => [...list, { id: idQ+'a', role:'assistant', text: ans }]))
                        .catch(() => setAiQAs(list => [...list, { id: idQ+'a', role:'assistant', text: t('thinking', language) || 'Thinking...' }]));
                    }}
                  >
                    <ThemedText style={styles.aiSendBtnText}>{t('send', language)}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 다른 탭들 */}
          {selectedTab !== 'order' && selectedTab !== 'orderbook' && selectedTab !== 'chart' && selectedTab !== 'news' && selectedTab !== 'info' && selectedTab !== 'ai-analysis' && (
            <View style={styles.placeholderContainer}>
              <ThemedText style={styles.placeholderText}>{selectedTab} {t('tabLabel', language)}</ThemedText>
              <ThemedText style={styles.placeholderSubtext}>{t('comingSoon', language)}</ThemedText>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 주문내역 행 상세 모달 */}
      {selectedOrderRow && (
        <Modal visible={showOrderRowModal} transparent animationType="slide" onRequestClose={()=>setShowOrderRowModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.receiptModal, { marginTop: 'auto', borderTopLeftRadius:16, borderTopRightRadius:16 }] }>
              <View style={styles.receiptHeader}>
                <ThemedText style={styles.receiptTitle}>{t('details', language)}</ThemedText>
                <TouchableOpacity onPress={()=>setShowOrderRowModal(false)}><ThemedText style={styles.receiptCloseText}>×</ThemedText></TouchableOpacity>
              </View>
              <View style={{ padding: 12 }}>
                <ThemedText style={{ color:'#FFD700', fontWeight:'800', marginBottom: 8 }}>{selectedOrderRow.symbol}</ThemedText>
                <ThemedText style={{ color:'#AAA' }}>{t('time', language)}: {new Date(selectedOrderRow.timestamp).toLocaleString()}</ThemedText>
                <ThemedText style={{ color:selectedOrderRow.side==='buy'?'#02C076':'#F23645' }}>{t('type', language)}: {selectedOrderRow.side==='buy'?t('buy', language):t('sell', language)}</ThemedText>
                <ThemedText style={{ color:'#AAA' }}>{t('price', language)}: {selectedOrderRow.price.toLocaleString()}</ThemedText>
                <ThemedText style={{ color:'#AAA' }}>{t('quantity', language)}: {selectedOrderRow.quantity.toFixed(4)}</ThemedText>
                <ThemedText style={{ color:selectedOrderRow.status==='FILLED'?'#02C076':selectedOrderRow.status==='PENDING'?'#FFD54F':'#F23645' }}>{t('status', language)}: {selectedOrderRow.status==='FILLED'?t('orderFilled', language):selectedOrderRow.status==='PENDING'?t('orderAccepted', language):t('orderCancelled', language)}</ThemedText>
                {/* 블록체인 정보 */}
                {!!selectedOrderRow.txHash && (
                  <TouchableOpacity onPress={()=>{ try{ const { Linking } = require('react-native'); const url = buildExplorerTxUrl(selectedOrderRow.network, selectedOrderRow.txHash, isTestnetEnv); if(url) Linking.openURL(url);}catch{}}}>
                    <ThemedText style={{ color:'#4DA6FF', textDecorationLine:'underline', marginTop:8 }} numberOfLines={1} ellipsizeMode='middle'>Tx: {selectedOrderRow.txHash}</ThemedText>
                  </TouchableOpacity>
                )}
                {!!selectedOrderRow.blockNumber && (
                  <TouchableOpacity onPress={()=>{ try{ const { Linking } = require('react-native'); const url = buildExplorerBlockUrl(selectedOrderRow.network, selectedOrderRow.blockNumber, isTestnetEnv); if(url) Linking.openURL(url);}catch{}}}>
                    <ThemedText style={{ color:'#4DA6FF', textDecorationLine:'underline', marginTop:4 }}>블록: {String(selectedOrderRow.blockNumber)}</ThemedText>
                  </TouchableOpacity>
                )}
                {!!selectedOrderRow.from && (
                  <TouchableOpacity onPress={()=>{ try{ const { Linking } = require('react-native'); const url = buildExplorerAddressUrl(selectedOrderRow.network, selectedOrderRow.from, isTestnetEnv); if(url) Linking.openURL(url);}catch{}}}>
                    <ThemedText style={{ color:'#4DA6FF', textDecorationLine:'underline', marginTop:4 }} numberOfLines={1} ellipsizeMode='middle'>From: {selectedOrderRow.from}</ThemedText>
                  </TouchableOpacity>
                )}
                {!!selectedOrderRow.to && (
                  <TouchableOpacity onPress={()=>{ try{ const { Linking } = require('react-native'); const url = buildExplorerAddressUrl(selectedOrderRow.network, selectedOrderRow.to, isTestnetEnv); if(url) Linking.openURL(url);}catch{}}}>
                    <ThemedText style={{ color:'#4DA6FF', textDecorationLine:'underline', marginTop:4 }} numberOfLines={1} ellipsizeMode='middle'>To: {selectedOrderRow.to}</ThemedText>
                  </TouchableOpacity>
                )}

                {/* 대기 상태 액션: 현재가로 정정 / 가격수정 후 재주문 */}
                {selectedOrderRow.status === 'PENDING' && (
                  <View style={{ marginTop: 12 }}>
                    <View style={{ height:1, backgroundColor:'#333', marginBottom: 10 }} />
                    {(() => {
                      const target = Number(selectedOrderRow.price) || 0;
                      const curr = getCurrentPriceForSymbol(selectedOrderRow.symbol?.split('-')[1]);
                      const diff = target - curr;
                      const quote = selectedCurrency;
                      const sym = getCurrencySymbol(quote);
                      return (
                        <>
                          <ThemedText style={{ color:'#CCC', textAlign:'center' }}>목표가: {sym} {target.toLocaleString()}  ·  현재가: {sym} {curr.toLocaleString()}</ThemedText>
                          <ThemedText style={{ color: diff<=0 ? '#02C076' : '#F23645', fontSize:16, fontWeight:'900', textAlign:'center', marginTop:4 }}>미도달가: {sym} {diff.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</ThemedText>
                        </>
                      );
                    })()}
                    <View style={{ height:1, backgroundColor:'#333', marginVertical: 10 }} />
                    {/* 입력 + 재주문 */}
                    <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                      <View style={{ flex:1, flexDirection:'row', alignItems:'center', backgroundColor:'#121212', borderWidth:1, borderColor:'#333', borderRadius:8, paddingHorizontal:10, paddingVertical:8 }}>
                        <ThemedText style={{ color:'#AAA', marginRight:6, fontWeight:'700' }}>{getCurrencySymbol(selectedCurrency)}</ThemedText>
                        <TextInput
                          style={{ flex:1, color:'#FFF', fontSize:14, padding:0 }}
                          keyboardType="numeric"
                          value={formatWithThousands(pendingReorderPrice)}
                          onChangeText={(t)=> setPendingReorderPrice(unformatNumber(t))}
                          placeholder={t('enterPrice', language)}
                          placeholderTextColor="#666"
                        />
                      </View>
                      <TouchableOpacity style={{ paddingVertical:10, paddingHorizontal:12, borderRadius:8, backgroundColor:'#FFD700', borderWidth:1, borderColor:'#FFD700' }}
                        onPress={()=>{
                          const v = Number(unformatNumber(pendingReorderPrice||''));
                          if (!v || !isFinite(v)) return;
                          setPriceInput(String(v));
                          setPriceInputRaw(String(v));
                          setQuantityInput(String(selectedOrderRow.quantity||''));
                          setQuantityInputRaw(String(selectedOrderRow.quantity||''));
                          setSelectedTab('order');
                          setShowOrderRowModal(false);
                        }}>
                        <ThemedText style={{ color:'#000', fontWeight:'800' }}>{t('reorder', language)}</ThemedText>
                      </TouchableOpacity>
                    </View>
                    {/* 현재가로 정정 */}
                    <TouchableOpacity style={{ marginTop:8, paddingVertical:10, paddingHorizontal:12, borderRadius:8, backgroundColor:'#FFD700', borderWidth:1, borderColor:'#FFD700', alignItems:'center' }}
                      onPress={()=>{
                        const newPrice = getCurrentPriceForSymbol(selectedOrderRow.symbol?.split('-')[1]) || selectedOrderRow.price;
                        setPriceInput(String(newPrice));
                        setPriceInputRaw(String(newPrice));
                        setQuantityInput(String(selectedOrderRow.quantity||''));
                        setQuantityInputRaw(String(selectedOrderRow.quantity||''));
                        setSelectedTab('order');
                        setShowOrderRowModal(false);
                      }}>
                      <ThemedText style={{ color:'#000', fontWeight:'800' }}>{t('price', language)} {t('processing', language)}</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 영수증 모달 */}
      {showReceiptModal && orderResult && (
        <Modal
          visible={showReceiptModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowReceiptModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.receiptModal}>
              <View style={styles.receiptHeader}>
                <ThemedText style={styles.receiptTitle}>
                  {orderResult.status === 'FILLED' ? t('orderFilled', language) : 
                   orderResult.status === 'CANCELLED' ? t('orderCancelled', language) :
                   orderResult.status === 'REJECTED' ? t('orderRejected', language) : t('orderAccepted', language)}
                </ThemedText>
                <TouchableOpacity 
                  style={styles.receiptCloseButton}
                  onPress={() => setShowReceiptModal(false)}
                >
                  <ThemedText style={styles.receiptCloseText}>✕</ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.receiptContent}>
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('orderId', language)}</ThemedText>
                  <ThemedText style={styles.receiptValue}>{orderResult.id}</ThemedText>
                </View>
                
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('coinMarket', language)}</ThemedText>
                  <ThemedText style={styles.receiptValue}>{coin?.base}/{coin?.quote}</ThemedText>
                </View>
                
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('orderType', language)}</ThemedText>
                  <ThemedText style={[styles.receiptValue, orderType === 'buy' ? styles.buyText : styles.sellText]}>
                    {orderType === 'buy' ? t('buy', language) : t('sell', language)}
                  </ThemedText>
                </View>
                
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('price', language)}</ThemedText>
                  <ThemedText style={styles.receiptValue}>
                    {parseFloat(priceInputRaw).toLocaleString()} {selectedCurrency}
                  </ThemedText>
                </View>
                
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('quantity', language)}</ThemedText>
                  <ThemedText style={styles.receiptValue}>
                    {parseFloat(quantityInputRaw).toFixed(4)} {coin?.base}
                  </ThemedText>
                </View>
                
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('totalAmount', language)}</ThemedText>
                  <ThemedText style={styles.receiptValue}>
                    {(parseFloat(priceInputRaw) * parseFloat(quantityInputRaw)).toLocaleString()} {selectedCurrency}
                  </ThemedText>
                </View>

                {orderResult.status === 'FILLED' && orderResult.fillData && (
                  <>
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptLabel}>{t('filledQuantity', language)}</ThemedText>
                      <ThemedText style={styles.receiptValue}>
                        {orderResult.fillData.filledQuantity} {coin?.base}
                      </ThemedText>
                    </View>
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptLabel}>{t('filledAmount', language)}</ThemedText>
                      <ThemedText style={styles.receiptValue}>
                        {orderResult.fillData.filledAmount} {selectedCurrency}
                      </ThemedText>
                    </View>
                  </>
                )}

                {orderResult.status === 'REJECTED' && orderResult.error && (
                  <>
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptLabel}>{t('rejectReason', language)}</ThemedText>
                      <ThemedText style={[styles.receiptValue, styles.errorText]}>
                        {orderResult.error}
                      </ThemedText>
                    </View>
                  </>
                )}

                <View style={styles.receiptDivider} />
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptLabel}>{t('orderTime', language)}</ThemedText>
                  <ThemedText style={styles.receiptValue}>
                    {new Date(orderResult.timestamp || Date.now()).toLocaleString('ko-KR')}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.receiptActions}>
                {orderResult.status === 'PENDING' && (
                  <TouchableOpacity 
                    style={styles.cancelButton}
                    onPress={() => {
                      handleCancelOrder(orderResult.id);
                      setShowReceiptModal(false);
                    }}
                  >
                    <ThemedText style={styles.cancelButtonText}>{t('cancelOrder', language)}</ThemedText>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={styles.confirmButton}
                  onPress={() => setShowReceiptModal(false)}
                >
                  <ThemedText style={styles.confirmButtonText}>확인</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 50, // 하단바 높이만큼 패딩 추가
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  
  // 헤더 스타일
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  coinNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  navButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  coinLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  coinInfo: {
    flexShrink: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  coinSymbolMarket: {
    color: '#888',
    fontSize: 14,
  },
  headerRight: {
    alignItems: 'center',
  },

  // 탭 스타일
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
    marginTop: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#FFD700',
  },
  tabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  activeTabText: {
    color: '#FFD700',
    fontWeight: '600',
  },

  // Info tab
  infoContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  infoCard: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginBottom:12 },
  sectionTitle: { color:'#FFD700', fontSize:14, fontWeight:'800', marginBottom:8 },
  infoRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#1A1A1A' },
  infoKey: { color:'#9CA3AF', fontSize:12 },
  infoVal: { color:'#FFFFFF', fontSize:12, fontWeight:'600' },
  linkChip: { paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#0F0F0F' },
  linkChipText: { color:'#CFCFFF', fontSize:12 },
  infoAbout: { color:'#D1D5DB', fontSize:12, lineHeight:18 },

  // AI tab
  aiContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  aiCard: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12 },
  aiRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#1A1A1A' },
  aiNote: { color:'#9CA3AF', fontSize:11, marginTop:10 },
  aiQAContainer: { marginTop: 12, backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12 },
  aiQAList: { gap:8, marginBottom:8 },
  aiQAPlaceholder: { color:'#6B7280', fontSize:12 },
  aiQAMessage: { padding:8, borderRadius:8, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#1E1E1E' },
  aiQAMessageUser: { alignSelf:'flex-end', backgroundColor:'#151515', borderColor:'#2A2A2A' },
  aiQAMessageAi: { alignSelf:'flex-start' },
  aiQAMessageAuthor: { color:'#9CA3AF', fontSize:11, marginBottom:2 },
  aiQAMessageText: { color:'#E5E7EB', fontSize:12, lineHeight:18 },
  aiInputRow: { flexDirection:'row', alignItems:'flex-end', gap:8 },
  aiInput: { flex:1, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, paddingHorizontal:10, paddingVertical:10, minHeight:40, maxHeight:100 },
  aiSendBtn: { paddingHorizontal:14, paddingVertical:10, borderRadius:8, backgroundColor:'#FFD700' },
  aiSendBtnText: { color:'#000', fontWeight:'800' },

  // 주문내역 탭 스타일
  orderHistoryContainer: {
    padding: 16,
  },
  orderHistoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  orderHistorySubtitle: {
    fontSize: 14,
    color: '#999999',
    marginBottom: 20,
  },
  orderHistoryHeader: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  orderHistoryHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#CCCCCC',
    textAlign: 'center',
  },
  orderHistoryContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  orderHistoryEmptyText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 8,
    textAlign: 'center',
  },
  orderHistoryEmptySubtext: {
    fontSize: 14,
    color: '#444444',
    textAlign: 'center',
  },
  orderHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  orderHistoryCell: {
    color: '#EEE',
    flex: 1,
    fontSize: 12,
  },
  orderCancelMini: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#555',
    backgroundColor: '#333',
    borderRadius: 6,
    alignItems: 'center',
  },

  // 주문 탭 스타일
  orderContainer: {
    padding: 16,
  },
  priceSection: {
    marginBottom: 20,
    zIndex: 0, // 펼침메뉴보다 낮은 레이어
    elevation: 0, // Android에서 낮은 레이어
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  priceHeaderButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#404040',
    borderRadius: 6,
    gap: 4,
  },
  headerButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  dropdownIcon: {
    fontSize: 8,
    color: '#FFFFFF',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#404040',
  },
  priceInputField: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  refreshButton: {
    padding: 4,
    backgroundColor: 'transparent',
    borderRadius: 4,
    marginLeft: 8,
  },
  refreshIcon: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  // 변동폭 펼침 메뉴 스타일 (Modal 내부)
  variancePicker: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4AF37',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  varianceOption: {
    paddingVertical: 10, // 세로 간격 축소
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  varianceOptionCenter: {
    backgroundColor: '#2A2A2A',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: '#D4AF37',
    borderBottomColor: '#D4AF37',
  },
  varianceOptionRecommended: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: '#D4AF37',
    borderBottomColor: '#D4AF37',
  },
  varianceOptionDivider: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: '#404040',
  },
  varianceOptionSelected: {
    backgroundColor: '#D4AF37',
  },
  varianceOptionText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center', // 가운데 정렬
    letterSpacing: 4, // 자간 4px (+/− 동일 적용)
  },
  varianceOptionTextSelected: {
    color: '#000000',
    fontWeight: 'bold',
  },
  varianceOptionTextPositive: {
    color: '#D4AF37',
  },
  varianceOptionTextNegative: {
    color: '#FF6B6B',
  },
  varianceOptionTextNeutral: {
    color: '#FFFFFF',
    fontWeight: '600'
  },
  varianceOptionTextRecommended: {
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  currencySymbol: {
    fontSize: 16,
    color: '#CCCCCC',
    marginRight: 8,
  },
  quantitySection: {
    marginBottom: 20,
    zIndex: 0, // 펼침메뉴보다 낮은 레이어
    elevation: 0, // Android에서 낮은 레이어
  },
  quantityLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  quantityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#404040',
  },
  quantityInputField: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  quantityUnit: {
    fontSize: 16,
    color: '#CCCCCC',
    marginLeft: 8,
  },
  paymentMethodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 0, // 펼침메뉴보다 낮은 레이어
    elevation: 0, // Android에서 낮은 레이어
  },
  paymentMethodLabel: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  paymentMethodTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentMethodTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#404040',
  },
  paymentMethodTabActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#202020',
  },
  paymentMethodTabText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  paymentMethodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600'
  },
  paymentAmountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  paymentAmountLabel: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  paymentAmountValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  paymentMethods: {
    marginBottom: 20,
    zIndex: 0, // 펼침메뉴보다 낮은 레이어
    elevation: 0, // Android에서 낮은 레이어
  },
  paymentMethod: {
    marginBottom: 12,
  },
  paymentMethodCoin: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  paymentMethodPercentage: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  paymentMethodBar: {
    height: 4,
    backgroundColor: '#404040',
    borderRadius: 2,
    marginVertical: 8,
    position: 'relative',
  },
  paymentMethodBarFill: {
    height: '100%',
    backgroundColor: '#F0B90B',
    borderRadius: 2,
  },
  paymentHandle: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: '#D4AF37',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  },
  paymentMaxBadge: {
    position: 'absolute',
    right: -4,
    top: -22,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  paymentMaxBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700'
  },
  paymentMethodAmount: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  paymentAmountsRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentAmountUse: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  paymentAmountOwn: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  currencyPicker: {
    position: 'absolute',
    top: 200, // 다른 UI 요소들과 겹치지 않도록 아래로 이동
    right: 20, // 오른쪽 버튼 위치에 맞춤
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4AF37',
    minWidth: 200,
    zIndex: 9999999, // 최상위 레이어
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 99999, // 최상위 레이어
  },
  currencyOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  currencyOptionSelected: {
    backgroundColor: 'rgba(240, 185, 11, 0.1)',
  },
  currencyOptionText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  currencyOptionTextSelected: {
    color: '#02C076',
    fontWeight: '600',
  },
  currencyOptionDivider: {
    height: 1,
    backgroundColor: '#404040',
    marginHorizontal: 20,
  },
  currentPriceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  currentPriceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentPriceLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    marginRight: 8,
  },
  currentPriceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  varianceContainer: {
    marginBottom: 20,
  },
  varianceLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  varianceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  varianceButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#404040',
    alignItems: 'center',
  },
  varianceButtonActive: {
    backgroundColor: '#F0B90B',
    borderColor: '#F0B90B',
  },
  varianceButtonText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  varianceButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  currentPriceButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F0B90B',
    borderRadius: 6,
    alignItems: 'center',
  },
  currentPriceButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  quantityButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  quantityButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#404040',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 10,
    color: '#CCCCCC',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  orderTypeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#222',
    marginHorizontal: 4,
    borderRadius: 8,
  },
  orderTypeButtonActive: {
    backgroundColor: '#F0B90B',
  },
  orderTypeText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderTypeTextActive: {
    color: '#000000',
  },

  // 입력 그룹 스타일
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
  },
  priceControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  varianceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    minWidth: 60,
  },
  varianceIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    marginRight: 4,
  },
  varianceText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  currencyPickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  currencyPickerText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginRight: 4,
  },
  currencyPickerArrow: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  priceInput: {
    flex: 1,
    backgroundColor: '#222',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
    marginRight: 8,
  },
  orderButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buyButton: {
    backgroundColor: '#02C076',
  },
  sellButton: {
    backgroundColor: '#F23645',
  },
  orderButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  orderButtonDisabled: {
    opacity: 0.6,
  },

  // 바이낸스 호가창 스타일
  binanceOrderBookContainer: {
    flex: 1,
    backgroundColor: '#1E1E1E',
  },
  orderBookTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  orderBookTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#404040',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBookTabActive: {
    borderColor: '#F0B90B',
    backgroundColor: '#F0B90B',
  },
  orderBookTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#CCCCCC',
  },
  orderBookTabTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  binanceOrderBookHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  binanceOrderBookHeaderText: {
    flex: 1,
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  binanceOrderBookContent: {
    flex: 1,
  },
  binanceSellOrders: {
    flex: 1,
  },
  binanceBuyOrders: {
    flex: 1,
  },
  binanceOrderRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignItems: 'center',
  },
  binanceOrderPrice: {
    flex: 1,
    fontSize: 12,
    textAlign: 'left',
  },
  binanceSellPrice: {
    color: '#F23645',
  },
  binanceBuyPrice: {
    color: '#02C076',
  },
  binanceOrderAmount: {
    flex: 1,
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  binanceOrderTotalContainer: {
    flex: 1,
    position: 'relative',
    alignItems: 'flex-end',
  },
  binanceOrderTotal: {
    fontSize: 12,
    color: '#CCCCCC',
    zIndex: 1,
  },
  binanceStrengthBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: '100%',
    opacity: 0.3,
  },
  binanceBuyStrengthBar: {
    backgroundColor: '#02C076',
  },
  binanceSellStrengthBar: {
    backgroundColor: '#F23645',
  },
  binanceOrderRowHighlighted: {
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  chartContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  marketInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#000000',
  },
  marketPriceSection: {
    flex: 1,
  },
  currentPriceLarge: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  priceChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceChangeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  miniChartContainer: {
    width: 80,
    height: 40,
    marginLeft: 16,
  },
  miniChart: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  miniChartLine: {
    position: 'absolute',
    bottom: 8,
    left: 4,
    right: 4,
    height: 2,
    backgroundColor: '#02C076',
    borderRadius: 1,
  },
  marketDetails: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  marketDetailsColumn: {
    flex: 1,
  },
  marketDetailsColumnLeft: {
    flex: 0.6,
  },
  marketDetailsColumnRight: {
    flex: 1.4,
  },
  marketDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  marketDetailLabel: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  marketDetailValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  binanceOrderAmountContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  binanceOrderAmountHighlighted: {
    borderWidth: 3,
    borderColor: '#F0B90B',
    borderRadius: 6,
    backgroundColor: 'rgba(240, 185, 11, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 10,
  },
  binanceCurrentPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#404040',
  },
  binanceCurrentPriceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F23645',
    marginRight: 8,
  },
  binanceCurrentPriceArrow: {
    fontSize: 14,
    color: '#F23645',
    marginRight: 8,
  },
  binanceCurrentPriceDollar: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  binanceMarketStrength: {
    flexDirection: 'row',
    height: 20,
    backgroundColor: '#1E1E1E',
  },
  binanceBuyStrength: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#02C076',
    paddingHorizontal: 8,
  },
  binanceBuyStrengthText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  binanceBuyStrengthBarIndicator: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginLeft: 8,
    borderRadius: 2,
  },
  binanceSellStrength: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F23645',
    paddingHorizontal: 8,
    justifyContent: 'flex-end',
  },
  binanceSellStrengthText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  binanceSellStrengthBarIndicator: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginRight: 8,
    borderRadius: 2,
  },

  // 플레이스홀더 스타일
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  placeholderSubtext: {
    color: '#888',
    fontSize: 14,
  },

  // 영수증 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptModal: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  receiptTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  receiptCloseButton: {
    padding: 4,
  },
  receiptCloseText: {
    fontSize: 18,
    color: '#888',
  },
  receiptContent: {
    padding: 20,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  receiptLabel: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  receiptValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#404040',
    marginVertical: 12,
  },
  buyText: {
    color: '#02C076',
  },
  sellText: {
    color: '#F23645',
  },
  errorText: {
    color: '#F23645',
  },
  receiptActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F23645',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#F23645',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F0B90B',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
});