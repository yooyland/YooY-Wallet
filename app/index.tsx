import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';

export default function IndexRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  // 미인증(처음 설치·비가입 포함) → 로그인 화면. 인증된 경우에만 대시보드 진입.
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (isLoading) return null;
  return <Redirect href="/(tabs)/dashboard" />;
}


