import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_MNEMONIC = 'WALLET_MNEMONIC';
const KEY_ADDRESS = 'WALLET_ADDRESS';

/** 지갑/니모닉 관련 AsyncStorage 키. 초기화 시 모두 삭제해 이전 기억이 남지 않게 함 */
const WALLET_ASYNC_KEYS = ['user_wallets'] as const;

export async function saveMnemonic(mnemonic: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_MNEMONIC, mnemonic);
}

export async function loadMnemonic(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(KEY_MNEMONIC)) || null;
  } catch {
    return null;
  }
}

export async function saveAddress(address: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_ADDRESS, address);
}

export async function loadAddress(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(KEY_ADDRESS)) || null;
  } catch {
    return null;
  }
}

/**
 * 지갑(니모닉) 초기화: SecureStore + 지갑 목록 캐시를 모두 삭제하여
 * 이전 니모닉/주소가 어떤 형태로도 남지 않도록 함.
 */
export async function clearWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_MNEMONIC);
  await SecureStore.deleteItemAsync(KEY_ADDRESS);
  try {
    for (const key of WALLET_ASYNC_KEYS) {
      await AsyncStorage.removeItem(key);
    }
  } catch {}
}


