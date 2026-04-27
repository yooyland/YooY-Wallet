// Centralized feature flags for store-safe builds
import { Platform } from 'react-native';

const envBool = (key: string, defaultValue: boolean) => {
  const v = (process.env[key] || '').toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return defaultValue;
};

/**
 * Web(브라우저) 거래/스왑/주문 UI 차단 플래그.
 * - 기본값: false (웹도 안드로이드와 동일 UI 사용)
 * - 필요 시 env로 강제 차단: EXPO_PUBLIC_WEB_TRADE_BLOCKED=true
 */
export const WEB_TRADE_BLOCKED = Platform.OS === 'web' && envBool('EXPO_PUBLIC_WEB_TRADE_BLOCKED', false);

// 주문/거래소 관련 env (플랫폼 공통; EAS iOS 빌드에서는 ios.env로 false 강제 가능)
export const ORDER_ENABLED = WEB_TRADE_BLOCKED ? false : envBool('EXPO_PUBLIC_ORDER_ENABLED', true);
export const STAKING_ENABLED = envBool('EXPO_PUBLIC_STAKING_ENABLED', true);

/**
 * 거래소(exchange) 탭·라우트·딥링크.
 * iOS는 코드 레벨에서 항상 비활성(ORDER와 무관). Android/Web은 ORDER_ENABLED 따름.
 */
export const EXCHANGE_UI_ENABLED = !WEB_TRADE_BLOCKED && Platform.OS !== 'ios' && ORDER_ENABLED;

/**
 * Uniswap / Payments(스왑) UI·라우팅·쿼트 API용.
 * iOS만 false → 심사용 Wallet 중심. Android는 항상 true(추가 env 없음).
 */
export const SWAP_ENABLED = !WEB_TRADE_BLOCKED && Platform.OS !== 'ios';

/**
 * 중앙화 주문/거래/호가/모의거래 등 "trading" UI.
 * iOS 심사용: 항상 false. Android/Web: ORDER_ENABLED에 따름.
 */
export const TRADING_UI_ENABLED = !WEB_TRADE_BLOCKED && Platform.OS !== 'ios' && ORDER_ENABLED;
export const SHOP_ENABLED = envBool('EXPO_PUBLIC_SHOP_ENABLED', true);
export const NFT_TRADE_ENABLED = envBool('EXPO_PUBLIC_NFT_TRADE_ENABLED', true);
export const SOCIAL_LOGIN_ENABLED = envBool('EXPO_PUBLIC_SOCIAL_LOGIN_ENABLED', true);
export const BARCODE_ENABLED = envBool('EXPO_PUBLIC_BARCODE_ENABLED', true);

export const STORE_SAFE_MODE = !ORDER_ENABLED || !STAKING_ENABLED || !SHOP_ENABLED || !NFT_TRADE_ENABLED;

/**
 * iOS App Store 심사용: 5탭 하단바·거래/마켓 라우트 완전 차단 등.
 * Android/Web에서는 false.
 */
export const IOS_APP_STORE_SHELF = Platform.OS === 'ios';


