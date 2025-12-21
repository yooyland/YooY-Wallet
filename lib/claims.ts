import { firestore } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';

export type ClaimVoucherMode = 'per_claim' | 'total';
export type TotalPolicy = 'all' | 'equal';

export interface ClaimVoucher {
  id: string;
  createdByEmail: string;
  symbol: string; // e.g., 'YOY'
  mode: ClaimVoucherMode;
  perClaimAmount?: number; // per-claim mode OR total(equal) 계산된 1인당 수령량
  claimLimit?: number; // per-claim: 필수 / total(equal): 필수(인원)
  totalAmount?: number; // total 공통
  remainingAmount?: number; // total 공통
  totalPolicy?: TotalPolicy; // total 분배정책: 'all' | 'equal'
  claimedCount: number;
  claimedTotal: number;
  maxPerUser?: number; // optional, default 1
  expiresAt?: Timestamp | null;
  status: 'active' | 'exhausted' | 'expired' | 'cancelled';
  claims: Array<{
    address: string;
    email?: string;
    amount: number;
    at: Timestamp;
  }>;
  createdAt: Timestamp;
}

const VOUCHERS = collection(firestore, 'claim_vouchers');
const NOTIFS = collection(firestore, 'claim_notifications');

export async function createVoucher(input: {
  createdByEmail: string;
  symbol: string;
  mode: ClaimVoucherMode;
  perClaimAmount?: number;
  claimLimit?: number; // per-claim or total(equal)
  totalAmount?: number; // total
  totalPolicy?: TotalPolicy; // total
  maxPerUser?: number;
  expiresAtISO?: string | null;
}): Promise<ClaimVoucher> {
  const normalizeExpire = (raw?: string | null): Timestamp | null => {
    try {
      if (!raw) return null;
      let s = String(raw).trim();
      if (!s) return null;
      // 허용 형식: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD
      const digits = s.replace(/[^0-9]/g, '');
      if (digits.length === 8) {
        const y = Number(digits.slice(0, 4));
        const m = Number(digits.slice(4, 6)) - 1;
        const d = Number(digits.slice(6, 8));
        const dt = new Date(Date.UTC(y, m, d, 23, 59, 59));
        if (isNaN(dt.getTime())) return null;
        return Timestamp.fromDate(dt);
      }
      // 일반 Date 파서 (표준 ISO 우선)
      const dt = new Date(s);
      if (isNaN(dt.getTime())) return null;
      return Timestamp.fromDate(dt);
    } catch {
      return null;
    }
  };
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ref = doc(VOUCHERS, id);
  const nowTs = serverTimestamp() as Timestamp;
  const expiresAt = normalizeExpire(input.expiresAtISO);
  const base: Omit<ClaimVoucher, 'id'> = {
    createdByEmail: input.createdByEmail,
    symbol: input.symbol,
    mode: input.mode,
    perClaimAmount: undefined,
    claimLimit: undefined,
    totalAmount: undefined,
    remainingAmount: undefined,
    totalPolicy: input.mode === 'total' ? (input.totalPolicy || 'all') : undefined,
    claimedCount: 0,
    claimedTotal: 0,
    maxPerUser: Math.max(1, Math.floor(Number(input.maxPerUser || 1))),
    expiresAt,
    status: 'active',
    claims: [],
    createdAt: nowTs,
  };
  if (input.mode === 'per_claim') {
    base.perClaimAmount = Math.max(0, Number(input.perClaimAmount || 0));
    base.claimLimit = Math.max(1, Math.floor(Number(input.claimLimit || 1)));
  } else {
    const total = Math.max(0, Number(input.totalAmount || 0));
    base.totalAmount = total;
    base.remainingAmount = total;
    const policy: TotalPolicy = input.totalPolicy || 'all';
    base.totalPolicy = policy;
    if (policy === 'equal') {
      const people = Math.max(1, Math.floor(Number(input.claimLimit || 1)));
      base.claimLimit = people;
      const per = people > 0 ? Number((total / people).toFixed(6)) : total;
      base.perClaimAmount = per;
    }
  }
  await setDoc(ref, { ...base, id });
  const snap = await getDoc(ref);
  return snap.data() as ClaimVoucher;
}

export async function getVoucher(id: string): Promise<ClaimVoucher | null> {
  const snap = await getDoc(doc(VOUCHERS, id));
  return snap.exists() ? (snap.data() as ClaimVoucher) : null;
}

export async function claimVoucher(input: {
  id: string;
  recipientAddress: string;
  recipientEmail?: string;
}): Promise<{ amount: number; symbol: string; status: 'ok' } | { error: string; status: 'fail' }> {
  const ref = doc(VOUCHERS, input.id);
  try {
    let awardedAmount = 0;
    let symbol = 'YOY';
    await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('not_found');
      }
      const v = snap.data() as ClaimVoucher;
      symbol = v.symbol || 'YOY';
      // status check
      if (v.status !== 'active') throw new Error('not_active');
      // expiry check
      if (v.expiresAt && v.expiresAt.toMillis() <= Date.now()) {
        tx.update(ref, { status: 'expired' });
        throw new Error('expired');
      }
      // per-user limit
      const already = (v.claims || []).filter(
        (c) =>
          c.address?.toLowerCase() === input.recipientAddress.toLowerCase() ||
          (input.recipientEmail && c.email && c.email === input.recipientEmail)
      ).length;
      const maxPerUser = Math.max(1, Number(v.maxPerUser || 1));
      if (already >= maxPerUser) throw new Error('already_claimed');
      // compute amount
      if (v.mode === 'per_claim') {
        const limit = Math.max(1, Number(v.claimLimit || 1));
        if (v.claimedCount >= limit) {
          tx.update(ref, { status: 'exhausted' });
          throw new Error('exhausted');
        }
        const amt = Math.max(0, Number(v.perClaimAmount || 0));
        if (amt <= 0) throw new Error('invalid_amount');
        awardedAmount = amt;
        tx.update(ref, {
          claimedCount: (v.claimedCount || 0) + 1,
          claimedTotal: (v.claimedTotal || 0) + amt,
          claims: [
            ...(v.claims || []),
            {
              address: input.recipientAddress,
              email: input.recipientEmail || null,
              amount: amt,
              at: serverTimestamp(),
            },
          ],
          status: (v.claimedCount + 1) >= limit ? 'exhausted' : 'active',
        });
      } else {
        // total mode
        const remain = Math.max(0, Number(v.remainingAmount || v.totalAmount || 0));
        if (remain <= 0) {
          tx.update(ref, { status: 'exhausted', remainingAmount: 0 });
          throw new Error('exhausted');
        }
        const policy: TotalPolicy = (v.totalPolicy || 'all');
        if (policy === 'equal') {
          const limit = Math.max(1, Number(v.claimLimit || 1));
          if (v.claimedCount >= limit) {
            tx.update(ref, { status: 'exhausted' });
            throw new Error('exhausted');
          }
          const per = Math.max(0, Number(v.perClaimAmount || 0));
          if (per <= 0) throw new Error('invalid_amount');
          if (remain < per) throw new Error('insufficient_pool');
          awardedAmount = per;
          const nextRemain = Math.max(0, remain - per);
          tx.update(ref, {
            remainingAmount: nextRemain,
            claimedTotal: (v.claimedTotal || 0) + per,
            claimedCount: (v.claimedCount || 0) + 1,
            claims: [
              ...(v.claims || []),
              {
                address: input.recipientAddress,
                email: input.recipientEmail || null,
                amount: per,
                at: serverTimestamp(),
              },
            ],
            status: ((v.claimedCount + 1) >= limit || nextRemain <= 0) ? 'exhausted' : 'active',
          });
        } else {
          // 'all' 정책: 남은 전액 1회 지급
          const amt = remain;
          awardedAmount = amt;
          tx.update(ref, {
            remainingAmount: 0,
            claimedTotal: (v.claimedTotal || 0) + amt,
            claimedCount: (v.claimedCount || 0) + 1,
            claims: [
              ...(v.claims || []),
              {
                address: input.recipientAddress,
                email: input.recipientEmail || null,
                amount: amt,
                at: serverTimestamp(),
              },
            ],
            status: 'exhausted',
          });
        }
      }
    });
    // 수령 알림 생성 (비트랜잭션)
    try {
      const nid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await setDoc(doc(NOTIFS, nid), {
        id: nid,
        voucherId: input.id,
        createdByEmail: undefined, // 채우기 위해 다시 읽기
        amount: awardedAmount,
        address: input.recipientAddress,
        at: serverTimestamp(),
      });
      // createdByEmail 채우기
      const v = await getVoucher(input.id);
      if (v?.createdByEmail) {
        await setDoc(doc(NOTIFS, nid), { createdByEmail: v.createdByEmail }, { merge: true });
      }
    } catch {}
    return { amount: awardedAmount, symbol, status: 'ok' };
  } catch (e: any) {
    const msg = String(e?.message || e || 'claim_failed');
    return { error: msg, status: 'fail' };
  }
}

export function buildClaimUri(id: string): string {
  return `yooy://claim?id=${encodeURIComponent(id)}`;
}

export function parseClaimUri(data: string): { id: string } | null {
  try {
    const raw = String(data || '').trim();
    if (!raw) return null;
    // 1) yooy://claim?id=...
    try {
      const u = new URL(raw);
      // yooy://claim?id=...
      if (u.protocol === 'yooy:' && (!u.hostname || u.hostname === 'claim')) {
        const id1 = u.searchParams.get('id') || '';
        if (id1) return { id: id1 };
      }
      // 2) https://.../claim?id=... 또는 /claim/<id>
      if (/^https?:/i.test(u.protocol)) {
        const id2 = u.searchParams.get('id') || '';
        if (id2) return { id: id2 };
        const m = u.pathname.match(/\/claim\/([A-Za-z0-9_-]+)/);
        if (m && m[1]) return { id: m[1] };
      }
    } catch {}
    // 3) 단순 ID만 붙여넣은 경우 (영숫자/언더스코어/하이픈 8자 이상)
    const plain = raw.replace(/[^A-Za-z0-9_-]/g, '');
    if (plain.length >= 8) return { id: plain };
    return null;
  } catch {
    return null;
  }
}


// 종료된 바우처만 삭제(생성자만 허용)
export async function deleteVoucher(input: { id: string; requestedByEmail: string }): Promise<{ ok: true } | { error: string }> {
  try {
    const ref = doc(VOUCHERS, input.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { error: 'not_found' };
    const v = snap.data() as ClaimVoucher;
    if (v.createdByEmail !== input.requestedByEmail) return { error: 'forbidden' };
    if (v.status !== 'cancelled') return { error: 'not_cancelled' };
    await deleteDoc(ref);
    return { ok: true };
  } catch (e: any) {
    return { error: String(e?.message || 'delete_failed') };
  }
}

// 이벤트 종료(취소) 규칙:
// - 생성자만 가능
// - 현재 상태가 active 인 경우만
// - 진행률이 0% (수령 0건) 이거나 80% 이상일 때 허용
//   per_claim  : claimedCount / claimLimit
//   total 모드 : claimedTotal / totalAmount
export async function endVoucher(input: {
  id: string;
  requestedByEmail: string;
}): Promise<{ ok: true } | { error: string }> {
  const ref = doc(VOUCHERS, input.id);
  try {
    await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('not_found');
      }
      const v = snap.data() as ClaimVoucher;
      if (v.createdByEmail !== input.requestedByEmail) {
        throw new Error('forbidden');
      }
      if (v.status !== 'active') {
        throw new Error('not_active');
      }
      // 진행률 계산
      let ratio = 0;
      if (v.mode === 'per_claim') {
        const limit = Math.max(1, Number(v.claimLimit || 1));
        ratio = Math.max(0, Math.min(1, (v.claimedCount || 0) / limit));
      } else {
        const total = Math.max(1, Number(v.totalAmount || 1));
        ratio = Math.max(0, Math.min(1, (v.claimedTotal || 0) / total));
      }
      const noProgress = (v.claimedCount || 0) === 0;
      const canEnd = noProgress || ratio >= 0.8;
      if (!canEnd) {
        throw new Error('cannot_end');
      }
      tx.update(ref, { status: 'cancelled' });
    });
    return { ok: true };
  } catch (e: any) {
    return { error: String(e?.message || 'end_failed') };
  }
}

