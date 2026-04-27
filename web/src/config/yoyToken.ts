/** 앱 `constants/tokens.ts` 의 YOY 메타와 동기 */
export const YOY_TOKEN = {
  name: 'YooY Land',
  symbol: 'YOY',
  chain: 'ethereum' as const,
  address: '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701',
  decimals: 18,
  initialSupply: '10000000000',
  localizedNames: { en: 'YooYLand', ko: '유이랜드' },
};

export const ETHERSCAN_TOKEN_URL = `https://etherscan.io/token/${YOY_TOKEN.address}`;
