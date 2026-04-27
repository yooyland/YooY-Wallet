import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@web/firebase/config';
import { paths } from '@web/lib/paths';

export type FriendDoc = {
  id: string;
  userId: string;
  displayName?: string;
  chatName?: string;
  name?: string;
  avatarUrl?: string;
  photoURL?: string;
  createdAt?: number;
};

export function subscribeFriends(uid: string, cb: (rows: FriendDoc[]) => void) {
  const ref = collection(db, paths.userFriends(uid));
  return onSnapshot(ref, (snap) => {
    const rows = snap.docs.map((d) => {
      const v = d.data() as Record<string, unknown>;
      const friendId = String(v.userId || v.uid || d.id || '').trim();
      return {
        id: d.id,
        userId: friendId,
        displayName: v.displayName != null ? String(v.displayName) : undefined,
        chatName: v.chatName != null ? String(v.chatName) : undefined,
        name: v.name != null ? String(v.name) : undefined,
        avatarUrl: v.avatarUrl != null ? String(v.avatarUrl) : undefined,
        photoURL: v.photoURL != null ? String(v.photoURL) : undefined,
        createdAt: typeof v.createdAt === 'number' ? v.createdAt : undefined,
      };
    });
    rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    cb(rows);
  });
}
