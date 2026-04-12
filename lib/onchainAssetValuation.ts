/**
 * 병합/온체인 행의 USD 단가: priceManager 우선, 없으면 컨텍스트 보조 맵(마켓·리워드 토큰 등).
 * 심볼 하드코딩 분기 없이 보조 가격만 주입.
 */
import { getCoinPriceByCurrency } from '@/lib/priceManager';

export function usdUnitPriceForMergedSymbol(
  symbol: string,
  ctx?: { priceBySymbol?: Record<string, number> },
): number {
  const sym = String(symbol || '')
    .toUpperCase()
    .trim();
  if (!sym) return 0;
  const pm = getCoinPriceByCurrency(sym, 'USD') || 0;
  if (pm > 0) return pm;
  const extra = ctx?.priceBySymbol?.[sym];
  return typeof extra === 'number' && Number.isFinite(extra) && extra > 0 ? extra : 0;
}
