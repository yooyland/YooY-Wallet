import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type QuickActionsMap = {
  send: boolean;
  receive: boolean;
  qr: boolean;
  gift: boolean;
  history: boolean;
  schedule: boolean;
  reward: boolean;
  chat: boolean;
  shop: boolean;
  nft: boolean;
  buy: boolean;
  sell: boolean;
  diary: boolean;
  accountBook: boolean;
  memo: boolean;
};

type QuickActionsContextValue = {
  actions: QuickActionsMap;
  setActionEnabled: (key: keyof QuickActionsMap, enabled: boolean) => void;
  replaceAll: (next: QuickActionsMap) => void;
  isReady: boolean;
};

const QuickActionsContext = createContext<QuickActionsContextValue | undefined>(undefined);

const DEFAULT_ACTIONS: QuickActionsMap = {
  send: true,
  receive: true,
  qr: true,
  gift: false,
  history: true,
  schedule: true,
  reward: true,
  chat: true,
  shop: false,
  nft: false,
  buy: false,
  sell: false,
  diary: false,
  accountBook: false,
  memo: false,
};

const STORAGE_KEY = 'quick.actions';

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = useState<QuickActionsMap>(DEFAULT_ACTIONS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // 정책 강제: 기본값 갱신 및 gift 기본 비노출 유지
          setActions({ ...DEFAULT_ACTIONS, ...parsed, gift: false });
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next: QuickActionsMap) => {
    setActions(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setActionEnabled = useCallback((key: keyof QuickActionsMap, enabled: boolean) => {
    const next = { ...actions, [key]: enabled };
    void persist(next);
  }, [actions, persist]);

  const replaceAll = useCallback((next: QuickActionsMap) => {
    void persist(next);
  }, [persist]);

  const value = useMemo(() => ({ actions, setActionEnabled, replaceAll, isReady }), [actions, setActionEnabled, replaceAll, isReady]);

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
    </QuickActionsContext.Provider>
  );
}

export function useQuickActions() {
  const ctx = useContext(QuickActionsContext);
  if (!ctx) throw new Error('useQuickActions must be used within QuickActionsProvider');
  return ctx;
}


