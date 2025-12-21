import { YOY_UTILS } from '@/config/yoy-token';
import { getLocalWallet, createNewWallet } from '@/src/wallet/wallet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface Wallet {
  id: string;
  symbol: string;
  name: string;
  network: string;
  address: string;
  privateKey?: string;
  createdAt: string;
  isActive: boolean;
}

export interface WalletContextValue {
  wallets: Wallet[];
  createWallet: (symbol: string, name: string, network: string) => Promise<Wallet>;
  deleteWallet: (symbol: string) => Promise<void>;
  deleteAllWallets: () => Promise<void>;
  getWalletBySymbol: (symbol: string) => Wallet | undefined;
  hasWallet: (symbol: string) => boolean;
  isLoading: boolean;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const WALLET_STORAGE_KEY = 'user_wallets';

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 지갑 데이터 로드
  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      const stored = await AsyncStorage.getItem(WALLET_STORAGE_KEY);
      let parsed: Wallet[] = stored ? JSON.parse(stored) : [];
      // EVM 주소 통일 마이그레이션: ETH/YOY 등은 로컬 EVM 주소로 강제 동기화
      try {
        const isEvm = (s: string) => ['ETH','YOY','USDT','USDC','DAI','WETH','WBTC'].includes(String(s).toUpperCase());
        const local = await getLocalWallet().catch(()=>null);
        const evmAddr = local?.address;
        if (evmAddr) {
          let changed = false;
          parsed = (parsed || []).map((w) => {
            if (isEvm(w.symbol) && w.address?.toLowerCase?.() !== evmAddr.toLowerCase()) {
              changed = true;
              return { ...w, address: evmAddr, isActive: true };
            }
            return w;
          });
          if (changed) {
            await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(parsed));
      }
        }
      } catch {}
      setWallets(parsed);
    } catch (error) {
      console.error('Failed to load wallets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 지갑 생성
  const createWallet = useCallback(async (symbol: string, name: string, network: string): Promise<Wallet> => {
    try {
      // EVM 계열(ETH 및 ERC-20: YOY 포함) → 하나의 EVM 주소를 공유
      const isEvm = (s: string) => ['ETH','YOY','USDT','USDC','DAI','WETH','WBTC'].includes(String(s).toUpperCase());
      let address = '';
      if (isEvm(symbol)) {
        // 이미 로컬 지갑이 있으면 재사용, 없으면 생성
        const local = await getLocalWallet();
        if (local?.address) address = local.address;
        else {
          const created = await createNewWallet();
          address = created.address;
        }
      } else {
        // 비 EVM(예: BTC) - 기존 더미 주소 유지 (표시용만)
        address = generateWalletAddress(symbol);
      }
      
      const newWallet: Wallet = {
        id: `${symbol}_${Date.now()}`,
        symbol,
        name,
        network,
        address,
        createdAt: new Date().toISOString(),
        isActive: true,
      };

      // EVM이면 동일 주소를 사용하는 ETH/YOY 엔트리도 함께 정합성 유지
      let updatedWallets = [...wallets];
      if (isEvm(symbol)) {
        const ensure = (sym: string) => {
          if (!updatedWallets.some(w => w.symbol === sym)) {
            updatedWallets.push({
              id: `${sym}_${Date.now()}`,
              symbol: sym,
              name: sym,
              network,
              address,
              createdAt: new Date().toISOString(),
              isActive: true,
            });
          } else {
            updatedWallets = updatedWallets.map(w => w.symbol === sym ? { ...w, address, isActive: true } : w);
          }
        };
        ensure('ETH');
        ensure('YOY');
      } else {
        updatedWallets.push(newWallet);
      }
      setWallets(updatedWallets);
      
      // AsyncStorage에 저장
      await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(updatedWallets));
      
      // 반환: 방금 만든 심볼 항목
      const ret = updatedWallets.find(w => w.symbol === symbol)!;
      return ret;
    } catch (error) {
      console.error('Failed to create wallet:', error);
      throw error;
    }
  }, [wallets]);

  // 심볼로 지갑 찾기
  const getWalletBySymbol = useCallback((symbol: string): Wallet | undefined => {
    const hit = wallets.find(wallet => wallet.symbol === symbol && wallet.isActive);
    if (hit) return hit;
    // EVM 심볼이면 로컬 지갑 주소를 즉시 반영해 가짜가 아닌 실제 EVM 주소를 돌려준다
    const isEvm = (s: string) => ['ETH','YOY','USDT','USDC','DAI','WETH','WBTC'].includes(String(s).toUpperCase());
    if (isEvm(symbol)) {
      // 동기 API가 아니라서 표시 전용 임시 객체를 만든다. 화면에서 주소만 사용
      // 주의: 실제 저장은 createWallet 시점에 수행
      let addr = '';
      try {
        // getLocalWallet은 Promise지만 여기서는 undefined일 수 있으므로 미리 캐시된 값이 없으면 undefined 반환
        // 표시 타이밍 문제를 피하려면 화면에서 createWallet(ETH/YOY) 한 번 실행하는 것을 권장
        // 다만, 이미 만들어진 경우엔 최근 세션에서 메모리에 남아있다.
      } catch {}
      // fallback: 기존에 저장된 EVM 엔트리 중 하나의 주소 재사용
      const anyEvm = wallets.find(w => ['ETH','YOY'].includes(w.symbol));
      if (anyEvm) addr = anyEvm.address;
      if (addr) {
        return {
          id: `${symbol}_virtual`,
          symbol,
          name: symbol,
          network: 'Ethereum',
          address: addr,
          createdAt: new Date().toISOString(),
          isActive: true,
        };
      }
    }
    return undefined;
  }, [wallets]);

  // 지갑 삭제
  const deleteWallet = useCallback(async (symbol: string): Promise<void> => {
    try {
      const updatedWallets = wallets.filter(wallet => wallet.symbol !== symbol);
      setWallets(updatedWallets);
      await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(updatedWallets));
    } catch (error) {
      console.error('Failed to delete wallet:', error);
      throw error;
    }
  }, [wallets]);

  // 모든 지갑 삭제
  const deleteAllWallets = useCallback(async (): Promise<void> => {
    try {
      setWallets([]);
      await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify([]));
    } catch (error) {
      console.error('Failed to delete all wallets:', error);
      throw error;
    }
  }, []);

  // 지갑 존재 여부 확인
  const hasWallet = useCallback((symbol: string): boolean => {
    return wallets.some(wallet => wallet.symbol === symbol && wallet.isActive);
  }, [wallets]);

  const value: WalletContextValue = {
    wallets,
    createWallet,
    deleteWallet,
    deleteAllWallets,
    getWalletBySymbol,
    hasWallet,
    isLoading,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

// 실제 지갑 주소 생성 함수 (올바른 길이와 형식)
function generateWalletAddress(symbol: string): string {
  if (symbol === 'BTC') {
    // Bitcoin 주소: 26-35자리 (보통 34자리)
    // Base58 인코딩된 주소 (1, 3으로 시작)
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '1'; // P2PKH 주소로 시작
    for (let i = 0; i < 33; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  } else if (YOY_UTILS.isYOYToken(symbol)) {
    // YOY 토큰: Ethereum 메인넷 기반 ERC-20 토큰
    // 컨트랙트 주소: 0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701
    // YOY는 Ethereum 주소 형식 사용 (42자리: 0x + 40자리 hex)
    const hexChars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += hexChars[Math.floor(Math.random() * hexChars.length)];
    }
    return address;
  } else {
    // 기타 EVM 호환 주소: 42자리 (0x + 40자리 hex)
    const hexChars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += hexChars[Math.floor(Math.random() * hexChars.length)];
    }
    return address;
  }
}
