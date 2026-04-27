/** chatv2 Firestore 경로 — RN 앱과 동일 */
export const paths = {
  userJoinedRooms: (uid: string) => `users/${uid}/joinedRooms` as const,
  userFriends: (uid: string) => `users/${uid}/friends` as const,
  userDoc: (uid: string) => `users/${uid}` as const,
  rooms: 'rooms',
  room: (roomId: string) => `rooms/${roomId}`,
  roomMessages: (roomId: string) => `roomMessages/${roomId}/items`,
  internalYoyBalance: (uid: string) => `internal_yoy_balances/${uid}`,
};
