import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SupportedLanguage = 'en' | 'ko';
type SupportedCurrency = 'USD' | 'KRW';

type PreferencesContextValue = {
  language: SupportedLanguage;
  currency: SupportedCurrency;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  setCurrency: (cur: SupportedCurrency) => Promise<void>;
  isLoading: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const KEY_LANGUAGE = 'prefs.language';
const KEY_CURRENCY = 'prefs.currency';

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [currency, setCurrencyState] = useState<SupportedCurrency>('USD');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedLang, storedCur] = await Promise.all([
          AsyncStorage.getItem(KEY_LANGUAGE),
          AsyncStorage.getItem(KEY_CURRENCY),
        ]);
        if (storedLang === 'en' || storedLang === 'ko') setLanguageState(storedLang);
        if (storedCur === 'USD' || storedCur === 'KRW') setCurrencyState(storedCur);
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

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    currency,
    setLanguage,
    setCurrency,
    isLoading,
  }), [language, currency, setLanguage, setCurrency, isLoading]);

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


