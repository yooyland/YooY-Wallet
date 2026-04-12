/**
 * [YY_ROOM] — 방 생성/설정/초대/사진/나가기 등 메타 작업 로그
 */
export function logYyRoom(event: string, payload: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line no-console
    console.log('[YY_ROOM]', JSON.stringify({ event, ts: Date.now(), ...payload }));
  } catch {
    /* noop */
  }
}
