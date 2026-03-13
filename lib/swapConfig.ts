// Centralized swap configuration for Uniswap v3 (Ethereum Mainnet)
// UI symbols: use ETH (mapped to WETH under the hood)
import { TOKEN_ADDRESSES, WETH_ADDRESS } from '@/lib/uniswap/constants';

export type SwapSymbol = 'YOY' | 'ETH' | 'USDT' | 'USDC';

// Supported tokens for the token selector (UI)
export const SUPPORTED_SWAP_TOKENS: ReadonlyArray<{
  symbol: SwapSymbol;
  name: string;
  decimals: number;
}> = [
  { symbol: 'YOY', name: 'YooY Land', decimals: 18 },
  { symbol: 'ETH', name: 'Ethereum', decimals: 18 }, // UI shows ETH
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
] as const;

// Map UI symbol to on-chain token address (ETH => WETH)
export function getTokenAddressBySymbol(symbol: SwapSymbol): string {
  switch (symbol) {
    case 'YOY': return TOKEN_ADDRESSES.YOY;
    case 'ETH': return WETH_ADDRESS; // wrap for router/quoter
    case 'USDT': return TOKEN_ADDRESSES.USDT;
    case 'USDC': return TOKEN_ADDRESSES.USDC;
    default: throw new Error('Unsupported token symbol');
  }
}

// Allowed pairs: must include YOY
export const ALLOWED_SWAP_PAIRS: ReadonlyArray<readonly [SwapSymbol, SwapSymbol]> = [
  ['YOY', 'ETH'],
  ['ETH', 'YOY'],
  ['YOY', 'USDT'],
  ['USDT', 'YOY'],
  ['YOY', 'USDC'],
  ['USDC', 'YOY'],
] as const;

export function isAllowedPair(a: SwapSymbol, b: SwapSymbol): boolean {
  if (a === b) return false;
  return ALLOWED_SWAP_PAIRS.some(([x, y]) => x === a && y === b);
}

