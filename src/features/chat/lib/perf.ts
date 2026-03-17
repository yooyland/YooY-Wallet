// src/features/chat/lib/perf.ts
// 경량 채팅 퍼포먼스 로거 (개발 모드 전용)

const PERF_PREFIX = '[YY_CHAT_PERF]';

type PerfPhase =
  | 'room_list_load_start'
  | 'room_list_load_done'
  | 'room_open_start'
  | 'room_open_first_messages'
  | 'room_first_render'
  | 'composer_mount'
  | 'leave_room_click'
  | 'leave_room_done'
  | 'image_preview_load_start'
  | 'image_preview_load_fail';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logChatPerf(phase: PerfPhase, payload?: Record<string, any>) {
  try {
    // __DEV__ 나 NODE_ENV 로 릴리즈 스팸 방지
    // eslint-disable-next-line no-undef
    const devFlag = typeof __DEV__ !== 'undefined' ? __DEV__ : (process.env.NODE_ENV !== 'production');
    if (!devFlag) return;
    const ts = Date.now();
    if (payload) {
      // eslint-disable-next-line no-console
      console.log(PERF_PREFIX, phase, ts, payload);
    } else {
      // eslint-disable-next-line no-console
      console.log(PERF_PREFIX, phase, ts);
    }
  } catch {
    // 로깅 실패는 무시
  }
}

