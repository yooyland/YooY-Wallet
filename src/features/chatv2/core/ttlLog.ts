/**
 * TTL 방 동작/저장/차단 추적 — prefix: [YY_CHAT_TTL]
 */
export function logTtl(event: string, payload: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line no-console
    console.log('[YY_CHAT_TTL]', JSON.stringify({ event, ts: Date.now(), ...payload }));
  } catch {}
}
