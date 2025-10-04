import { Config } from '@/constants/config';
import { api } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  signIn: (params: { username: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (params: { email: string; password: string }) => Promise<void>;
  requestPasswordReset: (params: { email: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'auth.accessToken';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = Platform.OS === 'web'
          ? await AsyncStorage.getItem(ACCESS_TOKEN_KEY)
          : await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        setAccessToken(token ?? null);
        if (Platform.OS === 'web' && !token && Config.authProvider === 'firebase') {
          try {
            const result = await getRedirectResult(firebaseAuth);
            if (result?.user) {
              const idt = await result.user.getIdToken();
              await AsyncStorage.setItem(ACCESS_TOKEN_KEY, idt);
              setAccessToken(idt);
            }
          } catch {}
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
        const idt = await user.getIdToken();
        if (Platform.OS === 'web') {
          await AsyncStorage.setItem(ACCESS_TOKEN_KEY, idt);
        } else {
          await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, idt);
        }
        setAccessToken(idt);
      } else {
        if (Platform.OS === 'web') {
          await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        }
        setAccessToken(null);
      }
    });
    return () => unsub();
  }, []);

  const signIn = useCallback(async ({ username, password }: { username: string; password: string }) => {
    setIsLoading(true);
    try {
      let token: string | undefined;
      if (Config.authProvider === 'firebase') {
        const cred = await signInWithEmailAndPassword(firebaseAuth, username, password);
        token = await cred.user.getIdToken();
      } else {
        const res = await api.post<{ accessToken: string }>('/auth/login', { username, password });
        token = res.ok ? res.data.accessToken : (Config.enableMockAuth ? `mock-${Date.now()}` : (() => { throw new Error(res.error); })());
      }
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
      }
      setAccessToken(token);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      } else {
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      }
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isAuthenticated: !!accessToken,
    accessToken,
    signIn,
    signOut,
    signUp: async ({ email, password }) => {
      let token: string | undefined;
      if (Config.authProvider === 'firebase') {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        token = await cred.user.getIdToken();
      } else {
        const res = await api.post<{ accessToken: string }>('/auth/register', { email, password });
        token = res.ok ? res.data.accessToken : (Config.enableMockAuth ? `mock-${Date.now()}` : (() => { throw new Error(res.error); })());
      }
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
      }
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
      const provider = new GoogleAuthProvider();
      try {
        const cred = await signInWithPopup(firebaseAuth, provider);
        const token = await cred.user.getIdToken();
        if (Platform.OS === 'web') {
          await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
        } else {
          await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
        }
        setAccessToken(token);
      } catch (e) {
        if (Platform.OS === 'web') {
          await signInWithRedirect(firebaseAuth, provider);
        } else {
          throw e as any;
        }
      }
    },
  }), [isLoading, accessToken, signIn, signOut]);

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


