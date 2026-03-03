export const Config = {
  // 서버 베이스 URL: EXPO_PUBLIC_API_BASE_URL 에서 읽고, 미설정 시 undefined
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || undefined,
  // 프로덕션 표준: Mock Auth 비활성
  enableMockAuth: false,
  authProvider: (process.env.EXPO_PUBLIC_AUTH_PROVIDER || 'firebase') as 'firebase' | 'api',
  // 네트워크 기본 타임아웃(ms)
  requestTimeoutMs: Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? 10000),
};


