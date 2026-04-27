import { getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { ChatMessageV2 } from '../core/messageSchema';
import type { ChatRoomV2 } from '../core/roomSchema';
import { chatV2Paths } from '../core/firestorePaths';
import { getLegacyRoomMessagesColRef, getRoomDocRef, getRoomMessagesItemsColRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import { enterRoomV2 } from './roomService';
import { yyChatFlow } from '../core/chatFlowLog';
import { parseFirestoreMs } from '../core/firestoreMs';

const toMessageV2 = (roomId: string, d: any): ChatMessageV2 => {
  const v = (d?.data?.() ? d.data() : d) as any;
  const id = String(v?.id || d?.id || '');
  const createdMs = parseFirestoreMs(v?.createdAt) || parseFirestoreMs(v?.serverCreatedAt);
  const updatedMs = parseFirestoreMs(v?.updatedAt) || parseFirestoreMs(v?.serverUpdatedAt);
  const out = {
    id,
    roomId,
    senderId: String(v?.senderId || ''),
    type: String(v?.type || 'text') as any,
    /** Firestore에 status 없으면 이미 전달 완료된 메시지로 간주 (ready는 전송 중간값에 가깝음) */
    status: String(v?.status || 'sent') as any,
    text: v?.text != null ? String(v.text) : undefined,
    url: v?.url != null ? String(v?.url) : undefined,
    thumbnailUrl: v?.thumbnailUrl != null ? String(v.thumbnailUrl) : undefined,
    mimeType: v?.mimeType != null ? String(v.mimeType) : undefined,
    filename: v?.filename != null ? String(v.filename) : undefined,
    size: typeof v?.size === 'number' ? v.size : undefined,
    location: v?.location || undefined,
    link:
      v?.link && typeof v.link === 'object'
        ? {
            url: v?.link?.url != null ? String(v?.link?.url) : undefined,
            title: v?.link?.title != null ? String(v?.link?.title) : undefined,
            description: v?.link?.description != null ? String(v?.link?.description) : undefined,
            image: v?.link?.image != null ? String(v?.link?.image) : undefined,
          }
        : undefined,
    attachment: (() => {
      if (v?.attachment && typeof v.attachment === 'object') {
        const att = { ...(v.attachment as any) };
        delete att.localUri;
        const topUrl = typeof v?.url === 'string' ? v.url.trim() : '';
        const metaR = v?.meta && typeof (v.meta as any).remoteUrl === 'string' ? String((v.meta as any).remoteUrl).trim() : '';
        if (!att.remoteUrl && /^https?:\/\//i.test(topUrl)) att.remoteUrl = topUrl;
        else if (!att.remoteUrl && /^https?:\/\//i.test(metaR)) att.remoteUrl = metaR;
        if (!att.thumbnailUrl && typeof att.remoteUrl === 'string' && /^https?:\/\//i.test(att.remoteUrl)) att.thumbnailUrl = att.remoteUrl;
        return Object.keys(att).length ? att : undefined;
      }
      const t = String(v?.type || '');
      const topUrl = typeof v?.url === 'string' ? v.url.trim() : '';
      if ((t === 'image' || t === 'video') && /^https?:\/\//i.test(topUrl)) {
        const th = typeof v?.thumbnailUrl === 'string' && v.thumbnailUrl.trim() ? v.thumbnailUrl.trim() : topUrl;
        return {
          id,
          type: t as any,
          originalName: String(v?.filename || 'media').trim() || 'media',
          remoteUrl: topUrl,
          thumbnailUrl: th,
          status: 'uploaded' as const,
        };
      }
      return undefined;
    })(),
    qr: v?.qr || undefined,
    poll: v?.poll || undefined,
    meta: (() => {
      const merged = { ...(v?.meta || {}), ...(v?.deletedFor ? { deletedFor: v.deletedFor } : {}) };
      delete (merged as any).localUri;
      const album = (merged as any).imageAlbum;
      if (Array.isArray(album)) {
        (merged as any).imageAlbum = album.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          const next = { ...item };
          delete (next as any).localUri;
          const ru = String((next as any).remoteUrl || '').trim();
          const th = String((next as any).thumbnailUrl || '').trim();
          if (!th && ru && /^https?:\/\//i.test(ru)) (next as any).thumbnailUrl = ru;
          return next;
        });
      }
      return Object.keys(merged).length ? merged : undefined;
    })(),
    createdAt: createdMs || 0,
    updatedAt: updatedMs > 0 ? updatedMs : undefined,
    expiresAt: typeof v?.expiresAt === 'number' ? v.expiresAt : undefined,
    ttlSeconds: typeof v?.ttlSeconds === 'number' ? v.ttlSeconds : undefined,
  };
  try {
    yyChatFlow('receiver.parse', { roomId, messageId: id, type: (out as any).type, status: (out as any).status, hasUrl: !!(out as any).url });
    // eslint-disable-next-line no-undef
    if (typeof __DEV__ !== 'undefined' && __DEV__ && out.attachment && typeof out.attachment === 'object') {
      // eslint-disable-next-line no-console
      console.log(
        '[YY_CHAT_V2_MSG_PARSE]',
        JSON.stringify({
          roomId,
          messageId: id,
          attKeys: Object.keys(out.attachment as object),
        })
      );
    }
  } catch {}
  return out as any;
};

const logDm = (event: string, payload: Record<string, any>) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[YY_CHAT_V2_DM]', JSON.stringify({ event, ...payload }));
  } catch {}
};

const toLegacyBridgeMessageV2 = (roomId: string, d: any): ChatMessageV2 => {
  const v = (d?.data?.() ? d.data() : d) as any;
  const id = String(v?.id || d?.id || '');
  const type = String(v?.type || 'text') as any;
  const text = v?.content != null ? String(v.content) : (v?.text != null ? String(v.text) : undefined);
  const imageUrl = v?.imageUrl != null ? String(v.imageUrl || '') : '';
  const url = type === 'image' && imageUrl ? imageUrl : undefined;
  const createdAt = (() => {
    try { return typeof v?.createdAt?.toMillis === 'function' ? v.createdAt.toMillis() : Number(v?.createdAt || 0); } catch { return 0; }
  })();
  const out: ChatMessageV2 = {
    id,
    roomId,
    senderId: String(v?.senderId || ''),
    type,
    status: 'sent',
    text,
    url,
    meta: { ...(v?.meta || {}), legacyBridge: true },
    createdAt,
    updatedAt: createdAt,
  } as any;
  return out;
};

export function subscribeRoomDocV2(input: {
  firestore: Firestore;
  roomId: string;
  onRoom: (room: ChatRoomV2) => void;
}): () => void {
  const ref = getRoomDocRef(input.firestore, input.roomId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const v = snap.data() as any;
    let createdByNorm = String(v?.createdBy || '').trim();
    if (!createdByNorm && Array.isArray(v?.ownerIds) && v.ownerIds.length) {
      createdByNorm = String(v.ownerIds[0] || '').trim();
    }
    let participantIdsNorm: string[] = Array.isArray(v?.participantIds)
      ? v.participantIds.map((x: any) => String(x)).filter(Boolean)
      : [];
    if (participantIdsNorm.length === 0 && Array.isArray(v?.memberIds)) {
      participantIdsNorm = v.memberIds.map((x: any) => String(x)).filter(Boolean);
    }
    if (participantIdsNorm.length === 0 && Array.isArray(v?.members)) {
      participantIdsNorm = v.members.map((x: any) => String(x)).filter(Boolean);
    }
    if (participantIdsNorm.length === 0 && createdByNorm) {
      participantIdsNorm = [createdByNorm];
    }
    let adminIdsNorm: string[] = Array.isArray(v?.adminIds) ? v.adminIds.map((x: any) => String(x)).filter(Boolean) : [];
    if (createdByNorm && !adminIdsNorm.includes(createdByNorm)) {
      adminIdsNorm = [createdByNorm, ...adminIdsNorm.filter((x) => x !== createdByNorm)];
    }
    const room: ChatRoomV2 = {
      id: input.roomId,
      type: String(v?.type || 'group') as any,
      title: v?.title ? String(v.title) : undefined,
      description: v?.description ? String(v.description) : undefined,
      photoURL: v?.photoURL ? String(v.photoURL) : undefined,
      avatarUrl: v?.avatarUrl ? String(v.avatarUrl) : v?.photoURL ? String(v.photoURL) : undefined,
      tags: Array.isArray(v?.tags) ? v.tags.map((x: any) => String(x)).filter(Boolean) : undefined,
      maxParticipants: typeof v?.maxParticipants === 'number' ? v.maxParticipants : undefined,
      roomStatus: v?.roomStatus ? String(v.roomStatus) as any : undefined,
      searchVisible: typeof v?.searchVisible === 'boolean' ? v.searchVisible : undefined,
      isSecret: typeof v?.isSecret === 'boolean' ? v.isSecret : undefined,
      settings: v?.settings || undefined,
      permissions: v?.permissions || undefined,
      inviteCode: v?.inviteCode ? String(v.inviteCode) : undefined,
      inviteToken: v?.inviteToken ? String(v.inviteToken) : undefined,
      inviteEnabled: typeof v?.inviteEnabled === 'boolean' ? v.inviteEnabled : undefined,
      inviteExpiresAt: typeof v?.inviteExpiresAt === 'number' ? v.inviteExpiresAt : v?.inviteExpiresAt === null ? null : undefined,
      inviteQrValue: v?.inviteQrValue ? String(v.inviteQrValue) : undefined,
      memberIds: Array.isArray(v?.memberIds) ? v.memberIds.map((x: any) => String(x)) : participantIdsNorm.length ? participantIdsNorm : undefined,
      ownerIds: Array.isArray(v?.ownerIds) ? v.ownerIds.map((x: any) => String(x)) : undefined,
      createdBy: createdByNorm,
      createdAt: typeof v?.createdAt === 'number' ? v.createdAt : 0,
      updatedAt: typeof v?.updatedAt === 'number' ? v.updatedAt : Date.now(),
      participantIds: participantIdsNorm,
      adminIds: adminIdsNorm,
      dmPairKey: v?.dmPairKey ? String(v.dmPairKey) : undefined,
      ttl: {
        ...(v?.ttl || {}),
        ...(typeof v?.ttlEnabled === 'boolean' ? { enabled: !!v.ttlEnabled } : {}),
        ...(typeof v?.roomExpiresAt === 'number' ? { explodeRoomAt: Number(v.roomExpiresAt) } : {}),
        ...(typeof v?.messageTtlSeconds === 'number' ? { messageExpireSeconds: Number(v.messageTtlSeconds) } : {}),
        ...(typeof v?.roomTtlSeconds === 'number' ? { roomTtlSeconds: Number(v.roomTtlSeconds) } : {}),
        ...(v?.ttlStatus ? { ttlStatus: String(v.ttlStatus) } : {}),
        ...(typeof v?.ttlLastExtendedAt === 'number' ? { ttlLastExtendedAt: Number(v.ttlLastExtendedAt) } : {}),
        ...(v?.ttlLastModifiedBy ? { ttlLastModifiedBy: String(v.ttlLastModifiedBy) } : {}),
      },
      ttlEnabled: typeof v?.ttlEnabled === 'boolean' ? !!v.ttlEnabled : undefined,
      roomExpiresAt: typeof v?.roomExpiresAt === 'number' ? Number(v.roomExpiresAt) : undefined,
      messageTtlSeconds: typeof v?.messageTtlSeconds === 'number' ? Number(v.messageTtlSeconds) : undefined,
      ttlStatus: v?.ttlStatus ? (String(v.ttlStatus) as any) : undefined,
      security: v?.security || undefined,
    };
    input.onRoom(room);
  });
}

export async function subscribeLatestMessagesV2(input: {
  firestore: Firestore;
  roomId: string;
  uid: string;
  limitN?: number;
  /** 관리자 유령 입장: 멤버십·joinedRooms·unread 갱신 없이 메시지 구독만 */
  adminGhost?: boolean;
  onInitial: (messages: ChatMessageV2[], hasMore: boolean) => void;
  onUpserts: (messages: ChatMessageV2[]) => void;
}): Promise<() => void> {
  const N = Math.max(1, Math.min(50, Number(input.limitN || 30)));
  const col = getRoomMessagesItemsColRef(input.firestore, input.roomId);
  const q = query(col, orderBy('createdAt', 'desc'), limit(N));

  // 신규 입장자: joinedRooms.clearedAt 이전 메시지는 숨김
  let minVisibleCreatedAt = 0;
  if (!input.adminGhost) {
    try {
      const jr = await getDoc(getUserJoinedRoomDocRef(input.firestore, input.uid, input.roomId));
      const ca = jr.exists() ? Number((jr.data() as any)?.clearedAt || 0) : 0;
      if (Number.isFinite(ca) && ca > 0) minVisibleCreatedAt = ca;
    } catch {}
  }

  // Enter room clears unread (write-based) — 유령 입장 시 생략
  if (!input.adminGhost) {
    try {
      yyChatFlow('receiver.enterRoom.clearUnread.start', { roomId: input.roomId, uid: input.uid });
    } catch {}
    await enterRoomV2({ firestore: input.firestore, roomId: input.roomId, uid: input.uid });
    try {
      yyChatFlow('receiver.enterRoom.clearUnread.ok', { roomId: input.roomId, uid: input.uid });
    } catch {}
  }

  let first = true;
  const unsub = onSnapshot(q, (snap) => {
    if (first) {
      first = false;
      const arr: ChatMessageV2[] = [];
      snap.forEach((d) => arr.push(toMessageV2(input.roomId, d)));
      const filtered = minVisibleCreatedAt > 0 ? arr.filter((m) => (m.createdAt || 0) >= minVisibleCreatedAt) : arr;
      filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const hasMore = snap.size >= N;
      logDm('subscribe.initial.v2', {
        currentUid: input.uid,
        roomId: input.roomId,
        subscribePath: chatV2Paths.roomMessages(input.roomId),
        count: arr.length,
      });
      // Temporary bridge: only read legacy when v2 path is empty.
      if (filtered.length === 0) {
        (async () => {
          try {
            const legacyCol = getLegacyRoomMessagesColRef(input.firestore, input.roomId);
            const legacyQ = query(legacyCol, orderBy('createdAt', 'desc'), limit(N));
            const legacySnap = await getDocs(legacyQ);
            const bridged: ChatMessageV2[] = [];
            legacySnap.forEach((d) => bridged.push(toLegacyBridgeMessageV2(input.roomId, d)));
            const bridgedFiltered =
              minVisibleCreatedAt > 0 ? bridged.filter((m) => (m.createdAt || 0) >= minVisibleCreatedAt) : bridged;
            bridgedFiltered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            logDm('legacy.bridge.used', {
              currentUid: input.uid,
              roomId: input.roomId,
              legacyBridgeUsed: true,
              migrationCount: 0,
              mergedMessageCount: bridgedFiltered.length,
            });
            if (bridgedFiltered.length > 0) input.onInitial(bridgedFiltered, legacySnap.size >= N);
          } catch (e: any) {
            logDm('legacy.bridge.fail', {
              currentUid: input.uid,
              roomId: input.roomId,
              legacyBridgeUsed: true,
              migrationCount: 0,
              mergedMessageCount: 0,
              error: String(e?.message || e || 'legacy_bridge_failed'),
            });
          }
        })();
      }
      try {
        yyChatFlow('receiver.subscribe.initial', { roomId: input.roomId, count: filtered.length, hasMore, minVisibleCreatedAt });
      } catch {}
      input.onInitial(filtered, hasMore);
      return;
    }
    const changes = snap.docChanges();
    if (!changes.length) return;
    const upserts: ChatMessageV2[] = [];
    changes.forEach((c) => {
      if (c.type === 'removed') return;
      upserts.push(toMessageV2(input.roomId, c.doc));
    });
    const upsertsFiltered =
      minVisibleCreatedAt > 0 ? upserts.filter((m) => (m.createdAt || 0) >= minVisibleCreatedAt) : upserts;
    try {
      yyChatFlow('receiver.subscribe.upserts', { roomId: input.roomId, n: upsertsFiltered.length, minVisibleCreatedAt });
    } catch {}
    if (upsertsFiltered.length) input.onUpserts(upsertsFiltered);
  });

  return unsub;
}

export async function loadOlderMessagesV2(input: {
  firestore: Firestore;
  roomId: string;
  beforeCreatedAt: number;
  /** 신규 입장자: 이 값 미만은 로딩하지 않음 */
  afterCreatedAt?: number;
  limitN?: number;
}): Promise<{ messages: ChatMessageV2[]; hasMore: boolean }> {
  const N = Math.max(1, Math.min(50, Number(input.limitN || 30)));
  const col = getRoomMessagesItemsColRef(input.firestore, input.roomId);
  const after = Math.max(0, Number(input.afterCreatedAt || 0));
  const q =
    after > 0
      ? query(col, where('createdAt', '<', input.beforeCreatedAt), where('createdAt', '>=', after), orderBy('createdAt', 'desc'), limit(N))
      : query(col, where('createdAt', '<', input.beforeCreatedAt), orderBy('createdAt', 'desc'), limit(N));
  const snap = await getDocs(q);
  const arr: ChatMessageV2[] = [];
  snap.forEach((d) => arr.push(toMessageV2(input.roomId, d)));
  arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return { messages: arr, hasMore: snap.size >= N };
}

