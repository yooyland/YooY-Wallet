import React from 'react';
import { View, Text, TouchableOpacity, Linking, Modal, Share, useWindowDimensions, ActivityIndicator, Pressable, StyleSheet, Alert } from 'react-native';
import { Image as EImage } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import type { ChatMessageV2 } from '../core/messageSchema';
import type { ChatPollV2 } from '../core/messageSchema';
import { yyChatFlow } from '../core/chatFlowLog';
import { formatChatMessageTime, formatMessageTimeLabel } from '../core/chatTimeFormat';
import { parseFirestoreMs } from '../core/firestoreMs';
import {
  getDisplayFileName,
  getLinkUrlSafe,
  getLocalPreviewUri,
  getMediaRemoteUrl,
  getMediaPlayableUri,
  getThumbSourceUri,
  getHttpsAttachmentUrl,
  formatReplySnapshotSubtitle,
  isLikelyVideoStreamUri,
} from '../core/attachmentAccess';
import { extractFirstOpenableUrl, isOpenableUrlString, parseChatTextWithLinks } from '../core/chatTextLinks';
import { isYooyDeepLinkCandidate, openInternalAppLink } from '../core/openInternalAppLink';
import { isChatV2InviteJoinHttpsUrl } from '../core/linkRouting';
import { parseYoutubeVideoId } from '../services/linkPreviewService';
import { getMessageReactionsMap } from '../services/messageReactionService';
import { usePreferences } from '@/contexts/PreferencesContext';
import { chatTr } from '../core/chatI18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 말풍선 하단: 오늘은 시각만, 어제/다른 날은 날짜+시각 */
function formatBubbleTimeLabel(msg: ChatMessageV2): string {
  const c = parseFirestoreMs(msg.createdAt);
  const u = parseFirestoreMs(msg.updatedAt);
  const ms = c > 0 ? c : u > 0 ? u : 0;
  if (!ms) return '--:--';
  try {
    const d = new Date(ms);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const timePart = formatChatMessageTime(ms) || d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (sameDay) return timePart;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yest =
      d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate();
    if (yest) return `어제 ${timePart}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${timePart}`;
  } catch {
    return formatMessageTimeLabel(msg);
  }
}

function renderSystemTextOverride(msg: ChatMessageV2): string | null {
  try {
    if (msg.type !== 'system') return null;
    const kind = String((msg as any)?.meta?.kind || '').trim();
    if (kind === 'join') {
      const name = String((msg as any)?.meta?.joinedName || '').trim();
      return name ? `${name} 님이 입장했습니다.` : '새 멤버가 입장했습니다.';
    }
  } catch {}
  return null;
}

function formatBytes(n?: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** 상위 status는 sending인데 원격 URL·첨부 uploaded 가 이미 있으면 업로드 완료로 간주 (말풍선 오버레이·읽음 배지 정합) */
function isMediaUploadComplete(msg: ChatMessageV2): boolean {
  const t = msg.type;
  if (t !== 'image' && t !== 'video' && t !== 'file' && t !== 'audio') return true;
  const st = String(msg.status || '');
  if (st === 'failed') return false;
  if (st === 'ready' || st === 'sent') return true;
  if (t === 'image') {
    const album = (msg as any)?.meta?.imageAlbum;
    if (Array.isArray(album) && album.length >= 2) {
      return album.every((slot: any) => {
        const r = String(slot?.remoteUrl || slot?.thumbnailUrl || '').trim();
        return r.length > 8 && /^https?:\/\//i.test(r);
      });
    }
  }
  const att = msg.attachment;
  if (att?.status === 'uploaded' || att?.status === 'sent') return true;
  const https = String(getHttpsAttachmentUrl(msg) || '').trim();
  if (https.length > 8) return true;
  const resolved = String(getMediaRemoteUrl(msg) || '').trim();
  if (resolved.length > 8 && /^https?:\/\//i.test(resolved)) return true;
  const ar = String(att?.remoteUrl || '').trim();
  if (ar.length > 8 && /^https?:\/\//i.test(ar)) return true;
  const au = String((att as any)?.url || '').trim();
  if (au.length > 8 && /^https?:\/\//i.test(au)) return true;
  if (t === 'image' || t === 'video') {
    const th = String(att?.thumbnailUrl || (typeof msg.thumbnailUrl === 'string' ? msg.thumbnailUrl : '') || '').trim();
    if (th.length > 8 && /^https?:\/\//i.test(th)) return true;
  }
  return false;
}

function TtlMsgCountdownRow({ msg, ttlSec, alignRight }: { msg: ChatMessageV2; ttlSec: number; alignRight: boolean }) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    // 500ms tick은 모든 말풍선에 누적되면 CPU 사용량이 크게 증가 → 1s로 완화
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [msg.id]);
  if (!ttlSec || ttlSec <= 0) return null;
  const expDirect = typeof (msg as any).expiresAt === 'number' ? Number((msg as any).expiresAt) : 0;
  const base = Number(msg.createdAt || 0);
  const exp = expDirect > 0 ? expDirect : base > 0 ? base + ttlSec * 1000 : 0;
  if (!exp) return null;
  const left = Math.max(0, Math.ceil((exp - Date.now()) / 1000));
  if (left <= 0) return null;
  const mm = Math.floor(left / 60);
  const ss = left % 60;
  return (
    <Text
      key={`ttl-${tick}`}
      style={{
        color: left <= 10 ? '#FF6B6B' : '#FF9800',
        fontSize: 10,
        fontWeight: '800',
        marginTop: 2,
        alignSelf: alignRight ? 'flex-end' : 'flex-start',
      }}
    >
      삭제 {mm}:{String(ss).padStart(2, '0')}
    </Text>
  );
}

function MessageMetaRow({
  time,
  readReceipt,
  unreadCount,
  alignRight,
}: {
  time: string;
  readReceipt: string | null;
  /** 내 말풍선: 아직 이 메시지를 읽지 않은 다른 참가자 수(0이면 숨김) */
  unreadCount?: number | null;
  alignRight: boolean;
}) {
  const showUnread = unreadCount != null && unreadCount > 0;
  if (!time && !readReceipt && !showUnread) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: alignRight ? 'flex-end' : 'flex-start',
        gap: 6,
        marginTop: 4,
        alignSelf: alignRight ? 'flex-end' : 'flex-start',
        maxWidth: 280,
      }}
    >
      {time ? (
        <Text style={{ color: '#777', fontSize: 11 }}>{time}</Text>
      ) : null}
      {showUnread ? (
        <Text style={{ color: '#FF9800', fontSize: 11, fontWeight: '800' }}>{unreadCount}</Text>
      ) : null}
      {readReceipt ? (
        <Text
          style={{
            color: readReceipt === '전송 실패' ? '#E57373' : readReceipt === '보내는 중' ? '#AAA' : '#999',
            fontSize: 10,
            fontWeight: '800',
          }}
        >
          {readReceipt}
        </Text>
      ) : null}
    </View>
  );
}

/** 동영상 말풍선 썸네일 (로컬 file/content 또는 원격 URL) */
function VideoThumbUri({
  uri,
  width,
  height,
  onSurfaceReady,
}: {
  uri: string;
  width: number;
  height: number;
  onSurfaceReady?: () => void;
}) {
  const [thumb, setThumb] = React.useState<string>('');
  const [genDone, setGenDone] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    setGenDone(false);
    const to = setTimeout(() => {
      if (!cancelled) setGenDone(true);
    }, 12000);
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const VideoThumbnails = require('expo-video-thumbnails');
        const { uri: u } = await VideoThumbnails.getThumbnailAsync(String(uri), { time: 500 });
        if (!cancelled && u) setThumb(String(u));
      } catch {
        /* 썸네일 실패 시 ▶ 폴백 */
      } finally {
        clearTimeout(to);
        if (!cancelled) setGenDone(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(to);
    };
  }, [uri]);

  React.useEffect(() => {
    if (!genDone) return;
    if (!thumb) onSurfaceReady?.();
  }, [genDone, thumb, onSurfaceReady]);

  React.useEffect(() => {
    if (!thumb) return;
    const id = requestAnimationFrame(() => onSurfaceReady?.());
    return () => cancelAnimationFrame(id);
  }, [thumb, onSurfaceReady]);

  if (thumb) {
    return (
      <EImage
        source={{ uri: thumb }}
        style={{ width, height }}
        contentFit="cover"
        transition={120}
        onLoad={() => onSurfaceReady?.()}
        onError={() => onSurfaceReady?.()}
      />
    );
  }
  return (
    <View style={{ width, height, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFD700', fontSize: 28 }}>▶</Text>
    </View>
  );
}

type Props = {
  msg: ChatMessageV2;
  isMe: boolean;
  uid?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  /** 익명(ID만 표시) 사용자 — 이름/아바타 탭으로 프로필 이동 불가 */
  profileTapDisabled?: boolean;
  showSenderMeta?: boolean;
  /** 채팅 목록에 보이는 표시명·프사를 프로필 화면으로 전달 */
  onOpenSenderProfile?: (senderId: string, hint?: { name?: string; avatarUrl?: string }) => void;
  onReply?: (msg: ChatMessageV2) => void;
  onDeleteMine?: (msg: ChatMessageV2) => void;
  onForward?: (msg: ChatMessageV2) => void;
  onJumpToMessage?: (messageId: string) => void;
  onOpenMedia?: (msg: ChatMessageV2, opts?: { albumIndex?: number }) => void;
  /** 말풍선 옆 💬 메뉴의 「공감」(레거시, 이모지 선택 후 onApplyReaction 권장) */
  onReact?: (msg: ChatMessageV2) => void;
  /** 공감 이모지 저장 */
  onApplyReaction?: (msg: ChatMessageV2, emoji: string) => void;
  /** 가리기(내 화면에서만) — UI는 방장/부방장만 */
  onHideMessage?: (msg: ChatMessageV2) => void;
  /** 모두에게 삭제 — 본인 또는 방장/부방장 */
  onDeleteForEveryone?: (msg: ChatMessageV2) => void;
  onRetryMedia?: (msg: ChatMessageV2) => void;
  onVotePoll?: (msg: ChatMessageV2, optionId: string) => void;
  onArchive?: (msg: ChatMessageV2) => void;
  /** false면 롱프레스 메뉴에서 전달/공유 숨김 (TTL 외부 공유 차단 등) */
  allowExternalShare?: boolean;
  /** 방 설정 테마: 각진 말풍선 */
  bubbleShape?: 'rounded' | 'square';
  fontSize?: number;
  roomType?: 'dm' | 'group' | 'ttl';
  /** TTL 방: 메시지 만료까지 남은 시간 표시(초) */
  ttlMessageExpireSeconds?: number | null;
  /** roomMembers … lastReadAt(ms) — 미읽음 인원 집계 */
  memberLastReadByUid?: Record<string, number>;
  /** rooms.participantIds — 읽음 집계 대상(본인 제외) */
  participantIdsForRead?: string[];
  /** 방장·부방장(adminIds·createdBy) */
  isRoomModerator?: boolean;
  /** 관리자 유령 입장: 롱프레스 메뉴 비활성 */
  readOnly?: boolean;
};

export const MessageBubbleV2 = React.memo(function MessageBubbleV2({
  msg,
  isMe,
  uid,
  senderName = '',
  senderAvatarUrl = '',
  profileTapDisabled = false,
  showSenderMeta = false,
  onOpenSenderProfile,
  onReply,
  onDeleteMine,
  onForward,
  onJumpToMessage,
  onOpenMedia,
  onReact,
  onApplyReaction,
  onHideMessage,
  onDeleteForEveryone,
  onRetryMedia,
  onVotePoll,
  onArchive,
  allowExternalShare = true,
  bubbleShape = 'rounded',
  fontSize = 16,
  roomType = 'group',
  ttlMessageExpireSeconds = null,
  memberLastReadByUid = {},
  participantIdsForRead = [],
  isRoomModerator = false,
  readOnly = false,
}: Props) {
  const bubbleR = bubbleShape === 'square' ? 4 : 14;
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { language } = usePreferences();
  const t = React.useCallback((ko: string, en: string, ja?: string, zh?: string) => chatTr(language as any, ko, en, ja, zh), [language]);
  /** 카카오톡식: 좌측 아바타 열 고정 + 콘텐츠 열에서 이름·말풍선·카드 동일 left */
  const LEFT_COL_W = 48;
  const AVATAR_SZ = 36;
  const CONTENT_GAP = 8;
  const peerBubbleMax = winW * 0.8;
  const meBubbleMax = winW * 0.8;

  const bg = isMe ? '#D4AF37' : '#1E1E1E';
  const fg = isMe ? '#0C0C0C' : '#F2F2F2';
  /** 텍스트 말풍선(bg)과 톤을 맞춘 카드·미디어 프레임 — 상대는 기존 다크, 내 메시지는 골드 계열 */
  const cardBg = isMe ? bg : '#1E1E1E';
  const cardBorder = isMe ? '#5E4F18' : '#2A2A2A';
  const mediaShellBg = isMe ? '#B8942E' : '#111';
  const mediaShellBorder = isMe ? '#6E5D1C' : '#2A2A2A';
  const mediaPlaceholderBg = isMe ? '#A88224' : '#1A1A1A';
  const fileIconBg = isMe ? '#8A7428' : '#1E1E1E';
  const cardTextPrimary = isMe ? '#161308' : '#EDEDED';
  const cardTextSecondary = isMe ? '#2F290F' : '#AAA';
  const cardTextMuted = isMe ? '#4A4020' : '#888';
  const captionBelowMedia = isMe ? '#9A8A5A' : '#AAA';
  const senderId = String(msg.senderId || '');
  const bubbleMax = isMe ? meBubbleMax : peerBubbleMax;
  const bubbleAlign = isMe ? ('flex-end' as const) : ('flex-start' as const);
  const replyTo = ((msg as any)?.meta?.replyTo || null) as
    | { id?: string; senderName?: string; text?: string; type?: string; thumbnailUrl?: string }
    | null;
  const replyId = String(replyTo?.id || '').trim();
  const replySenderName = String(replyTo?.senderName || '').trim();
  const replyType = String(replyTo?.type || '').trim();
  const replyThumbUri = String(replyTo?.thumbnailUrl || '').trim();
  const replySubtitle = formatReplySnapshotSubtitle(replyTo);
  const replyShowMediaSlot =
    !!replyThumbUri || ['image', 'video', 'file', 'audio'].includes(replyType);

  const openProfile = () => {
    if (isMe) return;
    if (!senderId) return;
    if (profileTapDisabled) return;
    onOpenSenderProfile?.(senderId, { name: senderName, avatarUrl: senderAvatarUrl });
  };
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);

  const readImageAlbum = (m: ChatMessageV2) => {
    const a = (m.meta as any)?.imageAlbum;
    return Array.isArray(a) && a.length >= 2 ? a : [];
  };
  const albumUri = (slot: any) => String(slot?.localUri || slot?.remoteUrl || slot?.thumbnailUrl || '').trim();

  const att = msg.attachment;
  const bubbleRemote = getMediaRemoteUrl(msg) || '';
  const bubbleLocalPv = getLocalPreviewUri(msg) || '';
  const bubblePreviewThumbUri =
    msg.type === 'image'
      ? String(att?.localUri || att?.remoteUrl || att?.thumbnailUrl || '').trim() ||
        getThumbSourceUri(msg) ||
        ''
      : msg.type === 'video'
        ? getThumbSourceUri(msg) || String(att?.localUri || att?.thumbnailUrl || '').trim() || ''
        : '';

  const [bubbleThumbDecoded, setBubbleThumbDecoded] = React.useState(false);
  React.useEffect(() => {
    setBubbleThumbDecoded(false);
  }, [msg.id, bubblePreviewThumbUri, msg.updatedAt]);

  const bubbleMediaDone = isMediaUploadComplete(msg);
  /** 썸네일/로컬·원격 URI가 보이면 업로드 스피너·보내는 중 표시 중단 */
  const thumbUriHttps =
    !!(msg.type === 'image' || msg.type === 'video') &&
    !!bubblePreviewThumbUri &&
    /^https?:\/\//i.test(String(bubblePreviewThumbUri).trim());
  const bubbleHideUploadSpinner =
    msg.status === 'failed' ||
    bubbleMediaDone ||
    msg.status === 'sent' ||
    msg.status === 'ready' ||
    ((msg.type === 'image' || msg.type === 'video') &&
      !!bubblePreviewThumbUri &&
      (bubbleThumbDecoded || thumbUriHttps)) ||
    ((msg.type === 'file' || msg.type === 'audio') && (!!bubbleLocalPv || !!bubbleRemote));

  const timeStr = formatBubbleTimeLabel(msg);
  /** 보내는 중·전송 실패만 문구 표시(전송됨/읽음 문구는 미사용) */
  const readReceiptDm = React.useMemo(() => {
    if (!isMe) return null;
    const st = String(msg.status || 'sent');
    const mediaDone = isMediaUploadComplete(msg);
    if ((st === 'sending' || st === 'uploaded') && !bubbleHideUploadSpinner) return '보내는 중';
    if (st === 'failed') return '전송 실패';
    return null;
  }, [isMe, msg, bubbleHideUploadSpinner]);

  /** 본인 메시지: 다른 참가자 중 이 시각 기준 아직 안 읽은 사람 수(본인 제외) */
  const unreadRecipientCount = React.useMemo(() => {
    if (!isMe) return null;
    const st = String(msg.status || 'sent');
    const mediaDone = isMediaUploadComplete(msg);
    if ((st === 'sending' || st === 'uploaded') && !bubbleHideUploadSpinner) return null;
    if (st === 'failed') return null;
    if (st !== 'sent' && st !== 'ready' && !mediaDone) return null;
    const created = Number(msg.createdAt || 0) || Number(msg.updatedAt || 0);
    if (!created) return null;
    const my = String(uid || '');
    const ids = Array.isArray(participantIdsForRead)
      ? participantIdsForRead.map((x) => String(x)).filter(Boolean)
      : [];
    const others = ids.filter((id) => id && id !== my);
    if (others.length === 0) return null;
    const map = memberLastReadByUid && typeof memberLastReadByUid === 'object' ? memberLastReadByUid : {};
    const READ_SLOP_MS = 500;
    let unread = 0;
    for (const pid of others) {
      const lr = map[pid];
      if (lr == null || !Number.isFinite(Number(lr))) {
        unread++;
        continue;
      }
      if (Number(lr) + READ_SLOP_MS < created) unread++;
    }
    return unread;
  }, [isMe, uid, msg, participantIdsForRead, memberLastReadByUid, bubbleHideUploadSpinner]);

  const menuText = String(msg.text || getMediaRemoteUrl(msg) || getLinkUrlSafe(msg) || '').trim();
  const firstOpenableUrl = React.useMemo(() => extractFirstOpenableUrl(menuText), [menuText]);
  const canOpenLink = !!firstOpenableUrl;
  const openMenu = () => {
    if (readOnly) return;
    setMenuOpen(true);
  };
  const closeMenu = () => {
    setMenuOpen(false);
    setEmojiPickerOpen(false);
  };

  const reactionMap = React.useMemo(() => getMessageReactionsMap(msg), [msg]);
  const renderReactionChips = () => {
    const entries = Object.entries(reactionMap).filter(([, em]) => String(em || '').trim());
    if (entries.length === 0) return null;
    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 4,
          maxWidth: bubbleMax,
          alignSelf: bubbleAlign,
        }}
      >
        {entries.map(([rid, em]) => (
          <View
            key={rid}
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <Text style={{ fontSize: 15 }}>{String(em)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

  const applyEmoji = (emoji: string) => {
    setEmojiPickerOpen(false);
    try {
      onApplyReaction?.(msg, emoji);
      onReact?.(msg);
    } catch {}
  };

  const openReactionEmojiPicker = () => {
    setMenuOpen(false);
    setEmojiPickerOpen(true);
  };

  const open = () => {
    const localUri = getLocalPreviewUri(msg) || '';
    const remote = getMediaRemoteUrl(msg) || '';
    const mediaKind = msg.type === 'image' || msg.type === 'video' || msg.type === 'file' || msg.type === 'audio';
    const hasRemoteNow =
      !!String((msg as any)?.attachment?.remoteUrl || '').trim() ||
      !!String((msg as any)?.attachment?.url || '').trim() ||
      !!String((msg as any)?.url || '').trim() ||
      !!String(remote || '').trim();
    const isFailedNow = msg?.status === 'failed' || (msg as any)?.attachment?.status === 'failed';
    // 실패 + remoteUrl/url 없음 상태에서는 로컬 미리보기 팝업을 막아 "전송된 것처럼" 보이지 않게 한다.
    if (mediaKind && isFailedNow && !hasRemoteNow) return;
    const canPreview =
      msg.status === 'ready' ||
      msg.status === 'sent' ||
      (mediaKind && isMediaUploadComplete(msg)) ||
      (mediaKind && localUri.length > 0 && (msg.status === 'sending' || msg.status === 'failed' || msg.status === 'uploaded'));
    if (!canPreview) return;
    try {
      yyChatFlow('ui.preview.tap', {
        roomId: msg.roomId,
        messageId: msg.id,
        type: msg.type,
        status: msg.status,
        url: String(remote || localUri || '').slice(0, 120),
      });
    } catch {}
    if (onOpenMedia) {
      if (msg.status === 'ready' || msg.status === 'sent' || isMediaUploadComplete(msg)) return onOpenMedia(msg);
      if (localUri) return onOpenMedia({ ...msg, url: remote || localUri } as ChatMessageV2);
      return;
    }
    const u = String(remote || localUri || '');
    if (u) Linking.openURL(u).catch(() => {});
  };

  const renderContent = () => {
    const cardMax = bubbleMax;
    const mediaW = Math.min(220, cardMax);

    if (msg.type === 'text') {
      const body = String(msg.text || '');
      const segments = parseChatTextWithLinks(body);
      const linkFg = isMe ? '#1a3d6e' : '#6BB6FF';
      const hasLinks = segments.some((s) => s.kind === 'link');
      return (
        <View style={{ maxWidth: cardMax, alignSelf: bubbleAlign, backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 10, borderRadius: bubbleR }}>
          <Text style={{ color: fg, fontSize, fontWeight: '600' }} selectable>
            {hasLinks
              ? segments.map((seg, i) =>
                  seg.kind === 'link' ? (
                    <Text
                      key={`l-${i}`}
                      onPress={async () => {
                        if (isYooyDeepLinkCandidate(seg.url)) {
                          const ok = await openInternalAppLink(seg.url);
                          if (ok) return;
                        }
                        Linking.openURL(seg.url).catch(() => {});
                      }}
                      style={{ color: linkFg, textDecorationLine: 'underline', fontWeight: '600' }}
                    >
                      {seg.url}
                    </Text>
                  ) : (
                    <Text key={`t-${i}`}>{seg.text}</Text>
                  )
                )
              : body}
          </Text>
        </View>
      );
    }

    if (msg.type === 'location') {
      const roadFirst = String(msg.location?.roadAddress || '').trim();
      const label = roadFirst || String(msg.location?.address || msg.text || '').trim() || t('위치', 'Location', '位置情報', '位置');
      const lat = Number((msg.location as any)?.lat ?? (msg.location as any)?.latitude ?? 0);
      const lng = Number((msg.location as any)?.lng ?? (msg.location as any)?.longitude ?? 0);
      const url =
        typeof msg?.url === 'string' && msg.url.trim().length > 0
          ? String(msg.url)
          : `https://maps.google.com/?q=${encodeURIComponent(String(lat) + ',' + String(lng))}`;
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            if (onOpenMedia) {
              onOpenMedia(msg);
              return;
            }
            Linking.openURL(url).catch(() => {});
          }}
          style={{ maxWidth: cardMax, alignSelf: bubbleAlign, backgroundColor: cardBg, paddingHorizontal: 12, paddingVertical: 10, borderRadius: bubbleR, borderWidth: 1, borderColor: cardBorder }}
        >
          <Text style={{ color: isMe ? '#3D2F08' : '#FFD700', fontWeight: '800', marginBottom: 4 }}>📍 {t('위치', 'Location', '位置情報', '位置')}</Text>
          <Text style={{ color: cardTextPrimary, fontSize: Math.max(12, fontSize - 2), fontWeight: '700' }}>{label}</Text>
        </TouchableOpacity>
      );
    }

    if (msg.type === 'url') {
      const u = String(getLinkUrlSafe(msg) || msg.text || '').trim();
      const thumb = String(msg.link?.image || '').trim();
      const isYt = !!parseYoutubeVideoId(u);
      const inviteJoinHttps = isChatV2InviteJoinHttpsUrl(u);
      let host = '';
      try {
        host = new URL(u).hostname;
      } catch {}
      const titleText = String(msg.link?.title || '').trim() || u;
      const linkCardBg = isMe ? '#6A5311' : '#141B2C';
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={async () => {
            if (!u) return;
            if (inviteJoinHttps) {
              const ok = await openInternalAppLink(u);
              if (ok) return;
              Linking.openURL(u).catch(() => {});
              return;
            }
            if (onOpenMedia) {
              onOpenMedia(msg);
              return;
            }
            if (isYooyDeepLinkCandidate(u)) {
              const ok = await openInternalAppLink(u);
              if (ok) return;
            }
            Linking.openURL(u).catch(() => {});
          }}
          style={{
            maxWidth: cardMax,
            alignSelf: bubbleAlign,
            backgroundColor: linkCardBg,
            borderRadius: bubbleR,
            borderWidth: 1,
            borderColor: cardBorder,
            overflow: 'hidden',
          }}
        >
          {thumb ? (
            <View style={{ width: '100%', backgroundColor: '#000' }}>
              <EImage source={{ uri: thumb }} style={{ width: '100%', aspectRatio: 16 / 9 }} contentFit="cover" transition={120} />
              {isYt ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.25)',
                  }}
                  pointerEvents="none"
                >
                  <Text style={{ color: '#FFF', fontSize: 36, fontWeight: '900' }}>▶</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: isMe ? '#3E2F08' : '#153B6E' }}>
                <Text style={{ color: isMe ? '#F4E3A3' : '#BFE0FF', fontSize: 10, fontWeight: '900' }}>URL</Text>
              </View>
              {host ? (
                <Text style={{ color: isMe ? '#FFEAA0' : '#BFDBFE', fontSize: 11, fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>
                  {host}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: isMe ? '#FFF3C4' : '#EAF2FF', fontSize: Math.max(14, fontSize - 1), fontWeight: '800', marginTop: 8 }} numberOfLines={3}>
              {titleText}
            </Text>
            <Text style={{ color: cardTextMuted, marginTop: 8, fontSize: 12 }} numberOfLines={2}>
              {t('여기를 눌러 링크를 확인하세요.', 'Tap here to open the link.', 'ここを押してリンクを確認してください。', '点击这里查看链接。')}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (msg.type === 'qr') {
      const raw = String(msg.qr?.raw || msg.text || '').trim();
      const isUrl = isOpenableUrlString(raw);
      const qrSize = Math.min(168, Math.max(120, cardMax - 48));
      const qrValue = raw.length > 1200 ? raw.slice(0, 1200) : raw;
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={async () => {
            if (!raw) return;
            if (onOpenMedia) {
              onOpenMedia(msg);
              return;
            }
            if (!isUrl) return;
            if (isYooyDeepLinkCandidate(raw)) {
              const ok = await openInternalAppLink(raw);
              if (ok) return;
            }
            Linking.openURL(raw).catch(() => {});
          }}
          style={{ maxWidth: cardMax, alignSelf: bubbleAlign, backgroundColor: cardBg, paddingHorizontal: 12, paddingVertical: 10, borderRadius: bubbleR, borderWidth: 1, borderColor: cardBorder }}
        >
          <Text style={{ color: isMe ? '#3D2F08' : '#FFD700', fontWeight: '900' }}>🔳 QR</Text>
          {raw && qrValue ? (
            <View style={{ alignItems: 'center', marginTop: 10, alignSelf: 'center' }}>
              <View style={{ backgroundColor: '#fff', padding: 8, borderRadius: 10 }}>
                <QRCode value={qrValue} size={qrSize} backgroundColor="#fff" color="#000" />
              </View>
            </View>
          ) : null}
          <Text
            selectable
            style={{ color: cardTextPrimary, marginTop: 10, fontSize: Math.max(11, fontSize - 3), lineHeight: 18 }}
            numberOfLines={8}
          >
            {raw || '[QR]'}
          </Text>
          {isUrl ? (
            <Text style={{ color: cardTextSecondary, marginTop: 6, fontSize: Math.max(11, fontSize - 4) }} numberOfLines={1}>
              {t('탭하여 열기', 'Tap to open', 'タップして開く', '点击打开')}
            </Text>
          ) : null}
        </TouchableOpacity>
      );
    }

    if (msg.type === 'poll') {
      const poll = (msg.poll || {}) as ChatPollV2;
      const question = String(poll.question || msg.text || t('투표', 'Poll', '投票', '投票')).trim();
      const options = Array.isArray(poll.options) ? poll.options : [];
      const votesByUser = poll.votesByUser && typeof poll.votesByUser === 'object' ? poll.votesByUser : {};
      const me = String(uid || '');
      const myVotes = me && Array.isArray((votesByUser as any)[me]) ? ((votesByUser as any)[me] as string[]) : [];
      const totalVotes = Object.values(votesByUser).reduce(
        (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
        0
      );

      const countFor = (optionId: string) => {
        let c = 0;
        Object.values(votesByUser).forEach((arr) => {
          if (Array.isArray(arr) && arr.includes(optionId)) c += 1;
        });
        return c;
      };

      return (
        <View style={{ width: Math.min(260, cardMax), maxWidth: cardMax, alignSelf: bubbleAlign, backgroundColor: cardBg, paddingHorizontal: 12, paddingVertical: 10, borderRadius: bubbleR, borderWidth: 1, borderColor: cardBorder }}>
          <Text style={{ color: cardTextPrimary, fontWeight: '900', marginBottom: 8 }} numberOfLines={2}>
            {question}
          </Text>
          {options.map((op) => {
            const count = countFor(String(op.id));
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const picked = myVotes.includes(String(op.id));
            const pollRowStyle = {
              marginTop: 8,
              borderWidth: 1,
              borderColor: picked ? '#FFD700' : isMe ? '#4A4020' : '#333',
              borderRadius: 10,
              overflow: 'hidden' as const,
              backgroundColor: picked ? (isMe ? 'rgba(0,0,0,0.12)' : 'rgba(212,175,55,0.10)') : isMe ? '#3D3515' : '#0C0C0C',
            };
            const pollInner = (
              <View>
                <View style={{ height: 8, width: `${pct}%`, backgroundColor: '#FFD700' }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10 }}>
                  <Text style={{ color: cardTextPrimary, fontWeight: '800', flex: 1, paddingRight: 10 }} numberOfLines={2}>
                    {String(op.text || '')}
                  </Text>
                  <Text style={{ color: cardTextSecondary, fontWeight: '800' }}>
                    {count}
                    {totalVotes > 0 ? ` (${pct}%)` : ''}
                  </Text>
                </View>
              </View>
            );
            return readOnly ? (
              <View key={String(op.id)} style={pollRowStyle}>
                {pollInner}
              </View>
            ) : (
              <TouchableOpacity
                key={String(op.id)}
                activeOpacity={0.85}
                onPress={() => {
                  try {
                    onVotePoll?.(msg, String(op.id));
                  } catch {}
                }}
                style={pollRowStyle}
              >
                {pollInner}
              </TouchableOpacity>
            );
          })}
          <Text style={{ color: cardTextMuted, marginTop: 10, fontSize: Math.max(11, fontSize - 4) }}>{t('총', 'Total', '合計', '共')} {totalVotes}{t('표', ' votes', '票', '票')}</Text>
        </View>
      );
    }

    if (msg.type === 'system') {
      const sysText = renderSystemTextOverride(msg) || String(msg.text || '');
      return (
        <View style={{ maxWidth: cardMax, alignSelf: bubbleAlign, backgroundColor: '#0F0F0F', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#222' }}>
          <Text style={{ color: '#AAA', fontWeight: '700', fontSize: Math.max(11, fontSize - 4) }}>{sysText}</Text>
        </View>
      );
    }

    // media: image/video/audio/file — 이미지: attachment.localUri || attachment.remoteUrl 우선 (Hermes .url 오류 방지)
    const imageAlbum = readImageAlbum(msg);
    const title =
      msg.type === 'image' ? t('이미지', 'Image', '画像', '图片') : msg.type === 'video' ? t('영상', 'Video', '動画', '视频') : msg.type === 'audio' ? t('음성', 'Audio', '音声', '语音') : t('파일', 'File', 'ファイル', '文件');
    const remoteUrl = getMediaRemoteUrl(msg) || '';
    const localFirst =
      String(att?.localUri || att?.remoteUrl || '').trim() || getLocalPreviewUri(msg) || '';
    const localUri = getLocalPreviewUri(msg) || '';
    const thumbUri =
      msg.type === 'image'
        ? String(att?.localUri || att?.remoteUrl || att?.thumbnailUrl || '').trim() ||
          getThumbSourceUri(msg) ||
          ''
        : getThumbSourceUri(msg) || '';
    const hasDisplay = !!String(thumbUri || localFirst || '').trim();
    const mediaDone = bubbleMediaDone;
    const ready =
      hasDisplay &&
      (msg.status === 'ready' ||
        msg.status === 'sent' ||
        mediaDone ||
        ((msg.type === 'image' || msg.type === 'video') && !!bubblePreviewThumbUri && bubbleThumbDecoded) ||
        ((msg.type === 'file' || msg.type === 'audio') && (!!bubbleLocalPv || !!bubbleRemote)));
    const hasRemote =
      !!att?.remoteUrl || !!(att as any)?.url || !!(msg as any)?.url;
    const isSent =
      msg?.status === 'sent' || att?.status === 'sent' || att?.status === 'uploaded';
    const showSendingOverlay =
      !bubbleHideUploadSpinner &&
      !hasRemote &&
      !isSent &&
      (msg?.status === 'sending' || att?.status === 'sending');
    const bubbleStatusLabel =
      msg.status === 'failed' ? msg.status : mediaDone && (msg.status === 'sending' || msg.status === 'uploaded') ? 'sent' : msg.status;
    const canRetry =
      msg.status === 'failed' &&
      !!(msg as any)?.meta?.retryable &&
      ((typeof (msg as any)?.meta?.localUri === 'string' && String((msg as any).meta.localUri).length > 0) ||
        (typeof att?.localUri === 'string' && String(att.localUri).length > 0));

    const overlaySending = showSendingOverlay ? (
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color="#FFD700" />
        <Text style={{ color: '#EEE', marginTop: 8, fontSize: 11, fontWeight: '800' }}>{t('업로드 중', 'Uploading', 'アップロード中', '上传中')}</Text>
      </View>
    ) : null;

    const showFailed = msg?.status === 'failed' || att?.status === 'failed';
    const overlayFailed =
      showFailed ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FF6B6B', fontWeight: '900', fontSize: 12 }}>{t('업로드 실패', 'Upload failed', 'アップロード失敗', '上传失败')}</Text>
        </View>
      ) : null;

    if (msg.type === 'image' && imageAlbum.length >= 2) {
      const gridW = Math.min(280, cardMax);
      const gap = 4;
      const n = imageAlbum.length;
      const cell = (idx: number, boxStyle: object) => {
        const uri = albumUri(imageAlbum[idx]);
        const canOpenAlbumPreview =
          !!String((msg as any)?.attachment?.remoteUrl || '').trim() ||
          !!String((msg as any)?.attachment?.url || '').trim() ||
          !!String((msg as any)?.url || '').trim() ||
          msg?.status === 'sent' ||
          (msg as any)?.attachment?.status === 'sent' ||
          (msg as any)?.attachment?.status === 'uploaded' ||
          isMediaUploadComplete(msg);
        return (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.9}
            onPress={() => {
              if (uri && onOpenMedia && canOpenAlbumPreview) onOpenMedia(msg, { albumIndex: idx });
              else open();
            }}
            style={boxStyle}
          >
            {uri ? (
              <EImage source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={100} />
            ) : (
              <View style={{ flex: 1, backgroundColor: mediaPlaceholderBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: cardTextMuted }}>🖼</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      };
      const shell = (inner: React.ReactNode) => (
        <View
          style={{
            width: gridW,
            alignSelf: bubbleAlign,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: isMe ? 2 : 1,
            borderColor: mediaShellBorder,
            backgroundColor: mediaShellBg,
          }}
        >
          <View style={{ position: 'relative' }}>
            {inner}
            {overlaySending}
            {overlayFailed}
          </View>
        </View>
      );
      if (n === 2) {
        const h = Math.round((gridW - gap) / 2);
        return shell(
          <View style={{ flexDirection: 'row', gap, height: h }}>
            {cell(0, { flex: 1, minHeight: h })}
            {cell(1, { flex: 1, minHeight: h })}
          </View>
        );
      }
      if (n === 3) {
        const H = Math.round(gridW * 0.58);
        return shell(
          <View style={{ flexDirection: 'row', gap, height: H }}>
            <View style={{ flex: 1, minHeight: H }}>{cell(0, { flex: 1, height: '100%' as const })}</View>
            <View style={{ flex: 1, gap, justifyContent: 'space-between', minHeight: H }}>
              {cell(1, { flex: 1 })}
              {cell(2, { flex: 1 })}
            </View>
          </View>
        );
      }
      if (n === 4) {
        const cellSide = Math.round((gridW - gap) / 2);
        return shell(
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width: gridW }}>
            {cell(0, { width: cellSide, height: cellSide })}
            {cell(1, { width: cellSide, height: cellSide })}
            {cell(2, { width: cellSide, height: cellSide })}
            {cell(3, { width: cellSide, height: cellSide })}
          </View>
        );
      }
      const cellSide = Math.round((gridW - gap) / 2);
      const extra = n - 4;
      return shell(
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width: gridW }}>
          {cell(0, { width: cellSide, height: cellSide })}
          {cell(1, { width: cellSide, height: cellSide })}
          {cell(2, { width: cellSide, height: cellSide })}
          <View style={{ width: cellSide, height: cellSide, position: 'relative' }}>
            {cell(3, { width: cellSide, height: cellSide })}
            {extra > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                pointerEvents="none"
              >
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 20 }}>+{extra}</Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    }

    /** URI 없음(스냅샷만 온 실패 메시지 등) — 플레이스홀더 + 재시도 */
    if (msg.type === 'image' && !thumbUri && imageAlbum.length < 2) {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={open}
          style={{
            width: mediaW,
            minHeight: Math.min(140, mediaW),
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: mediaPlaceholderBg,
            borderWidth: 1,
            borderColor: mediaShellBorder,
            alignSelf: bubbleAlign,
            padding: 10,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: cardTextMuted, fontSize: 28, textAlign: 'center' }}>🖼</Text>
          <Text style={{ color: cardTextSecondary, marginTop: 6, fontSize: 12, textAlign: 'center' }} numberOfLines={2}>
            {getDisplayFileName(msg) || t('이미지', 'Image', '画像', '图片')}
          </Text>
          <Text style={{ color: isMe ? '#2A2208' : '#FFD700', marginTop: 6, fontSize: 11, textAlign: 'center' }}>{t('이미지', 'Image', '画像', '图片')} · {bubbleStatusLabel}</Text>
          {overlaySending}
          {overlayFailed}
          {canRetry && typeof onRetryMedia === 'function' && msg.status === 'failed' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onRetryMedia(msg)}
              style={{ marginTop: 10, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: isMe ? '#3D2F08' : '#FFD700' }}
            >
              <Text style={{ color: isMe ? '#2A2208' : '#FFD700', fontWeight: '900', fontSize: 12 }}>{t('재시도', 'Retry', '再試行', '重试')}</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      );
    }

    if (msg.type === 'video' && !thumbUri) {
      const vh = Math.max(120, Math.round((mediaW * 9) / 16));
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={open}
          style={{
            width: mediaW,
            height: vh,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: mediaPlaceholderBg,
            borderWidth: 1,
            borderColor: mediaShellBorder,
            alignSelf: bubbleAlign,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
          }}
        >
          <Text style={{ color: isMe ? '#2A2208' : '#FFD700', fontSize: 36 }}>▶</Text>
          <Text style={{ color: cardTextSecondary, marginTop: 6, fontSize: 12 }} numberOfLines={2}>
            {getDisplayFileName(msg) || t('동영상', 'Video', '動画', '视频')}
          </Text>
          <Text style={{ color: cardTextMuted, marginTop: 4, fontSize: 11 }}>{t('영상', 'Video', '動画', '视频')} · {bubbleStatusLabel}</Text>
          {overlaySending}
          {overlayFailed}
          {canRetry && typeof onRetryMedia === 'function' && msg.status === 'failed' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onRetryMedia(msg)}
              style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: isMe ? '#3D2F08' : '#FFD700' }}
            >
              <Text style={{ color: isMe ? '#2A2208' : '#FFD700', fontWeight: '900', fontSize: 12 }}>{t('재시도', 'Retry', '再試行', '重试')}</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      );
    }

    if (msg.type === 'image' && thumbUri && imageAlbum.length < 2) {
      const fn = getDisplayFileName(msg);
      const qrDecoded = String(((msg as any)?.meta?.qrDecodedText || msg.text || '') as string).trim();
      const qrIsUrl = isOpenableUrlString(qrDecoded);
      return (
        <View style={{ width: mediaW, alignSelf: bubbleAlign }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={open}
            style={{
              width: mediaW,
              height: mediaW,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: mediaShellBg,
              borderWidth: isMe ? 2 : 1,
              borderColor: mediaShellBorder,
            }}
          >
            <EImage
              source={{ uri: thumbUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={100}
              onLoad={() => setBubbleThumbDecoded(true)}
              onError={() => setBubbleThumbDecoded(true)}
            />
            {overlaySending}
            {overlayFailed}
          </TouchableOpacity>
          {fn ? (
            <Text style={{ color: captionBelowMedia, fontSize: Math.max(10, fontSize - 5), marginTop: 4, textAlign: isMe ? 'right' : 'left' }} numberOfLines={1}>
              {fn}
            </Text>
          ) : null}
          {qrDecoded ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                const t = qrDecoded;
                if (!isOpenableUrlString(t)) return;
                if (isYooyDeepLinkCandidate(t)) {
                  const ok = await openInternalAppLink(t);
                  if (ok) return;
                }
                Linking.openURL(t).catch(() => {});
              }}
              style={{ marginTop: 6, maxWidth: mediaW, alignSelf: bubbleAlign }}
            >
              <Text
                selectable
                style={{
                  color: qrIsUrl ? (isMe ? '#1a3d6e' : '#6BB6FF') : captionBelowMedia,
                  fontSize: Math.max(11, fontSize - 4),
                  textAlign: isMe ? 'right' : 'left',
                }}
                numberOfLines={4}
              >
                {qrDecoded}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (msg.type === 'video' && thumbUri) {
      const vh = Math.max(120, Math.round((mediaW * 9) / 16));
      const fn = getDisplayFileName(msg);
      return (
        <View style={{ width: mediaW, alignSelf: bubbleAlign }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={open}
            style={{
              width: mediaW,
              height: vh,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: mediaShellBg,
              borderWidth: isMe ? 2 : 1,
              borderColor: mediaShellBorder,
            }}
          >
            <VideoThumbUri uri={thumbUri} width={mediaW} height={vh} onSurfaceReady={() => setBubbleThumbDecoded(true)} />
            {overlaySending}
            {overlayFailed}
          </TouchableOpacity>
          {fn ? (
            <Text style={{ color: captionBelowMedia, fontSize: Math.max(10, fontSize - 5), marginTop: 4, textAlign: isMe ? 'right' : 'left' }} numberOfLines={1}>
              {fn}
            </Text>
          ) : null}
        </View>
      );
    }

    if (msg.type === 'file' || msg.type === 'audio') {
      const icon = msg.type === 'audio' ? '🎤' : '📎';
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={open}
          style={{
            maxWidth: cardMax,
            alignSelf: bubbleAlign,
            backgroundColor: cardBg,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: bubbleR,
            borderWidth: 1,
            borderColor: cardBorder,
            minWidth: Math.min(mediaW, cardMax),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 10,
                backgroundColor: fileIconBg,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {msg.type === 'file' && thumbUri && /^(image\/|video\/)/i.test(String(msg.mimeType || '')) ? (
                <EImage
                  source={{ uri: thumbUri }}
                  style={{ width: 56, height: 56 }}
                  contentFit="cover"
                  onLoad={() => setBubbleThumbDecoded(true)}
                  onError={() => setBubbleThumbDecoded(true)}
                />
              ) : (
                <Text style={{ fontSize: 26 }}>{icon}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: isMe ? '#1A1508' : '#FFD700', fontWeight: '900' }} numberOfLines={2}>
                {getDisplayFileName(msg) || title}
              </Text>
              <Text style={{ color: cardTextMuted, marginTop: 3, fontSize: 11 }} numberOfLines={1}>
                {title} · {bubbleStatusLabel}
              </Text>
              {formatBytes(msg.size) ? (
                <Text style={{ color: cardTextMuted, marginTop: 2, fontSize: 11 }} numberOfLines={1}>
                  {formatBytes(msg.size)}
                  {msg.mimeType ? ` · ${String(msg.mimeType).split('/').pop()}` : ''}
                </Text>
              ) : null}
              {!ready ? (
                <Text style={{ color: cardTextSecondary, marginTop: 4, fontSize: Math.max(11, fontSize - 4) }} numberOfLines={1}>
                  {msg.status === 'failed' ? '다시 시도할 수 있습니다' : '업로드 완료 후 확인 가능'}
                </Text>
              ) : (
                <Text style={{ color: cardTextSecondary, marginTop: 4, fontSize: Math.max(11, fontSize - 4) }} numberOfLines={1}>
                  탭하여 열기
                </Text>
              )}
            </View>
          </View>
          {showSendingOverlay ? (
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color="#FFD700" size="small" />
              <Text style={{ color: '#AAA', fontSize: 11 }}>업로드 중…</Text>
            </View>
          ) : null}
          {canRetry && typeof onRetryMedia === 'function' && msg.status === 'failed' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                try {
                  yyChatFlow('ui.retry.tap', { roomId: msg.roomId, messageId: msg.id, type: msg.type, status: msg.status });
                } catch {}
                onRetryMedia(msg);
              }}
              style={{
                marginTop: 8,
                alignSelf: 'flex-start',
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: isMe ? '#3D2F08' : '#FFD700',
              }}
            >
              <Text style={{ color: isMe ? '#2A2208' : '#FFD700', fontWeight: '900', fontSize: Math.max(11, fontSize - 4) }}>재시도</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={ready ? open : undefined}
        style={{
          maxWidth: cardMax,
          alignSelf: bubbleAlign,
          backgroundColor: cardBg,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: bubbleR,
          borderWidth: 1,
          borderColor: cardBorder,
          opacity: ready ? 1 : 0.75,
        }}
      >
        <Text style={{ color: isMe ? '#1A1508' : '#FFD700', fontWeight: '900' }} numberOfLines={2}>
          {getDisplayFileName(msg) || title}
        </Text>
        <Text style={{ color: cardTextMuted, marginTop: 4, fontSize: 11 }} numberOfLines={1}>
          {title} · {bubbleStatusLabel}
        </Text>
        {ready ? (
          <Text style={{ color: cardTextSecondary, marginTop: 6, fontSize: Math.max(11, fontSize - 4) }} numberOfLines={1}>
            탭하여 열기
          </Text>
        ) : (
          <>
            <Text style={{ color: cardTextSecondary, marginTop: 6, fontSize: Math.max(11, fontSize - 4) }} numberOfLines={1}>
              {msg.status === 'failed' ? '업로드 실패' : '업로드 완료 후 확인 가능'}
            </Text>
            {canRetry && typeof onRetryMedia === 'function' ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  try {
                    yyChatFlow('ui.retry.tap', { roomId: msg.roomId, messageId: msg.id, type: msg.type, status: msg.status });
                  } catch {}
                  onRetryMedia(msg);
                }}
                style={{
                  marginTop: 8,
                  alignSelf: 'flex-start',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: isMe ? '#3D2F08' : '#FFD700',
                }}
              >
                <Text style={{ color: isMe ? '#2A2208' : '#FFD700', fontWeight: '900', fontSize: Math.max(11, fontSize - 4) }}>재시도</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderReplyPreview = () => {
    if (!replyId) return null;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          try { onJumpToMessage?.(replyId); } catch {}
        }}
        style={{
          maxWidth: bubbleMax,
          alignSelf: bubbleAlign,
          marginBottom: 4,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: isMe ? '#6E5D1C' : '#2A2A2A',
          backgroundColor: isMe ? '#B8942E' : '#111',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {replyShowMediaSlot ? (
          replyThumbUri && !isLikelyVideoStreamUri(replyThumbUri) ? (
            <EImage
              source={{ uri: replyThumbUri }}
              style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: '#222' }}
              contentFit="cover"
            />
          ) : replyThumbUri && isLikelyVideoStreamUri(replyThumbUri) ? (
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: '#1A1A1A',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFF', fontSize: 11 }}>▶</Text>
            </View>
          ) : replyType === 'video' ? (
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: '#1A1A1A',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFF', fontSize: 11 }}>▶</Text>
            </View>
          ) : replyType === 'audio' ? (
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: isMe ? '#5E4F18' : '#2A2A2A',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15 }}>🎤</Text>
            </View>
          ) : replyType === 'file' ? (
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: isMe ? '#5E4F18' : '#2A2A2A',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15 }}>📎</Text>
            </View>
          ) : (
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: '#222',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFD700', fontSize: 9, fontWeight: '900' }}>IMG</Text>
            </View>
          )
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: isMe ? '#2A2208' : '#FFD700', fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
            {replySenderName || t('답장', 'Reply', '返信', '回复')}
          </Text>
          <Text style={{ color: isMe ? '#1A1508' : '#DDD', fontSize: 11 }} numberOfLines={2}>
            {replySubtitle}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const quickBubbleBtn = (
    <TouchableOpacity
      onPress={() => setMenuOpen(true)}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={{
        width: 28,
        height: 28,
        borderRadius: bubbleR,
        backgroundColor: isMe ? '#3D3515' : '#2A2A2A',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
      }}
    >
      <Text style={{ color: '#EEE', fontSize: 12 }}>💬</Text>
    </TouchableOpacity>
  );

  const renderKakaoMenuModals = () => (
    <>
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={closeMenu}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeMenu} />
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
            }}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ width: 40, height: 5, borderRadius: 999, backgroundColor: '#DDDDDD' }} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#111111', paddingHorizontal: 18, marginBottom: 8 }}>
              {t('메시지', 'Message', 'メッセージ', '消息')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-around',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 6,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: '#E8E8E8',
              }}
            >
              <TouchableOpacity onPress={() => { try { onReply?.(msg); } catch {} closeMenu(); }}>
                <Text style={{ color: '#03C75A', fontWeight: '800', fontSize: 15 }}>{t('답장', 'Reply', '返信', '回复')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openReactionEmojiPicker}>
                <Text style={{ color: '#03C75A', fontWeight: '800', fontSize: 15 }}>{t('공감', 'React', 'リアクション', '回应')}</Text>
              </TouchableOpacity>
              {allowExternalShare ? (
                <TouchableOpacity onPress={() => { try { onForward?.(msg); } catch {} closeMenu(); }}>
                  <Text style={{ color: '#03C75A', fontWeight: '800', fontSize: 15 }}>{t('전달', 'Forward', '転送', '转发')}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 48 }} />
              )}
              <TouchableOpacity
                onPress={async () => {
                  try {
                    if (menuText) await Share.share({ message: menuText });
                  } catch {}
                  closeMenu();
                }}
              >
                <Text style={{ color: '#03C75A', fontWeight: '800', fontSize: 15 }}>{t('나에게', 'To me', '自分へ', '发给我')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
              onPress={() => {
                Alert.alert(t('공지', 'Notice', 'お知らせ', '公告'), t('준비 중입니다.', 'Coming soon.', '準備中です。', '即将推出。'));
                closeMenu();
              }}
            >
              <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('공지', 'Notice', 'お知らせ', '公告')}</Text>
            </TouchableOpacity>
            {(msg.type === 'image' || msg.type === 'video' || msg.type === 'file' || msg.type === 'audio' || msg.type === 'url' || msg.type === 'location' || msg.type === 'qr') ? (
              <TouchableOpacity
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
                onPress={() => {
                  try {
                    onOpenMedia?.(msg);
                  } catch {}
                  closeMenu();
                }}
              >
                <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('열기', 'Open', '開く', '打开')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
              onPress={() => {
                try {
                  onArchive?.(msg);
                } catch {}
                closeMenu();
              }}
            >
              <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('보관', 'Archive', '保管', '保存')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
              onPress={async () => {
                try {
                  if (menuText) await Clipboard.setStringAsync(menuText);
                } catch {}
                closeMenu();
              }}
            >
              <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('복사', 'Copy', 'コピー', '复制')}</Text>
            </TouchableOpacity>
            {canOpenLink ? (
              <TouchableOpacity
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
                onPress={async () => {
                  const u = firstOpenableUrl || menuText;
                  if (u && isYooyDeepLinkCandidate(u)) {
                    const ok = await openInternalAppLink(u);
                    if (ok) {
                      closeMenu();
                      return;
                    }
                  }
                  if (u) Linking.openURL(u).catch(() => {});
                  closeMenu();
                }}
              >
                <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('링크 열기', 'Open link', 'リンクを開く', '打开链接')}</Text>
              </TouchableOpacity>
            ) : null}
            {isRoomModerator ? (
              <TouchableOpacity
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
                onPress={() => {
                  try {
                    onHideMessage?.(msg);
                  } catch {}
                  closeMenu();
                }}
              >
                <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('가리기', 'Hide', '非表示', '隐藏')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' }}
              onPress={() => {
                try {
                  onDeleteMine?.(msg);
                } catch {}
                closeMenu();
              }}
            >
              <Text style={{ color: '#111', fontWeight: '600', fontSize: 16 }}>{t('나에게만 삭제', 'Delete for me', '自分だけ削除', '为自己删除')}</Text>
            </TouchableOpacity>
            {isMe || isRoomModerator ? (
              <TouchableOpacity
                activeOpacity={0.75}
                style={{ paddingVertical: 14, paddingHorizontal: 18, paddingBottom: 6 }}
                onPress={() => {
                  try {
                    onDeleteForEveryone?.(msg);
                  } catch {}
                  closeMenu();
                }}
              >
                <Text style={{ color: '#C62828', fontWeight: '800', fontSize: 16 }}>{t('모두에게 삭제', 'Delete for everyone', '全員に削除', '为所有人删除')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ height: 20 }} />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={emojiPickerOpen} transparent animationType="fade" onRequestClose={() => setEmojiPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEmojiPickerOpen(false)} />
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 18,
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: 300,
            }}
          >
            {REACTION_EMOJIS.map((em) => (
              <TouchableOpacity key={em} onPress={() => applyEmoji(em)} style={{ padding: 10 }}>
                <Text style={{ fontSize: 34 }}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );

  if (isMe) {
    return (
      <>
        <View style={{ width: '100%', marginVertical: 4, alignItems: 'flex-end' }}>
          <View
            style={{
              maxWidth: meBubbleMax,
              alignSelf: 'flex-end',
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              gap: 6,
            }}
          >
            {quickBubbleBtn}
            <View style={{ flexShrink: 1, maxWidth: meBubbleMax - 40, alignItems: 'flex-end' }}>
              <TouchableOpacity
                activeOpacity={1}
                onLongPress={openMenu}
                delayLongPress={260}
                style={{ alignSelf: 'flex-end', maxWidth: meBubbleMax - 40 }}
              >
                {renderReplyPreview()}
                {renderContent()}
              </TouchableOpacity>
              <MessageMetaRow time={timeStr} readReceipt={readReceiptDm} unreadCount={unreadRecipientCount} alignRight />
              {renderReactionChips()}
              {roomType === 'ttl' && typeof ttlMessageExpireSeconds === 'number' && ttlMessageExpireSeconds > 0 ? (
                <TtlMsgCountdownRow msg={msg} ttlSec={ttlMessageExpireSeconds} alignRight />
              ) : null}
            </View>
          </View>
        </View>
        {renderKakaoMenuModals()}
      </>
    );
  }

  return (
    <>
    <View style={{ width: '100%', marginVertical: 4, flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ width: LEFT_COL_W, alignItems: 'center' }}>
        {showSenderMeta ? (
          profileTapDisabled ? (
            <View
              accessibilityLabel={t('익명', 'Anonymous', '匿名', '匿名')}
              style={{ width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}
            >
              {senderAvatarUrl ? (
                <EImage source={{ uri: senderAvatarUrl }} style={{ width: AVATAR_SZ, height: AVATAR_SZ }} contentFit="cover" />
              ) : (
                <Text style={{ color: '#D4AF37', fontWeight: '900' }}>{String(senderName || senderId || '?').charAt(0)}</Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openProfile}
              accessibilityRole="button"
              accessibilityLabel={t('프로필 보기', 'View profile', 'プロフィールを見る', '查看资料')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={{ width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}
            >
              {senderAvatarUrl ? (
                <EImage source={{ uri: senderAvatarUrl }} style={{ width: AVATAR_SZ, height: AVATAR_SZ }} contentFit="cover" />
              ) : (
                <Text style={{ color: '#D4AF37', fontWeight: '900' }}>{String(senderName || senderId || '?').charAt(0)}</Text>
              )}
            </TouchableOpacity>
          )
        ) : profileTapDisabled ? (
          <View style={{ width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2 }} />
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={openProfile}
            accessibilityRole="button"
            accessibilityLabel={t('프로필 보기', 'View profile', 'プロフィールを見る', '查看资料')}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={{ width: AVATAR_SZ, height: AVATAR_SZ, borderRadius: AVATAR_SZ / 2 }}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingLeft: CONTENT_GAP, alignItems: 'flex-start' }}>
        {showSenderMeta ? (
          profileTapDisabled ? (
            <View style={{ alignSelf: 'flex-start', marginBottom: 4, maxWidth: peerBubbleMax }}>
              <Text style={{ color: '#AFAFAF', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                {senderName || senderId}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openProfile}
              accessibilityRole="button"
              accessibilityLabel={`${senderName || senderId} ${t('프로필', 'profile', 'プロフィール', '资料')}`}
              style={{ alignSelf: 'flex-start', marginBottom: 4, maxWidth: peerBubbleMax }}
            >
              <Text style={{ color: '#AFAFAF', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                {senderName || senderId}
              </Text>
            </TouchableOpacity>
          )
        ) : null}
        <View
          style={{
            maxWidth: peerBubbleMax,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 6,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: peerBubbleMax - 40, alignItems: 'flex-start' }}>
            <TouchableOpacity
              activeOpacity={1}
              onLongPress={openMenu}
              delayLongPress={260}
              style={{ alignSelf: 'flex-start', maxWidth: peerBubbleMax - 40 }}
            >
              {renderReplyPreview()}
              {renderContent()}
            </TouchableOpacity>
            <MessageMetaRow time={timeStr} readReceipt={null} unreadCount={null} alignRight={false} />
            {renderReactionChips()}
            {roomType === 'ttl' && typeof ttlMessageExpireSeconds === 'number' && ttlMessageExpireSeconds > 0 ? (
              <TtlMsgCountdownRow msg={msg} ttlSec={ttlMessageExpireSeconds} alignRight={false} />
            ) : null}
          </View>
          {quickBubbleBtn}
        </View>
      </View>
    </View>
    {renderKakaoMenuModals()}
    </>
  );
});

