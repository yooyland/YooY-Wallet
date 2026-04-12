import type { Firestore } from 'firebase/firestore';
import { serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getRoomMessageDocRef } from '../firebase/roomRefs';

export type FinalizeImageMessageInput = {
  firestore: Firestore;
  roomId: string;
  messageId: string;
  senderId: string;
  localUri: string;
  remoteUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(removeUndefinedDeep) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = removeUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

export async function finalizeImageMessageSafe(input: FinalizeImageMessageInput): Promise<void> {
  const { firestore, roomId, messageId, senderId, localUri, remoteUrl, mimeType, width, height } = input;
  if (!remoteUrl) throw new Error('finalizeImageMessageSafe: remoteUrl missing');

  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  const payload = removeUndefinedDeep({
    roomId,
    senderId,
    type: 'image',
    status: 'sent',
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
    url: remoteUrl,
    thumbnailUrl: remoteUrl,
    attachment: {
      type: 'image',
      localUri,
      remoteUrl,
      url: remoteUrl,
      thumbnailUrl: remoteUrl,
      status: 'sent',
      mimeType,
      width,
      height,
    },
  });

  // eslint-disable-next-line no-console
  console.log('[IMG_SEND_WRITE_READY]', { roomId, messageId, remoteUrl });
  try {
    await updateDoc(ref, payload as any);
    // eslint-disable-next-line no-console
    console.log('[IMG_SEND_FINAL]', { roomId, messageId, mode: 'updateDoc' });
  } catch (primaryError: any) {
    // eslint-disable-next-line no-console
    console.error('[IMG_SEND_ERROR]', {
      step: 'updateDoc',
      roomId,
      messageId,
      message: String(primaryError?.message || primaryError || 'update_failed'),
    });
    await setDoc(
      ref,
      {
        ...(payload as any),
        createdAt: Date.now(),
        serverCreatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    // eslint-disable-next-line no-console
    console.log('[IMG_SEND_FINAL]', { roomId, messageId, mode: 'setDoc-merge-fallback' });
  }
}

export async function markImageMessageFailed(
  firestore: Firestore,
  roomId: string,
  messageId: string,
  errorMessage?: string
): Promise<void> {
  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  const payload = removeUndefinedDeep({
    status: 'failed',
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
    errorMessage: errorMessage || 'upload_failed',
    attachment: { status: 'failed' },
  });
  try {
    await updateDoc(ref, payload as any);
  } catch {
    await setDoc(ref, payload as any, { merge: true });
  }
}
