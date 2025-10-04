export type Balance = { symbol: string; name: string; amount: number; valueUSD: number };

export const mockBalances: Balance[] = [
  { symbol: 'YOY', name: 'YooY Land', amount: 5000000, valueUSD: 250000 },
  { symbol: 'USDT', name: 'Tether', amount: 50000, valueUSD: 50000 },
  { symbol: 'ETH', name: 'Ethereum', amount: 25.5, valueUSD: 75000 },
  { symbol: 'BTC', name: 'Bitcoin', amount: 1.2, valueUSD: 60000 },
  { symbol: 'USDC', name: 'USD Coin', amount: 10000, valueUSD: 10000 },
  { symbol: 'BNB', name: 'Binance Coin', amount: 100, valueUSD: 30000 },
];


