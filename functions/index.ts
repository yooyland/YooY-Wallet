import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

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
