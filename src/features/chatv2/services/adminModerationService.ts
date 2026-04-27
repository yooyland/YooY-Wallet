import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/lib/firebase';

const REGION = String(process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || '').trim();

function fns() {
  return REGION ? getFunctions(firebaseApp, REGION) : getFunctions(firebaseApp);
}

export async function callAdminDeleteChatRoomV2(input: { roomId: string; reason?: string }): Promise<{ ok: boolean }> {
  const fn = httpsCallable(fns(), 'adminDeleteChatRoomV2');
  const res = await fn({ roomId: input.roomId, reason: input.reason ?? null });
  return res.data as { ok: boolean };
}

export async function callAdminSetUserChatSuspensionV2(input: {
  targetUid: string;
  suspended?: boolean;
  reason?: string;
  /** 0 = 무기한(만료 없음) */
  durationHours?: number;
  /** 비우면 전역 정지 */
  roomId?: string | null;
}): Promise<{ ok: boolean }> {
  const fn = httpsCallable(fns(), 'adminSetUserChatSuspensionV2');
  const res = await fn({
    targetUid: input.targetUid,
    suspended: input.suspended !== false,
    reason: input.reason ?? null,
    durationHours: typeof input.durationHours === 'number' ? input.durationHours : 0,
    roomId: input.roomId ?? null,
  });
  return res.data as { ok: boolean };
}
