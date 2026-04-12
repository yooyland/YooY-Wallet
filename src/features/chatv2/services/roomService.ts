import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadString } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import type { ChatRoomV2, ChatRoomTypeV2, RoomPermissionsV2, RoomSettingsDocV2 } from '../core/roomSchema';
import { getDmPairKeyV2 } from '../core/roomSchema';
import { chatV2Paths } from '../core/firestorePaths';
import { getRoomDocRef, getRoomMemberDocRef, getRoomMessagesItemsColRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import { assertValidRoomId } from '../utils/roomId';
import { clearUnreadOnEnterV2 } from '../core/unreadEngine';
import { logYyRoom } from '../core/roomLog';
import { buildInviteQrPayloadV2, generateInviteCodeV2, generateInviteTokenV2, logInviteGenerateResult } from './roomInviteService';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';

export type CreateRoomInputV2 = {
  type: ChatRoomTypeV2;
  createdBy: string;
  participantIds: string[];
  title?: string;
  description?: string;
  tags?: string[];
  photoURL?: string | null;
  maxParticipants?: number;
  ttl?: ChatRoomV2['ttl'];
};

/** 쉼표/공백 기준 태그 정규화, 최대 10개 */
export function normalizeRoomTags(input: string): string[] {
  const raw = String(input || '')
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(raw)).slice(0, 10);
}

export async function uploadRoomCoverPhotoV2(input: { storage: FirebaseStorage; roomId: string; localUri: string }): Promise<string> {
  assertValidRoomId(input.roomId, 'uploadRoomCoverPhotoV2');
  logYyRoom('room.photo.upload.start', { roomId: input.roomId });
  try {
    let uri = String(input.localUri || '').trim();
    if (!uri) throw new Error('empty_uri');
    try {
      const FS = require('expo-file-system/legacy');
      if (/^content:\/\//i.test(uri) && FS?.cacheDirectory && FS?.copyAsync) {
        const dest = `${FS.cacheDirectory}yy_room_cover_${Date.now()}.jpg`;
        await FS.copyAsync({ from: uri, to: dest });
        uri = dest;
      }
    } catch {
      /* keep uri */
    }
    const path = `chatv2/rooms/${input.roomId}/cover_${Date.now()}.jpg`;
    const ref = storageRef(input.storage, path);
    if (/^file:\/\//i.test(uri)) {
      try {
        const FS = require('expo-file-system/legacy');
        if (FS?.readAsStringAsync && FS?.EncodingType) {
          const b64 = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
          await uploadString(ref, `data:image/jpeg;base64,${b64}`, 'data_url');
          const url = await getDownloadURL(ref);
          logYyRoom('room.photo.upload.success', { roomId: input.roomId, path, mode: 'native_base64' });
          return String(url || '');
        }
      } catch (e: any) {
        logYyRoom('room.photo.upload.native_fallback', { roomId: input.roomId, error: String(e?.message || e) });
      }
    }
    const resp = await fetch(uri);
    const blob = await resp.blob();
    await uploadBytes(ref, blob);
    const url = await getDownloadURL(ref);
    logYyRoom('room.photo.upload.success', { roomId: input.roomId, path, mode: 'blob' });
    return String(url || '');
  } catch (e: any) {
    logYyRoom('room.photo.upload.fail', { roomId: input.roomId, error: String(e?.message || e) });
    throw e;
  }
}

/** 방별 개인 배경(내 설정) — Storage 경로만 방 커버와 분리 */
export async function uploadUserRoomWallpaperV2(input: { storage: FirebaseStorage; uid: string; roomId: string; localUri: string }): Promise<string> {
  assertValidRoomId(input.roomId, 'uploadUserRoomWallpaperV2');
  logYyRoom('room.wallpaper.upload.start', { roomId: input.roomId, uid: input.uid });
  try {
    let uri = String(input.localUri || '').trim();
    if (!uri) throw new Error('empty_uri');
    try {
      const FS = require('expo-file-system/legacy');
      if (/^content:\/\//i.test(uri) && FS?.cacheDirectory && FS?.copyAsync) {
        const dest = `${FS.cacheDirectory}yy_room_wp_${Date.now()}.jpg`;
        await FS.copyAsync({ from: uri, to: dest });
        uri = dest;
      }
    } catch {
      /* keep uri */
    }
    const path = `chatv2/users/${input.uid}/rooms/${input.roomId}/wallpaper_${Date.now()}.jpg`;
    const ref = storageRef(input.storage, path);
    if (/^file:\/\//i.test(uri)) {
      try {
        const FS = require('expo-file-system/legacy');
        if (FS?.readAsStringAsync && FS?.EncodingType) {
          const b64 = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
          await uploadString(ref, `data:image/jpeg;base64,${b64}`, 'data_url');
          const url = await getDownloadURL(ref);
          logYyRoom('room.wallpaper.upload.success', { roomId: input.roomId, path, mode: 'native_base64' });
          return String(url || '');
        }
      } catch (e: any) {
        logYyRoom('room.wallpaper.upload.native_fallback', { roomId: input.roomId, error: String(e?.message || e) });
      }
    }
    const resp = await fetch(uri);
    const blob = await resp.blob();
    await uploadBytes(ref, blob);
    const url = await getDownloadURL(ref);
    logYyRoom('room.wallpaper.upload.success', { roomId: input.roomId, path, mode: 'blob' });
    return String(url || '');
  } catch (e: any) {
    logYyRoom('room.wallpaper.upload.fail', { roomId: input.roomId, error: String(e?.message || e) });
    throw e;
  }
}

function typeDefaults(type: ChatRoomTypeV2): {
  permissions: RoomPermissionsV2;
  settings: RoomSettingsDocV2;
  security: NonNullable<ChatRoomV2['security']>;
  isSecret?: boolean;
  searchVisible?: boolean;
} {
  if (type === 'secret') {
    return {
      permissions: {
        memberCanMessage: true,
        memberCanUploadFile: true,
        memberCanUploadImage: true,
        memberCanShareLink: true,
        memberCanInvite: false,
        whoCanEditRoomInfo: 'admin',
      },
      settings: {},
      security: {},
      isSecret: true,
      searchVisible: false,
    };
  }
  if (type === 'notice') {
    return {
      permissions: {
        memberCanMessage: false,
        memberCanUploadFile: false,
        memberCanUploadImage: true,
        memberCanShareLink: true,
        memberCanInvite: false,
        whoCanEditRoomInfo: 'admin',
      },
      settings: { noticeOnlyAdminWrite: true },
      security: {},
    };
  }
  if (type === 'ttl') {
    return {
      permissions: {
        memberCanMessage: true,
        memberCanUploadFile: true,
        memberCanUploadImage: true,
        memberCanShareLink: true,
        memberCanInvite: true,
        whoCanEditRoomInfo: 'admin',
      },
      settings: {},
      security: { allowImageUpload: true, allowImageDownload: false, allowCapture: false, allowExternalShare: false },
    };
  }
  // group, dm
  return {
    permissions: {
      memberCanMessage: true,
      memberCanUploadFile: true,
      memberCanUploadImage: true,
      memberCanShareLink: true,
      memberCanInvite: true,
      whoCanEditRoomInfo: 'admin',
    },
    settings: {},
    security: {},
    searchVisible: true,
  };
}

export async function createRoomV2(firestore: Firestore, input: CreateRoomInputV2): Promise<ChatRoomV2> {
  logYyRoom('room.create.start', { type: input.type, createdBy: input.createdBy });
  try {
  const now = Date.now();
  const roomId = uuidv4();
  const participantIds = Array.from(new Set(input.participantIds)).filter(Boolean);
  const adminIds = input.type === 'dm' ? participantIds : [input.createdBy];
  const tags = Array.isArray(input.tags) ? input.tags.slice(0, 10) : [];
  const maxP = Math.max(2, Math.min(500, Number(input.maxParticipants || 100)));
  const td = typeDefaults(input.type);
  const inviteCode = input.type !== 'dm' ? generateInviteCodeV2() : undefined;
  const inviteToken = input.type !== 'dm' ? generateInviteTokenV2() : undefined;
  const inviteQrValue =
    input.type !== 'dm' && inviteCode && inviteToken
      ? buildInviteQrPayloadV2({ roomId, inviteToken, inviteCode })
      : undefined;

  const photoURL = input.photoURL ? String(input.photoURL) : undefined;
  const ttlBlock =
    input.type === 'ttl'
      ? (() => {
          const t = input.ttl || { enabled: true, explodeRoomAt: null, messageExpireSeconds: null };
          const explodeAt =
            typeof t.explodeRoomAt === 'number' && t.explodeRoomAt
              ? t.explodeRoomAt
              : Date.now() + 24 * 3600 * 1000;
          const roomSec = Math.max(0, Math.floor((explodeAt - Date.now()) / 1000));
          const msgSec =
            typeof t.messageExpireSeconds === 'number' && t.messageExpireSeconds > 0 ? Math.floor(t.messageExpireSeconds) : 0;
          return {
            enabled: t.enabled !== false,
            explodeRoomAt: explodeAt,
            messageExpireSeconds: msgSec > 0 ? msgSec : null,
            roomTtlSeconds: roomSec,
            ttlStatus: roomSec <= 0 ? ('expired' as const) : ('active' as const),
            ttlLastModifiedBy: input.createdBy,
          };
        })()
      : undefined;

  const room: ChatRoomV2 = {
    id: roomId,
    type: input.type,
    title: input.title,
    description: input.description,
    photoURL,
    avatarUrl: photoURL,
    tags: tags.length ? tags : undefined,
    maxParticipants: input.type === 'dm' ? 2 : maxP,
    roomStatus: 'active',
    searchVisible: td.searchVisible !== false,
    isSecret: td.isSecret,
    settings: Object.keys(td.settings || {}).length ? td.settings : input.type === 'notice' ? { noticeOnlyAdminWrite: true } : undefined,
    permissions: td.permissions,
    inviteCode,
    inviteToken,
    inviteEnabled: input.type !== 'dm',
    inviteExpiresAt: null,
    inviteQrValue,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    participantIds,
    memberIds: participantIds,
    adminIds,
    ownerIds: input.type === 'dm' ? participantIds : [input.createdBy],
    dmPairKey: input.type === 'dm' && participantIds.length === 2 ? getDmPairKeyV2(participantIds[0], participantIds[1]) : undefined,
    ttl: ttlBlock,
    security: input.type === 'ttl' ? { ...td.security, ...(input.ttl ? {} : {}) } : td.security && Object.keys(td.security).length ? td.security : undefined,
  };

  if (input.type === 'ttl' && ttlBlock && typeof ttlBlock.explodeRoomAt === 'number') {
    (room as any).ttlEnabled = ttlBlock.enabled;
    (room as any).roomExpiresAt = ttlBlock.explodeRoomAt;
    (room as any).roomTtlSeconds = ttlBlock.roomTtlSeconds;
    (room as any).messageTtlSeconds =
      typeof ttlBlock.messageExpireSeconds === 'number' && ttlBlock.messageExpireSeconds > 0 ? ttlBlock.messageExpireSeconds : null;
    (room as any).ttlStatus = ttlBlock.ttlStatus;
    (room as any).ttlLastModifiedBy = input.createdBy;
  }

  const resolveName = async (uid: string) => {
    try {
      const snap = await getDoc(doc(firestore, 'users', uid));
      if (!snap.exists()) return uid;
      return resolveChatDisplayNameFromUserDoc(uid, snap.data() as Record<string, unknown>);
    } catch {
      return uid;
    }
  };

  /** rooms 단독 커밋 후 멤버십 배치 — group / dm / secret / ttl / notice 등 모든 타입에 동일 적용.
   *  한 배치에 rooms+roomMembers 를 쓰면 규칙 평가에서 rooms 가 보이지 않아 Permission 오류가 날 수 있음. */
  const batchRoom = writeBatch(firestore);
  batchRoom.set(
    getRoomDocRef(firestore, roomId),
    {
      ...room,
      memberIds: participantIds,
      members: participantIds,
      ownerIds: room.ownerIds,
      serverUpdatedAt: serverTimestamp(),
    } as any,
    { merge: true }
  );
  await batchRoom.commit();

  // roomMembers + joinedRooms summary for each participant
  // DM: joinedRooms must include peerDisplayName for each side (title is always the other participant)
  const dmPeerNameByUid: Record<string, string> = {};
  const dmPeerIdByUid: Record<string, string> = {};
  if (input.type === 'dm' && participantIds.length === 2) {
    const a = participantIds[0];
    const b = participantIds[1];
    const [an, bn] = await Promise.all([resolveName(a), resolveName(b)]);
    dmPeerNameByUid[a] = bn;
    dmPeerNameByUid[b] = an;
    dmPeerIdByUid[a] = b;
    dmPeerIdByUid[b] = a;
  }

  const userProfileByUid: Record<string, { displayName: string; photoURL: string }> = {};
  await Promise.all(
    participantIds.map(async (targetUid) => {
      try {
        const s = await getDoc(doc(firestore, 'users', targetUid));
        const d = s.exists() ? (s.data() as any) : {};
        userProfileByUid[targetUid] = {
          displayName: resolveChatDisplayNameFromUserDoc(targetUid, d as Record<string, unknown>).trim() || targetUid,
          photoURL: String(d?.photoURL || d?.avatar || d?.profileImageUrl || '').trim(),
        };
      } catch {
        userProfileByUid[targetUid] = { displayName: targetUid, photoURL: '' };
      }
    })
  );

  const batch = writeBatch(firestore);
  for (const uid of participantIds) {
    const role = input.type === 'dm' ? 'admin' : uid === input.createdBy ? 'admin' : 'member';
    batch.set(
      getRoomMemberDocRef(firestore, roomId, uid),
      {
        uid,
        displayName: userProfileByUid[uid]?.displayName || uid,
        photoURL: userProfileByUid[uid]?.photoURL || '',
        role,
        isDmParticipant: input.type === 'dm',
        joinedAt: now,
        lastReadAt: now,
        unreadCount: 0,
        updatedAt: now,
        muted: false,
        status: 'active',
      },
      { merge: true }
    );
    batch.set(
      getUserJoinedRoomDocRef(firestore, uid, roomId),
      {
        roomId,
        type: input.type,
        title: input.type === 'dm' ? undefined : input.title,
        description: input.type === 'dm' ? undefined : input.description,
        avatarUrl: photoURL,
        peerId: input.type === 'dm' ? (dmPeerIdByUid[uid] || undefined) : undefined,
        peerDisplayName: input.type === 'dm' ? (dmPeerNameByUid[uid] || undefined) : undefined,
        ttl: input.type === 'ttl' ? (room.ttl || undefined) : undefined,
        lastMessage: '',
        lastMessageAt: now,
        unreadCount: 0,
        isFavorite: false,
        muted: false,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
  try {
    logYyRoom('room.create.success', { roomId, type: input.type, participantCount: participantIds.length });
  } catch {}
  return room;
  } catch (e: any) {
    logYyRoom('room.create.fail', { error: String(e?.message || e), type: input.type });
    throw e;
  }
}

async function healDmRoomStructureV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<boolean> {
  const { firestore, roomId, uid } = input;
  if (!uid) return false;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) return false;
  const room = roomSnap.data() as any;
  if (String(room?.type || '') !== 'dm') return false;

  const roomParticipantIds: string[] = Array.isArray(room?.participantIds)
    ? room.participantIds.map((x: any) => String(x)).filter(Boolean)
    : [];

  // If participantIds are missing, recover from users/{uid}/joinedRooms/{roomId}.peerId
  if (roomParticipantIds.length < 2 || !roomParticipantIds.includes(uid)) {
    const joinedSnap = await getDoc(getUserJoinedRoomDocRef(firestore, uid, roomId));
    const peerId = String((joinedSnap.data() as any)?.peerId || '').trim();
    if (!peerId) return false;

    const nextParticipants = Array.from(new Set([uid, peerId])).filter(Boolean);
    if (nextParticipants.length !== 2) return false;

    const createdBy = String(room?.createdBy || uid);
    const dmPairKey = getDmPairKeyV2(nextParticipants[0], nextParticipants[1]);

    const resolveName = async (targetUid: string) => {
      try {
        const s = await getDoc(doc(firestore, 'users', targetUid));
        if (!s.exists()) return targetUid;
        return resolveChatDisplayNameFromUserDoc(targetUid, s.data() as Record<string, unknown>);
      } catch {
        return targetUid;
      }
    };

    const [nameA, nameB] = await Promise.all([resolveName(nextParticipants[0]), resolveName(nextParticipants[1])]);
    const resolvePhoto = async (targetUid: string) => {
      try {
        const s = await getDoc(doc(firestore, 'users', targetUid));
        if (!s.exists()) return '';
        const d = s.data() as any;
        return String(d?.photoURL || d?.avatar || d?.profileImageUrl || '').trim();
      } catch {
        return '';
      }
    };
    const [photoA, photoB] = await Promise.all([resolvePhoto(nextParticipants[0]), resolvePhoto(nextParticipants[1])]);

    const batchRoom = writeBatch(firestore);
    batchRoom.set(
      getRoomDocRef(firestore, roomId),
      {
        participantIds: nextParticipants,
        memberIds: nextParticipants,
        members: nextParticipants,
        adminIds: nextParticipants,
        ownerIds: nextParticipants,
        createdBy,
        dmPairKey,
        updatedAt: Date.now(),
      } as any,
      { merge: true }
    );
    await batchRoom.commit();

    const a = nextParticipants[0];
    const b = nextParticipants[1];
    const otherBy = (x: string) => (x === a ? b : a);

    const batch = writeBatch(firestore);
    for (const memberUid of nextParticipants) {
      const other = otherBy(memberUid);
      const role = 'admin';
      const peerDisplayName = memberUid === a ? nameB : nameA;
      batch.set(
        getRoomMemberDocRef(firestore, roomId, memberUid),
        {
          uid: memberUid,
          displayName: memberUid === a ? nameA : nameB,
          photoURL: memberUid === a ? photoA : photoB,
          role,
          isDmParticipant: true,
          joinedAt: Date.now(),
          lastReadAt: Date.now(),
          unreadCount: 0,
          muted: false,
          updatedAt: Date.now(),
        } as any,
        { merge: true }
      );
      batch.set(
        getUserJoinedRoomDocRef(firestore, memberUid, roomId),
        {
          roomId,
          type: 'dm',
          peerId: other,
          peerDisplayName,
          updatedAt: Date.now(),
        } as any,
        { merge: true }
      );
    }

    await batch.commit();
    return true;
  }

  // If participantIds exist, still ensure adminIds includes both (DM rules/roles)
  if (roomParticipantIds.length >= 2) {
    const nextAdminIds = roomParticipantIds;
    const existingAdminIds: string[] = Array.isArray(room?.adminIds) ? room.adminIds.map((x: any) => String(x)).filter(Boolean) : [];
    const missing = nextAdminIds.some((x) => !existingAdminIds.includes(x));
    const shouldPatchCore =
      missing ||
      !Array.isArray((room as any)?.memberIds) ||
      !Array.isArray((room as any)?.ownerIds) ||
      !Array.isArray((room as any)?.members);
    if (shouldPatchCore) {
      await setDoc(
        getRoomDocRef(firestore, roomId),
        {
          adminIds: nextAdminIds,
          memberIds: roomParticipantIds,
          members: roomParticipantIds,
          ownerIds: roomParticipantIds,
          updatedAt: Date.now(),
        } as any,
        { merge: true }
      );
    }
  }

  return false;
}

export async function getOrCreateDmRoomV2(firestore: Firestore, me: string, other: string): Promise<ChatRoomV2> {
  const pairKey = getDmPairKeyV2(me, other);

  // Try find existing room by dmPairKey (rooms collection only, indexed)
  const q = query(collection(firestore, chatV2Paths.rooms()), where('type', '==', 'dm'), where('dmPairKey', '==', pairKey), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    const v = d.data() as any;
    const room = { ...(v as ChatRoomV2), id: v.id || d.id };
    // Heal joinedRooms peerDisplayName if missing
    try {
      const resolveName = async (uid: string) => {
        try {
          const s = await getDoc(doc(firestore, 'users', uid));
          if (!s.exists()) return uid;
          return resolveChatDisplayNameFromUserDoc(uid, s.data() as Record<string, unknown>);
        } catch {
          return uid;
        }
      };
      const [meName, otherName] = await Promise.all([resolveName(me), resolveName(other)]);
      const b = writeBatch(firestore);
      b.set(
        getUserJoinedRoomDocRef(firestore, me, room.id),
        { roomId: room.id, type: 'dm', peerId: other, peerDisplayName: otherName, updatedAt: Date.now() } as any,
        { merge: true }
      );
      b.set(
        getUserJoinedRoomDocRef(firestore, other, room.id),
        { roomId: room.id, type: 'dm', peerId: me, peerDisplayName: meName, updatedAt: Date.now() } as any,
        { merge: true }
      );
      await b.commit();
    } catch {}
    return room;
  }

  // Legacy fallback: dmPairKey 누락/불일치로 기존 DM을 못 찾는 케이스
  // participantIds 배열에 me가 포함된 DM 중 other 포함 방을 재사용한다.
  try {
    const qLegacy = query(collection(firestore, chatV2Paths.rooms()), where('type', '==', 'dm'), where('participantIds', 'array-contains', me), limit(30));
    const snapLegacy = await getDocs(qLegacy);
    const matched = snapLegacy.docs.find((d) => {
      const v = d.data() as any;
      const pids: string[] = Array.isArray(v?.participantIds) ? v.participantIds.map((x: any) => String(x)) : [];
      return pids.includes(other);
    });
    if (matched) {
      const v = matched.data() as any;
      const roomId = String(v?.id || matched.id);
      try {
        await setDoc(
          getRoomDocRef(firestore, roomId),
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
      } catch {}
      return { ...(v as ChatRoomV2), id: roomId };
    }
  } catch {}

  return createRoomV2(firestore, { type: 'dm', createdBy: me, participantIds: [me, other] });
}

/**
 * participantIds 가 비어 있으면 createdBy(및 memberIds)로 복구.
 * roomMembers 저장·isRoomParticipant 규칙이 실패하는 주된 원인 제거.
 */
export async function healRoomParticipantIdsIfEmptyV2(input: { firestore: Firestore; roomId: string }): Promise<boolean> {
  const { firestore, roomId } = input;
  const snap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!snap.exists()) return false;
  const r = snap.data() as any;
  let parts: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  if (parts.length > 0) return false;
  const createdBy = String(r?.createdBy || '').trim();
  const fallback: string[] = [];
  if (createdBy) fallback.push(createdBy);
  if (Array.isArray(r?.memberIds)) {
    for (const x of r.memberIds) {
      const id = String(x).trim();
      if (id && !fallback.includes(id)) fallback.push(id);
    }
  }
  if (Array.isArray(r?.members)) {
    for (const x of r.members) {
      const id = String(x).trim();
      if (id && !fallback.includes(id)) fallback.push(id);
    }
  }
  // Legacy(v1 카카오 스타일): members 가 { uid: true } 맵인 경우
  if (r?.members && typeof r.members === 'object' && !Array.isArray(r.members)) {
    for (const k of Object.keys(r.members)) {
      const v = (r.members as any)[k];
      if (v !== true && v !== 'true' && v !== 1) continue;
      const id = String(k).trim();
      if (id && !fallback.includes(id)) fallback.push(id);
    }
  }
  if (fallback.length === 0) return false;
  await setDoc(
    getRoomDocRef(firestore, roomId),
    {
      participantIds: fallback,
      memberIds: fallback,
      members: fallback,
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
  logYyRoom('room.heal.participantIds', { roomId, count: fallback.length });
  return true;
}

/** 방장만: adminIds 에 본인이 빠져 있으면 복구 (설정·초대 권한용). DM 은 참여자 전원을 adminIds 에 두어 양쪽 모두 방장 권한과 동일하게 동작. */
export async function ensureRoomAdminIdsForCreatorV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<void> {
  const { firestore, roomId, uid } = input;
  const snap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!snap.exists()) return;
  const r = snap.data() as any;
  if (String(r?.type || '') === 'dm') {
    const p: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
    if (!p.includes(uid)) return;
    const admins: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)).filter(Boolean) : [];
    const next = Array.from(new Set([...p, ...admins]));
    const key = (a: string[]) => [...a].sort().join('|');
    if (key(next) === key(admins)) return;
    await setDoc(getRoomDocRef(firestore, roomId), { adminIds: next, updatedAt: Date.now() } as any, { merge: true });
    return;
  }
  const cb = String(r?.createdBy || '').trim();
  if (!cb || cb !== uid) return;
  const admins: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)).filter(Boolean) : [];
  if (admins.includes(cb)) return;
  const next = [cb, ...admins.filter((x) => x !== cb)];
  await setDoc(getRoomDocRef(firestore, roomId), { adminIds: next, updatedAt: Date.now() } as any, { merge: true });
}

/** participantIds 에 포함됐는데 roomMembers 행이 없으면 본인 멤버 문서 생성 */
export async function ensureMyRoomMemberDocV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<void> {
  const { firestore, roomId, uid } = input;
  if (!uid) return;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) return;
  const r = roomSnap.data() as any;
  let parts: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  if (parts.length === 0 && Array.isArray(r?.memberIds)) parts = r.memberIds.map((x: any) => String(x)).filter(Boolean);
  if (!parts.includes(uid)) return;
  const memSnap = await getDoc(getRoomMemberDocRef(firestore, roomId, uid));
  if (memSnap.exists()) return;
  const createdBy = String(r?.createdBy || '').trim();
  const t = String(r?.type || 'group');
  const role = t === 'dm' ? 'admin' : uid === createdBy ? 'admin' : 'member';
  const now = Date.now();
  let displayName = uid;
  let photoURL = '';
  try {
    const us = await getDoc(doc(firestore, 'users', uid));
    if (us.exists()) {
      const d = us.data() as any;
      displayName = resolveChatDisplayNameFromUserDoc(uid, d as Record<string, unknown>).trim() || uid;
      photoURL = String(d?.photoURL || d?.avatar || d?.profileImageUrl || '').trim();
    }
  } catch {}
  await setDoc(
    getRoomMemberDocRef(firestore, roomId, uid),
    {
      uid,
      displayName,
      photoURL,
      role,
      isDmParticipant: t === 'dm',
      joinedAt: now,
      lastReadAt: now,
      unreadCount: 0,
      updatedAt: now,
      muted: false,
      status: 'active',
    } as any,
    { merge: true }
  );
}

/** 입장 시 실제 참석자로 등록 (나가기 전까지 participantIds/memberIds/members 유지) */
export async function ensureEnterParticipantV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<void> {
  const { firestore, roomId, uid } = input;
  if (!uid) return;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) return;
  const r = roomSnap.data() as any;
  const roomStatus = String(r?.roomStatus || 'active').trim();
  if (roomStatus === 'closed' || roomStatus === 'archived') {
    throw new Error('room_closed');
  }
  const now = Date.now();
  const participantIds: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  const memberIds: string[] = Array.isArray(r?.memberIds) ? r.memberIds.map((x: any) => String(x)).filter(Boolean) : [];
  const membersArr: string[] = Array.isArray(r?.members) ? r.members.map((x: any) => String(x)).filter(Boolean) : [];
  const next = Array.from(new Set([...participantIds, ...memberIds, ...membersArr, uid])).filter(Boolean);
  if (!next.includes(uid)) return;
  await setDoc(
    getRoomDocRef(firestore, roomId),
    {
      participantIds: next,
      memberIds: next,
      members: next,
      roomStatus: 'active',
      updatedAt: now,
    } as any,
    { merge: true }
  );
}

/** 방장/관리자 부재 방 차단. 복구 불가하면 roomStatus=closed 처리 후 입장 금지 */
export async function ensureRoomHasAdminOrCloseV2(input: { firestore: Firestore; roomId: string }): Promise<void> {
  const { firestore, roomId } = input;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) throw new Error('room_not_found');
  const r = roomSnap.data() as any;
  const roomStatus = String(r?.roomStatus || 'active').trim();
  if (roomStatus === 'closed' || roomStatus === 'archived') throw new Error('room_closed');

  const participantIds: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  const createdBy = String(r?.createdBy || '').trim();
  const adminsRaw: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)).filter(Boolean) : [];
  const adminIds = Array.from(new Set(adminsRaw.filter((x) => !participantIds.length || participantIds.includes(x))));
  if (adminIds.length > 0) return;

  if (createdBy && (!participantIds.length || participantIds.includes(createdBy))) {
    await setDoc(
      getRoomDocRef(firestore, roomId),
      {
        adminIds: [createdBy],
        ownerIds: [createdBy],
        participantIds: participantIds.length ? participantIds : [createdBy],
        memberIds: participantIds.length ? participantIds : [createdBy],
        members: participantIds.length ? participantIds : [createdBy],
        roomStatus: 'active',
        updatedAt: Date.now(),
      } as any,
      { merge: true }
    );
    return;
  }

  await setDoc(getRoomDocRef(firestore, roomId), { roomStatus: 'closed', updatedAt: Date.now() } as any, { merge: true });
  throw new Error('room_no_admin');
}

export async function enterRoomV2(input: { firestore: Firestore; roomId: string; uid: string; lastReadMessageId?: string }): Promise<void> {
  try {
    await healDmRoomStructureV2({ firestore: input.firestore, roomId: input.roomId, uid: input.uid });
  } catch {}
  try {
    await healRoomParticipantIdsIfEmptyV2({ firestore: input.firestore, roomId: input.roomId });
  } catch {}
  try {
    await ensureRoomAdminIdsForCreatorV2({ firestore: input.firestore, roomId: input.roomId, uid: input.uid });
  } catch {}
  await ensureEnterParticipantV2({ firestore: input.firestore, roomId: input.roomId, uid: input.uid });
  await ensureRoomHasAdminOrCloseV2({ firestore: input.firestore, roomId: input.roomId });
  try {
    await ensureMyRoomMemberDocV2({ firestore: input.firestore, roomId: input.roomId, uid: input.uid });
  } catch {}
  await clearUnreadOnEnterV2({
    firestore: input.firestore,
    roomId: input.roomId,
    uid: input.uid,
    lastReadMessageId: input.lastReadMessageId,
  });
}

export async function leaveRoomV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<void> {
  const { firestore, roomId, uid } = input;
  logYyRoom('room.leave.start', { roomId, uid });
  try {
    const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
    const batch = writeBatch(firestore);
    batch.delete(getRoomMemberDocRef(firestore, roomId, uid));
    batch.delete(getUserJoinedRoomDocRef(firestore, uid, roomId));

    if (roomSnap.exists()) {
      const r = roomSnap.data() as any;
      const parts: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
      const next = parts.filter((x) => x !== uid);
      if (next.length !== parts.length) {
        const adminIds: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)).filter(Boolean) : [];
        const nextAdmins = adminIds.filter((x) => x !== uid);
        batch.set(
          getRoomDocRef(firestore, roomId),
          {
            participantIds: next,
            memberIds: next,
            members: next,
            adminIds: nextAdmins,
            updatedAt: Date.now(),
            ...(next.length === 0 ? { roomStatus: 'closed' as const } : {}),
          } as any,
          { merge: true }
        );
      }
    }

    await batch.commit();
    logYyRoom('room.leave.success', { roomId, uid });
  } catch (e: any) {
    logYyRoom('room.leave.fail', { roomId, uid, error: String(e?.message || e) });
    throw e;
  }
}

/** 방장(createdBy)만 — DM 제외 (부방장은 UI에서도 제외) */
export async function kickMemberFromRoomV2(input: { firestore: Firestore; roomId: string; actorUid: string; targetUid: string }): Promise<void> {
  const { firestore, roomId, actorUid, targetUid } = input;
  if (actorUid === targetUid) throw new Error('cannot_kick_self');
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) throw new Error('room_not_found');
  const r = roomSnap.data() as any;
  if (String(r?.type) === 'dm') throw new Error('dm_no_kick');
  const createdBy = String(r?.createdBy || '').trim();
  if (!createdBy || createdBy !== actorUid) throw new Error('owner_only');
  const admins: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)) : [];
  const parts: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  if (!parts.includes(targetUid)) throw new Error('not_member');
  const next = parts.filter((x) => x !== targetUid);
  const nextAdmins = admins.filter((x) => x !== targetUid);
  const batch = writeBatch(firestore);
  batch.delete(getRoomMemberDocRef(firestore, roomId, targetUid));
  batch.delete(getUserJoinedRoomDocRef(firestore, targetUid, roomId));
  batch.set(
    getRoomDocRef(firestore, roomId),
    {
      participantIds: next,
      memberIds: next,
      members: next,
      adminIds: nextAdmins,
      updatedAt: Date.now(),
      ...(next.length === 0 ? { roomStatus: 'closed' as const } : {}),
    } as any,
    { merge: true }
  );
  await batch.commit();
}

/** 방장(createdBy)만 — DM 제외. owner는 관리자 해제 불가 */
export async function setRoomMemberAdminV2(input: { firestore: Firestore; roomId: string; actorUid: string; targetUid: string; asAdmin: boolean }): Promise<void> {
  const { firestore, roomId, actorUid, targetUid, asAdmin } = input;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) throw new Error('room_not_found');
  const r = roomSnap.data() as any;
  if (String(r?.type) === 'dm') throw new Error('dm_no_promote');
  const createdBy = String(r?.createdBy || '').trim();
  if (!createdBy || createdBy !== actorUid) throw new Error('owner_only');
  const admins: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)) : [];
  if (targetUid === createdBy && !asAdmin) throw new Error('cannot_demote_owner');
  let nextAdmins = [...admins];
  if (asAdmin) {
    if (!nextAdmins.includes(targetUid)) nextAdmins.push(targetUid);
  } else {
    nextAdmins = nextAdmins.filter((x) => x !== targetUid);
  }
  const batch = writeBatch(firestore);
  batch.set(
    getRoomMemberDocRef(firestore, roomId, targetUid),
    { role: asAdmin ? 'admin' : 'member', updatedAt: Date.now() } as any,
    { merge: true }
  );
  batch.set(getRoomDocRef(firestore, roomId), { adminIds: nextAdmins, updatedAt: Date.now() } as any, { merge: true });
  await batch.commit();
}

export async function regenerateRoomInviteV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<{ inviteCode: string; inviteToken: string; inviteQrValue: string }> {
  const { firestore, roomId, uid } = input;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) throw new Error('room_not_found');
  const r = roomSnap.data() as any;
  if (String(r?.type) === 'dm') throw new Error('dm_no_invite');
  const admins: string[] = Array.isArray(r?.adminIds) ? r.adminIds.map((x: any) => String(x)) : [];
  const createdBy = String(r?.createdBy || '').trim();
  const participantIds: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)) : [];
  const memberCanInvite = r?.permissions?.memberCanInvite === true;
  /** adminIds 누락·레거시 방: 방장(createdBy)은 항상 초대 권한 — UI isOwner 와 일치 */
  const allowed =
    (createdBy && createdBy === uid) ||
    admins.includes(uid) ||
    (memberCanInvite && participantIds.includes(uid));
  if (!allowed) throw new Error('not_admin');
  const inviteCode = generateInviteCodeV2();
  const inviteToken = generateInviteTokenV2();
  const inviteQrValue = buildInviteQrPayloadV2({ roomId, inviteToken, inviteCode });
  await setDoc(
    getRoomDocRef(firestore, roomId),
    {
      inviteCode,
      inviteToken,
      inviteQrValue,
      inviteEnabled: true,
      updatedAt: Date.now(),
    } as any,
    { merge: true }
  );
  logInviteGenerateResult(true, { roomId });
  return { inviteCode, inviteToken, inviteQrValue };
}

/**
 * Personal reset only:
 * - clears my unread/read state
 * - stores clearedAt in joinedRooms to allow UI to hide older messages (client-side)
 * - does NOT delete shared room or other users' messages
 */
export async function resetRoomForMeV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(input.firestore);
  batch.set(getRoomMemberDocRef(input.firestore, input.roomId, input.uid), { unreadCount: 0, lastReadAt: now, updatedAt: now }, { merge: true });
  batch.set(getUserJoinedRoomDocRef(input.firestore, input.uid, input.roomId), { unreadCount: 0, clearedAt: now, updatedAt: now } as any, { merge: true });
  await batch.commit();
}

export async function exportRoomMessagesV2(input: { firestore: Firestore; roomId: string; limitN?: number; roomTitle?: string }): Promise<string> {
  const N = Math.max(50, Math.min(5000, Number(input.limitN || 1000)));
  const q = query(getRoomMessagesItemsColRef(input.firestore, input.roomId), orderBy('createdAt', 'asc'), limit(N));
  const snap = await getDocs(q);
  const rows: any[] = [];
  snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (ms: number) => {
    const dt = new Date(ms);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const text = rows
    .map((m) => {
      const ts = fmt(Number(m.createdAt || 0));
      const who = String(m.senderId || '');
      const type = String(m.type || 'text');
      const marker = type !== 'text' ? `[${type}]` : '';
      const text = String(m.text || '').trim();
      const url = String(m.url || '').trim();
      const loc = m.location?.address ? String(m.location.address) : '';
      const body =
        type === 'location' ? (loc || text) :
        (type === 'image' || type === 'video' || type === 'file' || type === 'audio') ? (text || url) :
        (type === 'url') ? (text || url) :
        (text || url);
      return `[${ts}] ${who}: ${marker ? marker + ' ' : ''}${body}`.trim();
    })
    .join('\n');

  // Save + Share (real output)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require('expo-file-system/legacy');
    const Sharing = (() => { try { return require('expo-sharing'); } catch { return null; } })();
    const Share = (() => { try { return require('react-native').Share; } catch { return null; } })();

    const safeTitle = (() => {
      const base = String(input.roomTitle || input.roomId || 'chat');
      return base.replace(/[\\/:*?"<>|]/g, '_').trim() || 'chat';
    })();
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const fileName = `${safeTitle}_${dateStr}.txt`;
    const dir = FS.cacheDirectory || FS.documentDirectory;
    const path = `${dir}${fileName}`;

    await FS.writeAsStringAsync(path, text, { encoding: FS.EncodingType.UTF8 });

    if (Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: '대화 내보내기' });
    } else if (Share?.share) {
      await Share.share({ title: fileName, message: text });
    }
  } catch {}

  return text;
}

