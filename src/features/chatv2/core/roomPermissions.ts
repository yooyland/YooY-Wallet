import type { ChatRoomV2 } from './roomSchema';

/**
 * 방장 UID — createdBy 우선, 비어 있으면 ownerIds / 단일 참가자 / adminIds 로 추론.
 * (joinedRooms 스텁이 rooms 전체 문서를 덮어쓸 때 createdBy 가 비는 경우 대비)
 */
export function resolveRoomOwnerUidV2(room: ChatRoomV2 | null | undefined): string {
  if (!room) return '';
  const cb = String(room.createdBy || '').trim();
  if (cb) return cb;
  const parts = [
    ...(Array.isArray(room.participantIds) ? room.participantIds : []),
    ...(Array.isArray(room.memberIds) ? room.memberIds : []),
  ]
    .map((x: unknown) => String(x))
    .filter(Boolean);
  const partSet = new Set(parts);
  const ow = Array.isArray(room.ownerIds) && room.ownerIds[0] ? String(room.ownerIds[0]).trim() : '';
  if (ow && (partSet.has(ow) || parts.length === 0)) return ow;
  if (parts.length === 1) return parts[0];
  const admins = Array.isArray(room.adminIds) ? room.adminIds.map((x: unknown) => String(x)).filter(Boolean) : [];
  if (admins.length >= 1) return admins[0];
  return '';
}

/**
 * 방 문서 기준 「방장」UI·저장 권한 — 1:1 DM은 `participantIds`(및 memberIds)에 포함된 양쪽 모두 방장과 동일.
 * 그 외 타입은 `resolveRoomOwnerUidV2`와 동일한 단일 소유자.
 */
export function isRoomOwnerV2(room: ChatRoomV2 | null | undefined, uid: string | null | undefined): boolean {
  if (!room || uid == null || String(uid).trim() === '') return false;
  const u = String(uid);
  if (String(room.type) === 'dm') {
    const ids = [
      ...(Array.isArray(room.participantIds) ? room.participantIds : []),
      ...(Array.isArray(room.memberIds) ? room.memberIds : []),
    ]
      .map((x: unknown) => String(x))
      .filter(Boolean);
    return new Set(ids).has(u);
  }
  const owner = resolveRoomOwnerUidV2(room);
  return !!owner && owner === u;
}

/** 방장(createdBy) 또는 adminIds(부방장 등). DM은 참여자 2인 모두 관리 권한(레거시 방에 adminIds 누락 대비). */
export function isRoomModeratorV2(room: ChatRoomV2 | null | undefined, uid: string | null | undefined): boolean {
  if (!room || uid == null || String(uid).trim() === '') return false;
  const u = String(uid);
  if (String(room.type) === 'dm') {
    const ids = [
      ...(Array.isArray(room.participantIds) ? room.participantIds : []),
      ...(Array.isArray(room.memberIds) ? room.memberIds : []),
    ]
      .map((x: unknown) => String(x))
      .filter(Boolean);
    const set = new Set(ids);
    if (set.has(u)) return true;
  }
  const owner = resolveRoomOwnerUidV2(room);
  if (owner && u === owner) return true;
  const admins = Array.isArray(room.adminIds) ? room.adminIds.map((x: unknown) => String(x)).filter(Boolean) : [];
  return admins.includes(u);
}

/** 모두에게 삭제: 본인 메시지이거나 방장/부방장 */
export function canDeleteMessageForEveryoneV2(
  room: ChatRoomV2 | null | undefined,
  viewerUid: string | null | undefined,
  messageSenderId: string | null | undefined
): boolean {
  if (!viewerUid) return false;
  if (String(messageSenderId || '') === String(viewerUid)) return true;
  return isRoomModeratorV2(room, viewerUid);
}

/** 일반 멤버가 텍스트·첨부(입력창)로 메시지를 보낼 수 있는지. DM은 항상 가능. */
export function canMemberComposeMessagesV2(room: ChatRoomV2 | null | undefined, uid: string | null | undefined): boolean {
  if (!room || uid == null || String(uid).trim() === '') return false;
  if (String(room.type) === 'dm') return true;
  if (isRoomModeratorV2(room, uid)) return true;
  if (room.permissions?.memberCanMessage === false) return false;
  if (String(room.type) === 'notice' && (room as any)?.settings?.noticeOnlyAdminWrite === true) return false;
  return true;
}

export function canMemberSendGalleryMediaV2(room: ChatRoomV2 | null | undefined, uid: string | null | undefined): boolean {
  if (!canMemberComposeMessagesV2(room, uid)) return false;
  if (isRoomModeratorV2(room, uid)) return true;
  return room?.permissions?.memberCanUploadImage !== false;
}

export function canMemberSendFilesV2(room: ChatRoomV2 | null | undefined, uid: string | null | undefined): boolean {
  if (!canMemberComposeMessagesV2(room, uid)) return false;
  if (isRoomModeratorV2(room, uid)) return true;
  return room?.permissions?.memberCanUploadFile !== false;
}

export function canMemberShareLinksV2(room: ChatRoomV2 | null | undefined, uid: string | null | undefined): boolean {
  if (!canMemberComposeMessagesV2(room, uid)) return false;
  if (isRoomModeratorV2(room, uid)) return true;
  return room?.permissions?.memberCanShareLink !== false;
}
