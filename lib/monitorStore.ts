import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseAuth } from '@/lib/firebase';
import {
  ensureMeAddressLinked,
  fetchMeAddresses,
  fetchMeBalances,
  fetchMeTransactions,
  balancesMapToArray,
  loadCachedMeBalances,
  saveCachedMeBalances,
} from '@/lib/monitor';
import { fetchPricesUsd } from '@/lib/prices';
import priceManager from '@/lib/priceManager';
import { fetchHistoricalUsd, getDecimalsForSymbol } from '@/lib/prices';
import { perfStart, perfEnd } from '@/lib/perfTimer';
import { mergeInternalYoyLedgerIntoBalances, sanitizeInternalYoyLedgerAdjustments } from '@/lib/internalYoyBalanceSync';

type MonitorState = {
  uid: string | null;
  addresses: string[];
  balancesMap: Record<string, string>;
  balancesArray: Array<{ symbol: string; amount: number; valueUSD: number; name: string; change24h: number; change24hPct: number }>;
  transactions: any[];
  buyPriceMap: Record<string, number>; // symbol -> avg buy price USD
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  syncing: boolean;
  timeline: Array<{ tag: string; at: number; data?: any }>;
  // actions
  syncMe: (tag?: string, opts?: { force?: boolean }) => Promise<void>;
  applyLocalChange: (params: {
    symbol: string;
    delta: number;
    type?: string;
    description?: string;
  }) => Promise<void>;
};

let inflight: Promise<void> | null = null;

async function getWalletAddressLower(): Promise<string | null> {
  try {
    // 1) WalletConnect 주소 우선 확인
    try {
      const { useWalletConnect } = await import('@/contexts/WalletConnectContext');
      const wcState = useWalletConnect?.getState?.();
      const wcAddr = wcState?.state?.connected ? (wcState?.state?.address || null) : null;
      if (wcAddr && wcAddr.trim()) return wcAddr.toLowerCase();
    } catch {}
    // 2) 로컬 지갑 주소 확인
    const { getLocalWallet } = await import('@/src/wallet/wallet');
    const local = await getLocalWallet().catch(() => null);
    const addr = (local?.address || '').trim();
    return addr ? addr.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  uid: null,
  addresses: [],
  balancesMap: {},
  balancesArray: [],
  transactions: [],
  buyPriceMap: {},
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  lastErrorAt: null,
  syncing: false,
  timeline: [],
  syncMe: async (tag?: string, opts?: { force?: boolean }) => {
    if (inflight) return inflight;
    inflight = (async () => {
      perfStart('syncMe');
      const log = (...args: any[]) => console.log(tag || '[SYNC]', ...args);
      try {
        set({ syncing: true, lastAttemptAt: Date.now() });
        // 0) 최근 동기화 TTL(30s) 내면 즉시 반환 (단, 잔액이 비어 있으면 항상 재요청해 온체인 반영 보장)
        const last = get().lastSuccessAt;
        const hasBalances = (get().balancesArray?.length ?? 0) > 0;
        if (!opts?.force && hasBalances && last && Date.now() - last < 30_000) {
          log('skip by TTL (30s)');
          set({ syncing: false });
          inflight = null;
          return;
        }
        // 1) 캐시 즉시 하이드레이트(네트워크 전에 화면 먼저 살리기)
        try {
          const u0 = (firebaseAuth as any)?.currentUser;
          const uid0 = u0?.uid || null;
          if (uid0) {
            await sanitizeInternalYoyLedgerAdjustments(uid0);
            const cached0 = await loadCachedMeBalances(uid0);
            if (cached0 && Object.keys(cached0).length > 0) {
        let arr0 = balancesMapToArray(cached0, null);
        // 로컬 트랜잭션/조정도 즉시 오버레이하여 캐시 단계에서도 보상/비용 반영
        try {
          const { useTransactionStore } = await import('@/src/stores/transaction.store');
          const txs = useTransactionStore.getState().getTransactions();
          const positive = new Set(['daily_reward','event_reward','reward','manual_adjustment','airdrop','mint','staking','receive','claim','gift_claim']);
          const negative = new Set(['penalty','fee','spend','payment','pay','gift_reserve']);
          const skipOnChain = new Set(['deposit','withdrawal','transfer','trade']);
          const deltaBySymbol: Record<string, number> = {};
          for (const tx of txs) {
            const type = String(tx.type || '').toLowerCase();
            const sym = String((tx as any).symbol || '').toUpperCase();
            if (!sym) continue;
            if (skipOnChain.has(type) && (tx as any).transactionHash) continue;
            let raw = Number((tx as any).change);
            if (!Number.isFinite(raw)) raw = Number((tx as any).amount);
            if (!Number.isFinite(raw) || raw === 0) continue;
            const signed = positive.has(type) ? Math.abs(raw) : negative.has(type) ? -Math.abs(raw) : raw;
            if (signed === 0) continue;
            deltaBySymbol[sym] = (deltaBySymbol[sym] || 0) + signed;
          }
          // 영구 로컬 조정 반영
          try {
            const key = `monitor.local.adjustments:${uid0}`;
            const raw = await AsyncStorage.getItem(key);
            const arr: Array<{ symbol: string; delta: number }> = raw ? JSON.parse(raw) : [];
            for (const it of arr) {
              const s = String(it.symbol || '').toUpperCase();
              const d = Number(it.delta || 0);
              if (!s || !Number.isFinite(d) || d === 0) continue;
              deltaBySymbol[s] = (deltaBySymbol[s] || 0) + d;
            }
          } catch {}
          if (Object.keys(deltaBySymbol).length > 0) {
            const pm = (await import('@/lib/priceManager')).default;
            const next = [...arr0];
            for (const [sym, delta] of Object.entries(deltaBySymbol)) {
              const idx = next.findIndex(b => String(b.symbol).toUpperCase() === sym);
              const price = pm.getCoinPriceByCurrency(sym, 'USD') || 0;
              if (idx >= 0) {
                const b = next[idx];
                const amount = Number(((b.amount || 0) + delta).toFixed(8));
                next[idx] = { ...b, amount, valueUSD: price > 0 ? amount * price : b.valueUSD };
              } else {
                const amount = Number((delta as number).toFixed(8));
                next.push({ symbol: sym, amount, valueUSD: price > 0 ? amount * price : 0, name: sym, change24h: 0, change24hPct: 0 } as any);
              }
            }
            arr0 = next;
          }
        } catch {}
        try {
          arr0 = await mergeInternalYoyLedgerIntoBalances(uid0, arr0);
        } catch {}
        set({ balancesMap: cached0, balancesArray: arr0, uid: uid0 });
              log('hydrate-from-cache early', { keys: Object.keys(cached0).length });
            }
          }
        } catch {}
        const t_auth = Date.now();
        const u = (firebaseAuth as any)?.currentUser;
        const uid = u?.uid || null;
        const email = u?.email || null;
        const idt = u ? await u.getIdToken(true) : null;
        const t_token = Date.now();
        const walletAddrLower = await getWalletAddressLower();
        const t_addr = Date.now();
        const tokenHead = idt ? String(idt).slice(0, 20) : '';
        log('uid=', uid, 'email=', email, 'walletAddress=', walletAddrLower, 'idToken(head)=', tokenHead);
        set(state => ({ timeline: [...state.timeline, { tag: '[AUTH]', at: t_token, data: { uid, email, tokenMs: t_token - t_auth } }] }));
        set(state => ({ timeline: [...state.timeline, { tag: '[ADDR]', at: t_addr, data: { addr: walletAddrLower, addrMs: t_addr - t_auth } }] }));
        if (!uid || !idt) {
          set({ uid: uid, lastError: 'no token/user', syncing: false });
          inflight = null; return;
        }
        await sanitizeInternalYoyLedgerAdjustments(uid);
        // Ensure link only when address ready, with backoff retries
        if (walletAddrLower) {
          let linked = false;
          for (const delay of [300, 1000, 3000]) {
            try {
              const t0 = Date.now();
              await ensureMeAddressLinked(walletAddrLower, idt);
              const dt = Date.now() - t0;
              log('ensureMeAddressLinked ok', { status: 200, ms: dt });
              set(state => ({ timeline: [...state.timeline, { tag: '[LINK]', at: Date.now(), data: { status: 200, latencyMs: dt } }] }));
              linked = true; break;
            } catch (e: any) {
              const msg = String(e?.message || e);
              log('ensureMeAddressLinked error', msg);
              set(state => ({ timeline: [...state.timeline, { tag: '[LINK]', at: Date.now(), data: { error: msg } }] }));
              if (msg.includes('ADDRESS_OWNED_BY_ANOTHER')) break;
              await new Promise(r => setTimeout(r, delay));
            }
          }
          if (!linked) log('ensureMeAddressLinked skipped or conflicted');
        }
        // 2) 가격 업데이트는 백그라운드로 먼저 시작(대기 시간 최소화)
        const priceUpdatePromise = (async () => {
          try { await priceManager.updateRealTimePrices(); } catch {}
        })();
        // 3) addresses
        const t0a = Date.now();
        const addressesRaw = await fetchMeAddresses(idt, { timeoutMs: 25_000 } as any);
        const addresses = Array.from(new Set((addressesRaw || []).map((a: any) => String(a || '').toLowerCase()).filter(Boolean)));
        log('GET /me/addresses', { ms: Date.now() - t0a, addressesRaw, addresses });
        // 4) balances: 서버 스냅샷(타임아웃 8~10s)
        const t0b = Date.now();
        const balancesRes = await fetchMeBalances(idt, { timeoutMs: 25_000 } as any);
        const fetchMs = Date.now() - t0b;
        const serverMeta = (balancesRes as any)?.meta || {};
        const balances = (balancesRes as any)?.balances ? ((balancesRes as any).balances as Record<string, string>) : ((balancesRes as any) || {}) as Record<string, string>;
        log('GET /me/balances', { ms: fetchMs, serverMeta });
        set(state => ({ timeline: [...state.timeline, { tag: '[BAL]', at: Date.now(), data: { fetchMs, serverLatencyMs: serverMeta?.latencyMs, keysCount: Object.keys(balances||{}).length } }] }));
        if (uid && balances && Object.keys(balances).length > 0) {
          await saveCachedMeBalances(uid, balances);
        }
        let balancesArray = balancesMapToArray(balances || {}, null);
        // 온체인 YOY/ETH는 홈 대시보드에서 RPC(balanceOf/getBalance)로만 합산(mergedAssets). 여기서 HTTP 온체인 병합 시 이중 합산됨.
        // 5) 가격 합치기: 즉시 현재 저장된 가격으로 1차 반영(대기 없음)
        try {
          balancesArray = balancesArray.map(b => {
            const p = priceManager.getCoinPriceByCurrency(b.symbol, 'USD') || 0;
            return { ...b, valueUSD: p > 0 ? (b.amount * p) : 0 };
          });
          // 가격 업데이트가 끝나면 한 번 더 보정(백그라운드)
          (async () => {
            try {
              await priceUpdatePromise;
              const next = (get().balancesArray || []).map(b => {
                const p = priceManager.getCoinPriceByCurrency(b.symbol, 'USD') || 0;
                return { ...b, valueUSD: p > 0 ? (b.amount * p) : b.valueUSD };
              });
              set({ balancesArray: next });
            } catch {}
          })();
        } catch {}
        // 5.1) 로컬 보상/오프체인 거래를 잔액에 오버레이(중복 방지 위해 on-chain과 다른 타입만)
        try {
          const { useTransactionStore } = await import('@/src/stores/transaction.store');
          const txs = useTransactionStore.getState().getTransactions();
          const positive = new Set(['daily_reward','event_reward','reward','manual_adjustment','airdrop','mint','staking','receive','claim','gift_claim']);
          const negative = new Set(['penalty','fee','spend','payment','pay','gift_reserve']);
          const skipOnChain = new Set(['deposit','withdrawal','transfer','trade']);
          const deltaBySymbol: Record<string, number> = {};
          for (const tx of txs) {
            const type = String(tx.type || '').toLowerCase();
            const sym = String((tx as any).symbol || '').toUpperCase();
            if (!sym) continue;
            if (skipOnChain.has(type) && (tx as any).transactionHash) continue;
            let raw = Number((tx as any).change);
            if (!Number.isFinite(raw)) raw = Number((tx as any).amount);
            if (!Number.isFinite(raw) || raw === 0) continue;
            const signed = positive.has(type) ? Math.abs(raw) : negative.has(type) ? -Math.abs(raw) : raw;
            if (signed === 0) continue;
            deltaBySymbol[sym] = (deltaBySymbol[sym] || 0) + signed;
          }
          // 로컬 영구 조정(캐시) 반영
          try {
            if (uid) {
              const key = `monitor.local.adjustments:${uid}`;
              const raw = await AsyncStorage.getItem(key);
              const arr: Array<{ symbol: string; delta: number }> = raw ? JSON.parse(raw) : [];
              for (const it of arr) {
                const s = String(it.symbol || '').toUpperCase();
                if (!s) continue;
                const d = Number(it.delta || 0);
                if (!Number.isFinite(d) || d === 0) continue;
                deltaBySymbol[s] = (deltaBySymbol[s] || 0) + d;
              }
            }
          } catch {}
          if (Object.keys(deltaBySymbol).length > 0) {
            // 적용: 기존 심볼에는 amount/valueUSD 가산, 없으면 새 항목 추가
            const next = [...balancesArray];
            for (const [sym, delta] of Object.entries(deltaBySymbol)) {
              const idx = next.findIndex(b => String(b.symbol).toUpperCase() === sym);
              const price = priceManager.getCoinPriceByCurrency(sym, 'USD') || 0;
              if (idx >= 0) {
                const b = next[idx];
                const amount = Number(((b.amount || 0) + (delta as number)).toFixed(8));
                next[idx] = { ...b, amount, valueUSD: price > 0 ? amount * price : b.valueUSD };
              } else {
                const amount = Number((delta as number).toFixed(8));
                next.push({ symbol: sym, amount, valueUSD: price > 0 ? amount * price : 0, name: sym, change24h: 0, change24hPct: 0 } as any);
              }
            }
            balancesArray = next;
          }
        } catch {}
        try {
          balancesArray = await mergeInternalYoyLedgerIntoBalances(uid, balancesArray);
        } catch {}
        if (balancesArray.length > 0) set({ balancesMap: balances || {}, balancesArray });
        // 6) transactions (최대 50개로 제한, buyPrice 계산은 백그라운드)
        const t0c = Date.now();
        const serverTxs = await fetchMeTransactions(idt, 1, 50, { timeoutMs: 25_000 } as any);
        log('GET /me/transactions', { ms: Date.now() - t0c, count: serverTxs?.length || 0 });
        // 6.1) 로컬(보상/비용 등) 거래를 서버 거래와 머지 (중복 제거)
        let mergedTxs: any[] = Array.isArray(serverTxs) ? [...serverTxs] : [];
        try {
          const { useTransactionStore } = await import('@/src/stores/transaction.store');
          const localTxs = useTransactionStore.getState().getTransactions();
          const includeTypes = new Set(['daily_reward','event_reward','reward','manual_adjustment','airdrop','mint','penalty','fee','staking','gift','gift_reserve','gift_claim']);
          // 서버 tx의 고유키: tx_hash(+log_index) 또는 timestamp+symbol+amount
          const seen = new Set<string>();
          for (const t of mergedTxs) {
            const k = String(t?.tx_hash || '') + '|' + String(t?.log_index || '') || (String(t?.timestamp || '') + '|' + String(t?.asset_symbol || t?.symbol || '') + '|' + String(t?.amount || ''));
            seen.add(k);
          }
          for (const lt of localTxs) {
            if (!includeTypes.has(String(lt.type || ''))) continue;
            const norm = {
              // 표준 필드 (서버 형식에 가깝게)
              tx_hash: null,
              log_index: null,
              asset_symbol: String(lt.symbol || '').toUpperCase() || 'YOY',
              amount: lt.amount != null ? lt.amount : Math.abs(Number(lt.change || 0) || 0),
              status: lt.success === false || lt.status === 'failed' ? 'failed' : 'success',
              is_native: false,
              from_address: null,
              to_address: null,
              timestamp: lt.timestamp || new Date().toISOString(),
              meta: { source: lt.source || 'local', type: lt.type || 'reward', local_id: lt.id },
            };
            const key = norm.timestamp + '|' + norm.asset_symbol + '|' + String(norm.amount);
            if (seen.has(key)) continue;
            seen.add(key);
            mergedTxs.push(norm);
          }
          // 6.2) 로컬 영구 조정도 트랜잭션으로 노출(히스토리 일관성)
          try {
            if (uid) {
              const key = `monitor.local.adjustments:${uid}`;
              const raw = await AsyncStorage.getItem(key);
              const arr: Array<{ symbol: string; delta: number; ts?: number; type?: string; note?: string }> = raw ? JSON.parse(raw) : [];
              for (const it of arr) {
                const sym = String(it.symbol || '').toUpperCase();
                if (!sym) continue;
                const amt = Math.abs(Number(it.delta || 0));
                if (!(amt > 0)) continue;
                const ts = it.ts || Date.now();
                const k = ts + '|' + sym + '|' + String(amt);
                if (seen.has(k)) continue;
                seen.add(k);
                mergedTxs.push({
                  tx_hash: null, log_index: null, is_native: false,
                  asset_symbol: sym, amount: amt, status: 'success',
                  from_address: null, to_address: null,
                  timestamp: new Date(ts).toISOString(),
                  meta: { source: 'local.adjust', type: it.type || 'adjust', note: it.note || '' },
                });
              }
            }
          } catch {}
          // 최신순 정렬
          mergedTxs.sort((a, b) => (new Date(b.timestamp).getTime()) - (new Date(a.timestamp).getTime()));
        } catch { /* noop */ }
        // 7) buyPrice 계산은 렌더 이후 비동기로 수행(UX 우선)
        (async () => {
          const inboundByDay: Record<string, Array<{ date: string; amount: number }>> = {};
          try {
            const myLowerAddrs = new Set<string>((addresses || []).map((a: string) => String(a).toLowerCase()));
            for (const t of (serverTxs || [])) {
              const sym = String(t?.asset_symbol || (t?.is_native ? 'ETH' : 'YOY')).toUpperCase();
              const to = String(t?.to_address || '').toLowerCase();
              const amtWei = String(t?.amount || '0');
              const success = String(t?.status || '') === 'success';
              if (!success) continue;
              if (!myLowerAddrs.has(to)) continue; // only inbound
              const dec = getDecimalsForSymbol(sym);
              let num = 0;
              try { num = Number(BigInt(amtWei) / (BigInt(10) ** BigInt(dec))); } catch { num = 0; }
              if (!(num > 0)) continue;
              const day = new Date(String(t?.timestamp || Date.now())).toISOString().slice(0, 10);
              inboundByDay[sym] = inboundByDay[sym] || [];
              inboundByDay[sym].push({ date: day, amount: num });
            }
            const buyMap: Record<string, number> = {};
            // 주요 심볼만(ETH, YOY) 우선 계산
            const symbols = Object.keys(inboundByDay).filter(s => ['YOY','ETH','USDT','USDC'].includes(s));
            for (const sym of symbols) {
              const lots = inboundByDay[sym];
              let sumAmt = 0, sumVal = 0;
              const uniqueDays = Array.from(new Set(lots.map(l => l.date)));
              const dayToPrice: Record<string, number> = {};
              await Promise.all(uniqueDays.map(async d => {
                const p = await fetchHistoricalUsd(sym, d);
                if (p && p > 0) dayToPrice[d] = p;
              }));
              for (const l of lots) {
                const p = dayToPrice[l.date];
                if (!p || p <= 0) continue;
                sumAmt += l.amount;
                sumVal += l.amount * p;
              }
              if (sumAmt > 0 && sumVal > 0) buyMap[sym] = sumVal / sumAmt;
            }
            set({ buyPriceMap: buyMap });
          } catch {}
        })();
        set({
          uid,
          addresses,
          transactions: Array.isArray(mergedTxs) ? mergedTxs : (Array.isArray(serverTxs) ? serverTxs : []),
          lastSuccessAt: Date.now(),
          lastError: null,
          lastErrorAt: null,
        });
        set(state => ({ timeline: [...state.timeline, { tag: '[RENDER]', at: Date.now(), data: { renderMs: Date.now() - t_auth, balancesSummary: Object.keys(balances||{}) } }] }));
      } catch (e: any) {
        console.log(tag || '[SYNC]', 'error', String(e?.message || e));
        set({ lastError: String(e?.message || e), lastErrorAt: Date.now() });
      } finally {
        set({ syncing: false });
        inflight = null;
        perfEnd('syncMe');
      }
    })();
    return inflight;
  },
  applyLocalChange: async ({ symbol, delta, type, description }) => {
    const u = (firebaseAuth as any)?.currentUser?.uid as string | undefined;
    if (!u || !String(symbol || '').trim()) return;
    const key = `monitor.local.adjustments:${u}`;
    const raw = await AsyncStorage.getItem(key);
    const arr: Array<{ symbol: string; delta: number; ts?: number; type?: string; note?: string }> = raw ? JSON.parse(raw) : [];
    arr.push({
      symbol: String(symbol).toUpperCase(),
      delta: Number(delta) || 0,
      ts: Date.now(),
      type: type || 'adjust',
      note: description || '',
    });
    await AsyncStorage.setItem(key, JSON.stringify(arr));
    await get().syncMe('[applyLocalChange]', { force: true });
  },
}));

// 초기 하이드레이트: 앱 시작 직후 캐시된 잔액을 즉시 표시(로그인 직후를 기다리지 않음)
(async () => {
  try {
    // 1) 현재 로그인 사용자 확인
    const u = (firebaseAuth as any)?.currentUser;
    let uid: string | null = u?.uid || null;
    // 2) 마지막으로 성공한 uid가 저장되어 있으면 사용(로그인 직후 race 대비)
    if (!uid) {
      try {
        const savedUid = await AsyncStorage.getItem('monitor.lastKnownUid');
        if (savedUid) uid = savedUid;
      } catch {}
    }
    if (!uid) return;
    // 3) 캐시 로드하여 바로 상태 반영
    const cached = await loadCachedMeBalances(uid);
    if (cached && Object.keys(cached).length > 0) {
      const arr = balancesMapToArray(cached, null);
      useMonitorStore.setState({ uid, balancesMap: cached, balancesArray: arr });
      console.log('[SYNC][EARLY] hydrated from cache for uid=', uid, 'keys=', Object.keys(cached).length);
    }
  } catch {}
})();

// 마지막 성공 uid를 저장하여 다음 실행 시 즉시 하이드레이트 가능하게 함
useMonitorStore.subscribe((state) => {
  if (state.lastSuccessAt && state.uid) {
    try { AsyncStorage.setItem('monitor.lastKnownUid', state.uid); } catch {}
  }
});

