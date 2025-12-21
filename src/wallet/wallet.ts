import { ethers } from 'ethers';
import Constants from 'expo-constants';
import { getActiveChain } from './chains';
import { saveMnemonic, saveAddress, loadMnemonic } from './secure';

export type WalletErrorCode =
  | 'invalid_address'
  | 'insufficient_funds'
  | 'fee_too_low'
  | 'nonce_too_low'
  | 'network_error'
  | 'unknown';

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message?: string) {
    super(message || code);
    this.code = code;
  }
}

function readExtra(key: string): string | undefined {
  try {
    const extra = (Constants?.expoConfig as any)?.extra || (Constants?.manifest as any)?.extra || {};
    return extra[key];
  } catch {
    return (process as any)?.env?.[key];
  }
}

function getYoyContractFromEnv(): string {
  const v = readExtra('EXPO_PUBLIC_YOY_ERC20_ADDRESS') || (process as any)?.env?.EXPO_PUBLIC_YOY_ERC20_ADDRESS;
  return typeof v === 'string' ? v : '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701';
}

export async function createNewWallet(): Promise<{ address: string; mnemonic: string }> {
  const w = ethers.Wallet.createRandom();
  const mnemonic = w.mnemonic?.phrase || '';
  if (!mnemonic) throw new WalletError('unknown', 'mnemonic unavailable');
  await saveMnemonic(mnemonic);
  await saveAddress(w.address);
  return { address: w.address, mnemonic };
}

export async function importWalletFromMnemonic(mnemonic: string): Promise<{ address: string }> {
  const w = ethers.Wallet.fromPhrase(mnemonic.trim());
  await saveMnemonic(mnemonic.trim());
  await saveAddress(w.address);
  return { address: w.address };
}

export async function getLocalWallet(): Promise<{ address: string; wallet: ethers.Wallet } | null> {
  const phrase = await loadMnemonic();
  if (!phrase) return null;
  const wallet = ethers.Wallet.fromPhrase(phrase);
  return { address: wallet.address, wallet };
}

export function getProvider(): ethers.JsonRpcProvider {
  const active = getActiveChain();
  return new ethers.JsonRpcProvider(active.rpcUrl, active.chainIdDec);
}

const MIN_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function decimals() view returns (uint8)',
];

export async function sendYoyToken({ to, amount }: { to: string; amount: string }): Promise<{ hash: string }> {
  try {
    if (!ethers.isAddress(to)) throw new WalletError('invalid_address', '잘못된 주소');
    const local = await getLocalWallet();
    if (!local) throw new WalletError('unknown', '지갑이 없습니다');
    const provider = getProvider();
    const signer = local.wallet.connect(provider);
    const contractAddr = getYoyContractFromEnv();
    const contract = new ethers.Contract(contractAddr, MIN_ABI, signer);
    const decimals: number = 18;
    const value = ethers.parseUnits(amount, decimals);
    const fee = await provider.getFeeData();
    const gas = await contract.transfer.estimateGas(to, value).catch(async () => {
      // fallback gas estimate
      return BigInt(90000);
    });
    const tx = await contract.transfer(to, value, {
      gasLimit: gas,
      maxFeePerGas: fee.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined,
    });
    const receipt = await tx.wait();
    return { hash: tx.hash };
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/insufficient funds|balance/i.test(msg)) throw new WalletError('insufficient_funds', msg);
    if (/fee|gas/i.test(msg)) throw new WalletError('fee_too_low', msg);
    if (/nonce/i.test(msg)) throw new WalletError('nonce_too_low', msg);
    if (/network/i.test(msg) || /ECONN/i.test(msg)) throw new WalletError('network_error', msg);
    if (e?.code === 'INVALID_ARGUMENT') throw new WalletError('invalid_address', msg);
    throw new WalletError('unknown', msg);
  }
}


