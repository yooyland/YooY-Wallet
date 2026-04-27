import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import type { Transaction } from '@/src/stores/transaction.store';

export type InternalYoyEvent = {
  id: string;
  action: string;
  deltaYoy: number;
  balanceAfter?: number;
  at?: any;
  meta?: Record<string, any>;
};

function tsToMs(input: any): number {
  try {
    if (!input) return 0;
    if (typeof input === 'number') return input < 1e12 ? Math.floor(input * 1000) : Math.floor(input);
    if (typeof input?.toMillis === 'function') return Math.floor(input.toMillis());
    if (typeof input?.seconds === 'number') return Math.floor(input.seconds * 1000);
    return 0;
  } catch {
    return 0;
  }
}

function mapActionToType(action: string): Transaction['type'] {
  const a = String(action || '').toLowerCase();
  if (a === 'daily_checkin') return 'daily_reward';
  if (a === 'install_welcome') return 'event_reward';
  if (a === 'ref_bonus') return 'event_reward';
  if (a.includes('ttl_') && a.includes('refund')) return 'refund';
  if (a.includes('ttl_') && a.includes('charge')) return 'fee';
  return 'reward';
}

function mapActionToDescription(ev: InternalYoyEvent): string {
  const a = String(ev.action || '').trim();
  if (a === 'daily_checkin') return '일일 출석 보상';
  if (a === 'install_welcome') return '설치 보상';
  if (a === 'ref_bonus') return '추천 보상';
  if (a === 'ttl_create_charge') return 'TTL 방 개설 비용';
  if (a === 'ttl_create_refund') return 'TTL 방 개설 환불';
  if (a === 'ttl_extend_charge') return 'TTL 방 연장 비용';
  if (a === 'ttl_extend_refund') return 'TTL 방 연장 환불';
  return a || 'Reward';
}

export async function fetchInternalYoyEvents(uid: string, maxItems = 200): Promise<InternalYoyEvent[]> {
  if (!uid) return [];
  try {
    const q = query(
      collection(firestore, 'users', uid, 'internalYoyEvents'),
      orderBy('at', 'desc'),
      limit(Math.max(1, Math.min(500, Math.floor(Number(maxItems) || 200))))
    );
    const snap = await getDocs(q);
    const out: InternalYoyEvent[] = [];
    for (const d of snap.docs) {
      const data: any = d.data() || {};
      out.push({
        id: d.id,
        action: String(data.action || ''),
        deltaYoy: Number(data.deltaYoy || 0),
        balanceAfter: data.balanceAfter != null ? Number(data.balanceAfter) : undefined,
        at: data.at,
        meta: data.meta || undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** 누적 보상(일일/설치/추천) 합계 — TTL 수수료/환불 등은 제외 */
export function sumRewardYoyFromInternalEvents(events: InternalYoyEvent[]): number {
  const rewardActions = new Set(['daily_checkin', 'install_welcome', 'ref_bonus']);
  let sum = 0;
  for (const ev of events || []) {
    const a = String(ev?.action || '').trim();
    if (!rewardActions.has(a)) continue;
    const d = Number(ev?.deltaYoy || 0);
    if (!Number.isFinite(d) || d <= 0) continue;
    sum += Math.floor(d);
  }
  return Math.max(0, Math.floor(sum));
}

/** 내부 원장 기준 총수입/총지출/순증감(net) — 모든 delta를 포함(보상/TTL비/환불 등) */
export function sumIncomeSpentNetFromInternalEvents(events: InternalYoyEvent[]): {
  incomeYoy: number;
  spentYoy: number;
  netYoy: number;
} {
  let income = 0;
  let spent = 0;
  for (const ev of events || []) {
    const d = Number(ev?.deltaYoy || 0);
    if (!Number.isFinite(d) || d === 0) continue;
    if (d > 0) income += Math.floor(d);
    else spent += Math.floor(Math.abs(d));
  }
  income = Math.max(0, Math.floor(income));
  spent = Math.max(0, Math.floor(spent));
  return { incomeYoy: income, spentYoy: spent, netYoy: income - spent };
}

export async function fetchInternalYoyEventsAsTransactions(uid: string, maxItems = 200): Promise<Transaction[]> {
  if (!uid) return [];
  try {
    const events = await fetchInternalYoyEvents(uid, maxItems);
    const out: Transaction[] = [];
    for (const ev of events) {
      const ms = tsToMs(ev.at);
      out.push({
        id: `iy:${uid}:${ev.id}`,
        type: mapActionToType(ev.action),
        success: true,
        status: 'completed',
        timestamp: ms ? new Date(ms).toISOString() : new Date().toISOString(),
        timestampMs: ms || undefined,
        symbol: 'YOY',
        amount: Math.abs(Number(ev.deltaYoy || 0)),
        change: Number(ev.deltaYoy || 0),
        description: mapActionToDescription(ev),
        source: 'internal_ledger',
        memo: ev.meta ? JSON.stringify(ev.meta).slice(0, 300) : undefined,
      } as any);
    }
    return out;
  } catch {
    return [];
  }
}

