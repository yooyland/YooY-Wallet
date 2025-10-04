// YOY (YooY Land) 코인 정보
// Uniswap V3에서 거래되는 실제 데이터 기반

export const YOY_INFO = {
  name: "YooY Land",
  symbol: "YOY",
  decimals: 18,
  totalSupply: 10_000_000_000, // 10 Billion
  address: "0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701",
  chainId: 1, // Ethereum Mainnet
  network: "Ethereum",
  verified: true,

  // 🔹 Market Data
  listedOn: ["Uniswap V3", "Etherscan", "DexTools"],
  pair: "YOY / USDC",
  liquidityUSD: 17715857.71,
  poolTokens: 499800000, // YOY in pool
  approximatePriceUSD: 17715857.71 / 499800000, // ≈ $0.03546 per YOY

  // 🔹 Swap Configuration
  uniswap: {
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    feeTier: 3000, // 0.3%
    slippageBps: 50, // 0.5%
  },

  // 🔹 Governance
  governance: "Alpha Contract (VP / Valp system, Blacklist & Whitelist enabled)",
  admin: "YooY Land Team",
  website: "https://yooyland.com",
  whitepaper: "https://yooyland.com/wp-content/whitepaper.pdf",

  // 🔹 Price Feed
  priceFeed: {
    usd: 0.03546,
    krw: 47.5, // approximate (USD/KRW = 1300)
    updatedAt: new Date().toISOString()
  }
};

// YOY 가격을 KRW로 변환
export function getYOYPriceKRW(usdKrwRate: number = 1300): number {
  return YOY_INFO.priceFeed.usd * usdKrwRate;
}

// YOY 가격을 USD로 변환
export function getYOYPriceUSD(): number {
  return YOY_INFO.priceFeed.usd;
}

// YOY 유동성 정보
export function getYOYLiquidityInfo() {
  return {
    totalLiquidityUSD: YOY_INFO.liquidityUSD,
    poolTokens: YOY_INFO.poolTokens,
    pricePerToken: YOY_INFO.approximatePriceUSD
  };
}
