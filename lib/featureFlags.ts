// Centralized feature flags for store-safe builds

const envBool = (key: string, defaultValue: boolean) => {
  const v = (process.env[key] || '').toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return defaultValue;
};

// 개발 기본: 기능 ON (스토어 빌드에서만 false로 전환)
export const ORDER_ENABLED = envBool('EXPO_PUBLIC_ORDER_ENABLED', true);
export const STAKING_ENABLED = envBool('EXPO_PUBLIC_STAKING_ENABLED', true);
export const SHOP_ENABLED = envBool('EXPO_PUBLIC_SHOP_ENABLED', true);
export const NFT_TRADE_ENABLED = envBool('EXPO_PUBLIC_NFT_TRADE_ENABLED', true);
export const SOCIAL_LOGIN_ENABLED = envBool('EXPO_PUBLIC_SOCIAL_LOGIN_ENABLED', true);
export const BARCODE_ENABLED = envBool('EXPO_PUBLIC_BARCODE_ENABLED', true);

export const STORE_SAFE_MODE = !ORDER_ENABLED || !STAKING_ENABLED || !SHOP_ENABLED || !NFT_TRADE_ENABLED;


