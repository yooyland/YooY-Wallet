import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@web/firebase/config';

export type UserPublicDoc = {
  displayName?: string;
  chatName?: string;
  username?: string;
  photoURL?: string;
  avatarUrl?: string;
  useHashInChat?: boolean;
};

export function subscribeUserDoc(uid: string, cb: (data: UserPublicDoc | null) => void) {
  const r = doc(db, 'users', uid);
  return onSnapshot(r, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb(snap.data() as UserPublicDoc);
  });
}

export async function mergeUserProfile(uid: string, patch: Record<string, unknown>) {
  await setDoc(
    doc(db, 'users', uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
