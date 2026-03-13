type PriceMap = Record<string, number>;

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  LTC: 'litecoin',
  LINK: 'chainlink',
  TRX: 'tron',
  XLM: 'stellar',
  ATOM: 'cosmos',
};

function getYoyPriceEnv(): number | null {
  try {
    const raw = (process as any)?.env?.EXPO_PUBLIC_YOY_PRICE_USD;
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function fetchPricesUsd(symbols: string[]): Promise<PriceMap> {
  const out: PriceMap = {};
  const uniq = Array.from(new Set(symbols.map(s => String(s || '').toUpperCase())));
  // YOY from env fallback if provided
  if (uniq.includes('YOY')) {
    const yoy = getYoyPriceEnv();
    if (yoy != null) out.YOY = yoy;
  }
  const ids = uniq
    .map(s => SYMBOL_TO_COINGECKO[s])
    .filter(Boolean);
  if (ids.length === 0) return out;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(',')
  )}&vs_currencies=usd`;
  try {
    const t0 = Date.now();
    const res = await fetch(url);
    const text = await res.text();
    console.log('[prices] GET', url, 'status=', res.status, 'ms=', Date.now() - t0, 'head=', text.slice(0, 120));
    const j = JSON.parse(text);
    for (const [sym, id] of Object.entries(SYMBOL_TO_COINGECKO)) {
      const v = j?.[id]?.usd;
      if (typeof v === 'number' && v > 0) out[sym] = v;
    }
  } catch (e: any) {
    console.log('[prices] error', String(e?.message || e));
  }
  return out;
}

export function getPriceKey(params: { symbol: string; chainId?: number; contractAddressLower?: string | null }): string {
  const sym = String(params.symbol || '').toUpperCase();
  const chainId = Number(params.chainId || 1);
  const ca = (params.contractAddressLower || '').toLowerCase();
  if (sym === 'ETH') return `native:${chainId}:ETH`;
  if (ca && ca.startsWith('0x') && ca.length === 42) return `erc20:${chainId}:${ca}`;
  return `symbol:${sym}`; // fallback
}

// Simple decimals map for common assets
export function getDecimalsForSymbol(symbol: string): number {
  const s = String(symbol || '').toUpperCase();
  if (s === 'ETH' || s === 'YOY') return 18;
  if (s === 'USDT' || s === 'USDC') return 6;
  return 18;
}

// Fetch historical USD price (daily) using CoinGecko history endpoint
// dateStr: 'YYYY-MM-DD' (we will convert to DD-MM-YYYY per API)
export async function fetchHistoricalUsd(symbol: string, dateStr: string): Promise<number | null> {
  try {
    const id = SYMBOL_TO_COINGECKO[String(symbol || '').toUpperCase()];
    if (!id) {
      if (String(symbol || '').toUpperCase() === 'YOY') {
        // Fallback for YOY: use current env price if provided
        const v = getYoyPriceEnv();
        return v ?? null;
      }
      return null;
    }
    const [y, m, d] = dateStr.split('-').map((x) => Number(x));
    const ddmmyyyy = `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
    const url = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${encodeURIComponent(ddmmyyyy)}`;
    const t0 = Date.now();
    const res = await fetch(url);
    const text = await res.text();
    console.log('[prices][history] GET', url, 'status=', res.status, 'ms=', Date.now() - t0, 'head=', text.slice(0, 120));
    const j = JSON.parse(text);
    const usd = j?.market_data?.current_price?.usd;
    return typeof usd === 'number' && usd > 0 ? usd : null;
  } catch (e: any) {
    console.log('[prices][history] error', String(e?.message || e));
    return null;
  }
}

