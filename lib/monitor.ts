import { getEthMonitorHttp } from './config';
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

