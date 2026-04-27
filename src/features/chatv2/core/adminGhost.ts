import { firebaseAuth } from '@/lib/firebase';
import { isAdmin } from '@/constants/admins';

export function currentUserEmailNorm(): string {
  return String(firebaseAuth.currentUser?.email || '').trim().toLowerCase();
}

/** 앱 관리자(이메일 화이트리스트) — Firestore `isAdmin()` 과 동일 목록을 constants/admins 에서 사용 */
export function currentUserIsAppAdmin(): boolean {
  const e = currentUserEmailNorm();
  return !!e && isAdmin(e);
}
