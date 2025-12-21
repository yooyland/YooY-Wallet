import { Balance, mockBalances } from '@/data/balances';

export function getMockBalancesForUser(email: string | null | undefined): Balance[] {
  // 관리자 3개 계정만 자산을 가지고, 나머지 사용자는 0
  const adminEmails = ['admin@yooyland.com', 'jch4389@gmail.com', 'landyooy@gmail.com'];
  
  if (email && adminEmails.includes(email)) {
    return mockBalances;
  }
  
  // 일반 사용자는 모든 자산이 0
  return mockBalances.map(balance => ({
    ...balance,
    amount: 0
  }));
}







