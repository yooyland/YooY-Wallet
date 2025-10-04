export const Config = {
  // 서버 베이스 URL: EXPO_PUBLIC_API_BASE_URL 에서 읽고, 미설정 시 undefined
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || undefined,
  enableMockAuth: (process.env.EXPO_PUBLIC_ENABLE_MOCK_AUTH ?? 'true') === 'true',
  authProvider: (process.env.EXPO_PUBLIC_AUTH_PROVIDER || 'firebase') as 'firebase' | 'api',
};


