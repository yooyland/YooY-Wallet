import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { ChatMessageV2 } from '../core/messageSchema';
import type { ChatRoomV2 } from '../core/roomSchema';
import { filterVisibleMessagesV2, getMessageExpireSecondsV2 } from '../core/ttlEngine';
import { isMessageHiddenForUser } from '../services/messageReactionService';
import { useChatV2Store } from '../store/chatv2.store';
import { MessageBubbleV2 } from './MessageBubbleV2';
import { isRoomModeratorV2 } from '../core/roomPermissions';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';

type Props = {
  room: ChatRoomV2;
  uid: string;
  /** DM에서 상대의 roomMembers … lastReadAt (읽음 표시용) */
  peerLastReadAt?: number | null;
  onLoadOlder?: () => Promise<void> | void;
  onOpenMedia?: (msg: ChatMessageV2, opts?: { albumIndex?: number }) => void;
  onReact?: (msg: ChatMessageV2) => void;
  onApplyReaction?: (msg: ChatMessageV2, emoji: string) => void;
  onHideMessage?: (msg: ChatMessageV2) => void;
  onDeleteForEveryone?: (msg: ChatMessageV2) => void;
  onRetryMedia?: (msg: ChatMessageV2) => void;
  onVotePoll?: (msg: ChatMessageV2, optionId: string) => void;
  onOpenSenderProfile?: (senderId: string, hint?: { name?: string; avatarUrl?: string }) => void;
  onReply?: (msg: ChatMessageV2) => void;
  onDeleteMine?: (msg: ChatMessageV2) => void;
  onForward?: (msg: ChatMessageV2) => void;
  onArchive?: (msg: ChatMessageV2) => void;
  onJumpToMessage?: (messageId: string) => void;
  /** TTL 방에서 외부 공유 차단 시 롱프레스 메뉴의 전달/공유 숨김 */
  allowExternalShareInBubble?: boolean;
  fontSize?: number;
  bubbleShape?: 'rounded' | 'square';
  bottomPadding?: number;
  /** Android: 키보드 높이(올라올 때 목록 맨 아래로 스크롤해 입력창·키보드에 가려진 말풍선 보이기) */
  keyboardHeight?: number;
  /** TTL 방: 메시지 말풍선 하단 만료 카운트다운(초). 미전달 시 room에서 계산 */
  ttlMessageExpireSeconds?: number | null;
};

type SenderProfile = { name: string; avatarUrl: string };

const BOTTOM_THRESHOLD_PX = 100;

function isNearListBottom(e: NativeSyntheticEvent<NativeScrollEvent>): boolean {
  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
  const visibleH = layoutMeasurement.height;
  const contentH = contentSize.height;
  const y = contentOffset.y;
  if (!Number.isFinite(contentH) || !Number.isFinite(visibleH)) return true;
  if (contentH <= visibleH + 4) return true;
  const distFromBottom = contentH - visibleH - y;
  return distFromBottom <= BOTTOM_THRESHOLD_PX;
}

export function MessageListV2({
  room,
  uid,
  peerLastReadAt = null,
  onLoadOlder,
  onOpenMedia,
  onReact,
  onApplyReaction,
  onHideMessage,
  onDeleteForEveryone,
  onRetryMedia,
  onVotePoll,
  onOpenSenderProfile,
  onReply,
  onDeleteMine,
  onForward,
  onArchive,
  onJumpToMessage,
  allowExternalShareInBubble = true,
  fontSize,
  bubbleShape = 'rounded',
  bottomPadding,
  keyboardHeight = 0,
  ttlMessageExpireSeconds: ttlMsgSecProp,
}: Props) {
  const [ttlTick, setTtlTick] = useState(0);
  const ttlMsgSec =
    ttlMsgSecProp !== undefined ? ttlMsgSecProp : getMessageExpireSecondsV2(room);
  const isRoomModerator = useMemo(() => isRoomModeratorV2(room, uid), [room, uid]);
  const listRef = useRef<FlashList<any> | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const lastRoomIdRef = useRef<string>('');
  const prevMsgLenRef = useRef(0);

  const slice = useChatV2Store((s) => s.roomMessages[room.id]);
  const hasMore = useChatV2Store((s) => !!s.roomMessages[room.id]?.hasMore);
  const oldestLoadedAt = useChatV2Store((s) => s.roomMessages[room.id]?.oldestLoadedAt);

  useEffect(() => {
    if (String(room.type) !== 'ttl') return;
    const id = setInterval(() => setTtlTick((v) => (v + 1) % 1000000), 1000);
    return () => clearInterval(id);
  }, [room.id, room.type]);

  const messages: ChatMessageV2[] = useMemo(() => {
    const ids = Array.isArray(slice?.ids) ? slice.ids : [];
    const byId = slice?.byId && typeof slice.byId === 'object' ? slice.byId : {};
    const arr = ids.map((id) => byId[id]).filter(Boolean);
    const now = Date.now();
    return filterVisibleMessagesV2(room, arr, now).filter((m) => {
      try {
        if (isMessageHiddenForUser(m, String(uid))) return false;
        const deletedFor = (m as any)?.meta?.deletedFor || (m as any)?.deletedFor || {};
        return deletedFor?.[String(uid)] !== true;
      } catch {
        return true;
      }
    });
  }, [slice?.ids, slice?.byId, room, uid, ttlTick]);

  /** 방 전환·첫 메시지 로드 시 목록이 상단부터 열리므로 맨 아래로 버튼 표시 (messages 선언 이후에만 실행) */
  useEffect(() => {
    if (lastRoomIdRef.current !== room.id) {
      lastRoomIdRef.current = room.id;
      prevMsgLenRef.current = 0;
    }
    const n = messages.length;
    if (n > 0 && prevMsgLenRef.current === 0) {
      setShowJumpToBottom(true);
    }
    prevMsgLenRef.current = n;
  }, [room.id, messages.length]);

  const [senderProfiles, setSenderProfiles] = useState<Record<string, SenderProfile>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ids = Array.from(new Set(messages.map((m) => String(m.senderId || '')).filter(Boolean)));
        const missing = ids.filter((id) => !senderProfiles[id]);
        if (!missing.length) return;
        const next: Record<string, SenderProfile> = {};
        await Promise.all(
          missing.map(async (id) => {
            try {
              const s = await getDoc(doc(firestore, 'users', id));
              const d = s.exists() ? (s.data() as any) : {};
              const name = resolveChatDisplayNameFromUserDoc(id, d as Record<string, unknown>).trim() || id;
              const avatarUrl = String(d?.avatar || d?.photoURL || d?.profileImageUrl || '').trim();
              next[id] = { name, avatarUrl };
            } catch {
              next[id] = { name: id, avatarUrl: '' };
            }
          })
        );
        if (!alive) return;
        setSenderProfiles((prev) => ({ ...prev, ...next }));
      } catch {}
    })();
    return () => { alive = false; };
  }, [messages, senderProfiles]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessageV2; index: number }) => {
      const isMe = String(item.senderId) === String(uid);
      const prev = index > 0 ? messages[index - 1] : undefined;
      const showSenderMeta = !isMe && (!prev || String(prev.senderId) !== String(item.senderId));
      const senderId = String(item.senderId || '');
      const profile = senderProfiles[senderId];
      return (
        <MessageBubbleV2
          msg={item}
          isMe={isMe}
          uid={uid}
          isRoomModerator={isRoomModerator}
          roomType={room.type}
          ttlMessageExpireSeconds={ttlMsgSec}
          peerLastReadAt={peerLastReadAt}
          senderName={profile?.name || senderId || '알 수 없음'}
          senderAvatarUrl={profile?.avatarUrl || ''}
          showSenderMeta={showSenderMeta}
          allowExternalShare={allowExternalShareInBubble}
          onOpenSenderProfile={onOpenSenderProfile}
          onReply={onReply}
          onDeleteMine={onDeleteMine}
          onForward={onForward}
          onArchive={onArchive}
          onJumpToMessage={onJumpToMessage || jumpToMessageInternal}
          onOpenMedia={onOpenMedia}
          onReact={onReact}
          onApplyReaction={onApplyReaction}
          onHideMessage={onHideMessage}
          onDeleteForEveryone={onDeleteForEveryone}
          onRetryMedia={onRetryMedia}
          onVotePoll={onVotePoll}
          fontSize={fontSize}
          bubbleShape={bubbleShape}
        />
      );
    },
    [uid, peerLastReadAt, room.type, ttlMsgSec, isRoomModerator, onOpenMedia, onReact, onApplyReaction, onHideMessage, onDeleteForEveryone, onRetryMedia, onVotePoll, onOpenSenderProfile, onReply, onDeleteMine, onForward, onArchive, onJumpToMessage, jumpToMessageInternal, allowExternalShareInBubble, fontSize, bubbleShape, messages, senderProfiles]
  );

  const keyExtractor = useCallback((m: ChatMessageV2) => String(m.id), []);

  const updateJumpVisibility = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (messages.length === 0) {
        setShowJumpToBottom(false);
        return;
      }
      setShowJumpToBottom(!isNearListBottom(e));
    },
    [messages.length]
  );

  const jumpToBottom = useCallback(() => {
    try {
      listRef.current?.scrollToEnd({ animated: true });
    } catch {}
    setShowJumpToBottom(false);
  }, []);

  const jumpToMessageInternal = useCallback(
    (messageId: string) => {
      const id = String(messageId || '').trim();
      if (!id) return;
      const idx = messages.findIndex((m) => String(m.id) === id);
      if (idx >= 0) {
        try {
          (listRef.current as any)?.scrollToIndex?.({ index: idx, animated: true, viewPosition: 0.45 });
        } catch {}
        return;
      }
      if (!hasMore || typeof onLoadOlder !== 'function') return;
      void (async () => {
        for (let i = 0; i < 6; i += 1) {
          try {
            await onLoadOlder();
          } catch {}
          const newer = useChatV2Store.getState().roomMessages[room.id];
          const ids = Array.isArray(newer?.ids) ? newer!.ids : [];
          const byId = (newer?.byId || {}) as Record<string, ChatMessageV2>;
          const next = ids.map((mid) => byId[mid]).filter(Boolean);
          const nidx = next.findIndex((m) => String((m as any)?.id || '') === id);
          if (nidx >= 0) {
            requestAnimationFrame(() => {
              try { (listRef.current as any)?.scrollToIndex?.({ index: nidx, animated: true, viewPosition: 0.45 }); } catch {}
            });
            return;
          }
          if (!newer?.hasMore) break;
        }
      })();
    },
    [messages, hasMore, onLoadOlder, room.id]
  );

  const prevKbRef = useRef(0);
  useEffect(() => {
    const h = Math.max(0, Number(keyboardHeight || 0));
    if (h > 0 && prevKbRef.current === 0 && messages.length > 0) {
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToEnd({ animated: true });
        } catch {}
      });
    }
    prevKbRef.current = h;
  }, [keyboardHeight, messages.length]);

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <FlashList
        ref={listRef as any}
        data={messages}
        estimatedItemSize={72}
        keyExtractor={keyExtractor}
        renderItem={renderItem as any}
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="always"
        onScroll={updateJumpVisibility}
        onMomentumScrollEnd={updateJumpVisibility}
        scrollEventThrottle={100}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: Math.max(120, Number(bottomPadding || 0)), paddingTop: 8 }}
        ListHeaderComponent={
          hasMore && typeof onLoadOlder === 'function' ? (
            <TouchableOpacity
              onPress={() => onLoadOlder()}
              style={{ alignItems: 'center', paddingVertical: 10, marginBottom: 8 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#AAA', fontSize: 12 }}>이전 메시지 불러오기</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ color: '#777' }}>메시지가 없습니다</Text>
          </View>
        }
      />
      {showJumpToBottom ? (
        <TouchableOpacity
          onPress={jumpToBottom}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="맨 아래로 이동"
          style={{
            position: 'absolute',
            right: 14,
            bottom: 18,
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: '#1A1A1A',
            borderWidth: 2,
            borderColor: '#D4AF37',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.35,
            shadowRadius: 4,
            elevation: 6,
          }}
        >
          <Text style={{ color: '#D4AF37', fontSize: 22, fontWeight: '900', marginTop: -2 }}>↓</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

