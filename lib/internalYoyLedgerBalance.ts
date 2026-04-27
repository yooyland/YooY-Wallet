import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';

/** Firestore `internal_yoy_balances/{uid}` — 내부 YOY 단일 소스 */
export async function fetchInternalYoyLedgerBalance(uid: string): Promise<number> {
  if (!uid) return 0;
  try {
    const snap = await getDoc(doc(firestore, 'internal_yoy_balances', uid));
    if (!snap.exists()) return 0;
    const n = Number((snap.data() as any)?.balanceYoy ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}
