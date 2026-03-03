import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_YOY_CONTRACT = 'admin.yoyContractAddress';
const KEY_ETH_CHAINID = 'admin.ethChainIdHex';

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
  const env = (process as any).env?.EXPO_PUBLIC_ETH_MONITOR_HTTP as string | undefined;
  if (!env || typeof env !== 'string' || env.length < 8) {
    console.error('[monitor] EXPO_PUBLIC_ETH_MONITOR_HTTP is missing. Aborting calls.');
    throw new Error('Monitor base URL not configured');
  }
  try { await AsyncStorage.setItem(KEY_MONITOR_HTTP, env); } catch {}
  console.log('[monitor] base =', env);
  return env;
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


