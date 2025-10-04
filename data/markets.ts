export type Market = {
  id: string; // e.g., YOY-USD
  base: string;
  quote: string;
  price: number; // last price
  change: number; // -1.23 = -1.23%
  change24hPct: number; // -1.23 = -1.23%
  volume24h: number; // quote volume
};

export const mockMarkets: Market[] = [
  { id: 'YOY-USD', base: 'YOY', quote: 'USD', price: 0.12, change: 3.45, change24hPct: 3.45, volume24h: 1250000 },
  { id: 'BTC-USDT', base: 'BTC', quote: 'USDT', price: 61234.5, change: -0.82, change24hPct: -0.82, volume24h: 452100000 },
  { id: 'ETH-USDT', base: 'ETH', quote: 'USDT', price: 2890.11, change: 1.12, change24hPct: 1.12, volume24h: 182300000 },
  { id: 'YOY-USDT', base: 'YOY', quote: 'USDT', price: 0.12, change: 3.38, change24hPct: 3.38, volume24h: 980000 },
  { id: 'SOL-USDT', base: 'SOL', quote: 'USDT', price: 168.2, change: 0.57, change24hPct: 0.57, volume24h: 51200000 },
];


