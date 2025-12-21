import * as SecureStore from 'expo-secure-store';

const KEY_MNEMONIC = 'WALLET_MNEMONIC';
const KEY_ADDRESS = 'WALLET_ADDRESS';

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

export async function clearWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_MNEMONIC);
  await SecureStore.deleteItemAsync(KEY_ADDRESS);
}


