import { getEthMonitorHttp } from './config';
import { firebaseAuth } from '@/lib/firebase';
import { getErc20BySymbol } from './erc20Registry';

export type MonitorTx = {
  tx_hash: string;
  log_index: number;
  block_number: number | null;
  from_address: string;
  to_address: string;
  amount: string | null;
  status: 'success' | 'failed';
  timestamp: string;
  source: 'wss' | 'backfill' | 'etherscan';
  asset_symbol?: string;
  asset_contract?: string | null;
  is_native?: boolean;
};

// ===== Common helpers =====
async function getIdTokenStrict(): Promise<string> {
  const u = (firebaseAuth as any)?.currentUser;
  if (!u) throw new Error('Not logged in');
  const t = await u.getIdToken(true);
  if (!t) throw new Error('No ID token');
  return t;
}

async function fetchMonitorJsonAuth(path: string, opts?: { method?: string; body?: any; token?: string }): Promise<any> {
  const base = await getEthMonitorHttp();
  const token = opts?.token ?? (await getIdTokenStrict());
  const url = `${base}${path}`;
  const init: RequestInit = {
    method: opts?.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    } as any,
  };
  if (opts?.body != null) (init as any).body = JSON.stringify(opts.body);
  try {
    console.log('[monitor][request]', url, init.method);
    const res = await fetch(url, init);
    const text = await res.text();
    console.log('[monitor][response]', url, 'status=', res.status, 'head=', text.slice(0, 200));
    try { return JSON.parse(text); } catch { return {}; }
  } catch (e: any) {
    console.log('[monitor][error]', url, String(e?.message || e));
    return {};
  }
}

export async function enrollAddress(address: string, userId?: string): Promise<void> {
  const base = await getEthMonitorHttp();
  try {
    await fetch(`${base}/monitored-addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, user_id: userId })
    });
  } catch {}
}

export async function fetchBalances(address: string): Promise<Record<string, string>> {
  const base = await getEthMonitorHttp();
  const res = await fetch(`${base}/balances/${address}`);
  if (!res.ok) return {};
  const j = await res.json().catch(() => ({}));
  return (j?.balances || {}) as Record<string, string>;
}

export async function fetchTransactions(address: string, page = 1, limit = 100): Promise<MonitorTx[]> {
  const base = await getEthMonitorHttp();
  const res = await fetch(`${base}/transactions?address=${encodeURIComponent(address)}&page=${page}&limit=${limit}`);
  if (!res.ok) return [];
  const j = await res.json().catch(() => ({}));
  return Array.isArray(j?.transactions) ? (j.transactions as MonitorTx[]) : [];
}

// Authenticated variants (Firebase ID token required)
export async function meEnrollAddress(address: string, idToken: string): Promise<void> {
  const base = await getEthMonitorHttp();
  try {
    await fetch(`${base}/me/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ address })
    });
  } catch {}
}

export async function fetchMeBalances(idToken: string): Promise<Record<string, string>> {
  const j = await fetchMonitorJsonAuth(`/me/balances`, { token: idToken });
  return (j?.balances || {}) as Record<string, string>;
}

export async function fetchMeTransactions(idToken: string, page = 1, limit = 100): Promise<MonitorTx[]> {
  const j = await fetchMonitorJsonAuth(`/me/transactions?page=${page}&limit=${limit}`, { token: idToken });
  return Array.isArray(j?.transactions) ? (j.transactions as MonitorTx[]) : [];
}

export async function fetchMeAddresses(idToken: string): Promise<string[]> {
  const j = await fetchMonitorJsonAuth(`/me/addresses`, { token: idToken });
  return Array.isArray(j?.addresses) ? (j.addresses as string[]) : [];
}

export function toHumanAmount(sym: string, isNative: boolean | undefined, amt: string | null, chainIdHex: string | null | undefined): number {
  if (!amt) return 0;
  try {
    const big = BigInt(amt);
    const decimals =
      isNative ? 18 :
      sym.toUpperCase() === 'ETH' ? 18 :
      sym.toUpperCase() === 'YOY' ? 18 :
      (getErc20BySymbol(chainIdHex, sym)?.decimals ?? 18);
    const denom = BigInt(10) ** BigInt(decimals);
    // Convert to number with possible precision loss (UI only)
    return Number(big) / Number(denom);
  } catch {
    return 0;
  }
}

export function formatUnitsToNumber(weiStr: string, decimals = 18): number {
  try {
    const big = BigInt(weiStr || '0');
    const denom = BigInt(10) ** BigInt(decimals);
    return Number(big) / Number(denom);
  } catch { return 0; }
}

export function balancesMapToArray(map: Record<string, string>, chainIdHex: string | null | undefined): Array<{symbol:string;amount:number;valueUSD:number;name:string;change24h:number;change24hPct:number;}> {
  const out: any[] = [];
  for (const [symRaw, val] of Object.entries(map || {})) {
    const sym = String(symRaw).toUpperCase();
    const decimals = sym === 'ETH' || sym === 'YOY' ? 18 : (getErc20BySymbol(chainIdHex, sym)?.decimals ?? 18);
    const amt = formatUnitsToNumber(val, decimals);
    out.push({ symbol: sym, amount: amt, valueUSD: 0, name: sym, change24h: 0, change24hPct: 0 });
  }
  return out;
}

