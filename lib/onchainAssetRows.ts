/**
 * 온체인 스냅(심볼 → 수량) → mergeAssets 입력 행 배열.
 */
import { usdUnitPriceForMergedSymbol } from '@/lib/onchainAssetValuation';

export function onChainSnapToAssetRows(
  onChainSnap: Record<string, number>,
  usdToKrwRate: number,
  priceCtx?: { priceBySymbol?: Record<string, number> },
): any[] {
  const out: any[] = [];
  for (const [key, rawAmt] of Object.entries(onChainSnap || {})) {
    const symbol = String(key || '')
      .toUpperCase()
      .trim();
    if (!symbol) continue;
    const amount = Number(rawAmt);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const price = usdUnitPriceForMergedSymbol(symbol, priceCtx);
    const valueUSD = price > 0 ? amount * price : 0;
    const krwValue = valueUSD > 0 ? valueUSD * usdToKrwRate : 0;
    out.push({
      symbol,
      amount,
      valueUSD,
      krwValue,
      name: symbol,
      source: 'onchain' as const,
    });
  }
  return out;
}
