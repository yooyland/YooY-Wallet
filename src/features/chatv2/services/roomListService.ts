import { collection, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { ChatRoomTypeV2, ChatRoomV2 } from '../core/roomSchema';
import { chatV2Paths } from '../core/firestorePaths';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getRoomDocRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import { normalizeRoomId } from '../utils/roomId';
import { parseFirestoreMs } from '../core/firestoreMs';
import { isJoinedTtlRowExplodedV2 } from '../core/ttlEngine';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';

export type JoinedRoomRowV2 = {
  roomId: string;
  type: ChatRoomTypeV2;
  title?: string;
  peerId?: string;
  peerDisplayName?: string;
  avatarUrl?: string;
  description?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount?: number;
  isFavorite?: boolean;
  muted?: boolean;
  updatedAt?: number;
  ttl?: ChatRoomV2['ttl'];
};

export function sortJoinedRoomsV2(a: JoinedRoomRowV2, b: JoinedRoomRowV2) {
  const af = !!a.isFavorite;
  const bf = !!b.isFavorite;
  if (af !== bf) return af ? -1 : 1;
  const at = Number(a.lastMessageAt || 0);
  const bt = Number(b.lastMessageAt || 0);
  return bt - at;
}

export function toRoomStubFromJoinedRowV2(row: JoinedRoomRowV2): ChatRoomV2 {
  const now = Date.now();
  return {
    id: row.roomId,
    type: row.type,
    // DM에서는 사용자 지정 제목(=joinedRooms.{uid}.title) 우선 노출
    // (peerDisplayName은 상대 표시명으로 기본값)
    title: row.type === 'dm' ? (row.title || row.peerDisplayName || row.roomId) : row.title,
    description: row.description,
    avatarUrl: row.avatarUrl,
    createdBy: '',
    createdAt: 0,
    updatedAt: Number(row.updatedAt || row.lastMessageAt || now),
    participantIds: [],
    adminIds: [],
    dmPairKey: undefined,
    ttl: row.type === 'ttl' ? (row.ttl || { enabled: true, explodeRoomAt: null, messageExpireSeconds: null }) : undefined,
  };
}

/**
 * Subscribe to users/{uid}/joinedRooms for room list.
 * Uses summary data ONLY. Does not scan rooms/messages.
 */
export function subscribeJoinedRoomsV2(input: {
  firestore: Firestore;
  uid: string;
  onRows: (rows: JoinedRoomRowV2[]) => void;
}): () => void {
  const { firestore, uid, onRows } = input;
  const ref = collection(firestore, chatV2Paths.userJoinedRooms(uid));
  return onSnapshot(
    ref,
    (snap) => {
      const rows: JoinedRoomRowV2[] = [];
      snap.forEach((d) => {
        const v = (d.data() as any) || {};
        const roomIdRaw = String(v.roomId || d.id);
        const roomIdNorm = normalizeRoomId(roomIdRaw, 'roomListService.joinedRooms');
        if (roomIdNorm === null) return;
        const roomId = roomIdNorm;
        const type = String(v.type || 'group') as ChatRoomTypeV2;
        rows.push({
          roomId,
          type,
          title: v.title ? String(v.title) : undefined,
          peerId: v.peerId ? String(v.peerId) : undefined,
          peerDisplayName: v.peerDisplayName ? String(v.peerDisplayName) : undefined,
          avatarUrl: v.avatarUrl ? String(v.avatarUrl) : undefined,
          description: v.description ? String(v.description) : undefined,
          lastMessage: v.lastMessage ? String(v.lastMessage) : undefined,
          lastMessageAt: (() => {
            const ms = parseFirestoreMs(v.lastMessageAt);
            return ms > 0 ? ms : undefined;
          })(),
          unreadCount: typeof v.unreadCount === 'number' ? v.unreadCount : typeof v.unread === 'number' ? v.unread : 0,
          isFavorite: !!v.isFavorite,
          muted: !!v.muted,
          updatedAt: (() => {
            const ms = parseFirestoreMs(v.updatedAt);
            return ms > 0 ? ms : undefined;
          })(),
          ttl: v.ttl || undefined,
        });
      });
      rows.sort(sortJoinedRoomsV2);
      const now = Date.now();
      onRows(rows.filter((row) => !isJoinedTtlRowExplodedV2(row, now)));

      // Peer displayName stability: heal missing dm peerDisplayName in background
      try {
        rows
          .filter((r) => r.type === 'dm' && (!String(r.peerDisplayName || '').trim() || !String(r.peerId || '').trim()))
          .slice(0, 3)
          .forEach((r) => {
            void refreshDmPeerDisplayNameV2({ firestore, uid, roomId: r.roomId }).catch(() => {});
          });
      } catch {}
    },
    () => {}
  );
}

export async function refreshDmPeerDisplayNameV2(input: { firestore: Firestore; uid: string; roomId: string }): Promise<void> {
  const { firestore, uid, roomId: rawRoomId } = input;
  const roomId = normalizeRoomId(rawRoomId, 'roomListService.refreshDmPeerDisplayName');
  if (roomId === null) return;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) return;
  const r = roomSnap.data() as any;
  if (String(r?.type || '') !== 'dm') return;
  const ids: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)) : [];
  const other = ids.find((x) => x && x !== uid) || '';
  if (!other) return;
  let otherName = other;
  let otherAvatar = '';
  try {
    const us = await getDoc(doc(firestore, 'users', other));
    if (us.exists()) {
      const d = us.data() as any;
      const n = resolveChatDisplayNameFromUserDoc(other, d as Record<string, unknown>).trim();
      if (n) otherName = n;
      const a = String(d?.avatar || d?.photoURL || d?.profileImageUrl || '').trim();
      if (a) otherAvatar = a;
    }
  } catch {}
  await setDoc(
    getUserJoinedRoomDocRef(firestore, uid, roomId),
    { peerId: other, peerDisplayName: otherName, avatarUrl: otherAvatar || undefined, updatedAt: Date.now() } as any,
    { merge: true }
  );
}

