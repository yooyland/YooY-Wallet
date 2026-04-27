import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchInternalYoyLedgerBalance } from '@/lib/internalYoyLedgerBalance';
import priceManager from '@/lib/priceManager';

type BalRow = { symbol: string; amount: number; valueUSD: number; name: string; change24h: number; change24hPct: number };

/** 로컬 조정 중 서버 원장과 이중 합산되던 내부 YOY 항목만 제거 */
export function isInternalYoyMirrorAdjustment(it: {
  symbol?: string;
  type?: string;
  note?: string;
  description?: string;
}): boolean {
  const s = String(it.symbol || '').toUpperCase();
  if (s !== 'YOY') return false;
  const ty = String(it.type || '').toLowerCase();
  const note = String(it.note || it.description || '');
  if (ty === 'daily_reward' || ty === 'event_reward') return true;
  if (ty === 'fee' && (note.includes('TTL') || note.includes('TTL 방'))) return true;
  return false;
}

export async function sanitizeInternalYoyLedgerAdjustments(uid: string): Promise<void> {
  const key = `monitor.local.adjustments:${uid}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const arr: any[] = raw ? JSON.parse(raw) : [];
    const filtered = arr.filter((it) => !isInternalYoyMirrorAdjustment(it));
    if (filtered.length !== arr.length) {
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch {
    /* noop */
  }
}

/** 트랜잭션 스토어에 남아 있는 일일/설치/TTL비 등 — 원장과 중복 합산되면 안 됨 */
export function sumYoyFromInternalMirrorTransactions(txs: any[]): number {
  const positive = new Set([
    'daily_reward',
    'event_reward',
    'reward',
    'manual_adjustment',
    'airdrop',
    'mint',
    'staking',
    'receive',
    'claim',
    'gift_claim',
  ]);
  const negative = new Set(['penalty', 'fee', 'spend', 'payment', 'pay', 'gift_reserve']);
  const skipOnChain = new Set(['deposit', 'withdrawal', 'transfer', 'trade']);
  let sum = 0;
  for (const tx of txs || []) {
    const type = String(tx.type || '').toLowerCase();
    const sym = String((tx as any).symbol || '').toUpperCase();
    if (sym !== 'YOY') continue;
    const isMirror =
      type === 'daily_reward' ||
      type === 'event_reward' ||
      (type === 'fee' && String((tx as any).description || '').includes('TTL'));
    if (!isMirror) continue;
    if (skipOnChain.has(type) && (tx as any).transactionHash) continue;
    let raw = Number((tx as any).change);
    if (!Number.isFinite(raw)) raw = Number((tx as any).amount);
    if (!Number.isFinite(raw) || raw === 0) continue;
    const signed = positive.has(type) ? Math.abs(raw) : negative.has(type) ? -Math.abs(raw) : raw;
    sum += signed;
  }
  return sum;
}

export async function mergeInternalYoyLedgerIntoBalances(uid: string, balancesArray: BalRow[]): Promise<BalRow[]> {
  const ledgerYoy = await fetchInternalYoyLedgerBalance(uid);
  let txs: any[] = [];
  try {
    const { useTransactionStore } = await import('@/src/stores/transaction.store');
    txs = useTransactionStore.getState().getTransactions();
  } catch {
    txs = [];
  }
  const internalTxYoy = sumYoyFromInternalMirrorTransactions(txs);
  const price = priceManager.getCoinPriceByCurrency('YOY', 'USD') || 0;
  const idx = balancesArray.findIndex((b) => String(b.symbol).toUpperCase() === 'YOY');
  if (idx >= 0) {
    const cur = Number(balancesArray[idx].amount || 0);
    const nextAmt = Math.max(0, Number((cur - internalTxYoy + ledgerYoy).toFixed(8)));
    const next = [...balancesArray];
    next[idx] = {
      ...next[idx],
      amount: nextAmt,
      valueUSD: price > 0 ? nextAmt * price : next[idx].valueUSD,
    };
    return next;
  }
  if (ledgerYoy > 0) {
    const amt = Number(ledgerYoy.toFixed(8));
    return [
      ...balancesArray,
      {
        symbol: 'YOY',
        amount: amt,
        valueUSD: price > 0 ? amt * price : 0,
        name: 'YOY',
        change24h: 0,
        change24hPct: 0,
      } as BalRow,
    ];
  }
  return balancesArray;
}
