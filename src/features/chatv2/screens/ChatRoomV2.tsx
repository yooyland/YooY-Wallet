import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Share,
  Alert,
  Image,
  StyleSheet,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { firestore, firebaseStorage, firebaseAuth } from '@/lib/firebase';
import type { ChatRoomV2 } from '../core/roomSchema';
import { filterVisibleMessagesV2, getMessageExpireSecondsV2, getTtlRemainingSecondsV2, getTtlStatusV2, isMessageExpiredV2, isRoomExplodedV2 } from '../core/ttlEngine';
import { buildOrderedPreviewableMessages } from '../core/previewNavigation';
import { archiveChatMessageV2ToTreasure } from '../core/archiveChatToTreasureV2';
import { useChatV2Store } from '../store/chatv2.store';
import { subscribeRoomDocV2, subscribeLatestMessagesV2, loadOlderMessagesV2 } from '../services/roomMessageService';
import { MessageListV2 } from '../components/MessageListV2';
import { ComposerV2 } from '../components/ComposerV2';
import { RoomHeaderV2 } from '../components/RoomHeaderV2';
import { MediaPreviewModalV2 } from '../components/MediaPreviewModalV2';
import RoomSettingsV2 from './RoomSettingsV2';
import RoomParticipantsModalV2 from '../components/RoomParticipantsModalV2';
import type { ChatMessageV2 } from '../core/messageSchema';
import {
  applyChatVisualFromMemberSettings,
  applyChatVisualFromRoomPreferenceDoc,
  loadRoomMemberSettingsV2,
} from '../services/settingsService';
import { retryMediaV2, votePollV2 } from '../services/messageService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import {
  getRoomMemberDocRef,
  getRoomMembersColRef,
  getRoomMessageDocRef,
  getUserJoinedRoomDocRef,
  getUserRoomPreferenceDocRef,
} from '../firebase/roomRefs';
import { formatChatUploadError } from '../core/uploadErrors';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { parseFirestoreMsOrNull } from '../core/firestoreMs';
import { clearUnreadOnEnterV2 } from '../core/unreadEngine';
import {
  debugLogAttachmentSnapshot,
  resolveAttachmentThumbUrl,
  resolveMessageShareText,
  resolveReplyPreviewText,
} from '../core/attachmentAccess';
import { applyMessageReactionV2, isMessageHiddenForUser, setMessageHiddenForMeV2 } from '../services/messageReactionService';
import { usePreferences } from '@/contexts/PreferencesContext';
import { chatTr } from '../core/chatI18n';
import { canDeleteMessageForEveryoneV2, isRoomModeratorV2 } from '../core/roomPermissions';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';
import { purgeExplodedTtlRoomV2 } from '../services/roomService';
import { callAdminDeleteChatRoomV2, callAdminSetUserChatSuspensionV2 } from '../services/adminModerationService';

const logDm = (event: string, payload: Record<string, any>) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[YY_CHAT_V2_DM]', JSON.stringify({ event, ...payload }));
  } catch {}
};
const logTtl = (event: string, payload: Record<string, any>) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[YY_CHAT_TTL]', JSON.stringify({ event, ...payload }));
  } catch {}
};

export default function ChatRoomV2(props: { roomId: string; initialOpenSettings?: boolean; adminGhost?: boolean }) {
  const roomId = String(props.roomId || '');
  const initialOpenSettings = !!props.initialOpenSettings;
  const adminGhost = !!props.adminGhost;
  const uid = String(firebaseAuth.currentUser?.uid || 'me');
  const insets = useSafeAreaInsets();
  const { language } = usePreferences();
  const t = React.useCallback((ko: string, en: string, ja?: string, zh?: string) => chatTr(language as any, ko, en, ja, zh), [language]);

  const upsertRoom = useChatV2Store((s) => s.upsertRoom);
  const evictRoom = useChatV2Store((s) => s.evictRoom);
  const setMessages = useChatV2Store((s) => s.setMessages);
  const upsertMessage = useChatV2Store((s) => s.upsertMessage);
  const removeMessage = useChatV2Store((s) => s.removeMessage);
  const setRoomHasMore = useChatV2Store((s) => s.setRoomHasMore);

  const room = useChatV2Store((s) => s.roomsById[roomId]);
  const messageSlice = useChatV2Store((s) => s.roomMessages[roomId]);
  const oldestLoadedAt = useChatV2Store((s) => s.roomMessages[roomId]?.oldestLoadedAt);
  const hasMore = useChatV2Store((s) => !!s.roomMessages[roomId]?.hasMore);

  const [loading, setLoading] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(!!initialOpenSettings && !adminGhost);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mediaPreviewIndex, setMediaPreviewIndex] = useState(0);
  const [fontSize, setFontSize] = useState<number>(16);
  const [roomWallpaperUri, setRoomWallpaperUri] = useState<string>('');
  const [roomSurfaceColor, setRoomSurfaceColor] = useState<string>('#0C0C0C');
  const [bubbleShape, setBubbleShape] = useState<'rounded' | 'square'>('rounded');
  const [keyboardH, setKeyboardH] = useState<number>(0);
  const [peerName, setPeerName] = useState<string>('');
  const [peerAvatar, setPeerAvatar] = useState<string>('');
  const [peerId, setPeerId] = useState<string>('');
  const [ttlRemainSec, setTtlRemainSec] = useState<number>(0);
  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    senderId: string;
    senderName?: string;
    type?: string;
    text?: string;
    thumbnailUrl?: string;
  } | null>(null);
  /** DM·그룹·TTL 등: roomMembers…members/{uid}.lastReadAt (ms) — 내 말풍선 미읽음 인원 집계 */
  const [memberLastReadByUid, setMemberLastReadByUid] = useState<Record<string, number>>({});
  /** 방 안에 있는 동안 상대 메시지 수신 시 unread 재증가 방지 — clearUnread 스로틀(ms) */
  const recvClearThrottleRef = useRef(0);
  const ttlExplosionCleanupRef = useRef(false);
  /** enterRoom에서 이미 purge+ttl_room_exploded 처리됨 — 이중 뒤로가기 방지 */
  const ttlSubscribeExplodedHandledRef = useRef(false);

  const [adminSuspendOpen, setAdminSuspendOpen] = useState(false);
  const [adminSuspendUid, setAdminSuspendUid] = useState('');
  const [adminSuspendHours, setAdminSuspendHours] = useState('24');
  const [adminSuspendReason, setAdminSuspendReason] = useState('');
  const [adminSuspendRoomOnly, setAdminSuspendRoomOnly] = useState(true);
  const [adminModBusy, setAdminModBusy] = useState(false);

  const openAdminSuspendModal = useCallback(() => {
    setAdminSuspendUid('');
    setAdminSuspendHours('24');
    setAdminSuspendReason('');
    setAdminSuspendRoomOnly(true);
    setAdminSuspendOpen(true);
  }, []);

  const onAdminDeleteRoom = useCallback(() => {
    if (!roomId || adminModBusy) return;
    Alert.alert(
      t("방 삭제 (서버)", 'Delete room (server)', "ルーム削除（サーバー）", '删除房间（服务器）'),
      t(
        "이 방과 메시지·멤버 기록이 서버에서 영구 삭제됩니다. 계속할까요?",
        'This permanently deletes the room and its messages/member records on the server. Continue?',
        "サーバー上でルームとメッセージ・メンバー記録を完全削除します。続行しますか？",
        '将在服务器上永久删除该房间及消息与成员记录。是否继续？'
      ),
      [
        { text: t("취소", 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
        {
          text: t("삭제", 'Delete', '削除', '删除'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setAdminModBusy(true);
                await callAdminDeleteChatRoomV2({ roomId, reason: 'admin ghost UI' });
                evictRoom(roomId);
                try {
                  router.back();
                } catch {}
              } catch (e: any) {
                Alert.alert(
                  t("실패", 'Failed', '失敗', '失败'),
                  String(e?.message || e || t("삭제 요청 실패", 'Delete request failed', '削除に失敗', '删除失败'))
                );
              } finally {
                setAdminModBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [roomId, adminModBusy, evictRoom, t]);

  const onAdminSubmitSuspend = useCallback(() => {
    const targetUid = adminSuspendUid.trim();
    if (!targetUid) {
      Alert.alert(
        t('입력 필요', 'Required', '入力が必要', '需要输入'),
        t('대상 UID를 입력하세요.', 'Enter target UID.', '対象UIDを入力', '请输入目标 UID')
      );
      return;
    }
    const parsed = parseInt(String(adminSuspendHours).trim(), 10);
    const durationHours = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    void (async () => {
      try {
        setAdminModBusy(true);
        await callAdminSetUserChatSuspensionV2({
          targetUid,
          suspended: true,
          reason: adminSuspendReason.trim() || undefined,
          durationHours,
          roomId: adminSuspendRoomOnly ? roomId : null,
        });
        setAdminSuspendOpen(false);
        Alert.alert(
          t("완료", 'Done', '完了', '完成'),
          adminSuspendRoomOnly
            ? t('이 방에서 이용정지를 적용했습니다.', 'Room ban applied.', 'このルームで利用停止を適用しました。', '已在本房间应用封禁。')
            : t('전역 이용정지를 적용했습니다.', 'Global chat suspension applied.', '全体チャット利用停止を適用しました。', '已应用全局聊天封禁。')
        );
      } catch (e: any) {
        Alert.alert(
          t("실패", 'Failed', '失敗', '失败'),
          String(e?.message || e || t("요청 실패", 'Request failed', '失敗', '请求失败'))
        );
      } finally {
        setAdminModBusy(false);
      }
    })();
  }, [adminSuspendUid, adminSuspendHours, adminSuspendReason, adminSuspendRoomOnly, roomId, t]);

  useEffect(() => {
    ttlExplosionCleanupRef.current = false;
    ttlSubscribeExplodedHandledRef.current = false;
  }, [roomId]);
  /** 신규 입장자: joinedRooms.clearedAt 기준(이전 메시지 숨김) */
  const [minVisibleAt, setMinVisibleAt] = useState<number>(0);

  // Android flicker 방지를 위해 KAV는 iOS에서만 사용하고,
  // Android는 keyboard 높이를 받아 bottomPadding으로 입력창/리스트 위치를 안정적으로 조정합니다.
  useEffect(() => {
    try {
      const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
        const h = Number((e as any)?.endCoordinates?.height || 0);
        setKeyboardH(Number.isFinite(h) ? h : 0);
      });
      const onHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardH(0));
      return () => {
        try { onShow?.remove?.(); } catch {}
        try { onHide?.remove?.(); } catch {}
      };
    } catch {
      return;
    }
  }, []);

  // 신규 입장자: joinedRooms.clearedAt 로드 (더보기/로컬 필터 보조)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!uid || !roomId) return;
        const jr = await getDoc(getUserJoinedRoomDocRef(firestore, uid, roomId));
        const ca = jr.exists() ? Number((jr.data() as any)?.clearedAt || 0) : 0;
        if (!alive) return;
        setMinVisibleAt(Number.isFinite(ca) && ca > 0 ? ca : 0);
      } catch {
        if (alive) setMinVisibleAt(0);
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId, uid]);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    logDm('room.open', {
      currentUid: uid,
      roomId,
      sendTextInsertPath: `roomMessages/${roomId}/items/{messageId}`,
      subscribePath: `roomMessages/${roomId}/items`,
    });

    const unsubRoom = subscribeRoomDocV2({
      firestore,
      roomId,
      onRoom: (r) => {
        upsertRoom(r);
        try {
          setExploded(isRoomExplodedV2(r, Date.now()));
        } catch {}
      },
    });

    let unsubMsgs: null | (() => void) = null;
    (async () => {
      try {
        logDm('subscribe.start', {
          currentUid: uid,
          roomId,
          subscribePath: `roomMessages/${roomId}/items`,
        });
        unsubMsgs = await subscribeLatestMessagesV2({
          firestore,
          roomId,
          uid,
          limitN: 30,
          adminGhost,
          onInitial: (msgs, more) => {
            logDm('subscribe.success.initial', { currentUid: uid, roomId, count: msgs.length, hasMore: more });
            // 첫 스냅샷이 서버 히스토리만으로 setMessages 하면, 입장 직후 이미 올린 전송 중 메시지가 사라질 수 있음
            const prevSlice = useChatV2Store.getState().roomMessages[roomId];
            const serverIds = new Set((msgs || []).map((m) => m.id).filter(Boolean));
            const keep: ChatMessageV2[] = [];
            if (prevSlice?.byId && Array.isArray(prevSlice.ids)) {
              for (const mid of prevSlice.ids) {
                const m = prevSlice.byId[mid];
                if (!m || String(m.roomId || '') !== roomId) continue;
                if (serverIds.has(m.id)) continue;
                const st = String(m.status || '');
                if (st === 'sending' || st === 'failed') keep.push(m);
              }
            }
            const merged = [...(msgs || []), ...keep].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            setMessages(roomId, merged, { hasMore: more });
            setRoomHasMore(roomId, more);
            setLoading(false);
          },
          onUpserts: (msgs) => {
            logDm('subscribe.success.upserts', { currentUid: uid, roomId, count: msgs.length });
            msgs.forEach((m) => upsertMessage(roomId, m));
            if (adminGhost) return;
            // 상대가 보낸 메시지마다 applyUnreadOnSendV2가 내 unread를 올림 → 방을 보고 있어도 목록 배지가 남는 문제 방지
            const hasOther = msgs.some((m) => String(m.senderId || '') !== String(uid || ''));
            if (!hasOther) return;
            const t = Date.now();
            if (t - recvClearThrottleRef.current < 800) return;
            recvClearThrottleRef.current = t;
            clearUnreadOnEnterV2({ firestore, roomId, uid }).catch(() => {});
          },
        });
      } catch (e: any) {
        const errMsg = String(e?.message || e || '');
        if (errMsg === 'ttl_room_exploded') {
          ttlSubscribeExplodedHandledRef.current = true;
          try {
            evictRoom(roomId);
          } catch {}
          try {
            router.back();
          } catch {}
          setLoading(false);
          return;
        }
        logDm('subscribe.fail', {
          currentUid: uid,
          roomId,
          subscribePath: `roomMessages/${roomId}/items`,
          error: errMsg || 'subscribe_failed',
        });
        setLoading(false);
      }
    })();

    return () => {
      try { unsubRoom?.(); } catch {}
      try { unsubMsgs?.(); } catch {}
    };
  }, [roomId, uid, adminGhost, upsertRoom, evictRoom, setMessages, upsertMessage, setRoomHasMore]);

  /** 방 설정에서 저장한 테마·글자 크기 — chatRoomPrefs 실시간 반영 */
  useEffect(() => {
    if (!roomId || !uid) return;
    const prefRef = getUserRoomPreferenceDocRef(firestore, uid, roomId);
    const unsub = onSnapshot(
      prefRef,
      (snap) => {
        if (snap.exists()) {
          applyChatVisualFromRoomPreferenceDoc(snap.data() as Record<string, unknown>, {
            setFontSizePx: setFontSize,
            setWallpaperUri: setRoomWallpaperUri,
            setSurfaceColor: setRoomSurfaceColor,
            setBubbleStyle: setBubbleShape,
          });
          return;
        }
        void (async () => {
          try {
            const merged = await loadRoomMemberSettingsV2({ firestore, roomId, uid });
            applyChatVisualFromMemberSettings(merged, {
              setFontSizePx: setFontSize,
              setWallpaperUri: setRoomWallpaperUri,
              setSurfaceColor: setRoomSurfaceColor,
              setBubbleStyle: setBubbleShape,
            });
          } catch {}
        })();
      },
      () => {}
    );
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [roomId, uid]);

  // DM peer profile load for header + profile flow
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = room;
        if (!r || String(r.type) !== 'dm') { if (alive) { setPeerId(''); setPeerName(''); setPeerAvatar(''); } return; }
        const ids = Array.isArray(r.participantIds) ? r.participantIds.map((x) => String(x)) : [];
        const other = ids.find((x) => x && x !== uid) || '';
        if (!other) return;
        if (alive) setPeerId(other);
        const us = await getDoc(doc(firestore, 'users', other));
        if (!alive) return;
        if (us.exists()) {
          const d = us.data() as any;
          const n = resolveChatDisplayNameFromUserDoc(other, d as Record<string, unknown>).trim();
          const a = String(d?.avatar || d?.photoURL || d?.profileImageUrl || '').trim();
          setPeerName(n || other);
          setPeerAvatar(a || '');
        } else {
          setPeerName(other);
          setPeerAvatar('');
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [room?.type, room?.participantIds, uid]);

  const onLoadOlder = async () => {
    if (!oldestLoadedAt || !hasMore) return;
    const { messages, hasMore: more } = await loadOlderMessagesV2({
      firestore,
      roomId,
      beforeCreatedAt: oldestLoadedAt,
      afterCreatedAt: minVisibleAt > 0 ? minVisibleAt : undefined,
      limitN: 30,
    });
    messages.forEach((m) => upsertMessage(roomId, m));
    setRoomHasMore(roomId, more);
  };

  const effectiveRoom: ChatRoomV2 = useMemo(() => {
    return (
      room || {
        id: roomId,
        type: 'group',
        title: t('채팅', 'Chat', 'チャット', '聊天'),
        createdBy: '',
        createdAt: 0,
        updatedAt: Date.now(),
        participantIds: [],
        adminIds: [],
      }
    );
  }, [room, roomId, t]);

  const handleApplyReaction = useCallback(
    async (m: ChatMessageV2, emoji: string) => {
      try {
        await applyMessageReactionV2({
          firestore,
          roomId: effectiveRoom.id,
          messageId: String(m.id),
          uid,
          emoji,
        });
        const prevMeta = ((m.meta || {}) as any) || {};
        const prevR = { ...(prevMeta.reactions || {}) };
        prevR[String(uid)] = String(emoji || '').trim();
        upsertMessage(effectiveRoom.id, { ...m, meta: { ...prevMeta, reactions: prevR }, updatedAt: Date.now() } as any);
      } catch (e: any) {
        Alert.alert(t('공감', 'Reaction', 'リアクション', '回应'), String(e?.message || e || 'failed'));
      }
    },
    [effectiveRoom.id, uid, upsertMessage, t]
  );

  const handleHideMessage = useCallback(
    async (m: ChatMessageV2) => {
      if (!isRoomModeratorV2(effectiveRoom, uid)) return;
      try {
        await setMessageHiddenForMeV2({ firestore, roomId: effectiveRoom.id, messageId: String(m.id), uid, hidden: true });
        const prevMeta = ((m.meta || {}) as any) || {};
        const prevH = { ...(prevMeta.hiddenFor || {}) };
        prevH[String(uid)] = true;
        upsertMessage(effectiveRoom.id, { ...m, meta: { ...prevMeta, hiddenFor: prevH }, updatedAt: Date.now() } as any);
      } catch (e: any) {
        Alert.alert(t('가리기', 'Hide', '非表示', '隐藏'), String(e?.message || e || 'failed'));
      }
    },
    [effectiveRoom, uid, upsertMessage, t]
  );

  const handleDeleteForEveryone = useCallback(
    (m: ChatMessageV2) => {
      if (!canDeleteMessageForEveryoneV2(effectiveRoom, uid, m.senderId)) return;
      Alert.alert(
        t('모두에게 삭제', 'Delete for everyone', '全員に削除', '为所有人删除'),
        t('이 메시지를 모든 참여자에게서 삭제할까요?', 'Remove for everyone?', '全員から削除しますか？', '要为所有人删除吗？'),
        [
          { text: t('취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
          {
            text: t('삭제', 'Delete', '削除', '删除'),
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDoc(getRoomMessageDocRef(firestore, effectiveRoom.id, String(m.id)));
                removeMessage(effectiveRoom.id, String(m.id));
              } catch (e: any) {
                Alert.alert(t('오류', 'Error', 'エラー', '错误'), String(e?.message || e));
              }
            },
          },
        ]
      );
    },
    [effectiveRoom, uid, removeMessage, t, firestore]
  );

  const previewChain = useMemo(() => {
    const ids = Array.isArray(messageSlice?.ids) ? messageSlice.ids : [];
    const byId = messageSlice?.byId && typeof messageSlice.byId === 'object' ? messageSlice.byId : {};
    const arr = ids.map((id) => byId[id]).filter(Boolean) as ChatMessageV2[];
    const now = Date.now();
    const visible = filterVisibleMessagesV2(effectiveRoom, arr, now).filter((m) => {
      try {
        if (isMessageHiddenForUser(m, String(uid))) return false;
        const deletedFor = (m as any)?.meta?.deletedFor || {};
        return deletedFor?.[String(uid)] !== true;
      } catch {
        return true;
      }
    });
    return buildOrderedPreviewableMessages(visible);
  }, [messageSlice?.ids, messageSlice?.byId, effectiveRoom, uid]);

  useEffect(() => {
    if (!roomId) {
      setMemberLastReadByUid({});
      return;
    }
    if (String(effectiveRoom.type) === 'dm') {
      const other =
        peerId ||
        (() => {
          const ids = Array.isArray(effectiveRoom.participantIds)
            ? effectiveRoom.participantIds.map((x: any) => String(x)).filter(Boolean)
            : [];
          return ids.find((x) => x && x !== uid) || '';
        })();
      if (!other) {
        setMemberLastReadByUid({});
        return;
      }
      const ref = getRoomMemberDocRef(firestore, roomId, other);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setMemberLastReadByUid({});
            return;
          }
          const v = snap.data() as any;
          const t = parseFirestoreMsOrNull(v?.lastReadAt);
          if (t != null && Number.isFinite(Number(t))) {
            setMemberLastReadByUid({ [other]: Number(t) });
          } else {
            setMemberLastReadByUid({});
          }
        },
        () => setMemberLastReadByUid({})
      );
      return () => {
        try {
          unsub();
        } catch {}
      };
    }

    const col = getRoomMembersColRef(firestore, roomId);
    const unsub = onSnapshot(
      col,
      (snap) => {
        const m: Record<string, number> = {};
        snap.forEach((d) => {
          const pid = String(d.id || '').trim();
          if (!pid) return;
          const t = parseFirestoreMsOrNull((d.data() as any)?.lastReadAt);
          if (t != null && Number.isFinite(Number(t))) m[pid] = Number(t);
        });
        setMemberLastReadByUid(m);
      },
      () => setMemberLastReadByUid({})
    );
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [roomId, uid, effectiveRoom.type, effectiveRoom.participantIds, peerId]);

  useEffect(() => {
    if (String(effectiveRoom.type) !== 'ttl') return;
    const tick = () => {
      const remain = getTtlRemainingSecondsV2(effectiveRoom as any, Date.now());
      setTtlRemainSec(remain);
      const status = getTtlStatusV2(effectiveRoom as any, Date.now());
      if (status === 'expired') setExploded(true);
      if (
        status === 'expired' &&
        !adminGhost &&
        !ttlSubscribeExplodedHandledRef.current &&
        !ttlExplosionCleanupRef.current
      ) {
        ttlExplosionCleanupRef.current = true;
        void (async () => {
          try {
            await purgeExplodedTtlRoomV2({ firestore, roomId, actorUid: uid });
          } catch {}
          try {
            evictRoom(roomId);
          } catch {}
          try {
            router.back();
          } catch {}
        })();
      }
      if (status !== 'active') {
        logTtl('expired_transition', {
          roomId: effectiveRoom.id,
          roomType: effectiveRoom.type,
          roomExpiresAt: Number((effectiveRoom as any)?.ttl?.explodeRoomAt || 0),
          ttlStatus: status,
          remainingSeconds: remain,
        });
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [effectiveRoom, roomId, uid, evictRoom, adminGhost]);

  // TTL 메시지: 화면 숨김만이 아니라 실제 Firestore 문서도 만료 시 삭제
  useEffect(() => {
    if (String(effectiveRoom.type) !== 'ttl') return;
    const ids = Array.isArray(messageSlice?.ids) ? messageSlice.ids : [];
    const byId = messageSlice?.byId && typeof messageSlice.byId === 'object' ? messageSlice.byId : {};
    if (!ids.length) return;
    const now = Date.now();
    const expired = ids
      .map((id) => byId[id] as ChatMessageV2 | undefined)
      .filter(Boolean)
      .filter((m) => isMessageExpiredV2(effectiveRoom as any, m as any, now))
      .slice(0, 20);
    if (!expired.length) return;
    const t = setTimeout(() => {
      expired.forEach((m) => {
        const mid = String((m as any)?.id || '').trim();
        if (!mid) return;
        removeMessage(effectiveRoom.id, mid);
        deleteDoc(getRoomMessageDocRef(firestore, effectiveRoom.id, mid)).catch(() => {});
      });
    }, 150);
    return () => clearTimeout(t);
  }, [effectiveRoom.id, effectiveRoom.type, effectiveRoom.ttl, messageSlice?.ids, messageSlice?.byId, removeMessage]);

  // 업로드 장기 정체 보호: sending 상태가 오래 지속되면 failed로 전환(재시도 버튼 노출)
  useEffect(() => {
    const ids = Array.isArray(messageSlice?.ids) ? messageSlice.ids : [];
    const byId = messageSlice?.byId && typeof messageSlice.byId === 'object' ? messageSlice.byId : {};
    if (!ids.length) return;
    const now = Date.now();
    const stale = ids
      .map((id) => byId[id] as ChatMessageV2 | undefined)
      .filter(Boolean)
      .filter((m) => {
        const t = String((m as any)?.type || '');
        if (!['image', 'video', 'file', 'audio'].includes(t)) return false;
        const st = String((m as any)?.status || '');
        if (st !== 'sending' && st !== 'uploaded') return false;
        const created = Number((m as any)?.createdAt || 0);
        if (!created || now - created < 120000) return false;
        const remote = String((m as any)?.attachment?.remoteUrl || (m as any)?.url || '').trim();
        return !/^https?:\/\//i.test(remote);
      })
      .slice(0, 10);
    if (!stale.length) return;
    stale.forEach((m) => {
      const mid = String((m as any)?.id || '').trim();
      if (!mid) return;
      const failed: ChatMessageV2 = {
        ...(m as any),
        status: 'failed',
        updatedAt: now,
        meta: {
          ...(((m as any)?.meta || {}) as any),
          retryable: true,
          error: 'upload_timeout',
          errorCode: 'upload_timeout',
        },
      } as any;
      upsertMessage(effectiveRoom.id, failed);
      setDoc(getRoomMessageDocRef(firestore, effectiveRoom.id, mid), failed as any, { merge: true }).catch(() => {});
    });
  }, [effectiveRoom.id, messageSlice?.ids, messageSlice?.byId, upsertMessage]);

  const ttlStatus = useMemo(() => getTtlStatusV2(effectiveRoom as any, Date.now()), [effectiveRoom, ttlRemainSec]);
  const ttlBlocked = String(effectiveRoom.type) === 'ttl' && (ttlStatus === 'expired' || ttlStatus === 'locked');
  const ttlSecurity = ((effectiveRoom as any)?.security || {}) as any;
  const roomBlocked = String((effectiveRoom as any)?.roomStatus || '').trim() === 'closed' || String((effectiveRoom as any)?.roomStatus || '').trim() === 'archived';

  useEffect(() => {
    let applied = false;
    (async () => {
      try {
        if (adminGhost) return;
        const shouldBlockCapture = String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowCapture === false;
        if (shouldBlockCapture) {
          await preventScreenCaptureAsync();
          applied = true;
          logTtl('blocked_action', { roomId: effectiveRoom.id, action: 'capture', reason: 'capture_blocked' });
        }
      } catch {}
    })();
    return () => {
      if (!applied) return;
      allowScreenCaptureAsync().catch(() => {});
    };
  }, [effectiveRoom.type, effectiveRoom.id, ttlSecurity?.allowCapture, adminGhost]);

  const listBottomPadding = useMemo(() => {
    /**
     * iOS: KeyboardAvoidingView가 이미 입력창을 키보드 바로 위로 올려주므로
     * 리스트 패딩에 keyboard height를 더하면 "이중 적용"으로 입력창이 과하게 떠 보입니다.
     * 여기서는 입력창(컴포저) 높이 + safe area 정도만 유지합니다.
     */
    const base = 92;
    const safeBottom = Platform.OS === 'ios' ? Number(insets.bottom || 0) : 0;
    return Math.max(72, base + safeBottom);
  }, [keyboardH, insets.bottom]);

  /** TTL 카운트다운은 헤더 아래·입력창 위에 두되, 반드시 KeyboardAvoidingView(또는 키보드 패딩 영역) 안에 넣어 iOS에서 입력창이 키보드에 가려지지 않게 함 */
  const ttlBannerEl =
    String(effectiveRoom.type) === 'ttl' ? (
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: ttlBlocked ? 'rgba(122,31,31,0.25)' : 'rgba(15, 40, 70, 0.35)',
          borderBottomWidth: 1,
          borderBottomColor: '#1E1E1E',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: ttlBlocked ? '#FF6B6B' : ttlRemainSec > 86400 ? '#4DA3FF' : '#FF4444',
            fontWeight: '900',
            fontSize: 20,
            letterSpacing: 1,
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
            textAlign: 'center',
          }}
        >
          {ttlBlocked
            ? t('만료됨 · 전송 차단', 'Expired · sending blocked', '期限切れ・送信不可', '已过期·禁止发送')
            : `${Math.floor(ttlRemainSec / 86400)}일 ${String(Math.floor((ttlRemainSec % 86400) / 3600)).padStart(2, '0')}:${String(Math.floor((ttlRemainSec % 3600) / 60)).padStart(2, '0')}:${String(ttlRemainSec % 60).padStart(2, '0')}`}
        </Text>
      </View>
    ) : null;

  useEffect(() => {
    recvClearThrottleRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    try {
      // eslint-disable-next-line no-undef
      if (typeof __DEV__ === 'undefined' || !__DEV__ || !roomId) return;
      const r = effectiveRoom as any;
      // eslint-disable-next-line no-console
      console.log(
        '[YY_CHAT_V2_ROOM_ENTER]',
        JSON.stringify({
          roomId,
          type: r?.type,
          title: r?.title,
          participantIdsLen: Array.isArray(r?.participantIds) ? r.participantIds.length : 0,
          keys: r && typeof r === 'object' ? Object.keys(r).slice(0, 24) : [],
        })
      );
    } catch {}
  }, [roomId, effectiveRoom?.id, effectiveRoom?.type]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      <RoomHeaderV2
        room={
          effectiveRoom.type === 'dm'
            ? { ...effectiveRoom, title: peerName || effectiveRoom.title }
            : effectiveRoom
        }
        onBack={() => { try { router.back(); } catch {} }}
        onOpenParticipants={adminGhost ? () => {} : () => setParticipantsOpen(true)}
        onOpenProfile={() => {
          if (adminGhost) return;
          try {
            // 이전 UX 복원: 상단 좌측 프로필 클릭 시 채팅 프로필 설정으로 이동
            router.push({
              pathname: '/chatv2/profile-settings',
              params: { from: '/chatv2/room', roomId: String(roomId || '') },
            } as any);
          } catch {}
        }}
        onOpenSettings={adminGhost ? () => {} : () => setSettingsOpen(true)}
        avatarUrl={
          effectiveRoom.type === 'dm'
            ? peerAvatar || undefined
            : String((effectiveRoom as any)?.photoURL || (effectiveRoom as any)?.avatarUrl || '').trim() || undefined
        }
      />
      {adminGhost ? (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: 'rgba(80, 40, 120, 0.35)',
            borderBottomWidth: 1,
            borderBottomColor: '#1E1E1E',
          }}
        >
          <Text style={{ color: '#C9A0FF', fontWeight: '900', fontSize: 13, textAlign: 'center' }}>
            {t('관리자 관찰 모드 (유령 입장)', 'Admin read-only (ghost entry)', '管理者閲覧（幽霊入室）', '管理员只读（幽灵进入）')}
          </Text>
          <Text style={{ color: '#888', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
            {t('멤버로 기록되지 않으며 전송·설정이 비활성화됩니다.', 'Not recorded as a member. Sending and settings are disabled.', 'メンバー記録なし・送信・設定は無効', '不计入成员，无法发送与改设置')}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity
              onPress={onAdminDeleteRoom}
              disabled={adminModBusy}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FF6B6B', opacity: adminModBusy ? 0.5 : 1 }}
            >
              <Text style={{ color: '#FF6B6B', fontWeight: '800', fontSize: 12 }}>
                {t('\ubc29 \uc0ad\uc81c(\uc11c\ubc84)', 'Delete room (server)', '\u30eb\u30fc\u30e0\u524a\u9664\uff08\u30b5\u30fc\u30d0\u30fc\uff09', '\u5220\u9664\u623f\u95f4\uff08\u670d\u52a1\u5668\uff09')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openAdminSuspendModal}
              disabled={adminModBusy}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C9A0FF', opacity: adminModBusy ? 0.5 : 1 }}
            >
              <Text style={{ color: '#C9A0FF', fontWeight: '800', fontSize: 12 }}>
                {t('이용정지', 'Suspend user', '利用停止', '封禁用户')}
              </Text>
            </TouchableOpacity>
          </View>
          {adminModBusy ? <ActivityIndicator style={{ marginTop: 8 }} color="#C9A0FF" /> : null}
        </View>
      ) : null}

      {exploded || roomBlocked ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FF6B6B', fontWeight: '900' }}>
            {exploded
              ? t('이 TTL 방은 폭파되었습니다', 'This TTL room has exploded', 'このTTLルームは爆破されました', '此 TTL 房间已爆破')
              : t('방장이 없어 방이 종료되었습니다', 'This room is closed because it has no owner/admin', 'オーナー不在のためルームが終了しました', '由于无房主/管理员，房间已关闭')}
          </Text>
          <TouchableOpacity onPress={() => { try { router.back(); } catch {} }} style={{ marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}>
            <Text style={{ color: '#FFD700', fontWeight: '900' }}>{t('뒤로가기', 'Back', '戻る', '返回')}</Text>
          </TouchableOpacity>
        </View>
      ) : Platform.OS === 'ios' ? (
        <View style={{ flex: 1, backgroundColor: roomSurfaceColor }}>
          {roomWallpaperUri ? (
            <>
              <Image source={{ uri: roomWallpaperUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
            </>
          ) : null}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          // 전역 KAV를 채팅방에서 끈 대신, 헤더(56) + safe-area 만큼만 오프셋을 줘서 입력창이 키보드 위로 정확히 올라오게 함
          keyboardVerticalOffset={Math.max(0, Number(insets.top || 0) + 56)}
        >
          {ttlBannerEl}
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#777' }}>{t('로딩 중...', 'Loading...', '読み込み中...', '加载中...')}</Text>
            </View>
          ) : (
            <>
              <MessageListV2
                room={effectiveRoom}
                readOnly={adminGhost}
                uid={uid}
                memberLastReadByUid={memberLastReadByUid}
                ttlMessageExpireSeconds={getMessageExpireSecondsV2(effectiveRoom)}
                allowExternalShareInBubble={!(String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowExternalShare === false)}
                onReply={(m) => {
                  try {
                    setReplyTarget({
                      id: String(m.id || ''),
                      senderId: String(m.senderId || ''),
                      senderName: String((m as any)?.senderName || '').trim() || undefined,
                      type: String(m.type || ''),
                      text: resolveReplyPreviewText(m),
                      thumbnailUrl: resolveAttachmentThumbUrl(m) || undefined,
                    });
                  } catch {}
                }}
                onDeleteMine={(m) => {
                  try {
                    if (String(m.senderId) !== String(uid)) return;
                    removeMessage(effectiveRoom.id, String(m.id));
                    const prevMeta = ((m as any)?.meta ?? {}) as any;
                    const prevDeletedFor = (prevMeta?.deletedFor ?? {}) as Record<string, boolean>;
                    const patch: any = {
                      updatedAt: Date.now(),
                      meta: {
                        ...prevMeta,
                        deletedFor: {
                          ...prevDeletedFor,
                          [String(uid)]: true,
                        },
                      },
                    };
                    setDoc(getRoomMessageDocRef(firestore, effectiveRoom.id, String(m.id)), patch, { merge: true }).catch(() => {});
                  } catch {}
                }}
                onForward={async (m) => {
                  try {
                    if (String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowExternalShare === false) {
                      logTtl('blocked_action', { roomId: effectiveRoom.id, action: 'external_share', reason: 'external_share_blocked' });
                      return;
                    }
                    const text = resolveMessageShareText(m) || `[${String(m.type || 'message')}]`;
                    await Share.share({ message: text });
                  } catch {}
                }}
                onArchive={(m) => {
                  try {
                    archiveChatMessageV2ToTreasure(m);
                    Alert.alert(t('보물창고', 'Treasure', '宝物庫', '宝库'), t('비공개로 보관되었습니다.', 'Saved as private.', '非公開で保管しました。', '已私密保存。'));
                  } catch (e: any) {
                    Alert.alert(t('보관', 'Save', '保管', '保存'), String(e?.message || e || t('보관 실패', 'Save failed', '保管失敗', '保存失败')));
                  }
                }}
                onOpenSenderProfile={(senderUid) => {
                  try {
                    if (!senderUid || String(senderUid) === String(uid)) return;
                    router.push({
                      pathname: '/chatv2/friend-profile',
                      params: { id: String(senderUid), userId: String(senderUid) },
                    } as any);
                  } catch {}
                }}
                onLoadOlder={onLoadOlder}
                onOpenMedia={(m, opts) => {
                  try {
                    debugLogAttachmentSnapshot('ui.openMedia', m);
                    const baseId = String(m.id || '').replace(/__img\d+$/, '');
                    let idx = -1;
                    if (typeof opts?.albumIndex === 'number') {
                      idx = previewChain.findIndex((x) => String(x.id) === `${baseId}__img${opts.albumIndex}`);
                    }
                    if (idx < 0) idx = previewChain.findIndex((x) => String(x.id) === `${baseId}__img0`);
                    if (idx < 0) idx = previewChain.findIndex((x) => String(x.id) === baseId);
                    if (idx < 0) return;
                    setMediaPreviewIndex(idx);
                    setPreviewOpen(true);
                  } catch {}
                }}
                onApplyReaction={handleApplyReaction}
                onHideMessage={handleHideMessage}
                onDeleteForEveryone={handleDeleteForEveryone}
                onRetryMedia={async (m) => {
                  try {
                    const res = await retryMediaV2(
                      {
                        firestore,
                        storage: firebaseStorage,
                        roomId: effectiveRoom.id,
                        senderId: uid,
                        participantIds: effectiveRoom.participantIds || [],
                        roomType: effectiveRoom.type,
                        title: effectiveRoom.title,
                        ttlMessageExpireSeconds: getMessageExpireSecondsV2(effectiveRoom),
                      } as any,
                      m,
                      { upsertLocal: (rid, msg) => upsertMessage(rid, msg) }
                    );
                    if (res == null) {
                      Alert.alert(t('재시도', 'Retry', '再試行', '重试'), t('로컬 파일 정보가 없어 다시 보낼 수 없습니다.', 'Cannot retry without local file data.', 'ローカルファイル情報がないため再送できません。', '缺少本地文件信息，无法重试。'));
                      return;
                    }
                    if (!res.ok) Alert.alert(t('재시도', 'Retry', '再試行', '重试'), formatChatUploadError(res.error || ''));
                  } catch (e: any) {
                    Alert.alert(t('재시도', 'Retry', '再試行', '重试'), String(e?.message || e || 'retry_failed'));
                  }
                }}
                onVotePoll={(m, optionId) => {
                  try {
                    if (m.type !== 'poll') return;
                    votePollV2({ firestore, roomId: effectiveRoom.id, messageId: String(m.id), uid, optionId: String(optionId) }).catch(() => {});
                  } catch {}
                }}
                fontSize={fontSize}
                bubbleShape={bubbleShape}
                bottomPadding={listBottomPadding}
                keyboardHeight={keyboardH}
              />

              {/* Composer는 항상 화면 하단에 고정 */}
              <View>
                {adminGhost ? (
                  <View style={{ paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#151515', borderTopWidth: 1, borderTopColor: '#2A2A2A' }}>
                    <Text style={{ color: '#777', textAlign: 'center', fontSize: 13 }}>
                      {t('관찰 모드', 'Read-only', '閲覧のみ', '只读模式')}
                    </Text>
                  </View>
                ) : (
                  <ComposerV2
                    firestore={firestore}
                    storage={firebaseStorage}
                    room={effectiveRoom}
                    uid={uid}
                    fontSize={fontSize}
                    keyboardHeight={keyboardH}
                    ttlPolicy={{
                      blocked: ttlBlocked,
                      reason: ttlStatus,
                      allowImageUpload: ttlSecurity?.allowImageUpload !== false,
                      allowExternalShare: ttlSecurity?.allowExternalShare !== false,
                    }}
                    replyTarget={replyTarget}
                    onClearReply={() => setReplyTarget(null)}
                  />
                )}
              </View>
            </>
          )}
        </KeyboardAvoidingView>
        </View>
      ) : (
        // Android: KAV 제거하고 keyboard 높이만으로 bottomPadding을 안정적으로 조정
        <View style={{ flex: 1, backgroundColor: roomSurfaceColor, paddingBottom: Math.max(0, keyboardH) }}>
          {roomWallpaperUri ? (
            <>
              <Image source={{ uri: roomWallpaperUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.42)' }]} />
            </>
          ) : null}
          {ttlBannerEl}
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#777' }}>{t('로딩 중...', 'Loading...', '読み込み中...', '加载中...')}</Text>
            </View>
          ) : (
            <>
              <MessageListV2
                room={effectiveRoom}
                readOnly={adminGhost}
                uid={uid}
                memberLastReadByUid={memberLastReadByUid}
                ttlMessageExpireSeconds={getMessageExpireSecondsV2(effectiveRoom)}
                allowExternalShareInBubble={!(String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowExternalShare === false)}
                onReply={(m) => {
                  try {
                    setReplyTarget({
                      id: String(m.id || ''),
                      senderId: String(m.senderId || ''),
                      senderName: String((m as any)?.senderName || '').trim() || undefined,
                      type: String(m.type || ''),
                      text: resolveReplyPreviewText(m),
                      thumbnailUrl: resolveAttachmentThumbUrl(m) || undefined,
                    });
                  } catch {}
                }}
                onDeleteMine={(m) => {
                  try {
                    if (String(m.senderId) !== String(uid)) return;
                    removeMessage(effectiveRoom.id, String(m.id));
                    const prevMeta = ((m as any)?.meta ?? {}) as any;
                    const prevDeletedFor = (prevMeta?.deletedFor ?? {}) as Record<string, boolean>;
                    const patch: any = {
                      updatedAt: Date.now(),
                      meta: {
                        ...prevMeta,
                        deletedFor: {
                          ...prevDeletedFor,
                          [String(uid)]: true,
                        },
                      },
                    };
                    setDoc(getRoomMessageDocRef(firestore, effectiveRoom.id, String(m.id)), patch, { merge: true }).catch(() => {});
                  } catch {}
                }}
                onForward={async (m) => {
                  try {
                    if (String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowExternalShare === false) {
                      logTtl('blocked_action', { roomId: effectiveRoom.id, action: 'external_share', reason: 'external_share_blocked' });
                      return;
                    }
                    const text = resolveMessageShareText(m) || `[${String(m.type || 'message')}]`;
                    await Share.share({ message: text });
                  } catch {}
                }}
                onArchive={(m) => {
                  try {
                    archiveChatMessageV2ToTreasure(m);
                    Alert.alert(t('보물창고', 'Treasure', '宝物庫', '宝库'), t('비공개로 보관되었습니다.', 'Saved as private.', '非公開で保管しました。', '已私密保存。'));
                  } catch (e: any) {
                    Alert.alert(t('보관', 'Save', '保管', '保存'), String(e?.message || e || t('보관 실패', 'Save failed', '保管失敗', '保存失败')));
                  }
                }}
                onOpenSenderProfile={(senderUid) => {
                  try {
                    if (!senderUid || String(senderUid) === String(uid)) return;
                    router.push({
                      pathname: '/chatv2/friend-profile',
                      params: { id: String(senderUid), userId: String(senderUid) },
                    } as any);
                  } catch {}
                }}
                onLoadOlder={onLoadOlder}
                onOpenMedia={(m, opts) => {
                  try {
                    debugLogAttachmentSnapshot('ui.openMedia', m);
                    const baseId = String(m.id || '').replace(/__img\d+$/, '');
                    let idx = -1;
                    if (typeof opts?.albumIndex === 'number') {
                      idx = previewChain.findIndex((x) => String(x.id) === `${baseId}__img${opts.albumIndex}`);
                    }
                    if (idx < 0) idx = previewChain.findIndex((x) => String(x.id) === `${baseId}__img0`);
                    if (idx < 0) idx = previewChain.findIndex((x) => String(x.id) === baseId);
                    if (idx < 0) return;
                    setMediaPreviewIndex(idx);
                    setPreviewOpen(true);
                  } catch {}
                }}
                onApplyReaction={handleApplyReaction}
                onHideMessage={handleHideMessage}
                onDeleteForEveryone={handleDeleteForEveryone}
                onRetryMedia={async (m) => {
                  try {
                    const res = await retryMediaV2(
                      {
                        firestore,
                        storage: firebaseStorage,
                        roomId: effectiveRoom.id,
                        senderId: uid,
                        participantIds: effectiveRoom.participantIds || [],
                        roomType: effectiveRoom.type,
                        title: effectiveRoom.title,
                        ttlMessageExpireSeconds: getMessageExpireSecondsV2(effectiveRoom),
                      } as any,
                      m,
                      { upsertLocal: (rid, msg) => upsertMessage(rid, msg) }
                    );
                    if (res == null) {
                      Alert.alert(t('재시도', 'Retry', '再試行', '重试'), t('로컬 파일 정보가 없어 다시 보낼 수 없습니다.', 'Cannot retry without local file data.', 'ローカルファイル情報がないため再送できません。', '缺少本地文件信息，无法重试。'));
                      return;
                    }
                    if (!res.ok) Alert.alert(t('재시도', 'Retry', '再試行', '重试'), formatChatUploadError(res.error || ''));
                  } catch (e: any) {
                    Alert.alert(t('재시도', 'Retry', '再試行', '重试'), String(e?.message || e || 'retry_failed'));
                  }
                }}
                onVotePoll={(m, optionId) => {
                  try {
                    if (m.type !== 'poll') return;
                    votePollV2({ firestore, roomId: effectiveRoom.id, messageId: String(m.id), uid, optionId: String(optionId) }).catch(() => {});
                  } catch {}
                }}
                fontSize={fontSize}
                bubbleShape={bubbleShape}
                bottomPadding={listBottomPadding}
                keyboardHeight={keyboardH}
              />

              {/* Composer는 항상 화면 하단에 고정 */}
              <View>
                {adminGhost ? (
                  <View style={{ paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#151515', borderTopWidth: 1, borderTopColor: '#2A2A2A' }}>
                    <Text style={{ color: '#777', textAlign: 'center', fontSize: 13 }}>
                      {t('관찰 모드', 'Read-only', '閲覧のみ', '只读模式')}
                    </Text>
                  </View>
                ) : (
                  <ComposerV2
                    firestore={firestore}
                    storage={firebaseStorage}
                    room={effectiveRoom}
                    uid={uid}
                    fontSize={fontSize}
                    keyboardHeight={keyboardH}
                    ttlPolicy={{
                      blocked: ttlBlocked,
                      reason: ttlStatus,
                      allowImageUpload: ttlSecurity?.allowImageUpload !== false,
                      allowExternalShare: ttlSecurity?.allowExternalShare !== false,
                    }}
                    replyTarget={replyTarget}
                    onClearReply={() => setReplyTarget(null)}
                  />
                )}
              </View>
            </>
          )}
        </View>
      )}

      <MediaPreviewModalV2
        visible={previewOpen}
        msg={previewChain[mediaPreviewIndex] ?? null}
        previewChain={previewChain}
        previewIndex={mediaPreviewIndex}
        onPreviewIndexChange={setMediaPreviewIndex}
        allowImageDownload={!(String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowImageDownload === false)}
        allowExternalShare={!(String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowExternalShare === false)}
        onBlocked={(reason) => logTtl('blocked_action', { roomId: effectiveRoom.id, action: 'media_preview', reason })}
        onClose={() => {
          setPreviewOpen(false);
          setMediaPreviewIndex(0);
        }}
        onForward={async (m) => {
          if (String(effectiveRoom.type) === 'ttl' && ttlSecurity?.allowExternalShare === false) {
            logTtl('blocked_action', { roomId: effectiveRoom.id, action: 'external_share', reason: 'external_share_blocked' });
            return;
          }
          const text = resolveMessageShareText(m) || `[${String(m.type || 'message')}]`;
          await Share.share({ message: text });
        }}
        onArchive={(m) => {
          try {
            archiveChatMessageV2ToTreasure(m);
            Alert.alert(t('보물창고', 'Treasure', '宝物庫', '宝库'), t('비공개로 보관되었습니다.', 'Saved as private.', '非公開で保管しました。', '已私密保存。'));
          } catch (e: any) {
            Alert.alert(t('보관', 'Save', '保管', '保存'), String(e?.message || e || t('보관 실패', 'Save failed', '保管失敗', '保存失败')));
          }
        }}
      />

      <RoomSettingsV2
        visible={settingsOpen && !adminGhost}
        onClose={() => setSettingsOpen(false)}
        firestore={firestore}
        room={effectiveRoom}
        uid={uid}
      />

      <RoomParticipantsModalV2
        visible={participantsOpen && !adminGhost}
        onClose={() => setParticipantsOpen(false)}
        firestore={firestore}
        room={effectiveRoom}
        uid={uid}
      />

      <Modal visible={adminGhost && adminSuspendOpen} transparent animationType="fade" onRequestClose={() => setAdminSuspendOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#333' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 12 }}>
              {t('이용정지 (서버)', 'Chat suspension (server)', '利用停止（サーバー）', '聊天封禁（服务器）')}
            </Text>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>UID</Text>
            <TextInput
              value={adminSuspendUid}
              onChangeText={setAdminSuspendUid}
              placeholder={t('대상 사용자 UID', 'Target user UID', '対象UID', '目标用户 UID')}
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: '#0C0C0C', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2A2A' }}
            />
            <Text style={{ color: '#888', fontSize: 12, marginTop: 10, marginBottom: 4 }}>
              {t('기간(시간, 0=무기한)', 'Duration in hours (0 = no expiry)', '期間（時間・0=無期限）', '时长（小时，0=无期限）')}
            </Text>
            <TextInput
              value={adminSuspendHours}
              onChangeText={setAdminSuspendHours}
              keyboardType="number-pad"
              style={{ backgroundColor: '#0C0C0C', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2A2A' }}
            />
            <Text style={{ color: '#888', fontSize: 12, marginTop: 10, marginBottom: 4 }}>{t('사유(선택)', 'Reason (optional)', '理由（任意）', '原因（可选）')}</Text>
            <TextInput
              value={adminSuspendReason}
              onChangeText={setAdminSuspendReason}
              placeholderTextColor="#666"
              style={{ backgroundColor: '#0C0C0C', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2A2A' }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <Text style={{ color: '#ccc', fontSize: 13, flex: 1, paddingRight: 12 }}>
                {t('이 방에서만 (끄면 전역)', 'This room only (off = global)', 'このルームのみ（オフで全体）', '仅本房间（关闭=全局）')}
              </Text>
              <Switch value={adminSuspendRoomOnly} onValueChange={setAdminSuspendRoomOnly} trackColor={{ false: '#444', true: '#6B4E9E' }} thumbColor="#f4f3f4" />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
              <TouchableOpacity onPress={() => setAdminSuspendOpen(false)} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text style={{ color: '#888', fontWeight: '700' }}>{t('\uB2EB\uAE30', 'Close', '\u9589\u3058\u308B', '\u5173\u95ED')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onAdminSubmitSuspend}
                disabled={adminModBusy}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#6B4E9E', opacity: adminModBusy ? 0.5 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>{t('적용', 'Apply', '適用', '应用')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

