import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

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

  const TRANSACTIONS_KEY = 'transactions';

  // Load transactions from AsyncStorage
  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const savedTransactions = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (savedTransactions) {
        const parsedTransactions = JSON.parse(savedTransactions);
        setTransactions(parsedTransactions);
      } else {
        // Initialize with some sample transactions if none exist
        const userEmail = currentUser?.email || 'user@example.com';
        const sampleTransactions: Transaction[] = [
          {
            id: '1',
            type: 'reward',
            from: '0x0000000000000000000000000000000000000000',
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik public address (example)
            amount: 1,
            currency: 'YOY',
            description: 'Daily Attendance Reward',
            timestamp: new Date().toISOString(),
            status: 'completed',
            // hash intentionally omitted for demo; address/block are real so Open works
            blockNumber: 17000000,
            gasUsed: 21000,
            gasPrice: 0.00000002,
            network: 'Ethereum',
            blockTimestamp: new Date().toISOString(),
            memo: '출석체크 보상'
          },
          {
            id: '2',
            type: 'send',
            from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b',
            amount: 5,
            currency: 'YOY',
            description: 'Send to friend',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            status: 'completed',
            blockNumber: 17000001,
            fee: 0.001,
            gasUsed: 21000,
            gasPrice: 0.00000002,
            network: 'Ethereum',
            blockTimestamp: new Date(Date.now() - 3600000).toISOString(),
            memo: '친구에게 전송'
          },
          {
            id: '3',
            type: 'receive',
            from: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b',
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            amount: 2,
            currency: 'YOY',
            description: 'Received payment',
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            status: 'completed',
            blockNumber: 17000002,
            gasUsed: 21000,
            gasPrice: 0.00000002,
            network: 'Ethereum',
            blockTimestamp: new Date(Date.now() - 7200000).toISOString()
          },
          {
            id: '4',
            type: 'send',
            from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            to: '0x0A869d79a7052C7f1b55a8EbAbbEa3420F0D1E13',
            amount: 10,
            currency: 'YOY',
            description: 'Failed transfer',
            timestamp: new Date(Date.now() - 10800000).toISOString(),
            status: 'failed',
            blockNumber: 17000003,
            gasUsed: 21000,
            gasPrice: 0.00000002,
            network: 'Ethereum',
            blockTimestamp: new Date(Date.now() - 10800000).toISOString()
          },
          {
            id: '5',
            type: 'receive',
            from: '0x1be4f420882eG765036245978Jdg469f7f1e7f1e9',
            to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
            amount: 100,
            currency: 'YOY',
            description: 'Suspicious transaction',
            timestamp: new Date(Date.now() - 14400000).toISOString(),
            status: 'rejected',
            hash: '0x5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
            blockNumber: 12345660,
            gasUsed: 21000,
            gasPrice: 0.00000002,
            network: 'YOY',
            blockTimestamp: new Date(Date.now() - 14400000).toISOString()
          },
          {
            id: '6',
            type: 'buy',
            from: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
            to: '0x2cf5f531993fH876147356089Keg570g8g2f8g2f0',
            amount: 50,
            currency: 'YOY',
            description: 'Buy order cancelled',
            timestamp: new Date(Date.now() - 18000000).toISOString(),
            status: 'cancelled',
            hash: '0x6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
            blockNumber: 12345655,
            gasUsed: 21000,
            gasPrice: 0.00000002,
            network: 'YOY',
            blockTimestamp: new Date(Date.now() - 18000000).toISOString()
          }
        ];
        setTransactions(sampleTransactions);
        await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(sampleTransactions));
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
      
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(updatedTransactions));
      
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
      await AsyncStorage.removeItem(TRANSACTIONS_KEY);
    } catch (error) {
      console.error('Failed to clear transactions:', error);
      throw error;
    }
  };

  const updateTransactionMemo = async (id: string, memo: string) => {
    try {
      const updated = transactions.map(tx => (tx.id === id ? { ...tx, memo } : tx));
      setTransactions(updated);
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to update memo:', error);
      throw error;
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
