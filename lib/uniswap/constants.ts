/**
 * YooY Land Swap Module - Uniswap Constants
 * Uniswap v3 관련 상수 및 토큰 정보
 */

// Uniswap v3 컨트랙트 주소 (Ethereum Mainnet)
export const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
export const UNISWAP_V3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
export const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

// WETH 주소 (Ethereum Mainnet)
export const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

// YOY 토큰 정보
export const YOY_CONTRACT = '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701';

// 주요 ERC-20 토큰 주소 (Ethereum Mainnet)
export const TOKEN_ADDRESSES = {
  YOY: '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
} as const;

// 토큰 정보 (decimals, symbol, name)
export const TOKEN_INFO = {
  [TOKEN_ADDRESSES.YOY]: { 
    symbol: 'YOY', 
    decimals: 18, 
    name: 'YooY Land',
    logoURI: 'https://example.com/yoy-logo.png'
  },
  [TOKEN_ADDRESSES.WETH]: { 
    symbol: 'WETH', 
    decimals: 18, 
    name: 'Wrapped Ether',
    logoURI: 'https://example.com/weth-logo.png'
  },
  [TOKEN_ADDRESSES.USDT]: { 
    symbol: 'USDT', 
    decimals: 6, 
    name: 'Tether USD',
    logoURI: 'https://example.com/usdt-logo.png'
  },
  [TOKEN_ADDRESSES.USDC]: { 
    symbol: 'USDC', 
    decimals: 6, 
    name: 'USD Coin',
    logoURI: 'https://example.com/usdc-logo.png'
  },
  [TOKEN_ADDRESSES.WBTC]: { 
    symbol: 'WBTC', 
    decimals: 8, 
    name: 'Wrapped Bitcoin',
    logoURI: 'https://example.com/wbtc-logo.png'
  },
  [TOKEN_ADDRESSES.DAI]: { 
    symbol: 'DAI', 
    decimals: 18, 
    name: 'Dai Stablecoin',
    logoURI: 'https://example.com/dai-logo.png'
  },
} as const;

// Uniswap v3 풀 수수료 티어
export const FEE_TIERS = {
  LOW: 500,    // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000,  // 1%
} as const;

// 기본 설정
export const DEFAULT_SLIPPAGE = 0.5; // 0.5%
export const DEFAULT_DEADLINE = 20; // 20분
export const CHAIN_ID = 1; // Ethereum Mainnet

// RPC (Infura)
export const INFURA_PROJECT_ID = process.env.EXPO_PUBLIC_INFURA_PROJECT_ID || '5c8ce9a949d5467392f13938278886fa';
export const INFURA_MAINNET_URL = `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`;

// ERC-20 ABI (필요한 함수만)
export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
] as const;

// Uniswap Router ABI (필요한 함수만)
export const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
] as const;

// Uniswap Quoter ABI
export const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut)',
] as const;









