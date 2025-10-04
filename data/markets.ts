export type Market = {
  id: string; // e.g., YOY-USD
  base: string;
  quote: string;
  symbol: string; // e.g., YOY/USD
  name: string; // e.g., YooY Land
  price: number; // last price
  change: number; // -1.23 = -1.23%
  change24hPct: number; // -1.23 = -1.23%
  volume24h: number; // quote volume
};

export const mockMarkets: Market[] = [
  // KRW pairs
  { id: 'BTC-KRW', base: 'BTC', quote: 'KRW', symbol: 'BTC/KRW', name: 'Bitcoin', price: 45000000, change: 2.5, change24hPct: 2.5, volume24h: 1200000000000 },
  { id: 'ETH-KRW', base: 'ETH', quote: 'KRW', symbol: 'ETH/KRW', name: 'Ethereum', price: 3200000, change: -1.2, change24hPct: -1.2, volume24h: 800000000000 },
  { id: 'SOL-KRW', base: 'SOL', quote: 'KRW', symbol: 'SOL/KRW', name: 'Solana', price: 180000, change: 5.8, change24hPct: 5.8, volume24h: 200000000000 },
  { id: 'BNB-KRW', base: 'BNB', quote: 'KRW', symbol: 'BNB/KRW', name: 'BNB', price: 450000, change: 1.8, change24hPct: 1.8, volume24h: 150000000000 },
  { id: 'XRP-KRW', base: 'XRP', quote: 'KRW', symbol: 'XRP/KRW', name: 'XRP', price: 850, change: -0.5, change24hPct: -0.5, volume24h: 100000000000 },
  { id: 'ADA-KRW', base: 'ADA', quote: 'KRW', symbol: 'ADA/KRW', name: 'Cardano', price: 1200, change: 3.2, change24hPct: 3.2, volume24h: 50000000000 },
  { id: 'AVAX-KRW', base: 'AVAX', quote: 'KRW', symbol: 'AVAX/KRW', name: 'Avalanche', price: 45000, change: 4.1, change24hPct: 4.1, volume24h: 40000000000 },
  { id: 'DOT-KRW', base: 'DOT', quote: 'KRW', symbol: 'DOT/KRW', name: 'Polkadot', price: 8500, change: -2.1, change24hPct: -2.1, volume24h: 30000000000 },
  { id: 'LINK-KRW', base: 'LINK', quote: 'KRW', symbol: 'LINK/KRW', name: 'Chainlink', price: 18000, change: 2.8, change24hPct: 2.8, volume24h: 25000000000 },
  { id: 'MATIC-KRW', base: 'MATIC', quote: 'KRW', symbol: 'MATIC/KRW', name: 'Polygon', price: 1200, change: 1.5, change24hPct: 1.5, volume24h: 20000000000 },
  { id: 'LTC-KRW', base: 'LTC', quote: 'KRW', symbol: 'LTC/KRW', name: 'Litecoin', price: 120000, change: 0.8, change24hPct: 0.8, volume24h: 15000000000 },
  { id: 'BCH-KRW', base: 'BCH', quote: 'KRW', symbol: 'BCH/KRW', name: 'Bitcoin Cash', price: 45000, change: -1.2, change24hPct: -1.2, volume24h: 12000000000 },
  { id: 'ATOM-KRW', base: 'ATOM', quote: 'KRW', symbol: 'ATOM/KRW', name: 'Cosmos', price: 8500, change: 3.5, change24hPct: 3.5, volume24h: 10000000000 },
  { id: 'NEAR-KRW', base: 'NEAR', quote: 'KRW', symbol: 'NEAR/KRW', name: 'NEAR Protocol', price: 3500, change: 2.1, change24hPct: 2.1, volume24h: 8000000000 },
  { id: 'FTM-KRW', base: 'FTM', quote: 'KRW', symbol: 'FTM/KRW', name: 'Fantom', price: 800, change: 4.2, change24hPct: 4.2, volume24h: 6000000000 },
  { id: 'ALGO-KRW', base: 'ALGO', quote: 'KRW', symbol: 'ALGO/KRW', name: 'Algorand', price: 450, change: 1.8, change24hPct: 1.8, volume24h: 5000000000 },
  { id: 'VET-KRW', base: 'VET', quote: 'KRW', symbol: 'VET/KRW', name: 'VeChain', price: 120, change: 2.5, change24hPct: 2.5, volume24h: 4000000000 },
  { id: 'ICP-KRW', base: 'ICP', quote: 'KRW', symbol: 'ICP/KRW', name: 'Internet Computer', price: 8500, change: -0.8, change24hPct: -0.8, volume24h: 3500000000 },
  { id: 'FLOW-KRW', base: 'FLOW', quote: 'KRW', symbol: 'FLOW/KRW', name: 'Flow', price: 1200, change: 1.2, change24hPct: 1.2, volume24h: 3000000000 },
  { id: 'MANA-KRW', base: 'MANA', quote: 'KRW', symbol: 'MANA/KRW', name: 'Decentraland', price: 850, change: 3.1, change24hPct: 3.1, volume24h: 2500000000 },
  { id: 'SAND-KRW', base: 'SAND', quote: 'KRW', symbol: 'SAND/KRW', name: 'The Sandbox', price: 1200, change: 2.8, change24hPct: 2.8, volume24h: 2000000000 },
  { id: 'AXS-KRW', base: 'AXS', quote: 'KRW', symbol: 'AXS/KRW', name: 'Axie Infinity', price: 8500, change: 1.5, change24hPct: 1.5, volume24h: 1800000000 },
  { id: 'CHZ-KRW', base: 'CHZ', quote: 'KRW', symbol: 'CHZ/KRW', name: 'Chiliz', price: 450, change: 2.2, change24hPct: 2.2, volume24h: 1500000000 },
  { id: 'ENJ-KRW', base: 'ENJ', quote: 'KRW', symbol: 'ENJ/KRW', name: 'Enjin Coin', price: 1200, change: 1.8, change24hPct: 1.8, volume24h: 1200000000 },
  { id: 'BAT-KRW', base: 'BAT', quote: 'KRW', symbol: 'BAT/KRW', name: 'Basic Attention Token', price: 850, change: 0.9, change24hPct: 0.9, volume24h: 1000000000 },
  { id: 'ZRX-KRW', base: 'ZRX', quote: 'KRW', symbol: 'ZRX/KRW', name: '0x Protocol', price: 1200, change: 1.2, change24hPct: 1.2, volume24h: 800000000 },
  { id: 'COMP-KRW', base: 'COMP', quote: 'KRW', symbol: 'COMP/KRW', name: 'Compound', price: 45000, change: -0.5, change24hPct: -0.5, volume24h: 700000000 },
  { id: 'MKR-KRW', base: 'MKR', quote: 'KRW', symbol: 'MKR/KRW', name: 'Maker', price: 180000, change: 2.1, change24hPct: 2.1, volume24h: 600000000 },
  { id: 'SNX-KRW', base: 'SNX', quote: 'KRW', symbol: 'SNX/KRW', name: 'Synthetix', price: 3500, change: 1.8, change24hPct: 1.8, volume24h: 500000000 },
  { id: 'YFI-KRW', base: 'YFI', quote: 'KRW', symbol: 'YFI/KRW', name: 'Yearn.finance', price: 8500000, change: 3.2, change24hPct: 3.2, volume24h: 400000000 },
  { id: 'UMA-KRW', base: 'UMA', quote: 'KRW', symbol: 'UMA/KRW', name: 'UMA', price: 1200, change: 1.5, change24hPct: 1.5, volume24h: 300000000 },
  { id: 'LRC-KRW', base: 'LRC', quote: 'KRW', symbol: 'LRC/KRW', name: 'Loopring', price: 850, change: 2.8, change24hPct: 2.8, volume24h: 250000000 },
  { id: 'REN-KRW', base: 'REN', quote: 'KRW', symbol: 'REN/KRW', name: 'Ren', price: 450, change: 1.2, change24hPct: 1.2, volume24h: 200000000 },
  { id: 'KNC-KRW', base: 'KNC', quote: 'KRW', symbol: 'KNC/KRW', name: 'Kyber Network', price: 1200, change: 0.8, change24hPct: 0.8, volume24h: 180000000 },
  { id: 'BAL-KRW', base: 'BAL', quote: 'KRW', symbol: 'BAL/KRW', name: 'Balancer', price: 3500, change: 2.1, change24hPct: 2.1, volume24h: 150000000 },
  { id: 'CRV-KRW', base: 'CRV', quote: 'KRW', symbol: 'CRV/KRW', name: 'Curve DAO Token', price: 850, change: 1.8, change24hPct: 1.8, volume24h: 120000000 },
  { id: '1INCH-KRW', base: '1INCH', quote: 'KRW', symbol: '1INCH/KRW', name: '1inch', price: 1200, change: 2.5, change24hPct: 2.5, volume24h: 100000000 },
  { id: 'SUSHI-KRW', base: 'SUSHI', quote: 'KRW', symbol: 'SUSHI/KRW', name: 'SushiSwap', price: 1800, change: 1.2, change24hPct: 1.2, volume24h: 80000000 },
  { id: 'UNI-KRW', base: 'UNI', quote: 'KRW', symbol: 'UNI/KRW', name: 'Uniswap', price: 8500, change: 3.1, change24hPct: 3.1, volume24h: 60000000 },
  { id: 'AAVE-KRW', base: 'AAVE', quote: 'KRW', symbol: 'AAVE/KRW', name: 'Aave', price: 120000, change: 2.8, change24hPct: 2.8, volume24h: 50000000 },
  { id: 'GRT-KRW', base: 'GRT', quote: 'KRW', symbol: 'GRT/KRW', name: 'The Graph', price: 450, change: 1.8, change24hPct: 1.8, volume24h: 30000000 },
  { id: 'LUNA-KRW', base: 'LUNA', quote: 'KRW', symbol: 'LUNA/KRW', name: 'Terra', price: 12000, change: 4.2, change24hPct: 4.2, volume24h: 25000000 },
  { id: 'MIR-KRW', base: 'MIR', quote: 'KRW', symbol: 'MIR/KRW', name: 'Mirror Protocol', price: 850, change: 2.1, change24hPct: 2.1, volume24h: 20000000 },
  { id: 'ANC-KRW', base: 'ANC', quote: 'KRW', symbol: 'ANC/KRW', name: 'Anchor Protocol', price: 1200, change: 1.8, change24hPct: 1.8, volume24h: 15000000 },
  { id: 'UST-KRW', base: 'UST', quote: 'KRW', symbol: 'UST/KRW', name: 'TerraUSD', price: 1200, change: 0.1, change24hPct: 0.1, volume24h: 10000000 },
  { id: 'KAVA-KRW', base: 'KAVA', quote: 'KRW', symbol: 'KAVA/KRW', name: 'Kava', price: 3500, change: 2.5, change24hPct: 2.5, volume24h: 8000000 },
  { id: 'BAND-KRW', base: 'BAND', quote: 'KRW', symbol: 'BAND/KRW', name: 'Band Protocol', price: 4500, change: 1.2, change24hPct: 1.2, volume24h: 6000000 },
  { id: 'WBTC-KRW', base: 'WBTC', quote: 'KRW', symbol: 'WBTC/KRW', name: 'Wrapped Bitcoin', price: 45000000, change: 2.5, change24hPct: 2.5, volume24h: 5000000 },
  { id: 'USDT-KRW', base: 'USDT', quote: 'KRW', symbol: 'USDT/KRW', name: 'Tether', price: 1200, change: 0.0, change24hPct: 0.0, volume24h: 2000000000000 },
  { id: 'USDC-KRW', base: 'USDC', quote: 'KRW', symbol: 'USDC/KRW', name: 'USD Coin', price: 1200, change: 0.0, change24hPct: 0.0, volume24h: 800000000000 },
  { id: 'DAI-KRW', base: 'DAI', quote: 'KRW', symbol: 'DAI/KRW', name: 'Dai', price: 1200, change: 0.1, change24hPct: 0.1, volume24h: 100000000000 },
  { id: 'YOY-KRW', base: 'YOY', quote: 'KRW', symbol: 'YOY/KRW', name: 'YooY Land', price: 150, change: 3.45, change24hPct: 3.45, volume24h: 1250000 },
];


