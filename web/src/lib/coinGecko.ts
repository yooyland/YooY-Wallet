/** 단순 시세 조회(정보용). 실패 시 null — 거래 기능 없음 */
export async function fetchYoyUsdPrice(): Promise<number | null> {
  const addr = '0xf999da2b5132ea62a158da8a82f2265a1b1d9701';
  try {
    const u = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addr}&vs_currencies=usd`;
    const r = await fetch(u);
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, { usd?: number }>;
    const row = j[addr];
    const n = Number(row?.usd);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
