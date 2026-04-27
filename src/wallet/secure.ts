import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY_MNEMONIC = 'WALLET_MNEMONIC';
const KEY_ADDRESS = 'WALLET_ADDRESS';
const KEY_MNEMONIC_WEB = 'wallet.mnemonic';
const KEY_ADDRESS_WEB = 'wallet.address';

/** 지갑/니모닉 관련 AsyncStorage 키. 초기화 시 모두 삭제해 이전 기억이 남지 않게 함 */
const WALLET_ASYNC_KEYS = ['user_wallets'] as const;

export async function saveMnemonic(mnemonic: string): Promise<void> {
  // Web: expo-secure-store is not reliably available; persist in AsyncStorage
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY_MNEMONIC_WEB, mnemonic);
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY_MNEMONIC, mnemonic);
  } catch {
    // Fallback (예: SecureStore 미지원 환경)
    await AsyncStorage.setItem(KEY_MNEMONIC_WEB, mnemonic);
  }
}

export async function loadMnemonic(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return (await AsyncStorage.getItem(KEY_MNEMONIC_WEB)) || null;
    } catch {
      return null;
    }
  }
  try {
    const v = (await SecureStore.getItemAsync(KEY_MNEMONIC)) || null;
    if (v) return v;
  } catch {}
  try {
    return (await AsyncStorage.getItem(KEY_MNEMONIC_WEB)) || null;
  } catch {
    return null;
  }
}

export async function saveAddress(address: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY_ADDRESS_WEB, address);
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY_ADDRESS, address);
  } catch {
    await AsyncStorage.setItem(KEY_ADDRESS_WEB, address);
  }
}

export async function loadAddress(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return (await AsyncStorage.getItem(KEY_ADDRESS_WEB)) || null;
    } catch {
      return null;
    }
  }
  try {
    const v = (await SecureStore.getItemAsync(KEY_ADDRESS)) || null;
    if (v) return v;
  } catch {}
  try {
    return (await AsyncStorage.getItem(KEY_ADDRESS_WEB)) || null;
  } catch {
    return null;
  }
}

/**
 * 지갑(니모닉) 초기화: SecureStore + 지갑 목록 캐시를 모두 삭제하여
 * 이전 니모닉/주소가 어떤 형태로도 남지 않도록 함.
 */
export async function clearWallet(): Promise<void> {
  try { await SecureStore.deleteItemAsync(KEY_MNEMONIC); } catch {}
  try { await SecureStore.deleteItemAsync(KEY_ADDRESS); } catch {}
  try { await AsyncStorage.removeItem(KEY_MNEMONIC_WEB); } catch {}
  try { await AsyncStorage.removeItem(KEY_ADDRESS_WEB); } catch {}
  try {
    for (const key of WALLET_ASYNC_KEYS) {
      await AsyncStorage.removeItem(key);
    }
  } catch {}
}


