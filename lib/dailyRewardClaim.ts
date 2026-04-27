import AsyncStorage from '@react-native-async-storage/async-storage';
import { callInternalYoyLedgerV1 } from '@/lib/internalYoyLedger';
import { useMonitorStore } from '@/lib/monitorStore';
import { firebaseAuth } from '@/lib/firebase';
import { fetchInternalYoyEvents, sumRewardYoyFromInternalEvents } from '@/lib/internalYoyEvents';

export type DailyRewardClaimResult =
  | { ok: false; reason: 'auth' | 'ledger' | 'network'; message?: string }
  | { ok: true; already: true }
  | {
      ok: true;
      already: false;
      credited: number;
      newTotalRewards: number;
      newConsecutiveDays: number;
    };

/**
 * 일일 출석 YOY — Firestore 원장 + 로컬 기록. 대시보드/지갑 공통.
 */
export async function claimDailyRewardFromServer(opts: {
  isAuthenticated: boolean;
  currentUserEmail: string;
  recordReward: (data: { symbol: string; amount: number; description: string; type: string }) => void;
}): Promise<DailyRewardClaimResult> {
  const email = String(opts.currentUserEmail || 'user@example.com').trim() || 'user@example.com';
  if (!opts.isAuthenticated) {
    return { ok: false, reason: 'auth' };
  }

  const today = new Date().toDateString();
  const rewardKey = `daily_reward_${email}_${today}`;
  try {
    const claimed = await AsyncStorage.getItem(rewardKey);
    if (claimed) return { ok: true, already: true };
  } catch {
    /* continue */
  }

  let ledger: { ok?: boolean; already?: boolean; dailyCredited?: number } = {};
  try {
    ledger = await callInternalYoyLedgerV1({ action: 'daily_checkin' });
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    const code = String(e?.code || '');
    if (msg.includes('treasury_insufficient')) {
      return { ok: false, reason: 'ledger', message: 'treasury_insufficient' };
    }
    // firebase/functions 에러코드도 노출
    if (code) return { ok: false, reason: 'network', message: `${code}:${msg}` };
    return { ok: false, reason: 'network', message: msg };
  }

  if (!ledger?.ok) {
    return { ok: false, reason: 'ledger' };
  }
  if (ledger.already) {
    try {
      await AsyncStorage.setItem(rewardKey, 'claimed');
    } catch {}
    return { ok: true, already: true };
  }

  const credited = Math.max(0, Number(ledger.dailyCredited ?? 1));

  opts.recordReward({
    symbol: 'YOY',
    amount: credited,
    description: '일일 출석 보상',
    type: 'daily_reward',
  });

  try {
    await useMonitorStore.getState().syncMe('[daily_reward][ledger]', { force: true });
  } catch {}

  try {
    const storageKey = `user_balances_${email}`;
    const currentBalances = await AsyncStorage.getItem(storageKey);
    const userBalances = currentBalances ? JSON.parse(currentBalances) : {};
    userBalances['YOY'] = (userBalances['YOY'] || 0) + credited;
    await AsyncStorage.setItem(storageKey, JSON.stringify(userBalances));
  } catch {}

  let newTotalRewards = credited;
  let newConsecutiveDays = 1;
  try {
    const totalRewardsKey = `total_rewards_${email}`;
    const consecutiveDaysKey = `consecutive_days_${email}`;
    const savedTotal = await AsyncStorage.getItem(totalRewardsKey);
    const savedConsec = await AsyncStorage.getItem(consecutiveDaysKey);
    const prevTotal = savedTotal ? parseInt(savedTotal, 10) || 0 : 0;
    const prevConsec = savedConsec ? parseInt(savedConsec, 10) || 0 : 0;
    newTotalRewards = prevTotal + credited;
    newConsecutiveDays = prevConsec + 1;
    await AsyncStorage.setItem(rewardKey, 'claimed');
    await AsyncStorage.setItem(totalRewardsKey, String(newTotalRewards));
    await AsyncStorage.setItem(consecutiveDaysKey, String(newConsecutiveDays));
  } catch {}

  // 영구 기록(서버 internalYoyEvents) 기준으로 누적 보상을 보정
  try {
    const uid = String((firebaseAuth as any)?.currentUser?.uid || '').trim();
    if (uid) {
      const evs = await fetchInternalYoyEvents(uid, 500);
      const serverTotal = sumRewardYoyFromInternalEvents(evs);
      if (serverTotal > newTotalRewards) {
        newTotalRewards = serverTotal;
        try {
          const totalRewardsKey = `total_rewards_${email}`;
          await AsyncStorage.setItem(totalRewardsKey, String(newTotalRewards));
        } catch {}
      }
    }
  } catch {}

  return { ok: true, already: false, credited, newTotalRewards, newConsecutiveDays };
}
