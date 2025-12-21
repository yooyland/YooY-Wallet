// Minimal default registry for common tokens per chain
// chainIdHex -> symbol -> { address, decimals }
export const Erc20Registry: Record<string, Record<string, { address: string; decimals: number }>> = {
  // Ethereum mainnet
  '0x1': {
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  },
  // Polygon mainnet
  '0x89': {
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AaCbC5329b0', decimals: 6 },
    USDC: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    DAI:  { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
  },
  // BSC mainnet
  '0x38': {
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    USDC: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
    DAI:  { address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', decimals: 18 },
  },
  // Arbitrum One
  '0xa4b1': {
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    USDC: { address: '0xFF970A61A04b1cA14834A43f5de4533eBDDB5CC8', decimals: 6 }, // USDC.e
    DAI:  { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
  },
  // Optimism
  '0xa': {
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    USDC: { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals: 6 },
    DAI:  { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
  },
  // Avalanche C-Chain
  '0xa86a': {
    USDT: { address: '0x9702230A8ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 }, // USDT.e
    USDC: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 }, // USDC
    DAI:  { address: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', decimals: 18 }, // DAI.e
  },
};

export function getErc20BySymbol(chainIdHex: string | null | undefined, symbol: string): { address: string; decimals: number } | null {
  if (!chainIdHex) return null;
  const reg = Erc20Registry[String(chainIdHex).toLowerCase()] || Erc20Registry[String(chainIdHex)];
  if (!reg) return null;
  return reg[symbol.toUpperCase()] || null;
}


