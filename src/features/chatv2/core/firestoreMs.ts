/**
 * Firestore Timestamp | number | 기타 → 밀리초 (읽음·정렬·표시 공통)
 */
export function parseFirestoreMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  try {
    if (val && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
      const ms = (val as { toMillis: () => number }).toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
    }
  } catch {
    /* noop */
  }
  const n = Number(val as number);
  return Number.isFinite(n) ? n : 0;
}

/** 0이면 null (미설정·파싱 실패) */
export function parseFirestoreMsOrNull(val: unknown): number | null {
  const ms = parseFirestoreMs(val);
  return ms > 0 ? ms : null;
}
