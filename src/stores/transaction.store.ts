import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ===== 거래 타입 정의 =====
export type TransactionType = 
  | 'swap' 
  | 'daily_reward' 
  | 'event_reward' 
  | 'staking' 
  | 'manual_adjustment'
  | 'deposit'
  | 'withdrawal'
  | 'transfer'
  | 'trade'
  | 'reward'
  | 'penalty'
  | 'fee'
  | 'refund'
  | 'airdrop'
  | 'burn'
  | 'mint';

export interface Transaction {
  id: string;
  type: TransactionType;
  success: boolean;
  timestamp: string;
  description: string;
  
  // 스왑 관련
  fromToken?: string;
  toToken?: string;
  fromAmount?: number;
  toAmount?: number;
  transactionHash?: string;
  swapId?: string; // 같은 스왑을 그룹화하기 위한 ID
  swapType?: 'from' | 'to'; // 스왑에서 fromToken 차감인지 toToken 증가인지
  
  // 일반 거래 관련
  symbol?: string;
  amount?: number;
  change?: number;
  balance?: number;
  
  // 추가 정보
  fee?: number;
  status?: 'pending' | 'completed' | 'failed';
  memo?: string;
  category?: string;
  
  // 메타데이터
  userId?: string;
  source?: string; // 'uniswap', 'wallet', 'dashboard', etc.
}

// ===== 거래 스토어 상태 =====
interface TransactionState {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
}

// ===== 거래 액션 =====
interface TransactionActions {
  // 거래 추가
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => Transaction;
  
  // 거래 업데이트
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  
  // 거래 삭제
  removeTransaction: (id: string) => void;
  
  // 거래 조회
  getTransactions: (filters?: {
    type?: TransactionType;
    symbol?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => Transaction[];
  
  // 거래 통계
  getTransactionStats: (symbol?: string, period?: 'day' | 'week' | 'month' | 'year') => {
    totalTransactions: number;
    totalVolume: number;
    totalFees: number;
    successRate: number;
  };
  
  // 잔액 업데이트 (거래와 함께)
  updateBalance: (symbol: string, change: number, transactionData: Partial<Transaction>) => Transaction;
  
  // 스왑 거래 기록
  recordSwap: (data: {
    fromToken: string;
    toToken: string;
    fromAmount: number;
    toAmount: number;
    transactionHash?: string;
    fee?: number;
  }) => Transaction;
  
  // 보상 거래 기록
  recordReward: (data: {
    symbol: string;
    amount: number;
    description: string;
    type?: 'daily_reward' | 'event_reward' | 'airdrop';
  }) => Transaction;
  
  // 스테이킹 거래 기록
  recordStaking: (data: {
    symbol: string;
    amount: number;
    description: string;
    duration?: number;
  }) => Transaction;
  
  // 수동 조정 기록
  recordManualAdjustment: (data: {
    symbol: string;
    change: number;
    description: string;
    reason?: string;
  }) => Transaction;
  
  // 모든 거래 초기화
  clearAllTransactions: () => void;
  
  // 로딩 상태 관리
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ===== 거래 스토어 =====
export const useTransactionStore = create<TransactionState & TransactionActions>()(
  persist(
    (set, get) => ({
      transactions: [],
      loading: false,
      error: null,

      addTransaction: (transactionData) => {
        const transaction: Transaction = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          ...transactionData,
        };

        set((state) => ({
          transactions: [transaction, ...state.transactions],
        }));

        return transaction;
      },

      updateTransaction: (id, updates) => {
        set((state) => ({
          transactions: state.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...updates } : tx
          ),
        }));
      },

      removeTransaction: (id) => {
        set((state) => ({
          transactions: state.transactions.filter((tx) => tx.id !== id),
        }));
      },

      getTransactions: (filters = {}) => {
        const { transactions } = get();
        let filtered = [...transactions];

        if (filters.type) {
          filtered = filtered.filter((tx) => tx.type === filters.type);
        }

        if (filters.symbol) {
          filtered = filtered.filter((tx) => tx.symbol === filters.symbol);
        }

        if (filters.userId) {
          filtered = filtered.filter((tx) => tx.userId === filters.userId);
        }

        if (filters.startDate) {
          filtered = filtered.filter((tx) => new Date(tx.timestamp) >= new Date(filters.startDate!));
        }

        if (filters.endDate) {
          filtered = filtered.filter((tx) => new Date(tx.timestamp) <= new Date(filters.endDate!));
        }

        if (filters.limit) {
          filtered = filtered.slice(0, filters.limit);
        }

        return filtered;
      },

      getTransactionStats: (symbol, period = 'month') => {
        const { transactions } = get();
        let filtered = [...transactions];

        if (symbol) {
          filtered = filtered.filter((tx) => tx.symbol === symbol);
        }

        // 기간 필터링
        const now = new Date();
        const periodStart = new Date();
        
        switch (period) {
          case 'day':
            periodStart.setDate(now.getDate() - 1);
            break;
          case 'week':
            periodStart.setDate(now.getDate() - 7);
            break;
          case 'month':
            periodStart.setMonth(now.getMonth() - 1);
            break;
          case 'year':
            periodStart.setFullYear(now.getFullYear() - 1);
            break;
        }

        filtered = filtered.filter((tx) => new Date(tx.timestamp) >= periodStart);

        const totalTransactions = filtered.length;
        const totalVolume = filtered.reduce((sum, tx) => {
          const amount = tx.amount || tx.fromAmount || tx.toAmount || 0;
          return sum + amount;
        }, 0);
        const totalFees = filtered.reduce((sum, tx) => sum + (tx.fee || 0), 0);
        const successfulTransactions = filtered.filter((tx) => tx.success).length;
        const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;

        return {
          totalTransactions,
          totalVolume,
          totalFees,
          successRate,
        };
      },

      updateBalance: (symbol, change, transactionData) => {
        const transaction = get().addTransaction({
          type: 'manual_adjustment',
          success: true,
          symbol,
          change,
          amount: Math.abs(change),
          description: transactionData.description || `${change > 0 ? '입금' : '출금'}: ${symbol}`,
          ...transactionData,
        });

        return transaction;
      },

      recordSwap: (data) => {
        const swapId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        // 1. fromToken 차감 거래 기록
        const fromTransaction = get().addTransaction({
          type: 'swap',
          success: true,
          status: 'completed',
          symbol: data.fromToken,
          amount: data.fromAmount,
          change: -data.fromAmount, // 차감
          transactionHash: data.transactionHash,
          fee: data.fee,
          description: `${data.fromAmount} ${data.fromToken} → ${data.toAmount} ${data.toToken}`,
          source: 'uniswap',
          swapId: swapId, // 같은 스왑임을 표시
          swapType: 'from'
        });

        // 2. toToken 증가 거래 기록
        const toTransaction = get().addTransaction({
          type: 'swap',
          success: true,
          status: 'completed',
          symbol: data.toToken,
          amount: data.toAmount,
          change: data.toAmount, // 증가
          transactionHash: data.transactionHash,
          fee: data.fee,
          description: `${data.fromAmount} ${data.fromToken} → ${data.toAmount} ${data.toToken}`,
          source: 'uniswap',
          swapId: swapId, // 같은 스왑임을 표시
          swapType: 'to'
        });

        return { fromTransaction, toTransaction };
      },

      recordReward: (data) => {
        return get().addTransaction({
          type: data.type || 'reward',
          success: true,
          status: 'completed',
          symbol: data.symbol,
          amount: data.amount,
          change: data.amount,
          description: data.description,
          source: 'system',
        });
      },

      recordStaking: (data) => {
        return get().addTransaction({
          type: 'staking',
          success: true,
          status: 'completed',
          symbol: data.symbol,
          amount: data.amount,
          change: -data.amount, // 스테이킹은 잔액에서 차감
          description: data.description,
          source: 'staking',
        });
      },

      recordManualAdjustment: (data) => {
        return get().addTransaction({
          type: 'manual_adjustment',
          success: true,
          status: 'completed',
          symbol: data.symbol,
          amount: Math.abs(data.change),
          change: data.change,
          description: data.description,
          memo: data.reason,
          source: 'admin',
        });
      },

      clearAllTransactions: () => {
        set({ transactions: [] });
      },

      setLoading: (loading) => {
        set({ loading });
      },

      setError: (error) => {
        set({ error });
      },
    }),
    {
      name: 'yoo-transaction-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ===== 유틸리티 함수 =====
export const formatTransactionAmount = (amount: number, symbol: string): string => {
  if (amount === 0) return '0';
  if (amount < 0.0001) return `${amount.toFixed(8)} ${symbol}`;
  if (amount < 1) return `${amount.toFixed(6)} ${symbol}`;
  if (amount < 1000) return `${amount.toFixed(4)} ${symbol}`;
  return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${symbol}`;
};

export const getTransactionIcon = (type: TransactionType): string => {
  const icons: Record<TransactionType, string> = {
    swap: '🔄',
    daily_reward: '📅',
    event_reward: '🎁',
    staking: '🔒',
    manual_adjustment: '⚙️',
    deposit: '📥',
    withdrawal: '📤',
    transfer: '↔️',
    trade: '💱',
    reward: '🎁',
    penalty: '⚠️',
    fee: '💸',
    refund: '↩️',
    airdrop: '🎈',
    burn: '🔥',
    mint: '🪙',
  };
  return icons[type] || '📋';
};

export const getTransactionColor = (type: TransactionType): string => {
  const colors: Record<TransactionType, string> = {
    swap: '#4CAF50',
    daily_reward: '#FF9800',
    event_reward: '#E91E63',
    staking: '#9C27B0',
    manual_adjustment: '#607D8B',
    deposit: '#4CAF50',
    withdrawal: '#F44336',
    transfer: '#2196F3',
    trade: '#FF9800',
    reward: '#E91E63',
    penalty: '#F44336',
    fee: '#FF5722',
    refund: '#795548',
    airdrop: '#00BCD4',
    burn: '#FF5722',
    mint: '#4CAF50',
  };
  return colors[type] || '#9E9E9E';
};
