import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

type WcState = {
  connected: boolean;
  connecting?: boolean;
  address?: string;
  peer?: string;
  uri?: string; // pairing URI (when connecting)
};

type WcContextValue = {
  state: WcState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendErc20: (params: { contract: string; to: string; data: string; from?: string; chainIdHex?: string }) => Promise<string>;
};

const Ctx = createContext<WcContextValue | undefined>(undefined);

export function WalletConnectProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WcState>({ connected: false });
  const clientRef = useRef<any>(null);
  const topicRef = useRef<string | null>(null);
  const accountRef = useRef<string | null>(null);

  const ensureClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current;
    try {
      const SignClient = (await import('@walletconnect/sign-client')).default;
      const projectId = (process as any).env?.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID;
      const client = await SignClient.init({ projectId });
      clientRef.current = client;
      return client;
    } catch (e) {
      console.warn('[WalletConnect] package missing or init failed', e);
      return null;
    }
  }, []);

  const connect = useCallback(async () => {
    const client = await ensureClient();
    if (!client) return;
    try {
      setState((s) => ({ ...s, connecting: true, uri: undefined }));
      const defaultChains = ['0x1','0x5','0x89','0x38','0xa4b1','0xa','0xa86a']; // mainnet, goerli, polygon, bsc, arbitrum, optimism, avalanche
      const chainsParam = defaultChains.map(h => `eip155:${parseInt(h,16)}`);
      const requiredNamespaces = {
        eip155: {
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData'],
          chains: chainsParam,
          events: ['chainChanged', 'accountsChanged'],
        },
      };
      const { uri, approval } = await client.connect({ requiredNamespaces });
      if (uri) {
        setState((s) => ({ ...s, uri, connecting: true, connected: false }));
      }
      const session = await approval();
      topicRef.current = session.topic;
      const accounts: string[] = session.namespaces.eip155.accounts || [];
      const first = accounts[0]?.split(':')[2];
      accountRef.current = first || null;
      setState({ connected: true, connecting: false, address: first, peer: session.peer?.metadata?.name });
    } catch (e) {
      console.warn('[WalletConnect] connect failed', e);
      setState({ connected: false, connecting: false });
    }
  }, [ensureClient]);

  const disconnect = useCallback(async () => {
    try {
      const client = await ensureClient();
      const topic = topicRef.current;
      if (client && topic) await client.disconnect({ topic, reason: { code: 6000, message: 'User disconnected' } });
    } catch {}
    topicRef.current = null;
    accountRef.current = null;
    setState({ connected: false, connecting: false, uri: undefined, address: undefined, peer: undefined });
  }, [ensureClient]);

  const sendErc20 = useCallback(async ({ contract, to, data, from, chainIdHex }: { contract: string; to: string; data: string; from?: string; chainIdHex?: string }) => {
    const client = await ensureClient();
    if (!client || !topicRef.current) throw new Error('Wallet not connected');
    const topic = topicRef.current;
    const fromAddr = from || accountRef.current || '';
    const tx = { from: fromAddr, to: contract, data, value: '0x0' };
    const chainHex = chainIdHex || (process as any).env?.EXPO_PUBLIC_ETH_CHAIN_ID || '0x1';
    const res = await client.request({ topic, chainId: `eip155:${parseInt(chainHex, 16)}`, request: { method: 'eth_sendTransaction', params: [tx] } });
    return String(res);
  }, [ensureClient]);

  const value = useMemo(() => ({ state, connect, disconnect, sendErc20 }), [state, connect, disconnect, sendErc20]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWalletConnect() {
  const v = useContext(Ctx);
  if (!v) throw new Error('WalletConnectProvider missing');
  return v;
}


