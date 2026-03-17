/**
 * Reset chat data to a clean state (local only).
 * Does NOT touch Firestore; run scripts/reset-chat-firestore.js for server data.
 *
 * Clears:
 * - AsyncStorage: yoo-kakao-rooms-store, chatCache, roomCache, messageCache
 * - In-memory Kakao rooms store (rooms, messages, etc.)
 *
 * After this, the chat list will be empty and new rooms can be created normally.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';

const CHAT_STORAGE_KEYS = [
  'yoo-kakao-rooms-store',
  'chatCache',
  'roomCache',
  'messageCache',
];

export async function resetChatDataLocal(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(CHAT_STORAGE_KEYS);
  } catch (e) {
    // ignore
  }

  try {
    useKakaoRoomsStore.setState({
      rooms: [],
      messages: {},
      roomSettings: {},
      typing: {},
      hiddenByRoom: {},
      currentRoomId: null,
      roomSubs: {},
    });
  } catch (e) {
    // ignore
  }
}
