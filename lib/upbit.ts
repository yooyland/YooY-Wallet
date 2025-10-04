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

// 모든 마켓의 상위 코인 가져오기
export async function getAllUpbitMarkets(): Promise<{
  KRW: UpbitTicker[];
  USDT: UpbitTicker[];
  BTC: UpbitTicker[];
}> {
  try {
    console.log('Fetching all Upbit markets...');
    
    // KRW 마켓 - 업비트에서 실제로 지원하는 KRW 페어들만 가져오기
    const krwResponse = await fetch(`${UPBIT_API_BASE}/market/all?isDetails=false`);
    const allMarkets = await krwResponse.json();
    
    // KRW 페어만 필터링하고 상위 50개 선택
    const krwMarkets = allMarkets
      .filter((market: any) => market.market.startsWith('KRW-'))
      .slice(0, 50);
    
    const krwMarketCodes = krwMarkets.map((m: any) => m.market);
    console.log('KRW markets to fetch:', krwMarketCodes);

    // KRW 마켓 데이터 가져오기
    const krwTickersResponse = await fetch(`${UPBIT_API_BASE}/ticker?markets=${krwMarketCodes.join(',')}`);
    const krwTickers = await krwTickersResponse.json();

    // USDT 마켓 - 업비트에서 실제로 지원하는 USDT 페어들
    const usdtMarkets = [
      'USDT-BTC', 'USDT-ETH', 'USDT-XRP', 'USDT-ADA', 'USDT-SOL', 'USDT-DOT', 'USDT-LINK', 'USDT-LTC', 'USDT-BCH', 'USDT-ATOM', 'USDT-NEAR', 'USDT-FTM', 'USDT-ALGO', 'USDT-VET', 'USDT-ICP', 'USDT-FLOW', 'USDT-MANA', 'USDT-SAND', 'USDT-AXS', 'USDT-CHZ', 'USDT-ENJ', 'USDT-BAT', 'USDT-ZRX', 'USDT-COMP', 'USDT-MKR', 'USDT-SNX', 'USDT-YFI', 'USDT-UMA', 'USDT-LRC', 'USDT-REN', 'USDT-KNC', 'USDT-BAL', 'USDT-CRV', 'USDT-1INCH', 'USDT-SUSHI', 'USDT-UNI', 'USDT-AAVE', 'USDT-GRT', 'USDT-LUNA', 'USDT-MIR', 'USDT-ANC', 'USDT-UST', 'USDT-KAVA', 'USDT-BAND', 'USDT-WBTC'
    ];

    // BTC 마켓 - 업비트에서 실제로 지원하는 BTC 페어들
    const btcMarkets = [
      'BTC-ETH', 'BTC-XRP', 'BTC-ADA', 'BTC-SOL', 'BTC-DOT', 'BTC-LINK', 'BTC-LTC', 'BTC-BCH', 'BTC-ATOM', 'BTC-NEAR', 'BTC-FTM', 'BTC-ALGO', 'BTC-VET', 'BTC-ICP', 'BTC-FLOW', 'BTC-MANA', 'BTC-SAND', 'BTC-AXS', 'BTC-CHZ', 'BTC-ENJ', 'BTC-BAT', 'BTC-ZRX', 'BTC-COMP', 'BTC-MKR', 'BTC-SNX', 'BTC-YFI', 'BTC-UMA', 'BTC-LRC', 'BTC-REN', 'BTC-KNC', 'BTC-BAL', 'BTC-CRV', 'BTC-1INCH', 'BTC-SUSHI', 'BTC-UNI', 'BTC-AAVE', 'BTC-GRT', 'BTC-LUNA', 'BTC-MIR', 'BTC-ANC', 'BTC-UST', 'BTC-KAVA', 'BTC-BAND', 'BTC-WBTC'
    ];

    // USDT와 BTC 마켓 데이터 가져오기 (실제로 존재하는 마켓만)
    let usdtTickers: UpbitTicker[] = [];
    let btcTickers: UpbitTicker[] = [];

    try {
      const usdtResponse = await fetch(`${UPBIT_API_BASE}/ticker?markets=${usdtMarkets.join(',')}`);
      if (usdtResponse.ok) {
        usdtTickers = await usdtResponse.json();
      }
    } catch (error) {
      console.log('USDT markets not available:', error);
    }

    try {
      const btcResponse = await fetch(`${UPBIT_API_BASE}/ticker?markets=${btcMarkets.join(',')}`);
      if (btcResponse.ok) {
        btcTickers = await btcResponse.json();
      }
    } catch (error) {
      console.log('BTC markets not available:', error);
    }

    // YOY 코인 추가 (실제 Uniswap 데이터 기반)
    const yoyPriceUSD = YOY_INFO.priceFeed.usd; // $0.03546 per YOY
    const yoyPriceKRW = getYOYPriceKRW(1300); // 실제 KRW 가격
    const yoyMock: UpbitTicker = {
      market: 'KRW-YOY',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: yoyPriceKRW * 0.95, // 5% 변동
      high_price: yoyPriceKRW * 1.05,
      low_price: yoyPriceKRW * 0.95,
      trade_price: yoyPriceKRW,
      prev_closing_price: yoyPriceKRW * 0.98,
      change: 'RISE',
      change_price: yoyPriceKRW * 0.02,
      change_rate: 0.02,
      signed_change_price: yoyPriceKRW * 0.02,
      signed_change_rate: 0.02,
      trade_volume: YOY_INFO.poolTokens * 0.1, // 풀의 10% 거래량
      acc_trade_volume: YOY_INFO.poolTokens * 0.5, // 풀의 50% 누적 거래량
      acc_trade_volume_24h: YOY_INFO.poolTokens * 0.5,
      acc_trade_price: YOY_INFO.liquidityUSD * 0.1, // 유동성의 10% 거래대금
      acc_trade_price_24h: YOY_INFO.liquidityUSD * 0.1,
      highest_52_week_price: yoyPriceKRW * 1.5,
      highest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      lowest_52_week_price: yoyPriceKRW * 0.5,
      lowest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      timestamp: Date.now()
    };

    // YOY 코인을 KRW 마켓에 추가
    const krwWithYoy = [...krwTickers, yoyMock];

    return {
      KRW: krwWithYoy.sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 50),
      USDT: usdtTickers.sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 50),
      BTC: btcTickers.sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h).slice(0, 50)
    };
  } catch (error) {
    console.error('Failed to fetch all Upbit markets:', error);
    return { KRW: [], USDT: [], BTC: [] };
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
