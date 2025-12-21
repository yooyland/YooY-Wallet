import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type SupportedLanguage = 'en' | 'ko' | 'ja' | 'zh';
type SupportedCurrency = 'USD' | 'KRW' | 'JPY' | 'CNY' | 'EUR';

export type PreferencesContextValue = {
  language: SupportedLanguage;
  currency: SupportedCurrency;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  setCurrency: (cur: SupportedCurrency) => Promise<void>;
  isLoading: boolean;
  fastScan: boolean;
  setFastScan: (v: boolean) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const KEY_LANGUAGE = 'prefs.language';
const KEY_CURRENCY = 'prefs.currency';
const KEY_FAST_SCAN = 'prefs.fast_scan';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [currency, setCurrencyState] = useState<SupportedCurrency>('USD');
  const [isLoading, setIsLoading] = useState(true);
  const [fastScan, setFastScanState] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedLang, storedCur, storedFast] = await Promise.all([
          AsyncStorage.getItem(KEY_LANGUAGE),
          AsyncStorage.getItem(KEY_CURRENCY),
          AsyncStorage.getItem(KEY_FAST_SCAN),
        ]);
        if (storedLang === 'en' || storedLang === 'ko' || storedLang === 'ja' || storedLang === 'zh') setLanguageState(storedLang);
        if (storedCur === 'USD' || storedCur === 'KRW' || storedCur === 'JPY' || storedCur === 'CNY' || storedCur === 'EUR') setCurrencyState(storedCur);
        if (storedFast === 'true' || storedFast === 'false') setFastScanState(storedFast === 'true');
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

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    currency,
    setLanguage,
    setCurrency,
    isLoading,
    fastScan,
    setFastScan,
  }), [language, currency, setLanguage, setCurrency, isLoading, fastScan, setFastScan]);

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


