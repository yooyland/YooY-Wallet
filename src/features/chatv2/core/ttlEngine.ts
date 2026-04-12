import type { ChatMessageV2 } from './messageSchema';
import type { ChatRoomV2 } from './roomSchema';

export const isTtlRoomV2 = (room: Pick<ChatRoomV2, 'type' | 'ttl'>) =>
  room.type === 'ttl' && !!room.ttl?.enabled;

export function getRoomExplodeAtMsV2(room: Pick<ChatRoomV2, 'type' | 'ttl'> & { roomExpiresAt?: number }): number | null {
  if (!isTtlRoomV2(room)) return null;
  const v =
    typeof room.ttl?.explodeRoomAt === 'number'
      ? room.ttl.explodeRoomAt
      : typeof (room as any).roomExpiresAt === 'number'
        ? Number((room as any).roomExpiresAt)
        : null;
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

export function getMessageExpireSecondsV2(room: Pick<ChatRoomV2, 'type' | 'ttl'> & { messageTtlSeconds?: number }): number | null {
  if (!isTtlRoomV2(room)) return null;
  const v =
    typeof room.ttl?.messageExpireSeconds === 'number'
      ? room.ttl.messageExpireSeconds
      : typeof (room as any).messageTtlSeconds === 'number'
        ? Number((room as any).messageTtlSeconds)
        : null;
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

export function computeMessageExpiresAtMsV2(room: Pick<ChatRoomV2, 'type' | 'ttl'>, msg: Pick<ChatMessageV2, 'createdAt'>): number | null {
  const sec = getMessageExpireSecondsV2(room);
  if (!sec) return null;
  const base = Number(msg.createdAt || 0);
  if (!base) return null;
  return base + sec * 1000;
}

export function isMessageExpiredV2(
  room: Pick<ChatRoomV2, 'type' | 'ttl'>,
  msg: Pick<ChatMessageV2, 'createdAt'> & { expiresAt?: number },
  nowMs: number
): boolean {
  const direct = typeof (msg as any).expiresAt === 'number' ? Number((msg as any).expiresAt) : 0;
  if (direct > 0) return nowMs >= direct;
  const exp = computeMessageExpiresAtMsV2(room, msg);
  if (!exp) return false;
  return nowMs >= exp;
}

export function isRoomExplodedV2(room: Pick<ChatRoomV2, 'type' | 'ttl'>, nowMs: number): boolean {
  const explodeAt = getRoomExplodeAtMsV2(room);
  if (!explodeAt) return false;
  return nowMs >= explodeAt;
}

export function getTtlRemainingSecondsV2(room: Pick<ChatRoomV2, 'type' | 'ttl'>, nowMs: number): number {
  const explodeAt = getRoomExplodeAtMsV2(room);
  if (!explodeAt) return 0;
  return Math.max(0, Math.floor((explodeAt - nowMs) / 1000));
}

export function getTtlStatusV2(room: Pick<ChatRoomV2, 'type' | 'ttl'>, nowMs: number): 'active' | 'expired' | 'locked' {
  const stored = String((room as any)?.ttl?.ttlStatus || '').toLowerCase();
  if (stored === 'locked') return 'locked';
  if (stored === 'expired') return 'expired';
  return isRoomExplodedV2(room, nowMs) ? 'expired' : 'active';
}

/**
 * Deterministic TTL filter (UI-side):
 * - for TTL room: drop expired messages
 * - for non-TTL: returns as-is
 */
export function filterVisibleMessagesV2(room: Pick<ChatRoomV2, 'type' | 'ttl'>, messages: ChatMessageV2[], nowMs: number): ChatMessageV2[] {
  if (!isTtlRoomV2(room)) return messages;
  if (!Array.isArray(messages) || messages.length === 0) return [];
  return messages.filter((m) => !isMessageExpiredV2(room, m, nowMs));
}

/**
 * Server cleanup policy placeholder.
 * In production we may back this with Cloud Functions / scheduled cleanup.
 * For now keep it deterministic for UI and write-path decisions only.
 */
export const ttlCleanupPolicyV2 = {
  /** If true, UI should hide room after explodeAt. */
  hideRoomAfterExplosion: true,
  /** If true, UI should hide expired messages. */
  hideExpiredMessages: true,
} as const;

