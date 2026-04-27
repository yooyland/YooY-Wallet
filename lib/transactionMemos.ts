import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseAuth, firestore } from '@/lib/firebase';

function uidOrThrow(uid?: string): string {
  const u = String(uid || (firebaseAuth as any)?.currentUser?.uid || '').trim();
  if (!u) throw new Error('not_logged_in');
  return u;
}

export async function saveTransactionMemo(txId: string, memo: string, uid?: string): Promise<void> {
  const u = uidOrThrow(uid);
  const id = String(txId || '').trim();
  if (!id) return;
  const text = String(memo || '').slice(0, 1000);
  await setDoc(
    doc(firestore, 'users', u, 'transactionMemos', id),
    {
      memo: text,
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
}

export async function loadTransactionMemo(txId: string, uid?: string): Promise<string> {
  const u = uidOrThrow(uid);
  const id = String(txId || '').trim();
  if (!id) return '';
  const snap = await getDoc(doc(firestore, 'users', u, 'transactionMemos', id));
  if (!snap.exists()) return '';
  const data: any = snap.data() || {};
  return String(data.memo || '').slice(0, 1000);
}

export async function loadTransactionMemosBulk(
  txIds: string[],
  uid?: string,
  opts?: { concurrency?: number }
): Promise<Record<string, string>> {
  const u = uidOrThrow(uid);
  const ids = Array.from(new Set((txIds || []).map((x) => String(x || '').trim()).filter(Boolean)));
  const out: Record<string, string> = {};
  if (!ids.length) return out;

  const conc = Math.max(1, Math.min(20, Math.floor(opts?.concurrency ?? 8)));
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const i = idx++;
      if (i >= ids.length) return;
      const id = ids[i];
      try {
        const snap = await getDoc(doc(firestore, 'users', u, 'transactionMemos', id));
        if (!snap.exists()) continue;
        const data: any = snap.data() || {};
        const memo = String(data.memo || '').slice(0, 1000);
        if (memo) out[id] = memo;
      } catch {
        /* ignore */
      }
    }
  };
  await Promise.all(Array.from({ length: conc }).map(() => worker()));
  return out;
}

