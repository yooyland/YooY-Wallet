/**
 * Attachment / composer action tracing (release-safe console).
 * Prefix: [YY_CHAT_ATTACH]
 * 실패 시 `error`와 동일한 문자열을 `errorMessage`에도 넣어 추적을 쉽게 함.
 */
export function logAttach(event: string, payload: Record<string, unknown> = {}) {
  try {
    const merged: Record<string, unknown> = { event, ts: Date.now(), ...payload };
    const err = merged.error ?? merged.errorMessage;
    if (err != null && merged.errorMessage === undefined) merged.errorMessage = String(err);
    // eslint-disable-next-line no-console
    console.log('[YY_CHAT_ATTACH]', JSON.stringify(merged));
  } catch {}
}
