import Constants from 'expo-constants';

type ChainConfig = {
  name: 'mainnet' | 'sepolia';
  chainIdDec: number;
  rpcUrl: string;
  explorerTxBase: string;
};

function readExtra(key: string): string | undefined {
  try {
    const extra = (Constants?.expoConfig as any)?.extra || (Constants?.manifest as any)?.extra || {};
    const v = extra[key];
    if (typeof v === 'string') {
      // env 치환 실패 시 남는 템플릿("${EXPO_PUBLIC_...}")은 무시하고 폴백 사용
      if (/\$\{\s*[\w.-]+\s*\}/i.test(v)) return undefined;
      return v;
    }
    return undefined;
  } catch {
    return (process as any)?.env?.[key];
  }
}

export function getActiveChain(): ChainConfig {
  const chain = (readExtra('EXPO_PUBLIC_CHAIN') || (process as any)?.env?.EXPO_PUBLIC_CHAIN || 'sepolia').toLowerCase();
  if (chain === 'mainnet' || chain === 'ethereum' || chain === 'eth') {
    const rpc = readExtra('EXPO_PUBLIC_RPC_MAINNET') || (process as any)?.env?.EXPO_PUBLIC_RPC_MAINNET || 'https://ethereum.publicnode.com';
    return {
      name: 'mainnet',
      chainIdDec: 1,
      rpcUrl: rpc,
      explorerTxBase: 'https://etherscan.io/tx/',
    };
  }
  // default: sepolia
  const rpc = readExtra('EXPO_PUBLIC_RPC_SEPOLIA') || (process as any)?.env?.EXPO_PUBLIC_RPC_SEPOLIA || 'https://ethereum-sepolia.publicnode.com';
  return {
    name: 'sepolia',
    chainIdDec: 11155111,
    rpcUrl: rpc,
    explorerTxBase: 'https://sepolia.etherscan.io/tx/',
  };
}


