import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';

export default function IndexRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  // Firebase 복원 전에 !isAuthenticated 로 판단하면 로그인으로 튕김 → 로딩 우선
  if (isLoading) {
    console.log('[YY_LOGIN_FLOW] index -> loading, wait');
    return null;
  }
  // 미인증(처음 설치·비가입 포함) → 로그인 화면. 인증된 경우에만 대시보드 진입.
  if (!isAuthenticated) {
    console.log('[YY_LOGIN_FLOW] index -> not authed, redirect /(auth)/login');
    return <Redirect href="/(auth)/login" />;
  }
  console.log('[YY_LOGIN_FLOW] index -> authed+ready, redirect /(tabs)/dashboard');
  return <Redirect href="/(tabs)/dashboard" />;
}


