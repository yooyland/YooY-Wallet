import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, onRequest, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { CollectionReference, Transaction } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Clean up expired TTL rooms every 5 minutes
export const cleanupExpiredRooms = onSchedule('every 5 minutes', async () => {
  const now = Date.now();
  logger.info('Starting cleanup of expired TTL rooms');

  try {
    // Find all TTL rooms that have expired
    const expiredRoomsQuery = await db
      .collection('rooms')
      .where('isTTL', '==', true)
      .where('expiresAt', '<=', now)
      .where('isExpired', '==', false)
      .get();

    if (expiredRoomsQuery.empty) {
      logger.info('No expired TTL rooms found');
      return;
    }

    logger.info(`Found ${expiredRoomsQuery.size} expired TTL rooms`);

    // Process each expired room
    const batch = db.batch();
    const roomIds: string[] = [];

    for (const roomDoc of expiredRoomsQuery.docs) {
      const roomId = roomDoc.id;
      roomIds.push(roomId);

      // Mark room as expired
      batch.update(roomDoc.ref, {
        isExpired: true,
        expiredAt: now,
      });

      // Delete all messages in the room
      const messagesQuery = await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .get();

      messagesQuery.docs.forEach((messageDoc) => {
        batch.delete(messageDoc.ref);
      });

      // Delete typing indicators
      const typingQuery = await db
        .collection('rooms')
        .doc(roomId)
        .collection('typing')
        .get();

      typingQuery.docs.forEach((typingDoc) => {
        batch.delete(typingDoc.ref);
      });

      logger.info(`Marked room ${roomId} as expired and queued messages for deletion`);
    }

    // Commit all changes
    await batch.commit();
    logger.info(`Successfully cleaned up ${roomIds.length} expired TTL rooms`);

    // Send notification to room members about expiration
    for (const roomId of roomIds) {
      await notifyRoomExpiration(roomId);
    }

  } catch (error) {
    logger.error('Error cleaning up expired TTL rooms:', error);
  }
});

// Clean up expired TTL messages every 2 minutes
export const cleanupTTLMessages = onSchedule('every 2 minutes', async () => {
  const now = Date.now();
  logger.info('Starting cleanup of expired TTL messages');

  try {
    // Find all messages with TTL that have expired
    const expiredMessagesQuery = await db
      .collectionGroup('messages')
      .where('ttlSeconds', '>', 0)
      .get();

    if (expiredMessagesQuery.empty) {
      logger.info('No TTL messages found');
      return;
    }

    logger.info(`Found ${expiredMessagesQuery.size} TTL messages to check`);

    const batch = db.batch();
    let deletedCount = 0;

    for (const messageDoc of expiredMessagesQuery.docs) {
      const messageData = messageDoc.data();
      const createdAt = messageData.createdAt?.toMillis() || 0;
      const ttlSeconds = messageData.ttlSeconds || 0;
      const expiresAt = createdAt + (ttlSeconds * 1000);

      if (now >= expiresAt) {
        batch.delete(messageDoc.ref);
        deletedCount++;
        logger.info(`Queued TTL message ${messageDoc.id} for deletion`);
      }
    }

    if (deletedCount > 0) {
      await batch.commit();
      logger.info(`Successfully deleted ${deletedCount} expired TTL messages`);
    } else {
      logger.info('No expired TTL messages found');
    }

  } catch (error) {
    logger.error('Error cleaning up expired TTL messages:', error);
  }
});

// Handle new TTL room creation
export const onTTLRoomCreated = onDocumentCreated('rooms/{roomId}', async (event) => {
  const roomData = event.data?.data();
  const roomId = event.params.roomId;

  if (!roomData || !roomData.isTTL) {
    return;
  }

  logger.info(`New TTL room created: ${roomId}`);

  try {
    // Set up automatic cleanup when room expires
    const expiresAt = roomData.expiresAt;
    if (expiresAt) {
      const delay = expiresAt - Date.now();
      if (delay > 0) {
        // Schedule room expiration notification
        setTimeout(async () => {
          await notifyRoomExpiration(roomId);
        }, delay);
      }
    }

    // Send welcome message to room
    await sendWelcomeMessage(roomId, roomData.name);

  } catch (error) {
    logger.error(`Error handling TTL room creation for ${roomId}:`, error);
  }
});

// Handle room deletion cleanup
export const onRoomDeleted = onDocumentDeleted('rooms/{roomId}', async (event) => {
  const roomId = event.params.roomId;
  logger.info(`Room deleted: ${roomId}`);

  try {
    // Clean up all related data
    const batch = db.batch();

    // Delete all messages
    const messagesQuery = await db
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .get();

    messagesQuery.docs.forEach((messageDoc) => {
      batch.delete(messageDoc.ref);
    });

    // Delete typing indicators
    const typingQuery = await db
      .collection('rooms')
      .doc(roomId)
      .collection('typing')
      .get();

    typingQuery.docs.forEach((typingDoc) => {
      batch.delete(typingDoc.ref);
    });

    await batch.commit();
    logger.info(`Successfully cleaned up data for deleted room ${roomId}`);

  } catch (error) {
    logger.error(`Error cleaning up deleted room ${roomId}:`, error);
  }
});

// Helper function to notify room members about expiration
async function notifyRoomExpiration(roomId: string) {
  try {
    const roomDoc = await db.collection('rooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return;
    }

    const roomData = roomDoc.data();
    const members = roomData?.members || [];

    // Send notification to each member
    for (const memberId of members) {
      await sendNotification(memberId, {
        title: 'TTL Room Expired',
        body: `The room "${roomData?.name}" has expired and been deleted.`,
        data: {
          type: 'room_expired',
          roomId,
        },
      });
    }

    logger.info(`Sent expiration notifications for room ${roomId}`);

  } catch (error) {
    logger.error(`Error notifying room expiration for ${roomId}:`, error);
  }
}

// Helper function to send welcome message to new TTL room
async function sendWelcomeMessage(roomId: string, roomName: string) {
  try {
    const welcomeMessage = {
      id: `welcome_${Date.now()}`,
      roomId,
      senderId: 'system',
      text: `Welcome to "${roomName}"! This is a TTL (Time To Live) room that will automatically delete itself.`,
      createdAt: Date.now(),
      isSystemMessage: true,
    };

    await db
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .add(welcomeMessage);

    logger.info(`Sent welcome message to TTL room ${roomId}`);

  } catch (error) {
    logger.error(`Error sending welcome message to room ${roomId}:`, error);
  }
}

// Helper function to send push notification
async function sendNotification(userId: string, notification: {
  title: string;
  body: string;
  data?: Record<string, any>;
}) {
  try {
    // Get user's FCM token
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      logger.warn(`No FCM token found for user ${userId}`);
      return;
    }

    // Send notification using FCM Admin SDK
    // This would require setting up FCM Admin SDK
    // For now, we'll just log the notification
    logger.info(`Would send notification to user ${userId}:`, notification);

  } catch (error) {
    logger.error(`Error sending notification to user ${userId}:`, error);
  }
}

// Utility function to get room statistics
export const getRoomStats = async (roomId: string) => {
  try {
    const roomDoc = await db.collection('rooms').doc(roomId).get();
    if (!roomDoc.exists) {
      throw new Error('Room not found');
    }

    const roomData = roomDoc.data();
    const messagesQuery = await db
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .get();

    return {
      roomId,
      name: roomData?.name,
      memberCount: roomData?.members?.length || 0,
      messageCount: messagesQuery.size,
      isTTL: roomData?.isTTL || false,
      expiresAt: roomData?.expiresAt,
      createdAt: roomData?.createdAt,
    };

  } catch (error) {
    logger.error(`Error getting stats for room ${roomId}:`, error);
    throw error;
  }
};

// Utility function to get user's chat statistics
export const getUserChatStats = async (userId: string) => {
  try {
    const roomsQuery = await db
      .collection('rooms')
      .where('members', 'array-contains', userId)
      .get();

    let totalMessages = 0;
    let ttlRooms = 0;
    let normalRooms = 0;

    for (const roomDoc of roomsQuery.docs) {
      const roomData = roomDoc.data();
      if (roomData.isTTL) {
        ttlRooms++;
      } else {
        normalRooms++;
      }

      const messagesQuery = await db
        .collection('rooms')
        .doc(roomDoc.id)
        .collection('messages')
        .get();

      totalMessages += messagesQuery.size;
    }

    return {
      userId,
      totalRooms: roomsQuery.size,
      ttlRooms,
      normalRooms,
      totalMessages,
    };

  } catch (error) {
    logger.error(`Error getting chat stats for user ${userId}:`, error);
    throw error;
  }
};

// ===== Friends: addFriend callable =====
export const addFriend = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

  const phone = (request.data?.phone as string | undefined) || undefined;
  const username = (request.data?.username as string | undefined) || undefined;
  const email = (request.data?.email as string | undefined) || undefined;
  if (!phone && !username && !email) throw new HttpsError('invalid-argument', 'phone | username | email 중 하나가 필요합니다.');

  // Normalize phone (E.164 기대)
  const normPhone = phone ? String(phone).replace(/\D/g, '').replace(/^0+/, '') : undefined;

  const usersRef = db.collection('users');
  let targetSnap = null as FirebaseFirestore.QuerySnapshot | null;
  if (normPhone) targetSnap = await usersRef.where('phone', '==', `+${normPhone}`).limit(1).get();
  else if (username) targetSnap = await usersRef.where('username', '==', username).limit(1).get();
  else if (email) targetSnap = await usersRef.where('email', '==', email).limit(1).get();

  // Helper to ensure not already friends
  const userFriendsRef = usersRef.doc(uid).collection('friends');

  if (targetSnap && !targetSnap.empty) {
    const target = targetSnap.docs[0];
    const targetId = target.id;
    if (targetId === uid) return { status: 'self' };

    const existing = await userFriendsRef.doc(targetId).get();
    if (existing.exists) return { status: 'already' };

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.set(userFriendsRef.doc(targetId), {
      displayName: target.get('displayName') || targetId,
      phone: target.get('phone') || null,
      status: 'linked',
      createdAt: now,
    });
    batch.set(usersRef.doc(targetId).collection('friends').doc(uid), {
      displayName: request.auth?.token?.name || uid,
      phone: request.auth?.token?.phone_number || null,
      status: 'linked',
      createdAt: now,
    });
    await batch.commit();
    return { status: 'linked' };
  }

  // Not found → create invite
  const inviteRef = db.collection('invites').doc();
  await inviteRef.set({
    phone: normPhone ? `+${normPhone}` : null,
    inviterId: uid,
    inviterName: request.auth?.token?.name || uid,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { status: 'invited', inviteId: inviteRef.id };
});

// ===== Chat v2 — admin moderation (callable only; writes via Admin SDK) =====
const APP_ADMIN_EMAILS = new Set(
  ['admin@yooyland.com', 'jch4389@gmail.com', 'landyooy@gmail.com'].map((e) => e.toLowerCase())
);

function assertAppAdminChat(request: CallableRequest): { uid: string; email: string } {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const email = String(request.auth?.token?.email || '')
    .trim()
    .toLowerCase();
  if (!email || !APP_ADMIN_EMAILS.has(email)) {
    throw new HttpsError('permission-denied', '관리자만 이 작업을 할 수 있습니다.');
  }
  return { uid, email };
}

async function deleteQueryInChunks(coll: CollectionReference, chunk: number): Promise<void> {
  for (;;) {
    const snap = await coll.limit(chunk).get();
    if (snap.empty) return;
    const b = db.batch();
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    if (snap.size < chunk) return;
  }
}

/** Full purge: roomMessages/items, roomMembers, joinedRooms, chatRoomPrefs, legacy rooms/messages, room_bans. */
async function purgeChatV2Room(roomId: string): Promise<void> {
  const roomRef = db.collection('rooms').doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'room_not_found');
  }
  const r = roomSnap.data() || {};
  const participantIds: string[] = Array.isArray(r.participantIds)
    ? r.participantIds.map((x: unknown) => String(x)).filter(Boolean)
    : [];

  await deleteQueryInChunks(db.collection('roomMessages').doc(roomId).collection('items'), 400);
  await deleteQueryInChunks(db.collection('roomMembers').doc(roomId).collection('members'), 400);
  await deleteQueryInChunks(roomRef.collection('messages'), 400);

  for (const uid of participantIds) {
    try {
      await db.collection('users').doc(uid).collection('joinedRooms').doc(roomId).delete();
    } catch {
      /* empty */
    }
    try {
      await db.collection('users').doc(uid).collection('chatRoomPrefs').doc(roomId).delete();
    } catch {
      /* empty */
    }
  }

  const bansRef = db.collection('room_bans').doc(roomId);
  try {
    await deleteQueryInChunks(bansRef.collection('uids'), 400);
    await bansRef.delete();
  } catch {
    /* empty */
  }

  await roomRef.delete();
}

export const adminDeleteChatRoomV2 = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  const { uid, email } = assertAppAdminChat(request);
  const roomId = String(request.data?.roomId || '').trim();
  if (!roomId) throw new HttpsError('invalid-argument', 'roomId가 필요합니다.');
  const reason = String(request.data?.reason || '').trim() || null;

  await purgeChatV2Room(roomId);

  await db.collection('admin_audit_logs').add({
    action: 'delete_room',
    roomId,
    actorUid: uid,
    actorEmail: email,
    reason,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

/**
 * Global: user_chat_suspensions/{targetUid}. Per-room: room_bans/{roomId}/uids/{targetUid}.
 */
export const adminSetUserChatSuspensionV2 = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  const { uid, email } = assertAppAdminChat(request);
  const targetUid = String(request.data?.targetUid || '').trim();
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid가 필요합니다.');
  const suspended = request.data?.suspended !== false;
  const reason = String(request.data?.reason || '').trim() || null;
  const durationHours = Math.max(0, Math.min(8760, Number(request.data?.durationHours || 0)));
  const roomIdRaw = request.data?.roomId != null ? String(request.data.roomId || '').trim() : '';
  const roomId = roomIdRaw || '';

  const untilMs =
    durationHours > 0 ? Date.now() + durationHours * 3600000 : null;

  if (roomId) {
    const ref = db.collection('room_bans').doc(roomId).collection('uids').doc(targetUid);
    if (!suspended) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({
        banned: true,
        reason,
        untilMs,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: uid,
        updatedByEmail: email,
      });
    }
    await db.collection('admin_audit_logs').add({
      action: suspended ? 'room_ban' : 'room_unban',
      roomId,
      targetUid,
      actorUid: uid,
      actorEmail: email,
      reason,
      durationHours: suspended ? durationHours : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    const ref = db.collection('user_chat_suspensions').doc(targetUid);
    if (!suspended) {
      await ref.delete().catch(() => {});
    } else {
      await ref.set({
        suspended: true,
        reason,
        untilMs,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: uid,
        updatedByEmail: email,
      });
    }
    await db.collection('admin_audit_logs').add({
      action: suspended ? 'suspend_user' : 'unsuspend_user',
      targetUid,
      actorUid: uid,
      actorEmail: email,
      reason,
      durationHours: suspended ? durationHours : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return { ok: true };
});

/**
 * Apple Sign in (iOS) – dedicated auth path
 *
 * 요구사항 대응:
 * - Apple identityToken: 서버에서 best-effort로 검증(서명/만료/issuer/audience)
 * - 이메일 기반 기존 계정 매칭/링크는 하지 않고, Apple sub 기반 uid로 Custom Token 발급
 * - 검증 실패 시 에러로 막지 않고 로그만 남기며, 동작은 계속 진행(심사/사용성 우선)
 */
export const appleAuthV2 = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  const startedAt = Date.now();
  const identityToken = String((request.data as any)?.identityToken || '').trim();
  const appleUser = String((request.data as any)?.user || '').trim();
  const audience = String((request.data as any)?.audience || '').trim(); // optional

  // Helper: base64url decode
  const b64url = (s: string) => {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64');
  };
  const safeJson = (b: Buffer) => {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  };

  let verified = false;
  let uid = `apple-unverified:${appleUser || `anon-${Date.now()}`}`;

  if (!identityToken) {
    logger.warn('[appleAuthV2] missing identityToken');
    const customToken = await getAdminAuth().createCustomToken(uid, { appleVerified: false });
    return { customToken, verified: false, uid };
  }

  try {
    const parts = identityToken.split('.');
    if (parts.length !== 3) throw new Error('jwt_parts_invalid');
    const header = safeJson(b64url(parts[0])) || {};
    const payload = safeJson(b64url(parts[1])) || {};
    const signature = b64url(parts[2]);
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');

    const kid = String(header?.kid || '');
    const alg = String(header?.alg || '');
    if (alg !== 'RS256') throw new Error(`jwt_alg_unsupported:${alg}`);

    const jwksRes = await fetch('https://appleid.apple.com/auth/keys', { method: 'GET' });
    const jwksJson = await jwksRes.json().catch(() => null as any);
    const keys = Array.isArray(jwksJson?.keys) ? jwksJson.keys : [];
    const jwk = keys.find((k: any) => String(k?.kid || '') === kid) || null;
    if (!jwk) throw new Error('apple_jwk_not_found');

    const x5c0 = Array.isArray(jwk?.x5c) ? String(jwk.x5c[0] || '') : '';
    if (!x5c0) throw new Error('apple_x5c_missing');
    const certPem = `-----BEGIN CERTIFICATE-----\n${x5c0}\n-----END CERTIFICATE-----\n`;
    const publicKey = crypto.createPublicKey(certPem);
    const ok = crypto.verify('RSA-SHA256', signingInput, publicKey, signature);
    if (!ok) throw new Error('jwt_signature_invalid');

    // Best-effort claim checks (log only)
    const iss = String(payload?.iss || '');
    const sub = String(payload?.sub || '');
    const aud = payload?.aud;
    const exp = Number(payload?.exp || 0);
    const now = Math.floor(Date.now() / 1000);
    if (iss && iss !== 'https://appleid.apple.com') {
      logger.warn('[appleAuthV2] iss mismatch', { iss });
    }
    if (audience) {
      const audOk = Array.isArray(aud) ? aud.includes(audience) : String(aud || '') === audience;
      if (!audOk) logger.warn('[appleAuthV2] aud mismatch', { aud, expected: audience });
    }
    if (exp && now > exp) {
      logger.warn('[appleAuthV2] token expired', { exp, now });
    }

    if (sub) {
      uid = `apple:${sub}`;
      verified = true;
    }
  } catch (e: any) {
    logger.warn('[appleAuthV2] verify failed (ignored)', { message: String(e?.message || e) });
  }

  const customToken = await getAdminAuth().createCustomToken(uid, { appleVerified: verified });
  logger.info('[appleAuthV2] issued', { uid, verified, ms: Date.now() - startedAt });
  return { customToken, verified, uid };
});

/**
 * Account deletion (App Store review requirement)
 * - Deletes Firebase Auth user
 * - Best-effort deletes Firestore user document and its subcollections
 *
 * Notes:
 * - Callable requires authenticated user.
 * - Uses Admin SDK so it does not require "recent login" on the client.
 */
export const deleteMyAccountV1 = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

  const startedAt = Date.now();
  logger.info('[deleteMyAccountV1] start', { uid });

  // 1) Firestore user doc cleanup (best-effort)
  try {
    const userRef = db.collection('users').doc(uid);
    // recursiveDelete is available in Admin Firestore SDK (Node 18+/v10+). Guard just in case.
    const anyDb = db as any;
    if (typeof anyDb.recursiveDelete === 'function') {
      await anyDb.recursiveDelete(userRef);
    } else {
      // Fallback: delete a few known subcollections + doc
      const subcols = ['friends', 'joinedRooms', 'chatRoomPrefs', 'notifications'];
      for (const c of subcols) {
        try {
          const snap = await userRef.collection(c).get();
          if (!snap.empty) {
            const batch = db.batch();
            snap.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (e) {
          logger.warn('[deleteMyAccountV1] subcollection delete failed (ignored)', { uid, c });
        }
      }
      await userRef.delete().catch(() => {});
    }
  } catch (e: any) {
    logger.warn('[deleteMyAccountV1] firestore cleanup failed (ignored)', { uid, message: String(e?.message || e) });
  }

  // 2) Auth user deletion
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (e: any) {
    logger.warn('[deleteMyAccountV1] auth delete failed (ignored)', { uid, message: String(e?.message || e) });
  }

  logger.info('[deleteMyAccountV1] done', { uid, ms: Date.now() - startedAt });
  return { ok: true };
});

// ----- Internal YOY (treasury ↔ users; rewards & TTL fees) -----
const YOY_COL = 'internal_yoy_balances';
const YOY_CLAIMS = 'internal_yoy_claims';
const YOY_OPS = 'internal_yoy_ops';
const YOY_EVENTS_SUBCOL = 'internalYoyEvents';
const YOY_TREASURY_CONFIG_DOC = 'system/internalYoyTreasury';
const YOY_TREASURY_ID_FALLBACK = '__treasury__';
const YOY_TREASURY_EMAIL = 'admin@yooyland.com';
const YOY_INSTALL = 3;
const YOY_INVITER = 2;
const YOY_DAILY = 1;
const YOY_TTL_EXTEND = 10;
const YOY_INITIAL_TREASURY = 10_000_000;

function yoyDoc(id: string) {
  return db.collection(YOY_COL).doc(id);
}

async function readYoyBalTx(tx: Transaction, id: string): Promise<number> {
  const s = await tx.get(yoyDoc(id));
  if (!s.exists) return 0;
  const n = Number((s.data() as any)?.balanceYoy ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function writeYoyBalTx(tx: Transaction, id: string, balanceYoy: number) {
  tx.set(
    yoyDoc(id),
    { balanceYoy, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

function yoyEventDoc(uid: string, eventId: string) {
  return db.collection('users').doc(uid).collection(YOY_EVENTS_SUBCOL).doc(eventId);
}

function ensureTreasurySeedTx(tx: Transaction, treasuryId: string, treasuryBefore: number, exists: boolean): number {
  if (!exists) {
    writeYoyBalTx(tx, treasuryId, YOY_INITIAL_TREASURY);
    return YOY_INITIAL_TREASURY;
  }
  return treasuryBefore;
}

function validTtlCreateAmount(n: number): boolean {
  return n === 3 || n === 30;
}

/**
 * install_welcome | daily_checkin | ttl_create_charge | ttl_create_refund | ttl_extend_charge | ttl_extend_refund
 */
/** 웹(yooyland.com) 포함 브라우저 callable preflight — 명시 origin이 일부 환경에서 `cors: true`보다 안정적 */
const INTERNAL_YOY_LEDGER_CORS: (string | RegExp)[] = [
  /^https:\/\/([\w-]+\.)*yooyland\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

let treasuryIdCache: { id: string; at: number } | null = null;
async function resolveTreasuryId(): Promise<string> {
  const env = String(process.env.YOY_TREASURY_UID || process.env.EXPO_PUBLIC_YOY_TREASURY_UID || '').trim();
  if (env) return env;
  if (treasuryIdCache && Date.now() - treasuryIdCache.at < 10 * 60 * 1000) return treasuryIdCache.id;
  // 1) Firestore config (운영/개발 모두 동일하게 사용 가능)
  try {
    const snap = await db.doc(YOY_TREASURY_CONFIG_DOC).get();
    if (snap.exists) {
      const id = String((snap.data() as any)?.uid || '').trim();
      if (id) {
        treasuryIdCache = { id, at: Date.now() };
        return id;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const u = await getAdminAuth().getUserByEmail(YOY_TREASURY_EMAIL);
    const id = String(u?.uid || '').trim() || YOY_TREASURY_ID_FALLBACK;
    treasuryIdCache = { id, at: Date.now() };
    return id;
  } catch {
    return YOY_TREASURY_ID_FALLBACK;
  }
}

/** 관리자: 내부 YOY treasury UID 설정 (system/internalYoyTreasury.uid) */
export const adminSetInternalYoyTreasuryUidV1 = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  const { uid: adminUid } = assertAppAdminChat(request);
  const nextUid = String((request.data as any)?.uid || '').trim();
  if (!nextUid) throw new HttpsError('invalid-argument', 'missing_uid');
  try {
    await getAdminAuth().getUser(nextUid);
  } catch {
    throw new HttpsError('not-found', 'user_not_found');
  }
  await db.doc(YOY_TREASURY_CONFIG_DOC).set(
    {
      uid: nextUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: adminUid,
    },
    { merge: true }
  );
  // cache refresh
  treasuryIdCache = { id: nextUid, at: Date.now() };
  return { ok: true, uid: nextUid };
});

/**
 * 웹 CORS 우회용 HTTP 프록시. (Upbit/Binance/ExchangeRate 등)
 * - allowlist origin + allowlist target host
 * - GET only
 * - 짧은 메모리 캐시로 429/과금/지연 완화
 */
const PROXY_TARGET_HOST_ALLOWLIST = new Set([
  'api.upbit.com',
  'api.binance.com',
  'api.exchangerate-api.com',
]);
const PROXY_CACHE_MS = 10_000;
const proxyCache = new Map<string, { exp: number; status: number; headers: Record<string, string>; body: string }>();

export const proxyV1 = onRequest(async (req, res) => {
  try {
    const origin = String(req.headers.origin || '');
    const allowOrigin = INTERNAL_YOY_LEDGER_CORS.some((p) => (typeof p === 'string' ? p === origin : p.test(origin)));

    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const raw = String(req.query.url || '').trim();
    if (!raw) {
      res.status(400).json({ ok: false, error: 'missing_url' });
      return;
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      res.status(400).json({ ok: false, error: 'invalid_url' });
      return;
    }

    if (target.protocol !== 'https:') {
      res.status(400).json({ ok: false, error: 'https_only' });
      return;
    }
    if (!PROXY_TARGET_HOST_ALLOWLIST.has(target.hostname)) {
      res.status(403).json({ ok: false, error: 'host_not_allowed', host: target.hostname });
      return;
    }

    const cacheKey = `${target.hostname}${target.pathname}?${target.searchParams.toString()}`;
    const now = Date.now();
    const cached = proxyCache.get(cacheKey);
    if (cached && cached.exp > now) {
      for (const [k, v] of Object.entries(cached.headers)) res.setHeader(k, v);
      res.status(cached.status).send(cached.body);
      return;
    }

    const startedAt = Date.now();
    const r = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'yooyland-proxyV1',
      },
    });
    const body = await r.text();
    const headers: Record<string, string> = {
      'Content-Type': String(r.headers.get('content-type') || 'application/json; charset=utf-8'),
      'Cache-Control': 'no-store',
      'X-Proxy-Elapsed-Ms': String(Date.now() - startedAt),
    };
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.status(r.status).send(body);

    // cache: only for successful responses (and 일부 429 완화용으로 짧게 저장 가능)
    if (r.status >= 200 && r.status < 300) {
      proxyCache.set(cacheKey, { exp: now + PROXY_CACHE_MS, status: r.status, headers, body });
      // 간단한 메모리 제한
      if (proxyCache.size > 500) {
        for (const [k, v] of proxyCache.entries()) {
          if (v.exp <= now) proxyCache.delete(k);
          if (proxyCache.size <= 400) break;
        }
      }
    }
  } catch (e: any) {
    logger.error('[proxyV1] error', { message: String(e?.message || e) });
    res.status(500).json({ ok: false, error: 'proxy_failed' });
  }
});

export const internalYoyLedgerV1 = onCall(
  { cors: INTERNAL_YOY_LEDGER_CORS, enforceAppCheck: false },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

  const action = String((request.data as any)?.action || '').trim();
  const startedAt = Date.now();
  const treasuryId = await resolveTreasuryId();

  try {
    if (action === 'install_welcome') {
      const referrerRaw = String((request.data as any)?.referrerUid || '').trim();
      let referrerUid: string | null = null;
      if (referrerRaw && referrerRaw !== uid) {
        try {
          await getAdminAuth().getUser(referrerRaw);
          referrerUid = referrerRaw;
        } catch {
          referrerUid = null;
        }
      }

      let already = false;
      let inviterCredited = false;
      let userYoy = 0;
      let treasuryYoy = 0;

      await db.runTransaction(async (tx) => {
        const installClaimRef = db.collection(YOY_CLAIMS).doc(`install_${uid}`);
        const treasuryRef = yoyDoc(treasuryId);
        const userRef = yoyDoc(uid);
        const rbRef = referrerUid ? db.collection(YOY_CLAIMS).doc(`ref_bonus_${referrerUid}_${uid}`) : null;
        const refBalRef = referrerUid ? yoyDoc(referrerUid) : null;

        // IMPORTANT: In Firestore transactions, all reads must happen before any writes.
        const [ic, trSnap, uSnap, rbSnap, rSnap] = await Promise.all([
          tx.get(installClaimRef),
          tx.get(treasuryRef),
          tx.get(userRef),
          rbRef ? tx.get(rbRef) : Promise.resolve(null as any),
          refBalRef ? tx.get(refBalRef) : Promise.resolve(null as any),
        ]);

        if (ic.exists) {
          already = true;
          // safe: snapshots already read
          const u1 = Number((uSnap.data() as any)?.balanceYoy ?? 0);
          const t1 = Number((trSnap.data() as any)?.balanceYoy ?? 0);
          userYoy = Number.isFinite(u1) ? Math.max(0, Math.floor(u1)) : 0;
          treasuryYoy = Number.isFinite(t1) ? Math.max(0, Math.floor(t1)) : 0;
          return;
        }

        const tRaw = trSnap.exists ? Number((trSnap.data() as any)?.balanceYoy ?? 0) : YOY_INITIAL_TREASURY;
        let tbal = Number.isFinite(tRaw) ? Math.max(0, Math.floor(tRaw)) : 0;

        let need = YOY_INSTALL;
        const canCreditInviter = Boolean(referrerUid && rbSnap && !rbSnap.exists);
        if (canCreditInviter) need += YOY_INVITER;
        if (tbal < need) {
          throw new HttpsError('failed-precondition', 'treasury_insufficient');
        }

        const uRaw = uSnap.exists ? Number((uSnap.data() as any)?.balanceYoy ?? 0) : 0;
        const u0 = Number.isFinite(uRaw) ? Math.max(0, Math.floor(uRaw)) : 0;

        // writes start here (no more tx.get after this point)
        writeYoyBalTx(tx, uid, u0 + YOY_INSTALL);
        writeYoyBalTx(tx, treasuryId, tbal - YOY_INSTALL);
        tx.set(installClaimRef, { kind: 'install', uid, at: FieldValue.serverTimestamp() });
        tx.set(
          yoyEventDoc(uid, `install_${uid}`),
          {
            action: 'install_welcome',
            deltaYoy: YOY_INSTALL,
            balanceAfter: u0 + YOY_INSTALL,
            treasuryAfter: tbal - YOY_INSTALL,
            at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        let t2 = tbal - YOY_INSTALL;
        if (canCreditInviter && referrerUid) {
          const rRaw = rSnap?.exists ? Number((rSnap.data() as any)?.balanceYoy ?? 0) : 0;
          const r0 = Number.isFinite(rRaw) ? Math.max(0, Math.floor(rRaw)) : 0;
          writeYoyBalTx(tx, referrerUid, r0 + YOY_INVITER);
          writeYoyBalTx(tx, treasuryId, t2 - YOY_INVITER);
          t2 -= YOY_INVITER;
          if (rbRef) tx.set(rbRef, { kind: 'ref_bonus', referrerUid, inviteeUid: uid, at: FieldValue.serverTimestamp() });
          tx.set(
            yoyEventDoc(referrerUid, `ref_bonus_${referrerUid}_${uid}`),
            {
              action: 'ref_bonus',
              deltaYoy: YOY_INVITER,
              balanceAfter: r0 + YOY_INVITER,
              treasuryAfter: t2,
              at: FieldValue.serverTimestamp(),
              meta: { inviteeUid: uid },
            },
            { merge: true }
          );
          inviterCredited = true;
        }
        userYoy = u0 + YOY_INSTALL;
        treasuryYoy = t2;
      });

      logger.info('[internalYoyLedgerV1] install_welcome', { uid, already, inviterCredited, ms: Date.now() - startedAt });
      return {
        ok: true,
        already,
        installCredited: already ? 0 : YOY_INSTALL,
        inviterCredited,
        userYoy,
        treasuryYoy,
      };
    }

    if (action === 'daily_checkin') {
      const day = new Date().toISOString().slice(0, 10);
      const claimRef = db.collection(YOY_CLAIMS).doc(`daily_${uid}_${day}`);
      let already = false;
      let userYoy = 0;
      let treasuryYoy = 0;

      await db.runTransaction(async (tx) => {
        const treasuryRef = yoyDoc(treasuryId);
        const userRef = yoyDoc(uid);

        // IMPORTANT: In Firestore transactions, all reads must happen before any writes.
        const [c, trSnap, uSnap] = await Promise.all([tx.get(claimRef), tx.get(treasuryRef), tx.get(userRef)]);

        if (c.exists) {
          already = true;
          const u1 = Number((uSnap.data() as any)?.balanceYoy ?? 0);
          const t1 = Number((trSnap.data() as any)?.balanceYoy ?? 0);
          userYoy = Number.isFinite(u1) ? Math.max(0, Math.floor(u1)) : 0;
          treasuryYoy = Number.isFinite(t1) ? Math.max(0, Math.floor(t1)) : 0;
          return;
        }
        const tRaw = trSnap.exists ? Number((trSnap.data() as any)?.balanceYoy ?? 0) : YOY_INITIAL_TREASURY;
        let tbal = Number.isFinite(tRaw) ? Math.max(0, Math.floor(tRaw)) : 0;
        if (tbal < YOY_DAILY) {
          throw new HttpsError('failed-precondition', 'treasury_insufficient');
        }

        const uRaw = uSnap.exists ? Number((uSnap.data() as any)?.balanceYoy ?? 0) : 0;
        const u0 = Number.isFinite(uRaw) ? Math.max(0, Math.floor(uRaw)) : 0;

        // writes start here (no more tx.get after this point)
        writeYoyBalTx(tx, uid, u0 + YOY_DAILY);
        writeYoyBalTx(tx, treasuryId, tbal - YOY_DAILY);
        tx.set(claimRef, { kind: 'daily', uid, day, at: FieldValue.serverTimestamp() });
        tx.set(
          yoyEventDoc(uid, `daily_${uid}_${day}`),
          {
            action: 'daily_checkin',
            deltaYoy: YOY_DAILY,
            balanceAfter: u0 + YOY_DAILY,
            treasuryAfter: tbal - YOY_DAILY,
            at: FieldValue.serverTimestamp(),
            meta: { day },
          },
          { merge: true }
        );
        userYoy = u0 + YOY_DAILY;
        treasuryYoy = tbal - YOY_DAILY;
      });

      logger.info('[internalYoyLedgerV1] daily_checkin', { uid, already, ms: Date.now() - startedAt });
      return { ok: true, already, dailyCredited: already ? 0 : YOY_DAILY, userYoy, treasuryYoy };
    }

    if (action === 'ttl_create_charge') {
      const opId = String((request.data as any)?.opId || '').trim();
      const amount = Math.floor(Number((request.data as any)?.amount || 0));
      if (!opId || opId.length < 8) throw new HttpsError('invalid-argument', 'opId_required');
      if (!validTtlCreateAmount(amount)) throw new HttpsError('invalid-argument', 'invalid_amount');

      const opRef = db.collection(YOY_OPS).doc(opId);
      let userYoy = 0;
      let treasuryYoy = 0;

      await db.runTransaction(async (tx) => {
        const opSnap = await tx.get(opRef);
        if (opSnap.exists) {
          const st = String((opSnap.data() as any)?.status || '');
          if (st === 'charged' || st === 'settled') {
            userYoy = await readYoyBalTx(tx, uid);
            treasuryYoy = await readYoyBalTx(tx, treasuryId);
            return;
          }
          throw new HttpsError('already-exists', 'op_conflict');
        }
        const u0 = await readYoyBalTx(tx, uid);
        if (u0 < amount) {
          throw new HttpsError('failed-precondition', 'insufficient_user_yoy');
        }
        const trSnap = await tx.get(yoyDoc(treasuryId));
        let tbal = await readYoyBalTx(tx, treasuryId);
        tbal = ensureTreasurySeedTx(tx, treasuryId, tbal, trSnap.exists);
        writeYoyBalTx(tx, uid, u0 - amount);
        writeYoyBalTx(tx, treasuryId, tbal + amount);
        tx.set(opRef, {
          kind: 'ttl_create',
          uid,
          amount,
          status: 'charged',
          at: FieldValue.serverTimestamp(),
        });
        tx.set(
          yoyEventDoc(uid, `ttl_create_charge_${opId}`),
          {
            action: 'ttl_create_charge',
            deltaYoy: -amount,
            balanceAfter: u0 - amount,
            treasuryAfter: tbal + amount,
            at: FieldValue.serverTimestamp(),
            meta: { opId, amount },
          },
          { merge: true }
        );
        userYoy = u0 - amount;
        treasuryYoy = tbal + amount;
      });

      logger.info('[internalYoyLedgerV1] ttl_create_charge', { uid, opId, amount, ms: Date.now() - startedAt });
      return { ok: true, userYoy, treasuryYoy, opId };
    }

    if (action === 'ttl_create_refund') {
      const opId = String((request.data as any)?.opId || '').trim();
      if (!opId) throw new HttpsError('invalid-argument', 'opId_required');
      const opRef = db.collection(YOY_OPS).doc(opId);
      await db.runTransaction(async (tx) => {
        const opSnap = await tx.get(opRef);
        if (!opSnap.exists) return;
        const d = opSnap.data() as any;
        if (String(d?.uid || '') !== uid) throw new HttpsError('permission-denied', 'op_mismatch');
        if (String(d?.status || '') !== 'charged') return;
        const amount = Math.floor(Number(d?.amount || 0));
        if (!validTtlCreateAmount(amount)) return;
        const u0 = await readYoyBalTx(tx, uid);
        const t0 = await readYoyBalTx(tx, treasuryId);
        writeYoyBalTx(tx, uid, u0 + amount);
        writeYoyBalTx(tx, treasuryId, Math.max(0, t0 - amount));
        tx.set(opRef, { ...d, status: 'refunded', refundedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(
          yoyEventDoc(uid, `ttl_create_refund_${opId}`),
          {
            action: 'ttl_create_refund',
            deltaYoy: amount,
            balanceAfter: u0 + amount,
            treasuryAfter: Math.max(0, t0 - amount),
            at: FieldValue.serverTimestamp(),
            meta: { opId, amount },
          },
          { merge: true }
        );
      });
      logger.info('[internalYoyLedgerV1] ttl_create_refund', { uid, opId, ms: Date.now() - startedAt });
      return { ok: true };
    }

    if (action === 'ttl_extend_charge') {
      const opId = String((request.data as any)?.opId || '').trim();
      const roomId = String((request.data as any)?.roomId || '').trim();
      const amount = Math.floor(Number((request.data as any)?.amount ?? YOY_TTL_EXTEND));
      if (!opId || opId.length < 8) throw new HttpsError('invalid-argument', 'opId_required');
      if (!roomId) throw new HttpsError('invalid-argument', 'roomId_required');
      if (amount !== YOY_TTL_EXTEND) throw new HttpsError('invalid-argument', 'invalid_extend_amount');

      const roomRef = db.collection('rooms').doc(roomId);
      const opRef = db.collection(YOY_OPS).doc(opId);

      let userYoy = 0;
      await db.runTransaction(async (tx) => {
        const treasuryRef = yoyDoc(treasuryId);
        const userRef = yoyDoc(uid);

        // IMPORTANT: all reads first
        const [opSnap, rSnap, trSnap, uSnap] = await Promise.all([
          tx.get(opRef),
          tx.get(roomRef),
          tx.get(treasuryRef),
          tx.get(userRef),
        ]);

        if (opSnap.exists) {
          const st = String((opSnap.data() as any)?.status || '');
          if (st === 'charged' || st === 'settled') {
            const u1 = Number((uSnap.data() as any)?.balanceYoy ?? 0);
            userYoy = Number.isFinite(u1) ? Math.max(0, Math.floor(u1)) : 0;
            return;
          }
          throw new HttpsError('already-exists', 'op_conflict');
        }
        if (!rSnap.exists) throw new HttpsError('not-found', 'room_not_found');
        const r = rSnap.data() as any;
        const typ = String(r?.type || '');
        const isTtl = typ === 'ttl' || r?.isTTL === true;
        const parts: string[] = Array.isArray(r?.participantIds) ? r.participantIds.map((x: unknown) => String(x)) : [];
        const okMember = isTtl && parts.includes(uid);
        if (!okMember) throw new HttpsError('permission-denied', 'not_ttl_member');

        const uRaw = uSnap.exists ? Number((uSnap.data() as any)?.balanceYoy ?? 0) : 0;
        const u0 = Number.isFinite(uRaw) ? Math.max(0, Math.floor(uRaw)) : 0;
        if (u0 < amount) {
          throw new HttpsError('failed-precondition', 'insufficient_user_yoy');
        }
        const tRaw = trSnap.exists ? Number((trSnap.data() as any)?.balanceYoy ?? 0) : YOY_INITIAL_TREASURY;
        let tbal = Number.isFinite(tRaw) ? Math.max(0, Math.floor(tRaw)) : 0;

        // writes start here
        writeYoyBalTx(tx, uid, u0 - amount);
        writeYoyBalTx(tx, treasuryId, tbal + amount);
        tx.set(opRef, {
          kind: 'ttl_extend',
          uid,
          roomId,
          amount,
          status: 'charged',
          at: FieldValue.serverTimestamp(),
        });
        tx.set(
          yoyEventDoc(uid, `ttl_extend_charge_${opId}`),
          {
            action: 'ttl_extend_charge',
            deltaYoy: -amount,
            balanceAfter: u0 - amount,
            treasuryAfter: tbal + amount,
            at: FieldValue.serverTimestamp(),
            meta: { opId, roomId, amount },
          },
          { merge: true }
        );
        userYoy = u0 - amount;
      });

      logger.info('[internalYoyLedgerV1] ttl_extend_charge', { uid, roomId, opId, ms: Date.now() - startedAt });
      return { ok: true, userYoy, opId };
    }

    if (action === 'ttl_extend_refund') {
      const opId = String((request.data as any)?.opId || '').trim();
      if (!opId) throw new HttpsError('invalid-argument', 'opId_required');
      const opRef = db.collection(YOY_OPS).doc(opId);
      await db.runTransaction(async (tx) => {
        const opSnap = await tx.get(opRef);
        if (!opSnap.exists) return;
        const d = opSnap.data() as any;
        if (String(d?.uid || '') !== uid) throw new HttpsError('permission-denied', 'op_mismatch');
        if (String(d?.kind || '') !== 'ttl_extend') return;
        if (String(d?.status || '') !== 'charged') return;
        const amount = Math.floor(Number(d?.amount || YOY_TTL_EXTEND));
        const u0 = await readYoyBalTx(tx, uid);
        const t0 = await readYoyBalTx(tx, treasuryId);
        writeYoyBalTx(tx, uid, u0 + amount);
        writeYoyBalTx(tx, treasuryId, Math.max(0, t0 - amount));
        tx.set(opRef, { ...d, status: 'refunded', refundedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(
          yoyEventDoc(uid, `ttl_extend_refund_${opId}`),
          {
            action: 'ttl_extend_refund',
            deltaYoy: amount,
            balanceAfter: u0 + amount,
            treasuryAfter: Math.max(0, t0 - amount),
            at: FieldValue.serverTimestamp(),
            meta: { opId, amount },
          },
          { merge: true }
        );
      });
      logger.info('[internalYoyLedgerV1] ttl_extend_refund', { uid, opId, ms: Date.now() - startedAt });
      return { ok: true };
    }

    throw new HttpsError('invalid-argument', 'unknown_action');
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    // logger.error가 일부 환경에서 structured log 처리 중 예외를 던지는 케이스가 있어 방어적으로 처리
    const msg = String(e?.message || e || 'internal_error');
    try {
      logger.error('[internalYoyLedgerV1] error', { action, message: msg, stack: String(e?.stack || '') });
    } catch {
      try {
        // eslint-disable-next-line no-console
        console.error('[internalYoyLedgerV1] error', action, msg, e);
      } catch {}
    }
    throw new HttpsError('internal', msg);
  }
});
