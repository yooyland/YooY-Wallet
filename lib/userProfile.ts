import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestore } from '@/lib/firebase';

export type UserProfileLite = {
  uid?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUri?: string | null;
};

const photoKeyFor = (uid?: string | null) => (uid ? `u:${uid}:profile.photoUri` : 'profile.photoUri');
const infoKeyFor = (uid?: string | null) => (uid ? `u:${uid}:profile.info` : 'profile.info');

function deriveUsernameFromEmail(email?: string | null): string {
  try {
    const em = String(email || '');
    const local = em.split('@')[0] || '';
    return local || 'User';
  } catch {
    return 'User';
  }
}

function safeJsonParse<T = any>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 프로필(표시명/아바타) 로딩: Firestore users/{uid} 우선 → AsyncStorage 캐시 폴백.
 * 화면에서 바로 쓰기 쉬운 최소 데이터만 반환합니다.
 */
export async function loadUserProfileLite(opts: {
  uid?: string | null;
  displayName?: string | null;
  email?: string | null;
}): Promise<UserProfileLite> {
  const uid = opts.uid || undefined;
  const fallbackName = (opts.displayName && String(opts.displayName).trim()) || deriveUsernameFromEmail(opts.email);

  // 1) Firestore 우선
  try {
    if (uid) {
      const { getDoc, doc } = await import('firebase/firestore');
      const snap = await getDoc(doc(firestore, 'users', uid));
      if (snap.exists()) {
        const d: any = snap.data() || {};
        const photoUri = String(d?.photoURL || d?.avatarUrl || d?.avatar || '').trim() || null;
        const username = String(d?.username || d?.displayName || '').trim() || fallbackName;
        const firstName = String(d?.firstName || '').trim() || undefined;
        const lastName = String(d?.lastName || '').trim() || undefined;
        return { uid, username, firstName, lastName, photoUri };
      }
    }
  } catch {}

  // 2) 로컬 캐시 폴백
  try {
    const infoRaw = await AsyncStorage.getItem(infoKeyFor(uid));
    const info = safeJsonParse<{ username?: string; firstName?: string; lastName?: string }>(infoRaw);
    const username = String(info?.username || '').trim() || fallbackName;
    const photoUri = (await AsyncStorage.getItem(photoKeyFor(uid))) || null;
    return {
      uid,
      username,
      firstName: info?.firstName ? String(info.firstName).trim() : undefined,
      lastName: info?.lastName ? String(info.lastName).trim() : undefined,
      photoUri,
    };
  } catch {}

  return { uid, username: fallbackName, photoUri: null };
}

