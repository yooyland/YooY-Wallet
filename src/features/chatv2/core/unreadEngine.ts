import { writeBatch, increment, getDoc } from 'firebase/firestore';
import type { FieldValue, Firestore } from 'firebase/firestore';
import { getRoomDocRef, getRoomMemberDocRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';

/** merge 쓰기 시 unreadCount에 increment()를 넣을 수 있음 (숫자 타입과 FieldValue 불일치 방지) */
type RoomMemberUnreadMergeV2 = {
  unreadCount?: number | FieldValue;
  lastReadAt?: number;
  lastReadMessageId?: string;
  updatedAt?: number;
};

type JoinedRoomSummaryMergeV2 = {
  unreadCount?: number | FieldValue;
  lastMessage?: string;
  lastMessageAt?: number;
  updatedAt?: number;
};

export type JoinedRoomSummaryV2 = {
  roomId: string;
  type: 'dm' | 'group' | 'ttl';
  title?: string;
  peerDisplayName?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount?: number;
  isFavorite?: boolean;
  muted?: boolean;
  updatedAt?: number;
};

export type RoomMemberStateV2 = {
  uid: string;
  role: 'admin' | 'member';
  joinedAt: number;
  lastReadAt?: number;
  lastReadMessageId?: string;
  unreadCount?: number;
  muted?: boolean;
  updatedAt?: number;
};

/**
 * Write-based unread updates on message send.
 * - increments unread for everyone except sender
 * - updates users/{uid}/joinedRooms/{roomId} lightweight summary (unreadCount + lastMessage + lastMessageAt)
 * - updates roomMembers/{roomId}/members/{uid} unreadCount
 */
export async function applyUnreadOnSendV2(input: {
  firestore: Firestore;
  roomId: string;
  senderId: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: number;
}): Promise<void> {
  const { firestore, roomId, senderId, participantIds, lastMessage, lastMessageAt } = input;
  let ids = Array.from(new Set(participantIds)).filter((uid) => uid);
  if (ids.length === 0) {
    // Heal participantIds from canonical room doc so recipients get unread + joinedRooms updates.
    const snap = await getDoc(getRoomDocRef(firestore, roomId));
    const r = (snap.data() as any) || {};
    ids = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  }
  const others = ids.filter((uid) => uid && uid !== senderId);
  const now = Date.now();

  const batch = writeBatch(firestore);
  for (const uid of others) {
    batch.set(
      getRoomMemberDocRef(firestore, roomId, uid),
      {
        unreadCount: increment(1),
        updatedAt: now,
      } satisfies RoomMemberUnreadMergeV2,
      { merge: true }
    );
    batch.set(
      getUserJoinedRoomDocRef(firestore, uid, roomId),
      {
        unreadCount: increment(1),
        lastMessage,
        lastMessageAt,
        updatedAt: now,
      } satisfies JoinedRoomSummaryMergeV2,
      { merge: true }
    );
  }

  // Sender summary should still get lastMessage/lastMessageAt but unread stays unchanged/0
  batch.set(
    getUserJoinedRoomDocRef(firestore, senderId, roomId),
    {
      lastMessage,
      lastMessageAt,
      unreadCount: 0,
      updatedAt: now,
    } satisfies Partial<JoinedRoomSummaryV2>,
    { merge: true }
  );
  batch.set(
    getRoomMemberDocRef(firestore, roomId, senderId),
    { unreadCount: 0, updatedAt: now },
    { merge: true }
  );

  await batch.commit();
}

/**
 * Entering a room clears unread for that user immediately (write-based).
 */
export async function clearUnreadOnEnterV2(input: {
  firestore: Firestore;
  roomId: string;
  uid: string;
  lastReadMessageId?: string;
}): Promise<void> {
  const { firestore, roomId, uid, lastReadMessageId } = input;
  const now = Date.now();
  const batch = writeBatch(firestore);
  batch.set(
    getRoomMemberDocRef(firestore, roomId, uid),
    {
      unreadCount: 0,
      lastReadAt: now,
      ...(lastReadMessageId ? { lastReadMessageId } : {}),
      updatedAt: now,
    } satisfies Partial<RoomMemberStateV2>,
    { merge: true }
  );
  batch.set(
    getUserJoinedRoomDocRef(firestore, uid, roomId),
    { unreadCount: 0, updatedAt: now } satisfies Partial<JoinedRoomSummaryV2>,
    { merge: true }
  );
  await batch.commit();
}

/**
 * Firestore increment helper.
 * We avoid importing legacy chat code. We also avoid heavy reads.
 *
 * NOTE: messageService will initialize this at runtime:
 *   globalThis.FirebaseFieldValueIncrementV2 = (n) => increment(n)
 */
// NOTE: v2 unread uses Firestore increment() directly (no global injection).

