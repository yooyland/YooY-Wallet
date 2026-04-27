/**
 * YooY Land Swap Module - Uniswap Hook
 * Uniswap 관련 상태 관리 및 로직을 위한 React Hook
 */

import { useCallback, useEffect, useState } from 'react';
import { SWAP_ENABLED } from '@/lib/featureFlags';
import { DEFAULT_SLIPPAGE } from '../uniswap/constants';
import { calculatePriceImpact, getQuote as fetchQuote, startQuotePolling } from '../uniswap/quote';
import { getCoinPriceByCurrency } from '@/lib/priceManager';
import { executeSwap } from '../uniswap/swap';
import { SUPPORTED_SWAP_TOKENS, isAllowedPair, SwapSymbol } from '@/lib/swapConfig';

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
  executeSwap: (signer: Signer) => Promise<string>;
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
  // 어떤 입력을 마지막으로 수정했는지 추적하여 역방향 계산을 지원
  const [lastEdited, setLastEdited] = useState<'in'|'out'|null>(null);

  // 사용 가능한 토큰 목록
  const availableTokens = SUPPORTED_SWAP_TOKENS.map(t => ({
    symbol: t.symbol,
    name: t.name,
    address: t.symbol, // UI only; address는 실행 시 매핑
  }));

  // From 토큰 설정
  const setFromToken = useCallback((token: string) => {
    setSwapState(prev => {
      const nextFrom = token as SwapSymbol;
      const nextTo = prev.toToken as SwapSymbol;
      if (nextFrom === nextTo) {
        return { ...prev, error: '같은 토큰끼리는 스왑할 수 없습니다.' };
      }
      if (!isAllowedPair(nextFrom, nextTo)) {
        return { ...prev, fromToken: nextFrom, amountOut: '', error: '이 앱에서는 YOY 중심 스왑만 지원됩니다' };
      }
      return { ...prev, fromToken: nextFrom, amountOut: '', error: null };
    });
  }, []);

  // To 토큰 설정
  const setToToken = useCallback((token: string) => {
    setSwapState(prev => {
      const nextTo = token as SwapSymbol;
      const nextFrom = prev.fromToken as SwapSymbol;
      if (nextFrom === nextTo) {
        return { ...prev, error: '같은 토큰끼리는 스왑할 수 없습니다.' };
      }
      if (!isAllowedPair(nextFrom, nextTo)) {
        return { ...prev, toToken: nextTo, amountOut: '', error: '이 앱에서는 YOY 중심 스왑만 지원됩니다' };
      }
      return { ...prev, toToken: nextTo, amountOut: '', error: null };
    });
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
    setLastEdited('in');
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
    setLastEdited('out');
  }, []);


  // 스왑 실행
  const executeSwapAction = useCallback(async (signer: Signer): Promise<string> => {
    if (!SWAP_ENABLED) {
      throw new Error('Swap is not available on this platform.');
    }
    const { fromToken, toToken, amountIn } = swapState;

    if (!amountIn || parseFloat(amountIn) <= 0) {
      setSwapState(prev => ({ ...prev, error: '올바른 수량을 입력해주세요.' }));
      throw new Error('올바른 수량을 입력해주세요.');
    }

    // 허용 페어 검증
    if (!isAllowedPair(fromToken as SwapSymbol, toToken as SwapSymbol)) {
      setSwapState(prev => ({ ...prev, error: '이 앱에서는 YOY 중심 스왑만 지원됩니다' }));
      throw new Error('이 앱에서는 YOY 중심 스왑만 지원됩니다');
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
      return txHash;
    } catch (error) {
      setSwapState(prev => ({
        ...prev,
        isSwapping: false,
        error: error instanceof Error ? error.message : '스왑 실행 실패',
      }));
      throw error;
    }
  }, [swapState.fromToken, swapState.toToken, swapState.amountIn, SWAP_ENABLED]);

  // 토큰 교체
  const swapTokens = useCallback(() => {
    setSwapState(prev => {
      const nextFrom = prev.toToken as SwapSymbol;
      const nextTo = prev.fromToken as SwapSymbol;
      if (!isAllowedPair(nextFrom, nextTo)) {
        return { ...prev, error: '이 앱에서는 YOY 중심 스왑만 지원됩니다' };
      }
      return {
        ...prev,
        fromToken: nextFrom,
        toToken: nextTo,
        amountIn: prev.amountOut,
        amountOut: prev.amountIn,
        error: null,
      };
    });
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

  // 입력 변경 시 자동 환율 조회 (양방향 지원)
  useEffect(() => {
    if (!SWAP_ENABLED) return;
    const doQuote = async () => {
      try {
        // provider가 없으면 가격지수 기반 간단 계산으로 폴백
        const fallbackRate = () => {
          try {
            const pFrom = getCoinPriceByCurrency(swapState.fromToken, 'USD' as any) || 0;
            const pTo = getCoinPriceByCurrency(swapState.toToken, 'USD' as any) || 0;
            if (!pFrom || !pTo) return 0;
            return pFrom / pTo;
          } catch { return 0; }
        };
        // amountIn을 기준으로 amountOut 계산
        if (lastEdited === 'in' && swapState.amountIn) {
          let quote = '';
          if (provider) {
            quote = await fetchQuote(swapState.fromToken, swapState.toToken, swapState.amountIn, provider);
          } else {
            const rate = fallbackRate();
            quote = rate ? (parseFloat(swapState.amountIn) * rate).toString() : '';
          }
          setSwapState(prev => ({
            ...prev,
            amountOut: quote,
            isLoading: false,
            priceImpact: calculatePriceImpact(swapState.amountIn, quote, swapState.fromToken, swapState.toToken),
          }));
          return;
        }
        // amountOut을 기준으로 amountIn 계산(역방향): 토큰을 뒤집어 입력값을 인풋으로 사용
        if (lastEdited === 'out' && swapState.amountOut) {
          let reverse = '';
          if (provider) {
            reverse = await fetchQuote(swapState.toToken, swapState.fromToken, swapState.amountOut, provider);
          } else {
            const rate = fallbackRate();
            reverse = rate ? (parseFloat(swapState.amountOut) / rate).toString() : '';
          }
          setSwapState(prev => ({
            ...prev,
            amountIn: reverse,
            isLoading: false,
            // 역방향일 때도 priceImpact는 정방향 기준으로 산출
            priceImpact: calculatePriceImpact(reverse, swapState.amountOut, swapState.fromToken, swapState.toToken),
          }));
        }
      } catch (error) {
        console.error('환율 조회 오류:', error);
        setSwapState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : '환율 조회 실패',
        }));
      }
    };
    // 디바운스
    const timeoutId = setTimeout(() => { void doQuote(); }, 400);
    return () => clearTimeout(timeoutId);
  }, [lastEdited, swapState.amountIn, swapState.amountOut, swapState.fromToken, swapState.toToken, provider, SWAP_ENABLED]);

  // 가스비 추정
  useEffect(() => {
    if (!SWAP_ENABLED) return;
    if (swapState.amountIn && swapState.fromToken && swapState.toToken) {
      // 실제 추정이 어려운 환경에서는 보수적으로 상수값을 사용하고,
      // 추후 provider 기반으로 동적 추정 로직을 끼울 수 있도록 훅을 둡니다.
      // 0.005 ETH 상당 가스로 가정
      setSwapState(prev => ({ ...prev, gasFee: '0.005' }));
    }
  }, [swapState.amountIn, swapState.fromToken, swapState.toToken, SWAP_ENABLED]);

  // 스왑 유효성 검사
  const isValidSwap = Boolean(
    swapState.amountIn &&
    parseFloat(swapState.amountIn) > 0 &&
    swapState.amountOut &&
    parseFloat(swapState.amountOut) > 0 &&
    isAllowedPair(swapState.fromToken as SwapSymbol, swapState.toToken as SwapSymbol) &&
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
    if (!SWAP_ENABLED || !provider || !amountIn || parseFloat(amountIn) <= 0) {
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
  }, [fromToken, toToken, amountIn, provider, interval, SWAP_ENABLED]);

  return { quote, isPolling };
}
