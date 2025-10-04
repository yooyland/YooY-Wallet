// Upbit API integration for real-time cryptocurrency prices
import { YOY_INFO, getYOYPriceKRW } from './yoy';

export interface UpbitTicker {
  market: string;
  trade_date: string;
  trade_time: string;
  trade_date_kst: string;
  trade_time_kst: string;
  trade_timestamp: number;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  prev_closing_price: number;
  change: string;
  change_price: number;
  change_rate: number;
  signed_change_price: number;
  signed_change_rate: number;
  trade_volume: number;
  acc_trade_volume: number;
  acc_trade_volume_24h: number;
  acc_trade_price: number;
  acc_trade_price_24h: number;
  highest_52_week_price: number;
  highest_52_week_date: string;
  lowest_52_week_price: number;
  lowest_52_week_date: string;
  timestamp: number;
}

export interface UpbitPrice {
  symbol: string;
  price: number;
  change24h: number;
}

const UPBIT_API_BASE = 'https://api.upbit.com/v1';

// Market mapping for Upbit API
const MARKET_MAPPING: Record<string, string> = {
  'BTC': 'KRW-BTC',
  'ETH': 'KRW-ETH',
  'SOL': 'KRW-SOL',
  'DOT': 'KRW-DOT',
  'BNB': 'KRW-BNB',
  'AVAX': 'KRW-AVAX',
  'LTC': 'KRW-LTC',
  'LINK': 'KRW-LINK',
  'ADA': 'KRW-ADA',
  'ATOM': 'KRW-ATOM',
  'XLM': 'KRW-XLM',
  'XRP': 'KRW-XRP',
  'DOGE': 'KRW-DOGE',
  'TRX': 'KRW-TRX',
  'USDT': 'KRW-USDT',
  'USDC': 'KRW-USDC',
};

export async function getUpbitPrices(symbols: string[]): Promise<UpbitPrice[]> {
  try {
    const markets = symbols
      .map(symbol => MARKET_MAPPING[symbol])
      .filter(market => market !== undefined);

    if (markets.length === 0) {
      return [];
    }

    console.log('Fetching Upbit prices for markets:', markets);
    const response = await fetch(`${UPBIT_API_BASE}/ticker?markets=${markets.join(',')}`);
    
    if (!response.ok) {
      throw new Error(`Upbit API error: ${response.status}`);
    }

    const tickers: UpbitTicker[] = await response.json();
    console.log('Upbit API response:', tickers);
    
    return tickers.map(ticker => {
      const symbol = ticker.market.replace('KRW-', '');
      return {
        symbol,
        price: ticker.trade_price,
        change24h: ticker.signed_change_rate * 100
      };
    });
  } catch (error) {
    console.error('Failed to fetch Upbit prices:', error);
    return [];
  }
}

// 업비트 마켓별 상위 50개 코인 가져오기
export async function getUpbitMarketData(market: string): Promise<UpbitTicker[]> {
  try {
    console.log(`Fetching Upbit market data for: ${market}`);
    const response = await fetch(`${UPBIT_API_BASE}/ticker?markets=${market}`);
    
    if (!response.ok) {
      throw new Error(`Upbit API error: ${response.status}`);
    }

    const tickers: UpbitTicker[] = await response.json();
    console.log(`Upbit ${market} market data:`, tickers.length, 'coins');
    
    // 거래량 기준으로 정렬하여 상위 50개 반환
    return tickers
      .sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
      .slice(0, 50);
  } catch (error) {
    console.error(`Failed to fetch Upbit ${market} market data:`, error);
    return [];
  }
}

// 업비트 KRW 마켓 데이터 가져오기
export async function getUpbitKRWMarkets(): Promise<UpbitTicker[]> {
  try {
    console.log('Fetching Upbit KRW markets...');
    const response = await fetch(`${UPBIT_API_BASE}/market/all?isDetails=false`);
    const allMarkets = await response.json();
    
    // KRW 페어만 필터링
    const krwMarkets = allMarkets
      .filter((market: any) => market.market.startsWith('KRW-'));
    
    const krwMarketCodes = krwMarkets.map((m: any) => m.market);
    console.log('KRW markets to fetch:', krwMarketCodes.length);

    // KRW 마켓 데이터 가져오기
    const tickersResponse = await fetch(`${UPBIT_API_BASE}/ticker?markets=${krwMarketCodes.join(',')}`);
    const tickers = await tickersResponse.json();
    
    // 거래량 기준으로 정렬하여 상위 100개 선택
    const sortedTickers = tickers
      .sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h)
      .slice(0, 100);

    // YOY 코인 추가
    const yoyPriceKRW = getYOYPriceKRW(1300);
    const yoyMock: UpbitTicker = {
      market: 'KRW-YOY',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: yoyPriceKRW * 0.95,
      high_price: yoyPriceKRW * 1.05,
      low_price: yoyPriceKRW * 0.95,
      trade_price: yoyPriceKRW,
      prev_closing_price: yoyPriceKRW * 0.98,
      change: 'RISE',
      change_price: yoyPriceKRW * 0.02,
      change_rate: 0.02,
      signed_change_price: yoyPriceKRW * 0.02,
      signed_change_rate: 0.02,
      trade_volume: YOY_INFO.poolTokens * 0.1,
      acc_trade_volume: YOY_INFO.poolTokens * 0.5,
      acc_trade_volume_24h: YOY_INFO.poolTokens * 0.5,
      acc_trade_price: YOY_INFO.liquidityUSD * 0.1,
      acc_trade_price_24h: YOY_INFO.liquidityUSD * 0.1,
      highest_52_week_price: yoyPriceKRW * 1.5,
      highest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      lowest_52_week_price: yoyPriceKRW * 0.5,
      lowest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      timestamp: Date.now()
    };

    return [...sortedTickers, yoyMock].sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 100);
  } catch (error) {
    console.error('Failed to fetch Upbit KRW markets:', error);
    return [];
  }
}

// 업비트 USDT 마켓 데이터 가져오기
export async function getUpbitUSDTMarkets(): Promise<UpbitTicker[]> {
  try {
    console.log('Fetching Upbit USDT markets...');
    const response = await fetch(`${UPBIT_API_BASE}/market/all?isDetails=false`);
    const allMarkets = await response.json();
    
    // USDT 페어만 필터링
    const usdtMarkets = allMarkets
      .filter((market: any) => market.market.startsWith('USDT-'));
    
    const usdtMarketCodes = usdtMarkets.map((m: any) => m.market);
    console.log('USDT markets to fetch:', usdtMarketCodes.length);

    if (usdtMarketCodes.length === 0) {
      console.log('No USDT markets found in Upbit');
      return [];
    }

    // USDT 마켓 데이터 가져오기
    const tickersResponse = await fetch(`${UPBIT_API_BASE}/ticker?markets=${usdtMarketCodes.join(',')}`);
    const tickers = await tickersResponse.json();
    
    // 거래량 기준으로 정렬하여 상위 100개 선택
    const sortedTickers = tickers
      .sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h)
      .slice(0, 100);

    // YOY 코인 추가
    const yoyPriceUSD = YOY_INFO.priceFeed.usd;
    const yoyUSDT: UpbitTicker = {
      market: 'USDT-YOY',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: yoyPriceUSD * 0.95,
      high_price: yoyPriceUSD * 1.05,
      low_price: yoyPriceUSD * 0.95,
      trade_price: yoyPriceUSD,
      prev_closing_price: yoyPriceUSD * 0.98,
      change: 'RISE',
      change_price: yoyPriceUSD * 0.02,
      change_rate: 0.02,
      signed_change_price: yoyPriceUSD * 0.02,
      signed_change_rate: 0.02,
      trade_volume: YOY_INFO.poolTokens * 0.1,
      acc_trade_volume: YOY_INFO.poolTokens * 0.5,
      acc_trade_volume_24h: YOY_INFO.poolTokens * 0.5,
      acc_trade_price: YOY_INFO.liquidityUSD * 0.1,
      acc_trade_price_24h: YOY_INFO.liquidityUSD * 0.1,
      highest_52_week_price: yoyPriceUSD * 1.5,
      highest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      lowest_52_week_price: yoyPriceUSD * 0.5,
      lowest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      timestamp: Date.now()
    };

    return [...sortedTickers, yoyUSDT].sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 100);
  } catch (error) {
    console.error('Failed to fetch Upbit USDT markets:', error);
    return [];
  }
}

// 업비트 BTC 마켓 데이터 가져오기
export async function getUpbitBTCMarkets(): Promise<UpbitTicker[]> {
  try {
    console.log('Fetching Upbit BTC markets...');
    const response = await fetch(`${UPBIT_API_BASE}/market/all?isDetails=false`);
    const allMarkets = await response.json();
    
    // BTC 페어만 필터링
    const btcMarkets = allMarkets
      .filter((market: any) => market.market.startsWith('BTC-'));
    
    const btcMarketCodes = btcMarkets.map((m: any) => m.market);
    console.log('BTC markets to fetch:', btcMarketCodes.length);

    if (btcMarketCodes.length === 0) {
      console.log('No BTC markets found in Upbit');
      return [];
    }

    // BTC 마켓 데이터 가져오기
    const tickersResponse = await fetch(`${UPBIT_API_BASE}/ticker?markets=${btcMarketCodes.join(',')}`);
    const tickers = await tickersResponse.json();
    
    // 거래량 기준으로 정렬하여 상위 100개 선택
    const sortedTickers = tickers
      .sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h)
      .slice(0, 100);

    // YOY 코인 추가 (BTC 가격으로 변환)
    const btcPrice = 45000000; // BTC 가격 (KRW)
    const yoyPriceUSD = YOY_INFO.priceFeed.usd;
    const yoyPriceBTC = yoyPriceUSD / (btcPrice / 1300);
    const yoyBTC: UpbitTicker = {
      market: 'BTC-YOY',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: yoyPriceBTC * 0.95,
      high_price: yoyPriceBTC * 1.05,
      low_price: yoyPriceBTC * 0.95,
      trade_price: yoyPriceBTC,
      prev_closing_price: yoyPriceBTC * 0.98,
      change: 'RISE',
      change_price: yoyPriceBTC * 0.02,
      change_rate: 0.02,
      signed_change_price: yoyPriceBTC * 0.02,
      signed_change_rate: 0.02,
      trade_volume: YOY_INFO.poolTokens * 0.1,
      acc_trade_volume: YOY_INFO.poolTokens * 0.5,
      acc_trade_volume_24h: YOY_INFO.poolTokens * 0.5,
      acc_trade_price: (YOY_INFO.liquidityUSD * 0.1) / (btcPrice / 1300),
      acc_trade_price_24h: (YOY_INFO.liquidityUSD * 0.1) / (btcPrice / 1300),
      highest_52_week_price: yoyPriceBTC * 1.5,
      highest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      lowest_52_week_price: yoyPriceBTC * 0.5,
      lowest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      timestamp: Date.now()
    };

    return [...sortedTickers, yoyBTC].sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 100);
  } catch (error) {
    console.error('Failed to fetch Upbit BTC markets:', error);
    return [];
  }
}

// 바이낸스 ETH 마켓 데이터 가져오기
export async function getBinanceETHMarkets(): Promise<any[]> {
  try {
    console.log('Fetching Binance ETH markets...');
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const tickers = await response.json();
    
    // ETH 페어만 필터링하고 상위 100개 선택
    const ethMarkets = tickers
      .filter((ticker: any) => ticker.symbol.endsWith('ETH'))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 100);

    console.log('Binance ETH markets found:', ethMarkets.length);
    return ethMarkets;
  } catch (error) {
    console.error('Failed to fetch Binance ETH markets:', error);
    return [];
  }
}

// 모든 마켓의 상위 코인 가져오기
export async function getAllUpbitMarkets(): Promise<{
  KRW: UpbitTicker[];
  USDT: UpbitTicker[];
  BTC: UpbitTicker[];
  ETH: any[];
}> {
  try {
    console.log('Fetching all markets...');
    
    const [krwMarkets, usdtMarkets, btcMarkets, ethMarkets] = await Promise.all([
      getUpbitKRWMarkets(),
      getUpbitUSDTMarkets(),
      getUpbitBTCMarkets(),
      getBinanceETHMarkets()
    ]);

    return {
      KRW: krwMarkets,
      USDT: usdtMarkets,
      BTC: btcMarkets,
      ETH: ethMarkets
    };
  } catch (error) {
    console.error('Failed to fetch all markets:', error);
    return { KRW: [], USDT: [], BTC: [], ETH: [] };
  }
}

export async function getUpbitPrice(symbol: string): Promise<UpbitPrice | null> {
  const prices = await getUpbitPrices([symbol]);
  return prices.length > 0 ? prices[0] : null;
}

// Convert KRW price to USD (approximate rate)
export function convertKRWToUSD(krwPrice: number, usdKrwRate: number = 1300): number {
  return krwPrice / usdKrwRate;
}

// Get USD/KRW exchange rate
export async function getUSDKRWRate(): Promise<number> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    return data.rates.KRW || 1300; // fallback to 1300 if API fails
  } catch (error) {
    console.error('Failed to fetch USD/KRW rate:', error);
    return 1300; // fallback rate
  }
}
