import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@web/firebase/config';
import { resolveChatDisplayNameFromUserDoc } from '@web/lib/chatDisplayName';

const getDmPairKey = (uid1: string, uid2: string) => [uid1, uid2].slice().sort().join('_');

const roomRef = (roomId: string) => doc(db, 'rooms', roomId);
const roomMemberRef = (roomId: string, uid: string) => doc(db, 'roomMembers', roomId, 'members', uid);
const userJoinedRef = (uid: string, roomId: string) => doc(db, 'users', uid, 'joinedRooms', roomId);

function dmTypeDefaults() {
  return {
    permissions: {
      memberCanMessage: true,
      memberCanUploadFile: true,
      memberCanUploadImage: true,
      memberCanShareLink: true,
      memberCanInvite: true,
      whoCanEditRoomInfo: 'admin' as const,
    },
    settings: {},
    security: {},
    searchVisible: true,
  };
}

async function createDmRoomWeb(me: string, other: string): Promise<string> {
  const now = Date.now();
  const roomId = crypto.randomUUID();
  const participantIds = [me, other].filter(Boolean);
  const pairKey = getDmPairKey(me, other);
  const td = dmTypeDefaults();

  const roomDoc = {
    id: roomId,
    type: 'dm',
    roomStatus: 'active',
    searchVisible: td.searchVisible,
    isSecret: false,
    settings: td.settings,
    permissions: td.permissions,
    security: td.security,
    inviteEnabled: false,
    createdBy: me,
    createdAt: now,
    updatedAt: now,
    participantIds,
    memberIds: participantIds,
    members: participantIds,
    adminIds: participantIds,
    ownerIds: participantIds,
    dmPairKey: pairKey,
  };

  const resolveName = async (uid: string) => {
    try {
      const s = await getDoc(doc(db, 'users', uid));
      if (!s.exists()) return uid;
      return resolveChatDisplayNameFromUserDoc(uid, s.data() as Record<string, unknown>);
    } catch {
      return uid;
    }
  };
  const resolvePhoto = async (uid: string) => {
    try {
      const s = await getDoc(doc(db, 'users', uid));
      if (!s.exists()) return '';
      const d = s.data() as Record<string, unknown>;
      return String(d?.photoURL || d?.avatar || d?.profileImageUrl || '').trim();
    } catch {
      return '';
    }
  };

  const [meName, otherName, mePhoto, otherPhoto] = await Promise.all([
    resolveName(me),
    resolveName(other),
    resolvePhoto(me),
    resolvePhoto(other),
  ]);

  const br = writeBatch(db);
  br.set(
    roomRef(roomId),
    { ...roomDoc, serverUpdatedAt: serverTimestamp() } as Record<string, unknown>,
    { merge: true }
  );
  await br.commit();

  const batch = writeBatch(db);
  batch.set(
    roomMemberRef(roomId, me),
    {
      uid: me,
      displayName: meName,
      photoURL: mePhoto,
      role: 'admin',
      isDmParticipant: true,
      joinedAt: now,
      lastReadAt: now,
      unreadCount: 0,
      updatedAt: now,
      muted: false,
      status: 'active',
    } as any,
    { merge: true }
  );
  batch.set(
    roomMemberRef(roomId, other),
    {
      uid: other,
      displayName: otherName,
      photoURL: otherPhoto,
      role: 'admin',
      isDmParticipant: true,
      joinedAt: now,
      lastReadAt: now,
      unreadCount: 0,
      updatedAt: now,
      muted: false,
      status: 'active',
    } as any,
    { merge: true }
  );
  batch.set(
    userJoinedRef(me, roomId),
    {
      roomId,
      type: 'dm',
      peerId: other,
      peerDisplayName: otherName,
      lastMessage: '',
      lastMessageAt: now,
      unreadCount: 0,
      updatedAt: now,
    } as any,
    { merge: true }
  );
  batch.set(
    userJoinedRef(other, roomId),
    {
      roomId,
      type: 'dm',
      peerId: me,
      peerDisplayName: meName,
      lastMessage: '',
      lastMessageAt: now,
      unreadCount: 0,
      updatedAt: now,
    } as any,
    { merge: true }
  );
  await batch.commit();
  return roomId;
}

/** 앱 `getOrCreateDmRoomV2` 와 동등한 흐름(웹 전용 구현) */
export async function getOrCreateDmRoomIdWeb(me: string, other: string): Promise<string> {
  const pairKey = getDmPairKey(me, other);
  const q = query(collection(db, 'rooms'), where('type', '==', 'dm'), where('dmPairKey', '==', pairKey), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    const roomId = d.id;
    const v = d.data() as Record<string, unknown>;
    try {
      const resolveName = async (uid: string) => {
        try {
          const s = await getDoc(doc(db, 'users', uid));
          if (!s.exists()) return uid;
          return resolveChatDisplayNameFromUserDoc(uid, s.data() as Record<string, unknown>);
        } catch {
          return uid;
        }
      };
      const [meName, otherName] = await Promise.all([resolveName(me), resolveName(other)]);
      const b = writeBatch(db);
      b.set(userJoinedRef(me, roomId), { roomId, type: 'dm', peerId: other, peerDisplayName: otherName, updatedAt: Date.now() } as any, { merge: true });
      b.set(userJoinedRef(other, roomId), { roomId, type: 'dm', peerId: me, peerDisplayName: meName, updatedAt: Date.now() } as any, { merge: true });
      await b.commit();
    } catch {
      /* joinedRooms 힐 실패해도 roomId 는 유효 */
    }
    return String(v?.id || roomId);
  }

  try {
    const qLegacy = query(collection(db, 'rooms'), where('type', '==', 'dm'), where('participantIds', 'array-contains', me), limit(30));
    const snapLegacy = await getDocs(qLegacy);
    const matched = snapLegacy.docs.find((docSnap) => {
      const v = docSnap.data() as any;
      const pids: string[] = Array.isArray(v?.participantIds) ? v.participantIds.map((x: any) => String(x)) : [];
      return pids.includes(other);
    });
    if (matched) {
      const roomId = matched.id;
      try {
        await setDoc(
          roomRef(roomId),
          {
            dmPairKey: pairKey,
            participantIds: Array.from(new Set([me, other])),
            memberIds: Array.from(new Set([me, other])),
            members: Array.from(new Set([me, other])),
            adminIds: Array.from(new Set([me, other])),
            ownerIds: Array.from(new Set([me, other])),
            updatedAt: Date.now(),
          } as any,
          { merge: true }
        );
      } catch {
        /* noop */
      }
      return roomId;
    }
  } catch {
    /* noop */
  }

  return createDmRoomWeb(me, other);
}
