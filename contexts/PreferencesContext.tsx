import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

type SupportedLanguage = 'en' | 'ko' | 'ja' | 'zh';
type SupportedCurrency = 'USD' | 'KRW' | 'JPY' | 'CNY' | 'EUR';
export type WebLayoutMode = 'phone' | 'fluid' | 'custom';

export type PreferencesContextValue = {
  language: SupportedLanguage;
  currency: SupportedCurrency;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  setCurrency: (cur: SupportedCurrency) => Promise<void>;
  isLoading: boolean;
  fastScan: boolean;
  setFastScan: (v: boolean) => Promise<void>;
  /** Web only: 'phone' = 데스크탑에서 모바일 프레임(고정폭), 'fluid' = 브라우저 100% */
  webLayoutMode: WebLayoutMode;
  setWebLayoutMode: (m: WebLayoutMode) => Promise<void>;
  /** Web only: custom 모드에서 사용할 화면 폭(%) */
  webLayoutPercent: number;
  setWebLayoutPercent: (pct: number) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const KEY_LANGUAGE = 'prefs.language';
const KEY_CURRENCY = 'prefs.currency';
const KEY_FAST_SCAN = 'prefs.fast_scan';
const KEY_WEB_LAYOUT = 'prefs.web_layout_mode';
const KEY_WEB_LAYOUT_PCT = 'prefs.web_layout_percent';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [currency, setCurrencyState] = useState<SupportedCurrency>('USD');
  const [isLoading, setIsLoading] = useState(true);
  const [fastScan, setFastScanState] = useState<boolean>(true);
  // Web: 첫 렌더에서도 마지막 설정이 바로 적용되도록 localStorage에서 동기적으로 seed
  const [webLayoutMode, setWebLayoutModeState] = useState<WebLayoutMode>(() => {
    if (Platform.OS !== 'web') return 'phone';
    try {
      const v = (globalThis as any)?.localStorage?.getItem?.(KEY_WEB_LAYOUT);
      return v === 'phone' || v === 'fluid' || v === 'custom' ? v : 'phone';
    } catch {
      return 'phone';
    }
  });
  const [webLayoutPercent, setWebLayoutPercentState] = useState<number>(() => {
    if (Platform.OS !== 'web') return 80;
    try {
      const raw = (globalThis as any)?.localStorage?.getItem?.(KEY_WEB_LAYOUT_PCT);
      const n = Math.floor(Number(raw));
      return Number.isFinite(n) ? Math.min(100, Math.max(30, n)) : 80;
    } catch {
      return 80;
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const [storedLang, storedCur, storedFast, storedWebLayout, storedWebPct] = await Promise.all([
          AsyncStorage.getItem(KEY_LANGUAGE),
          AsyncStorage.getItem(KEY_CURRENCY),
          AsyncStorage.getItem(KEY_FAST_SCAN),
          AsyncStorage.getItem(KEY_WEB_LAYOUT),
          AsyncStorage.getItem(KEY_WEB_LAYOUT_PCT),
        ]);
        if (storedLang === 'en' || storedLang === 'ko' || storedLang === 'ja' || storedLang === 'zh') setLanguageState(storedLang);
        if (storedCur === 'USD' || storedCur === 'KRW' || storedCur === 'JPY' || storedCur === 'CNY' || storedCur === 'EUR') setCurrencyState(storedCur);
        if (storedFast === 'true' || storedFast === 'false') setFastScanState(storedFast === 'true');
        // Web 레이아웃은 localStorage를 우선(즉시 반영 + 일관된 persistence).
        // AsyncStorage에 남아 있는 옛 값이 웹에서 뒤늦게 덮어써 "100%"로 바뀌는 문제를 방지.
        if (Platform.OS !== 'web') {
          if (storedWebLayout === 'phone' || storedWebLayout === 'fluid' || storedWebLayout === 'custom') setWebLayoutModeState(storedWebLayout);
          const n = Math.floor(Number(storedWebPct));
          if (Number.isFinite(n) && n >= 30 && n <= 100) setWebLayoutPercentState(n);
        } else {
          try {
            const lsMode = (globalThis as any)?.localStorage?.getItem?.(KEY_WEB_LAYOUT);
            const lsPctRaw = (globalThis as any)?.localStorage?.getItem?.(KEY_WEB_LAYOUT_PCT);
            const lsPct = Math.floor(Number(lsPctRaw));
            const hasLsMode = lsMode === 'phone' || lsMode === 'fluid' || lsMode === 'custom';
            const hasLsPct = Number.isFinite(lsPct) && lsPct >= 30 && lsPct <= 100;
            // localStorage가 비어있을 때만 AsyncStorage 값으로 보정(마이그레이션)
            if (!hasLsMode && (storedWebLayout === 'phone' || storedWebLayout === 'fluid' || storedWebLayout === 'custom')) {
              setWebLayoutModeState(storedWebLayout);
              try { (globalThis as any)?.localStorage?.setItem?.(KEY_WEB_LAYOUT, storedWebLayout); } catch {}
            }
            if (!hasLsPct) {
              const n = Math.floor(Number(storedWebPct));
              if (Number.isFinite(n) && n >= 30 && n <= 100) {
                setWebLayoutPercentState(n);
                try { (globalThis as any)?.localStorage?.setItem?.(KEY_WEB_LAYOUT_PCT, String(n)); } catch {}
              }
            }
          } catch {}
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(KEY_LANGUAGE, lang);
  }, []);

  const setCurrency = useCallback(async (cur: SupportedCurrency) => {
    setCurrencyState(cur);
    await AsyncStorage.setItem(KEY_CURRENCY, cur);
  }, []);

  const setFastScan = useCallback(async (v: boolean) => {
    setFastScanState(v);
    await AsyncStorage.setItem(KEY_FAST_SCAN, String(v));
  }, []);

  const setWebLayoutMode = useCallback(async (m: WebLayoutMode) => {
    setWebLayoutModeState(m);
    try {
      await AsyncStorage.setItem(KEY_WEB_LAYOUT, m);
    } catch {}
    if (Platform.OS === 'web') {
      try { (globalThis as any)?.localStorage?.setItem?.(KEY_WEB_LAYOUT, m); } catch {}
    }
  }, []);

  const setWebLayoutPercent = useCallback(async (pct: number) => {
    const n = Math.floor(Number(pct));
    const clamped = Number.isFinite(n) ? Math.min(100, Math.max(30, n)) : 80;
    setWebLayoutPercentState(clamped);
    try {
      await AsyncStorage.setItem(KEY_WEB_LAYOUT_PCT, String(clamped));
    } catch {}
    if (Platform.OS === 'web') {
      try { (globalThis as any)?.localStorage?.setItem?.(KEY_WEB_LAYOUT_PCT, String(clamped)); } catch {}
    }
  }, []);

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    currency,
    setLanguage,
    setCurrency,
    isLoading,
    fastScan,
    setFastScan,
    webLayoutMode,
    setWebLayoutMode,
    webLayoutPercent,
    setWebLayoutPercent,
  }), [language, currency, setLanguage, setCurrency, isLoading, fastScan, setFastScan, webLayoutMode, setWebLayoutMode, webLayoutPercent, setWebLayoutPercent]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}


