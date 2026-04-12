import { getDoc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { ChatMessageV2 } from '../core/messageSchema';
import { getRoomMessageDocRef } from '../firebase/roomRefs';

export async function applyMessageReactionV2(input: {
  firestore: Firestore;
  roomId: string;
  messageId: string;
  uid: string;
  emoji: string;
}): Promise<void> {
  const { firestore, roomId, messageId, uid, emoji } = input;
  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as any;
  const prevMeta = (data?.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>;
  const prevReactions = { ...((prevMeta.reactions as Record<string, string>) || {}) };
  const em = String(emoji || '').trim();
  if (!em) {
    delete prevReactions[String(uid)];
  } else {
    prevReactions[String(uid)] = em;
  }
  await setDoc(
    ref,
    {
      updatedAt: Date.now(),
      meta: {
        ...prevMeta,
        reactions: prevReactions,
      },
    } as any,
    { merge: true }
  );
}

export async function setMessageHiddenForMeV2(input: {
  firestore: Firestore;
  roomId: string;
  messageId: string;
  uid: string;
  hidden: boolean;
}): Promise<void> {
  const { firestore, roomId, messageId, uid, hidden } = input;
  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as any;
  const prevMeta = (data?.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>;
  const prevH = { ...((prevMeta.hiddenFor as Record<string, boolean>) || {}) };
  if (hidden) prevH[String(uid)] = true;
  else delete prevH[String(uid)];
  await setDoc(
    ref,
    {
      updatedAt: Date.now(),
      meta: {
        ...prevMeta,
        hiddenFor: prevH,
      },
    } as any,
    { merge: true }
  );
}

export function getMessageReactionsMap(msg: ChatMessageV2): Record<string, string> {
  const r = (msg.meta as any)?.reactions;
  if (!r || typeof r !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function isMessageHiddenForUser(msg: ChatMessageV2, uid: string): boolean {
  const h = (msg.meta as any)?.hiddenFor;
  if (!h || typeof h !== 'object') return false;
  return !!h[String(uid)];
}
