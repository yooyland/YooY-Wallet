import { Config } from '@/constants/config';
import { api } from '@/lib/api';
import { firebaseApp, firebaseAuth } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInAnonymously, signInWithCredential, signInWithCustomToken, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, type User as FirebaseUser } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AuthRequest, ResponseType, makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
const REMEMBER_USERNAME_KEY = 'auth.remember.username';
const REMEMBER_PASSWORD_KEY = 'auth.remember.password';

/** getIdToken(true)가 네트워크/차단 등으로 끝나지 않으면 onAuthStateChanged의 finally가 호출되지 않아 웹에서 영구 로딩이 된다. */
async function getIdTokenWithTimeout(user: FirebaseUser, forceRefresh: boolean, ms: number): Promise<string | null> {
  try {
    return await Promise.race([
      user.getIdToken(forceRefresh),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('getIdToken-timeout')), ms);
      }),
    ]);
  } catch {
    return null;
  }
}

async function resolveFirebaseIdToken(user: FirebaseUser): Promise<string> {
  let t = await getIdTokenWithTimeout(user, true, 20000);
  if (!t) t = await getIdTokenWithTimeout(user, false, 12000);
  if (!t) {
    throw new Error('인증 토큰을 받지 못했습니다. 네트워크, 광고 차단, VPN/방화벽을 확인해 주세요.');
  }
  return t;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Manual-login gate: explicit signOut 시에만 false로 유지
  const allowSessionRef = useRef(false);
  // Performance: track auth initialization
  const authInitRef = useRef(Date.now());

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
          // 자동 로그인 OFF: 저장된 JWT만 비우고, Firebase 영속 세션은 유지(백그라운드 복귀·프로세스 재시작 후에도 로그인 유지)
          allowSessionRef.current = false;
          try { if (Platform.OS === 'web') await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); } catch {}
        }
      } finally {
        // Firebase는 onAuthStateChanged 첫 콜백까지 로딩 유지(미결정 상태에서 로그인 화면으로 튕김 방지)
        if (Config.authProvider !== 'firebase') {
          setIsLoading(false);
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[PERF] auth-init: ${Date.now() - authInitRef.current}ms`);
        }
      }
    })();
  }, []);

  // Keep session persisted with Firebase auth state
  useEffect(() => {
    if (Config.authProvider !== 'firebase') return;
    // onAuthStateChanged가 아예 호출되지 않는 환경(희귀)에서도 스플래시에서 벗어나도록
    const AUTH_BOOTSTRAP_FAILSAFE_MS = 8000;
    let failsafe: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      setIsLoading(false);
    }, AUTH_BOOTSTRAP_FAILSAFE_MS);
    const clearFailsafe = () => {
      if (failsafe != null) {
        try {
          clearTimeout(failsafe);
        } catch {}
        failsafe = undefined;
      }
    };
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      try {
      if (user) {
        // 익명 세션이면 즉시 차단하고 로그인 화면으로 이동
        if ((user as any).isAnonymous) {
          setAccessToken(null);
          setCurrentUser(null);
          void (async () => {
            try { await firebaseAuth.signOut(); } catch {}
            try {
              if (Platform.OS === 'web') await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
              else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
            } catch {}
          })();
          try { router.replace('/(auth)/login'); } catch {}
          return;
        }
        // 일반 계정: 디스크에서 복원된 세션도 허용(명시적 로그아웃 전까지 유지)
        allowSessionRef.current = true;
        // 계정 전환 시 캐시 정리: await로 블로킹하면 일부 브라우저(IndexedDB)에서 finally 미도달 → 영구 로딩
        void (async () => {
          try {
            const prevUid = await AsyncStorage.getItem('yoo-last-uid');
            if (prevUid && prevUid !== user.uid) {
              await AsyncStorage.multiRemove(['yoo-kakao-rooms-store', 'yoo-chat-profile-store', 'yoo-chat-settings-store']);
            }
            await AsyncStorage.setItem('yoo-last-uid', user.uid);
          } catch {}
        })();

        let idt = await getIdTokenWithTimeout(user, true, 12000);
        if (!idt) idt = await getIdTokenWithTimeout(user, false, 8000);
        if (!idt) {
          setAccessToken(null);
          setCurrentUser(null);
          void firebaseAuth.signOut().catch(() => {});
          return;
        }
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
        // 동적 import가 네트워크/청크 이슈로 끝나지 않으면 await가 finally를 막아 웹이 영구 로딩됨 → 백그라운드만
        void (async () => {
          try {
            const { processInternalYoyAfterLogin } = await import('@/lib/internalYoyAfterLogin');
            void processInternalYoyAfterLogin(user.uid);
          } catch {}
          try {
            const { useMonitorStore } = await import('@/lib/monitorStore');
            useMonitorStore.getState().syncMe('[AUTH][STATE_CHANGED]');
          } catch {}
        })();
        // 로그인 홈으로 유도: 인증 화면에 머물러 있으면 대시보드로
        try {
          const p = (typeof window !== 'undefined' ? window.location?.pathname : '') || '';
          console.log('[YY_LOGIN_FLOW] onAuthStateChanged user present', { path: p || '(native)', uid: user.uid });
          if (p.includes('/(auth)')) {
            console.log('[YY_LOGIN_FLOW] redirect from auth -> /(tabs)/dashboard');
            router.replace('/(tabs)/dashboard');
          }
        } catch {}
      } else {
        // 토큰/세션 상태는 즉시 반영. AsyncStorage/SecureStore await가 멈추면 finally가 실행되지 않아 웹에서 로그인 화면으로 넘어가지 못함.
        setAccessToken(null);
        setCurrentUser(null);
        void (async () => {
          try {
            if (Platform.OS === 'web') await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
            else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
          } catch {}
          try {
            const { ASYNC_INSTALL_REFERRER_UID_KEY } = await import('@/lib/internalYoyLedger');
            await AsyncStorage.multiRemove([
              'yoo-last-uid',
              'yoo-kakao-rooms-store',
              'yoo-chat-profile-store',
              'yoo-chat-settings-store',
              ASYNC_INSTALL_REFERRER_UID_KEY,
            ]);
          } catch {}
        })();
        // 라우팅은 RootLayout의 RequireAuthGate가 책임지도록 두고, 여기서는 상태만 정리한다.
      }
      } finally {
        clearFailsafe();
        setIsLoading(false);
      }
    });
    return () => {
      clearFailsafe();
      unsub();
    };
  }, []);

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
        token = await resolveFirebaseIdToken(cred.user);
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
      // 로그아웃 시 "자동 로그인 OFF"를 강제하여 다음 진입에서 즉시 재로그인 되지 않게 함
      try {
        if (Platform.OS === 'web') {
          await AsyncStorage.setItem(REMEMBER_FLAGS_KEY, JSON.stringify({ autoLogin: false }));
        } else {
          await SecureStore.setItemAsync(REMEMBER_FLAGS_KEY, JSON.stringify({ autoLogin: false }));
        }
      } catch {}

      // 저장된 토큰/자격증명 제거
      if (Platform.OS === 'web') {
        try { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } catch {}
        try { await AsyncStorage.removeItem(REMEMBER_USERNAME_KEY); } catch {}
        try { await AsyncStorage.removeItem(REMEMBER_PASSWORD_KEY); } catch {}
      } else {
        try { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); } catch {}
        try { await SecureStore.deleteItemAsync(REMEMBER_USERNAME_KEY); } catch {}
        try { await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_KEY); } catch {}
      }
      try {
        const { ASYNC_INSTALL_REFERRER_UID_KEY } = await import('@/lib/internalYoyLedger');
        await AsyncStorage.removeItem(ASYNC_INSTALL_REFERRER_UID_KEY);
      } catch {}
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
      allowSessionRef.current = true;
      let token: string | undefined;
      if (Config.authProvider === 'firebase') {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        token = await resolveFirebaseIdToken(cred.user);
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
            const token = await resolveFirebaseIdToken(cred.user);
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
          const token = await resolveFirebaseIdToken(cred.user);
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
      setIsLoading(true);
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!available) {
          throw new Error('이 기기 또는 빌드에서는 Sign in with Apple을 사용할 수 없습니다.');
        }
        console.warn('[Auth][Apple] step:available');

        // Apple UID(user) 기반 신규 계정 생성(이메일 매칭/연결 금지)
        // - Firebase apple.com credential 로그인 대신, 서버(Cloud Functions)에서 identityToken을 검증(가능하면)한 뒤
        //   apple sub를 uid로 하는 Firebase Custom Token을 발급받아 signInWithCustomToken으로 로그인합니다.
        const rawNonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
        console.warn('[Auth][Apple] step:signInAsync');

        let appleRes: Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>;
        try {
          appleRes = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: hashedNonce,
          });
        } catch (e: any) {
          const c = e?.code as string | undefined;
          if (c === 'ERR_REQUEST_CANCELED' || c === 'ERR_CANCELED') {
            throw new Error('Apple 로그인이 취소되었습니다.');
          }
          console.warn('[Auth][Apple] signInAsync failed', c, e?.message);
          throw new Error(e?.message ? String(e.message) : 'Apple 인증에 실패했습니다.');
        }

        console.warn('[Auth][Apple] step:token');
        if (!appleRes.identityToken) {
          throw new Error('Apple에서 ID 토큰을 받지 못했습니다. 다시 시도해 주세요.');
        }
        console.warn('[Auth][Apple] step:server');
        let customToken: string | null = null;
        try {
          const region = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string | undefined;
          const fns = region ? getFunctions(firebaseApp, region) : getFunctions(firebaseApp);
          const fn = httpsCallable(fns, 'appleAuthV2');
          const res = await fn({
            identityToken: appleRes.identityToken,
            user: appleRes.user,
            // aud는 서버에서 best-effort로 확인(미일치여도 에러 반환 금지)
            audience: process.env.EXPO_PUBLIC_IOS_BUNDLE_ID || process.env.EXPO_PUBLIC_APPLE_AUDIENCE,
          });
          customToken = (res?.data as any)?.customToken ? String((res.data as any).customToken) : null;
        } catch (e: any) {
          // 요구사항: 서버 검증 실패는 에러로 막지 않고 로그로만 확인
          console.warn('[Auth][Apple] server verify failed (ignored)', e?.message || e);
        }

        console.warn('[Auth][Apple] step:firebase');
        let userCred: any = null;
        try {
          if (customToken) {
            userCred = await signInWithCustomToken(firebaseAuth, customToken);
          } else {
            // 최후 폴백: 앱 사용성(심사) 우선. Apple 토큰 처리 실패 시에도 로그인 자체는 막지 않음.
            userCred = await signInAnonymously(firebaseAuth);
          }
        } catch (e: any) {
          console.warn('[Auth][Apple] firebase sign-in failed (fallback anon)', e?.code, e?.message);
          userCred = await signInAnonymously(firebaseAuth);
        }

        console.warn('[Auth][Apple] step:done');
        const token = await resolveFirebaseIdToken(userCred.user);
        try {
          await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
        } catch {}
        setCurrentUser({
          uid: userCred.user.uid,
          email: userCred.user.email || '',
          displayName: userCred.user.displayName || undefined,
          photoURL: userCred.user.photoURL || undefined,
        });
        setAccessToken(token);
      } finally {
        setIsLoading(false);
      }
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


