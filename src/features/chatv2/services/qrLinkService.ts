import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, writeBatch } from 'firebase/firestore';
import { parseYooYLinkV2 } from '../core/linkRouting';
import { isRoomExplodedV2 } from '../core/ttlEngine';
import { getRoomDocRef, getRoomMemberDocRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import { normalizeRoomId } from '../utils/roomId';
import { getOrCreateDmRoomV2 } from './roomService';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';
import { sendSystemMessageV2 } from './messageService';

export type LinkRouteResultV2 =
  | { type: 'navigate_room'; roomId: string }
  | { type: 'navigate_dm'; roomId: string }
  | { type: 'external'; url: string }
  | { type: 'unknown'; raw: string; reason?: string };

async function resolveUserNameV2(firestore: Firestore, uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(firestore, 'users', uid));
    if (!snap.exists()) return uid;
    return resolveChatDisplayNameFromUserDoc(uid, snap.data() as Record<string, unknown>);
  } catch {
    return uid;
  }
}

async function ensureJoinedRoomSummaryV2(input: {
  firestore: Firestore;
  uid: string;
  roomId: string;
  roomType: string;
  title?: string;
  peerDisplayName?: string;
  ttl?: any;
  /** 신규 입장 시 과거 메시지 차단 기준(ms) */
  clearedAt?: number;
}) {
  const now = Date.now();
  const rt = String(input.roomType || 'group');
  await setDoc(
    getUserJoinedRoomDocRef(input.firestore, input.uid, input.roomId),
    {
      roomId: input.roomId,
      type: rt,
      title: rt === 'dm' ? undefined : input.title,
      peerDisplayName: rt === 'dm' ? (input.peerDisplayName || undefined) : undefined,
      ttl: rt === 'ttl' ? (input.ttl || undefined) : undefined,
      unreadCount: 0,
      lastMessage: '',
      lastMessageAt: now,
      isFavorite: false,
      muted: false,
      updatedAt: now,
      ...(typeof input.clearedAt === 'number' && input.clearedAt > 0 ? { clearedAt: input.clearedAt } : {}),
    } as any,
    { merge: true }
  );
}

/**
 * Join/create membership + summary, then return roomId.
 * This is used by both QR and URL entry.
 * - 비밀방(type=secret 또는 isSecret): 초대 링크의 t·c 가 rooms 문서와 일치할 때만 신규 참여 허용
 * - 그 외: 잘못된 t·c 는 거절; t·c 없이 roomId만 온 경우는 공개 방만 입장 허용
 */
export async function ensureRoomEntryReadyV2(input: {
  firestore: Firestore;
  uid: string;
  roomId: string;
  inviteToken?: string;
  inviteCode?: string;
}): Promise<{ roomId: string }> {
  const { firestore, uid, roomId, inviteToken, inviteCode } = input;
  const roomSnap = await getDoc(getRoomDocRef(firestore, roomId));
  if (!roomSnap.exists()) throw new Error('room_not_found');
  const room = roomSnap.data() as any;
  const type = String(room?.type || 'group');
  if (type === 'ttl') {
    const probe = { type: 'ttl' as const, ttl: room?.ttl, roomExpiresAt: room?.roomExpiresAt };
    if (isRoomExplodedV2(probe, Date.now())) throw new Error('ttl_room_exploded');
  }
  const title = room?.title ? String(room.title) : undefined;
  const ttl = room?.ttl || undefined;
  const participantIds: string[] = Array.isArray(room?.participantIds) ? room.participantIds.map((x: any) => String(x)) : [];
  const isMember = participantIds.includes(uid);
  const newlyJoined = !isMember && type !== 'dm';
  const secretLike = type === 'secret' || room?.isSecret === true;
  const inviteDisabled = room?.inviteEnabled === false;
  const roomT = String(room?.inviteToken || '');
  const roomC = String(room?.inviteCode || '');
  const hasRoomInvite = !!(roomT && roomC);
  const tok = String(inviteToken || '').trim();
  const cod = String(inviteCode || '').trim();
  const paramsPresent = !!(tok && cod);
  const inviteOk = hasRoomInvite && paramsPresent && tok === roomT && cod === roomC;

  if (!isMember && type !== 'dm') {
    if (inviteDisabled) throw new Error('invites_disabled');
    if (secretLike) {
      if (!inviteOk) throw new Error('invite_required');
    } else if (hasRoomInvite) {
      if (paramsPresent && !inviteOk) throw new Error('invite_invalid');
    }
  }

  /**
   * IMPORTANT (Firestore rules):
   * roomMembers/{roomId}/members/{uid} create is typically allowed only if the user is already
   * listed in rooms/{roomId}.participantIds (or has joinedRooms doc, etc).
   *
   * For "new join" flows, write rooms.participantIds first, then create roomMembers/joinedRooms.
   */
  // Ensure participantIds contains uid for non-dm rooms (commit first)
  if (type !== 'dm') {
    if (!participantIds.includes(uid)) {
      try {
        await updateDoc(getRoomDocRef(firestore, roomId), { participantIds: arrayUnion(uid), updatedAt: Date.now(), serverUpdatedAt: serverTimestamp() } as any);
      } catch {}
    }
  } else {
    // DM: must already be a valid 2-person room
    if (participantIds.length >= 1 && !participantIds.includes(uid)) {
      throw new Error('dm_membership_mismatch');
    }
  }

  // Ensure membership doc exists (after rooms update for non-dm)
  const now = Date.now();
  await setDoc(
    getRoomMemberDocRef(firestore, roomId, uid),
    {
      uid,
      role: uid === String(room?.createdBy || '') ? 'admin' : 'member',
      joinedAt: now,
      lastReadAt: now,
      unreadCount: 0,
      muted: false,
      updatedAt: now,
      serverJoinedAt: serverTimestamp(),
    } as any,
    { merge: true }
  );

  // Ensure joinedRooms summary
  if (type === 'dm') {
    const otherId = participantIds.find((x) => x !== uid) || '';
    const otherName = otherId ? await resolveUserNameV2(firestore, otherId) : undefined;
    await ensureJoinedRoomSummaryV2({ firestore, uid, roomId, roomType: 'dm', peerDisplayName: otherName });
  } else {
    // 신규 입장자는 과거 메시지 차단: clearedAt 기준 이후만 표시
    const clearedAt = newlyJoined ? Date.now() : undefined;
    await ensureJoinedRoomSummaryV2({ firestore, uid, roomId, roomType: type, title, ttl: type === 'ttl' ? ttl : undefined, clearedAt });
  }

  // Optional: join system message (room settings)
  try {
    if (newlyJoined) {
      const jm = (room?.settings && typeof room.settings === 'object') ? (room.settings as any).joinMessage : null;
      const enabled = jm ? (jm.enabled !== false) : false;
      const template = jm && typeof jm.template === 'string' ? String(jm.template) : '{name} 님이 입장했습니다.';
      if (enabled) {
        const meName = await resolveUserNameV2(firestore, uid);
        const text = template.replace(/\{name\}/g, meName || uid).replace(/\{uid\}/g, uid);
        await sendSystemMessageV2({
          firestore,
          roomId,
          text,
          meta: { kind: 'join', joinedUid: uid, joinedName: meName || uid },
        });
      }
    }
  } catch {}

  return { roomId };
}

/**
 * Unified entry for QR scan results and URL clicks.
 * Returns a routing decision (navigate/external/unknown).
 */
export async function routeFromQrOrLinkV2(input: { firestore: Firestore; uid: string; raw: string }): Promise<LinkRouteResultV2> {
  const { firestore, uid, raw } = input;
  const parsed = parseYooYLinkV2(raw);

  if (parsed.type === 'external') return parsed;
  if (parsed.type === 'unknown') return { type: 'unknown', raw, reason: 'unrecognized' };

  if (parsed.type === 'dm') {
    const otherId = String(parsed.otherId || '').trim();
    if (!otherId) return { type: 'unknown', raw, reason: 'missing_otherId' };
    const room = await getOrCreateDmRoomV2(firestore, uid, otherId);
    return { type: 'navigate_dm', roomId: String(room.id) };
  }

  if (parsed.type === 'room') {
    const roomIdRaw = String(parsed.roomId || '').trim();
    const roomId = normalizeRoomId(roomIdRaw, 'qrLinkService.route.room');
    if (!roomId) return { type: 'unknown', raw, reason: 'invalid_room_id' };
    const out = await ensureRoomEntryReadyV2({ firestore, uid, roomId });
    return { type: 'navigate_room', roomId: out.roomId };
  }

  if (parsed.type === 'invite') {
    const roomIdRaw = String(parsed.roomId || '').trim();
    const roomId = normalizeRoomId(roomIdRaw, 'qrLinkService.route.invite');
    if (!roomId) return { type: 'unknown', raw, reason: 'invalid_room_id' };
    const out = await ensureRoomEntryReadyV2({
      firestore,
      uid,
      roomId,
      inviteToken: parsed.token,
      inviteCode: parsed.code,
    });
    return { type: 'navigate_room', roomId: out.roomId };
  }

  return { type: 'unknown', raw, reason: 'unsupported' };
}

