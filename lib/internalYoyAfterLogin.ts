import AsyncStorage from '@react-native-async-storage/async-storage';
import { callInternalYoyLedgerV1, ASYNC_INSTALL_REFERRER_UID_KEY } from '@/lib/internalYoyLedger';
import { useMonitorStore } from '@/lib/monitorStore';

/** 로그인 직후 1회: 설치 보상(3 YOY) + 선택 시 초대자 보상(2 YOY) — Firestore 원장만 갱신, 잔액은 syncMe에서 원장 기준 반영 */
export async function processInternalYoyAfterLogin(uid: string): Promise<void> {
  let referrerUid: string | undefined;
  try {
    const raw = (await AsyncStorage.getItem(ASYNC_INSTALL_REFERRER_UID_KEY)) || '';
    const t = String(raw).trim();
    if (t && t !== uid) referrerUid = t;
  } catch {
    /* noop */
  }
  try {
    const res = await callInternalYoyLedgerV1({
      action: 'install_welcome',
      referrerUid: referrerUid || undefined,
    });
    if (!res?.ok) return;
    if (res.already) {
      await AsyncStorage.removeItem(ASYNC_INSTALL_REFERRER_UID_KEY).catch(() => {});
      return;
    }
    await AsyncStorage.removeItem(ASYNC_INSTALL_REFERRER_UID_KEY).catch(() => {});
    try {
      await useMonitorStore.getState().syncMe('[internalYoy][install]', { force: true });
    } catch {}
  } catch {
    /* 네트워크 실패 시 ref 유지해 재시도 가능 */
  }
}
