import { Config } from '@/constants/config';
import { api } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, OAuthProvider } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AuthRequest, ResponseType, makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

type User = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
};

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  currentUser: User | null;
  signIn: (params: { username: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (params: { email: string; password: string }) => Promise<void>;
  requestPasswordReset: (params: { email: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REMEMBER_FLAGS_KEY = 'auth.remember.flags'; // { autoLogin: boolean }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState<boolean>(false);
  // Manual-login gate: only allow sessions initiated by user action
  const allowSessionRef = useRef(false);

  WebBrowser.maybeCompleteAuthSession();
  const googleDiscovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  useEffect(() => {
    // 세션 자동 복원: "자동 로그인 ON"인 경우에만 복원 (업데이트/재설치 후 무단 자동 로그인 방지)
    (async () => {
      try {
        let auto = false;
        try {
          if (Platform.OS === 'web') {
            const raw = await AsyncStorage.getItem(REMEMBER_FLAGS_KEY);
            if (raw) { try { auto = !!(JSON.parse(raw || '{}') as any)?.autoLogin; } catch {} }
          } else {
            const raw = await SecureStore.getItemAsync(REMEMBER_FLAGS_KEY);
            if (raw) { try { auto = !!(JSON.parse(raw || '{}') as any)?.autoLogin; } catch {} }
          }
        } catch {}
        setAutoLoginEnabled(!!auto);

        let token: string | null = null;
        if (auto) {
          if (Platform.OS === 'web') {
            try { token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY); } catch {}
          } else {
            try { token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY); } catch {}
          }
          if (token) {
            allowSessionRef.current = true; // 복원 세션 허용
            setAccessToken(token);
          }
        } else {
          // 자동 로그인 OFF이면 토큰/세션 복원 금지
          allowSessionRef.current = false;
          setAccessToken(null);
          setCurrentUser(null);
          try { if (Platform.OS === 'web') await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); } catch {}
          // Firebase가 내부적으로 세션을 유지하고 있을 수 있으므로, 강제로 로그아웃 (익명 포함)
          try { await firebaseAuth.signOut(); } catch {}
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Keep session persisted with Firebase auth state
  useEffect(() => {
    if (Config.authProvider !== 'firebase') return;
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        // 자동 로그인 OFF인데 Firebase 세션이 남아있다면 즉시 로그아웃 처리
        if (!autoLoginEnabled && !allowSessionRef.current) {
          try { await firebaseAuth.signOut(); } catch {}
          try { if (Platform.OS === 'web') { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } else { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); } } catch {}
          setAccessToken(null);
          setCurrentUser(null);
          return;
        }
        // 익명 세션이면 즉시 차단하고 로그인 화면으로 이동
        if ((user as any).isAnonymous) {
          try { await firebaseAuth.signOut(); } catch {}
          try { if (Platform.OS === 'web') { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } else { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); } } catch {}
          setAccessToken(null);
          setCurrentUser(null);
          try { router.replace('/(auth)/login'); } catch {}
          return;
        }
        // 계정 전환 시 채팅 스토어/프로필 캐시를 강제 교체 (동일 브라우저 프로필에서 다른 계정으로 로그인 시 섞임 방지)
        try {
          const prevUid = await AsyncStorage.getItem('yoo-last-uid');
          if (prevUid && prevUid !== user.uid) {
            await AsyncStorage.removeItem('yoo-kakao-rooms-store');
            await AsyncStorage.removeItem('yoo-chat-profile-store');
            await AsyncStorage.removeItem('yoo-chat-settings-store');
          }
          await AsyncStorage.setItem('yoo-last-uid', user.uid);
        } catch {}

        const idt = await user.getIdToken(true);
        if (Platform.OS !== 'web') {
          // 웹에서는 토큰을 영구 저장하지 않아 로컬스토리지 용량 초과를 방지
          try { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, idt); } catch {}
        }
        setAccessToken(idt);
        setCurrentUser({
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || undefined,
          photoURL: user.photoURL || undefined
        });
        // 로그인 직후 즉시 SSOT 동기화 트리거(잔액/거래/주소) → 빠른 잔액 표시
        try { 
          const { useMonitorStore } = await import('@/lib/monitorStore');
          useMonitorStore.getState().syncMe('[AUTH][STATE_CHANGED]');
        } catch {}
        // 로그인 홈으로 유도: 인증 화면에 머물러 있으면 대시보드로
        try {
          const p = (typeof window !== 'undefined' ? window.location?.pathname : '') || '';
          if (p.includes('/(auth)')) router.replace('/(tabs)/dashboard');
        } catch {}
      } else {
        if (Platform.OS === 'web') {
          await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        }
        try {
          await AsyncStorage.removeItem('yoo-last-uid');
          await AsyncStorage.removeItem('yoo-kakao-rooms-store');
          await AsyncStorage.removeItem('yoo-chat-profile-store');
          await AsyncStorage.removeItem('yoo-chat-settings-store');
        } catch {}
        setAccessToken(null);
        setCurrentUser(null);
        // 여기서 로그인 화면으로 강제 이동하면 /register 같은 인증 플로우 화면 진입이 막힐 수 있음.
        // 라우팅은 RootLayout의 RequireAuthGate가 책임지도록 두고, 여기서는 상태만 정리한다.
      }
    });
    return () => unsub();
  }, [autoLoginEnabled]);

  const signIn = useCallback(async ({ username, password }: { username: string; password: string }) => {
    setIsLoading(true);
    try {
      allowSessionRef.current = true;
      let token: string | undefined;
      if (Config.authProvider === 'firebase') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, username, password);
        // 익명 계정이 아닌지 확인
        if ((cred.user as any).isAnonymous) {
          try { await firebaseAuth.signOut(); } catch {}
          throw new Error('Anonymous session is not allowed for sign-in');
        }
        token = await cred.user.getIdToken(true);
        setCurrentUser({
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || undefined,
          photoURL: cred.user.photoURL || undefined
        });
      } else {
        const res = await api.post<{ accessToken: string }>('/auth/login', { username, password });
        token = res.ok ? res.data.accessToken : (Config.enableMockAuth ? `mock-${Date.now()}` : (() => { throw new Error(res.error); })());
        // Mock user for non-Firebase auth
        if (Config.enableMockAuth) {
          setCurrentUser({
            uid: `mock-${Date.now()}`,
            email: username,
            displayName: (()=>{ const base = (username.split?.('@')?.[0]||'').trim(); return base.toLowerCase()==='user' ? 'guest' : base; })()
          });
        }
      }
      if (Platform.OS !== 'web') {
        try { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token!); } catch {}
      }
      setAccessToken(token);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      allowSessionRef.current = false; // 명시 로그아웃 시에만 세션 차단
      if (Config.authProvider === 'firebase') {
        try { await firebaseAuth.signOut(); } catch {}
      }
      if (Platform.OS === 'web') { try { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } catch {} }
      else { try { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); } catch {} }
      setAccessToken(null);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isAuthenticated: !!accessToken,
    accessToken,
    currentUser,
    signIn,
    signOut,
    signUp: async ({ email, password }) => {
      let token: string | undefined;
      if (Config.authProvider === 'firebase') {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        token = await cred.user.getIdToken(true);
        setCurrentUser({
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || undefined,
          photoURL: cred.user.photoURL || undefined
        });
      } else {
        const res = await api.post<{ accessToken: string }>('/auth/register', { email, password });
        token = res.ok ? res.data.accessToken : (Config.enableMockAuth ? `mock-${Date.now()}` : (() => { throw new Error(res.error); })());
        // Mock user for non-Firebase auth
        if (Config.enableMockAuth) {
          setCurrentUser({
            uid: `mock-${Date.now()}`,
            email: email,
            displayName: email.split('@')[0]
          });
        }
      }
      if (Platform.OS !== 'web') { try { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token!); } catch {} }
      setAccessToken(token);
    },
    requestPasswordReset: async ({ email }) => {
      if (Config.authProvider === 'firebase') {
        await sendPasswordResetEmail(firebaseAuth, email);
      } else {
        const res = await api.post<{ ok: true }>('/auth/forgot-password', { email });
        if (!res.ok && !Config.enableMockAuth) throw new Error(res.error);
      }
    },
    signInWithGoogle: async () => {
      allowSessionRef.current = true;
      setIsLoading(true);
      try {
        if (Platform.OS === 'web') {
          const provider = new GoogleAuthProvider();
          try {
            const cred = await signInWithPopup(firebaseAuth, provider);
            const token = await cred.user.getIdToken();
            setCurrentUser({
              uid: cred.user.uid,
              email: cred.user.email || '',
              displayName: cred.user.displayName || undefined,
              photoURL: cred.user.photoURL || undefined
            });
            setAccessToken(token);
          } catch (e) {
            await signInWithRedirect(firebaseAuth, provider);
          }
        } else {
          // Native (iOS/Android): Expo 권장 방식대로 "웹 클라이언트 ID + proxy" 조합 사용
          // → redirect_uri는 https://auth.expo.io/... 형태가 되어 Google OAuth 정책 위반을 피할 수 있다.
          const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID as string | undefined;
          if (!clientId) {
            throw new Error('Google 로그인: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID(웹 클라이언트 ID)가 필요합니다.');
          }

          const redirectUri = makeRedirectUri({ useProxy: true });
          const request = new AuthRequest({
            clientId,
            usePKCE: true,
            responseType: ResponseType.Code,
            scopes: ['openid', 'profile', 'email'],
            redirectUri,
            extraParams: { prompt: 'select_account' },
          });
          const result = await request.promptAsync(googleDiscovery, { useProxy: true });
          if (result.type !== 'success' || !result.params?.code) {
            throw new Error('Google 로그인이 취소되었습니다.');
          }
          const body = new URLSearchParams({
            code: result.params.code,
            client_id: clientId,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: (request as any).codeVerifier || '',
          }).toString();
          const tokenRes = await fetch(googleDiscovery.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          });
          const tokenJson = await tokenRes.json();
          const idToken = tokenJson?.id_token as string | undefined;
          if (!idToken) throw new Error('Google 인증 정보를 가져오지 못했습니다.');
          const credential = GoogleAuthProvider.credential(idToken);
          const cred = await signInWithCredential(firebaseAuth, credential);
          const token = await cred.user.getIdToken(true);
          try { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token); } catch {}
          setCurrentUser({
            uid: cred.user.uid,
            email: cred.user.email || '',
            displayName: cred.user.displayName || undefined,
            photoURL: cred.user.photoURL || undefined
          });
          setAccessToken(token);
        }
      } finally {
        setIsLoading(false);
      }
    },
    signInWithApple: async () => {
      allowSessionRef.current = true;
      if (Platform.OS !== 'ios') throw new Error('Apple sign-in is iOS only');
      const rawNonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const appleRes = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!appleRes.identityToken) throw new Error('No identity token from Apple');
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: appleRes.identityToken, rawNonce });
      const cred = await signInWithCredential(firebaseAuth, credential);
      const token = await cred.user.getIdToken(true);
      try { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token); } catch {}
      setCurrentUser({
        uid: cred.user.uid,
        email: cred.user.email || '',
        displayName: cred.user.displayName || undefined,
        photoURL: cred.user.photoURL || undefined
      });
      setAccessToken(token);
    },
  }), [isLoading, accessToken, currentUser, signIn, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}


