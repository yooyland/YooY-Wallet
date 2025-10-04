export type OrderLevel = { price: number; size: number };
export type Trade = { id: string; side: 'buy' | 'sell'; price: number; size: number; time: string };

export type OrderbookSnapshot = {
  marketId: string;
  bids: OrderLevel[]; // sorted desc by price
  asks: OrderLevel[]; // sorted asc by price
  trades: Trade[]; // recent trades
};

export function mockOrderbook(marketId: string): OrderbookSnapshot {
  const center = 100;
  const mk = marketId;
  const bids: OrderLevel[] = Array.from({ length: 10 }).map((_, i) => ({ price: +(center - i * 0.5).toFixed(2), size: +(Math.random() * 1000 + 10).toFixed(2) }));
  const asks: OrderLevel[] = Array.from({ length: 10 }).map((_, i) => ({ price: +(center + i * 0.5).toFixed(2), size: +(Math.random() * 1000 + 10).toFixed(2) }));
  const trades: Trade[] = Array.from({ length: 20 }).map((_, i) => ({
    id: `${i}`,
    side: Math.random() > 0.5 ? 'buy' : 'sell',
    price: +(center + (Math.random() - 0.5) * 2).toFixed(2),
    size: +(Math.random() * 100 + 1).toFixed(2),
    time: new Date(Date.now() - i * 60 * 1000).toISOString(),
  }));
  return { marketId: mk, bids, asks, trades };
}


