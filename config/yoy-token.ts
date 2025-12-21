// YooY Land (YOY) Token Configuration
// YOY는 Ethereum 메인넷 기반의 ERC-20 토큰입니다.

export const YOY_TOKEN_CONFIG = {
  // 기본 토큰 정보
  TOKEN_NAME: "YooY Land",
  TOKEN_SYMBOL: "YOY",
  TOKEN_DECIMALS: 18,
  TOKEN_TOTAL_SUPPLY: 10000000000, // 10억 × 10 = 100억개
  TOKEN_ADDRESS: "0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701",
  
  // 네트워크 정보
  NETWORK: "ethereum",
  CHAIN_ID: 1, // Ethereum Mainnet
  
  // 거래소 정보
  UNISWAP_POOL: "YOY/WETH (0.3%)",
  BASE_POOL: "YOY / WETH (Uniswap v3, 0.3% 수수료)",
  
  // 관리자 정보
  ADMIN_NAME: "YooY Land Team",
  
  // 토큰 기능
  MINTABLE: true, // 추가 발행 가능 (최대 10,000,000,000개)
  BURNABLE: true, // 소각 기능 가능
  
  // 관리자 기능
  ADMIN_FEATURES: {
    BLACKLIST: true, // 블랙리스트 추가/제거 가능
    WHITELIST_RECOVERY: true, // 화이트리스트 복구 가능 (VP 또는 Valp 권한)
    VESTING: true, // 베스팅 및 클리프 기간 설정 가능
    BLACKLIST_CHECK: true, // Mint, Burn, Transfer 함수 실행 시 블랙리스트 검사 포함
  },
  
  // 거버넌스 구조
  GOVERNANCE: {
    VP: "Virtual Person - 자동화된 최고 결정권자",
    VALP: "Validator Person - 예외 상황 시 인간 검증자 역할",
    ALPHA_CONTRACT: "Alpha Contract 구조 기반 거버넌스 관리",
  },
  
  // 슬로건
  SLOGAN: "유이랜드는 새로운 황금시대를 당신과 함께 시작합니다.",
  SLOGAN_EN: "YooY Land is starting a new golden era with you.",
};

// YOY 토큰이 메인 토큰임을 나타내는 플래그
export const IS_YOY_MAIN_TOKEN = true;

// YOY 토큰 우선순위 (높을수록 우선)
export const YOY_TOKEN_PRIORITY = 1000;

// YOY 토큰 관련 유틸리티 함수들
export const YOY_UTILS = {
  // YOY 토큰인지 확인
  isYOYToken: (symbol: string): boolean => {
    return symbol.toUpperCase() === 'YOY';
  },
  
  // YOY 토큰 주소인지 확인
  isYOYAddress: (address: string): boolean => {
    return address.toLowerCase() === YOY_TOKEN_CONFIG.TOKEN_ADDRESS.toLowerCase();
  },
  
  // YOY 토큰 우선순위 반환
  getYOYPriority: (): number => {
    return YOY_TOKEN_PRIORITY;
  },
  
  // YOY 토큰 정보 반환
  getYOYInfo: () => {
    return YOY_TOKEN_CONFIG;
  },
};













