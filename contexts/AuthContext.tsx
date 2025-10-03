import { api } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async ({ username, password }: { username: string; password: string }) => {
    setIsLoading(true);
    try {
      const res = await api.post<{ accessToken: string }>('/auth/login', { username, password });
      if (!res.ok) throw new Error(res.error);
      const token = res.data.accessToken;
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
      const res = await api.post<{ accessToken: string }>('/auth/register', { email, password });
      if (!res.ok) throw new Error(res.error);
      const token = res.data.accessToken;
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
      }
      setAccessToken(token);
    },
    requestPasswordReset: async ({ email }) => {
      const res = await api.post<{ ok: true }>('/auth/forgot-password', { email });
      if (!res.ok) throw new Error(res.error);
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


