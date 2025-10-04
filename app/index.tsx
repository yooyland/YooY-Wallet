import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';

export default function IndexRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return <Redirect href={isAuthenticated ? '/(tabs)/dashboard' : '/(auth)/login'} />;
}


