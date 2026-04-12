import { parseFirestoreMs } from './firestoreMs';

/** 채팅 말풍선 하단 시간 표시 (로케일: ko) */
export function formatChatMessageTime(createdAtMs: number | undefined): string {
  const n = parseFirestoreMs(createdAtMs);
  if (!n) return '';
  try {
    const d = new Date(n);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

/** 텍스트/첨부 공통: createdAt → updatedAt 순으로 ms 확보, 없으면 `--:--` (Timestamp 호환) */
export function formatMessageTimeLabel(msg: { createdAt?: number | unknown; updatedAt?: number | unknown }): string {
  const c = parseFirestoreMs(msg.createdAt);
  const u = parseFirestoreMs(msg.updatedAt);
  const ms = c > 0 ? c : u > 0 ? u : 0;
  if (!ms) return '--:--';
  return formatChatMessageTime(ms) || '--:--';
}
