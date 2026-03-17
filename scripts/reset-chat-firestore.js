#!/usr/bin/env node
/**
 * Reset chat system: delete all chat-related Firestore data.
 * User accounts (users collection) are NOT modified.
 *
 * Prerequisites:
 *   npm install firebase-admin
 *   Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path,
 *   or use: node scripts/reset-chat-firestore.js --projectId=yooyland-dev
 *
 * Deletes:
 *   - rooms (and each room's subcollections: messages, members, invites)
 *   - users/{uid}/joinedRooms for every user
 *   - Top-level: roomReads, roomIndex, invites (if exist)
 *   - chatCache, roomCache, messageCache (if exist)
 */

const BATCH_SIZE = 500;

async function deleteCollection(db, refOrPath, batchSize = BATCH_SIZE) {
  const col = typeof refOrPath === 'string' ? db.collection(refOrPath) : refOrPath;
  let deleted = 0;
  while (true) {
    const snap = await col.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`  deleted ${deleted} docs\r`);
  }
  return deleted;
}

async function deleteSubcollections(db, roomId) {
  const subcollections = ['messages', 'members', 'invites'];
  for (const sub of subcollections) {
    const path = `rooms/${roomId}/${sub}`;
    const n = await deleteCollection(db, path);
    if (n > 0) console.log(`    ${path}: ${n}`);
  }
}

async function main() {
  let projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  const projectArg = process.argv.find((a) => a.startsWith('--projectId='));
  if (projectArg) projectId = projectArg.split('=')[1];
  if (!projectId) {
    console.error('Set projectId: --projectId=yooyland-dev or env GOOGLE_CLOUD_PROJECT');
    process.exit(1);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.error('Install firebase-admin: npm install firebase-admin');
    process.exit(1);
  }

  if (!admin.apps.length) {
    try {
      admin.initializeApp({ projectId });
    } catch (e) {
      console.error('Initialize failed. Set GOOGLE_APPLICATION_CREDENTIALS to service account JSON path, or run: gcloud auth application-default login');
      process.exit(1);
    }
  }

  const db = admin.firestore();

  console.log('Deleting chat data (users collection untouched)...\n');

  // 1) For each room: delete subcollections then the room doc
  const roomsSnap = await db.collection('rooms').get();
  const roomIds = roomsSnap.docs.map((d) => d.id);
  console.log(`Rooms to delete: ${roomIds.length}`);

  for (const roomId of roomIds) {
    await deleteSubcollections(db, roomId);
    await db.collection('rooms').doc(roomId).delete();
  }
  console.log(`Deleted ${roomIds.length} room documents.\n`);

  // 2) Every user's joinedRooms subcollection
  const usersSnap = await db.collection('users').get();
  let joinedTotal = 0;
  for (const userDoc of usersSnap.docs) {
    const n = await deleteCollection(db, userDoc.ref.collection('joinedRooms'));
    if (n > 0) {
      console.log(`  users/${userDoc.id}/joinedRooms: ${n}`);
      joinedTotal += n;
    }
  }
  console.log(`Deleted joinedRooms: ${joinedTotal} total.\n`);

  // 3) Top-level optional collections
  const topLevel = ['roomReads', 'roomIndex', 'invites', 'chatCache', 'roomCache', 'messageCache'];
  for (const name of topLevel) {
    try {
      const n = await deleteCollection(db, name);
      if (n > 0) console.log(`${name}: ${n} docs deleted.`);
    } catch (e) {
      // collection may not exist
    }
  }

  console.log('\nChat reset complete. User accounts unchanged.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
