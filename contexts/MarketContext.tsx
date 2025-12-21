import { getUSDKRWRate } from '@/lib/upbit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type MarketContextValue = {
  usdkrw: number | null;
  yoyPriceKRW: number | null;
  yoyPriceUSD: number | null;
  setYoyPriceUSD: (price: number) => Promise<void>;
};

const MarketContext = createContext<MarketContextValue | undefined>(undefined);

// 기본 YOY 가격(USD) - Uniswap 기준 고정값. 필요 시 관리자에서 변경 가능하도록 확장 예정
const DEFAULT_YOY_PRICE_USD = 0.0347; // $0.0347
const YOY_PRICE_USD_KEY = 'admin.yoyPriceUSD';

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [usdkrw, setUsdkrw] = useState<number | null>(null);
  const [yoyPriceUSD, setYoyPriceUSDState] = useState<number | null>(DEFAULT_YOY_PRICE_USD);

  // Load persisted admin override for YOY price
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(YOY_PRICE_USD_KEY);
        if (saved) {
          const v = parseFloat(saved);
          if (!Number.isNaN(v) && v > 0) setYoyPriceUSDState(v);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const rate = await getUSDKRWRate();
        if (mounted) setUsdkrw(rate);
      } catch {}
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const yoyPriceKRW = useMemo(() => {
    if (!yoyPriceUSD || !usdkrw) return null;
    return yoyPriceUSD * usdkrw;
  }, [yoyPriceUSD, usdkrw]);

  const setYoyPriceUSD = useCallback(async (price: number) => {
    if (!price || price <= 0 || !Number.isFinite(price)) return;
    setYoyPriceUSDState(price);
    try { await AsyncStorage.setItem(YOY_PRICE_USD_KEY, String(price)); } catch {}
  }, []);

  const value = useMemo<MarketContextValue>(() => ({ usdkrw, yoyPriceKRW, yoyPriceUSD, setYoyPriceUSD }), [usdkrw, yoyPriceKRW, yoyPriceUSD, setYoyPriceUSD]);

  return (
    <MarketContext.Provider value={value}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
}


