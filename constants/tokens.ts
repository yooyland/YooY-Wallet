export type TokenMetadata = {
  name: string;
  symbol: string;
  chain: 'ethereum';
  standard: 'erc20';
  address: `0x${string}`;
  decimals: number;
  initialSupply: string; // as string to avoid precision issues
  mintable: boolean;
  burnable: boolean;
  governance: {
    type: 'alpha';
    description: string;
    features: Array<'meta-governance' | 'vp' | 'valp' | 'blacklist' | 'whitelist'>;
  };
  registrations: {
    etherscan: 'pending' | 'registered' | 'unknown';
    uniswap: 'pending' | 'listed' | 'unknown';
    trustwallet: 'pending' | 'listed' | 'unknown';
    cmc: 'pending' | 'listed' | 'unknown';
  };
  localizedNames: {
    en: string;
    ko: string;
  };
};

export const YOY_TOKEN: TokenMetadata = {
  name: 'YooY Land',
  symbol: 'YOY',
  chain: 'ethereum',
  standard: 'erc20',
  address: '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701',
  decimals: 18,
  initialSupply: '10000000000',
  mintable: true,
  burnable: true,
  governance: {
    type: 'alpha',
    description: 'Alpha Contract with meta-governance, VP/Valp roles, blacklist/whitelist',
    features: ['meta-governance', 'vp', 'valp', 'blacklist', 'whitelist'],
  },
  registrations: {
    etherscan: 'pending',
    uniswap: 'pending',
    trustwallet: 'pending',
    cmc: 'pending',
  },
  localizedNames: {
    en: 'YooYLand',
    ko: '유이랜드',
  },
};


