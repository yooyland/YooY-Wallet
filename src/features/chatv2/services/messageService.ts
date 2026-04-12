import { doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, getDoc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessageV2 } from '../core/messageSchema';
import type { ChatPollV2 } from '../core/messageSchema';
import { chatV2Paths } from '../core/firestorePaths';
import { getRoomDocRef, getRoomMessageDocRef, getRoomMessagesItemsColRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import {
  runUploadFlowV2,
  pickUploadRemoteUrl,
  createLocalMediaMessageV2,
  toReadyMediaMessageV2,
  toFailedMessageV2,
  type RunUploadFlowResultV2,
  type UploadFlowDepsV2,
  type UploadResultV2,
} from '../core/uploadFlow';
import { applyUnreadOnSendV2 } from '../core/unreadEngine';
import { uploadMediaToStorageV2 } from './mediaService';
import { ensureAppCheckReady } from '@/lib/firebase';
import { resolveAttachmentRemoteUrl } from '../core/attachmentAccess';
import { enrichLinkPreviewForSend, type LinkPreviewEnrichment } from './linkPreviewService';
import { reverseGeocodeFullV2 } from './locationService';
import { logAttach } from '../core/attachLog';
import { yyChatFlow } from '../core/chatFlowLog';
import type { ChatRoomTypeV2 } from '../core/roomSchema';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';

const logDm = (event: string, payload: Record<string, any>) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[YY_CHAT_V2_DM]', JSON.stringify({ event, ...payload }));
  } catch {}
};

function logImgSend(prefix: string, payload: Record<string, any>) {
  try {
    // eslint-disable-next-line no-console
    console.log(prefix, JSON.stringify(payload));
  } catch {}
}

/** [YY_CHAT_ATTACH] 이벤트명용: image → photo */
function mediaAttachLabel(type: string): 'photo' | 'video' | 'file' | 'audio' {
  if (type === 'image') return 'photo';
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  return 'file';
}

export type SendContextV2 = {
  firestore: Firestore;
  storage: FirebaseStorage;
  roomId: string;
  senderId: string;
  participantIds: string[];
  roomType: 'dm' | 'group' | 'ttl';
  title?: string;
  /** TTL 방 메시지 만료(초); 0/미설정이면 메시지에 expiresAt 미기록 */
  ttlMessageExpireSeconds?: number | null;
  /** 답장 미리보기 스냅샷 */
  replyTo?: {
    id: string;
    senderId: string;
    senderName?: string;
    type?: string;
    text?: string;
    thumbnailUrl?: string;
  } | null;
};

type WriteMsgOpts = { roomType?: string; ttlMessageExpireSeconds?: number | null };

function writeOptsFromCtx(ctx: SendContextV2): WriteMsgOpts {
  return { roomType: ctx.roomType, ttlMessageExpireSeconds: ctx.ttlMessageExpireSeconds ?? null };
}

function withReplyMeta(meta: Record<string, any>, ctx: SendContextV2): Record<string, any> {
  const out = { ...(meta || {}) };
  const r = ctx.replyTo;
  if (!r || !String(r.id || '').trim()) return out;
  out.replyTo = {
    id: String(r.id || '').trim(),
    senderId: String(r.senderId || '').trim(),
    senderName: String(r.senderName || '').trim() || undefined,
    type: String(r.type || '').trim() || undefined,
    text: String(r.text || '').trim() || undefined,
    thumbnailUrl: String(r.thumbnailUrl || '').trim() || undefined,
  };
  return out;
}

async function runPostSendEffectsV2(ctx: SendContextV2, lastMessage: string, lastMessageAt: number, messageId: string): Promise<void> {
  try {
    await ensureJoinedRoomsSummaryOnSendV2({
      firestore: ctx.firestore,
      roomId: ctx.roomId,
      roomType: ctx.roomType,
      roomTitle: ctx.title,
      participantIds: ctx.participantIds,
      senderId: ctx.senderId,
      lastMessage,
      lastMessageAt,
    });
    await applyUnreadOnSendV2({
      firestore: ctx.firestore,
      roomId: ctx.roomId,
      senderId: ctx.senderId,
      participantIds: ctx.participantIds,
      lastMessage,
      lastMessageAt,
    });
  } catch (e: any) {
    yyChatFlow('send.post_effects.fail', {
      roomId: ctx.roomId,
      messageId,
      error: String(e?.message || e || 'post_effects_failed'),
    });
  }
}

function withMessageTtlFields(msg: ChatMessageV2, opts?: WriteMsgOpts): ChatMessageV2 {
  if (!opts || opts.roomType !== 'ttl') return msg;
  const sec = typeof opts.ttlMessageExpireSeconds === 'number' ? Math.floor(Number(opts.ttlMessageExpireSeconds)) : 0;
  if (!Number.isFinite(sec) || sec <= 0) return msg;
  const created = Number(msg.createdAt || 0);
  if (!created) return msg;
  return { ...msg, ttlSeconds: sec, expiresAt: created + sec * 1000 };
}

function now() {
  return Date.now();
}

async function ensureAppCheckReadySoftV2(tag: string, roomId: string) {
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
  } catch (e: any) {
    if (isProd) {
      throw e;
    }
    // App Check 준비 실패로 미디어 전송 자체를 막지 않는다(전달 우선).
    yyChatFlow('appcheck.soft_fail', {
      tag,
      roomId,
      error: String(e?.message || e || 'appcheck_not_ready'),
    });
    try {
      // eslint-disable-next-line no-console
      console.warn('[APP_CHECK_SOFT_FAIL]', { tag, roomId, error: String(e?.message || e || 'appcheck_not_ready') });
    } catch {}
  }
}

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

async function withTimeoutV2<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t = Math.max(1000, Number(ms || 0));
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

function baseMessage(input: Omit<ChatMessageV2, 'createdAt' | 'updatedAt'> & { createdAt?: number }): ChatMessageV2 {
  const ts = typeof input.createdAt === 'number' ? input.createdAt : now();
  return { ...input, createdAt: ts, updatedAt: ts };
}

/** Firestore에 undefined 넣지 않기 — 상대방에게는 로컬 file:// 이 전달되면 썸네일·미리보기가 깨짐 */
function sanitizeMessageForFirestore(msg: ChatMessageV2): Record<string, any> {
  const deepStripUndefined = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map((v) => deepStripUndefined(v));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        out[k] = deepStripUndefined(v);
      }
      return out;
    }
    return value;
  };
  const raw: any = { ...msg };
  if (raw.attachment && typeof raw.attachment === 'object') {
    const a: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw.attachment)) {
      if (k === 'localUri') continue;
      if (v !== undefined) a[k] = v;
    }
    raw.attachment = Object.keys(a).length ? a : undefined;
  }
  if (raw.meta && typeof raw.meta === 'object') {
    const m: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw.meta)) {
      if (k === 'localUri') continue;
      if (k === 'imageAlbum' && Array.isArray(v)) {
        m.imageAlbum = v.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          const { localUri: _loc, ...rest } = item;
          return rest;
        });
        continue;
      }
      if (v !== undefined) m[k] = v;
    }
    raw.meta = Object.keys(m).length ? m : undefined;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = v;
  }
  return deepStripUndefined(out);
}

async function writeMessageV2(firestore: Firestore, msg: ChatMessageV2, opts?: WriteMsgOpts): Promise<void> {
  const out = sanitizeMessageForFirestore(withMessageTtlFields(msg, opts));
  const ref = getRoomMessageDocRef(firestore, String(out.roomId), String(out.id));
  try {
    await setDoc(
      ref,
      {
        ...out,
        serverCreatedAt: serverTimestamp(),
        serverUpdatedAt: serverTimestamp(),
      } as any,
      { merge: true }
    );
  } catch (e: any) {
    const t = String((msg as any)?.type || '');
    if (t === 'image' || t === 'video' || t === 'file' || t === 'audio') {
      // eslint-disable-next-line no-console
      console.error('[IMG_ERROR]', {
        step: 'WRITE_SETDOC',
        roomId: String((msg as any)?.roomId || ''),
        messageId: String((msg as any)?.id || ''),
        localUri: String((msg as any)?.attachment?.localUri || ''),
        remoteUrl: String((msg as any)?.attachment?.remoteUrl || ''),
        url: String((msg as any)?.url || (msg as any)?.attachment?.url || ''),
        error: String(e?.message || e || 'write_failed'),
      });
    }
    throw e;
  }
}

async function finalizeImageMessageSafeV2(input: {
  firestore: Firestore;
  roomId: string;
  messageId: string;
  senderId: string;
  localUri: string;
  remoteUrl: string;
  mimeType?: string;
  width?: number;
  height?: number;
  text?: string;
  filename?: string;
  size?: number;
  meta?: Record<string, any>;
}): Promise<void> {
  const { firestore, roomId, messageId, senderId, localUri, remoteUrl, mimeType, width, height, text, filename, size, meta } = input;
  if (!remoteUrl) throw new Error('finalizeImageMessageSafeV2: remoteUrl missing');
  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  const payload = removeUndefinedDeep({
    id: messageId,
    roomId,
    senderId,
    type: 'image',
    status: 'sent',
    text: text ?? undefined,
    filename: filename ?? undefined,
    mimeType: mimeType ?? undefined,
    size: typeof size === 'number' ? size : undefined,
    url: remoteUrl,
    thumbnailUrl: remoteUrl,
    updatedAt: Date.now(),
    attachment: {
      id: messageId,
      type: 'image',
      localUri: localUri || undefined,
      remoteUrl,
      url: remoteUrl,
      thumbnailUrl: remoteUrl,
      status: 'sent',
      mimeType: mimeType ?? undefined,
      width: typeof width === 'number' ? width : undefined,
      height: typeof height === 'number' ? height : undefined,
      size: typeof size === 'number' ? size : undefined,
      originalName: filename || undefined,
    },
    meta: { ...(meta || {}), remoteUrl, roomSummaryApplied: true },
    serverUpdatedAt: serverTimestamp(),
  } as any);
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
      } as any,
      { merge: true }
    );
    // eslint-disable-next-line no-console
    console.log('[IMG_SEND_FINAL]', { roomId, messageId, mode: 'setDoc-merge-fallback' });
  }
}

async function markImageMessageFailedV2(input: {
  firestore: Firestore;
  roomId: string;
  messageId: string;
  errorMessage?: string;
}): Promise<void> {
  const { firestore, roomId, messageId, errorMessage } = input;
  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  const payload = removeUndefinedDeep({
    status: 'failed',
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
    errorMessage: errorMessage || 'upload_failed',
    attachment: { status: 'failed' },
  } as any);
  try {
    await updateDoc(ref, payload as any);
  } catch {
    await setDoc(ref, payload as any, { merge: true });
  }
}

async function writeReadyMessageRobustV2(
  firestore: Firestore,
  msg: ChatMessageV2,
  opts?: WriteMsgOpts
): Promise<void> {
  const t = String((msg as any)?.type || '');
  const roomId = String((msg as any)?.roomId || '').trim();
  const messageId = String((msg as any)?.id || '').trim();
  const remoteUrl = String(resolveAttachmentRemoteUrl(msg) || (msg as any)?.attachment?.remoteUrl || (msg as any)?.url || '').trim();
  if (t === 'image' && roomId && messageId && remoteUrl) {
    await withTimeoutV2(
      finalizeImageMessageSafeV2({
        firestore,
        roomId,
        messageId,
        senderId: String((msg as any)?.senderId || '').trim(),
        localUri: String((msg as any)?.attachment?.localUri || '').trim(),
        remoteUrl,
        mimeType: (msg as any)?.mimeType,
        width: typeof (msg as any)?.attachment?.width === 'number' ? (msg as any).attachment.width : (msg as any)?.meta?.width,
        height: typeof (msg as any)?.attachment?.height === 'number' ? (msg as any).attachment.height : (msg as any)?.meta?.height,
        text: (msg as any)?.text,
        filename: (msg as any)?.filename,
        size: typeof (msg as any)?.size === 'number' ? (msg as any).size : undefined,
        meta: (msg as any)?.meta || {},
      }),
      20000,
      'finalizeImageMessageSafeV2'
    );
    return;
  }
  try {
    await withTimeoutV2(writeMessageV2(firestore, msg, opts), 20000, 'writeReady_setDoc');
    return;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[IMG_ERROR]', {
      step: 'WRITE_READY_PRIMARY_FAILED',
      roomId: String((msg as any)?.roomId || ''),
      messageId: String((msg as any)?.id || ''),
      error: String(e?.message || e || 'write_ready_failed'),
    });
  }

  const fallbackRemoteUrl = String(resolveAttachmentRemoteUrl(msg) || (msg as any)?.attachment?.remoteUrl || (msg as any)?.url || '').trim();
  const fallbackThumb = String((msg as any)?.attachment?.thumbnailUrl || (msg as any)?.thumbnailUrl || '').trim() || fallbackRemoteUrl;
  const fallbackPayload: Record<string, any> = {
    id: messageId,
    roomId,
    senderId: String((msg as any)?.senderId || '').trim(),
    type: String((msg as any)?.type || 'image').trim(),
    status: 'sent',
    text: (msg as any)?.text ?? undefined,
    url: fallbackRemoteUrl || undefined,
    thumbnailUrl: fallbackThumb || undefined,
    mimeType: (msg as any)?.mimeType ?? undefined,
    filename: (msg as any)?.filename ?? undefined,
    size: typeof (msg as any)?.size === 'number' ? (msg as any).size : undefined,
    createdAt: Number((msg as any)?.createdAt || Date.now()),
    updatedAt: Date.now(),
    attachment: {
      id: messageId,
      type: String((msg as any)?.type || 'image').trim(),
      originalName: String((msg as any)?.attachment?.originalName || (msg as any)?.filename || '').trim() || undefined,
      remoteUrl: fallbackRemoteUrl || undefined,
      url: fallbackRemoteUrl || undefined,
      thumbnailUrl: fallbackThumb || undefined,
      status: 'uploaded',
      mimeType: (msg as any)?.mimeType ?? undefined,
      size: typeof (msg as any)?.size === 'number' ? (msg as any).size : undefined,
    },
    meta: {
      roomSummaryApplied: true,
      ...(msg as any)?.meta?.replyTo ? { replyTo: (msg as any).meta.replyTo } : {},
    },
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  };
  const cleaned = sanitizeMessageForFirestore(fallbackPayload as any);
  await withTimeoutV2(
    setDoc(getRoomMessageDocRef(firestore, roomId, messageId), cleaned as any, { merge: true }),
    20000,
    'writeReady_fallback_setDoc'
  );
}

/** QR 이미지 전송 후 같은 말풍선에 디코드 문자열·URL을 붙일 때 (meta 전체 덮어쓰기 방지) */
export async function patchRoomMessageQrDecodedV2(
  firestore: Firestore,
  roomId: string,
  messageId: string,
  decodedText: string
): Promise<void> {
  const t = String(decodedText || '').trim();
  if (!t) return;
  const ref = getRoomMessageDocRef(firestore, String(roomId), String(messageId));
  await updateDoc(ref, {
    text: t,
    updatedAt: Date.now(),
    'meta.qrDecodedText': t,
    serverUpdatedAt: serverTimestamp(),
  } as any);
}

async function resolveUserNameV2(firestore: Firestore, uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(firestore, 'users', uid));
    if (!snap.exists()) return uid;
    return resolveChatDisplayNameFromUserDoc(uid, snap.data() as Record<string, unknown>);
  } catch {
    return uid;
  }
}

/**
 * Keeps joinedRooms summary stable:
 * - ensures title/peerDisplayName exist (especially for dm)
 * - updates lastMessage/lastMessageAt
 * - does not modify unreadCount (unreadEngine handles that)
 */
export async function ensureJoinedRoomsSummaryOnSendV2(input: {
  firestore: Firestore;
  roomId: string;
  roomType: 'dm' | 'group' | 'ttl';
  roomTitle?: string;
  participantIds: string[];
  senderId: string;
  lastMessage: string;
  lastMessageAt: number;
}): Promise<void> {
  const { firestore, roomId, roomType, roomTitle, participantIds, senderId, lastMessage, lastMessageAt } = input;
  const now = Date.now();
  let ids = Array.from(new Set(participantIds)).filter(Boolean);
  if (ids.length === 0) {
    // participantIds can be temporarily empty when UI renders before room doc subscription.
    // Always heal from the canonical room doc so recipients see the room.
    const snap = await getDoc(getRoomDocRef(firestore, roomId));
    const r = (snap.data() as any) || {};
    ids = Array.isArray(r?.participantIds) ? r.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
    yyChatFlow('send.participants.healFromRoomDoc', { roomId, healedCount: ids.length, roomType });
  }

  const batch = writeBatch(firestore);

  if (roomType === 'dm' && ids.length === 2) {
    const a = ids[0];
    const b = ids[1];
    const [an, bn] = await Promise.all([resolveUserNameV2(firestore, a), resolveUserNameV2(firestore, b)]);
    batch.set(getUserJoinedRoomDocRef(firestore, a, roomId), { roomId, type: 'dm', peerId: b, peerDisplayName: bn, lastMessage, lastMessageAt, updatedAt: now } as any, { merge: true });
    batch.set(getUserJoinedRoomDocRef(firestore, b, roomId), { roomId, type: 'dm', peerId: a, peerDisplayName: an, lastMessage, lastMessageAt, updatedAt: now } as any, { merge: true });
  } else {
    for (const uid of ids) {
      batch.set(
        getUserJoinedRoomDocRef(firestore, uid, roomId),
        { roomId, type: roomType, title: roomTitle || undefined, lastMessage, lastMessageAt, updatedAt: now } as any,
        { merge: true }
      );
    }
  }

  // Sender should always exist
  batch.set(
    getUserJoinedRoomDocRef(firestore, senderId, roomId),
    { roomId, type: roomType, lastMessage, lastMessageAt, updatedAt: now } as any,
    { merge: true }
  );

  await batch.commit();
}

export async function sendTextV2(ctx: SendContextV2, text: string): Promise<{ messageId: string; message: ChatMessageV2 }> {
  if (!String(ctx.roomId || '').trim()) throw new Error('text_send_invalid_roomId');
  if (!String(ctx.senderId || '').trim()) throw new Error('text_send_invalid_senderId');
  const messageId = uuidv4();
  const t = String(text || '').trim();
  if (!t) throw new Error('text_send_empty_text');
  const msg = baseMessage({
    id: messageId,
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'text',
    status: 'sent',
    text: t,
    meta: withReplyMeta({}, ctx),
  });

  logDm('sendText.start', {
    currentUid: ctx.senderId,
    roomId: ctx.roomId,
    participantIds: Array.isArray(ctx.participantIds) ? ctx.participantIds : [],
    adminIds: [],
    insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
  });
  try {
    await writeMessageV2(ctx.firestore, msg, writeOptsFromCtx(ctx));
    logDm('sendText.insert.success', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
    });
  } catch (e: any) {
    logDm('sendText.insert.fail', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
      error: String(e?.message || e || 'insert_failed'),
    });
    throw e;
  }
  yyChatFlow('text.message.insert.success', { roomId: ctx.roomId, messageId, type: 'text', status: 'sent' });
  await runPostSendEffectsV2(ctx, t || '', msg.createdAt, messageId);
  return { messageId, message: msg };
}

export async function sendTextOptimisticV2(
  ctx: SendContextV2,
  text: string,
  deps: { upsertLocal: (roomId: string, msg: ChatMessageV2) => void },
  opts?: { meta?: Record<string, any> }
): Promise<{ messageId: string; message: ChatMessageV2 }> {
  const messageId = uuidv4();
  const t = String(text || '').trim();
  if (!String(ctx.roomId || '').trim()) throw new Error('text_send_invalid_roomId');
  if (!String(ctx.senderId || '').trim()) throw new Error('text_send_invalid_senderId');
  if (!t) throw new Error('text_send_empty_text');
  yyChatFlow('text.optimistic.create', { roomId: ctx.roomId, messageId, len: t.length });
  const msg = baseMessage({
    id: messageId,
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'text',
    status: 'sent',
    text: t,
    meta: withReplyMeta({ ...(opts?.meta || {}) }, ctx),
  });
  deps.upsertLocal(ctx.roomId, msg);
  try {
    logDm('sendTextOptimistic.start', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
    });
    yyChatFlow('text.firestore.write.start', { roomId: ctx.roomId, messageId });
    await writeMessageV2(ctx.firestore, msg, writeOptsFromCtx(ctx));
    logDm('sendTextOptimistic.insert.success', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
    });
    yyChatFlow('text.firestore.write.ok', { roomId: ctx.roomId, messageId });
    yyChatFlow('text.message.insert.success', { roomId: ctx.roomId, messageId, type: 'text', status: 'sent' });
    await runPostSendEffectsV2(ctx, t || '', msg.createdAt, messageId);
    yyChatFlow('text.summary+unread.ok', { roomId: ctx.roomId, messageId });
  } catch (e: any) {
    const emsg = String(e?.message || e || 'send_failed');
    logDm('sendTextOptimistic.insert.fail', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
      error: emsg,
    });
    yyChatFlow('text.send.failed', { roomId: ctx.roomId, messageId, error: emsg });
    const failedMsg: ChatMessageV2 = {
      ...msg,
      status: 'failed',
      meta: { ...(msg.meta || {}), error: emsg },
      updatedAt: Date.now(),
    };
    deps.upsertLocal(ctx.roomId, failedMsg);
    return { messageId, message: failedMsg };
  }
  return { messageId, message: msg };
}

export async function sendSystemMessageV2(input: {
  firestore: Firestore;
  roomId: string;
  /** 시스템 메시지 내용 (표시용) */
  text: string;
  /** 메타: join 등 */
  meta?: Record<string, any>;
  /** createdAt override (ms) */
  createdAt?: number;
}): Promise<{ messageId: string; message: ChatMessageV2 }> {
  const roomId = String(input.roomId || '').trim();
  const t = String(input.text || '').trim();
  if (!roomId) throw new Error('system_send_invalid_roomId');
  if (!t) throw new Error('system_send_empty_text');
  const messageId = uuidv4();
  const createdAt = typeof input.createdAt === 'number' ? input.createdAt : Date.now();
  const msg = baseMessage({
    id: messageId,
    roomId,
    senderId: 'system',
    type: 'system',
    status: 'sent',
    text: t,
    meta: { ...(input.meta || {}) },
    createdAt,
  });
  await writeMessageV2(input.firestore, msg, { timeoutMs: 20000 });
  return { messageId, message: msg };
}

export async function sendLocationV2(
  ctx: SendContextV2,
  location: {
    lat: number;
    lng: number;
    address?: string;
    roadAddress?: string;
    shortAddress?: string;
    mapUrl?: string;
  }
): Promise<{ messageId: string; message: ChatMessageV2 }> {
  const messageId = uuidv4();
  const insertPath = chatV2Paths.roomMessage(ctx.roomId, messageId);
  yyChatFlow('location.create', { roomId: ctx.roomId, messageId, lat: location.lat, lng: location.lng });
  logAttach('attach.location.start', {
    roomId: ctx.roomId,
    action: 'location',
    insertPath,
    lat: location.lat,
    lng: location.lng,
  });

  let full: Awaited<ReturnType<typeof reverseGeocodeFullV2>>;
  try {
    full = await reverseGeocodeFullV2(location.lat, location.lng);
    logAttach('attach.location.reverseGeocode.success', {
      roomId: ctx.roomId,
      action: 'location',
      roadAddress: full.roadAddress,
      shortAddress: full.shortAddress,
      formattedAddress: full.formattedAddress,
    });
  } catch (e: any) {
    logAttach('attach.location.reverseGeocode.fail', {
      roomId: ctx.roomId,
      action: 'location',
      error: String(e?.message || e || 'reverse_geocode_failed'),
    });
    full = {
      roadAddress: '',
      shortAddress: '',
      mapUrl: `https://maps.google.com/?q=${encodeURIComponent(String(location.lat) + ',' + String(location.lng))}`,
    };
  }

  /** 도로명 우선(역지오코딩 full.roadAddress), 수동 입력은 그 다음 */
  const road = String(full.roadAddress || location.roadAddress || '').trim();
  const short = String(full.shortAddress || location.shortAddress || '').trim();
  const mapUrl =
    String(location.mapUrl || full.mapUrl || '').trim() ||
    `https://maps.google.com/?q=${encodeURIComponent(String(location.lat) + ',' + String(location.lng))}`;
  const manual = String(location.address || '').trim();
  const display =
    road ||
    manual ||
    String(full.formattedAddress || '').trim() ||
    short ||
    `${location.lat},${location.lng}`;

  const msg = baseMessage({
    id: messageId,
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'location',
    status: 'sent',
    text: display,
    url: mapUrl,
    location: {
      lat: Number(location.lat),
      lng: Number(location.lng),
      latitude: Number(location.lat),
      longitude: Number(location.lng),
      /** 카드/목록: roadAddress 우선 표시용으로 동일 계열 유지 */
      address: road || display,
      roadAddress: road || undefined,
      shortAddress: short || undefined,
      mapUrl,
    },
    meta: withReplyMeta({}, ctx),
  });

  try {
    await writeMessageV2(ctx.firestore, msg, writeOptsFromCtx(ctx));
    logAttach('attach.location.insert.success', { roomId: ctx.roomId, action: 'location', insertPath, success: true });
  } catch (e: any) {
    logAttach('attach.location.insert.fail', {
      roomId: ctx.roomId,
      action: 'location',
      insertPath,
      success: false,
      error: String(e?.message || e || 'location_insert_failed'),
    });
    throw e;
  }
  yyChatFlow('location.firestore.write.ok', { roomId: ctx.roomId, messageId, addrLen: display.length });
  yyChatFlow('location.message.insert.success', { roomId: ctx.roomId, messageId, type: 'location', status: 'sent' });
  await runPostSendEffectsV2(ctx, display ? `[location] ${display}` : '[location]', msg.createdAt, messageId);
  return { messageId, message: msg };
}

export async function sendLinkV2(ctx: SendContextV2, link: { url: string; title?: string; description?: string; image?: string }): Promise<{ messageId: string; message: ChatMessageV2 }> {
  const messageId = uuidv4();
  const u = String(link?.url || '').trim();
  if (!u) throw new Error('url_send_empty_url');
  let enriched: LinkPreviewEnrichment = { title: link?.title, description: link?.description, image: link?.image };
  try {
    enriched = await enrichLinkPreviewForSend(u, enriched);
  } catch {
    /* 전송은 계속 */
  }
  const msg = baseMessage({
    id: messageId,
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'url',
    status: 'sent',
    text: u,
    url: u,
    link: {
      url: u,
      title: enriched.title ?? link?.title,
      description: enriched.description ?? link?.description,
      image: enriched.image ?? link?.image,
    },
    meta: withReplyMeta({}, ctx),
  });
  try {
    await writeMessageV2(ctx.firestore, msg, writeOptsFromCtx(ctx));
    logDm('sendUrl.insert.success', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
    });
  } catch (e: any) {
    logDm('sendUrl.insert.fail', {
      currentUid: ctx.senderId,
      roomId: ctx.roomId,
      insertPath: chatV2Paths.roomMessage(ctx.roomId, messageId),
      error: String(e?.message || e || 'url_insert_failed'),
    });
    throw e;
  }
  yyChatFlow('url.message.insert.success', { roomId: ctx.roomId, messageId, type: 'url', status: 'sent', hasUrlText: !!u });
  await runPostSendEffectsV2(ctx, u ? `[url] ${u}` : '[url]', msg.createdAt, messageId);
  return { messageId, message: msg };
}

export async function sendQrV2(
  ctx: SendContextV2,
  input: { raw: string },
  deps: { upsertLocal: (roomId: string, msg: ChatMessageV2) => void }
): Promise<{ messageId: string; message: ChatMessageV2 }> {
  await ensureAppCheckReadySoftV2('sendMediaV2', ctx.roomId);
  const messageId = uuidv4();
  /** Firestore·QR 렌더 안정화: 널 바이트 제거, 과도 긴 페이로드 제한 */
  const raw = String(input.raw || '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, 10000);
  const insertPath = chatV2Paths.roomMessage(ctx.roomId, messageId);
  logAttach('attach.qr.insert.start', { roomId: ctx.roomId, action: 'qr', insertPath, rawLen: raw.length });
  yyChatFlow('qr.create', { roomId: ctx.roomId, messageId, rawLen: raw.length });
  const msg = baseMessage({
    id: messageId,
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'qr',
    status: 'sent',
    text: raw,
    qr: { raw },
    meta: withReplyMeta({ qrValue: raw }, ctx),
  });
  deps.upsertLocal(ctx.roomId, msg);
  try {
    yyChatFlow('qr.firestore.write.start', { roomId: ctx.roomId, messageId });
    await writeMessageV2(ctx.firestore, msg, writeOptsFromCtx(ctx));
    logAttach('attach.qr.insert.success', { roomId: ctx.roomId, action: 'qr', insertPath, success: true });
    yyChatFlow('qr.firestore.write.ok', { roomId: ctx.roomId, messageId });
    yyChatFlow('qr.message.insert.success', { roomId: ctx.roomId, messageId, type: 'qr', status: 'sent' });
    await runPostSendEffectsV2(ctx, raw ? `[qr] ${raw}` : '[qr]', msg.createdAt, messageId);
  } catch (e: any) {
    const code = String((e as any)?.code || '');
    const emsg = String(e?.message || e || 'send_failed');
    logAttach('attach.qr.insert.fail', {
      roomId: ctx.roomId,
      action: 'qr',
      insertPath,
      success: false,
      error: emsg,
      errorMessage: emsg,
      code,
    });
    yyChatFlow('qr.send.failed', { roomId: ctx.roomId, messageId, code, error: emsg });
    const failedMsg: ChatMessageV2 = {
      ...msg,
      status: 'failed',
      meta: { ...(msg.meta || {}), error: emsg, errorCode: code || undefined },
      updatedAt: Date.now(),
    };
    deps.upsertLocal(ctx.roomId, failedMsg);
    return { messageId, message: failedMsg };
  }
  return { messageId, message: msg };
}

export async function sendPollV2(
  ctx: SendContextV2,
  poll: { question: string; options: Array<{ id: string; text: string }>; multi?: boolean },
  deps: { upsertLocal: (roomId: string, msg: ChatMessageV2) => void }
): Promise<{ messageId: string; message: ChatMessageV2 }> {
  const messageId = uuidv4();
  const q = String(poll.question || '').trim();
  const opts = Array.isArray(poll.options) ? poll.options : [];
  const payload: ChatPollV2 = {
    question: q,
    options: opts.map((o) => ({ id: String(o.id), text: String(o.text || '').trim() })).filter((o) => o.id && o.text),
    votesByUser: {},
    multi: !!poll.multi,
    createdAt: Date.now(),
    createdBy: ctx.senderId,
  };
  const msg = baseMessage({
    id: messageId,
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'poll',
    status: 'sent',
    text: q,
    poll: payload,
    meta: withReplyMeta({}, ctx),
  });
  deps.upsertLocal(ctx.roomId, msg);
  const insertPath = chatV2Paths.roomMessage(ctx.roomId, messageId);
  logAttach('attach.poll.insert.start', { roomId: ctx.roomId, action: 'poll', insertPath, questionLen: q.length, optionCount: payload.options.length });
  try {
    await writeMessageV2(ctx.firestore, msg, writeOptsFromCtx(ctx));
    logAttach('attach.poll.insert.success', { roomId: ctx.roomId, action: 'poll', insertPath, success: true });
    yyChatFlow('poll.message.insert.success', { roomId: ctx.roomId, messageId, type: 'poll', status: 'sent' });
    await runPostSendEffectsV2(ctx, q ? `[poll] ${q}` : '[poll]', msg.createdAt, messageId);
  } catch (e: any) {
    const code = String((e as any)?.code || '');
    const emsg = String(e?.message || e || 'send_failed');
    logAttach('attach.poll.insert.fail', {
      roomId: ctx.roomId,
      action: 'poll',
      insertPath,
      success: false,
      error: emsg,
      errorMessage: emsg,
      code,
    });
    const failedMsg: ChatMessageV2 = {
      ...msg,
      status: 'failed',
      meta: { ...(msg.meta || {}), error: emsg, errorCode: code || undefined },
      updatedAt: Date.now(),
    };
    deps.upsertLocal(ctx.roomId, failedMsg);
    return { messageId, message: failedMsg };
  }
  return { messageId, message: msg };
}

export async function votePollV2(input: {
  firestore: Firestore;
  roomId: string;
  messageId: string;
  uid: string;
  optionId: string;
}): Promise<void> {
  const { firestore, roomId, messageId, uid, optionId } = input;
  const ref = getRoomMessageDocRef(firestore, roomId, messageId);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const d = snap.data() as any;
    if (String(d?.type) !== 'poll') return;
    const poll = (d?.poll || {}) as ChatPollV2;
    const multi = !!poll.multi;
    const votesByUser: Record<string, string[]> = { ...(poll.votesByUser || {}) };
    const prev = Array.isArray(votesByUser[uid]) ? votesByUser[uid].slice() : [];
    let next: string[] = [];
    if (multi) {
      const has = prev.includes(optionId);
      next = has ? prev.filter((x) => x !== optionId) : Array.from(new Set([...prev, optionId]));
    } else {
      next = [optionId];
    }
    votesByUser[uid] = next;
    tx.update(ref, { poll: { ...(poll as any), votesByUser }, updatedAt: Date.now(), serverUpdatedAt: serverTimestamp() } as any);
  });
}

export async function sendMediaV2(
  ctx: SendContextV2,
  input: {
    type: 'image' | 'video' | 'file' | 'audio';
    localUri: string;
    filename?: string;
    mimeType?: string;
    text?: string;
    size?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    thumbnailUrl?: string;
    /** 다중 전송 시 createdAt 충돌·정렬 불안정 방지 */
    createdAt?: number;
  },
  deps: { upsertLocal: (roomId: string, msg: ChatMessageV2) => void }
): Promise<RunUploadFlowResultV2> {
  if (!String(ctx.roomId || '').trim()) throw new Error('media_send_invalid_roomId');
  if (!String(ctx.senderId || '').trim()) throw new Error('media_send_invalid_senderId');
  if (!String(input.localUri || '').trim()) throw new Error('media_send_invalid_localUri');
  await ensureAppCheckReadySoftV2('sendImageAlbumV2', ctx.roomId);
  const messageId = uuidv4();
  const insertPath = chatV2Paths.roomMessage(ctx.roomId, messageId);
  logAttach('attach.media.start', {
    roomId: ctx.roomId,
    action: input.type,
    insertPath,
    uri: String(input.localUri || '').slice(0, 160),
    mimeType: input.mimeType,
    filename: input.filename,
  });
  logImgSend('[IMG_SEND_PICKED]', {
    roomId: ctx.roomId,
    messageId,
    localUri: String(input.localUri || ''),
    remoteUrl: '',
    url: '',
    thumbnailUrl: String(input.thumbnailUrl || ''),
    attachmentStatus: 'sending',
    messageStatus: 'sending',
  });
  yyChatFlow('media.pick', { roomId: ctx.roomId, messageId, type: input.type, mimeType: input.mimeType, filename: input.filename, uri: String(input.localUri || '').slice(0, 80) });
  // eslint-disable-next-line no-console
  console.log('[IMG_FLOW]', {
    step: 'PICKED',
    roomId: ctx.roomId,
    messageId,
    localUri: String(input.localUri || ''),
    remoteUrl: '',
    url: '',
  });
  try {
    // eslint-disable-next-line no-undef
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(
        '[YY_CHAT_V2_MEDIA_SEND_INPUT]',
        JSON.stringify({
          messageId,
          type: input.type,
          filename: input.filename,
          mimeType: input.mimeType,
          size: input.size,
          uri: String(input.localUri || '').slice(0, 200),
        })
      );
    }
  } catch {}

  const flowDeps: UploadFlowDepsV2 = {
    uploadMedia: async (u) => {
      logDm('media.upload.path', {
        currentUid: ctx.senderId,
        roomId: ctx.roomId,
        uploadPath: `chatv2/${ctx.senderId}/${ctx.roomId}/*`,
      });
      yyChatFlow('media.upload.start', { roomId: ctx.roomId, messageId: u.messageId, localUri: String(u.localUri || '').slice(0, 80), mimeType: u.mimeType, filename: u.filename });
      const out = await uploadMediaToStorageV2({ ...u, storage: ctx.storage });
      yyChatFlow('media.upload.ok', {
        roomId: ctx.roomId,
        messageId: u.messageId,
        url: String(pickUploadRemoteUrl(out) || '').slice(0, 120),
        size: out?.size,
        mimeType: out?.mimeType,
      });
      return out;
    },
    upsertLocal: deps.upsertLocal,
    writeSending: async (m) => {
      // 상대 화면에 sending 고착 메시지가 남지 않도록 sending 상태는 로컬에서만 유지.
      yyChatFlow('media.firestore.writeSending.skip', { roomId: ctx.roomId, messageId: m.id, status: 'sending' });
      // eslint-disable-next-line no-console
      console.log('[IMG_FLOW]', {
        step: 'PLACEHOLDER_WRITTEN',
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        localUri: String((m as any)?.attachment?.localUri || ''),
        remoteUrl: '',
        url: '',
      });
    },
    writeReady: async (m) => {
      // Ready must include URL at the same time. roomSummaryApplied: 방 목록/미읽음 반영 완료(재시도 시 중복 방지)
      const withSummaryFlag: ChatMessageV2 = {
        ...m,
        meta: { ...(m.meta || {}), roomSummaryApplied: true, ...(ctx.replyTo ? { replyTo: { ...ctx.replyTo } } : {}) },
      };
      yyChatFlow('media.firestore.writeReady', {
        roomId: ctx.roomId,
        messageId: m.id,
        status: String(m.status || 'sent'),
        url: String(resolveAttachmentRemoteUrl(m) || (m as any)?.url || '').slice(0, 120),
      });
      // eslint-disable-next-line no-console
      console.log('[IMG_FLOW]', {
        step: 'WRITE_READY_START',
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        localUri: String((m as any)?.attachment?.localUri || ''),
        remoteUrl: String((m as any)?.attachment?.remoteUrl || ''),
        url: String((m as any)?.url || (m as any)?.attachment?.url || ''),
      });
      logImgSend('[IMG_SEND_WRITE_READY]', {
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        phase: 'before_firestore_set',
        localUri: String((m as any)?.attachment?.localUri || ''),
        remoteUrl: String((m as any)?.attachment?.remoteUrl || ''),
        url: String((m as any)?.url || (m as any)?.attachment?.url || ''),
        thumbnailUrl: String((m as any)?.attachment?.thumbnailUrl || (m as any)?.thumbnailUrl || ''),
        attachmentStatus: String((m as any)?.attachment?.status || ''),
        messageStatus: String((m as any)?.status || ''),
      });
      try {
        await writeReadyMessageRobustV2(ctx.firestore, withSummaryFlag, writeOptsFromCtx(ctx));
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('[IMG_ERROR]', e);
        throw e;
      }
      // eslint-disable-next-line no-console
      console.log('[IMG_FLOW]', {
        step: 'WRITE_READY_OK',
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        localUri: String((withSummaryFlag as any)?.attachment?.localUri || ''),
        remoteUrl: String((withSummaryFlag as any)?.attachment?.remoteUrl || ''),
        url: String((withSummaryFlag as any)?.url || (withSummaryFlag as any)?.attachment?.url || ''),
      });
      logImgSend('[IMG_SEND_WRITE_READY]', {
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        phase: 'after_firestore_set',
        localUri: String((withSummaryFlag as any)?.attachment?.localUri || ''),
        remoteUrl: String((withSummaryFlag as any)?.attachment?.remoteUrl || ''),
        url: String((withSummaryFlag as any)?.url || (withSummaryFlag as any)?.attachment?.url || ''),
        thumbnailUrl: String((withSummaryFlag as any)?.attachment?.thumbnailUrl || (withSummaryFlag as any)?.thumbnailUrl || ''),
        attachmentStatus: String((withSummaryFlag as any)?.attachment?.status || ''),
        messageStatus: String((withSummaryFlag as any)?.status || ''),
      });
      const label = mediaAttachLabel(String(m.type));
      logAttach(`attach.${label}.insert.success`, {
        roomId: ctx.roomId,
        action: label,
        insertPath: chatV2Paths.roomMessage(ctx.roomId, m.id),
        success: true,
      });
      logDm('media.insert.success', {
        currentUid: ctx.senderId,
        roomId: ctx.roomId,
        insertPath: chatV2Paths.roomMessage(ctx.roomId, m.id),
      });
      yyChatFlow('media.message.insert.success', {
        roomId: ctx.roomId,
        messageId: m.id,
        type: m.type,
        status: String(m.status || ''),
        hasUrl: !!resolveAttachmentRemoteUrl(m),
      });
      try {
        // eslint-disable-next-line no-undef
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          // eslint-disable-next-line no-console
          console.log(
            '[YY_CHAT_V2_MEDIA_WRITE_READY]',
            JSON.stringify({
              id: m.id,
              type: m.type,
              status: m.status,
              filename: m.filename,
              attachment: m.attachment
                ? {
                    originalName: m.attachment.originalName,
                    remoteUrl: String(m.attachment.remoteUrl || '').slice(0, 120),
                    thumbnailUrl: String(m.attachment.thumbnailUrl || '').slice(0, 120),
                  }
                : null,
            })
          );
        }
      } catch {}
      const last =
        m.text ||
        (m.type === 'image' ? '[image]' : m.type === 'video' ? '[video]' : m.type === 'audio' ? '[voice]' : '[file]');
      // 업로드/최종 sent 반영을 우선 완료하고, 후처리는 비동기로 분리한다.
      void runPostSendEffectsV2(ctx, last, m.createdAt, String(m.id));
      // runUploadFlowV2가 넣은 ready에는 meta.roomSummaryApplied 없음 → 로컬과 Firestore 불일치 시 재시도 판단 오류 방지
      deps.upsertLocal(ctx.roomId, withSummaryFlag);
      logImgSend('[IMG_SEND_FINAL]', {
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        localUri: String((withSummaryFlag as any)?.attachment?.localUri || ''),
        remoteUrl: String((withSummaryFlag as any)?.attachment?.remoteUrl || ''),
        url: String((withSummaryFlag as any)?.url || (withSummaryFlag as any)?.attachment?.url || ''),
        thumbnailUrl: String((withSummaryFlag as any)?.attachment?.thumbnailUrl || (withSummaryFlag as any)?.thumbnailUrl || ''),
        attachmentStatus: String((withSummaryFlag as any)?.attachment?.status || ''),
        messageStatus: String((withSummaryFlag as any)?.status || ''),
      });
    },
    writeFailed: async (m) => {
      const label = mediaAttachLabel(String(m.type || 'file'));
      const emsg = String((m as any)?.meta?.error || '');
      logDm('media.insert.fail', {
        currentUid: ctx.senderId,
        roomId: ctx.roomId,
        insertPath: chatV2Paths.roomMessage(ctx.roomId, m.id),
        error: emsg,
      });
      logAttach(`attach.${label}.insert.fail`, {
        roomId: ctx.roomId,
        action: label,
        insertPath: chatV2Paths.roomMessage(ctx.roomId, m.id),
        success: false,
        error: emsg,
        errorMessage: emsg,
        code: String((m as any)?.meta?.errorCode || ''),
      });
      yyChatFlow('media.firestore.writeFailed', {
        roomId: ctx.roomId,
        messageId: m.id,
        status: 'failed',
        error: String((m as any)?.meta?.error || ''),
        code: String((m as any)?.meta?.errorCode || ''),
      });
      logImgSend('[IMG_SEND_ERROR]', {
        roomId: ctx.roomId,
        messageId: String(m.id || ''),
        localUri: String((m as any)?.attachment?.localUri || ''),
        remoteUrl: String((m as any)?.attachment?.remoteUrl || ''),
        url: String((m as any)?.url || ''),
        thumbnailUrl: String((m as any)?.attachment?.thumbnailUrl || (m as any)?.thumbnailUrl || ''),
        attachmentStatus: String((m as any)?.attachment?.status || ''),
        messageStatus: String((m as any)?.status || ''),
        reason: String((m as any)?.meta?.error || 'write_failed'),
      });
      if (String((m as any)?.type || '') === 'image') {
        await markImageMessageFailedV2({
          firestore: ctx.firestore,
          roomId: String((m as any)?.roomId || ctx.roomId),
          messageId: String((m as any)?.id || ''),
          errorMessage: String((m as any)?.meta?.error || 'upload_failed'),
        });
        return;
      }
      await writeMessageV2(ctx.firestore, m, writeOptsFromCtx(ctx));
    },
  };

  return runUploadFlowV2(flowDeps, {
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: input.type,
    messageId,
    localUri: input.localUri,
    text: input.text,
    mimeType: input.mimeType,
    filename: input.filename,
    size: input.size,
    thumbnailUrl: input.thumbnailUrl,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : undefined,
    meta: {
      width: typeof input.width === 'number' ? input.width : undefined,
      height: typeof input.height === 'number' ? input.height : undefined,
      durationMs: typeof input.durationMs === 'number' ? input.durationMs : undefined,
      /** 구 UX: 갤러리/문서 선택 시 원본 표시명 유지 */
      originalName: input.filename ? String(input.filename).trim() : undefined,
      replyTo: ctx.replyTo ? { ...ctx.replyTo } : undefined,
    },
  });
}

/** 한 말풍선에 여러 장 — meta.imageAlbum 로 보관, 첫 장은 attachment 와 동기 */
export async function sendImageAlbumV2(
  ctx: SendContextV2,
  inputs: Array<{
    localUri: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
  }>,
  deps: { upsertLocal: (roomId: string, msg: ChatMessageV2) => void }
): Promise<RunUploadFlowResultV2> {
  if (!String(ctx.roomId || '').trim()) throw new Error('media_send_invalid_roomId');
  if (!String(ctx.senderId || '').trim()) throw new Error('media_send_invalid_senderId');
  const list = (inputs || []).filter((x) => String(x?.localUri || '').trim());
  if (list.length < 2) throw new Error('image_album_need_two');
  await ensureAppCheckReady();
  const messageId = uuidv4();
  const baseTs = Date.now();
  const imageAlbum = list.map((inp, i) => ({
    id: `${messageId}_slot_${i}`,
    localUri: String(inp.localUri),
    originalName: String(inp.filename || `photo_${i}.jpg`).trim(),
    mimeType: String(inp.mimeType || 'image/jpeg'),
    width: typeof inp.width === 'number' ? inp.width : undefined,
    height: typeof inp.height === 'number' ? inp.height : undefined,
    status: 'sending' as const,
  }));

  const first = list[0];
  let msg0 = createLocalMediaMessageV2({
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: 'image',
    messageId,
    createdAt: baseTs,
    localUri: String(first.localUri),
    mimeType: first.mimeType,
    filename: first.filename,
    size: first.size,
    meta: {
      width: typeof first.width === 'number' ? first.width : undefined,
      height: typeof first.height === 'number' ? first.height : undefined,
      originalName: first.filename ? String(first.filename).trim() : undefined,
      imageAlbum,
      replyTo: ctx.replyTo ? { ...ctx.replyTo } : undefined,
    },
  });

  deps.upsertLocal(ctx.roomId, msg0);
  // 앨범도 sending 상태는 로컬만 유지 (상대방 loading 고착 방지)

  const uploads: UploadResultV2[] = [];
  let finalAlbum: Array<{
    id: string;
    remoteUrl: string;
    thumbnailUrl: string;
    originalName: string;
    mimeType: string;
    width?: number;
    height?: number;
    status: 'uploaded';
  }> = [];
  try {
    const up = await Promise.all(
      list.map((inp, i) =>
        uploadMediaToStorageV2({
          storage: ctx.storage,
          localUri: String(inp.localUri),
          roomId: ctx.roomId,
          messageId: `${messageId}_img${i}`,
          senderId: ctx.senderId,
          mimeType: inp.mimeType,
          filename: inp.filename,
        })
      )
    );
    uploads.push(...up);

    finalAlbum = list.map((inp, i) => {
      const u = up[i];
      const ru = pickUploadRemoteUrl(u);
      return {
        id: `${messageId}_slot_${i}`,
        remoteUrl: ru,
        thumbnailUrl: String(u?.thumbnailUrl || '').trim() || ru,
        originalName: String(inp.filename || `photo_${i}.jpg`).trim(),
        mimeType: String(u?.mimeType || inp.mimeType || 'image/jpeg'),
        width: typeof inp.width === 'number' ? inp.width : undefined,
        height: typeof inp.height === 'number' ? inp.height : undefined,
        status: 'uploaded' as const,
      };
    });

    const albumForLocal = finalAlbum.map((slot, i) => ({
      ...slot,
      localUri: String(list[i].localUri),
    }));

    msg0 = toReadyMediaMessageV2({ ...msg0, meta: { ...(msg0.meta || {}), imageAlbum: albumForLocal } }, up[0]);
    deps.upsertLocal(ctx.roomId, msg0);
  } catch (e: any) {
    const emsg = String(e?.message || e || 'upload_failed');
    const failed = toFailedMessageV2(msg0, {
      error: emsg,
      errorCode: String((e as any)?.code || ''),
      retryable: true,
    });
    deps.upsertLocal(ctx.roomId, failed);
    try {
      await writeMessageV2(ctx.firestore, failed, writeOptsFromCtx(ctx));
    } catch {}
    return { messageId, ok: false, error: emsg };
  }

  const withSummaryFlag: ChatMessageV2 = {
    ...msg0,
    meta: { ...(msg0.meta || {}), imageAlbum: finalAlbum, roomSummaryApplied: true, ...(ctx.replyTo ? { replyTo: { ...ctx.replyTo } } : {}) },
    updatedAt: Date.now(),
  };
  deps.upsertLocal(ctx.roomId, withSummaryFlag);
  try {
    await writeReadyMessageRobustV2(ctx.firestore, withSummaryFlag, writeOptsFromCtx(ctx));
    await runPostSendEffectsV2(ctx, '[image]', withSummaryFlag.createdAt, messageId);
  } catch (err: any) {
    const emsg = String(err?.message || err || 'firestore_write_ready_failed');
    const failed = toFailedMessageV2(withSummaryFlag, {
      error: emsg,
      errorCode: String((err as any)?.code || ''),
      retryable: true,
    });
    deps.upsertLocal(ctx.roomId, failed);
    try {
      await writeMessageV2(ctx.firestore, failed, writeOptsFromCtx(ctx));
    } catch {}
    return { messageId, ok: false, error: emsg };
  }

  return { messageId, ok: true, remoteUrl: pickUploadRemoteUrl(uploads[0]) || '' };
}

export async function retryMediaV2(
  ctx: SendContextV2,
  msg: ChatMessageV2,
  deps: { upsertLocal: (roomId: string, msg: ChatMessageV2) => void }
): Promise<RunUploadFlowResultV2 | null> {
  if (!msg) return null;
  if (msg.status !== 'failed') return null;
  if (msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'file' && msg.type !== 'audio') return null;

  const localUri = String(
    (msg as any)?.attachment?.localUri || (msg as any)?.meta?.localUri || ''
  ).trim();
  if (!localUri) return null;

  /**
   * 재시도: 최초 전송이 writeReady까지 성공했다면 status가 sent라 재시도 불가.
   * 실패 상태는 대개 업로드/writeReady 전 → roomSummaryApplied 없음 → 방 요약·미읽음 필요.
   * 드물게 이전에 roomSummaryApplied가 이미 저장된 경우(클라만 failed)만 스킵.
   */
  const flowDeps: UploadFlowDepsV2 = {
    uploadMedia: (u) => uploadMediaToStorageV2({ ...u, storage: ctx.storage }),
    upsertLocal: deps.upsertLocal,
    writeSending: async (m) => {
      yyChatFlow('media.retry.writeSending.skip', { roomId: ctx.roomId, messageId: m.id, status: 'sending' });
    },
    writeReady: async (m) => {
      const alreadySummarized = !!(msg as any)?.meta?.roomSummaryApplied;
      const withSummaryFlag: ChatMessageV2 = {
        ...m,
        meta: { ...(m.meta || {}), roomSummaryApplied: true },
      };
      await writeReadyMessageRobustV2(ctx.firestore, withSummaryFlag, writeOptsFromCtx(ctx));
      if (!alreadySummarized) {
        const last =
          m.text ||
          (m.type === 'image' ? '[image]' : m.type === 'video' ? '[video]' : m.type === 'audio' ? '[voice]' : '[file]');
        void runPostSendEffectsV2(ctx, last, m.createdAt, String(m.id));
      }
      deps.upsertLocal(ctx.roomId, withSummaryFlag);
    },
    writeFailed: async (m) => {
      await writeMessageV2(ctx.firestore, m, writeOptsFromCtx(ctx));
    },
  };

  return runUploadFlowV2(flowDeps, {
    roomId: ctx.roomId,
    senderId: ctx.senderId,
    type: msg.type as 'image' | 'video' | 'file' | 'audio',
    messageId: msg.id,
    createdAt: msg.createdAt,
    localUri,
    text: msg.text,
    mimeType: msg.mimeType,
    filename: msg.filename,
    size: msg.size,
    thumbnailUrl: msg.thumbnailUrl,
    meta: {
      width: typeof (msg as any)?.meta?.width === 'number' ? Number((msg as any).meta.width) : undefined,
      height: typeof (msg as any)?.meta?.height === 'number' ? Number((msg as any).meta.height) : undefined,
      durationMs: typeof (msg as any)?.meta?.durationMs === 'number' ? Number((msg as any).meta.durationMs) : undefined,
      originalName:
        typeof (msg as any)?.meta?.originalName === 'string' && String((msg as any).meta.originalName).trim()
          ? String((msg as any).meta.originalName).trim()
          : typeof msg.filename === 'string' && msg.filename.trim()
            ? msg.filename.trim()
            : undefined,
    },
  });
}


export async function fetchLatestMessagesV2(input: {
  firestore: Firestore;
  roomId: string;
  limitN?: number;
}): Promise<ChatMessageV2[]> {
  const q = query(
    getRoomMessagesItemsColRef(input.firestore, input.roomId),
    orderBy('createdAt', 'desc'),
    limit(Math.max(1, Math.min(50, Number(input.limitN || 30))))
  );
  const snap = await getDocs(q);
  const out: ChatMessageV2[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    if (!v?.id) v.id = d.id;
    out.push(v as ChatMessageV2);
  });
  out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return out;
}

