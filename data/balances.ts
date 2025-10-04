export type Balance = { symbol: string; name: string; amount: number; valueUSD: number };

export const mockBalances: Balance[] = [
  // 가상화폐 (18종)
  { symbol: 'YOY', name: 'YooY Land', amount: 20000000, valueUSD: 1000000 },
  { symbol: 'BTC', name: 'Bitcoin', amount: 2.436, valueUSD: 150000 },
  { symbol: 'ETH', name: 'Ethereum', amount: 3.16, valueUSD: 12000 },
  { symbol: 'SOL', name: 'Solana', amount: 34, valueUSD: 8500 },
  { symbol: 'DOT', name: 'Polkadot', amount: 832, valueUSD: 5000 },
  { symbol: 'BNB', name: 'Binance Coin', amount: 5, valueUSD: 1500 },
  { symbol: 'AVAX', name: 'Avalanche', amount: 128, valueUSD: 3200 },
  { symbol: 'XMR', name: 'Monero', amount: 12, valueUSD: 1800 },
  { symbol: 'LTC', name: 'Litecoin', amount: 6, valueUSD: 900 },
  { symbol: 'LINK', name: 'Chainlink', amount: 36, valueUSD: 720 },
  { symbol: 'ADA', name: 'Cardano', amount: 548, valueUSD: 274 },
  { symbol: 'ATOM', name: 'Cosmos', amount: 54, valueUSD: 540 },
  { symbol: 'XLM', name: 'Stellar', amount: 500, valueUSD: 100 },
  { symbol: 'XRP', name: 'Ripple', amount: 23, valueUSD: 46 },
  { symbol: 'DOGE', name: 'Dogecoin', amount: 84, valueUSD: 42 },
  { symbol: 'TRX', name: 'TRON', amount: 64, valueUSD: 32 },
  
  // 스테이블코인 (2종)
  { symbol: 'USDT', name: 'Tether', amount: 533, valueUSD: 533 },
  { symbol: 'USDC', name: 'USD Coin', amount: 239, valueUSD: 239 },
  
  // 법정화폐 (5종) - USD 기준으로 환산
  { symbol: 'KRW', name: 'Korean Won', amount: 160122080, valueUSD: 120000 },
  { symbol: 'USD', name: 'US Dollar', amount: 84500, valueUSD: 84500 },
  { symbol: 'JPY', name: 'Japanese Yen', amount: 1840140, valueUSD: 12000 },
  { symbol: 'CNY', name: 'Chinese Yuan', amount: 104070, valueUSD: 15000 },
  { symbol: 'EUR', name: 'Euro', amount: 34500, valueUSD: 38000 },
];


