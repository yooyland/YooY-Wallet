import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const KEY_YOY_CONTRACT = 'admin.yoyContractAddress';
const KEY_ETH_CHAINID = 'admin.ethChainIdHex';
const KEY_TREASURY = 'admin.yoyTreasuryAddress';

/** app.config.js extra / 번들 기본과 동일 (process.env 만 보면 런타임에 비어 YOY 온체인이 0으로 떨어지는 회귀 방지) */
const FALLBACK_YOY_ERC20 = '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701';

function readExtra(key: string): string | undefined {
  try {
    const extra = (Constants?.expoConfig as any)?.extra || (Constants?.manifest as any)?.extra || {};
    const v = extra[key];
    if (typeof v === 'string') {
      if (/\$\{\s*[\w.-]+\s*\}/i.test(v)) return undefined;
      return v;
    }
    return undefined;
  } catch {
    return (process as any)?.env?.[key];
  }
}

export async function getYoyContractAddress(): Promise<string | null> {
  try {
    const saved = await AsyncStorage.getItem(KEY_YOY_CONTRACT);
    if (saved && saved.startsWith('0x') && saved.length === 42) return saved;
  } catch {}
  const fromExtra = readExtra('EXPO_PUBLIC_YOY_ERC20_ADDRESS');
  if (fromExtra && fromExtra.startsWith('0x') && fromExtra.length === 42) return fromExtra;
  const env = (process as any).env?.EXPO_PUBLIC_YOY_ERC20_ADDRESS;
  if (env && typeof env === 'string' && env.startsWith('0x') && env.length === 42) return env;
  return FALLBACK_YOY_ERC20;
}

export async function setYoyContractAddress(addr: string): Promise<void> {
  await AsyncStorage.setItem(KEY_YOY_CONTRACT, addr);
}

export async function getYoyTreasuryAddress(): Promise<string | null> {
  try {
    const saved = await AsyncStorage.getItem(KEY_TREASURY);
    if (saved && saved.startsWith('0x') && saved.length === 42) return saved;
  } catch {}
  const env = (process as any).env?.EXPO_PUBLIC_YOY_TREASURY_ADDRESS;
  return env && typeof env === 'string' ? env : null;
}

export async function setYoyTreasuryAddress(addr: string): Promise<void> {
  await AsyncStorage.setItem(KEY_TREASURY, addr);
}

export async function getEthChainIdHex(): Promise<string | null> {
  try {
    const saved = await AsyncStorage.getItem(KEY_ETH_CHAINID);
    if (saved && saved.startsWith('0x')) return saved;
  } catch {}
  const env = (process as any).env?.EXPO_PUBLIC_ETH_CHAIN_ID;
  return env && typeof env === 'string' ? env : null;
}

export async function setEthChainIdHex(chainIdHex: string): Promise<void> {
  await AsyncStorage.setItem(KEY_ETH_CHAINID, chainIdHex);
}

const KEY_MONITOR_HTTP = 'admin.ethMonitorHttp'; // retained for admin UI display, not for fallback
const KEY_MONITOR_WS = 'admin.ethMonitorWs';

export async function getEthMonitorHttp(): Promise<string> {
  const c1 = (process as any).env?.EXPO_PUBLIC_ETH_MONITOR_BASE as string | undefined;
  const c2 = (process as any).env?.EXPO_PUBLIC_API_BASE as string | undefined;
  const c3 = (process as any).env?.EXPO_PUBLIC_ETH_MONITOR_HTTP as string | undefined;
  let base = (c1 || c2 || c3 || 'https://yoy-monitor.onrender.com') as string;
  if (typeof base !== 'string') base = 'https://yoy-monitor.onrender.com';
  base = base.trim().replace(/\/+$/,''); // remove trailing slash
  // Guard: common typo or invalid base → normalize to prevent "Network request failed"
  try {
    // Ensure scheme exists
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    const u = new URL(base);
    // Fix common typo: onrenderder.com -> onrender.com
    if (u.hostname.toLowerCase().endsWith('onrenderder.com')) {
      u.hostname = u.hostname.toLowerCase().replace(/onrenderder\.com$/i, 'onrender.com');
      base = u.toString().replace(/\/+$/,'');
    }
  } catch {
    base = 'https://yoy-monitor.onrender.com';
  }
  try { await AsyncStorage.setItem(KEY_MONITOR_HTTP, base); } catch {}
  console.log('[monitor] base =', base);
  return base;
}

export async function setEthMonitorHttp(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY_MONITOR_HTTP, url);
}

export async function getEthMonitorWs(): Promise<string> {
  const env = (process as any).env?.EXPO_PUBLIC_ETH_MONITOR_WS as string | undefined;
  if (!env || typeof env !== 'string' || env.length < 8) {
    throw new Error('Monitor WS URL not configured');
  }
  try { await AsyncStorage.setItem(KEY_MONITOR_WS, env); } catch {}
  console.log('[monitor] ws =', env);
  return env;
}

export async function setEthMonitorWs(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY_MONITOR_WS, url);
}


