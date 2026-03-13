import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_YOY_CONTRACT = 'admin.yoyContractAddress';
const KEY_ETH_CHAINID = 'admin.ethChainIdHex';
const KEY_TREASURY = 'admin.yoyTreasuryAddress';

export async function getYoyContractAddress(): Promise<string | null> {
  try {
    const saved = await AsyncStorage.getItem(KEY_YOY_CONTRACT);
    if (saved && saved.startsWith('0x') && saved.length === 42) return saved;
  } catch {}
  const env = (process as any).env?.EXPO_PUBLIC_YOY_ERC20_ADDRESS;
  return env && typeof env === 'string' ? env : null;
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


