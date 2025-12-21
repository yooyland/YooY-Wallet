// 관리되는 주요 코인 데이터
export interface ManagedCoin {
  symbol: string;
  name: string;
  koreanName: string;
  logo: string;
  markets: string[]; // 지원하는 마켓 (KRW, USDT, BTC, ETH)
  isActive: boolean;
  order: number; // 표시 순서
}

// 주요 코인 목록 (지갑 생성 가능한 모든 코인)
export const managedCoins: ManagedCoin[] = [
  {
    symbol: 'YOY',
    name: 'YooY Land',
    koreanName: '유이랜드',
    logo: 'yoy',
    markets: ['KRW', 'USDT', 'BTC', 'ETH'],
    isActive: true,
    order: 1
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    koreanName: '비트코인',
    logo: 'btc',
    markets: ['KRW', 'USDT', 'BTC', 'ETH'],
    isActive: true,
    order: 2
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    koreanName: '이더리움',
    logo: 'eth',
    markets: ['KRW', 'USDT', 'BTC', 'ETH'],
    isActive: true,
    order: 3
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    koreanName: '솔라나',
    logo: 'sol',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 4
  },
  {
    symbol: 'DOT',
    name: 'Polkadot',
    koreanName: '폴카닷',
    logo: 'dot',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 5
  },
  {
    symbol: 'BNB',
    name: 'Binance Coin',
    koreanName: '바이낸스코인',
    logo: 'bnb',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 6
  },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    koreanName: '아발란체',
    logo: 'avax',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 7
  },
  {
    symbol: 'XMR',
    name: 'Monero',
    koreanName: '모네로',
    logo: 'xmr',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 8
  },
  {
    symbol: 'LTC',
    name: 'Litecoin',
    koreanName: '라이트코인',
    logo: 'ltc',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 9
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    koreanName: '체인링크',
    logo: 'link',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 10
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    koreanName: '에이다',
    logo: 'ada',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 11
  },
  {
    symbol: 'ATOM',
    name: 'Cosmos',
    koreanName: '코스모스',
    logo: 'atom',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 12
  },
  {
    symbol: 'XLM',
    name: 'Stellar',
    koreanName: '스텔라',
    logo: 'xlm',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 13
  },
  {
    symbol: 'XRP',
    name: 'Ripple',
    koreanName: '리플',
    logo: 'xrp',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 14
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    koreanName: '도지코인',
    logo: 'doge',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 15
  },
  {
    symbol: 'TRX',
    name: 'TRON',
    koreanName: '트론',
    logo: 'trx',
    markets: ['KRW', 'USDT'],
    isActive: true,
    order: 16
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    koreanName: '테더',
    logo: 'usdt',
    markets: ['KRW', 'USDT', 'BTC', 'ETH'],
    isActive: true,
    order: 17
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    koreanName: 'USD코인',
    logo: 'usdc',
    markets: ['KRW', 'USDT', 'BTC', 'ETH'],
    isActive: true,
    order: 18
  }
];

// 마켓별 활성 코인 가져오기
export const getCoinsByMarket = (market: string): ManagedCoin[] => {
  return managedCoins
    .filter(coin => coin.isActive && coin.markets.includes(market))
    .sort((a, b) => a.order - b.order);
};

// 심볼로 코인 정보 가져오기
export const getCoinBySymbol = (symbol: string): ManagedCoin | undefined => {
  return managedCoins.find(coin => coin.symbol === symbol && coin.isActive);
};

// 모든 활성 코인 가져오기
export const getAllActiveCoins = (): ManagedCoin[] => {
  return managedCoins.filter(coin => coin.isActive).sort((a, b) => a.order - b.order);
};

// 코인 로고 경로 생성
export const getCoinLogoPath = (symbol: string): any => {
  const coin = getCoinBySymbol(symbol);
  if (!coin) {
    // 기본 로고가 없으면 업비트 로고 사용
    return { uri: `https://static.upbit.com/logos/${symbol}.png` };
  }
  
  // YOY는 특별 처리
  if (symbol === 'YOY') {
    return require('@/assets/images/yoy.png');
  }
  
  // 다른 코인들은 업비트 로고 사용
  return { uri: `https://static.upbit.com/logos/${symbol}.png` };
};

// 언어에 따른 코인 이름 가져오기
export const getCoinDisplayName = (symbol: string, language: 'ko' | 'en'): string => {
  const coin = getCoinBySymbol(symbol);
  if (!coin) return symbol;
  
  return language === 'ko' ? coin.koreanName : coin.name;
};
