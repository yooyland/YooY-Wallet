import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';

const REGION = String(process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || '').trim();

function fns(region?: string): Functions {
  const r = String(region || '').trim();
  return r ? getFunctions(firebaseApp, r) : getFunctions(firebaseApp);
}

/** 딥링크 등에 `?ref=` 로 전달된 초대자 Firebase UID (로그인 후 install_welcome 에 사용) */
export const ASYNC_INSTALL_REFERRER_UID_KEY = '@yooy_install_referrer_uid';

export type InternalYoyLedgerResponse = {
  ok: boolean;
  already?: boolean;
  userYoy?: number;
  treasuryYoy?: number;
  inviterCredited?: boolean;
};

export async function callInternalYoyLedgerV1(data: Record<string, unknown>): Promise<InternalYoyLedgerResponse> {
  // Region 오설정 시 `functions/not-found:not-found`가 나올 수 있어,
  // 설정된 region으로 먼저 시도 후 not-found면 기본 region으로 1회 폴백합니다.
  const invoke = async (region?: string) => {
    const fn = httpsCallable(fns(region), 'internalYoyLedgerV1');
    const res = await fn(data);
    return (res.data || {}) as InternalYoyLedgerResponse;
  };

  try {
    return await invoke(REGION || undefined);
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || e || '');
    const isNotFound = code === 'functions/not-found' || msg.includes('functions/not-found') || msg.includes('not-found');
    if (REGION && isNotFound) {
      // fallback: us-central1 (SDK default)
      return await invoke(undefined);
    }
    throw e;
  }
}
