import type { Firestore } from 'firebase/firestore';
import { getOrCreateDmRoomV2 } from './roomService';

export async function getOrCreateDmRoomIdForUsersV2(firestore: Firestore, me: string, other: string): Promise<string> {
  const room = await getOrCreateDmRoomV2(firestore, me, other);
  return String(room.id);
}

