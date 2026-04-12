import type { ChatAttachmentStandardV2, ChatMessageTypeV2, ChatMessageV2 } from './messageSchema';
import { logAttach } from './attachLog';
import { chatV2Paths } from './firestorePaths';

/** Storage 업로드 결과 — `url` 대신 `remoteUrl` 우선 (네이티브/직렬화에서 .url 접근 오류 방지) */
export type UploadResultV2 = {
  remoteUrl: string;
  /** @deprecated remoteUrl 과 동일 — 레거시 호환 */
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
};

export function pickUploadRemoteUrl(u: UploadResultV2 | null | undefined): string {
  try {
    if (!u || typeof u !== 'object') return '';
    const r = (u as any).remoteUrl ?? (u as any).url ?? (u as any).downloadURL ?? (u as any).fileUrl;
    return typeof r === 'string' ? r.trim() : '';
  } catch {
    return '';
  }
}

function logImgSend(prefix: string, payload: Record<string, any>) {
  try {
    // eslint-disable-next-line no-console
    console.log(prefix, JSON.stringify(payload));
  } catch {}
}

function logImgFlow(step: string, payload: Record<string, any>) {
  try {
    // eslint-disable-next-line no-console
    console.log('[IMG_FLOW]', { step, ...payload });
  } catch {}
}

function normalizeUploadResultV2(input: CreateMediaMessageInputV2, uploaded: UploadResultV2): UploadResultV2 {
  const remoteUrl = pickUploadRemoteUrl(uploaded);
  const normalized: UploadResultV2 = {
    ...uploaded,
    remoteUrl,
    url: remoteUrl,
    thumbnailUrl: String(uploaded?.thumbnailUrl || '').trim() || (input.type === 'image' ? remoteUrl : uploaded?.thumbnailUrl),
  };
  return normalized;
}

export type UploadInputV2 = {
  localUri: string;
  roomId: string;
  messageId: string;
  senderId: string;
  mimeType?: string;
  filename?: string;
};

export const toSendingMessageV2 = (base: Omit<ChatMessageV2, 'status'>): ChatMessageV2 => ({
  ...base,
  status: 'sending',
});

export const toFailedMessageV2 = (
  msg: ChatMessageV2,
  opts?: { error?: string; errorCode?: string; retryable?: boolean }
): ChatMessageV2 => ({
  ...msg,
  status: 'failed',
  updatedAt: Date.now(),
  attachment: msg.attachment
    ? {
        ...msg.attachment,
        status: 'failed',
      }
    : msg.attachment,
  meta: {
    ...(msg.meta || {}),
    error: opts?.error || (msg.meta as any)?.error || 'upload_failed',
    errorCode:
      String(opts?.errorCode || (msg.meta as any)?.errorCode || '').trim() ||
      String(opts?.error || (msg.meta as any)?.error || 'upload_failed').split(':')[0],
    retryable: typeof opts?.retryable === 'boolean' ? opts.retryable : true,
  },
});

export const toReadyMediaMessageV2 = (msg: ChatMessageV2, uploaded: UploadResultV2): ChatMessageV2 => {
  const prevMeta = { ...(msg.meta || {}) };
  /** meta.localUri는 Firestore 용량·노출 최소화를 위해 제거 — 클라이언트 미리보기는 attachment.localUri 유지 */
  delete (prevMeta as any).localUri;
  const keepName = String(msg.filename || '').trim();
  const upName = String(uploaded.filename || '').trim();
  /** Storage 경로용 임의 이름이 uploaded에 들어와도, 전송 전 말풍선에 쓴 원래 파일명을 우선 */
  const filename = keepName || upName || msg.filename;
  const originalName =
    String((prevMeta as any).originalName || keepName || filename || '').trim() || String(filename || 'attachment');
  const storageName = upName || undefined;
  const remoteUrl = pickUploadRemoteUrl(uploaded);
  const prevLocal =
    String((msg.attachment as any)?.localUri || (msg.meta as any)?.localUri || '').trim() || undefined;
  (prevMeta as any).remoteUrl = remoteUrl;
  (prevMeta as any).originalName = originalName;
  if (storageName) (prevMeta as any).storageName = storageName;

  const attType = msg.type as ChatAttachmentStandardV2['type'];
  const thumbFinal =
    String(uploaded.thumbnailUrl || '').trim() ||
    (attType === 'image' ? remoteUrl : '') ||
    remoteUrl;
  const attachment: ChatAttachmentStandardV2 = {
    id: msg.id,
    type: attType,
    originalName,
    storageName,
    mimeType: uploaded.mimeType || msg.mimeType,
    size: typeof uploaded.size === 'number' ? uploaded.size : msg.size,
    remoteUrl,
    /** 동일 세션에서 로컬 미리보기·재시도 경로 유지 (원격 우선은 렌더러에서 처리) */
    localUri: prevLocal,
    thumbnailUrl: thumbFinal,
    width: typeof (prevMeta as any).width === 'number' ? Number((prevMeta as any).width) : undefined,
    height: typeof (prevMeta as any).height === 'number' ? Number((prevMeta as any).height) : undefined,
    duration:
      typeof (prevMeta as any).durationMs === 'number' ? Number((prevMeta as any).durationMs) / 1000 : undefined,
    status: 'uploaded',
  };
  (attachment as any).url = remoteUrl;

  const out: ChatMessageV2 = {
    ...msg,
    status: 'sent',
    url: remoteUrl,
    thumbnailUrl: uploaded.thumbnailUrl || (attType === 'image' ? remoteUrl : uploaded.thumbnailUrl),
    mimeType: uploaded.mimeType || msg.mimeType,
    filename,
    size: typeof uploaded.size === 'number' ? uploaded.size : msg.size,
    updatedAt: Date.now(),
    meta: Object.keys(prevMeta).length ? prevMeta : undefined,
    attachment,
  };
  try {
    if (out.attachment && remoteUrl) {
      out.attachment.remoteUrl = remoteUrl;
      out.attachment.status = 'uploaded';
      (out.attachment as any).url = remoteUrl;
    }
  } catch {
    /* noop */
  }
  try {
    // eslint-disable-next-line no-console
    console.log('[MESSAGE_AFTER_UPLOAD]', {
      id: out.id,
      status: out.status,
      remoteUrl: String(out.attachment?.remoteUrl || '').slice(0, 160),
      attStatus: out.attachment?.status,
    });
  } catch {
    /* noop */
  }
  return out;
};

export type UploadFlowDepsV2 = {
  uploadMedia: (input: UploadInputV2) => Promise<UploadResultV2>;

  /** Persist sending state for receiver visibility (optional but recommended). */
  writeSending?: (msg: ChatMessageV2) => Promise<void>;
  /** Persist ready message payload. Must include url + status=ready. */
  writeReady: (msg: ChatMessageV2) => Promise<void>;
  /** Persist failed state (optional). */
  writeFailed?: (msg: ChatMessageV2) => Promise<void>;

  /** Update local store immediately (for UI). */
  upsertLocal: (roomId: string, msg: ChatMessageV2) => void;
};

export type CreateMediaMessageInputV2 = {
  roomId: string;
  senderId: string;
  type: Extract<ChatMessageTypeV2, 'image' | 'video' | 'file' | 'audio'>;
  messageId: string;
  createdAt?: number;
  localUri: string;
  text?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
  thumbnailUrl?: string;
  meta?: Record<string, any>;
};

export const createLocalMediaMessageV2 = (input: CreateMediaMessageInputV2): ChatMessageV2 => {
  const createdAt = typeof input.createdAt === 'number' ? input.createdAt : Date.now();
  const mergedMeta = { ...(input.meta || {}), localUri: input.localUri };
  const originalName =
    String(input.filename || (mergedMeta as any).originalName || '').trim() ||
    String(input.messageId).slice(0, 8) + '_file';
  (mergedMeta as any).originalName = originalName;

  const attType = input.type as ChatAttachmentStandardV2['type'];
  const attachment: ChatAttachmentStandardV2 = {
    id: input.messageId,
    type: attType,
    originalName,
    mimeType: input.mimeType,
    size: input.size,
    localUri: input.localUri,
    width: typeof (mergedMeta as any).width === 'number' ? Number((mergedMeta as any).width) : undefined,
    height: typeof (mergedMeta as any).height === 'number' ? Number((mergedMeta as any).height) : undefined,
    duration:
      typeof (mergedMeta as any).durationMs === 'number' ? Number((mergedMeta as any).durationMs) / 1000 : undefined,
    status: 'sending',
  };

  return {
    id: input.messageId,
    roomId: input.roomId,
    senderId: input.senderId,
    type: input.type,
    status: 'sending',
    text: input.text,
    thumbnailUrl: input.thumbnailUrl,
    mimeType: input.mimeType,
    filename: input.filename || originalName,
    size: input.size,
    createdAt,
    updatedAt: createdAt,
    meta: mergedMeta,
    attachment,
  };
};

/**
 * Strict media lifecycle:
 * - local optimistic "sending"
 * - upload
 * - on success => local + server "ready" with final url
 * - on failure => local + server "failed" (retryable)
 *
 * Notes:
 * - No album support here.
 * - If UI selects multiple images, call this function per image.
 */
export type RunUploadFlowResultV2 =
  | { messageId: string; ok: true; remoteUrl: string }
  | { messageId: string; ok: false; error: string };

export async function runUploadFlowV2(
  deps: UploadFlowDepsV2,
  input: CreateMediaMessageInputV2
): Promise<RunUploadFlowResultV2> {
  const msg0 = createLocalMediaMessageV2(input);
  logImgFlow('PLACEHOLDER_CREATED', {
    roomId: input.roomId,
    messageId: input.messageId,
    localUri: String(input.localUri || ''),
    remoteUrl: '',
    url: '',
  });
  logImgSend('[IMG_SEND_PLACEHOLDER]', {
    roomId: input.roomId,
    messageId: input.messageId,
    localUri: String(input.localUri || ''),
    remoteUrl: '',
    url: '',
    thumbnailUrl: String(input.thumbnailUrl || ''),
    attachmentStatus: String((msg0.attachment as any)?.status || ''),
    messageStatus: String(msg0.status || ''),
  });
  deps.upsertLocal(input.roomId, msg0);

  try {
    await deps.writeSending?.(msg0);
  } catch {
    // ignore: local UI still works, receiver may not see "sending"
  }

  try {
    // eslint-disable-next-line no-console
    console.log('[UPLOAD_INPUT]', {
      type: input.type,
      messageId: input.messageId,
      localUri: String(input.localUri || '').slice(0, 200),
      filename: input.filename,
      mimeType: input.mimeType,
    });
  } catch {
    /* noop */
  }

  let uploaded: UploadResultV2 | null = null;
  try {
    logImgFlow('UPLOAD_START', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String(input.localUri || ''),
      remoteUrl: '',
      url: '',
    });
    logImgSend('[IMG_SEND_UPLOAD_START]', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String(input.localUri || ''),
      remoteUrl: '',
      url: '',
      thumbnailUrl: String(input.thumbnailUrl || ''),
      attachmentStatus: String((msg0.attachment as any)?.status || ''),
      messageStatus: String(msg0.status || ''),
    });
    uploaded = await deps.uploadMedia({
      localUri: input.localUri,
      roomId: input.roomId,
      messageId: input.messageId,
      senderId: input.senderId,
      mimeType: input.mimeType,
      filename: input.filename,
    });
    logImgSend('[IMG_SEND_UPLOAD_DONE]', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String(input.localUri || ''),
      remoteUrl: String((uploaded as any)?.remoteUrl || ''),
      url: String((uploaded as any)?.url || ''),
      thumbnailUrl: String((uploaded as any)?.thumbnailUrl || ''),
      attachmentStatus: String((msg0.attachment as any)?.status || ''),
      messageStatus: String(msg0.status || ''),
    });
    logImgFlow('UPLOAD_DONE', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String(input.localUri || ''),
      remoteUrl: String((uploaded as any)?.remoteUrl || ''),
      url: String((uploaded as any)?.url || ''),
    });
    try {
      // eslint-disable-next-line no-console
      console.log('[UPLOAD_RESPONSE]', uploaded);
    } catch {
      /* noop */
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[IMG_ERROR]', e);
    const emsg = String(e?.message || e || 'upload_failed');
    const label = input.type === 'image' ? 'photo' : input.type;
    logAttach(`attach.${label}.upload.fail`, {
      roomId: input.roomId,
      action: label,
      insertPath: chatV2Paths.roomMessage(input.roomId, input.messageId),
      success: false,
      error: emsg,
      errorMessage: emsg,
      code: String((e as any)?.code || ''),
    });
    const failed = toFailedMessageV2(msg0, {
      error: emsg,
      errorCode: String((e as any)?.code || ''),
      retryable: true,
    });
    logImgSend('[IMG_SEND_ERROR]', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String((failed as any)?.attachment?.localUri || input.localUri || ''),
      remoteUrl: String((failed as any)?.attachment?.remoteUrl || ''),
      url: String((failed as any)?.url || ''),
      thumbnailUrl: String((failed as any)?.attachment?.thumbnailUrl || (failed as any)?.thumbnailUrl || ''),
      attachmentStatus: String((failed as any)?.attachment?.status || ''),
      messageStatus: String((failed as any)?.status || ''),
      reason: emsg,
    });
    deps.upsertLocal(input.roomId, failed);
    try {
      await deps.writeFailed?.(failed);
    } catch {}
    return { messageId: input.messageId, ok: false, error: emsg };
  }

  let effective: UploadResultV2 | null = uploaded;
  if (!effective || !pickUploadRemoteUrl(effective)) {
    // eslint-disable-next-line no-console
    console.error('[IMG_ERROR]', new Error('upload_no_url'));
    const label = input.type === 'image' ? 'photo' : input.type;
    logAttach(`attach.${label}.upload.fail`, {
      roomId: input.roomId,
      action: label,
      insertPath: chatV2Paths.roomMessage(input.roomId, input.messageId),
      success: false,
      error: 'upload_no_url',
      errorMessage: 'upload_no_url',
    });
    const failed = toFailedMessageV2(msg0, { error: 'upload_no_url', retryable: true });
    logImgSend('[IMG_SEND_ERROR]', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String((failed as any)?.attachment?.localUri || input.localUri || ''),
      remoteUrl: String((failed as any)?.attachment?.remoteUrl || ''),
      url: String((failed as any)?.url || ''),
      thumbnailUrl: String((failed as any)?.attachment?.thumbnailUrl || (failed as any)?.thumbnailUrl || ''),
      attachmentStatus: String((failed as any)?.attachment?.status || ''),
      messageStatus: String((failed as any)?.status || ''),
      reason: 'upload_no_url',
    });
    deps.upsertLocal(input.roomId, failed);
    try {
      await deps.writeFailed?.(failed);
    } catch {}
    return { messageId: input.messageId, ok: false, error: 'upload_no_url' };
  }

  effective = normalizeUploadResultV2(input, effective);
  logImgSend('[IMG_SEND_UPLOAD_DONE]', {
    roomId: input.roomId,
    messageId: input.messageId,
    localUri: String(input.localUri || ''),
    remoteUrl: String((effective as any)?.remoteUrl || ''),
    url: String((effective as any)?.url || ''),
    thumbnailUrl: String((effective as any)?.thumbnailUrl || ''),
    attachmentStatus: String((msg0.attachment as any)?.status || ''),
    messageStatus: String(msg0.status || ''),
  });
  logImgSend('[IMG_SEND_READY_BUILD]', {
    roomId: input.roomId,
    messageId: input.messageId,
    phase: 'before',
    localUri: String(input.localUri || ''),
    remoteUrl: String((effective as any)?.remoteUrl || ''),
    url: String((effective as any)?.url || ''),
    thumbnailUrl: String((effective as any)?.thumbnailUrl || ''),
  });
  logImgFlow('READY_BUILD', {
    roomId: input.roomId,
    messageId: input.messageId,
    localUri: String(input.localUri || ''),
    remoteUrl: String((effective as any)?.remoteUrl || ''),
    url: String((effective as any)?.url || ''),
  });
  const ready = toReadyMediaMessageV2(msg0, effective);
  logImgSend('[IMG_SEND_READY_BUILD]', {
    roomId: input.roomId,
    messageId: input.messageId,
    phase: 'after',
    localUri: String((ready as any)?.attachment?.localUri || ''),
    remoteUrl: String((ready as any)?.attachment?.remoteUrl || ''),
    url: String((ready as any)?.url || (ready as any)?.attachment?.url || ''),
    thumbnailUrl: String((ready as any)?.attachment?.thumbnailUrl || (ready as any)?.thumbnailUrl || ''),
    attachmentStatus: String((ready as any)?.attachment?.status || ''),
    messageStatus: String((ready as any)?.status || ''),
  });
  deps.upsertLocal(input.roomId, ready);
  try {
    logImgSend('[IMG_SEND_WRITE_READY]', {
      roomId: input.roomId,
      messageId: input.messageId,
      phase: 'before',
      localUri: String((ready as any)?.attachment?.localUri || ''),
      remoteUrl: String((ready as any)?.attachment?.remoteUrl || ''),
      url: String((ready as any)?.url || (ready as any)?.attachment?.url || ''),
      thumbnailUrl: String((ready as any)?.attachment?.thumbnailUrl || (ready as any)?.thumbnailUrl || ''),
      attachmentStatus: String((ready as any)?.attachment?.status || ''),
      messageStatus: String((ready as any)?.status || ''),
    });
    await deps.writeReady(ready);
    logImgSend('[IMG_SEND_WRITE_READY]', {
      roomId: input.roomId,
      messageId: input.messageId,
      phase: 'after',
      localUri: String((ready as any)?.attachment?.localUri || ''),
      remoteUrl: String((ready as any)?.attachment?.remoteUrl || ''),
      url: String((ready as any)?.url || (ready as any)?.attachment?.url || ''),
      thumbnailUrl: String((ready as any)?.attachment?.thumbnailUrl || (ready as any)?.thumbnailUrl || ''),
      attachmentStatus: String((ready as any)?.attachment?.status || ''),
      messageStatus: String((ready as any)?.status || ''),
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[IMG_ERROR]', e);
    const failed = toFailedMessageV2(ready, {
      error: String(e?.message || e || 'firestore_write_ready_failed'),
      errorCode: String((e as any)?.code || ''),
      retryable: true,
    });
    logImgSend('[IMG_SEND_ERROR]', {
      roomId: input.roomId,
      messageId: input.messageId,
      localUri: String((failed as any)?.attachment?.localUri || ''),
      remoteUrl: String((failed as any)?.attachment?.remoteUrl || ''),
      url: String((failed as any)?.url || ''),
      thumbnailUrl: String((failed as any)?.attachment?.thumbnailUrl || (failed as any)?.thumbnailUrl || ''),
      attachmentStatus: String((failed as any)?.attachment?.status || ''),
      messageStatus: String((failed as any)?.status || ''),
      reason: String(e?.message || e || 'firestore_write_ready_failed'),
    });
    deps.upsertLocal(input.roomId, failed);
    try {
      await deps.writeFailed?.(failed);
    } catch {
      /* noop */
    }
    return { messageId: input.messageId, ok: false, error: String(e?.message || e || 'firestore_write_ready_failed') };
  }
  logImgFlow('WRITE_SUCCESS', {
    roomId: input.roomId,
    messageId: input.messageId,
    localUri: String((ready as any)?.attachment?.localUri || ''),
    remoteUrl: String((ready as any)?.attachment?.remoteUrl || ''),
    url: String((ready as any)?.url || (ready as any)?.attachment?.url || ''),
  });
  logImgSend('[IMG_SEND_FINAL]', {
    roomId: input.roomId,
    messageId: input.messageId,
    localUri: String((ready as any)?.attachment?.localUri || ''),
    remoteUrl: String((ready as any)?.attachment?.remoteUrl || ''),
    url: String((ready as any)?.url || (ready as any)?.attachment?.url || ''),
    thumbnailUrl: String((ready as any)?.attachment?.thumbnailUrl || (ready as any)?.thumbnailUrl || ''),
    attachmentStatus: String((ready as any)?.attachment?.status || ''),
    messageStatus: String((ready as any)?.status || ''),
  });
  return { messageId: input.messageId, ok: true, remoteUrl: pickUploadRemoteUrl(effective) };
}

