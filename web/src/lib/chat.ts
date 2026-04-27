import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@web/firebase/config';
import { paths } from '@web/lib/paths';

export type JoinedRoomRow = {
  id: string;
  roomId: string;
  type: string;
  title?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount?: number;
};

export function subscribeJoinedRooms(uid: string, cb: (rows: JoinedRoomRow[]) => void) {
  const ref = collection(db, paths.userJoinedRooms(uid));
  return onSnapshot(ref, (snap) => {
    const rows: JoinedRoomRow[] = [];
    snap.forEach((d) => {
      const v = d.data() as Record<string, unknown>;
      const roomId = String(v.roomId || d.id);
      rows.push({
        id: d.id,
        roomId,
        type: String(v.type || 'group'),
        title: v.title != null ? String(v.title) : undefined,
        lastMessage: v.lastMessage != null ? String(v.lastMessage) : undefined,
        lastMessageAt: typeof v.lastMessageAt === 'number' ? v.lastMessageAt : undefined,
        unreadCount: typeof v.unreadCount === 'number' ? v.unreadCount : undefined,
      });
    });
    rows.sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0));
    cb(rows);
  });
}

export type ChatMsg = {
  id: string;
  senderId?: string;
  type?: string;
  text?: string;
  createdAt?: number;
  status?: string;
  url?: string;
  thumbnailUrl?: string;
  filename?: string;
  readBy?: Record<string, number>;
  attachment?: { remoteUrl?: string; thumbnailUrl?: string; type?: string; originalName?: string };
};

export function subscribeRoomMessages(roomId: string, cb: (msgs: ChatMsg[]) => void) {
  const col = collection(db, 'roomMessages', roomId, 'items');
  return onSnapshot(col, (snap) => {
    const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as ChatMsg[];
    arr.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    cb(arr.slice(-150));
  });
}

export { sendTextMessageWeb, sendFileOrImageWeb, clearUnreadOnEnterWeb } from '@web/lib/chatSend';

export async function touchMessageRead(roomId: string, messageId: string, readerUid: string) {
  try {
    const r = doc(db, 'roomMessages', roomId, 'items', messageId);
    await updateDoc(r, { [`readBy.${readerUid}`]: Date.now() } as Record<string, unknown>);
  } catch {
    /* 규칙/필드 제한 시 무시 */
  }
}
