import AdminCEVInline from '@/components/AdminCEVInline';
import CEVInline from '@/components/CEVInline';
import HamburgerMenu from '@/components/hamburger-menu';
import NFTInline from '@/components/NFTInline';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getExchangeRates } from '@/lib/currency';
import { getAllActiveCoins, getCoinDisplayName } from '@/lib/managedCoins';
import { loadCustomCoins, onCustomCoinsChange } from '@/lib/customCoins';
import { useMarket } from '@/contexts/MarketContext';
import { getAllUpbitMarkets, UpbitPrice, UpbitTicker } from '@/lib/upbit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { EXCHANGE_UI_ENABLED, IOS_APP_STORE_SHELF, WEB_TRADE_BLOCKED } from '@/lib/featureFlags';
import { useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    Pressable,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

interface Market {
  id: string;
  symbol: string;
  name: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  market_cap?: number;
  volume24h: number;
  image?: string;
  base?: string;
  quote?: string;
  price?: number;
  change24hPct?: number;
  change?: number;
}

function ExchangeScreenContent() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { currentUser } = useAuth();
  const { currency, language } = usePreferences();
  const { usdkrw, yoyPriceUSD } = useMarket();
  const [rates, setRates] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('거래소');
  const [selectedMarket, setSelectedMarket] = useState('USDT');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('price');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [nameLanguage, setNameLanguage] = useState<'en' | 'ko'>('en');
  // SSOT: 보유 잔액(실제 보유 코인/수량)
  const { useMonitorStore } = require('@/lib/monitorStore');
  const storeBalances = useMonitorStore((s: any) => s.balancesArray);
  const amountBySymbol = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    try {
      (storeBalances || []).forEach((b: any) => {
        const sym = String(b?.symbol || '').toUpperCase();
        const amt = Number(b?.amount || 0);
        if (!sym || !(amt > 0)) return;
        m[sym] = (m[sym] || 0) + amt;
      });
    } catch {}
    return m;
  }, [storeBalances]);
  const [upbitPrices, setUpbitPrices] = useState<Record<string, UpbitPrice>>({});
  const [upbitMarkets, setUpbitMarkets] = useState<{
    KRW: UpbitTicker[];
    USDT: UpbitTicker[];
    BTC: UpbitTicker[];
    ETH: any[];
  }>({ KRW: [], USDT: [], BTC: [], ETH: [] });
  const [userHoldings] = useState<string[]>(getAllActiveCoins().map(coin => coin.symbol)); // 지갑 생성 가능한 모든 코인
  const [customSymbols, setCustomSymbols] = useState<string[]>([]);

  // 사용자 보유자산 데이터 (mock)
  const userAssets = {
    totalPurchase: 0,
    unrealizedPnl: 0,
    totalValue: 0,
    returnRate: 0.00
  };

  useEffect(() => {
    // URL의 ?tab=CEV 등으로 초기 탭 선택 지원
    try {
      if (tabParam && typeof tabParam === 'string') {
        const normalized = decodeURIComponent(tabParam).toUpperCase();
        if (['거래소','NFT','CEV','A-CEV'].includes(normalized)) {
          setSelectedTab(normalized);
        } else if (['EXCHANGE','MARKET'].includes(normalized)) {
          setSelectedTab('거래소');
        }
      }
    } catch {}
  }, [tabParam]);

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

  // Load custom coins and subscribe to changes
  useEffect(() => {
    let unsub = () => {};
    const load = async () => {
      const cc = await loadCustomCoins();
      setCustomSymbols(cc.map(c => c.symbol.toUpperCase()));
      // Merge synthetic markets for custom coins (USDT & KRW) with admin prices
      setUpbitMarkets(prev => {
        const next = { ...prev, KRW: prev.KRW.slice(), USDT: prev.USDT.slice() };
        const exists = (arr: any[], market: string) => arr.some(t => t.market === market);
        cc.forEach(c => {
          const priceUSD = c.symbol.toUpperCase() === 'YOY' && yoyPriceUSD ? yoyPriceUSD : (c.priceUSD || 0);
          if (priceUSD && !Number.isNaN(priceUSD)) {
            const usdtMarket = `USDT-${c.symbol.toUpperCase()}`;
            if (!exists(next.USDT, usdtMarket)) {
              next.USDT.push({
                market: usdtMarket,
                trade_date: '', trade_time: '', trade_date_kst: '', trade_time_kst: '',
                trade_timestamp: Date.now(),
                opening_price: priceUSD, high_price: priceUSD, low_price: priceUSD, trade_price: priceUSD,
                prev_closing_price: priceUSD, change: 'EVEN', change_price: 0, change_rate: 0,
                signed_change_price: 0, signed_change_rate: 0, trade_volume: 0, acc_trade_volume: 0,
                acc_trade_volume_24h: 0, acc_trade_price: 0, acc_trade_price_24h: 0,
                highest_52_week_price: priceUSD, highest_52_week_date: '', lowest_52_week_price: priceUSD,
                lowest_52_week_date: '', timestamp: Date.now()
              } as any);
            }
            if (usdkrw) {
              const krwPrice = priceUSD * usdkrw;
              const krwMarket = `KRW-${c.symbol.toUpperCase()}`;
              if (!exists(next.KRW, krwMarket)) {
                next.KRW.push({
                  market: krwMarket,
                  trade_date: '', trade_time: '', trade_date_kst: '', trade_time_kst: '',
                  trade_timestamp: Date.now(),
                  opening_price: krwPrice, high_price: krwPrice, low_price: krwPrice, trade_price: krwPrice,
                  prev_closing_price: krwPrice, change: 'EVEN', change_price: 0, change_rate: 0,
                  signed_change_price: 0, signed_change_rate: 0, trade_volume: 0, acc_trade_volume: 0,
                  acc_trade_volume_24h: 0, acc_trade_price: 0, acc_trade_price_24h: 0,
                  highest_52_week_price: krwPrice, highest_52_week_date: '', lowest_52_week_price: krwPrice,
                  lowest_52_week_date: '', timestamp: Date.now()
                } as any);
              }
            }
          }
        });
        return next;
      });
    };
    load();
    unsub = onCustomCoinsChange(load);
    return () => { try { unsub(); } catch {} };
  }, [usdkrw, yoyPriceUSD]);

  // 업비트 마켓 데이터 가져오기
  useEffect(() => {
    const fetchUpbitMarkets = async () => {
      try {
        console.log('Fetching market data...');
        // 화면 공백 방지: API 시도 전에 우선 fallback 데이터 주입
        const preFallbackMarkets = {
          KRW: [],
          USDT: [],
          BTC: [],
          ETH: []
        } as { KRW: UpbitTicker[]; USDT: UpbitTicker[]; BTC: UpbitTicker[]; ETH: any[] };
        setUpbitMarkets(preFallbackMarkets);
        
        // API 문제 진단을 위해 실제 API 호출 시도
        console.log('Attempting to fetch real API data...');
        try {
          const markets = await getAllUpbitMarkets();
          console.log('✅ API SUCCESS - Real data loaded:', markets);
          const isValid = markets 
            && Array.isArray(markets.KRW)
            && Array.isArray(markets.USDT)
            && Array.isArray(markets.BTC)
            && Array.isArray(markets.ETH)
            && ([...markets.KRW, ...markets.USDT, ...markets.BTC, ...markets.ETH].length > 0);
          if (!isValid) {
            throw new Error('API returned invalid/empty structure');
          }
          console.log('✅ API VALID - lengths:', {
            KRW: markets.KRW.length,
            USDT: markets.USDT.length,
            BTC: markets.BTC.length,
            ETH: markets.ETH.length
          });
          setUpbitMarkets(markets);
          return; // API 성공 시 여기서 종료
        } catch (apiError) {
          console.log('❌ API FAILED:', apiError);
          console.log('Error details:', {
            name: apiError instanceof Error ? apiError.name : 'Unknown',
            message: apiError instanceof Error ? apiError.message : String(apiError)
          });
        }
        
        // API 실패 시 fallback 데이터 사용
        console.log('Using fallback data due to API failure');
        const fallbackMarkets = {
          KRW: [
            {
              market: 'KRW-BTC',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 150000000,
              high_price: 155000000,
              low_price: 148000000,
              trade_price: 152000000,
              prev_closing_price: 150000000,
              change: 'RISE',
              change_price: 2000000,
              change_rate: 0.0133,
              signed_change_price: 2000000,
              signed_change_rate: 0.0133,
              trade_volume: 1000,
              acc_trade_volume: 1000000,
              acc_trade_volume_24h: 1000000,
              acc_trade_price: 152000000000,
              acc_trade_price_24h: 152000000000,
              highest_52_week_price: 200000000,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 100000000,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'KRW-ETH',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 5000000,
              high_price: 5200000,
              low_price: 4900000,
              trade_price: 5100000,
              prev_closing_price: 5000000,
              change: 'RISE',
              change_price: 100000,
              change_rate: 0.02,
              signed_change_price: 100000,
              signed_change_rate: 0.02,
              trade_volume: 5000,
              acc_trade_volume: 5000000,
              acc_trade_volume_24h: 5000000,
              acc_trade_price: 25500000000,
              acc_trade_price_24h: 25500000000,
              highest_52_week_price: 8000000,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 2000000,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'KRW-YOY',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 50,
              high_price: 55,
              low_price: 48,
              trade_price: 52,
              prev_closing_price: 50,
              change: 'RISE',
              change_price: 2,
              change_rate: 0.04,
              signed_change_price: 2,
              signed_change_rate: 0.04,
              trade_volume: 1000000,
              acc_trade_volume: 1000000000,
              acc_trade_volume_24h: 1000000000,
              acc_trade_price: 52000000,
              acc_trade_price_24h: 52000000,
              highest_52_week_price: 100,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 20,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'KRW-SOL',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 250000,
              high_price: 260000,
              low_price: 240000,
              trade_price: 255000,
              prev_closing_price: 250000,
              change: 'RISE',
              change_price: 5000,
              change_rate: 0.02,
              signed_change_price: 5000,
              signed_change_rate: 0.02,
              trade_volume: 5000,
              acc_trade_volume: 5000000,
              acc_trade_volume_24h: 5000000,
              acc_trade_price: 1275000000000,
              acc_trade_price_24h: 1275000000000,
              highest_52_week_price: 400000,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 100000,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'KRW-ADA',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 800,
              high_price: 850,
              low_price: 780,
              trade_price: 820,
              prev_closing_price: 800,
              change: 'RISE',
              change_price: 20,
              change_rate: 0.025,
              signed_change_price: 20,
              signed_change_rate: 0.025,
              trade_volume: 100000,
              acc_trade_volume: 100000000,
              acc_trade_volume_24h: 100000000,
              acc_trade_price: 82000000000,
              acc_trade_price_24h: 82000000000,
              highest_52_week_price: 1500,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 300,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            }
          ],
          USDT: [
            {
              market: 'USDT-BTC',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 110000,
              high_price: 115000,
              low_price: 108000,
              trade_price: 112000,
              prev_closing_price: 110000,
              change: 'RISE',
              change_price: 2000,
              change_rate: 0.0182,
              signed_change_price: 2000,
              signed_change_rate: 0.0182,
              trade_volume: 100,
              acc_trade_volume: 100000,
              acc_trade_volume_24h: 100000,
              acc_trade_price: 11200000000,
              acc_trade_price_24h: 11200000000,
              highest_52_week_price: 150000,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 60000,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'USDT-ETH',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 3500,
              high_price: 3600,
              low_price: 3400,
              trade_price: 3550,
              prev_closing_price: 3500,
              change: 'RISE',
              change_price: 50,
              change_rate: 0.0143,
              signed_change_price: 50,
              signed_change_rate: 0.0143,
              trade_volume: 1000,
              acc_trade_volume: 1000000,
              acc_trade_volume_24h: 1000000,
              acc_trade_price: 3550000000,
              acc_trade_price_24h: 3550000000,
              highest_52_week_price: 5000,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 1500,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'USDT-YOY',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 0.035,
              high_price: 0.040,
              low_price: 0.032,
              trade_price: 0.037,
              prev_closing_price: 0.035,
              change: 'RISE',
              change_price: 0.002,
              change_rate: 0.0571,
              signed_change_price: 0.002,
              signed_change_rate: 0.0571,
              trade_volume: 10000000,
              acc_trade_volume: 10000000000,
              acc_trade_volume_24h: 10000000000,
              acc_trade_price: 370000,
              acc_trade_price_24h: 370000,
              highest_52_week_price: 0.1,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 0.01,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'USDT-SOL',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 180,
              high_price: 190,
              low_price: 170,
              trade_price: 185,
              prev_closing_price: 180,
              change: 'RISE',
              change_price: 5,
              change_rate: 0.0278,
              signed_change_price: 5,
              signed_change_rate: 0.0278,
              trade_volume: 500000,
              acc_trade_volume: 10000000,
              acc_trade_volume_24h: 10000000,
              acc_trade_price: 1850000000,
              acc_trade_price_24h: 1850000000,
              highest_52_week_price: 260,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 80,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'USDT-ADA',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 0.62,
              high_price: 0.66,
              low_price: 0.60,
              trade_price: 0.64,
              prev_closing_price: 0.62,
              change: 'RISE',
              change_price: 0.02,
              change_rate: 0.0323,
              signed_change_price: 0.02,
              signed_change_rate: 0.0323,
              trade_volume: 20000000,
              acc_trade_volume: 1000000000,
              acc_trade_volume_24h: 1000000000,
              acc_trade_price: 6400000,
              acc_trade_price_24h: 6400000,
              highest_52_week_price: 1.20,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 0.25,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            }
          ],
          BTC: [
            {
              market: 'BTC-ETH',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 0.0315,
              high_price: 0.0320,
              low_price: 0.0310,
              trade_price: 0.0317,
              prev_closing_price: 0.0315,
              change: 'RISE',
              change_price: 0.0002,
              change_rate: 0.0063,
              signed_change_price: 0.0002,
              signed_change_rate: 0.0063,
              trade_volume: 1000,
              acc_trade_volume: 1000000,
              acc_trade_volume_24h: 1000000,
              acc_trade_price: 31700,
              acc_trade_price_24h: 31700,
              highest_52_week_price: 0.05,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 0.02,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            },
            {
              market: 'BTC-YOY',
              trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
              trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
              trade_timestamp: Date.now(),
              opening_price: 0.00000033,
              high_price: 0.00000036,
              low_price: 0.00000030,
              trade_price: 0.00000034,
              prev_closing_price: 0.00000033,
              change: 'RISE',
              change_price: 0.00000001,
              change_rate: 0.0303,
              signed_change_price: 0.00000001,
              signed_change_rate: 0.0303,
              trade_volume: 500000000,
              acc_trade_volume: 10000000000,
              acc_trade_volume_24h: 10000000000,
              acc_trade_price: 3.4,
              acc_trade_price_24h: 3.4,
              highest_52_week_price: 0.00000100,
              highest_52_week_date: '20241201',
              lowest_52_week_price: 0.00000010,
              lowest_52_week_date: '20240101',
              timestamp: Date.now()
            }
          ],
          ETH: [
            {
              symbol: 'BTCETH',
              lastPrice: '0.0317',
              priceChangePercent: '0.63',
              volume: '1000',
              quoteVolume: '31700'
            },
            {
              symbol: 'YOYETH',
              lastPrice: '0.0000104',
              priceChangePercent: '5.71',
              volume: '10000000',
              quoteVolume: '104000'
            }
          ]
        };
        
        setUpbitMarkets(fallbackMarkets);
        console.log('Using fallback data:', {
          KRW: fallbackMarkets.KRW.length,
          USDT: fallbackMarkets.USDT.length,
          BTC: fallbackMarkets.BTC.length,
          ETH: fallbackMarkets.ETH.length
        });
        
      } catch (error) {
        console.error('Failed to fetch markets:', error);
        // Fallback: 빈 배열로 초기화
        setUpbitMarkets({ KRW: [], USDT: [], BTC: [], ETH: [] });
      }
    };

    fetchUpbitMarkets();
    // 5분마다 마켓 데이터 업데이트
    const interval = setInterval(fetchUpbitMarkets, 300000);
    return () => clearInterval(interval);
  }, []);


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

  // 코인 한글 이름 매핑
  const coinKoreanNames: { [key: string]: string } = {
    'BTC': '비트코인',
    'ETH': '이더리움',
    'SOL': '솔라나',
    'DOT': '폴카닷',
    'BNB': '바이낸스코인',
    'AVAX': '아발란체',
    'XMR': '모네로',
    'LTC': '라이트코인',
    'LINK': '체인링크',
    'ADA': '에이다',
    'ATOM': '코스모스',
    'XLM': '스텔라',
    'XRP': '리플',
    'DOGE': '도지코인',
    'TRX': '트론',
    'USDT': '테더',
    'USDC': 'USD코인',
    'YOY': '유이랜드',
    'MATIC': '폴리곤',
    'UNI': '유니스왑',
    'AAVE': '에이브',
    'SUSHI': '스시스왑',
    'COMP': '컴파운드',
    'MKR': '메이커',
    'SNX': '신세틱스',
    'YFI': '이어파이낸스',
    'UMA': '우마',
    'LRC': '루프링',
    'REN': '렌',
    'KNC': '카이버네트워크',
    'BAL': '밸런서',
    'CRV': '커브',
    '1INCH': '원인치',
    'GRT': '더그래프',
    'LUNA': '루나',
    'MIR': '미러프로토콜',
    'ANC': '앵커프로토콜',
    'UST': '테라USD',
    'KAVA': '카바',
    'BAND': '밴드프로토콜',
    'WBTC': '래핑비트코인',
    'DAI': '다이'
  };

  // 가격 포맷팅 함수 (천단위 구분 + 자릿수 규칙 유지)
  const formatPrice = (price: number, _market: string): string => {
    const decimals =
      price >= 1000 ? 0 :
      price >= 100 ? 2 :
      price >= 10 ? 2 :
      price >= 1 ? 4 :
      price >= 0.01 ? 4 : 6;
    try {
      return Number(price).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      return price.toFixed(decimals);
    }
  };

  // 거래대금 포맷팅 함수
  const formatVolume = (volume: number, market: string) => {
    if (volume >= 1000000000) {
      return { number: (volume / 1000000000).toFixed(1), unit: 'B' };
    } else if (volume >= 1000000) {
      return { number: (volume / 1000000).toFixed(1), unit: 'M' };
    } else if (volume >= 1000) {
      return { number: (volume / 1000).toFixed(1), unit: 'K' };
    }
    return { number: volume.toFixed(0), unit: '' };
  };

  // 업비트 데이터를 Market 형식으로 변환
  const convertUpbitToMarket = (ticker: UpbitTicker): Market => {
    try {
      if (!ticker.market) {
        console.error('Invalid ticker: market is undefined', ticker);
        throw new Error('Invalid ticker: market is undefined');
      }
      const base = ticker.market.split('-')[1];
      const quote = ticker.market.split('-')[0];
      return {
        id: ticker.market,
        base,
        quote,
        symbol: `${base}/${quote}`,
        name: base, // 업비트에서는 한글명이 별도로 필요
        price: ticker.trade_price,
        change: ticker.signed_change_rate * 100,
        change24hPct: ticker.signed_change_rate * 100,
        volume24h: ticker.acc_trade_price_24h
      };
    } catch (error) {
      console.error('Error converting Upbit ticker to market:', error, ticker);
      throw error;
    }
  };

  // 바이낸스 데이터를 Market 형식으로 변환
  const convertBinanceToMarket = (ticker: any): Market => {
    if (!ticker.symbol) {
      throw new Error('Invalid ticker: symbol is undefined');
    }
    const base = ticker.symbol.replace('ETH', '');
    return {
      id: ticker.symbol,
      base,
      quote: 'ETH',
      symbol: ticker.symbol,
      name: base,
      price: parseFloat(ticker.lastPrice),
      change: parseFloat(ticker.priceChangePercent),
      change24hPct: parseFloat(ticker.priceChangePercent),
      volume24h: parseFloat(ticker.quoteVolume)
    };
  };

  // 현재 선택된 마켓의 데이터 가져오기
  const getCurrentMarketData = (): Market[] => {
    console.log('getCurrentMarketData called for market:', selectedMarket);
    console.log('upbitMarkets state in getCurrentMarketData:', {
      KRW: upbitMarkets.KRW.length,
      USDT: upbitMarkets.USDT.length,
      BTC: upbitMarkets.BTC.length,
      ETH: upbitMarkets.ETH.length
    });
    let tickers: UpbitTicker[] = [];
    
    
    if (selectedMarket === 'FAV') {
      // 즐겨찾기: 마켓 우선순위에 따라 중복 제거 (USDT > KRW > ETH > BTC)
      const favMarkets: { [key: string]: UpbitTicker } = {};
      
      // 1. USDT 마켓 우선
      upbitMarkets.USDT.forEach(ticker => {
        if (ticker.market && favorites.includes(ticker.market)) {
          const base = ticker.market.split('-')[1];
          if (!favMarkets[base]) {
            favMarkets[base] = ticker;
          }
        }
      });
      
      // 2. KRW 마켓 (USDT에 없는 경우만)
      upbitMarkets.KRW.forEach(ticker => {
        if (ticker.market && favorites.includes(ticker.market)) {
          const base = ticker.market.split('-')[1];
          if (!favMarkets[base]) {
            favMarkets[base] = ticker;
          }
        }
      });
      
      // 3. ETH 마켓 (USDT, KRW에 없는 경우만)
      upbitMarkets.ETH.forEach(ticker => {
        if (ticker.symbol && favorites.includes(ticker.symbol)) {
          const base = ticker.symbol.replace('ETH', '');
          if (!favMarkets[base]) {
            favMarkets[base] = ticker;
          }
        }
      });
      
      // 4. BTC 마켓 (USDT, KRW, ETH에 없는 경우만)
      upbitMarkets.BTC.forEach(ticker => {
        if (ticker.market && favorites.includes(ticker.market)) {
          const base = ticker.market.split('-')[1];
          if (!favMarkets[base]) {
            favMarkets[base] = ticker;
          }
        }
      });
      
      tickers = Object.values(favMarkets).filter(ticker => ticker && ticker.market);
    } else if (selectedMarket === 'MY') {
      // 내 보유 코인: 모니터 스토어 기반으로 실제 보유 수량이 있는 심볼만
      const pm = require('@/lib/priceManager').default;
      const symList = Object.keys(amountBySymbol).filter((s) => amountBySymbol[s] > 0);
      // 사용자 설정 통화 기준 가격
      const toCurrency = String(currency || 'USD').toUpperCase();
      const markets: Market[] = symList.map((sym) => {
        const p = pm.getCoinPriceByCurrency(sym, toCurrency) || 0;
        const amt = amountBySymbol[sym] || 0;
        return {
          id: `${toCurrency}-${sym}`,
          base: sym,
          quote: toCurrency,
          symbol: `${sym}/${toCurrency}`,
          name: sym,
          price: p,
          change: 0,
          change24hPct: 0,
          // MY 탭에서는 volume24h 필드를 '총 보유 금액'으로 재활용
          volume24h: p * amt,
        };
      });
      return markets;
    } else if (selectedMarket === 'ETH') {
      // ETH 마켓: 바이낸스 데이터 사용
      return upbitMarkets.ETH.map(convertBinanceToMarket);
    } else {
      // KRW, USDT, BTC 마켓
      tickers = upbitMarkets[selectedMarket as keyof typeof upbitMarkets] || [];
      
      if (tickers.length === 0) {
        console.warn(`No tickers found for ${selectedMarket} market`);
        return [];
      }
      
      try {
        const markets = tickers.map(convertUpbitToMarket);
        return markets;
      } catch (error) {
        console.error(`Error converting ${selectedMarket} market data:`, error);
        return [];
      }
    }

    return tickers.map(convertUpbitToMarket);
  };

  const currentMarketData = getCurrentMarketData();
  console.log('Current market data:', currentMarketData.length, 'items');
  console.log('Selected market:', selectedMarket);
  console.log('Upbit markets state:', {
    KRW: upbitMarkets.KRW.length,
    USDT: upbitMarkets.USDT.length,
    BTC: upbitMarkets.BTC.length,
    ETH: upbitMarkets.ETH.length
  });
  
  const filteredMarkets = currentMarketData
    .filter(market => 
      (market.base || '').toLowerCase().includes(searchText.toLowerCase()) ||
      market.name.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      // 기본 진열 시 (모든 제목탭이 화이트일 때) YOY를 맨 상단에 배치
      const isDefaultSort = sortBy === 'price' && sortOrder === 'desc' && nameLanguage === 'en';
      
      if (isDefaultSort) {
        // YOY가 맨 상단에 오도록 우선순위 부여
        if (a.base === 'YOY' && b.base !== 'YOY') return -1;
        if (b.base === 'YOY' && a.base !== 'YOY') return 1;
        if (a.base === 'YOY' && b.base === 'YOY') return 0;
        
        // YOY가 아닌 나머지는 가격 내림차순으로 정렬 (높은 가격부터)
        return (b.price || 0) - (a.price || 0);
      }
      
      // 기본 진열이 아닐 때는 기존 정렬 로직 사용
      switch (sortBy) {
        case 'volume':
          if (sortOrder === 'desc') {
            // 내림차순: 높은 값부터
            return b.volume24h - a.volume24h;
          } else {
            // 오름차순: 낮은 값부터
            return a.volume24h - b.volume24h;
          }
        case 'change':
          if (sortOrder === 'desc') {
            // 내림차순: 높은 값부터
            return (b.change24hPct || 0) - (a.change24hPct || 0);
          } else {
            // 오름차순: 낮은 값부터
            return (a.change24hPct || 0) - (b.change24hPct || 0);
          }
        case 'price':
          if (sortOrder === 'desc') {
            // 내림차순: 높은 값부터
            return (b.price || 0) - (a.price || 0);
          } else {
            // 오름차순: 낮은 값부터
            return (a.price || 0) - (b.price || 0);
          }
        case 'name':
          if (sortOrder === 'desc') {
            // 내림차순: Z부터 A순
            return (b.base || '').localeCompare(a.base || '');
          } else {
            // 오름차순: A부터 Z순
            return (a.base || '').localeCompare(b.base || '');
          }
        default:
          return 0;
      }
    });


  // 검색 모달 결과: 쿼리가 있을 때만 보여줄 전용 필터
  const searchResults = useMemo(() => {
    const q = String(searchText || '').trim().toLowerCase();
    if (!q) return [];
    try {
      return currentMarketData.filter(m =>
        (m.base || '').toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q)
      );
    } catch {
      return [];
    }
  }, [searchText, currentMarketData]);

  return (
    <ThemedView style={{ flex: 1 }}>
      {/* 거래소 상단바 */}
      <View style={styles.exchangeTopBar}>
        <TouchableOpacity 
          style={[styles.exchangeTab, selectedTab === '거래소' && styles.activeExchangeTab]}
          onPress={() => setSelectedTab('거래소')}
        >
          <ThemedText style={[styles.exchangeTabText, selectedTab === '거래소' && styles.activeExchangeTabText]}>{t('exchangeTab', language)}</ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.exchangeTab, selectedTab === 'NFT' && styles.activeExchangeTab]}
          onPress={() => { setSelectedTab('NFT'); }}
        >
          <ThemedText style={[styles.exchangeTabText, selectedTab === 'NFT' && styles.activeExchangeTabText]}>
            NFT
          </ThemedText>
        </TouchableOpacity>

        {/* CEV / A-CEV tabs styled like NFT */}
        <TouchableOpacity 
          style={[styles.exchangeTab, selectedTab === 'CEV' && styles.activeExchangeTab]}
          onPress={() => setSelectedTab('CEV')}
        >
          <ThemedText style={[styles.exchangeTabText, selectedTab === 'CEV' && styles.activeExchangeTabText]}>CEV</ThemedText>
        </TouchableOpacity>

        {currentUser?.email === 'admin@yooyland.com' && (
          <TouchableOpacity 
            style={[styles.exchangeTab, selectedTab === 'A-CEV' && styles.activeExchangeTab]}
            onPress={() => setSelectedTab('A-CEV')}
          >
            <ThemedText style={[styles.exchangeTabText, selectedTab === 'A-CEV' && styles.activeExchangeTabText]}>A-CEV</ThemedText>
          </TouchableOpacity>
        )}
        
        <View style={styles.exchangeIcons}>
          <TouchableOpacity
            onPress={() => setShowSearchModal(v => !v)}
            style={{ paddingHorizontal: 6, paddingVertical: 6 }}
          >
            <ThemedText style={{ color: '#FFD700', fontSize: 16, fontWeight: '700' }}>
              {showSearchModal ? '✕' : '🔎'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Absolute search button to ensure visibility on all devices */}
        <TouchableOpacity onPress={() => setShowSearchModal(v => !v)} style={styles.exchangeSearchButton}>
          <ThemedText style={styles.exchangeSearchText}>{showSearchModal ? '✕' : '🔎'}</ThemedText>
        </TouchableOpacity>
      </View>

      {(selectedTab === '거래소' || selectedTab === 'NFT' || selectedTab === 'CEV' || selectedTab === 'A-CEV') && (
        <View style={styles.container}>
          {/* NFT / CEV / A-CEV 탭은 거래소 영역을 숨기고 자체 콘텐츠만 표시 */}
          {selectedTab === 'NFT' && (
            <NFTInline />
          )}
          {selectedTab === 'CEV' && (
            <CEVInline />
          )}
          {selectedTab === 'A-CEV' && currentUser?.email === 'admin@yooyland.com' && (
            <AdminCEVInline />
          )}

          {selectedTab === '거래소' && (
            <>
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

            {/* 인라인 검색 바 (일반적인 검색 UI) */}
            {showSearchModal && (
              <View style={[styles.searchContainer, { paddingVertical: 8 }]}>
                <View style={styles.searchInputContainer}>
                  <ThemedText style={styles.searchIcon}>🔍</ThemedText>
                  <TextInput
                    style={styles.searchInput}
                    placeholder={t('coinSearch', language)}
                    placeholderTextColor="#666"
                    value={searchText}
                    onChangeText={setSearchText}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={() => setShowSearchModal(false)}
                  />
                  {!!String(searchText || '').length && (
                    <TouchableOpacity onPress={() => setSearchText('')} style={styles.searchClearButton}>
                      <ThemedText style={styles.searchClearText}>✕</ThemedText>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setShowSearchModal(false)} style={{ marginLeft: 8 }}>
                    <ThemedText style={{ color: '#FFD700', fontWeight: '600' }}>{t('close', language) || '취소'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 마켓 리스트 헤더 */}
            <View style={styles.listHeader}>
            <TouchableOpacity 
              style={styles.headerColumn}
              onPress={() => handleSort('name')}
            >
              <ThemedText style={[styles.headerText, nameLanguage === 'en' ? styles.headerTextWhite : styles.activeHeaderText]}>
                {t('coinMarket', language)}
              </ThemedText>
              <ThemedText style={styles.sortIcon}>↕</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerColumnRight]}
              onPress={() => handleSort('price')}
            >
              <ThemedText style={[styles.headerText, styles.headerTextRight, sortBy === 'price' && (sortOrder === 'desc' ? styles.headerTextWhite : styles.activeHeaderText)]}>
                {selectedMarket === 'MY' ? (
                  <View style={styles.headerTwoLine}>
                    <ThemedText style={styles.headerText}>{t('price', language)}</ThemedText>
                    <ThemedText style={[styles.headerTextSmall, styles.headerTextRight]}>{t('buyPrice', language)}</ThemedText>
                  </View>
                ) : t('price', language)}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerColumnRight]}
              onPress={() => handleSort('change')}
            >
              <ThemedText style={[styles.headerText, styles.headerTextRight, sortBy === 'change' && (sortOrder === 'desc' ? styles.headerTextWhite : styles.activeHeaderText)]}>
                {selectedMarket === 'MY' ? (
                  <View style={styles.headerTwoLine}>
                    <ThemedText style={styles.headerText}>{t('change', language)}</ThemedText>
                    <ThemedText style={[styles.headerTextSmall, styles.headerTextRight]}>{t('profitRateProfitAmount', language)}</ThemedText>
                  </View>
                ) : t('change', language)}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerColumn, styles.headerColumnRight]}
              onPress={() => handleSort('volume')}
            >
              <ThemedText style={[styles.headerText, styles.headerTextRight, sortBy === 'volume' && (sortOrder === 'desc' ? styles.headerTextWhite : styles.activeHeaderText)]}>
                {selectedMarket === 'MY' ? t('totalHoldings', language) : t('volume24h', language)}
              </ThemedText>
            </TouchableOpacity>
            </View>

            {/* 마켓 리스트 */}
            <FlatList
              data={filteredMarkets}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ paddingBottom: 80 }}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={true}
              onScrollBeginDrag={() => { if (showSearchModal) setShowSearchModal(false); }}
              renderItem={({ item }) => {
              // 실제 업비트 가격 사용
              const currentPrice = item.price || 0;
              const currentChange = item.change24hPct || 0;
              const isUp = currentChange >= 0;
              const isFavorite = favorites.includes(item.id);
              const isMyTab = selectedMarket === 'MY';
              
              // 통화 표기: MY 탭은 사용자 설정 통화 사용, 그 외는 마켓 탭 기준
              const cur = isMyTab ? String(currency || 'USD').toUpperCase() : selectedMarket;
              const formattedPrice = formatPrice(currentPrice, cur);
              const displayPrice = cur === 'KRW' ? 
                `₩${formattedPrice}` : 
                cur === 'USDT' || cur === 'USD' ? 
                  `$${formattedPrice}` :
                  cur === 'ETH' ?
                    `${formattedPrice} ETH` :
                    cur === 'BTC' ?
                      `${formattedPrice} BTC` :
                      `$${formattedPrice}`;
              
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
                          {item.base === 'YOY' ? (
                            <Image 
                              source={require('@/assets/images/yoy.png')}
                              style={styles.coinLogo}
                            />
                          ) : (
                            <Image 
                              source={{ uri: `https://static.upbit.com/logos/${item.base}.png` }}
                              style={styles.coinLogo}
                              defaultSource={{ uri: `https://static.upbit.com/logos/${item.base}.png` }}
                            />
                          )}
                        </View>
                        <View style={styles.coinDetails}>
                          <ThemedText style={styles.coinName}>
                            {getCoinDisplayName(item.base || '', nameLanguage)}
                          </ThemedText>
                          <ThemedText style={styles.coinPair}>{item.base || ''}/{item.quote || ''}</ThemedText>
                        </View>
                      </Pressable>
                    </Link>
                  </View>
                  
                  <View style={styles.priceInfo}>
                    <ThemedText style={styles.price}>
                      {displayPrice}
                    </ThemedText>
                    {isMyTab && (() => {
                      const amt = amountBySymbol[String(item.base || '').toUpperCase()] || 0;
                      return (
                        <ThemedText style={styles.buyPrice}>
                          {amt.toLocaleString(undefined, { maximumFractionDigits: 6 })} {item.base}
                        </ThemedText>
                      );
                    })()}
                  </View>
                  
                  <View style={styles.changeInfo}>
                    <ThemedText style={[styles.change, { color: isUp ? '#FF4444' : '#00C851' }]}>
                      {isUp ? '+' : ''}{currentChange.toFixed(2)}%
                    </ThemedText>
                    {/* MY 탭에서는 손익 대신 24h 변동률만 표시(또는 향후 실제 손익 계산 연결) */}
                  </View>
                  
                  <View style={styles.volumeInfo}>
                    <ThemedText style={styles.volume}>
                      {isMyTab ? 
                        (() => {
                          const amt = amountBySymbol[String(item.base || '').toUpperCase()] || 0;
                          const total = currentPrice * amt;
                          const sign = cur === 'KRW' ? '₩' : (cur === 'USDT' || cur === 'USD') ? '$' : '';
                          const num = total >= 1000 ? total.toLocaleString(undefined, { maximumFractionDigits: 0 }) : total.toLocaleString(undefined, { maximumFractionDigits: 2 });
                          return `${sign}${num}`;
                        })()
                        : 
                        (() => {
                          const formatted = formatVolume(item.volume24h, cur);
                          const currency = cur === 'KRW' ? '₩' : 
                                        cur === 'USDT' || cur === 'USD' ? '$' :
                                        cur === 'ETH' ? ' ETH' :
                                        cur === 'BTC' ? ' BTC' : '$';
                          
                          return (
                            <>
                              {currency === '₩' ? '₩' : currency === '$' ? '$' : ''}
                              {formatted.number}
                              {formatted.unit && (
                                <ThemedText style={styles.volumeUnit}>{formatted.unit}</ThemedText>
                              )}
                              {currency === ' ETH' ? ' ETH' : currency === ' BTC' ? ' BTC' : ''}
                            </>
                          );
                        })()
                      }
                    </ThemedText>
                  </View>
                </View>
              );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
            </>
          )}
        </View>
      )}

      {/* 모달 검색 UI 제거 → 인라인 검색으로 대체 */}

      
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
    </ThemedView>
  );
}

export default function ExchangeScreen() {
  if (WEB_TRADE_BLOCKED || !EXCHANGE_UI_ENABLED || IOS_APP_STORE_SHELF) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  return <ExchangeScreenContent />;
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
  exchangeIcons: { flexDirection: 'row', marginLeft: 'auto' },
  exchangeSearchButton: {
    position: 'absolute',
    right: 16,
    top: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
    zIndex: 2000,
    elevation: 2000,
  },
  exchangeSearchText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '700',
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
    paddingVertical: 12,
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
    fontSize: 16,
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
    marginRight: 8,
    padding: 2,
    position: 'absolute',
    left: 0,
    zIndex: 10,
  },
  coinInfoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 24,
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
  coinLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
  volumeUnit: {
    fontSize: 13,
    color: '#00BFFF',
    fontWeight: 'bold',
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
  headerTextWhite: {
    color: '#FFFFFF',
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
    backgroundColor: 'transparent',
    zIndex: 1000,
    elevation: 1000,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 100,
  },
  searchBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000AA',
  },
  searchModalContent: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    borderRadius: 8,
    padding: 12,
    width: '96%',
    maxHeight: '80%',
  },
  searchResults: {
    marginTop: 12,
    maxHeight: 420,
  },
  searchResultsContent: {
    paddingBottom: 8,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  searchResultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  searchResultIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
    overflow: 'hidden',
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultLogo: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  searchResultNames: {
    flexShrink: 1,
  },
  searchResultName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  searchResultPair: {
    color: '#AAAAAA',
    fontSize: 12,
    marginTop: 2,
  },
  searchResultPrice: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  searchResultSeparator: {
    height: 1,
    backgroundColor: '#2A2A2A',
  },
  searchEmpty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  searchEmptyText: {
    color: '#888',
    fontSize: 13,
  },
  searchCloseButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
  },
  searchCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  searchClearButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#3A3A3A',
  },
  searchClearText: {
    color: '#FFFFFF',
    fontSize: 12,
  },

});



