/**
 * 온체인 자산 + 내부(모니터/서버) 자산을 심볼 단위로 합산.
 * 최종 보유 표시는 이 결과만 사용한다.
 *
 * 규칙: symbol = toUpperCase().trim(); amount/krwValue/valueUSD 누적;
 * onchainAmount/internalAmount·hasOnchain/hasInternal 소스별 구분 유지.
 */
export type MergedAssetRow = {
  symbol: string;
  amount: number;
  krwValue: number;
  valueUSD: number;
  onchainAmount: number;
  internalAmount: number;
  hasOnchain: boolean;
  hasInternal: boolean;
  name?: string;
  change24h?: number;
  change24hPct?: number;
  [key: string]: unknown;
};

export function mergeAssets(
  onchainAssets: any[],
  internalAssets: any[],
  opts?: { usdToKrw?: number }
): MergedAssetRow[] {
  const usdToKrw = opts?.usdToKrw && opts.usdToKrw > 0 ? opts.usdToKrw : 1300;
  const map = new Map<string, MergedAssetRow>();

  const addAsset = (asset: any, source: 'onchain' | 'internal') => {
    const symbol = String(asset?.symbol || '')
      .toUpperCase()
      .trim();
    if (!symbol) return;

    const amount = Number(asset?.amount ?? asset?.balance ?? 0);
    if (!Number.isFinite(amount) || amount === 0) return;

    let krwValue = Number(asset?.krwValue ?? asset?.valueKrw ?? asset?.krw ?? 0);
    if (!Number.isFinite(krwValue)) krwValue = 0;
    const valueUSD = Number(asset?.valueUSD ?? asset?.usdValue ?? 0);
    if (krwValue === 0 && Number.isFinite(valueUSD) && valueUSD > 0) {
      krwValue = valueUSD * usdToKrw;
    }
    const valueUSDRow = Number.isFinite(valueUSD) ? valueUSD : 0;

    // 주의: ...asset 를 넣으면 asset.amount 가 초기 row.amount 를 덮어써서 이후 += 에 이중 합산됨
    if (!map.has(symbol)) {
      map.set(symbol, {
        symbol,
        amount: 0,
        krwValue: 0,
        valueUSD: 0,
        onchainAmount: 0,
        internalAmount: 0,
        hasOnchain: false,
        hasInternal: false,
        name: (asset as any).name ?? symbol,
        change24h: (asset as any).change24h,
        change24hPct: (asset as any).change24hPct,
        source: (asset as any).source,
      });
    }

    const row = map.get(symbol)!;
    row.amount += amount;
    row.krwValue += krwValue;
    row.valueUSD = Number(row.valueUSD || 0) + valueUSDRow;

    if (source === 'onchain') {
      row.onchainAmount += amount;
      row.hasOnchain = true;
    }
    if (source === 'internal') {
      row.internalAmount += amount;
      row.hasInternal = true;
    }

    map.set(symbol, row);
  };

  (onchainAssets || []).forEach(a => addAsset(a, 'onchain'));
  (internalAssets || []).forEach(a => addAsset(a, 'internal'));

  return Array.from(map.values());
}
