import type { Firestore } from 'firebase/firestore';
import { getDoc, setDoc } from 'firebase/firestore';
import { getUserRoomPreferenceDocRef, getLegacyUserRoomPreferenceFlatDocRef } from '../firebase/roomRefs';

export type UserRoomPreferencesV2 = {
  notificationsEnabled?: boolean;
  notificationMode?: 'sound' | 'vibrate' | 'mute';
  muteUntil?: number | null;
  theme?: 'default' | 'darkGold' | 'custom';
  fontSize?: number;
  wallpaper?: string;
  bubbleStyle?: string;
  updatedAt?: number;
};

export async function loadUserRoomPreferencesV2(input: { firestore: Firestore; uid: string; roomId: string }): Promise<UserRoomPreferencesV2 | null> {
  let snap = await getDoc(getUserRoomPreferenceDocRef(input.firestore, input.uid, input.roomId));
  if (!snap.exists()) {
    try {
      snap = await getDoc(getLegacyUserRoomPreferenceFlatDocRef(input.firestore, input.uid, input.roomId));
    } catch {
      return null;
    }
  }
  if (!snap.exists()) return null;
  return snap.data() as UserRoomPreferencesV2;
}

export async function saveUserRoomPreferencesV2(input: {
  firestore: Firestore;
  uid: string;
  roomId: string;
  prefs: UserRoomPreferencesV2;
}): Promise<void> {
  const now = Date.now();
  await setDoc(
    getUserRoomPreferenceDocRef(input.firestore, input.uid, input.roomId),
    { ...input.prefs, updatedAt: now },
    { merge: true }
  );
}
