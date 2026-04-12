import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { extractFirstOpenableUrl } from '@/src/features/chatv2/core/chatTextLinks';
import { parseYooYLinkV2 } from '@/src/features/chatv2/core/linkRouting';
import { routeFromQrOrLinkV2 } from '@/src/features/chatv2/services/qrLinkService';

export const PENDING_DEEPLINK_KEY = '@pending_deeplink';
export const DEEPLINK_CLAIM_RAW_KEY = '@deeplink_claim_raw';

/** 카카오톡 등 외부는 https, 앱 내부는 커스텀 스킴 — 열 때 우선 처리 */
export function isYooyDeepLinkCandidate(url: string): boolean {
  const s = String(url || '').trim();
  if (!s) return false;
  if (/^yooy:\/\//i.test(s)) return true;
  if (/^yooyland:\/\//i.test(s)) return true;
  if (/^appyooyland:\/\//i.test(s)) return true;
  if (/^https:\/\/(www\.)?yooy\.land\//i.test(s)) return true;
  return false;
}

/**
 * 앱 내부에서 링크를 열 때 사용. 처리했으면 true(또는 대기 큐에 넣었으면 true).
 * false면 시스템 브라우저/Linking.openURL 로 넘기면 됨.
 */
export async function openInternalAppLink(rawUrl: string): Promise<boolean> {
  let url = String(rawUrl || '').trim();
  if (!url) return false;

  try {
    let py = parseYooYLinkV2(url);
    if (py.type === 'unknown') {
      const extracted = extractFirstOpenableUrl(url);
      if (extracted && extracted !== url) {
        url = extracted;
        py = parseYooYLinkV2(url);
      }
    }

    // 기프트 수령 (yooy://claim?id=...)
    if (/yooy:\/\//i.test(url) && /claim/i.test(url)) {
      await AsyncStorage.setItem(DEEPLINK_CLAIM_RAW_KEY, url);
      router.push('/(tabs)/wallet?tab=gift' as any);
      return true;
    }

    if (py.type === 'invite' || py.type === 'room' || py.type === 'dm') {
      const user = firebaseAuth.currentUser;
      if (!user || (user as any).isAnonymous) {
        await AsyncStorage.setItem(PENDING_DEEPLINK_KEY, url);
        return true;
      }
      const routed = await routeFromQrOrLinkV2({ firestore, uid: user.uid, raw: url });
      if (routed.type === 'navigate_room' || routed.type === 'navigate_dm') {
        router.push({ pathname: '/chatv2/room', params: { id: routed.roomId } } as any);
        return true;
      }
    }
  } catch (e) {
    try {
      console.warn('[openInternalAppLink]', e);
      const user = firebaseAuth.currentUser;
      if (!user || (user as any).isAnonymous) {
        await AsyncStorage.setItem(PENDING_DEEPLINK_KEY, url);
      }
    } catch {}
    return true;
  }

  return false;
}
