// Upbit API integration for real-time cryptocurrency prices

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
