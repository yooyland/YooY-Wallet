/**
 * Web 전용 정책 — 거래/주문/스왑/DEX UI는 앱에도 없어야 하며 Web에서도 노출하지 않음.
 * (iOS 제한 플래그는 RN 앱에만 존재; Web은 별도 빌드)
 */
export const WEB_TRADING_DISABLED = true as const;

export const FORBIDDEN_LABELS = [
  'Buy',
  'Sell',
  'Swap',
  'Order',
  'DEX',
  'Exchange',
  'Orderbook',
  '매수',
  '매도',
  '스왑',
  '주문',
] as const;
