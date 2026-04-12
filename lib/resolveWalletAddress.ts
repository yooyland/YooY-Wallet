/**
 * 현재 세션 기준 지갑 주소 해석: WC 연결 > 로컬 HD 지갑 > AsyncStorage(계정별 → 레거시 전역).
 * 유효한 0x 주소가 없으면 null (다른 주소로 대체하지 않음).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WcStateLike = { connected?: boolean; address?: string | null } | null | undefined;

export async function resolveWalletAddressForUser(
  wc: WcStateLike,
  uid: string | null | undefined,
): Promise<string | null> {
  try {
    const wcAddr = wc?.connected && wc?.address ? String(wc.address).trim() : '';
    if (wcAddr && /^0x[a-fA-F0-9]{40}$/i.test(wcAddr)) {
      return wcAddr;
    }
  } catch {}

  try {
    const { getLocalWallet } = await import('@/src/wallet/wallet');
    const local = await getLocalWallet().catch(() => null);
    const a = local?.address ? String(local.address).trim() : '';
    if (a && /^0x[a-fA-F0-9]{40}$/i.test(a)) {
      return a;
    }
  } catch {}

  try {
    const scoped = uid ? `u:${uid}:wallet.lastKnownAddress` : null;
    const saved = scoped ? await AsyncStorage.getItem(scoped) : null;
    const legacy = await AsyncStorage.getItem('wallet.lastKnownAddress');
    const a = (saved || legacy || '').trim();
    if (a && /^0x[a-fA-F0-9]{40}$/i.test(a)) {
      return a;
    }
  } catch {}

  return null;
}
