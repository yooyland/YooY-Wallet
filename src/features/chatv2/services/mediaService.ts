import { Platform } from 'react-native';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable, uploadString } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import type { UploadMetadata } from 'firebase/storage';
import type { UploadInputV2, UploadResultV2 } from '../core/uploadFlow';
import { yyChatFlow } from '../core/chatFlowLog';
import { ensureAppCheckReady, ensureAuthedUid } from '@/lib/firebase';
import { assertValidRoomId } from '../utils/roomId';

function logUpload(step: string, payload: Record<string, any>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[UPLOAD_${step}]`, payload);
  } catch {}
}

function logUploadFail(step: string, error: any, payload?: Record<string, any>) {
  try {
    // eslint-disable-next-line no-console
    console.error('[UPLOAD_FAIL]', {
      step,
      error: String(error?.message || error || 'upload_failed'),
      code: String(error?.code || ''),
      ...(payload || {}),
    });
  } catch {}
}

function guessExtForSafeUpload(mimeType?: string, fileName?: string): string {
  if (fileName?.includes('.')) return fileName.split('.').pop() || 'bin';
  switch (String(mimeType || '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'video/mp4':
      return 'mp4';
    case 'audio/mpeg':
      return 'mp3';
    default:
      return 'bin';
  }
}

function guessContentTypeForSafeUpload(uri: string, mimeType?: string): string {
  if (mimeType) return mimeType;
  const lower = String(uri || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

function safeUploadFileName(messageId: string, fileName?: string, mimeType?: string): string {
  const raw = String(fileName || '').trim();
  if (raw) return raw;
  const ext = guessExtForSafeUpload(mimeType, fileName);
  return `${String(messageId || 'upload')}.${ext}`;
}

async function ensureUploadCacheDirV2(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FS = require('expo-file-system/legacy');
  const dir = `${FS.cacheDirectory}chatv2-upload-cache/`;
  const info = await FS.getInfoAsync(dir);
  if (!info?.exists) await FS.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

async function normalizeUploadUriSafe(inputUri: string, fileName?: string): Promise<string> {
  if (!inputUri || typeof inputUri !== 'string') throw new Error('normalizeUploadUri: invalid localUri');
  const uri = String(inputUri).trim();
  if (uri.startsWith('file://')) return uri;
  const needsCopy = uri.startsWith('content://') || uri.startsWith('ph://') || uri.startsWith('assets-library://');
  if (!needsCopy) return uri;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FS = require('expo-file-system/legacy');
  const dir = await ensureUploadCacheDirV2();
  const targetName = `${Date.now()}-${String(fileName || 'upload.bin').replace(/[\\/:*?"<>|]/g, '_')}`;
  const targetUri = `${dir}${targetName}`;
  await FS.copyAsync({ from: uri, to: targetUri });
  return targetUri;
}

async function uriToBlob(localFileUri: string): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error(`uriToBlob failed: ${localFileUri}`));
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.responseType = 'blob';
    xhr.open('GET', localFileUri, true);
    xhr.send();
  });
}

function safeCloseBlobV2(blob: Blob | null | undefined) {
  try {
    const b = blob as Blob & { close?: () => void };
    b?.close?.();
  } catch {
    /* noop */
  }
}

async function uploadMediaToStorageSafeV2(input: UploadInputV2 & { storage: FirebaseStorage }): Promise<UploadResultV2> {
  const { storage, roomId, messageId, localUri, mimeType, filename, senderId } = input;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FS = require('expo-file-system/legacy');
  const finalFileName = safeUploadFileName(messageId, filename, mimeType);
  const normalizedUri = await normalizeUploadUriSafe(String(localUri || ''), finalFileName);
  const contentType = guessContentTypeForSafeUpload(normalizedUri, mimeType);
  const info = await FS.getInfoAsync(normalizedUri, { size: true });
  if (!info?.exists) throw new Error(`uploadMediaToStorageSafe: file does not exist: ${normalizedUri}`);

  const safeSenderId = String(senderId || '').trim();
  if (!safeSenderId) throw new Error('uploadMediaToStorageSafe: senderId missing');
  // 기존 버킷 구조 정렬: chatMedia/{uid}/... 아래에 chatv2 room media 저장
  const storagePath = `chatMedia/${safeSenderId}/chatv2/${roomId}/${Date.now()}_${messageId}_${finalFileName}`;
  const ref = storageRef(storage, storagePath);
  let blob: Blob | null = null;
  try {
    logUpload('START', {
      roomId,
      messageId,
      localUri: String(localUri || ''),
      normalizedUri,
      localUriScheme: (String(localUri || '').match(/^([a-z]+):\/\//i) || [])[1] || 'unknown',
      contentType,
      size: (info as any)?.size,
      platform: Platform.OS,
      mode: 'safe_resumable',
    });

    blob = await uriToBlob(normalizedUri);
    const metadata: UploadMetadata = {
      contentType,
      customMetadata: {
        roomId: String(roomId),
        messageId: String(messageId),
        senderId: safeSenderId,
        originalFileName: finalFileName,
      },
    };
    const task = uploadBytesResumable(ref, blob, metadata);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => {
            const total = snapshot.totalBytes || 0;
            const transferred = snapshot.bytesTransferred || 0;
            const progress = total > 0 ? transferred / total : 0;
            yyChatFlow('upload.progress', { roomId, messageId, transferred, total, progress, state: snapshot.state });
          },
          (error) => reject(error),
          () => resolve()
        );
      }),
      240_000,
      'safe_resumable_upload'
    );
    const downloadURL = await withTimeout(getDownloadURL(ref), 45_000, 'safe_getDownloadURL');
    if (!downloadURL) throw new Error('uploadMediaToStorageSafe: empty downloadURL');
    logUpload('SUCCESS', {
      roomId,
      messageId,
      localUri: String(localUri || ''),
      normalizedUri,
      downloadURL: String(downloadURL || ''),
      mode: 'safe_resumable',
    });
    return {
      remoteUrl: String(downloadURL),
      url: String(downloadURL),
      mimeType: contentType,
      filename: finalFileName,
      size: (info as any)?.size,
    };
  } catch (e: any) {
    logUploadFail('SAFE_RESUMABLE', e, {
      roomId,
      messageId,
      localUri: String(localUri || ''),
      normalizedUri,
    });
    throw e;
  } finally {
    safeCloseBlobV2(blob);
  }
}

async function ensureAuthForUpload(roomId: string, messageId: string): Promise<void> {
  try {
    await ensureAuthedUid();
  } catch (e: any) {
    const m = String(e?.message || e || '');
    yyChatFlow('upload.auth.fail', { roomId, messageId, message: m });
    if (m === 'auth-required') throw new Error('auth-required:로그인이 필요합니다');
    if (m === 'auth-not-ready') throw new Error('auth-not-ready:인증을 확인하는 중입니다');
    throw e;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t = Math.max(1, Number(ms || 0));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout:${label}:${t}ms`)), t);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

const extFrom = (filenameOrUri?: string) => {
  const s = String(filenameOrUri || '');
  const m = s.match(/\.([a-z0-9]{1,8})(\?|#|$)/i);
  return (m?.[1] || '').toLowerCase();
};

const mimeFromExt = (ext: string) => {
  if (!ext) return 'application/octet-stream';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === '3gp') return 'video/3gpp';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'opus') return 'audio/opus';
  if (ext === 'amr') return 'audio/amr';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'zip') return 'application/zip';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'application/octet-stream';
};

/** 네이티브에서 file:// 전체를 base64로 읽는 상한 (초과 시 Blob 경로만 시도, 실패 시 안내 오류) */
const MAX_NATIVE_BASE64_BYTES = 36 * 1024 * 1024;

async function readBase64Compat(fileUri: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FS = require('expo-file-system/legacy');

  // New expo-file-system API (권장): File(...).base64()
  try {
    const FileCtor = FS?.File;
    if (FileCtor) {
      const f = new FileCtor(String(fileUri));
      if (typeof f?.base64 === 'function') {
        const out = await f.base64();
        if (typeof out === 'string' && out.length > 0) return out;
      }
    }
  } catch {
    // fallback below
  }

  // Legacy fallback: 일부 구환경/호환 레이어
  try {
    if (typeof FS?.readAsStringAsync === 'function') {
      const enc = FS?.EncodingType?.Base64 ?? 'base64';
      const out = await FS.readAsStringAsync(String(fileUri), { encoding: enc });
      if (typeof out === 'string' && out.length > 0) return out;
    }
  } catch {
    // handled by final throw
  }

  throw new Error('expo-file-system base64 read unavailable');
}

async function readAsDataUrl(localUri: string, mimeType: string): Promise<{ dataUrl: string; size?: number }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require('expo-file-system/legacy');
  let readUri = String(localUri);
  try {
    // Native library URIs can fail; copy to cache first
    // - Android: content://
    // - iOS: ph://, assets-library://
    if (/^(content|ph|assets-library):\/\//i.test(readUri) && FileSystem?.cacheDirectory && FileSystem?.copyAsync) {
      const ext = extFrom(readUri) || 'bin';
      const dest = `${FileSystem.cacheDirectory}yy_chatv2_${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: readUri, to: dest });
      readUri = dest;
    }
  } catch {}

  const b64 = await readBase64Compat(readUri);
  const size = (() => {
    try {
      // approximate base64 -> bytes
      return Math.floor((b64.length * 3) / 4);
    } catch {
      return undefined;
    }
  })();
  return { dataUrl: `data:${mimeType};base64,${b64}`, size };
}

async function tryFetchBlob(localUri: string): Promise<{ blob: Blob; size?: number; finalUri?: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let FileSystem: any = null;
  try {
    FileSystem = require('expo-file-system/legacy');
  } catch {
    FileSystem = null;
  }

  let uri = String(localUri);
  try {
    if (/^(content|ph|assets-library):\/\//i.test(uri) && FileSystem?.cacheDirectory && FileSystem?.copyAsync) {
      const ext = extFrom(uri) || 'bin';
      const dest = `${FileSystem.cacheDirectory}yy_chatv2_${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    }
  } catch {}

  try {
    const resp = await withTimeout(fetch(uri), 45_000, 'fetch_blob');
    const blob = await withTimeout(resp.blob(), 45_000, 'resp_blob');
    const size = typeof (blob as any)?.size === 'number' ? (blob as any).size : undefined;
    return { blob, size, finalUri: uri };
  } catch {
    return null;
  }
}

function normalizeErr(e: any): { code: string; message: string } {
  const code = String(e?.code || '').trim();
  const message = String(e?.message || e || 'unknown_error').trim();
  return { code: code || 'upload_failed', message };
}

/** getDownloadURL 결과를 `remoteUrl` + `url` 동시 세팅 (UploadResultV2 필수 필드) */
function wrapUploadResult(p: { url: string; mimeType?: string; filename?: string; size?: number }): UploadResultV2 {
  const u = String(p.url || '').trim();
  return { url: u, remoteUrl: u, mimeType: p.mimeType, filename: p.filename, size: p.size };
}

async function normalizeUploadUri(input: { localUri: string; roomId: string; messageId: string }) {
  const { localUri, roomId, messageId } = input;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require('expo-file-system/legacy');
  let normalized = String(localUri || '').trim();
  if (!normalized) throw new Error('file_not_found:empty_uri');
  // Android 등에서 절대경로만 오는 경우 (스킴 없음)
  if (Platform.OS !== 'web' && normalized.startsWith('/') && !/^\/\//.test(normalized) && !/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    normalized = `file://${normalized}`;
  }
  const scheme = ((/^([a-z]+):\/\//i.exec(normalized) || [])[1] || '').toLowerCase();
  yyChatFlow('upload.uri.original', { roomId, messageId, uri: normalized.slice(0, 220), scheme });

  if (scheme === 'content' || scheme === 'ph' || scheme === 'assets-library') {
    if (!FileSystem?.cacheDirectory || !FileSystem?.copyAsync) {
      throw new Error(`unsupported_uri_scheme:${scheme}:copy_async_missing`);
    }
    const ext = extFrom(normalized) || 'bin';
    const copied = `${FileSystem.cacheDirectory}yy_chatv2_${Date.now()}_${messageId}.${ext}`;
    await FileSystem.copyAsync({ from: normalized, to: copied });
    normalized = copied;
    yyChatFlow('upload.uri.copied_cache', { roomId, messageId, cacheUri: normalized.slice(0, 220) });
  }

  if (!/^file:\/\//i.test(normalized) && !/^https?:\/\//i.test(normalized) && !/^data:/i.test(normalized) && !/^blob:/i.test(normalized)) {
    throw new Error(`unsupported_uri_scheme:${scheme || 'unknown'}`);
  }

  let fileSize: number | undefined;
  let fileName: string | undefined;
  try {
    const info = await FileSystem.getInfoAsync(normalized, { size: true });
    fileSize = typeof info?.size === 'number' ? info.size : undefined;
  } catch {}
  try {
    fileName = normalized.split('/').pop()?.split('?')[0];
  } catch {}
  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize)) {
    try {
      const info2 = await FileSystem.getInfoAsync(normalized, { size: true } as any);
      if (typeof (info2 as any)?.size === 'number') fileSize = (info2 as any).size;
    } catch {}
  }
  /** Samsung 등: cache file:// 에서 getInfoAsync 가 size 를 못 줄 때 react-native-blob-util stat 폴백 */
  if ((typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) && /^file:\/\//i.test(normalized)) {
    try {
      const RNBU = require('react-native-blob-util');
      const def = RNBU?.default ?? RNBU;
      const pathOnly = String(normalized).replace(/^file:\/\//, '');
      const st = await def.stat(pathOnly);
      if (typeof st?.size === 'number' && Number.isFinite(st.size) && st.size > 0) fileSize = st.size;
    } catch {}
  }
  yyChatFlow('upload.uri.normalized', { roomId, messageId, normalizedUri: normalized.slice(0, 220), fileName, fileSize });
  return { normalizedUri: normalized, fileSize, fileName };
}

/** 동영상: 로컬에서 프레임 캡처 후 Storage에 별도 업로드 → 말풍선·목록에서 즉시 썸네일 표시 */
async function attachVideoThumbnailIfNeeded(input: {
  storage: FirebaseStorage;
  senderId: string;
  roomId: string;
  messageId: string;
  uploadUri: string;
  kind: 'image' | 'video' | 'file';
  base: UploadResultV2;
}): Promise<UploadResultV2> {
  if (input.kind !== 'video' || input.base.thumbnailUrl) return input.base;
  if (Platform.OS === 'web') return input.base;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const VideoThumbnails = require('expo-video-thumbnails');
    const { uri: thumbLocal } = await VideoThumbnails.getThumbnailAsync(String(input.uploadUri), { time: 900 });
    if (!thumbLocal) return input.base;
    const thumbRef = storageRef(
      input.storage,
      `chatMedia/${input.senderId}/chatv2/${input.roomId}/${Date.now()}_${input.messageId}_thumb.jpg`
    );
    const tb = await tryFetchBlob(String(thumbLocal));
    const sz =
      tb?.blob != null
        ? Math.max(
            0,
            Number(
              typeof tb.size === 'number'
                ? tb.size
                : typeof (tb.blob as any)?.size === 'number'
                  ? (tb.blob as any).size
                  : 0
            )
          )
        : 0;
    if (!tb?.blob || sz < 32) return input.base;
    await withTimeout(uploadBytes(thumbRef, tb.blob), 120_000, 'uploadBytes_thumb');
    const thumbnailUrl = await withTimeout(getDownloadURL(thumbRef), 45_000, 'getDownloadURL_thumb');
    yyChatFlow('storage.thumb.upload.ok', { roomId: input.roomId, messageId: input.messageId });
    return { ...input.base, thumbnailUrl };
  } catch {
    return input.base;
  }
}

/**
 * Upload local media to Firebase Storage.
 * - Supports file:// / content:// / data: / blob: (web)
 * - Returns a final HTTPS downloadURL.
 *
 * Thumbnail generation is optional and can be added later.
 */
export async function uploadMediaToStorageV2(input: UploadInputV2 & { storage: FirebaseStorage }): Promise<UploadResultV2> {
  assertValidRoomId(input.roomId, 'uploadMediaToStorageV2');
  await ensureAuthForUpload(input.roomId, input.messageId);
  yyChatFlow('upload.appcheck.check.start', { roomId: input.roomId, messageId: input.messageId, platform: Platform.OS });
  const isProd = (() => {
    try {
      // eslint-disable-next-line no-undef
      return typeof __DEV__ !== 'undefined' ? !__DEV__ : false;
    } catch {
      return false;
    }
  })();
  try {
    await ensureAppCheckReady();
    yyChatFlow('upload.appcheck.check.ok', { roomId: input.roomId, messageId: input.messageId, platform: Platform.OS });
  } catch (e: any) {
    if (isProd) {
      yyChatFlow('upload.appcheck.check.fail', {
        roomId: input.roomId,
        messageId: input.messageId,
        platform: Platform.OS,
        mode: 'strict_prod',
        error: String(e?.message || e || 'appcheck_not_ready'),
      });
      throw e;
    }
    // App Check 준비 실패로 업로드를 중단하지 않는다(실제 전달 우선).
    yyChatFlow('upload.appcheck.soft_fail', {
      roomId: input.roomId,
      messageId: input.messageId,
      error: String(e?.message || e || 'appcheck_not_ready'),
    });
    try {
      // eslint-disable-next-line no-console
      console.warn('[UPLOAD_APPCHECK_SOFT_FAIL]', {
        roomId: input.roomId,
        messageId: input.messageId,
        error: String(e?.message || e || 'appcheck_not_ready'),
      });
    } catch {}
  }
  const { storage, localUri, senderId, roomId, messageId } = input;
  const normalized = await normalizeUploadUri({ localUri: String(localUri || ''), roomId, messageId });
  const uploadUri = normalized.normalizedUri;
  const filename = String(input.filename || normalized.fileName || '').trim() || undefined;
  const ext = extFrom(filename || localUri) || 'bin';
  const mimeType = String(input.mimeType || mimeFromExt(ext));
  const scheme = (() => {
    try {
      const s = String(localUri || '');
      const m = /^([a-z]+):\/\//i.exec(s);
      return m?.[1] || '';
    } catch {
      return '';
    }
  })();
  logUpload('START', {
    roomId,
    messageId,
    localUri: String(localUri || ''),
    localUriScheme: scheme || 'unknown',
    mimeType,
    filename,
  });

  const extLower = (ext || '').toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
  const videoExts = ['mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp', 'avi'];
  const mimeLower = String(mimeType || '').toLowerCase();
  const nativeFileKind: 'image' | 'video' | 'file' = (() => {
    if (mimeLower.startsWith('image/') || (imageExts.includes(extLower) && !mimeLower.startsWith('video/'))) return 'image';
    if (mimeLower.startsWith('video/') || videoExts.includes(extLower)) return 'video';
    if (mimeLower.startsWith('audio/') || ['m4a', 'mp3', 'aac', 'wav', 'opus', 'caf', 'amr', 'flac', 'ogg'].includes(extLower)) return 'file';
    return 'file';
  })();

  if (Platform.OS !== 'web') {
    // Native 1차: 안전 경로(normalizeUploadUri -> uriToBlob -> uploadBytesResumable -> getDownloadURL)
    // Native 2차: 실패 시 기존 레거시 업로드 경로로 자동 폴백
    try {
      return await uploadMediaToStorageSafeV2(input);
    } catch (e: any) {
      logUploadFail('SAFE_PRIMARY_FALLBACK', e, {
        roomId,
        messageId,
        localUri: String(localUri || ''),
        localUriScheme: scheme || 'unknown',
      });
      yyChatFlow('storage.safe.fallback.legacy', {
        roomId,
        messageId,
        reason: String(e?.message || e || 'safe_upload_failed'),
      });
      // continue to legacy path below
    }
  }

  const path = `chatMedia/${senderId}/chatv2/${roomId}/${Date.now()}_${messageId}.${ext}`;
  const ref = storageRef(storage, path);
  yyChatFlow('storage.prepare', { roomId, messageId, scheme, ext, mimeType, filename, fileSize: normalized.fileSize, path });
  yyChatFlow('storage.upload.start', { roomId, messageId, mimeType, fileName: filename, fileSize: normalized.fileSize, path });

  // data: URL
  if (/^data:/i.test(uploadUri)) {
    yyChatFlow('storage.uploadString.data_url.start', { roomId, messageId });
    try {
      await withTimeout(uploadString(ref, String(uploadUri), 'data_url'), 120_000, 'uploadString_data_url');
      const url = await withTimeout(getDownloadURL(ref), 45_000, 'getDownloadURL');
      logUpload('SUCCESS', {
        roomId,
        messageId,
        localUri: String(localUri || ''),
        localUriScheme: scheme || 'unknown',
        downloadURL: String(url || ''),
        mode: 'data_url',
      });
      yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'data_url' });
      yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(url || '').slice(0, 120) });
      return await attachVideoThumbnailIfNeeded({
        storage,
        senderId,
        roomId,
        messageId,
        uploadUri,
        kind: nativeFileKind,
        base: wrapUploadResult({ url, mimeType, filename }),
      });
    } catch (e: any) {
      const ne = normalizeErr(e);
      logUploadFail('DATA_URL', e, {
        roomId,
        messageId,
        localUri: String(localUri || ''),
        localUriScheme: scheme || 'unknown',
      });
      yyChatFlow('storage.error', { roomId, messageId, code: ne.code, message: ne.message });
      throw new Error(`${ne.code}:${ne.message}`);
    }
  }

  // web blob:
  if (Platform.OS === 'web' && /^blob:/i.test(uploadUri)) {
    yyChatFlow('storage.uploadBytes.blob.start', { roomId, messageId });
    try {
      const resp = await withTimeout(fetch(String(uploadUri)), 45_000, 'fetch_web_blob');
      const blob = await withTimeout(resp.blob(), 45_000, 'resp_web_blob');
      await withTimeout(uploadBytes(ref, blob), 180_000, 'uploadBytes_web');
      const url = await withTimeout(getDownloadURL(ref), 45_000, 'getDownloadURL');
      logUpload('SUCCESS', {
        roomId,
        messageId,
        localUri: String(localUri || ''),
        localUriScheme: scheme || 'unknown',
        downloadURL: String(url || ''),
        mode: 'blob_web',
      });
      yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'blob_web', size: blob.size });
      yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(url || '').slice(0, 120) });
      return await attachVideoThumbnailIfNeeded({
        storage,
        senderId,
        roomId,
        messageId,
        uploadUri,
        kind: nativeFileKind,
        base: wrapUploadResult({ url, mimeType, filename, size: blob.size }),
      });
    } catch (e: any) {
      const ne = normalizeErr(e);
      logUploadFail('BLOB_WEB', e, {
        roomId,
        messageId,
        localUri: String(localUri || ''),
        localUriScheme: scheme || 'unknown',
      });
      yyChatFlow('storage.error', { roomId, messageId, code: ne.code, message: ne.message });
      throw new Error(`${ne.code}:${ne.message}`);
    }
  }

  /**
   * RN: fetch(file://) → Blob 이 비어 있거나 uploadBytes 와 맞지 않는 경우가 많음.
   * - 사진: 작은 파일은 base64가 빠를 수 있음 → base64 우선, 실패 시 Blob.
   * - PDF·문서·영상: 전체 base64는 메모리/타임아웃/uploadString 한도로 실패하기 쉬움 → **Blob(uploadBytes) 먼저**, 그다음 base64(한도 내).
   */
  const tryNativeBlobUpload = async (): Promise<UploadResultV2 | null> => {
    const blobOut = await tryFetchBlob(String(uploadUri));
    const blobSize =
      blobOut?.blob != null
        ? Math.max(
            0,
            Number(
              typeof blobOut.size === 'number'
                ? blobOut.size
                : typeof (blobOut.blob as any)?.size === 'number'
                  ? (blobOut.blob as any).size
                  : 0
            )
          )
        : 0;
    if (!blobOut?.blob || blobSize < 64) return null;
    yyChatFlow('storage.uploadBytes.native.start', { roomId, messageId, finalUri: String(blobOut.finalUri || '').slice(0, 80), size: blobSize });
    await withTimeout(uploadBytes(ref, blobOut.blob), 180_000, 'uploadBytes_native');
    const url = await withTimeout(getDownloadURL(ref), 45_000, 'getDownloadURL');
    logUpload('SUCCESS', {
      roomId,
      messageId,
      localUri: String(localUri || ''),
      localUriScheme: scheme || 'unknown',
      downloadURL: String(url || ''),
      mode: 'blob_native',
    });
    return wrapUploadResult({ url, mimeType, filename, size: blobSize });
  };

  if (Platform.OS !== 'web' && /^file:\/\//i.test(uploadUri)) {
    const fsz = normalized.fileSize;
    /** 크기 미확인 시 전체 base64 로드는 메모리·타임아웃 위험 → Blob 경로만 허용 */
    const fileSizeKnown = typeof fsz === 'number' && Number.isFinite(fsz) && fsz > 0;
    const underMemCap = fileSizeKnown && fsz <= MAX_NATIVE_BASE64_BYTES;

    // 1) 문서·영상: Blob 먼저 (PDF 등 base64 전체 로드 실패 방지)
    if (nativeFileKind === 'file' || nativeFileKind === 'video') {
      try {
        const out = await tryNativeBlobUpload();
        if (out) {
          yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'blob_native_first', kind: nativeFileKind, size: out.size });
          yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(out.url || '').slice(0, 120) });
          return await attachVideoThumbnailIfNeeded({
            storage,
            senderId,
            roomId,
            messageId,
            uploadUri,
            kind: nativeFileKind,
            base: out,
          });
        }
      } catch (e: any) {
        const ne = normalizeErr(e);
        yyChatFlow('storage.native_file.blob_first.warn', { roomId, messageId, kind: nativeFileKind, code: ne.code, message: ne.message });
        // 아래 base64 폴백(한도 내)으로 이어짐
      }
    }

    // 2) 사진: Blob 우선 (기기별 content/file URI에서 더 안정적)
    if (nativeFileKind === 'image') {
      try {
        const out = await tryNativeBlobUpload();
        if (out) {
          yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'blob_native_first_image', kind: 'image', size: out.size });
          yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(out.url || '').slice(0, 120) });
          return await attachVideoThumbnailIfNeeded({
            storage,
            senderId,
            roomId,
            messageId,
            uploadUri,
            kind: nativeFileKind,
            base: out,
          });
        }
      } catch (e: any) {
        const ne = normalizeErr(e);
        yyChatFlow('storage.native_file.image_blob_first.warn', { roomId, messageId, code: ne.code, message: ne.message });
      }
    }

    // 3) 파일·영상: base64 폴백 (한도 내, Blob 실패 후)
    if ((nativeFileKind === 'file' || nativeFileKind === 'video') && underMemCap) {
      yyChatFlow('storage.upload.native_file.base64.start', { roomId, messageId, kind: nativeFileKind, fileSize: fsz });
      try {
        const { dataUrl, size } = await withTimeout(readAsDataUrl(String(uploadUri), mimeType), 360_000, 'readAsDataUrl_native_file');
        if (!dataUrl || dataUrl.length < 80) throw new Error('read_empty_or_too_small');
        await withTimeout(uploadString(ref, dataUrl, 'data_url'), 360_000, 'uploadString_native_file');
        const url = await withTimeout(getDownloadURL(ref), 45_000, 'getDownloadURL');
        logUpload('SUCCESS', {
          roomId,
          messageId,
          localUri: String(localUri || ''),
          localUriScheme: scheme || 'unknown',
          downloadURL: String(url || ''),
          mode: 'native_file_base64',
        });
        yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'native_file_base64', kind: nativeFileKind, size });
        yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(url || '').slice(0, 120) });
        return await attachVideoThumbnailIfNeeded({
          storage,
          senderId,
          roomId,
          messageId,
          uploadUri,
          kind: nativeFileKind,
          base: wrapUploadResult({ url, mimeType, filename, size }),
        });
      } catch (e: any) {
        const ne = normalizeErr(e);
        yyChatFlow('storage.native_file.base64.warn', { roomId, messageId, kind: nativeFileKind, code: ne.code, message: ne.message });
      }
    } else if ((nativeFileKind === 'file' || nativeFileKind === 'video') && !underMemCap) {
      yyChatFlow('storage.native_file.skip_base64_size', { roomId, messageId, kind: nativeFileKind, fileSize: fsz, fileSizeKnown });
    }

    // 4) 사진: base64 폴백(Blob 실패 + 파일 크기 확인 가능 시)
    if (nativeFileKind === 'image' && underMemCap) {
      yyChatFlow('storage.upload.native_file.base64.start', {
        roomId,
        messageId,
        kind: 'image',
        fileSize: fsz,
        path: String(path).slice(0, 80),
      });
      try {
        const { dataUrl, size } = await withTimeout(readAsDataUrl(String(uploadUri), mimeType), 120_000, 'readAsDataUrl_native_file');
        if (!dataUrl || dataUrl.length < 80) throw new Error('read_empty_or_too_small');
        await withTimeout(uploadString(ref, dataUrl, 'data_url'), 360_000, 'uploadString_native_file');
        const url = await withTimeout(getDownloadURL(ref), 45_000, 'getDownloadURL');
        logUpload('SUCCESS', {
          roomId,
          messageId,
          localUri: String(localUri || ''),
          localUriScheme: scheme || 'unknown',
          downloadURL: String(url || ''),
          mode: 'native_file_base64_fallback',
        });
        yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'native_file_base64_fallback', kind: 'image', size });
        yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(url || '').slice(0, 120) });
        return await attachVideoThumbnailIfNeeded({
          storage,
          senderId,
          roomId,
          messageId,
          uploadUri,
          kind: nativeFileKind,
          base: wrapUploadResult({ url, mimeType, filename, size }),
        });
      } catch (e: any) {
        const ne = normalizeErr(e);
        yyChatFlow('storage.native_file.image_base64_fallback.warn', { roomId, messageId, code: ne.code, message: ne.message });
      }
    } else if (nativeFileKind === 'image' && !underMemCap) {
      // 4) 이미지가 너무 큰 경우: 마지막으로 Blob 한번 더 시도
      try {
        const out = await tryNativeBlobUpload();
        if (out) {
          yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'blob_native_fallback_large_image', kind: 'image', size: out.size });
          yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(out.url || '').slice(0, 120) });
          return await attachVideoThumbnailIfNeeded({
            storage,
            senderId,
            roomId,
            messageId,
            uploadUri,
            kind: nativeFileKind,
            base: out,
          });
        }
      } catch (e: any) {
        const ne = normalizeErr(e);
        yyChatFlow('storage.native_file.image_blob_fallback_large.warn', { roomId, messageId, code: ne.code, message: ne.message });
      }
    }
  }

  yyChatFlow('storage.fallback.base64.start', { roomId, messageId, scheme });
  if (
    Platform.OS !== 'web' &&
    /^file:\/\//i.test(uploadUri) &&
    typeof normalized.fileSize === 'number' &&
    Number.isFinite(normalized.fileSize) &&
    normalized.fileSize > MAX_NATIVE_BASE64_BYTES
  ) {
    const ne = { code: 'file_too_large', message: `max_${MAX_NATIVE_BASE64_BYTES}_bytes` };
    yyChatFlow('storage.error', { roomId, messageId, code: ne.code, message: ne.message, phase: 'skip_base64_oversized' });
    throw new Error(`${ne.code}:${ne.message}`);
  }
  if (Platform.OS !== 'web' && /^file:\/\//i.test(uploadUri)) {
    const fsz0 = normalized.fileSize;
    const known = typeof fsz0 === 'number' && Number.isFinite(fsz0) && fsz0 > 0;
    if (!known) {
      try {
        const lastBlob = await tryNativeBlobUpload();
        if (lastBlob) {
          yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'blob_native_unknown_size', size: lastBlob.size });
          yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(lastBlob.url || '').slice(0, 120) });
          return await attachVideoThumbnailIfNeeded({
            storage,
            senderId,
            roomId,
            messageId,
            uploadUri,
            kind: nativeFileKind,
            base: lastBlob,
          });
        }
      } catch (e: any) {
        const ne = normalizeErr(e);
        yyChatFlow('storage.native_file.unknown_size_blob.warn', { roomId, messageId, code: ne.code, message: ne.message });
      }
      /** 영상·대용량 문서는 크기 미확인 시 base64 전체 로드 위험 → 유지. 사진·QR 이미지는 아래 readAsDataUrl 로 업로드 */
      if (nativeFileKind !== 'image') {
        yyChatFlow('storage.error', { roomId, messageId, code: 'file_size_unknown', message: 'blob_unavailable', phase: 'skip_base64_unknown_size' });
        throw new Error('file_size_unknown:파일 크기를 확인하지 못했습니다. 다시 선택해 주세요.');
      }
      yyChatFlow('storage.native_file.unknown_size_image_base64', { roomId, messageId });
    }
  }
  try {
    const { dataUrl, size } = await withTimeout(readAsDataUrl(String(uploadUri), mimeType), 360_000, 'readAsDataUrl');
    await withTimeout(uploadString(ref, dataUrl, 'data_url'), 360_000, 'uploadString_base64');
    const url = await withTimeout(getDownloadURL(ref), 45_000, 'getDownloadURL');
    logUpload('SUCCESS', {
      roomId,
      messageId,
      localUri: String(localUri || ''),
      localUriScheme: scheme || 'unknown',
      downloadURL: String(url || ''),
      mode: 'base64_fallback',
    });
    yyChatFlow('storage.upload.success', { roomId, messageId, mode: 'base64_fallback', size });
    yyChatFlow('storage.getDownloadURL.ok', { roomId, messageId, url: String(url || '').slice(0, 120), size });
    return await attachVideoThumbnailIfNeeded({
      storage,
      senderId,
      roomId,
      messageId,
      uploadUri,
      kind: nativeFileKind,
      base: wrapUploadResult({ url, mimeType, filename, size }),
    });
  } catch (e: any) {
    const ne = normalizeErr(e);
    logUploadFail('BASE64_FALLBACK', e, {
      roomId,
      messageId,
      localUri: String(localUri || ''),
      localUriScheme: scheme || 'unknown',
      uploadUri: String(uploadUri || ''),
    });
    yyChatFlow('storage.error', { roomId, messageId, code: ne.code, message: ne.message });
    throw new Error(`${ne.code}:${ne.message}`);
  }
}

