import type { FirebaseStorage } from 'firebase/storage';
import { uploadMediaToStorageV2 } from './mediaService';

export type UploadMediaToStorageSafeInput = {
  storage: FirebaseStorage;
  roomId: string;
  messageId: string;
  senderId?: string;
  localUri: string;
  mimeType?: string;
  fileName?: string;
  onProgress?: (progress: number) => void;
};

export type UploadMediaToStorageSafeResult = {
  localUri: string;
  remoteUrl: string;
  contentType?: string;
  fileName?: string;
};

export async function uploadMediaToStorageSafe(
  input: UploadMediaToStorageSafeInput
): Promise<UploadMediaToStorageSafeResult> {
  const { storage, roomId, messageId, localUri, mimeType, fileName, senderId, onProgress } = input;
  const uploaded = await uploadMediaToStorageV2({
    storage,
    roomId,
    messageId,
    localUri,
    mimeType,
    filename: fileName,
    senderId: String(senderId || 'system'),
  });
  const remoteUrl = String(uploaded?.remoteUrl || uploaded?.url || '').trim();
  if (!remoteUrl) throw new Error('uploadMediaToStorageSafe: empty remoteUrl');
  try {
    onProgress?.(1);
  } catch {
    // noop
  }
  return {
    localUri,
    remoteUrl,
    contentType: uploaded?.mimeType || mimeType,
    fileName: uploaded?.filename || fileName,
  };
}
