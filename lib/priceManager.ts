// 중앙화된 코인 가격 관리 시스템
// Exchange 페이지의 실제 API 로직을 기반으로 한 단일 소스
import { Platform } from 'react-native';
import { fetchJsonWithProxy } from '@/lib/upbit';

export interface CoinPrice {
  symbol: string;
  usd: number;
  krw: number;
  eur: number;
  jpy: number;
  cny: number;
  btc: number;
  eth: number;
  usdt: number;
  usdc: number;
}

export interface MarketData {
  upbitKrw: any[];
  binanceUsdt: any[];
  bithumbKrw: any;
  usdtKrwRate: number;
}

// 실시간 가격 데이터 저장소
let realTimePrices: Record<string, CoinPrice> = {};
let lastUpdateAt = 0;
let updateInFlight: Promise<void> | null = null;
let marketData: MarketData = {
  upbitKrw: [],
  binanceUsdt: [],
  bithumbKrw: null,
  usdtKrwRate: 1300, // 기본값
};

// 기본 코인 가격 데이터 (USD 기준) - Exchange 페이지와 동일
const BASE_COIN_PRICES: Record<string, number> = {
  'YOY': 0.03546,
  'BTC': 45000,
  'ETH': 3810,
  'BNB': 1220,
  'AAVE': 228.63,
  'SOL': 179.21,
  'XMR': 118.7,
  'USDT': 1,
  'USDC': 1,
  'ADA': 0.45,
  'DOT': 6.8,
  'LINK': 14.2,
  'UNI': 6.5,
  'LTC': 72.3,
  'BCH': 245.6,
  'XRP': 0.52,
  'DOGE': 0.08,
  'SHIB': 0.000008,
  'MATIC': 0.85,
  'AVAX': 25.4,
  'ATOM': 8.9,
  'TRX': 0.12,
  'XLM': 0.11,
  'ALGO': 0.15,
  'VET': 0.02,
  'ICP': 4.2,
  'FIL': 4.8,
  'THETA': 0.95,
  'EOS': 0.65,
  'XTZ': 0.85,
};

/**
 * Exchange 페이지와 동일한 API 호출로 실시간 가격 업데이트
 */
export async function updateRealTimePrices(): Promise<void> {
  // 글로벌 1Hz 스로틀 + 디듀플리케이션
  const now = Date.now();
  if (now - lastUpdateAt < 1000 && updateInFlight) {
    return updateInFlight;
  }
  lastUpdateAt = now;
  updateInFlight = (async () => {
    try {
    console.log('🔄 실시간 가격 업데이트 시작...');
    
    // 1. 업비트 API (KRW 마켓)
    const upbitKrwMarkets = 'KRW-USDT,KRW-BTC,KRW-ETH,KRW-XRP,KRW-ADA';
    let upbitData: any[] = [];
    
    try {
      const url = `https://api.upbit.com/v1/ticker?markets=${upbitKrwMarkets}`;
      const data = Platform.OS === 'web'
        ? await fetchJsonWithProxy(url)
        : await (async () => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
          })();
      if (Array.isArray(data)) {
        upbitData = data;
        console.log(`✅ 업비트 마켓 성공: ${upbitData.length}개`);
      }
    } catch (error) {
      console.log('❌ 업비트 API 에러:', error);
    }
    
    // 2. 바이낸스 API (USDT 마켓)
    const binanceUsdtMarkets = 'BTCUSDT,ETHUSDT,XRPUSDT,ADAUSDT,DOTUSDT,DOGEUSDT,SOLUSDT,BNBUSDT,AVAXUSDT,ATOMUSDT,TRXUSDT,XLMUSDT,XMRUSDT,LTCUSDT,LINKUSDT,UNIUSDT,AAVEUSDT,MATICUSDT,SHIBUSDT,FTMUSDT,NEARUSDT,ALGOUSDT,VETUSDT,ICPUSDT,FILUSDT,THETAUSDT,EOSUSDT,XTZUSDT';
    let binanceData: any[] = [];
    
    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${binanceUsdtMarkets
        .split(',')
        .map(s => `"${s}"`)
        .join(',')}]`;
      const data = Platform.OS === 'web'
        ? await fetchJsonWithProxy(url)
        : await (async () => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
          })();
      if (Array.isArray(data)) {
        binanceData = data;
        console.log(`✅ 바이낸스 마켓 성공: ${binanceData.length}개`);
      }
    } catch (error) {
      console.log('❌ 바이낸스 API 에러:', error);
    }
    
    // 3. USDT/KRW 환율 추출
    let usdtKrwRate = 1300; // 기본값
    if (upbitData.length > 0) {
      const usdtKrwData = upbitData.find((item: any) => item.market === 'KRW-USDT');
      if (usdtKrwData) {
        usdtKrwRate = usdtKrwData.trade_price;
        console.log(`✅ USDT/KRW 환율: ${usdtKrwRate}원`);
      }
    }
    
    // 4. 마켓 데이터 업데이트
    marketData = {
      upbitKrw: upbitData,
      binanceUsdt: binanceData,
      bithumbKrw: null,
      usdtKrwRate: usdtKrwRate,
    };
    
    // 5. 각 코인별 가격 계산 (Exchange 페이지 로직과 동일)
    const supportedCoins = Object.keys(BASE_COIN_PRICES);
    
    for (const symbol of supportedCoins) {
      const coinPrice = calculateCoinPrice(symbol, upbitData, binanceData, usdtKrwRate);
      realTimePrices[symbol] = coinPrice;
    }
    
    console.log('✅ 실시간 가격 업데이트 완료');
  } catch (error) {
    console.error('❌ 실시간 가격 업데이트 실패:', error);
  } finally {
    // 최소 1초 간격 보장
    const elapsed = Date.now() - now;
    if (elapsed < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - elapsed));
    }
    updateInFlight = null;
    lastUpdateAt = Date.now();
  }})();
  return updateInFlight;
}

/**
 * Exchange 페이지와 동일한 로직으로 코인 가격 계산
 */
function calculateCoinPrice(symbol: string, upbitData: any[], binanceData: any[], usdtKrwRate: number): CoinPrice {
  const basePrice = BASE_COIN_PRICES[symbol];
  
  // YOY는 특별 처리 (MarketContext에서 가져온 가격 사용)
  if (symbol === 'YOY') {
    return {
      symbol: 'YOY',
      usd: basePrice,
      krw: basePrice * usdtKrwRate,
      eur: basePrice * 0.85,
      jpy: basePrice * 110,
      cny: basePrice * 7.2,
      btc: basePrice / 45000,
      eth: basePrice / 3810,
      usdt: basePrice,
      usdc: basePrice,
    };
  }
  
  // ETH는 우선 업비트 KRW 가격을 사용(Exchange와 일치), 없으면 바이낸스 USDT → KRW 변환
  if (symbol === 'ETH') {
    const ethKrwData = upbitData.find((item: any) => item.market === 'KRW-ETH');
    if (ethKrwData && typeof ethKrwData.trade_price === 'number' && ethKrwData.trade_price > 0) {
      const ethKrwPrice = ethKrwData.trade_price;
      const ethUsdPrice = ethKrwPrice / usdtKrwRate;
      return {
        symbol: 'ETH',
        usd: ethUsdPrice,
        krw: ethKrwPrice,
        eur: ethUsdPrice * 0.85,
        jpy: ethUsdPrice * 110,
        cny: ethUsdPrice * 7.2,
        btc: ethUsdPrice / 45000,
        eth: 1,
        usdt: ethUsdPrice,
        usdc: ethUsdPrice,
      };
    } else {
      const ethUsdtData = binanceData.find((item: any) => item.symbol === 'ETHUSDT');
      if (ethUsdtData) {
        const ethUsdPrice = parseFloat(ethUsdtData.lastPrice);
        const ethKrwPrice = ethUsdPrice * usdtKrwRate;
        
        return {
          symbol: 'ETH',
          usd: ethUsdPrice,
          krw: ethKrwPrice,
          eur: ethUsdPrice * 0.85,
          jpy: ethUsdPrice * 110,
          cny: ethUsdPrice * 7.2,
          btc: ethUsdPrice / 45000,
          eth: 1,
          usdt: ethUsdPrice,
          usdc: ethUsdPrice,
        };
      }
    }
  }
  
  // BTC는 업비트에서 직접 가져오기
  if (symbol === 'BTC') {
    const btcKrwData = upbitData.find((item: any) => item.market === 'KRW-BTC');
    if (btcKrwData) {
      const btcKrwPrice = btcKrwData.trade_price;
      const btcUsdPrice = btcKrwPrice / usdtKrwRate;
      
      return {
        symbol: 'BTC',
        usd: btcUsdPrice,
        krw: btcKrwPrice,
        eur: btcUsdPrice * 0.85,
        jpy: btcUsdPrice * 110,
        cny: btcUsdPrice * 7.2,
        btc: 1,
        eth: btcUsdPrice / 3810,
        usdt: btcUsdPrice,
        usdc: btcUsdPrice,
      };
    }
  }
  
  // 다른 코인들은 바이낸스에서 가져와서 KRW로 변환
  const binanceSymbol = `${symbol}USDT`;
  const binanceData_item = binanceData.find((item: any) => item.symbol === binanceSymbol);
  
  if (binanceData_item) {
    const usdPrice = parseFloat(binanceData_item.lastPrice);
    const krwPrice = usdPrice * usdtKrwRate;
    
    return {
      symbol: symbol,
      usd: usdPrice,
      krw: krwPrice,
      eur: usdPrice * 0.85,
      jpy: usdPrice * 110,
      cny: usdPrice * 7.2,
      btc: usdPrice / 45000,
      eth: usdPrice / 3810,
      usdt: usdPrice,
      usdc: usdPrice,
    };
  }
  
  // API에서 데이터를 찾을 수 없는 경우 기본값 사용
  return {
    symbol: symbol,
    usd: basePrice,
    krw: basePrice * usdtKrwRate,
    eur: basePrice * 0.85,
    jpy: basePrice * 110,
    cny: basePrice * 7.2,
    btc: basePrice / 45000,
    eth: basePrice / 3810,
    usdt: basePrice,
    usdc: basePrice,
  };
}

/**
 * 특정 코인의 모든 화폐 가격을 반환 (실시간 데이터 우선)
 * @param symbol 코인 심볼 (예: 'YOY', 'BTC')
 * @returns CoinPrice 객체
 */
export function getCoinPrice(symbol: string): CoinPrice {
  // 실시간 데이터가 있으면 사용
  if (realTimePrices[symbol.toUpperCase()]) {
    return realTimePrices[symbol.toUpperCase()];
  }
  
  // 실시간 데이터가 없으면 기본값 사용
  const basePrice = BASE_COIN_PRICES[symbol.toUpperCase()];
  
  if (!basePrice) {
    console.warn(`가격 데이터가 없는 코인: ${symbol}`);
    return {
      symbol: symbol.toUpperCase(),
      usd: 0,
      krw: 0,
      eur: 0,
      jpy: 0,
      cny: 0,
      btc: 0,
      eth: 0,
      usdt: 0,
      usdc: 0,
    };
  }

  return {
    symbol: symbol.toUpperCase(),
    usd: basePrice,
    krw: basePrice * 1300,
    eur: basePrice * 0.85,
    jpy: basePrice * 110,
    cny: basePrice * 7.2,
    btc: basePrice / 45000,
    eth: basePrice / 3810,
    usdt: basePrice,
    usdc: basePrice,
  };
}

/**
 * 특정 코인의 특정 화폐 가격을 반환
 * @param symbol 코인 심볼
 * @param currency 화폐 단위 ('USD', 'KRW', 'EUR', 'JPY', 'CNY', 'BTC', 'ETH', 'USDT', 'USDC')
 * @returns 가격 (number)
 */
export function getCoinPriceByCurrency(symbol: string, currency: string): number {
  const coinPrice = getCoinPrice(symbol);
  const currencyKey = currency.toLowerCase() as keyof CoinPrice;
  
  if (currencyKey === 'symbol') {
    return 0;
  }
  
  return coinPrice[currencyKey] || 0;
}

/**
 * 마켓 ID에서 기본 화폐를 추출
 * @param marketId 마켓 ID (예: 'USDT-YOY', 'KRW-BTC')
 * @returns 기본 화폐 단위
 */
export function getMarketDefaultCurrency(marketId: string): string {
  const [quote] = marketId.split('-');
  switch (quote?.toUpperCase()) {
    case 'KRW': return 'KRW';
    case 'USDT': return 'USD';
    case 'USDC': return 'USD';
    case 'BTC': return 'BTC';
    case 'ETH': return 'ETH';
    default: return 'USD';
  }
}

/**
 * 마켓 ID에서 코인 심볼을 추출
 * @param marketId 마켓 ID (예: 'USDT-YOY', 'KRW-BTC')
 * @returns 코인 심볼
 */
export function getCoinSymbolFromMarket(marketId: string): string {
  const [, base] = marketId.split('-');
  return base || marketId;
}

/**
 * 모든 지원 코인 목록 반환
 * @returns 코인 심볼 배열
 */
export function getAllSupportedCoins(): string[] {
  return Object.keys(BASE_COIN_PRICES);
}

/**
 * 실시간 가격 데이터 반환
 * @returns 실시간 가격 데이터
 */
export function getRealTimePrices(): Record<string, CoinPrice> {
  return realTimePrices;
}

/**
 * 마켓 데이터 반환
 * @returns 마켓 데이터
 */
export function getMarketData(): MarketData {
  return marketData;
}

/**
 * 코인 가격 업데이트 (실제 API에서 가져온 데이터로 업데이트)
 * @param symbol 코인 심볼
 * @param usdPrice USD 가격
 */
export function updateCoinPrice(symbol: string, usdPrice: number): void {
  BASE_COIN_PRICES[symbol.toUpperCase()] = usdPrice;
}

// 기본 내보내기
export default {
  getCoinPrice,
  getCoinPriceByCurrency,
  getMarketDefaultCurrency,
  getCoinSymbolFromMarket,
  getAllSupportedCoins,
  updateRealTimePrices,
  getRealTimePrices,
  getMarketData,
  updateCoinPrice,
};
