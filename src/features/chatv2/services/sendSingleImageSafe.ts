import type { Firestore } from 'firebase/firestore';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { getRoomMessageDocRef } from '../firebase/roomRefs';
import { finalizeImageMessageSafe, markImageMessageFailed } from './messageFinalizeSafe';
import { uploadMediaToStorageSafe } from './mediaUploadSafe';

export type SendSingleImageInput = {
  firestore: Firestore;
  storage: FirebaseStorage;
  roomId: string;
  messageId: string;
  senderId: string;
  localUri: string;
  mimeType?: string;
  fileName?: string;
  width?: number;
  height?: number;
};

export async function sendSingleImageSafe(input: SendSingleImageInput): Promise<void> {
  const { firestore, storage, roomId, messageId, senderId, localUri, mimeType, fileName, width, height } = input;
  const msgRef = getRoomMessageDocRef(firestore, roomId, messageId);

  await setDoc(
    msgRef,
    {
      id: messageId,
      roomId,
      senderId,
      type: 'image',
      status: 'sending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverCreatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
      attachment: {
        type: 'image',
        localUri,
        status: 'sending',
        mimeType,
        width,
        height,
      },
    },
    { merge: true }
  );

  // eslint-disable-next-line no-console
  console.log('[IMG_SEND_PLACEHOLDER]', { roomId, messageId, localUri });

  try {
    const upload = await uploadMediaToStorageSafe({
      storage,
      roomId,
      messageId,
      senderId,
      localUri,
      mimeType,
      fileName,
      onProgress: (progress) => {
        // eslint-disable-next-line no-console
        console.log('[IMG_SEND_UPLOAD_PROGRESS]', { roomId, messageId, progress });
      },
    });

    await finalizeImageMessageSafe({
      firestore,
      roomId,
      messageId,
      senderId,
      localUri: upload.localUri,
      remoteUrl: upload.remoteUrl,
      mimeType: upload.contentType,
      width,
      height,
    });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('[IMG_SEND_ERROR]', {
      step: 'sendSingleImageSafe',
      roomId,
      messageId,
      message: String(error?.message || error || 'image_send_failed'),
    });
    await markImageMessageFailed(firestore, roomId, messageId, String(error?.message || 'image_send_failed'));
    throw error;
  }
}
