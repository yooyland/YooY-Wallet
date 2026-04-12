/**
 * Chat v2 — rooms / roomMessages / roomMembers 경로는 여기서만 생성 (roomId 검증 단일화).
 */
import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from 'firebase/firestore';
import { assertValidRoomId, logRoomIdWrite } from '../utils/roomId';

export function getRoomDocRef(db: Firestore, roomId: string): DocumentReference {
  const id = assertValidRoomId(roomId, 'getRoomDocRef');
  logRoomIdWrite('getRoomDocRef', id, `rooms/${id}`);
  return doc(db, 'rooms', id);
}

/** roomMessages/{roomId}/items */
export function getRoomMessagesItemsColRef(db: Firestore, roomId: string): CollectionReference {
  const id = assertValidRoomId(roomId, 'getRoomMessagesItemsColRef');
  logRoomIdWrite('getRoomMessagesItemsColRef', id, `roomMessages/${id}/items`);
  return collection(db, 'roomMessages', id, 'items');
}

/** roomMembers/{roomId}/members */
export function getRoomMembersColRef(db: Firestore, roomId: string): CollectionReference {
  const id = assertValidRoomId(roomId, 'getRoomMembersColRef');
  logRoomIdWrite('getRoomMembersColRef', id, `roomMembers/${id}/members`);
  return collection(db, 'roomMembers', id, 'members');
}

export function getRoomMemberDocRef(db: Firestore, roomId: string, memberUid: string): DocumentReference {
  const rid = assertValidRoomId(roomId, 'getRoomMemberDocRef');
  const uid = String(memberUid || '').trim();
  if (!uid) throw new Error('invalid_member_uid');
  logRoomIdWrite('getRoomMemberDocRef', rid, `roomMembers/${rid}/members/${uid}`);
  return doc(db, 'roomMembers', rid, 'members', uid);
}

export function getRoomMessageDocRef(db: Firestore, roomId: string, messageId: string): DocumentReference {
  const rid = assertValidRoomId(roomId, 'getRoomMessageDocRef');
  const mid = String(messageId || '').trim();
  if (!mid) throw new Error('invalid_message_id');
  logRoomIdWrite('getRoomMessageDocRef', rid, `roomMessages/${rid}/items/${mid}`);
  return doc(db, 'roomMessages', rid, 'items', mid);
}

/** users/{uid}/joinedRooms/{roomId} */
export function getUserJoinedRoomDocRef(db: Firestore, uid: string, roomId: string): DocumentReference {
  const id = assertValidRoomId(roomId, 'getUserJoinedRoomDocRef');
  const u = String(uid || '').trim();
  if (!u) throw new Error('invalid_uid');
  logRoomIdWrite('getUserJoinedRoomDocRef', id, `users/${u}/joinedRooms/${id}`);
  return doc(db, 'users', u, 'joinedRooms', id);
}

/** users/{uid}/chatRoomPrefs/{roomId} — 상위 users 규칙으로 본인만 읽기/쓰기 (평면 userRoomPreferences 룰 이슈 회피) */
export function getUserRoomPreferenceDocRef(db: Firestore, uid: string, roomId: string): DocumentReference {
  const id = assertValidRoomId(roomId, 'getUserRoomPreferenceDocRef');
  const u = String(uid || '').trim();
  if (!u) throw new Error('invalid_uid');
  logRoomIdWrite('getUserRoomPreferenceDocRef', id, `users/${u}/chatRoomPrefs/${id}`);
  return doc(db, 'users', u, 'chatRoomPrefs', id);
}

/** 레거시 userRoomPreferences/{uid}_{roomId} — 마이그레이션용 읽기만 */
export function getLegacyUserRoomPreferenceFlatDocRef(db: Firestore, uid: string, roomId: string): DocumentReference {
  const id = assertValidRoomId(roomId, 'getLegacyUserRoomPreferenceFlatDocRef');
  const u = String(uid || '').trim();
  if (!u) throw new Error('invalid_uid');
  return doc(db, 'userRoomPreferences', `${u}_${id}`);
}

/** v1 브리지: rooms/{roomId}/messages (items 아님) */
export function getLegacyRoomMessagesColRef(db: Firestore, roomId: string): CollectionReference {
  const id = assertValidRoomId(roomId, 'getLegacyRoomMessagesColRef');
  logRoomIdWrite('getLegacyRoomMessagesColRef', id, `rooms/${id}/messages`);
  return collection(db, 'rooms', id, 'messages');
}

/* TODO(roomId): Firestore room 경로는 위 helper로 통일됨. 남은 점검 — (1) v1/레거시 chat 코드가 rooms/{id}에 직접 쓰는지
 * (2) Cloud Functions/Admin SDK에서 roomId 검증 (3) joinedRooms 문서의 roomId 필드가 DB에서 수동 오염된 행은 목록에서 스킵됨(roomListService) */
