import { create } from 'zustand';
import type { ChatMessageV2 } from '../core/messageSchema';
import type { ChatRoomV2 } from '../core/roomSchema';
import { mergeIncomingChatMessageV2 } from './mergeMessageUpsert';
import { normalizeRoomId } from '../utils/roomId';

type RoomMessagesSliceV2 = {
  ids: string[];
  byId: Record<string, ChatMessageV2>;
  /** newest->oldest pagination cursor (createdAt ms) */
  oldestLoadedAt?: number;
  hasMore?: boolean;
};

type ComposerSliceV2 = {
  textDraft: string;
};

type ChatV2State = {
  roomsById: Record<string, ChatRoomV2>;
  roomIds: string[];
  roomMessages: Record<string, RoomMessagesSliceV2>;
  composerByRoomId: Record<string, ComposerSliceV2>;
  currentRoomId?: string;
};

type ChatV2Actions = {
  resetAll: () => void;
  setCurrentRoom: (roomId?: string) => void;

  upsertRoom: (room: ChatRoomV2) => void;
  setRoomIds: (roomIds: string[]) => void;

  /** Replace message list slice (used on initial load). */
  setMessages: (roomId: string, messages: ChatMessageV2[], opts?: { hasMore?: boolean }) => void;
  upsertMessage: (roomId: string, msg: ChatMessageV2) => void;
  patchMessage: (roomId: string, messageId: string, patch: Partial<ChatMessageV2>) => void;
  removeMessage: (roomId: string, messageId: string) => void;
  setRoomHasMore: (roomId: string, hasMore: boolean) => void;
  setRoomOldestLoadedAt: (roomId: string, oldestLoadedAt?: number) => void;

  setDraftText: (roomId: string, textDraft: string) => void;
};

const initial: ChatV2State = {
  roomsById: {},
  roomIds: [],
  roomMessages: {},
  composerByRoomId: {},
  currentRoomId: undefined,
};

export const useChatV2Store = create<ChatV2State & ChatV2Actions>((set) => ({
  ...initial,
  resetAll: () => set({ ...initial }),
  setCurrentRoom: (roomId) => set({ currentRoomId: roomId }),

  upsertRoom: (room) =>
    set((s) => {
      const id = normalizeRoomId(room?.id, 'chatv2.store.upsertRoom');
      if (id === null) return s;
      const prev = s.roomsById[id];
      if (!prev) {
        const safeRoom = { ...room, id };
        return {
          roomsById: { ...s.roomsById, [id]: safeRoom },
          roomIds: s.roomIds.includes(id) ? s.roomIds : [id, ...s.roomIds],
        };
      }
      // joinedRooms 목록 스텁이 rooms/{id} 전체 스냅샷을 덮어쓸 때 createdBy·participantIds 가 비지 않게 병합
      const merged: ChatRoomV2 = { ...prev, ...room, id };
      if (!String(room.createdBy || '').trim() && String(prev.createdBy || '').trim()) {
        merged.createdBy = prev.createdBy;
      }
      if ((!room.participantIds || room.participantIds.length === 0) && prev.participantIds?.length) {
        merged.participantIds = prev.participantIds;
      }
      if ((!room.adminIds || room.adminIds.length === 0) && prev.adminIds?.length) {
        merged.adminIds = prev.adminIds;
      }
      if ((!room.ownerIds || room.ownerIds.length === 0) && prev.ownerIds?.length) {
        merged.ownerIds = prev.ownerIds;
      }
      return {
        roomsById: { ...s.roomsById, [id]: merged },
        roomIds: s.roomIds.includes(id) ? s.roomIds : [id, ...s.roomIds],
      };
    }),

  setRoomIds: (roomIds) =>
    set({
      roomIds: Array.from(
        new Set(
          (roomIds || [])
            .map((x) => normalizeRoomId(x, 'chatv2.store.setRoomIds'))
            .filter((x): x is string => x !== null)
        )
      ),
    }),

  setMessages: (roomId, messages, opts) =>
    set((s) => {
      const byId: Record<string, ChatMessageV2> = {};
      const ids: string[] = [];
      (messages || []).forEach((m) => {
        if (!m?.id) return;
        byId[m.id] = m;
        ids.push(m.id);
      });
      ids.sort((a, b) => (byId[a]?.createdAt || 0) - (byId[b]?.createdAt || 0));
      const oldest = ids.length ? (byId[ids[0]]?.createdAt || undefined) : undefined;
      return {
        roomMessages: {
          ...s.roomMessages,
          [roomId]: { ids, byId, oldestLoadedAt: oldest, hasMore: typeof opts?.hasMore === 'boolean' ? opts.hasMore : true },
        },
      };
    }),

  upsertMessage: (roomId, msg) =>
    set((s) => {
      const slice = s.roomMessages[roomId] || { ids: [], byId: {}, hasMore: true };
      const safeIds = Array.isArray(slice.ids) ? slice.ids : [];
      const safeById = slice.byId && typeof slice.byId === 'object' ? slice.byId : {};
      const exists = !!safeById[msg.id];
      const merged = exists ? mergeIncomingChatMessageV2(safeById[msg.id], msg) : msg;
      const nextById = { ...safeById, [msg.id]: merged };
      const nextIds = exists ? safeIds : [...safeIds, msg.id];
      nextIds.sort((a, b) => (nextById[a]?.createdAt || 0) - (nextById[b]?.createdAt || 0));
      const oldest = nextIds.length ? (nextById[nextIds[0]]?.createdAt || undefined) : undefined;
      return { roomMessages: { ...s.roomMessages, [roomId]: { ...slice, ids: nextIds, byId: nextById, oldestLoadedAt: oldest } } };
    }),

  patchMessage: (roomId, messageId, patch) =>
    set((s) => {
      const slice = s.roomMessages[roomId];
      if (!slice?.byId?.[messageId]) return s as any;
      const next = { ...slice.byId[messageId], ...patch } as ChatMessageV2;
      return {
        roomMessages: {
          ...s.roomMessages,
          [roomId]: { ...slice, byId: { ...slice.byId, [messageId]: next } },
        },
      };
    }),

  removeMessage: (roomId, messageId) =>
    set((s) => {
      const slice = s.roomMessages[roomId];
      if (!slice?.byId?.[messageId]) return s as any;
      const nextById = { ...slice.byId };
      delete nextById[messageId];
      const nextIds = (Array.isArray(slice.ids) ? slice.ids : []).filter((id) => id !== messageId);
      const oldest = nextIds.length ? (nextById[nextIds[0]]?.createdAt || undefined) : undefined;
      return {
        roomMessages: {
          ...s.roomMessages,
          [roomId]: { ...slice, ids: nextIds, byId: nextById, oldestLoadedAt: oldest },
        },
      };
    }),

  setRoomHasMore: (roomId, hasMore) =>
    set((s) => {
      const slice = s.roomMessages[roomId] || { ids: [], byId: {}, hasMore: true };
      return { roomMessages: { ...s.roomMessages, [roomId]: { ...slice, hasMore } } };
    }),

  setRoomOldestLoadedAt: (roomId, oldestLoadedAt) =>
    set((s) => {
      const slice = s.roomMessages[roomId] || { ids: [], byId: {}, hasMore: true };
      return { roomMessages: { ...s.roomMessages, [roomId]: { ...slice, oldestLoadedAt } } };
    }),

  setDraftText: (roomId, textDraft) =>
    set((s) => ({
      composerByRoomId: {
        ...s.composerByRoomId,
        [roomId]: { textDraft },
      },
    })),
}));

