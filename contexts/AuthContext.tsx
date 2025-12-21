import { Config } from '@/constants/config';
import { api } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, OAuthProvider } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Manual-login gate: only allow sessions initiated by user action
  const allowSessionRef = useRef(false);

  WebBrowser.maybeCompleteAuthSession();
  const googleDiscovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  useEffect(() => {
    // Do not auto-restore any session; require explicit user action
    setIsLoading(false);
  }, []);

  // Keep session persisted with Firebase auth state
  useEffect(() => {
    if (Config.authProvider !== 'firebase') return;
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        // Only allow sessions created after user-initiated sign-in
        if (!allowSessionRef.current) {
          try { await firebaseAuth.signOut(); } catch {}
          if (Platform.OS === 'web') { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } else { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); }
          setAccessToken(null); setCurrentUser(null);
          return;
        }
        // Guard: block suspicious generic account names like 'user'
        const dn = (user.displayName || '').trim().toLowerCase();
        const localName = (user.email || '').split('@')[0]?.trim().toLowerCase();
        if (dn === 'user' || localName === 'user') {
          try { await firebaseAuth.signOut(); } catch {}
          if (Platform.OS === 'web') { await AsyncStorage.removeItem(ACCESS_TOKEN_KEY); } else { await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY); }
          setAccessToken(null); setCurrentUser(null);
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

        const idt = await user.getIdToken();
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
      }
    });
    return () => unsub();
  }, []);

  const signIn = useCallback(async ({ username, password }: { username: string; password: string }) => {
    setIsLoading(true);
    try {
      allowSessionRef.current = true;
      let token: string | undefined;
      if (Config.authProvider === 'firebase') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, username, password);
        // Guard after sign-in as well
        const dn = (cred.user.displayName || '').trim().toLowerCase();
        const localName = (cred.user.email || '').split('@')[0]?.trim().toLowerCase();
        if (dn === 'user' || localName === 'user') {
          try { await firebaseAuth.signOut(); } catch {}
          throw new Error('Blocked account name');
        }
        token = await cred.user.getIdToken();
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
      allowSessionRef.current = false;
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
        token = await cred.user.getIdToken();
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
        // Native (iOS/Android): Use AuthSession directly and exchange code for tokens
        const clientId = Platform.select({
          ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
          android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
          default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        }) as string | undefined;
        if (!clientId) throw new Error('Google Client ID not configured');

        const redirectUri = makeRedirectUri({});
        const request = new AuthRequest({
          clientId,
          usePKCE: true,
          responseType: ResponseType.Code,
          scopes: ['openid', 'profile', 'email'],
          redirectUri,
          extraParams: { prompt: 'select_account' },
        });
        await request.makeAuthUrlAsync(googleDiscovery);
        const result = await request.promptAsync(googleDiscovery);
        if (result.type !== 'success' || !result.params?.code) {
          throw new Error('Google sign-in cancelled');
        }
        // Exchange code for tokens
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
        if (!idToken) throw new Error('Missing Google ID token');
        const credential = GoogleAuthProvider.credential(idToken);
        const cred = await signInWithCredential(firebaseAuth, credential);
        const token = await cred.user.getIdToken();
        try { await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token); } catch {}
        setCurrentUser({
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || undefined,
          photoURL: cred.user.photoURL || undefined
        });
        setAccessToken(token);
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
      const token = await cred.user.getIdToken();
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


