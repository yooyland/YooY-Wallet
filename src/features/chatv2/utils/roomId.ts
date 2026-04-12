/**
 * Chat v2 roomId — Firestore 경로 오염(.fieldPaths=..., updateMask=...) 방지.
 * 정책: 표준 UUID(하이픈 포함)만 허용.
 */

export const ROOM_ID_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BAD_SUBSTRINGS = ['.fieldPaths', 'updateMask.fieldPaths', 'updateMask', 'fieldPaths'];

export type RoomIdDevLogKind = 'ROOM_ID_INPUT' | 'ROOM_ID_NORMALIZED' | 'ROOM_ID_REJECTED' | 'ROOM_ID_WRITE';

export function roomIdDevLog(kind: RoomIdDevLogKind, payload: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line no-undef
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    // eslint-disable-next-line no-console
    console.log(`[${kind}]`, JSON.stringify({ ...payload, t: Date.now() }));
  } catch {
    /* noop */
  }
}

function hasForbiddenChars(s: string): boolean {
  if (s.includes('?') || s.includes('&') || s.includes('=') || s.includes('/')) return true;
  const lower = s.toLowerCase();
  for (const b of BAD_SUBSTRINGS) {
    if (lower.includes(b.toLowerCase())) return true;
  }
  return false;
}

/**
 * 라우트·외부 입력을 정제. 실패 시 null.
 */
export function normalizeRoomId(raw: unknown, context?: string): string | null {
  roomIdDevLog('ROOM_ID_INPUT', { raw: raw === undefined ? 'undefined' : raw === null ? 'null' : String(raw), context: context || '' });
  if (raw === undefined || raw === null) {
    roomIdDevLog('ROOM_ID_REJECTED', { reason: 'nullish', context: context || '' });
    return null;
  }
  const s0 = typeof raw === 'string' ? raw : String(raw);
  const s = s0.trim();
  if (!s) {
    roomIdDevLog('ROOM_ID_REJECTED', { reason: 'empty', context: context || '' });
    return null;
  }
  if (hasForbiddenChars(s)) {
    roomIdDevLog('ROOM_ID_REJECTED', { reason: 'forbidden_char_or_substring', value: s.slice(0, 200), context: context || '' });
    return null;
  }
  if (!ROOM_ID_UUID_REGEX.test(s)) {
    roomIdDevLog('ROOM_ID_REJECTED', { reason: 'not_uuid', value: s.slice(0, 200), context: context || '' });
    return null;
  }
  roomIdDevLog('ROOM_ID_NORMALIZED', { normalized: s, context: context || '' });
  return s;
}

export class InvalidRoomIdError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = 'InvalidRoomIdError';
  }
}

/**
 * Firestore 경로에 쓰기 직전 — 실패 시 throw.
 */
export function assertValidRoomId(roomId: string, context?: string): string {
  const n = normalizeRoomId(roomId, context || 'assertValidRoomId');
  if (n === null) {
    roomIdDevLog('ROOM_ID_REJECTED', { reason: 'assert_failed', raw: String(roomId).slice(0, 200), context: context || '' });
    throw new InvalidRoomIdError(`invalid_room_id:${context || 'unknown'}`, String(roomId));
  }
  return n;
}

/** write 직전 로그 (개발 모드) */
export function logRoomIdWrite(op: string, roomId: string, pathHint?: string): void {
  roomIdDevLog('ROOM_ID_WRITE', { op, roomId, pathHint: pathHint || '' });
}
