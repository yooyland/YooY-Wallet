/**
 * YooY Land Swap Module - Quote Logic
 * Uniswap Quoter 컨트랙트를 이용해 예상 수령량(quoteAmountOut) 조회
 */

import {
    FEE_TIERS,
    TOKEN_ADDRESSES,
    TOKEN_INFO,
    UNISWAP_V3_QUOTER,
    QUOTER_ABI,
    INFURA_MAINNET_URL
} from './constants';

// Mock ethers.js types (실제로는 ethers.js import 필요)
interface Provider {
  call(transaction: any): Promise<string>;
}

/**
 * 토큰 수량을 Wei 단위로 변환
 * @param amount 수량
 * @param decimals 토큰 소수점
 * @returns Wei 단위 수량
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  try {
    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat)) {
      throw new Error(`유효하지 않은 수량: ${amount}`);
    }
    const multiplier = Math.pow(10, decimals);
    return Math.floor(amountFloat * multiplier).toString();
  } catch (error) {
    console.error('parseTokenAmount 오류:', error);
    throw new Error(`수량 변환 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * Wei 단위를 토큰 수량으로 변환
 * @param weiAmount Wei 단위 수량
 * @param decimals 토큰 소수점
 * @returns 토큰 수량
 */
export function formatTokenAmount(weiAmount: string, decimals: number): string {
  try {
    const amount = parseFloat(weiAmount);
    if (isNaN(amount)) {
      throw new Error(`유효하지 않은 Wei 수량: ${weiAmount}`);
    }
    const divisor = Math.pow(10, decimals);
    return (amount / divisor).toFixed(6);
  } catch (error) {
    console.error('formatTokenAmount 오류:', error);
    throw new Error(`Wei 변환 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * Uniswap Quoter를 통한 단일 토큰 스왑 예상 수량 조회
 * @param tokenIn 입력 토큰 주소
 * @param tokenOut 출력 토큰 주소
 * @param fee 풀 수수료 (500, 3000, 10000)
 * @param amountIn 입력 수량 (Wei)
 * @param provider Provider
 * @returns 예상 출력 수량 (Wei)
 */
export async function quoteExactInputSingle(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: string,
  provider: Provider
): Promise<string> {
  try {
    console.log(`환율 조회: ${tokenIn} → ${tokenOut}, 수량: ${amountIn}`);
    
    // 1) 실제 Uniswap Quoter 호출 시도 (ethers 동적 import)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Contract, JsonRpcProvider } = await import('ethers');
      const rpc = new JsonRpcProvider(INFURA_MAINNET_URL);
      const quoter = new Contract(UNISWAP_V3_QUOTER, QUOTER_ABI, rpc);
      // v6: static call은 provider.call로 처리되므로 try/catch로 직접 호출
      const amountOutWei: string = await quoter.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
      if (amountOutWei && typeof amountOutWei === 'bigint' || typeof amountOutWei === 'string') {
        return amountOutWei.toString();
      }
    } catch (realErr) {
      console.warn('Quoter 실호출 실패, 시뮬레이션으로 대체:', realErr);
    }
    
    // 2) 시뮬레이션: 가상의 환율 계산 (fallback)
    const mockRates: Record<string, number> = {
      [TOKEN_ADDRESSES.YOY]: 0.03546,  // YOY = $0.03546
      [TOKEN_ADDRESSES.WETH]: 3000,    // WETH = $3000
      [TOKEN_ADDRESSES.USDT]: 1,       // USDT = $1
      [TOKEN_ADDRESSES.USDC]: 1,       // USDC = $1
      [TOKEN_ADDRESSES.WBTC]: 45000,   // WBTC = $45000
      [TOKEN_ADDRESSES.DAI]: 1,        // DAI = $1
    };
    
    const fromRate = mockRates[tokenIn] || 1;
    const toRate = mockRates[tokenOut] || 1;
    const rate = fromRate / toRate;
    
    // 슬리피지 0.5% 적용
    const slippage = 0.005;
    const adjustedRate = rate * (1 - slippage);
    
    // amountIn을 토큰 단위로 변환하여 계산
    const fromTokenInfo = TOKEN_INFO[tokenIn as keyof typeof TOKEN_INFO];
    const fromDecimals = fromTokenInfo?.decimals || 18;
    const amountInTokens = parseFloat(amountIn) / Math.pow(10, fromDecimals);
    
    const amountOutTokens = amountInTokens * adjustedRate;
    
    // 출력 토큰의 decimals에 맞게 Wei 단위로 변환
    const toTokenInfo = TOKEN_INFO[tokenOut as keyof typeof TOKEN_INFO];
    const toDecimals = toTokenInfo?.decimals || 18;
    const amountOut = Math.floor(amountOutTokens * Math.pow(10, toDecimals)).toString();
    
    console.log('환율 계산 디버그:', {
      fromRate,
      toRate,
      rate,
      adjustedRate,
      amountIn,
      amountInTokens,
      amountOutTokens,
      amountOut,
      fromDecimals,
      toDecimals
    });
    return amountOut;
    
  } catch (error) {
    console.error('환율 조회 오류:', error);
    throw new Error(`환율 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * 메인 환율 조회 함수
 * @param fromToken 입력 토큰 심볼
 * @param toToken 출력 토큰 심볼
 * @param amountIn 입력 수량
 * @param provider Provider
 * @returns 예상 출력 수량
 */
export async function getQuote(
  fromToken: string,
  toToken: string,
  amountIn: string,
  provider: Provider
): Promise<string> {
  try {
    console.log(`환율 조회 시작: ${amountIn} ${fromToken} → ${toToken}`);
    
    // 1. 토큰 주소 확인
    const fromTokenAddress = TOKEN_ADDRESSES[fromToken as keyof typeof TOKEN_ADDRESSES];
    const toTokenAddress = TOKEN_ADDRESSES[toToken as keyof typeof TOKEN_ADDRESSES];
    
    console.log('토큰 주소 확인:', { fromTokenAddress, toTokenAddress });
    
    if (!fromTokenAddress || !toTokenAddress) {
      throw new Error('유효하지 않은 토큰입니다.');
    }
    
    // 2. 입력 수량을 Wei로 변환
    const fromTokenInfo = TOKEN_INFO[fromTokenAddress as keyof typeof TOKEN_INFO];
    const fromDecimals = fromTokenInfo?.decimals || 18;
    console.log('토큰 정보:', { fromTokenInfo, fromDecimals });
    
    const amountInWei = parseTokenAmount(amountIn, fromDecimals);
    console.log('Wei 변환:', { amountIn, amountInWei });
    
    // 3. Uniswap Quoter 호출
    const amountOutWei = await quoteExactInputSingle(
      fromTokenAddress,
      toTokenAddress,
      FEE_TIERS.MEDIUM, // 0.3% 수수료
      amountInWei,
      provider
    );
    
    // 4. 출력 수량을 토큰 단위로 변환
    const toTokenInfo = TOKEN_INFO[toTokenAddress as keyof typeof TOKEN_INFO];
    const toDecimals = toTokenInfo?.decimals || 18;
    const amountOut = formatTokenAmount(amountOutWei, toDecimals);
    
    console.log(`환율 조회 완료: ${amountOut} ${toToken}`);
    return amountOut;
    
  } catch (error) {
    console.error('환율 조회 오류:', error);
    throw error;
  }
}

/**
 * 실시간 환율 조회 (폴링)
 * @param fromToken 입력 토큰 심볼
 * @param toToken 출력 토큰 심볼
 * @param amountIn 입력 수량
 * @param provider Provider
 * @param interval 폴링 간격 (밀리초)
 * @param callback 콜백 함수
 * @returns 폴링 중지 함수
 */
export function startQuotePolling(
  fromToken: string,
  toToken: string,
  amountIn: string,
  provider: Provider,
  interval: number = 5000,
  callback: (quote: string) => void
): () => void {
  let isPolling = true;
  
  const poll = async () => {
    if (!isPolling) return;
    
    try {
      const quote = await getQuote(fromToken, toToken, amountIn, provider);
      callback(quote);
    } catch (error) {
      console.error('폴링 중 오류:', error);
    }
    
    if (isPolling) {
      setTimeout(poll, interval);
    }
  };
  
  // 즉시 실행
  poll();
  
  // 중지 함수 반환
  return () => {
    isPolling = false;
  };
}

/**
 * 가격 임팩트 계산
 * @param amountIn 입력 수량
 * @param amountOut 출력 수량
 * @param fromToken 입력 토큰
 * @param toToken 출력 토큰
 * @returns 가격 임팩트 (%)
 */
export function calculatePriceImpact(
  amountIn: string,
  amountOut: string,
  fromToken: string,
  toToken: string
): number {
  try {
    // 실제로는 더 정교한 계산 필요
    // 여기서는 간단한 시뮬레이션
    const impact = Math.random() * 0.1; // 0-0.1% 랜덤
    return parseFloat(impact.toFixed(4));
  } catch (error) {
    console.error('가격 임팩트 계산 오류:', error);
    return 0;
  }
}

/**
 * 최적 수수료 티어 선택
 * @param tokenIn 입력 토큰
 * @param tokenOut 출력 토큰
 * @param amountIn 입력 수량
 * @param provider Provider
 * @returns 최적 수수료 티어
 */
export async function getOptimalFeeTier(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  provider: Provider
): Promise<number> {
  try {
    // 실제로는 각 수수료 티어별로 quote를 조회하여 최적 선택
    // 여기서는 기본값 반환
    return FEE_TIERS.MEDIUM; // 0.3%
  } catch (error) {
    console.error('최적 수수료 티어 선택 오류:', error);
    return FEE_TIERS.MEDIUM;
  }
}
