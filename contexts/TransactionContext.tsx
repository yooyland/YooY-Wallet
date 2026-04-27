import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Platform } from 'react-native';

export interface Transaction {
  id: string;
  type: 'reward' | 'send' | 'receive' | 'buy' | 'sell' | 'swap';
  from: string;
  to: string;
  amount: number;
  currency: string;
  description: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed' | 'rejected' | 'cancelled';
  fee?: number;
  hash?: string;
  blockNumber?: number;
  gasUsed?: number;
  gasPrice?: number;
  network?: 'Ethereum' | 'BSC' | 'YOY' | 'Polygon' | 'Arbitrum';
  blockTimestamp?: string;
  memo?: string;
}

interface TransactionContextValue {
  transactions: Transaction[];
  addTransaction: (transaction: Omit<Transaction, 'id' | 'timestamp'>) => Promise<void>;
  getTransactionsByUser: (userEmail: string) => Transaction[];
  getTransactionsByType: (type: Transaction['type']) => Transaction[];
  getRecentTransactions: (limit?: number) => Transaction[];
  clearTransactions: () => Promise<void>;
  updateTransactionMemo: (id: string, memo: string) => Promise<void>;
  loading: boolean;
}

const TransactionContext = createContext<TransactionContextValue | undefined>(undefined);

export const useTransaction = () => {
  const context = useContext(TransactionContext);
  if (!context) {
    throw new Error('useTransaction must be used within a TransactionProvider');
  }
  return context;
};

interface TransactionProviderProps {
  children: ReactNode;
}

export const TransactionProvider: React.FC<TransactionProviderProps> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, currentUser } = useAuth();

  const storageBase: any =
    Platform.OS === 'web' ? ((globalThis as any)?.localStorage || AsyncStorage) : AsyncStorage;

  const TRANSACTIONS_KEY = (() => {
    const uid = String(currentUser?.uid || '').trim();
    return uid ? `transactions:u:${uid}` : 'transactions:u:anon';
  })();

  // Load transactions from AsyncStorage
  useEffect(() => {
    loadTransactions();
  }, [TRANSACTIONS_KEY]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const savedTransactions = await storageBase.getItem(TRANSACTIONS_KEY);
      if (savedTransactions) {
        const parsedTransactions = JSON.parse(savedTransactions);
        setTransactions(parsedTransactions);
      } else {
        // 초기값은 빈 배열 (타 계정/데모 데이터 섞임 방지)
        setTransactions([]);
        await storageBase.setItem(TRANSACTIONS_KEY, JSON.stringify([]));
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTransaction = async (transactionData: Omit<Transaction, 'id' | 'timestamp'>) => {
    try {
      const newTransaction: Transaction = {
        ...transactionData,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString()
      };

      const updatedTransactions = [newTransaction, ...transactions];
      setTransactions(updatedTransactions);
      
      await storageBase.setItem(TRANSACTIONS_KEY, JSON.stringify(updatedTransactions));
      
      console.log('Transaction added:', newTransaction);
    } catch (error) {
      console.error('Failed to add transaction:', error);
      throw error;
    }
  };

  const getTransactionsByUser = (userEmail: string): Transaction[] => {
    return transactions.filter(
      tx => tx.from === userEmail || tx.to === userEmail
    );
  };

  const getTransactionsByType = (type: Transaction['type']): Transaction[] => {
    return transactions.filter(tx => tx.type === type);
  };

  const getRecentTransactions = (limit: number = 10): Transaction[] => {
    return transactions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  };

  const clearTransactions = async () => {
    try {
      setTransactions([]);
      await storageBase.removeItem(TRANSACTIONS_KEY);
    } catch (error) {
      console.error('Failed to clear transactions:', error);
      throw error;
    }
  };

  const updateTransactionMemo = async (id: string, memo: string) => {
    try {
      const updated = transactions.map(tx => (tx.id === id ? { ...tx, memo } : tx));
      setTransactions(updated);
      await storageBase.setItem(TRANSACTIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update memo:', error);
    }
  };

  const value: TransactionContextValue = {
    transactions,
    addTransaction,
    getTransactionsByUser,
    getTransactionsByType,
    getRecentTransactions,
    clearTransactions,
    updateTransactionMemo,
    loading
  };

  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  );
};
