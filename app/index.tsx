import { useAuth } from '@/contexts/AuthContext';
import Constants from 'expo-constants';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, View } from 'react-native';

/** 웹: Auth 콜백이 어떤 이유로든 끝나지 않아도 스플래시에서 벗어나 로그인으로 진입 */
const WEB_SPLASH_MAX_MS = 5000;

const SPLASH_LOGO = require('@/assets/images/android-icon-foreground.png');

/** 정적 호스팅 시 RN `Image`가 웹에서 비어 보이는 경우가 있어, 공개 경로 + `<img>`를 우선 사용 */
function webPublicSplashSrc(): string {
  const raw = (Constants.expoConfig as { experiments?: { baseUrl?: string } } | null)?.experiments?.baseUrl;
  const base = typeof raw === 'string' ? raw.replace(/\/$/, '') : '';
  if (base) return `${base}/yooy-splash-logo.png`;
  if (typeof window !== 'undefined' && /^\/web(\/|$)/i.test(window.location.pathname || '')) {
    return '/web/yooy-splash-logo.png';
  }
  return '/yooy-splash-logo.png';
}

function WebSplashLogo() {
  const [src, setSrc] = React.useState(webPublicSplashSrc);
  return (
    // RN Web의 Image 대신 DOM img: 번들 에셋 URI/레이아웃 이슈로 로고가 안 보이는 경우 방지
    <img
      src={src}
      alt="YooY Land"
      width={260}
      height={260}
      style={{ objectFit: 'contain', display: 'block', maxWidth: 'min(260px, 80vw)' }}
      onError={() => {
        try {
          const resolved = Image.resolveAssetSource(SPLASH_LOGO);
          const uri = resolved?.uri;
          if (uri && uri !== src) setSrc(uri);
        } catch {}
      }}
    />
  );
}

export default function IndexRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const [webSplashCap, setWebSplashCap] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const t = setTimeout(() => setWebSplashCap(true), WEB_SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);

  const showAuthSplash = isLoading && !(Platform.OS === 'web' && webSplashCap);

  // 정적 웹에서 <Redirect>가 가끔 적용되지 않는 경우 대비
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (showAuthSplash) return;
    if (!isAuthenticated) {
      try {
        router.replace('/(auth)/login');
      } catch {}
    }
  }, [showAuthSplash, isAuthenticated]);

  // Firebase 복원 전에 !isAuthenticated 로 판단하면 로그인으로 튕김 → 로딩 우선
  if (showAuthSplash) {
    console.log('[YY_LOGIN_FLOW] index -> loading, wait');
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {Platform.OS === 'web' ? (
          <WebSplashLogo />
        ) : (
          <Image
            source={SPLASH_LOGO}
            style={{ width: 260, height: 260 }}
            resizeMode="contain"
            accessibilityLabel="YooY Land"
          />
        )}
        <ActivityIndicator size="small" color="#C9A227" style={{ marginTop: 24 }} />
      </View>
    );
  }
  if (!isAuthenticated) {
    console.log('[YY_LOGIN_FLOW] index -> not authed, redirect /(auth)/login');
    return <Redirect href="/(auth)/login" />;
  }
  console.log('[YY_LOGIN_FLOW] index -> authed+ready, redirect /(tabs)/dashboard');
  return <Redirect href="/(tabs)/dashboard" />;
}
