import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '@web/firebase/config';

const roomRef = (roomId: string) => doc(db, 'rooms', roomId);
const roomMsgRef = (roomId: string, messageId: string) => doc(db, 'roomMessages', roomId, 'items', messageId);
const userJoinedRef = (uid: string, roomId: string) => doc(db, 'users', uid, 'joinedRooms', roomId);
const roomMemberRef = (roomId: string, uid: string) => doc(db, 'roomMembers', roomId, 'members', uid);

async function resolveDisplayName(uid: string): Promise<string> {
  try {
    const s = await getDoc(doc(db, 'users', uid));
    if (!s.exists()) return uid;
    const d = s.data() as Record<string, unknown>;
    const u = String(d.username || d.displayName || d.chatName || '').trim();
    return u || uid;
  } catch {
    return uid;
  }
}

async function ensureJoinedRoomsSummaryOnSendWeb(input: {
  roomId: string;
  roomType: 'dm' | 'group' | 'ttl';
  roomTitle?: string;
  participantIds: string[];
  senderId: string;
  lastMessage: string;
  lastMessageAt: number;
}): Promise<void> {
  const { roomId, roomType, roomTitle, participantIds, senderId, lastMessage, lastMessageAt } = input;
  const now = Date.now();
  let ids = Array.from(new Set(participantIds)).filter(Boolean);
  if (ids.length === 0) {
    const rs = await getDoc(roomRef(roomId));
    const r = (rs.data() as any) || {};
    ids = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  }
  const batch = writeBatch(db);
  if (roomType === 'dm' && ids.length === 2) {
    const a = ids[0];
    const b = ids[1];
    const [an, bn] = await Promise.all([resolveDisplayName(a), resolveDisplayName(b)]);
    batch.set(userJoinedRef(a, roomId), { roomId, type: 'dm', peerId: b, peerDisplayName: bn, lastMessage, lastMessageAt, updatedAt: now } as any, { merge: true });
    batch.set(userJoinedRef(b, roomId), { roomId, type: 'dm', peerId: a, peerDisplayName: an, lastMessage, lastMessageAt, updatedAt: now } as any, { merge: true });
  } else {
    for (const uid of ids) {
      batch.set(
        userJoinedRef(uid, roomId),
        { roomId, type: roomType, title: roomTitle || undefined, lastMessage, lastMessageAt, updatedAt: now } as any,
        { merge: true }
      );
    }
  }
  batch.set(userJoinedRef(senderId, roomId), { roomId, type: roomType, lastMessage, lastMessageAt, updatedAt: now } as any, { merge: true });
  await batch.commit();
}

async function applyUnreadOnSendWeb(input: {
  roomId: string;
  senderId: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: number;
}): Promise<void> {
  const { roomId, senderId, participantIds, lastMessage, lastMessageAt } = input;
  let ids = Array.from(new Set(participantIds)).filter(Boolean);
  if (ids.length === 0) {
    const snap = await getDoc(roomRef(roomId));
    const r = (snap.data() as any) || {};
    ids = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
  }
  const others = ids.filter((uid) => uid && uid !== senderId);
  const now = Date.now();
  const batch = writeBatch(db);
  for (const uid of others) {
    batch.set(roomMemberRef(roomId, uid), { unreadCount: increment(1), updatedAt: now } as any, { merge: true });
    batch.set(userJoinedRef(uid, roomId), { unreadCount: increment(1), lastMessage, lastMessageAt, updatedAt: now } as any, { merge: true });
  }
  batch.set(userJoinedRef(senderId, roomId), { lastMessage, lastMessageAt, unreadCount: 0, updatedAt: now } as any, { merge: true });
  batch.set(roomMemberRef(roomId, senderId), { unreadCount: 0, updatedAt: now } as any, { merge: true });
  await batch.commit();
}

function isTtlRoomExploded(data: Record<string, unknown> | undefined, nowMs: number): boolean {
  if (!data || String(data.type) !== 'ttl') return false;
  const re = Number(data.roomExpiresAt);
  if (Number.isFinite(re) && re > 0 && nowMs >= re) return true;
  return false;
}

/** 앱과 동일한 메시지 문서 ID(setDoc) + joinedRooms / unread 갱신 */
export async function sendTextMessageWeb(roomId: string, senderId: string, text: string): Promise<void> {
  const t = String(text || '').trim();
  if (!t) throw new Error('empty_text');
  const rs = await getDoc(roomRef(roomId));
  if (!rs.exists()) throw new Error('room_not_found');
  const r = rs.data() as Record<string, unknown>;
  if (isTtlRoomExploded(r, Date.now())) throw new Error('ttl_room_exploded');
  const roomType = (String(r.type || 'group') === 'dm' ? 'dm' : String(r.type) === 'ttl' ? 'ttl' : 'group') as 'dm' | 'group' | 'ttl';
  const roomTitle = r.title != null ? String(r.title) : undefined;
  let participantIds = Array.isArray(r.participantIds) ? r.participantIds.map((x: unknown) => String(x)).filter(Boolean) : [];
  const messageId = crypto.randomUUID();
  const ts = Date.now();
  const msg = {
    id: messageId,
    roomId,
    senderId,
    type: 'text',
    status: 'sent',
    text: t,
    createdAt: ts,
    updatedAt: ts,
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  };
  await setDoc(roomMsgRef(roomId, messageId), msg as any, { merge: true });
  await ensureJoinedRoomsSummaryOnSendWeb({
    roomId,
    roomType,
    roomTitle,
    participantIds,
    senderId,
    lastMessage: t,
    lastMessageAt: ts,
  });
  await applyUnreadOnSendWeb({
    roomId,
    senderId,
    participantIds,
    lastMessage: t,
    lastMessageAt: ts,
  });
}

export async function clearUnreadOnEnterWeb(roomId: string, uid: string): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(roomMemberRef(roomId, uid), { unreadCount: 0, lastReadAt: now, updatedAt: now } as any, { merge: true });
  batch.set(userJoinedRef(uid, roomId), { unreadCount: 0, updatedAt: now } as any, { merge: true });
  await batch.commit();
}

async function readRoomForSend(roomId: string) {
  const rs = await getDoc(roomRef(roomId));
  if (!rs.exists()) throw new Error('room_not_found');
  const r = rs.data() as Record<string, unknown>;
  if (isTtlRoomExploded(r, Date.now())) throw new Error('ttl_room_exploded');
  const roomType = (String(r.type || 'group') === 'dm' ? 'dm' : String(r.type) === 'ttl' ? 'ttl' : 'group') as 'dm' | 'group' | 'ttl';
  const roomTitle = r.title != null ? String(r.title) : undefined;
  const participantIds = Array.isArray(r.participantIds) ? r.participantIds.map((x: unknown) => String(x)).filter(Boolean) : [];
  return { roomType, roomTitle, participantIds };
}

/** chatMedia/{uid}/chatv2/{roomId}/... — 앱 mediaService 와 동일 패턴 */
export async function sendFileOrImageWeb(roomId: string, senderId: string, file: File): Promise<void> {
  const { roomType, roomTitle, participantIds } = await readRoomForSend(roomId);
  const messageId = crypto.randomUUID();
  const ext = (file.name.split('.').pop() || 'bin').slice(0, 12);
  const path = `chatMedia/${senderId}/chatv2/${roomId}/${Date.now()}_${messageId}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type || undefined });
  const remoteUrl = await getDownloadURL(ref);
  const ts = Date.now();
  const isImage = /^image\//i.test(file.type || '');
  const isVideo = /^video\//i.test(file.type || '');
  const type = isImage ? 'image' : isVideo ? 'video' : 'file';
  const lastPreview = isImage ? '[이미지]' : isVideo ? '[동영상]' : `[파일] ${file.name}`;
  const msg: Record<string, unknown> = {
    id: messageId,
    roomId,
    senderId,
    type,
    status: 'sent',
    url: remoteUrl,
    filename: file.name,
    mimeType: file.type || undefined,
    size: file.size,
    createdAt: ts,
    updatedAt: ts,
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
    attachment: {
      id: messageId,
      type: isImage ? 'image' : isVideo ? 'video' : 'file',
      originalName: file.name,
      remoteUrl,
      url: remoteUrl,
      thumbnailUrl: isImage ? remoteUrl : undefined,
      status: 'sent',
      mimeType: file.type || undefined,
      size: file.size,
    },
  };
  if (isImage) {
    msg.thumbnailUrl = remoteUrl;
  }
  await setDoc(roomMsgRef(roomId, messageId), msg as any, { merge: true });
  await ensureJoinedRoomsSummaryOnSendWeb({
    roomId,
    roomType,
    roomTitle,
    participantIds,
    senderId,
    lastMessage: lastPreview,
    lastMessageAt: ts,
  });
  await applyUnreadOnSendWeb({
    roomId,
    senderId,
    participantIds,
    lastMessage: lastPreview,
    lastMessageAt: ts,
  });
}
