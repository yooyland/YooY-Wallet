// Upbit API integration for real-time cryptocurrency prices
import { Platform } from 'react-native';
import { YOY_INFO } from './yoy';

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

// 웹 CORS 우회용 프록시 시도 헬퍼
export async function fetchJsonWithProxy(url: string, init?: RequestInit): Promise<any> {
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
  const candidates: { url: string; note: string }[] = [
    // 1) 내부 서버 프록시 (CORS 허용, allowlist 적용)
    origin ? { url: `${origin}/api/proxy?url=${encodeURIComponent(url)}`, note: 'internal-proxy' } : null,
    // 2) 직접 (네이티브/서버 환경에서만 의미 있음)
    { url, note: 'direct' },
    // 간단 프록시 (isomorphic-git)
    { url: `https://cors.isomorphic-git.org/${url}`, note: 'isomorphic-git' },
    // allorigins (응답 래핑됨)
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, note: 'allorigins-raw' }
  ].filter(Boolean) as any;

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, init);
      if (!res.ok) {
        // 429: rate limit → 즉시 중단(특히 프록시 경유 시 재시도 의미 적음)
        if (res.status === 429) {
          if (Platform.OS === 'web') {
            console.warn('[fetchJsonWithProxy] rate-limited via', candidate.note, url);
          }
          throw new Error('HTTP 429');
        }
        throw new Error(`HTTP ${res.status}`);
      }
      // 단일 read: 먼저 text로 읽고 JSON 파싱 시도
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        if (Platform.OS === 'web') {
          console.log('[fetchJsonWithProxy] OK via', candidate.note, url);
        }
        return parsed;
      } catch {
        if (Platform.OS === 'web') {
          console.log('[fetchJsonWithProxy] Non-JSON text via', candidate.note, url);
        }
        return text;
      }
    } catch (e) {
      lastError = e;
      if (Platform.OS === 'web') {
        console.warn('[fetchJsonWithProxy] failed via', candidate.note, url, e);
      }
      // 429면 추가 프록시 시도는 의미 없으니 즉시 중단
      if (String((e as any)?.message || '').includes('429')) break;
      continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed');
}

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

    const url = `${UPBIT_API_BASE}/ticker?markets=${markets.join(',')}`;
    console.log('Fetching Upbit prices for markets:', markets);
    const tickers: UpbitTicker[] = Platform.OS === 'web'
      ? await fetchJsonWithProxy(url)
      : await (async () => {
          const r = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
          if (!r.ok) throw new Error(`Upbit API error: ${r.status}`);
          return await r.json();
        })();
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
    const url = `${UPBIT_API_BASE}/ticker?markets=${market}`;
    const tickers: UpbitTicker[] = Platform.OS === 'web'
      ? await fetchJsonWithProxy(url)
      : await (async () => {
          const r = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
          if (!r.ok) throw new Error(`Upbit API error: ${r.status}`);
          return await r.json();
        })();
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

// 업비트 KRW 마켓 데이터 가져오기 (레이트리밋 완화 + 캐시)
const krwCache: { ts: number; data: UpbitTicker[] } = { ts: 0, data: [] };
const KRW_CACHE_TTL_MS = 45_000; // 45초 캐시
export async function getUpbitKRWMarkets(): Promise<UpbitTicker[]> {
  try {
    // 캐시 우선 반환 (신선도 확보 위해 TTL 내에서는 즉시 캐시 반환)
    const now = Date.now();
    if (krwCache.data.length > 0 && now - krwCache.ts < KRW_CACHE_TTL_MS) {
      return krwCache.data;
    }
    console.log('Fetching Upbit KRW markets...');
    // network variance guard: always go via server proxy
    const allMarkets = await fetchJsonWithProxy(`${UPBIT_API_BASE}/market/all?isDetails=false`);
    console.log('All markets response:', allMarkets.length, 'markets');
    
    // KRW 페어만 필터링
    const krwMarkets = allMarkets
      .filter((market: any) => market.market.startsWith('KRW-'));
    
    const krwMarketCodes = krwMarkets.map((m: any) => m.market);
    console.log('KRW markets to fetch:', krwMarketCodes.length);

    if (krwMarketCodes.length === 0) {
      console.log('No KRW markets found, returning empty array');
      return [];
    }

    // KRW 마켓 데이터 가져오기 (프록시 레이트리밋 대비: 소형 청크 + 지연)
    let chunkSize = 12;
    const chunks: string[][] = [];
    for (let i = 0; i < krwMarketCodes.length; i += chunkSize) {
      chunks.push(krwMarketCodes.slice(i, i + chunkSize));
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const fetchChunk = async (codes: string[], attempt: number = 1): Promise<UpbitTicker[]> => {
      const url = `${UPBIT_API_BASE}/ticker?markets=${codes.join(',')}`;
      try {
        const data = await fetchJsonWithProxy(url);
        return Array.isArray(data) ? (data as UpbitTicker[]) : [];
      } catch (e) {
        // 429 or network fail → 백오프 재시도
        const msg = String((e as any)?.message || '');
        if (attempt < 3) {
          // 429면 강한 백오프 + 청크 축소
          if (msg.includes('429')) {
            const jitter = Math.floor(Math.random() * 400);
            const backoff = 700 * attempt + jitter;
            console.warn('KRW chunk rate-limited, backing off...', { attempt, backoffMs: backoff, size: codes.length });
            await sleep(backoff);
            // 청크를 절반으로 쪼개서 각각 재요청
            if (codes.length > 6) {
              const mid = Math.floor(codes.length / 2);
              const left = await fetchChunk(codes.slice(0, mid), attempt + 1);
              const right = await fetchChunk(codes.slice(mid), attempt + 1);
              return [...left, ...right];
            }
          } else {
            const jitter = Math.floor(Math.random() * 300);
            await sleep(250 + 150 * attempt + jitter);
          }
          console.warn('KRW chunk retry (proxy)', { size: codes.length, attempt });
          return await fetchChunk(codes, attempt + 1);
        }
        // 에러를 노란 경고로만 남기고 빈 배열 반환(레드스크린 방지)
        console.warn('KRW chunk failed (proxy):', msg || e);
        return [];
      }
    };

    const results: UpbitTicker[][] = [];
    for (const c of chunks) {
      const out = await fetchChunk(c).catch(() => []);
      results.push(out);
      // 레이트리밋 방지: 청크 사이 지연 + 지터
      const jitter = Math.floor(Math.random() * 200);
      await sleep(320 + jitter);
    }
    let tickers: UpbitTicker[] = ([] as UpbitTicker[]).concat(...results);
    console.log('KRW tickers response:', tickers.length, 'tickers');
    
    // 24시간 거래금액 기준으로 정렬하여 상위 100개 선택
    const sortedTickers = tickers
      .sort((a: UpbitTicker, b: UpbitTicker) => b.acc_trade_price_24h - a.acc_trade_price_24h)
      .slice(0, 200);
    
    console.log('KRW top 10 by trading volume:', sortedTickers.slice(0, 10).map(t => ({
      market: t.market,
      volume: t.acc_trade_price_24h
    })));

    // YOY 코인 추가 (실제 환율 사용)
    const yoyPriceUSD = YOY_INFO.priceFeed.usd; // $0.03546
    const usdtKrwRate = sortedTickers.find(t => t.market === 'KRW-USDT')?.trade_price || 1300;
    const yoyPriceKRW = yoyPriceUSD * usdtKrwRate; // $0.03546 * 1300 = ₩46.098
    
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

    const finalData = [yoyMock, ...sortedTickers].slice(0, 100);
    // 캐시 저장
    krwCache.data = finalData;
    krwCache.ts = Date.now();
    return finalData;
  } catch (error) {
    console.warn('Failed to fetch Upbit KRW markets:', error);
    // 캐시가 있으면 캐시 반환
    if (krwCache.data.length > 0) return krwCache.data;
    return [];
  }
}

// 업비트 USDT 마켓 데이터 가져오기
export async function getUpbitUSDTMarkets(): Promise<UpbitTicker[]> {
  try {
    console.log('Fetching Binance USDT markets (Upbit has limited USDT pairs)...');
    
    // 웹에서는 서버 프록시만 사용 (직접요청 금지: CORS)
    const tickers = Platform.OS === 'web'
      ? await fetchJsonWithProxy('https://api.binance.com/api/v3/ticker/24hr')
      : await (async () => {
          const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });
          if (!r.ok) throw new Error(`Binance API error! status: ${r.status}`);
          return await r.json();
        })();
    console.log('Binance API response:', tickers.length, 'total tickers');
    
    // USDT 페어만 필터링하고 거래금액 기준 상위 200개 선택
    const usdtMarkets = tickers
      .filter((ticker: any) => ticker.symbol.endsWith('USDT'))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 200);
    
    console.log('USDT markets found:', usdtMarkets.length);
    
    // 바이낸스 데이터를 업비트 형식으로 변환
    const convertedTickers: UpbitTicker[] = usdtMarkets.map((ticker: any) => ({
      market: `USDT-${ticker.symbol.replace('USDT', '')}`,
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: parseFloat(ticker.openPrice),
      high_price: parseFloat(ticker.highPrice),
      low_price: parseFloat(ticker.lowPrice),
      trade_price: parseFloat(ticker.lastPrice),
      prev_closing_price: parseFloat(ticker.prevClosePrice),
      change: parseFloat(ticker.priceChange) >= 0 ? 'RISE' : 'FALL',
      change_price: parseFloat(ticker.priceChange),
      change_rate: parseFloat(ticker.priceChangePercent) / 100,
      signed_change_price: parseFloat(ticker.priceChange),
      signed_change_rate: parseFloat(ticker.priceChangePercent) / 100,
      trade_volume: parseFloat(ticker.volume),
      acc_trade_volume: parseFloat(ticker.volume),
      acc_trade_volume_24h: parseFloat(ticker.volume),
      acc_trade_price: parseFloat(ticker.quoteVolume),
      acc_trade_price_24h: parseFloat(ticker.quoteVolume),
      highest_52_week_price: parseFloat(ticker.highPrice),
      highest_52_week_date: new Date().toISOString().split('T')[0],
      lowest_52_week_price: parseFloat(ticker.lowPrice),
      lowest_52_week_date: new Date().toISOString().split('T')[0],
      timestamp: Date.now()
    }));
    
    console.log('USDT top 10 by trading volume:', convertedTickers.slice(0, 10).map(t => ({
      market: t.market,
      volume: t.acc_trade_price_24h
    })));

    // YOY 코인 추가 (USDT 마켓)
    const yoyPriceUSD = YOY_INFO.priceFeed.usd; // $0.03546
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

    return [yoyUSDT, ...convertedTickers].slice(0, 100);
  } catch (error) {
    console.error('Failed to fetch Upbit USDT markets:', error);
    return [];
  }
}

// 업비트 BTC 마켓 데이터 가져오기
export async function getUpbitBTCMarkets(): Promise<UpbitTicker[]> {
  try {
    console.log('Fetching Binance BTC markets (Upbit has limited BTC pairs)...');
    
    const tickers = Platform.OS === 'web'
      ? await fetchJsonWithProxy('https://api.binance.com/api/v3/ticker/24hr')
      : await (async () => {
          const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });
          if (!r.ok) throw new Error(`Binance API error! status: ${r.status}`);
          return await r.json();
        })();
    console.log('Binance BTC API response:', tickers.length, 'total tickers');
    
    // BTC 페어만 필터링하고 거래금액 기준 상위 200개 선택
    const btcMarkets = tickers
      .filter((ticker: any) => ticker.symbol.endsWith('BTC'))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 200);
    
    console.log('BTC markets found:', btcMarkets.length);
    
    // 바이낸스 데이터를 업비트 형식으로 변환
    const convertedTickers: UpbitTicker[] = btcMarkets.map((ticker: any) => ({
      market: `BTC-${ticker.symbol.replace('BTC', '')}`,
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: parseFloat(ticker.openPrice),
      high_price: parseFloat(ticker.highPrice),
      low_price: parseFloat(ticker.lowPrice),
      trade_price: parseFloat(ticker.lastPrice),
      prev_closing_price: parseFloat(ticker.prevClosePrice),
      change: parseFloat(ticker.priceChange) >= 0 ? 'RISE' : 'FALL',
      change_price: parseFloat(ticker.priceChange),
      change_rate: parseFloat(ticker.priceChangePercent) / 100,
      signed_change_price: parseFloat(ticker.priceChange),
      signed_change_rate: parseFloat(ticker.priceChangePercent) / 100,
      trade_volume: parseFloat(ticker.volume),
      acc_trade_volume: parseFloat(ticker.volume),
      acc_trade_volume_24h: parseFloat(ticker.volume),
      acc_trade_price: parseFloat(ticker.quoteVolume),
      acc_trade_price_24h: parseFloat(ticker.quoteVolume),
      highest_52_week_price: parseFloat(ticker.highPrice),
      highest_52_week_date: new Date().toISOString().split('T')[0],
      lowest_52_week_price: parseFloat(ticker.lowPrice),
      lowest_52_week_date: new Date().toISOString().split('T')[0],
      timestamp: Date.now()
    }));
    
    console.log('BTC top 10 by trading volume:', convertedTickers.slice(0, 10).map(t => ({
      market: t.market,
      volume: t.acc_trade_price_24h
    })));

    // YOY 코인 추가 (BTC 가격으로 변환 - 실제 BTC 가격 사용)
    const yoyPriceUSD = YOY_INFO.priceFeed.usd; // $0.03546
    const btcPriceUSD = convertedTickers.find(t => t.market === 'BTC-USDT')?.trade_price || 45000; // 실제 BTC 가격
    const yoyPriceBTC = yoyPriceUSD / btcPriceUSD; // $0.03546 / $45,000 = 0.000000788 BTC
    
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
      acc_trade_price: (YOY_INFO.liquidityUSD * 0.1) / btcPriceUSD,
      acc_trade_price_24h: (YOY_INFO.liquidityUSD * 0.1) / btcPriceUSD,
      highest_52_week_price: yoyPriceBTC * 1.5,
      highest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      lowest_52_week_price: yoyPriceBTC * 0.5,
      lowest_52_week_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      timestamp: Date.now()
    };

    return [yoyBTC, ...convertedTickers].slice(0, 100);
  } catch (error) {
    console.error('Failed to fetch Upbit BTC markets:', error);
    return [];
  }
}

// 바이낸스 ETH 마켓 데이터 가져오기
export async function getBinanceETHMarkets(): Promise<any[]> {
  try {
    console.log('Fetching Binance ETH markets...');
    
    const tickers = Platform.OS === 'web'
      ? await fetchJsonWithProxy('https://api.binance.com/api/v3/ticker/24hr')
      : await (async () => {
          const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });
          if (!r.ok) throw new Error(`Binance API error! status: ${r.status}`);
          return await r.json();
        })();
    console.log('Binance ETH API response:', tickers.length, 'total tickers');
    
    // ETH 페어만 필터링하고 거래금액 기준 상위 200개 선택
    const ethMarkets = tickers
      .filter((ticker: any) => ticker.symbol.endsWith('ETH'))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 200);
    
    console.log('ETH markets found:', ethMarkets.length);

    // YOY 코인 추가 (ETH 마켓용 - 실제 ETH 가격 사용)
    const yoyPriceUSD = YOY_INFO.priceFeed.usd; // $0.03546
    const ethPriceUSD = ethMarkets.find(t => t.symbol === 'ETHUSDT')?.lastPrice || 3000; // 실제 ETH 가격
    const yoyPriceETH = yoyPriceUSD / parseFloat(ethPriceUSD); // $0.03546 / $3,000 = 0.00001182 ETH
    
    const yoyETH = {
      symbol: 'YOYETH',
      lastPrice: yoyPriceETH.toString(),
      priceChangePercent: '3.45',
      quoteVolume: (YOY_INFO.liquidityUSD * 0.1).toString()
    };

    console.log('Binance ETH top 10 by trading volume:', ethMarkets.slice(0, 10).map(t => ({
      symbol: t.symbol,
      volume: t.quoteVolume
    })));
    
    console.log('Binance ETH markets found:', ethMarkets.length);
    return [yoyETH, ...ethMarkets].slice(0, 200);
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
    
    const [krwMarkets, usdtMarkets, btcMarkets, ethMarkets] = await Promise.allSettled([
      getUpbitKRWMarkets(),
      getUpbitUSDTMarkets(),
      getUpbitBTCMarkets(),
      getBinanceETHMarkets()
    ]);

    // 성공했지만 0개면 폴백으로 대체
    let KRW = krwMarkets.status === 'fulfilled' && Array.isArray(krwMarkets.value) && krwMarkets.value.length > 0
      ? krwMarkets.value
      : getFallbackKRWMarkets();
    const USDT = usdtMarkets.status === 'fulfilled' && Array.isArray(usdtMarkets.value) && usdtMarkets.value.length > 0
      ? usdtMarkets.value
      : getFallbackUSDTMarkets();
    const BTC = btcMarkets.status === 'fulfilled' && Array.isArray(btcMarkets.value) && btcMarkets.value.length > 0
      ? btcMarkets.value
      : getFallbackBTCMarkets();
    const ETH = ethMarkets.status === 'fulfilled' && Array.isArray(ethMarkets.value) && ethMarkets.value.length > 0
      ? ethMarkets.value
      : getFallbackETHMarkets();

    // Ensure KRW includes fallback essentials (device/network variance guard)
    const krwByMarket: Record<string, UpbitTicker> = {};
    KRW.forEach(t => { if (t && t.market) { krwByMarket[t.market] = t; } });
    for (const f of getFallbackKRWMarkets()) {
      if (f && f.market && !krwByMarket[f.market]) {
        krwByMarket[f.market] = f;
      }
    }
    KRW = Object.values(krwByMarket);

    console.log('All markets resolved (with fallbacks if empty):', {
      KRW: Array.isArray(KRW) ? KRW.length : 0,
      USDT: Array.isArray(USDT) ? USDT.length : 0,
      BTC: Array.isArray(BTC) ? BTC.length : 0,
      ETH: Array.isArray(ETH) ? ETH.length : 0,
    });

    return { KRW, USDT, BTC, ETH };
  } catch (error) {
    console.error('Failed to fetch all markets:', error);
    return { 
      KRW: getFallbackKRWMarkets(), 
      USDT: getFallbackUSDTMarkets(), 
      BTC: getFallbackBTCMarkets(), 
      ETH: getFallbackETHMarkets() 
    };
  }
}

// Fallback 데이터 함수들 (API 실패 시 사용)
function getFallbackKRWMarkets(): UpbitTicker[] {
  console.log('Using fallback KRW markets data');
  return [
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
    },
    {
      market: 'KRW-LINK',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 20000,
      high_price: 21000,
      low_price: 19500,
      trade_price: 20500,
      prev_closing_price: 20000,
      change: 'RISE',
      change_price: 500,
      change_rate: 0.025,
      signed_change_price: 500,
      signed_change_rate: 0.025,
      trade_volume: 200000,
      acc_trade_volume: 20000000,
      acc_trade_volume_24h: 20000000,
      acc_trade_price: 410000000000,
      acc_trade_price_24h: 410000000000,
      highest_52_week_price: 35000,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 10000,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'KRW-ATOM',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 12000,
      high_price: 12500,
      low_price: 11800,
      trade_price: 12350,
      prev_closing_price: 12000,
      change: 'RISE',
      change_price: 350,
      change_rate: 0.0292,
      signed_change_price: 350,
      signed_change_rate: 0.0292,
      trade_volume: 150000,
      acc_trade_volume: 15000000,
      acc_trade_volume_24h: 15000000,
      acc_trade_price: 185250000000,
      acc_trade_price_24h: 185250000000,
      highest_52_week_price: 22000,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 8000,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'KRW-XRP',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 700,
      high_price: 740,
      low_price: 680,
      trade_price: 725,
      prev_closing_price: 700,
      change: 'RISE',
      change_price: 25,
      change_rate: 0.0357,
      signed_change_price: 25,
      signed_change_rate: 0.0357,
      trade_volume: 3000000,
      acc_trade_volume: 300000000,
      acc_trade_volume_24h: 300000000,
      acc_trade_price: 217500000000,
      acc_trade_price_24h: 217500000000,
      highest_52_week_price: 1200,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 300,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'KRW-DOGE',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 150,
      high_price: 160,
      low_price: 145,
      trade_price: 155,
      prev_closing_price: 150,
      change: 'RISE',
      change_price: 5,
      change_rate: 0.0333,
      signed_change_price: 5,
      signed_change_rate: 0.0333,
      trade_volume: 5000000,
      acc_trade_volume: 500000000,
      acc_trade_volume_24h: 500000000,
      acc_trade_price: 77500000000,
      acc_trade_price_24h: 77500000000,
      highest_52_week_price: 300,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 50,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    }
  ];
}

function getFallbackUSDTMarkets(): UpbitTicker[] {
  console.log('Using fallback USDT markets data');
  return [
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
    },
    {
      market: 'USDT-DOT',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 7.5,
      high_price: 8.0,
      low_price: 7.2,
      trade_price: 7.8,
      prev_closing_price: 7.5,
      change: 'RISE',
      change_price: 0.3,
      change_rate: 0.04,
      signed_change_price: 0.3,
      signed_change_rate: 0.04,
      trade_volume: 1000000,
      acc_trade_volume: 100000000,
      acc_trade_volume_24h: 100000000,
      acc_trade_price: 7800000,
      acc_trade_price_24h: 7800000,
      highest_52_week_price: 12.0,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 3.0,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'USDT-BNB',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 580,
      high_price: 600,
      low_price: 570,
      trade_price: 590,
      prev_closing_price: 580,
      change: 'RISE',
      change_price: 10,
      change_rate: 0.0172,
      signed_change_price: 10,
      signed_change_rate: 0.0172,
      trade_volume: 50000,
      acc_trade_volume: 5000000,
      acc_trade_volume_24h: 5000000,
      acc_trade_price: 2950000000,
      acc_trade_price_24h: 2950000000,
      highest_52_week_price: 800,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 200,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'USDT-AVAX',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 35,
      high_price: 38,
      low_price: 34,
      trade_price: 36.5,
      prev_closing_price: 35,
      change: 'RISE',
      change_price: 1.5,
      change_rate: 0.0429,
      signed_change_price: 1.5,
      signed_change_rate: 0.0429,
      trade_volume: 200000,
      acc_trade_volume: 20000000,
      acc_trade_volume_24h: 20000000,
      acc_trade_price: 730000000,
      acc_trade_price_24h: 730000000,
      highest_52_week_price: 60,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 15,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'USDT-LINK',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 14.5,
      high_price: 15.2,
      low_price: 14.0,
      trade_price: 14.8,
      prev_closing_price: 14.5,
      change: 'RISE',
      change_price: 0.3,
      change_rate: 0.0207,
      signed_change_price: 0.3,
      signed_change_rate: 0.0207,
      trade_volume: 500000,
      acc_trade_volume: 50000000,
      acc_trade_volume_24h: 50000000,
      acc_trade_price: 740000000,
      acc_trade_price_24h: 740000000,
      highest_52_week_price: 25,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 5,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    },
    {
      market: 'USDT-ATOM',
      trade_date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_date_kst: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      trade_time_kst: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
      trade_timestamp: Date.now(),
      opening_price: 8.2,
      high_price: 8.8,
      low_price: 8.0,
      trade_price: 8.5,
      prev_closing_price: 8.2,
      change: 'RISE',
      change_price: 0.3,
      change_rate: 0.0366,
      signed_change_price: 0.3,
      signed_change_rate: 0.0366,
      trade_volume: 300000,
      acc_trade_volume: 30000000,
      acc_trade_volume_24h: 30000000,
      acc_trade_price: 255000000,
      acc_trade_price_24h: 255000000,
      highest_52_week_price: 15,
      highest_52_week_date: '20241201',
      lowest_52_week_price: 3,
      lowest_52_week_date: '20240101',
      timestamp: Date.now()
    }
  ];
}

function getFallbackBTCMarkets(): UpbitTicker[] {
  console.log('Using fallback BTC markets data');
  return [
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
    }
  ];
}

function getFallbackETHMarkets(): any[] {
  console.log('Using fallback ETH markets data');
  return [
    {
      symbol: 'BTCETH',
      lastPrice: '0.0317',
      priceChangePercent: '0.63',
      volume: '1000',
      quoteVolume: '31700'
    },
    {
      symbol: 'ETHUSDT',
      lastPrice: '3550',
      priceChangePercent: '1.43',
      volume: '1000000',
      quoteVolume: '3550000000'
    }
  ];
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
    const data = Platform.OS === 'web'
      ? await fetchJsonWithProxy('https://api.exchangerate-api.com/v4/latest/USD')
      : await response.json();
    return data.rates.KRW || 1300; // fallback to 1300 if API fails
  } catch (error) {
    console.error('Failed to fetch USD/KRW rate:', error);
    return 1300; // fallback rate
  }
}
