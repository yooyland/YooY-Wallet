import AsyncStorage from '@react-native-async-storage/async-storage';

export type CustomCoin = {
  symbol: string;      // e.g., YOY, ABC
  name: string;        // display name
  priceUSD: number;    // admin-set reference price in USD
  markets?: Array<'KRW'|'USDT'|'BTC'|'ETH'>; // optional supported markets
  chainIdHex?: string; // e.g., 0x1
  contract?: string;   // ERC-20 address
  decimals?: number;   // token decimals
};

const STORAGE_KEY = 'system:coins';

// simple subscribers for change notifications (in-memory)
const listeners = new Set<() => void>();
export function onCustomCoinsChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emitChange() { listeners.forEach(l => { try { l(); } catch {} }); }

export async function loadCustomCoins(): Promise<CustomCoin[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // Backward compatibility: map {price} -> {priceUSD}
    return (Array.isArray(list) ? list : []).map((c: any) => ({
      symbol: String(c.symbol || '').toUpperCase(),
      name: String(c.name || c.symbol || '').trim(),
      priceUSD: Number(c.priceUSD ?? c.price ?? 0) || 0,
      markets: Array.isArray(c.markets) ? c.markets : ['USDT','KRW'],
      chainIdHex: typeof c.chainIdHex === 'string' ? c.chainIdHex : undefined,
      contract: typeof c.contract === 'string' ? c.contract : undefined,
      decimals: typeof c.decimals === 'number' ? c.decimals : undefined,
    }));
  } catch {
    return [];
  }
}

export async function saveCustomCoins(next: CustomCoin[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } finally {
    emitChange();
  }
}

export async function upsertCustomCoin(coin: CustomCoin): Promise<void> {
  const all = await loadCustomCoins();
  const idx = all.findIndex(c => c.symbol === coin.symbol);
  if (idx >= 0) all[idx] = coin; else all.unshift(coin);
  await saveCustomCoins(all);
}

export async function removeCustomCoin(symbol: string): Promise<void> {
  const all = await loadCustomCoins();
  const next = all.filter(c => c.symbol !== symbol);
  await saveCustomCoins(next);
}


