import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { useWalletConnect } from '@/contexts/WalletConnectContext';
import { useMonitorStore } from '@/lib/monitorStore';
import { mergeAssets, type MergedAssetRow } from '@/lib/mergeAssets';
import { getExchangeRates } from '@/lib/currency';
import { onChainSnapToAssetRows } from '@/lib/onchainAssetRows';
import { resolveWalletAddressForUser } from '@/lib/resolveWalletAddress';
import { fetchOnchainAssets } from '@/lib/onchainBalances';

export type MergedWalletAssetsValue = {
  walletAddress: string | null;
  onChainSnap: Record<string, number>;
  internalAssets: any[];
  onchainAssets: any[];
  mergedAssets: MergedAssetRow[];
  usdToKrwRate: number;
  refreshOnchain: () => Promise<void>;
};

const MergedWalletAssetsContext = createContext<MergedWalletAssetsValue | null>(null);

export function MergedWalletAssetsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { yoyPriceUSD } = useMarket();
  const { state: wc } = useWalletConnect();
  const monitorBalances = useMonitorStore(s => s.balancesArray);
  const [rates, setRates] = useState<any>(null);
  const [onChainSnap, setOnChainSnap] = useState<Record<string, number>>({});
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const addr = await resolveWalletAddressForUser(wc, currentUser?.uid ?? null);
      if (alive) setResolvedAddress(addr);
    })();
    return () => {
      alive = false;
    };
  }, [wc?.connected, wc?.address, currentUser?.uid]);

  useEffect(() => {
    (async () => {
      try {
        const exchangeRates = await getExchangeRates();
        setRates(exchangeRates);
      } catch {}
    })();
  }, []);

  const refreshOnchain = useCallback(async () => {
    const addr = resolvedAddress;
    if (!addr) {
      setOnChainSnap({});
      return;
    }
    try {
      const snap = await fetchOnchainAssets(addr);
      setOnChainSnap(snap);
    } catch {}
  }, [resolvedAddress]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const run = async () => {
      if (!resolvedAddress) {
        if (!cancelled) setOnChainSnap({});
        return;
      }
      try {
        const snap = await fetchOnchainAssets(resolvedAddress);
        if (cancelled) return;
        setOnChainSnap(snap);
      } catch {}
    };
    void run();
    timer = setInterval(run, 20000);
    return () => {
      cancelled = true;
      if (timer) try { clearInterval(timer); } catch {}
    };
  }, [resolvedAddress]);

  const usdToKrwRate = rates?.KRW && rates.KRW > 0 ? rates.KRW : 1300;

  const internalAssets = useMemo(() => {
    const list = Array.isArray(monitorBalances) ? monitorBalances : [];
    return list
      .filter((b: any) => typeof b.amount === 'number' && b.amount > 0 && String(b.symbol ?? '').trim() !== '')
      .map((b: any) => {
        const sym = String(b.symbol ?? '')
          .toUpperCase()
          .trim();
        const valueUSD = Number(b.valueUSD ?? 0);
        const krwValue = valueUSD > 0 ? valueUSD * usdToKrwRate : 0;
        return { ...b, symbol: sym, krwValue, valueUSD, source: 'internal' as const };
      });
  }, [monitorBalances, usdToKrwRate]);

  const marketUsdOverrides = useMemo(() => {
    const m: Record<string, number> = {};
    if (typeof yoyPriceUSD === 'number' && yoyPriceUSD > 0) m.YOY = yoyPriceUSD;
    return m;
  }, [yoyPriceUSD]);

  const onchainAssets = useMemo(() => {
    return onChainSnapToAssetRows(onChainSnap, usdToKrwRate, { priceBySymbol: marketUsdOverrides });
  }, [onChainSnap, usdToKrwRate, marketUsdOverrides]);

  /**
   * 중복 합산 방지:
   * - monitorStore.balancesArray(=internalAssets)가 이미 온체인 잔액을 포함하는 환경이 있어
   *   onchainAssets와 merge 시 2배로 보이는 문제가 발생.
   * - 원칙: "온체인 스냅이 제공하는 심볼"은 온체인 값을 우선하고 internal에서는 제외한다.
   */
  const internalAssetsDeduped = useMemo(() => {
    const internal = Array.isArray(internalAssets) ? internalAssets : [];
    const onSyms = new Set((onchainAssets || []).map((a: any) => String(a?.symbol || '').toUpperCase().trim()).filter(Boolean));
    if (onSyms.size === 0) return internal;
    return internal.filter((a: any) => !onSyms.has(String(a?.symbol || '').toUpperCase().trim()));
  }, [internalAssets, onchainAssets]);

  const mergedAssets = useMemo(() => {
    return mergeAssets(onchainAssets, internalAssetsDeduped, { usdToKrw: usdToKrwRate });
  }, [onchainAssets, internalAssetsDeduped, usdToKrwRate]);

  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    try {
      console.log('[WALLET_TRACE] userId =', currentUser?.uid);
      console.log('[WALLET_TRACE] walletAddress =', resolvedAddress);
      console.log('[ASSET_AUDIT] onchainAssets =', onchainAssets);
      console.log('[ASSET_AUDIT] internalAssets =', internalAssets);
      console.log('[ASSET_AUDIT] mergedAssets =', mergedAssets);
      for (const item of mergedAssets) {
        console.log('[ASSET_AUDIT_ITEM]', {
          symbol: item.symbol,
          amount: item.amount,
          onchainAmount: item.onchainAmount,
          internalAmount: item.internalAmount,
          hasOnchain: item.hasOnchain,
          hasInternal: item.hasInternal,
        });
      }
    } catch {}
  }, [currentUser?.uid, resolvedAddress, onchainAssets, internalAssets, mergedAssets, onChainSnap]);

  const value = useMemo(
    () => ({
      walletAddress: resolvedAddress,
      onChainSnap,
      internalAssets,
      onchainAssets,
      mergedAssets,
      usdToKrwRate,
      refreshOnchain,
    }),
    [resolvedAddress, onChainSnap, internalAssets, onchainAssets, mergedAssets, usdToKrwRate, refreshOnchain],
  );

  return <MergedWalletAssetsContext.Provider value={value}>{children}</MergedWalletAssetsContext.Provider>;
}

export function useMergedWalletAssets(): MergedWalletAssetsValue {
  const ctx = useContext(MergedWalletAssetsContext);
  if (!ctx) {
    throw new Error('useMergedWalletAssets must be used within MergedWalletAssetsProvider');
  }
  return ctx;
}
