import type { Firestore } from 'firebase/firestore';
import { doc, getDoc } from 'firebase/firestore';

/**
 * 채팅 UI(목록·방·참석자·말풍선 등)에서 사용자 표시명.
 * - useHashInChat === true → Firebase uid(해시 참가)
 * - 그 외 → chatName(채팅 대화명) 우선, 이후 displayName / nickname
 */
export function resolveChatDisplayNameFromUserDoc(
  userId: string,
  userData: Record<string, unknown> | null | undefined
): string {
  const id = String(userId || '').trim();
  if (!id) return '';
  const d =
    userData && typeof userData === 'object' ? (userData as Record<string, unknown>) : {};
  if (d.useHashInChat === true) return id;
  const chatName = String(d.chatName ?? '').trim();
  const displayName = String(d.displayName ?? '').trim();
  const nickname = String((d as { nickname?: string }).nickname ?? '').trim();
  return chatName || displayName || nickname || id;
}

export async function fetchChatDisplayNameV2(firestore: Firestore, userId: string): Promise<string> {
  const id = String(userId || '').trim();
  if (!id) return '';
  try {
    const snap = await getDoc(doc(firestore, 'users', id));
    if (!snap.exists()) return id;
    return resolveChatDisplayNameFromUserDoc(id, snap.data() as Record<string, unknown>);
  } catch {
    return id;
  }
}
