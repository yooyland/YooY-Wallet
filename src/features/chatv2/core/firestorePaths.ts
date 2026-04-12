import { assertValidRoomId } from '../utils/roomId';

export const chatV2Paths = {
  rooms: () => `rooms`,
  room: (roomId: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.room');
    return `rooms/${id}`;
  },

  roomMembers: (roomId: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.roomMembers');
    return `roomMembers/${id}/members`;
  },
  roomMember: (roomId: string, uid: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.roomMember');
    return `roomMembers/${id}/members/${uid}`;
  },

  roomMessages: (roomId: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.roomMessages');
    return `roomMessages/${id}/items`;
  },
  roomMessage: (roomId: string, messageId: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.roomMessage');
    const mid = String(messageId || '').trim();
    if (!mid) throw new Error('invalid_message_id');
    return `roomMessages/${id}/items/${mid}`;
  },

  userJoinedRooms: (uid: string) => `users/${uid}/joinedRooms`,
  userJoinedRoom: (uid: string, roomId: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.userJoinedRoom');
    return `users/${uid}/joinedRooms/${id}`;
  },

  /** users/{uid}/chatRoomPrefs/{roomId} (레거시: userRoomPreferences/${uid}_${roomId}) */
  userRoomPreference: (uid: string, roomId: string) => {
    const id = assertValidRoomId(roomId, 'chatV2Paths.userRoomPreference');
    return `users/${uid}/chatRoomPrefs/${id}`;
  },
} as const;
