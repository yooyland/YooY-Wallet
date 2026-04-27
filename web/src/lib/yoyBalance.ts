import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@web/firebase/config';

export function subscribeInternalYoyBalance(uid: string, cb: (balanceYoy: number) => void) {
  const r = doc(db, 'internal_yoy_balances', uid);
  return onSnapshot(r, (snap) => {
    if (!snap.exists()) {
      cb(0);
      return;
    }
    const n = Number((snap.data() as { balanceYoy?: number })?.balanceYoy ?? 0);
    cb(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  });
}
