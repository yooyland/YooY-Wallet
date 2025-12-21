/**
 * YooY Land Swap Module - Uniswap Hook
 * Uniswap 관련 상태 관리 및 로직을 위한 React Hook
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SLIPPAGE, TOKEN_ADDRESSES, TOKEN_INFO } from '../uniswap/constants';
import { calculatePriceImpact, getQuote as fetchQuote, startQuotePolling } from '../uniswap/quote';
import { executeSwap } from '../uniswap/swap';

// Mock ethers.js types
interface Signer {
  getAddress(): Promise<string>;
  sendTransaction(transaction: any): Promise<any>;
}

interface Provider {
  call(transaction: any): Promise<string>;
}

interface SwapState {
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  isLoading: boolean;
  isSwapping: boolean;
  error: string | null;
  gasFee: string;
  priceImpact: number;
  txHash: string | null;
}

interface UseUniswapReturn {
  // 상태
  swapState: SwapState;
  
  // 액션
  setFromToken: (token: string) => void;
  setToToken: (token: string) => void;
  setAmountIn: (amount: string) => void;
  setAmountOut: (amount: string) => void;
  
  // 함수
  executeSwap: (signer: Signer) => Promise<void>;
  clearError: () => void;
  resetSwap: () => void;
  
  // 유틸리티
  swapTokens: () => void;
  isValidSwap: boolean;
  availableTokens: Array<{ symbol: string; name: string; address: string }>;
  
  // 포맷된 값들
  formattedAmountIn: string;
  formattedAmountOut: string;
}

/**
 * Uniswap 스왑 관련 훅
 * @param provider Web3 Provider
 * @returns Uniswap 관련 상태 및 함수들
 */
export function useUniswap(provider?: Provider): UseUniswapReturn {
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: 'YOY',
    toToken: 'USDT',
    amountIn: '',
    amountOut: '',
    isLoading: false,
    isSwapping: false,
    error: null,
    gasFee: '0',
    priceImpact: 0,
    txHash: null,
  });

  // 사용 가능한 토큰 목록
  const availableTokens = Object.entries(TOKEN_ADDRESSES).map(([symbol, address]) => ({
    symbol,
    name: TOKEN_INFO[address]?.name || symbol,
    address,
  }));

  // From 토큰 설정
  const setFromToken = useCallback((token: string) => {
    setSwapState(prev => ({
      ...prev,
      fromToken: token,
      amountOut: '', // 출력 수량 초기화
      error: null,
    }));
  }, []);

  // To 토큰 설정
  const setToToken = useCallback((token: string) => {
    setSwapState(prev => ({
      ...prev,
      toToken: token,
      amountOut: '', // 출력 수량 초기화
      error: null,
    }));
  }, []);

  // 천단위 구분자 추가 (소수점 제외)
  const formatNumberWithCommas = (value: string) => {
    // 숫자가 아닌 문자 제거 (소수점 제외)
    const cleanValue = value.replace(/[^\d.]/g, '');
    
    // 소수점이 있는 경우 분리
    const parts = cleanValue.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    
    // 정수 부분에 천단위 구분자 추가
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // 소수점 부분이 있으면 추가
    return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  };

  // 입력 수량 설정
  const setAmountIn = useCallback((amount: string) => {
    // 천단위 구분자와 불필요한 문자 제거하여 실제 숫자 값만 저장
    const cleanAmount = amount.replace(/[^\d.]/g, '');
    
    setSwapState(prev => ({
      ...prev,
      amountIn: cleanAmount,
      amountOut: '', // 출력 수량 초기화
      error: null,
    }));
  }, []);

  // 출력 수량 설정
  const setAmountOut = useCallback((amount: string) => {
    // 천단위 구분자와 불필요한 문자 제거하여 실제 숫자 값만 저장
    const cleanAmount = amount.replace(/[^\d.]/g, '');
    
    setSwapState(prev => ({
      ...prev,
      amountOut: cleanAmount,
      error: null,
    }));
  }, []);


  // 스왑 실행
  const executeSwapAction = useCallback(async (signer: Signer) => {
    const { fromToken, toToken, amountIn } = swapState;

    if (!amountIn || parseFloat(amountIn) <= 0) {
      setSwapState(prev => ({ ...prev, error: '올바른 수량을 입력해주세요.' }));
      return;
    }

    setSwapState(prev => ({ ...prev, isSwapping: true, error: null }));

    try {
      const txHash = await executeSwap(fromToken, toToken, amountIn, signer, DEFAULT_SLIPPAGE);
      
      setSwapState(prev => ({
        ...prev,
        isSwapping: false,
        txHash,
        amountIn: '',
        amountOut: '',
      }));
    } catch (error) {
      setSwapState(prev => ({
        ...prev,
        isSwapping: false,
        error: error instanceof Error ? error.message : '스왑 실행 실패',
      }));
    }
  }, [swapState.fromToken, swapState.toToken, swapState.amountIn]);

  // 토큰 교체
  const swapTokens = useCallback(() => {
    setSwapState(prev => ({
      ...prev,
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      amountIn: prev.amountOut,
      amountOut: prev.amountIn,
      error: null,
    }));
  }, []);

  // 에러 클리어
  const clearError = useCallback(() => {
    setSwapState(prev => ({ ...prev, error: null }));
  }, []);

  // 스왑 초기화
  const resetSwap = useCallback(() => {
    setSwapState({
      fromToken: 'YOY',
      toToken: 'USDT',
      amountIn: '',
      amountOut: '',
      isLoading: false,
      isSwapping: false,
      error: null,
      gasFee: '0',
      priceImpact: 0,
      txHash: null,
    });
  }, []);

  // 입력 수량 변경 시 자동 환율 조회
  useEffect(() => {
    if (swapState.amountIn && provider) {
      const timeoutId = setTimeout(async () => {
        try {
          const quote = await fetchQuote(swapState.fromToken, swapState.toToken, swapState.amountIn, provider);
          
          setSwapState(prev => ({
            ...prev,
            amountOut: quote,
            isLoading: false,
            priceImpact: calculatePriceImpact(swapState.amountIn, quote, swapState.fromToken, swapState.toToken),
          }));
        } catch (error) {
          console.error('환율 조회 오류:', error);
          setSwapState(prev => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : '환율 조회 실패',
          }));
        }
      }, 500); // 500ms 디바운스

      return () => clearTimeout(timeoutId);
    }
  }, [swapState.amountIn, swapState.fromToken, swapState.toToken, provider]);

  // 가스비 추정
  useEffect(() => {
    if (swapState.amountIn && swapState.fromToken && swapState.toToken) {
      // 실제로는 signer가 필요하지만 여기서는 시뮬레이션
      setSwapState(prev => ({ ...prev, gasFee: '0.005' }));
    }
  }, [swapState.amountIn, swapState.fromToken, swapState.toToken]);

  // 스왑 유효성 검사
  const isValidSwap = Boolean(
    swapState.amountIn &&
    parseFloat(swapState.amountIn) > 0 &&
    swapState.amountOut &&
    parseFloat(swapState.amountOut) > 0 &&
    !swapState.isLoading &&
    !swapState.isSwapping &&
    !swapState.error
  );

  // 포맷된 값들 계산
  const formattedAmountIn = swapState.amountIn ? formatNumberWithCommas(swapState.amountIn) : '';
  const formattedAmountOut = swapState.amountOut ? formatNumberWithCommas(swapState.amountOut) : '';

  return {
    // 상태
    swapState,
    
    // 액션
    setFromToken,
    setToToken,
    setAmountIn,
    setAmountOut,
    
    // 함수
    executeSwap: executeSwapAction,
    clearError,
    resetSwap,
    
    // 유틸리티
    swapTokens,
    isValidSwap,
    availableTokens,
    
    // 포맷된 값들
    formattedAmountIn,
    formattedAmountOut,
  };
}

/**
 * 실시간 환율 폴링 훅
 * @param fromToken 입력 토큰
 * @param toToken 출력 토큰
 * @param amountIn 입력 수량
 * @param provider Provider
 * @param interval 폴링 간격
 * @returns 실시간 환율
 */
export function useQuotePolling(
  fromToken: string,
  toToken: string,
  amountIn: string,
  provider?: Provider,
  interval: number = 5000
) {
  const [quote, setQuote] = useState<string>('');
  const [isPolling, setIsPolling] = useState<boolean>(false);

  useEffect(() => {
    if (!provider || !amountIn || parseFloat(amountIn) <= 0) {
      setQuote('');
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const stopPolling = startQuotePolling(
      fromToken,
      toToken,
      amountIn,
      provider,
      interval,
      (newQuote) => {
        setQuote(newQuote);
      }
    );

    return () => {
      stopPolling();
      setIsPolling(false);
    };
  }, [fromToken, toToken, amountIn, provider, interval]);

  return { quote, isPolling };
}
