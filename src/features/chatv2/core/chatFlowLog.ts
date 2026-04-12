function chatV2FlowLogEnabled(): boolean {
  // eslint-disable-next-line no-undef
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  try {
    const v = String(process.env.EXPO_PUBLIC_CHATV2_FLOW_LOG || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

export function yyChatFlow(event: string, data?: Record<string, any>) {
  try {
    // 기본은 __DEV__만. 실기기 릴리스에서 업로드 디버그 시 .env 에
    // EXPO_PUBLIC_CHATV2_FLOW_LOG=1 (빌드에 포함됨) — DEBUG_AND_SMOKE.md 참고.
    if (!chatV2FlowLogEnabled()) return;
    const payload = data ? JSON.stringify(data) : '';
    // eslint-disable-next-line no-console
    console.log(`[YY_CHAT_FLOW] ${event}${payload ? ' ' + payload : ''}`);
  } catch {
    // ignore
  }
}

