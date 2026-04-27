import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';

const REGION = String(process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || '').trim();

function fns() {
  return REGION ? getFunctions(firebaseApp, REGION) : getFunctions(firebaseApp);
}

export async function adminSetInternalYoyTreasuryUid(uid: string): Promise<{ ok: boolean; uid?: string; error?: string }> {
  try {
    const fn = httpsCallable(fns(), 'adminSetInternalYoyTreasuryUidV1');
    const res: any = await fn({ uid });
    const data = (res?.data || {}) as any;
    if (data?.ok) return { ok: true, uid: String(data.uid || uid) };
    return { ok: false, error: String(data?.error || 'failed') };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e || 'failed') };
  }
}

