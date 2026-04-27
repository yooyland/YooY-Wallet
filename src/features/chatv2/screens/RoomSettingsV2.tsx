import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
  Share,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Switch,
} from 'react-native';
import { playNotificationSound, getVolumeFromLevel } from '@/lib/notificationSound';
import type { NotificationSoundType } from '@/lib/notificationSound';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { Firestore } from 'firebase/firestore';
import { collection, deleteField, doc, getDoc, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import type { ChatRoomV2, RoomPermissionsV2 } from '../core/roomSchema';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';
import {
  leaveRoomV2,
  resetRoomForMeV2,
  exportRoomMessagesV2,
  uploadRoomCoverPhotoV2,
  uploadUserRoomWallpaperV2,
  normalizeRoomTags,
  kickMemberFromRoomV2,
  setRoomMemberAdminV2,
  regenerateRoomInviteV2,
  inviteUserToRoomByUidV2,
  healRoomParticipantIdsIfEmptyV2,
  ensureMyRoomMemberDocV2,
  ensureRoomAdminIdsForCreatorV2,
} from '../services/roomService';
import { loadRoomMemberSettingsV2, saveRoomMemberSettingsV2, type RoomMemberSettingsV2 } from '../services/settingsService';
import { getRoomDocRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import { firebaseStorage } from '@/lib/firebase';
import * as ImagePicker from 'expo-image-picker';
import { getTtlRemainingSecondsV2, getTtlStatusV2 } from '../core/ttlEngine';
import {
  buildInviteExternalSharePayloadV2,
  buildInviteQrPayloadV2,
  generateInviteTokenV2,
  sanitizeOwnerJoinCodeV2,
  type InviteShareLangV2,
} from '../services/roomInviteService';
import { isRoomOwnerV2, resolveRoomOwnerUidV2 } from '../core/roomPermissions';
import { QrSavePopupCard } from '@/components/QrSavePopupCard';
import { useScreenshotCloseModal } from '@/lib/useScreenshotCloseModal';
import { logYyRoom } from '../core/roomLog';
import { usePreferences } from '@/contexts/PreferencesContext';
import * as Crypto from 'expo-crypto';
import { callInternalYoyLedgerV1 } from '@/lib/internalYoyLedger';

const TTL_MAX_EXTEND_MS_FROM_NOW = 30 * 86400 * 1000;
const TTL_EXTEND_COST_YOY = 10;

type TabKey = 'basic' | 'members' | 'notification' | 'theme' | 'permissions' | 'ttl' | 'manage';

const NOTIFICATION_SOUND_OPTIONS: { value: NotificationSoundType; label: string }[] = [
  { value: 'gold', label: 'Gold' },
  { value: 'simple', label: 'Simple' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'dm_message', label: 'DM' },
  { value: 'coin_reward', label: 'Coin' },
  { value: 'mention', label: 'Mention' },
  { value: 'system_notice', label: 'Notice' },
  { value: 'warning', label: 'Warning' },
  { value: 'system_default', label: 'System' },
  { value: 'silent', label: 'Silent' },
];

const VOLUME_OPTIONS: { value: 'low' | 'medium' | 'high' | 'max'; label: string }[] = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'max', label: '최대' },
];

export default function RoomSettingsV2(props: {
  visible: boolean;
  onClose: () => void;
  firestore: Firestore;
  room: ChatRoomV2;
  uid: string;
}) {
  const { visible, onClose, firestore, room, uid } = props;
  const { language } = usePreferences();
  const tr = useMemo(
    () =>
      (ko: string, en: string, ja?: string, zh?: string) => {
        if (language === 'ko') return ko;
        if (language === 'ja') return ja || en;
        if (language === 'zh') return zh || en;
        return en;
      },
    [language]
  );
  const [tab, setTab] = useState<TabKey>('basic');
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [memberSettings, setMemberSettings] = useState<RoomMemberSettingsV2>({});
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [descDraft, setDescDraft] = useState<string>('');
  const [avatarDraft, setAvatarDraft] = useState<string>('');
  const [ttlEnabled, setTtlEnabled] = useState<boolean>(true);
  const [ttlDays, setTtlDays] = useState<string>('0');
  const [ttlHours, setTtlHours] = useState<string>('24');
  const [ttlMinutes, setTtlMinutes] = useState<string>('0');
  const [ttlSeconds, setTtlSeconds] = useState<string>('0');
  const [ttlMsgH, setTtlMsgH] = useState<string>('0');
  const [ttlMsgM, setTtlMsgM] = useState<string>('0');
  const [ttlMsgS, setTtlMsgS] = useState<string>('0');
  const [allowImageUpload, setAllowImageUpload] = useState<boolean>(true);
  const [allowImageDownload, setAllowImageDownload] = useState<boolean>(true);
  const [allowCapture, setAllowCapture] = useState<boolean>(true);
  const [allowExternalShare, setAllowExternalShare] = useState<boolean>(true);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  /** TTL 탭: 방 폭파 시각·보안만 수정 잠금 (메시지 삭제 시간과 분리) */
  const [ttlEditUnlocked, setTtlEditUnlocked] = useState(false);
  /** 방 폭파 시각(일·시·분·초) 변경 — 보안 스위치와 별도 */
  const [ttlRoomDirty, setTtlRoomDirty] = useState(false);
  /** 메시지 삭제 시간만 변경 (폭파·보안과 무관) */
  const [ttlMessageDirty, setTtlMessageDirty] = useState(false);
  /** TTL 보안 스위치만 변경 (폭파 시각·메시지 TTL과 별도) */
  const [ttlSecurityDirty, setTtlSecurityDirty] = useState(false);
  const [tagsText, setTagsText] = useState('');
  const [maxParticipantsStr, setMaxParticipantsStr] = useState('100');
  const [permDraft, setPermDraft] = useState<RoomPermissionsV2>({});
  const [noticeOnlyDraft, setNoticeOnlyDraft] = useState(true);
  const [joinMsgEnabledDraft, setJoinMsgEnabledDraft] = useState(false);
  const [joinMsgTemplateDraft, setJoinMsgTemplateDraft] = useState<string>('{name} 님이 입장했습니다.');
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteQrModalCaptureRef = useRef<View | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteSnap, setInviteSnap] = useState<{ inviteCode?: string; inviteToken?: string; inviteQrValue?: string } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchVisibleDraft, setSearchVisibleDraft] = useState(true);
  /** 방장: 비밀 모드(참여 코드·초대 링크로만 신규 입장) — type=secret 이거나 isSecret */
  const [secretJoinDraft, setSecretJoinDraft] = useState(false);
  /** 방장 설정 참여 코드(A–Z/0–9, 저장 시 검증) */
  const [secretJoinCodeDraft, setSecretJoinCodeDraft] = useState('');
  const [memberInviteModalOpen, setMemberInviteModalOpen] = useState(false);
  const [memberInviteIdDraft, setMemberInviteIdDraft] = useState('');
  const [inviteFriendRows, setInviteFriendRows] = useState<Array<{ friendId: string; name: string }>>([]);
  const [memberInviteBusy, setMemberInviteBusy] = useState(false);
  /** heal 후 rooms.participantIds 스냅샷 — 멤버 탭·joinedRooms 배치에 사용 */
  const [participantIdsUi, setParticipantIdsUi] = useState<string[]>([]);

  useScreenshotCloseModal(
    inviteOpen && !!inviteSnap?.inviteQrValue,
    () => setInviteOpen(false),
    language
  );

  const ownerUid = useMemo(() => resolveRoomOwnerUidV2(room), [room]);
  const isOwner = useMemo(() => isRoomOwnerV2(room, uid), [room, uid]);
  const isAdmin = useMemo(() => {
    if (isOwner) return true;
    if (Array.isArray(room.adminIds) && room.adminIds.map((x) => String(x)).includes(uid)) return true;
    return false;
  }, [isOwner, room.adminIds, uid]);
  const effectiveParticipantIds = useMemo(() => {
    if (participantIdsUi.length) return participantIdsUi;
    const ids = Array.isArray(room.participantIds) ? room.participantIds.map((x) => String(x)).filter(Boolean) : [];
    if (ids.length) return ids;
    return ownerUid ? [ownerUid] : [];
  }, [participantIdsUi, room.participantIds, ownerUid]);
  const sortedParticipantIds = useMemo(() => {
    const arr = [...effectiveParticipantIds];
    arr.sort((a, b) => {
      if (a === uid && b !== uid) return -1;
      if (b === uid && a !== uid) return 1;
      const na = names[a] || a;
      const nb = names[b] || b;
      return na.localeCompare(nb, 'ko');
    });
    return arr;
  }, [effectiveParticipantIds, uid, names]);

  const isRoomParticipantUi = useMemo(
    () => effectiveParticipantIds.map((x) => String(x)).includes(String(uid)),
    [effectiveParticipantIds, uid]
  );

  const isDmParticipantEditor = useMemo(() => {
    if (String(room.type) !== 'dm') return false;
    return effectiveParticipantIds.map((x) => String(x)).includes(uid);
  }, [room.type, uid, effectiveParticipantIds]);
  /** 방장 전용: 공개 방 이미지·방 이름·방 설명 (부방장은 수정 불가). DM은 참가자 간 표시명 등 편집 허용. */
  const canEditRoomIdentity = useMemo(() => {
    if (String(room.type) === 'dm') return isDmParticipantEditor;
    return isOwner;
  }, [room.type, isDmParticipantEditor, isOwner]);
  /**
   * 권한 정책·태그·검색 노출·인원 상한 등 (TTL 폭파/메시지TTL/보안 제외)
   * - 그룹/공지/시크릿: 방장·부방장
   * - TTL: 참가자 전원 (알림·테마와 같이 일반 설정에 가깝게)
   * - DM: 참가자
   */
  const canEditRoom = useMemo(() => {
    if (String(room.type) === 'dm') return isDmParticipantEditor;
    if (String(room.type) === 'ttl') return isRoomParticipantUi;
    return isAdmin;
  }, [room.type, isDmParticipantEditor, isAdmin, isRoomParticipantUi]);
  /** TTL 전용(방 폭파 시각·연장·메시지 삭제 TTL·보안 스위치): 방장만. 부방장은 일반 방 메타만 편집 가능 */
  const canEditTtl = useMemo(() => isOwner && String(room.type) === 'ttl', [isOwner, room.type]);
  /** 초대장·QR: DM 제외 전 방 공통. 관리자 또는 멤버초대 허용 시 일반 멤버 */
  const canInvite = useMemo(() => {
    if (String(room.type) === 'dm') return false;
    const memberCanInvitePerm = (room as any)?.permissions?.memberCanInvite === true;
    const ids = effectiveParticipantIds.map((x) => String(x));
    return isAdmin || (memberCanInvitePerm && ids.includes(uid));
  }, [room.type, room, isAdmin, effectiveParticipantIds, uid]);

  /** 저장된 방 기준: 비밀·시크릿 방만 초대 QR/링크 사용 */
  const secretLikeRoom = useMemo(
    () => !!(room as any)?.isSecret || String(room.type) === 'secret',
    [room]
  );

  /** 권한 탭: 멤버 초대(또는 관리자)일 때 UID/친구 초대 UI */
  const canShowDirectMemberInvite = useMemo(() => {
    if (String(room.type) === 'dm') return false;
    if (isAdmin) return true;
    return permDraft.memberCanInvite !== false && effectiveParticipantIds.map((x) => String(x)).includes(String(uid));
  }, [room.type, isAdmin, permDraft.memberCanInvite, effectiveParticipantIds, uid]);

  useEffect(() => {
    if (!memberInviteModalOpen || !uid) {
      setInviteFriendRows([]);
      return;
    }
    const ref = query(collection(firestore, 'users', uid, 'friends'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const x = d.data() as any;
            const friendId = String(x.userId || x.uid || d.id || '').trim();
            const name = String(x.chatName || x.displayName || x.name || friendId).trim();
            return { friendId, name };
          })
          .filter((r) => !!r.friendId);
        setInviteFriendRows(rows);
      },
      () => setInviteFriendRows([])
    );
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [memberInviteModalOpen, uid, firestore]);

  const runInviteByUid = useCallback(
    async (targetUidRaw: string) => {
      const tid = String(targetUidRaw || '').trim();
      if (!tid) {
        Alert.alert(tr('알림', 'Notice', '通知', '提示'), tr('UID를 입력해 주세요.', 'Enter a UID.', 'UIDを入力してください。', '请输入 UID。'));
        return;
      }
      setMemberInviteBusy(true);
      try {
        await inviteUserToRoomByUidV2({ firestore, roomId: room.id, actorUid: uid, targetUid: tid });
        const rs = await getDoc(getRoomDocRef(firestore, room.id));
        const p = rs.exists() ? ((rs.data() as any)?.participantIds as string[]) : [];
        if (Array.isArray(p) && p.length) setParticipantIdsUi(p.map((x) => String(x)).filter(Boolean));
        Alert.alert(tr('완료', 'Done', '完了', '完成'), tr('멤버를 초대했습니다.', 'Member invited.', 'メンバーを招待しました。', '已邀请成员。'));
        setMemberInviteIdDraft('');
        setMemberInviteModalOpen(false);
      } catch (e: any) {
        const m = String(e?.message || e || '');
        let msg = m;
        if (m.includes('already_member')) msg = tr('이미 멤버입니다.', 'Already a member.', 'すでにメンバーです。', '已是成员。');
        if (m.includes('room_full')) msg = tr('인원 상한에 도달했습니다.', 'Room is full.', '定員に達しました。', '已达人数上限。');
        if (m.includes('not_allowed')) msg = tr('초대 권한이 없습니다.', 'No permission to invite.', '招待する権限がありません。', '无邀请权限。');
        if (m.includes('ttl_room_exploded')) msg = tr('TTL 방이 만료되었습니다.', 'TTL room expired.', 'TTLルームは期限切れです。', 'TTL 房间已过期。');
        Alert.alert(tr('초대 실패', 'Invite failed', '招待失敗', '邀请失败'), msg);
      } finally {
        setMemberInviteBusy(false);
      }
    },
    [firestore, room.id, uid, tr]
  );

  useEffect(() => {
    setParticipantIdsUi([]);
  }, [room.id]);

  useEffect(() => {
    if (!visible) return;
    setTab('basic');
    setTtlEditUnlocked(false);
    setTtlRoomDirty(false);
    setTtlMessageDirty(false);
    setTtlSecurityDirty(false);
    setTitleDraft(String(room.title || ''));
    setDescDraft(String((room as any)?.description || ''));
    const av = String((room as any)?.photoURL || (room as any)?.avatarUrl || '').trim();
    setAvatarDraft(av);
    try {
      const tgs = Array.isArray((room as any)?.tags) ? (room as any).tags.map((x: any) => String(x)).filter(Boolean) : [];
      setTagsText(tgs.join(', '));
    } catch {
      setTagsText('');
    }
    const mp = typeof (room as any)?.maxParticipants === 'number' ? Number((room as any).maxParticipants) : 100;
    setMaxParticipantsStr(String(Math.max(2, Math.min(500, mp))));
    setPermDraft({
      memberCanMessage: (room as any)?.permissions?.memberCanMessage,
      memberCanUploadFile: (room as any)?.permissions?.memberCanUploadFile,
      memberCanUploadImage: (room as any)?.permissions?.memberCanUploadImage,
      memberCanShareLink: (room as any)?.permissions?.memberCanShareLink,
      memberCanInvite: (room as any)?.permissions?.memberCanInvite,
      whoCanEditRoomInfo: (room as any)?.permissions?.whoCanEditRoomInfo || 'admin',
    });
    setNoticeOnlyDraft(!!(room as any)?.settings?.noticeOnlyAdminWrite);
    try {
      const jm = (room as any)?.settings?.joinMessage;
      setJoinMsgEnabledDraft(!!(jm?.enabled));
      if (typeof jm?.template === 'string' && String(jm.template).trim()) setJoinMsgTemplateDraft(String(jm.template));
      else setJoinMsgTemplateDraft('{name} 님이 입장했습니다.');
    } catch {
      setJoinMsgEnabledDraft(false);
      setJoinMsgTemplateDraft('{name} 님이 입장했습니다.');
    }
    setSearchVisibleDraft((room as any)?.searchVisible !== false);
    setSecretJoinDraft(!!(room as any)?.isSecret);
    setSecretJoinCodeDraft(
      !!(room as any)?.isSecret && (room as any)?.inviteCode ? String((room as any).inviteCode) : ''
    );
    // TTL drafts
    try {
      const ttl = (room as any)?.ttl || null;
      const enabled = ttl?.enabled !== false;
      setTtlEnabled(!!enabled);
      const explodeAt = typeof ttl?.explodeRoomAt === 'number' ? Number(ttl.explodeRoomAt) : 0;
      const now = Date.now();
      const remain = Math.max(0, explodeAt > now ? Math.floor((explodeAt - now) / 1000) : 0);
      const d = Math.floor(remain / 86400);
      const h = Math.floor((remain % 86400) / 3600);
      const m = Math.floor((remain % 3600) / 60);
      const s = remain % 60;
      setTtlDays(String(d));
      setTtlHours(String(h));
      setTtlMinutes(String(m));
      setTtlSeconds(String(s));
      const sec = typeof ttl?.messageExpireSeconds === 'number' ? Math.max(0, Math.floor(Number(ttl.messageExpireSeconds))) : 0;
      setTtlMsgH(String(Math.floor(sec / 3600)));
      setTtlMsgM(String(Math.floor((sec % 3600) / 60)));
      setTtlMsgS(String(sec % 60));
      const secCfg = ((room as any)?.security || {}) as any;
      const isTtl = String(room.type) === 'ttl';
      // TTL 기본값(명시값 없을 때만): 업로드 허용 / 다운로드 차단 / 캡처 차단 / 외부공유 차단
      setAllowImageUpload(typeof secCfg.allowImageUpload === 'boolean' ? secCfg.allowImageUpload : true);
      setAllowImageDownload(typeof secCfg.allowImageDownload === 'boolean' ? secCfg.allowImageDownload : (isTtl ? false : true));
      setAllowCapture(typeof secCfg.allowCapture === 'boolean' ? secCfg.allowCapture : (isTtl ? false : true));
      setAllowExternalShare(typeof secCfg.allowExternalShare === 'boolean' ? secCfg.allowExternalShare : (isTtl ? false : true));
      setRemainingSec(getTtlRemainingSecondsV2(room as any, Date.now()));
    } catch {}
  }, [visible, room.id]);

  useEffect(() => {
    if (!visible || String(room.type) !== 'ttl') return;
    const t = setInterval(() => {
      const remain = getTtlRemainingSecondsV2(room as any, Date.now());
      setRemainingSec(remain);
    }, 1000);
    return () => clearInterval(t);
  }, [visible, room]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      try {
        const s = await loadRoomMemberSettingsV2({ firestore, roomId: room.id, uid });
        if (!alive) return;
        setMemberSettings(s || {});
      } catch {}
    })();
    return () => { alive = false; };
  }, [visible, firestore, room.id, uid]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      try {
        await healRoomParticipantIdsIfEmptyV2({ firestore, roomId: room.id });
        await ensureRoomAdminIdsForCreatorV2({ firestore, roomId: room.id, uid });
        await ensureMyRoomMemberDocV2({ firestore, roomId: room.id, uid });
        const snap = await getDoc(getRoomDocRef(firestore, room.id));
        if (!alive || !snap.exists()) return;
        const d = snap.data() as any;
        const ids = Array.isArray(d?.participantIds) ? d.participantIds.map((x: any) => String(x)).filter(Boolean) : [];
        const cb = String(d?.createdBy || '').trim();
        setParticipantIdsUi(ids.length ? ids : cb ? [cb] : []);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [visible, firestore, room.id, uid]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      try {
        const ids = effectiveParticipantIds;
        const next: Record<string, string> = {};
        const nextPhotos: Record<string, string> = {};
        await Promise.all(
          ids.map(async (id) => {
            try {
              const s = await getDoc(doc(firestore, 'users', id));
              const d = s.exists() ? (s.data() as any) : {};
              const n = resolveChatDisplayNameFromUserDoc(id, d as Record<string, unknown>).trim();
              const p = String(d?.photoURL || d?.avatar || d?.profileImageUrl || '').trim();
              next[id] = n || id;
              nextPhotos[id] = p;
            } catch {
              next[id] = id;
              nextPhotos[id] = '';
            }
          })
        );
        if (!alive) return;
        setNames(next);
        setPhotos(nextPhotos);
      } catch {}
    })();
    return () => { alive = false; };
  }, [visible, firestore, effectiveParticipantIds.join('|')]);

  useEffect(() => {
    if (!visible) return;
    const sh = Keyboard.addListener('keyboardDidShow', (e: any) => {
      try {
        setKeyboardHeight(Number(e?.endCoordinates?.height || 0));
      } catch {
        setKeyboardHeight(0);
      }
    });
    const hd = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      try {
        sh.remove();
      } catch {}
      try {
        hd.remove();
      } catch {}
    };
  }, [visible]);

  /** 초대 QR 모달: 비밀(isSecret)·시크릿 방에서만 사용. 값 없으면 권한 있을 때 자동 생성 */
  useEffect(() => {
    if (!inviteOpen || String(room.type) === 'dm') return;
    setInviteError(null);
    if (!secretLikeRoom) {
      setInviteSnap(null);
      setInviteBusy(false);
      setInviteError(
        tr(
          '참여 코드 필수(비밀)를 켜고 저장하면 초대 QR·코드를 사용할 수 있습니다.',
          'Turn on “Join code required (secret)” and save to use invite QR/code.',
          '「参加コード必須（秘密）」をオンにして保存すると、招待QR/コードが使えます。',
          '请开启「需参与码（私密）」并保存后再使用邀请二维码与代码。'
        )
      );
      return;
    }
    const ic = (room as any)?.inviteCode;
    const it = (room as any)?.inviteToken;
    let iqv = (room as any)?.inviteQrValue;
    // DB에 예전 yooyland:// QR이 남아 있으면 UI·스캔용으로만 https 링크로 교체 표시
    if (ic && it && iqv && /^yooyland:\/\//i.test(String(iqv))) {
      iqv = buildInviteQrPayloadV2({ roomId: String(room.id), inviteToken: String(it), inviteCode: String(ic) });
    }
    setInviteSnap({ inviteCode: ic, inviteToken: it, inviteQrValue: iqv });
    if ((room as any)?.inviteQrValue || (ic && it && iqv)) return;
    if (!canInvite) {
      setInviteError(tr('초대 권한이 없습니다.', 'No permission to invite.', '招待する権限がありません。', '无邀请权限。'));
      return;
    }
    let cancelled = false;
    (async () => {
      setInviteBusy(true);
      try {
        const r = await regenerateRoomInviteV2({ firestore, roomId: room.id, uid });
        if (!cancelled) {
          setInviteSnap({ inviteCode: r.inviteCode, inviteToken: r.inviteToken, inviteQrValue: r.inviteQrValue });
          setInviteError(null);
        }
      } catch (e: any) {
        const code = String(e?.message || e || '');
        let msg = tr('초대 정보를 만들 수 없습니다.', 'Could not create invite.', '招待情報を作成できません。', '无法创建邀请。');
        if (code.includes('not_admin')) msg = tr('초대 권한이 없습니다.', 'No permission to invite.', '招待する権限がありません。', '无邀请权限。');
        if (code.includes('room_not_found')) msg = tr('방을 찾을 수 없습니다.', 'Room not found.', 'ルームが見つかりません。', '找不到房间。');
        if (code.includes('dm_no_invite')) msg = tr('DM 방은 초대장을 사용할 수 없습니다.', 'DM rooms cannot use invites.', 'DMルームでは招待を使えません。', 'DM 房间不能使用邀请。');
        if (code.includes('invite_not_secret_mode'))
          msg = tr(
            '비밀 모드가 아닙니다. 기본 탭에서 참여 코드 필수(비밀)를 켜고 저장해 주세요.',
            'Secret join is off. Turn on “Join code required (secret)” on the Basic tab and save.',
            '秘密モードではありません。基本タブで「参加コード必須（秘密）」をオンにして保存してください。',
            '当前非私密模式。请在基础页开启「需参与码（私密）」并保存。'
          );
        if (!cancelled) setInviteError(msg);
        logYyRoom('room.invite.generate.fail', { roomId: room.id, error: code });
      } finally {
        if (!cancelled) setInviteBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteOpen, room.id, room.type, (room as any)?.inviteQrValue, (room as any)?.isSecret, secretLikeRoom, canInvite, firestore, uid, tr]);

  const pills: Array<{ key: TabKey; label: string }> = useMemo(() => {
    const t = String(room.type);
    const base: Array<{ key: TabKey; label: string }> = [
      { key: 'basic', label: tr('기본', 'Basic', '基本', '基础') },
      { key: 'members', label: tr('멤버', 'Members', 'メンバー', '成员') },
    ];
    if (t !== 'dm') {
      base.push({ key: 'permissions', label: t === 'notice' ? tr('권한·공지', 'Permissions·Notice', '権限・告知', '权限·公告') : tr('권한', 'Permissions', '権限', '权限') });
    }
    base.push({ key: 'notification', label: tr('알림', 'Notifications', '通知', '通知') }, { key: 'theme', label: tr('테마', 'Theme', 'テーマ', '主题') });
    if (t === 'ttl') base.push({ key: 'ttl', label: 'TTL' });
    base.push({ key: 'manage', label: tr('관리', 'Manage', '管理', '管理') });
    return base;
  }, [room.type, tr]);

  const handleTestNotificationSound = useCallback(async () => {
    const n = memberSettings.notifications || {};
    const mode = (n.mode || 'sound') as 'sound' | 'vibrate' | 'mute';
    const volumeLevel = (n.notificationVolume || 'medium') as 'low' | 'medium' | 'high' | 'max';
    const soundType = (n.notificationSound || 'gold') as NotificationSoundType;
    try {
      if (mode === 'sound') {
        await playNotificationSound('sound', getVolumeFromLevel(volumeLevel), soundType, 'normal');
      } else {
        await playNotificationSound(mode);
      }
    } catch {}
  }, [memberSettings.notifications]);

  const doReset = async () => {
    setBusy(true);
    try {
      await resetRoomForMeV2({ firestore, roomId: room.id, uid });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await exportRoomMessagesV2({ firestore, roomId: room.id, limitN: 1000, roomTitle: room.title });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  /** 메시지 삭제 시간만 저장 (방 폭파 시각·연장 한도·YOY 알림과 무관) */
  const saveMessageTtlOnly = async () => {
    if (!canEditTtl || String(room.type) !== 'ttl') return;
    setBusy(true);
    logYyRoom('room.settings.save.messageTtl.start', { roomId: room.id });
    try {
      await healRoomParticipantIdsIfEmptyV2({ firestore, roomId: room.id });
      await ensureRoomAdminIdsForCreatorV2({ firestore, roomId: room.id, uid });
      await ensureMyRoomMemberDocV2({ firestore, roomId: room.id, uid });
      await saveRoomMemberSettingsV2({ firestore, roomId: room.id, uid, settings: memberSettings });

      const msgSec = Math.max(0, Number(ttlMsgH || 0) * 3600 + Number(ttlMsgM || 0) * 60 + Number(ttlMsgS || 0));
      const prevTtl = (room as any).ttl || {};
      const nextTtl = { ...prevTtl, messageExpireSeconds: msgSec || null, ttlLastModifiedBy: uid };
      const roomPatch: any = {
        updatedAt: Date.now(),
        ttl: nextTtl,
        messageTtlSeconds: msgSec || null,
      };

      let idsForJoined: string[] = [...effectiveParticipantIds];
      try {
        const freshSnap = await getDoc(getRoomDocRef(firestore, room.id));
        const fp = freshSnap.exists() ? (freshSnap.data() as any)?.participantIds : null;
        if (Array.isArray(fp) && fp.length) {
          idsForJoined = fp.map((x: any) => String(x)).filter(Boolean);
        }
      } catch {}

      const commitRoomAndJoinedMsg = async (participantList: string[]) => {
        const b = writeBatch(firestore);
        b.set(getRoomDocRef(firestore, room.id), roomPatch, { merge: true });
        participantList.forEach((pid) => {
          b.set(getUserJoinedRoomDocRef(firestore, pid, room.id), { updatedAt: Date.now(), ttl: nextTtl }, { merge: true });
        });
        await b.commit();
      };

      try {
        await commitRoomAndJoinedMsg(idsForJoined);
      } catch (commitErr: any) {
        const msg = String(commitErr?.message || commitErr || '');
        const permFail = /permission|insufficient|PERMISSION_DENIED/i.test(msg);
        if (!permFail) throw commitErr;
        await commitRoomAndJoinedMsg([uid]);
      }
      setTtlMessageDirty(false);
      logYyRoom('room.settings.save.messageTtl.success', { roomId: room.id });
    } catch (e: any) {
      logYyRoom('room.settings.save.messageTtl.fail', { roomId: room.id, error: String(e?.message || e) });
      Alert.alert(tr('저장 실패', 'Save failed', '保存失敗', '保存失败'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  /** TTL 보안(이미지·캡처·공유 등)만 저장 — 폭파 시각·메시지 삭제 TTL과 무관 */
  const saveTtlSecurityOnly = async () => {
    if (!canEditTtl || String(room.type) !== 'ttl') return;
    setBusy(true);
    logYyRoom('room.settings.save.ttlSecurity.start', { roomId: room.id });
    try {
      await healRoomParticipantIdsIfEmptyV2({ firestore, roomId: room.id });
      await ensureRoomAdminIdsForCreatorV2({ firestore, roomId: room.id, uid });
      await ensureMyRoomMemberDocV2({ firestore, roomId: room.id, uid });
      await saveRoomMemberSettingsV2({ firestore, roomId: room.id, uid, settings: memberSettings });

      const roomPatch: any = {
        updatedAt: Date.now(),
        security: {
          allowImageUpload: !!allowImageUpload,
          allowImageDownload: !!allowImageDownload,
          allowCapture: !!allowCapture,
          allowExternalShare: !!allowExternalShare,
        },
      };

      const b = writeBatch(firestore);
      b.set(getRoomDocRef(firestore, room.id), roomPatch, { merge: true });
      await b.commit();
      setTtlSecurityDirty(false);
      logYyRoom('room.settings.save.ttlSecurity.success', { roomId: room.id });
    } catch (e: any) {
      logYyRoom('room.settings.save.ttlSecurity.fail', { roomId: room.id, error: String(e?.message || e) });
      Alert.alert(tr('저장 실패', 'Save failed', '保存失敗', '保存失败'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const doSaveSettings = async (opts?: { closeAfter?: boolean }) => {
    const closeAfter = opts?.closeAfter !== false;
    setBusy(true);
    logYyRoom('room.settings.save.start', { roomId: room.id });
    let roomBatchFailed = false;
    try {
      await healRoomParticipantIdsIfEmptyV2({ firestore, roomId: room.id });
      await ensureRoomAdminIdsForCreatorV2({ firestore, roomId: room.id, uid });
      await ensureMyRoomMemberDocV2({ firestore, roomId: room.id, uid });
      await saveRoomMemberSettingsV2({ firestore, roomId: room.id, uid, settings: memberSettings });

      try {
        const nextTitle = String(titleDraft || '').trim();
        const curTitle = String(room.title || '').trim();
        const nextDesc = String(descDraft || '').trim();
        const curDesc = String((room as any)?.description || '').trim();
        const nextAvatar = String(avatarDraft || '').trim();
        const curAvatar = String((room as any)?.photoURL || (room as any)?.avatarUrl || '').trim();
        const nextTags = normalizeRoomTags(tagsText);
        const curTags = Array.isArray((room as any)?.tags) ? (room as any).tags.map((x: any) => String(x)).filter(Boolean) : [];
        const tagsSame = nextTags.length === curTags.length && nextTags.every((x, i) => x === curTags[i]);
        const maxNext = Math.max(2, Math.min(500, parseInt(String(maxParticipantsStr || '100'), 10) || 100));
        const maxCur = typeof (room as any)?.maxParticipants === 'number' ? Number((room as any).maxParticipants) : 100;
        const permStr = JSON.stringify(permDraft || {});
        const permCurStr = JSON.stringify((room as any)?.permissions || {});
        const curSearchVisible = (room as any)?.searchVisible !== false;
        const searchVisibleChanged = String(room.type) !== 'dm' && canEditRoom && searchVisibleDraft !== curSearchVisible;
        const noticeCur = !!(room as any)?.settings?.noticeOnlyAdminWrite;
        const noticeChanged = String(room.type) === 'notice' && canEditRoom && noticeOnlyDraft !== noticeCur;
        const joinMsgCurEnabled = !!((room as any)?.settings?.joinMessage?.enabled);
        const joinMsgCurTpl = String((room as any)?.settings?.joinMessage?.template || '{name} 님이 입장했습니다.');
        const joinMsgChanged =
          String(room.type) !== 'dm' &&
          canEditRoom &&
          (joinMsgEnabledDraft !== joinMsgCurEnabled || String(joinMsgTemplateDraft || '').trim() !== String(joinMsgCurTpl || '').trim());

        const identityDirty =
          canEditRoomIdentity &&
          (nextTitle !== curTitle || nextDesc !== curDesc || nextAvatar !== curAvatar);
        const policyDirty =
          canEditRoom &&
          (!tagsSame || maxNext !== maxCur || permStr !== permCurStr || searchVisibleChanged || noticeChanged || joinMsgChanged);
        const curSecret = !!(room as any)?.isSecret;
        const ownerSecretDirty =
          isOwner &&
          String(room.type) !== 'dm' &&
          (() => {
            const want = !!secretJoinDraft;
            if (want !== curSecret) return true;
            if (!want) return false;
            const curCode = String((room as any)?.inviteCode || '').trim();
            const nextCode = String(secretJoinCodeDraft || '').trim();
            return curCode !== nextCode;
          })();
        const shouldUpdateRoomMeta = identityDirty || policyDirty || ownerSecretDirty;
        const shouldWriteTtlBlock = canEditTtl && ttlRoomDirty;
        const shouldWriteMessageTtlOnly = canEditTtl && ttlMessageDirty && !ttlRoomDirty;
        const shouldMergeTtlSecurity = canEditTtl && ttlSecurityDirty;
        const shouldUpdateRoomDoc =
          shouldUpdateRoomMeta || shouldWriteTtlBlock || shouldWriteMessageTtlOnly || shouldMergeTtlSecurity;
        if (shouldUpdateRoomDoc) {
          const batch = writeBatch(firestore);
          const roomPatch: any = {
            updatedAt: Date.now(),
          };
          if (identityDirty) {
            roomPatch.title = nextTitle || curTitle || undefined;
            roomPatch.description = nextDesc || undefined;
            roomPatch.avatarUrl = nextAvatar || undefined;
            roomPatch.photoURL = nextAvatar || undefined;
          }
          if (policyDirty) {
            roomPatch.tags = nextTags.length ? nextTags : [];
            roomPatch.maxParticipants = String(room.type) === 'dm' ? 2 : maxNext;
            if (String(room.type) !== 'dm') {
              roomPatch.permissions = permDraft;
              roomPatch.searchVisible = !!searchVisibleDraft;
            }
            if (String(room.type) === 'notice') {
              roomPatch.settings = {
                ...((room as any).settings || {}),
                noticeOnlyAdminWrite: !!noticeOnlyDraft,
              };
            }
            // 입장 문구(모든 비-DM 방)
            if (String(room.type) !== 'dm') {
              roomPatch.settings = {
                ...((room as any).settings || {}),
                ...(roomPatch.settings || {}),
                joinMessage: {
                  enabled: !!joinMsgEnabledDraft,
                  template: String(joinMsgTemplateDraft || '{name} 님이 입장했습니다.'),
                },
              };
            }
          }
          if (ownerSecretDirty) {
            if (!secretJoinDraft) {
              roomPatch.isSecret = false;
              roomPatch.inviteCode = deleteField();
              roomPatch.inviteToken = deleteField();
              roomPatch.inviteQrValue = deleteField();
            } else {
              let codeOut: string;
              try {
                codeOut = sanitizeOwnerJoinCodeV2(String(secretJoinCodeDraft || '').trim());
              } catch {
                Alert.alert(
                  tr('알림', 'Notice', '通知', '提示'),
                  tr(
                    '참여 코드는 영문 대문자와 숫자만 사용할 수 있으며, 4~32자여야 합니다.',
                    'Join code must be 4–32 characters using A–Z and 0–9 only.',
                    '参加コードは英大文字と数字のみ、4〜32文字である必要があります。',
                    '参与码仅可为 A–Z 与数字，长度 4–32。'
                  )
                );
                setBusy(false);
                return;
              }
              const token = generateInviteTokenV2();
              const qr = buildInviteQrPayloadV2({ roomId: room.id, inviteToken: token, inviteCode: codeOut });
              roomPatch.isSecret = true;
              roomPatch.inviteCode = codeOut;
              roomPatch.inviteToken = token;
              roomPatch.inviteQrValue = qr;
            }
          }
          if (shouldWriteTtlBlock) {
            const roomSec = Math.max(
              0,
              Number(ttlDays || 0) * 86400 + Number(ttlHours || 0) * 3600 + Number(ttlMinutes || 0) * 60 + Number(ttlSeconds || 0)
            );
            const nowMs = Date.now();
            const curRemain = getTtlRemainingSecondsV2(room as any, nowMs);
            let explodeRoomAt = nowMs + roomSec * 1000;
            if (roomSec > curRemain) {
              if (explodeRoomAt > nowMs + TTL_MAX_EXTEND_MS_FROM_NOW) {
                Alert.alert(
                  tr('연장 한도', 'Extension limit', '延長上限', '延长上限'),
                  tr('현재 시각 기준 남은 TTL은 최대 30일까지 설정할 수 있습니다.', 'TTL can be extended up to 30 days from now.', '現在時刻基準でTTLは最大30日まで延長できます。', 'TTL 最多可从当前时间延长到 30 天。')
                );
                setBusy(false);
                return;
              }
              Alert.alert(
                tr('연장 비용', 'Extension cost', '延長コスト', '延长费用'),
                tr(`남은 시간을 늘리는 경우 ${TTL_EXTEND_COST_YOY} YOY가 내부 잔액에서 차감됩니다.`, `Extending TTL costs ${TTL_EXTEND_COST_YOY} YOY from your internal balance.`, `TTL延長には内部残高から ${TTL_EXTEND_COST_YOY} YOY が差し引かれます。`, `延长 TTL 将从内部余额扣除 ${TTL_EXTEND_COST_YOY} YOY。`)
              );
            }
            const msgSec = Math.max(0, Number(ttlMsgH || 0) * 3600 + Number(ttlMsgM || 0) * 60 + Number(ttlMsgS || 0));
            const ttlStatus = roomSec <= 0 ? 'expired' : 'active';
            roomPatch.ttl = {
              enabled: !!ttlEnabled,
              explodeRoomAt,
              messageExpireSeconds: msgSec || null,
              roomTtlSeconds: roomSec,
              ttlStatus,
              ttlLastModifiedBy: uid,
            };
            roomPatch.ttlEnabled = !!ttlEnabled;
            roomPatch.roomExpiresAt = explodeRoomAt;
            roomPatch.roomTtlSeconds = roomSec;
            roomPatch.messageTtlSeconds = msgSec || null;
            roomPatch.ttlStatus = ttlStatus;
            roomPatch.ttlLastModifiedBy = uid;
            try {
              // eslint-disable-next-line no-console
              console.log('[YY_CHAT_TTL]', JSON.stringify({
                roomId: room.id,
                roomType: room.type,
                roomTtlSeconds: roomSec,
                messageTtlSeconds: msgSec,
                roomExpiresAt: explodeRoomAt,
                ttlStatus,
                remainingSeconds: getTtlRemainingSecondsV2({ ...(room as any), ttl: roomPatch.ttl } as any, Date.now()),
                save: 'start',
              }));
            } catch {}
          } else if (shouldWriteMessageTtlOnly) {
            const msgSecOnly = Math.max(0, Number(ttlMsgH || 0) * 3600 + Number(ttlMsgM || 0) * 60 + Number(ttlMsgS || 0));
            const prevTtl = (room as any).ttl || {};
            roomPatch.ttl = {
              ...prevTtl,
              messageExpireSeconds: msgSecOnly || null,
              ttlLastModifiedBy: uid,
            };
            roomPatch.messageTtlSeconds = msgSecOnly || null;
          }
          if (shouldMergeTtlSecurity) {
            roomPatch.security = {
              allowImageUpload: !!allowImageUpload,
              allowImageDownload: !!allowImageDownload,
              allowCapture: !!allowCapture,
              allowExternalShare: !!allowExternalShare,
            };
          }
          let idsForJoined: string[] = [...effectiveParticipantIds];
          try {
            const freshSnap = await getDoc(getRoomDocRef(firestore, room.id));
            const fp = freshSnap.exists() ? (freshSnap.data() as any)?.participantIds : null;
            if (Array.isArray(fp) && fp.length) {
              idsForJoined = fp.map((x: any) => String(x)).filter(Boolean);
            }
          } catch {}

          const commitRoomAndJoined = async (participantList: string[]) => {
            const b = writeBatch(firestore);
            b.set(getRoomDocRef(firestore, room.id), roomPatch, { merge: true });
            participantList.forEach((pid) => {
              const joinedPatch: any = { updatedAt: Date.now() };
              if (identityDirty) {
                joinedPatch.title = nextTitle || curTitle || undefined;
                joinedPatch.description = nextDesc || undefined;
                joinedPatch.avatarUrl = nextAvatar || undefined;
              }
              if (shouldWriteTtlBlock || shouldWriteMessageTtlOnly) {
                joinedPatch.ttl = roomPatch.ttl;
              }
              b.set(getUserJoinedRoomDocRef(firestore, pid, room.id), joinedPatch, { merge: true });
            });
            await b.commit();
          };

          try {
            await commitRoomAndJoined(idsForJoined);
          } catch (commitErr: any) {
            const msg = String(commitErr?.message || commitErr || '');
            const permFail = /permission|insufficient|PERMISSION_DENIED/i.test(msg);
            if (!permFail) throw commitErr;
            await commitRoomAndJoined([uid]);
          }
          logYyRoom('room.settings.save.success', { roomId: room.id, roomType: room.type });
          if (shouldWriteTtlBlock) {
            try {
              // eslint-disable-next-line no-console
              console.log('[YY_CHAT_TTL]', JSON.stringify({
                roomId: room.id,
                roomType: room.type,
                ttlStatus: String((roomPatch as any)?.ttlStatus || ''),
                roomExpiresAt: Number((roomPatch as any)?.roomExpiresAt || 0),
                save: 'success',
              }));
            } catch {}
            setTtlRoomDirty(false);
            setTtlMessageDirty(false);
            setTtlEditUnlocked(false);
          } else if (shouldWriteMessageTtlOnly) {
            setTtlMessageDirty(false);
          }
          if (shouldMergeTtlSecurity) {
            setTtlSecurityDirty(false);
          }
        }
      } catch (e: any) {
        roomBatchFailed = true;
        logYyRoom('room.settings.save.fail', { roomId: room.id, error: String(e?.message || e) });
        Alert.alert(tr('저장 실패', 'Save failed', '保存失敗', '保存失败'), String(e?.message || e));
      }

      if (!roomBatchFailed && closeAfter) onClose();
    } catch (e: any) {
      logYyRoom('room.settings.save.fail', { roomId: room.id, error: String(e?.message || e) });
      Alert.alert(tr('저장 실패', 'Save failed', '保存失敗', '保存失败'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const pickAndUploadRoomAvatar = async () => {
    if (!canEditRoomIdentity) return;
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!a?.uri) return;
      const uri = String(a.uri);
      const url = await uploadRoomCoverPhotoV2({ storage: firebaseStorage, roomId: room.id, localUri: uri });
      setAvatarDraft(String(url || ''));
    } catch (e: any) {
      Alert.alert(tr('이미지 업로드 실패', 'Image upload failed', '画像アップロード失敗', '图片上传失败'), String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };


  const doLeave = async () => {
    setBusy(true);
    try {
      await leaveRoomV2({ firestore, roomId: room.id, uid });
      try {
        router.replace('/chatv2/rooms');
      } catch {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const ttlInfo = room.type === 'ttl' ? room.ttl : null;
  const ttlStatus = getTtlStatusV2(room as any, Date.now());

  const doExtendTtl = async () => {
    if (!canEditTtl) return;
    const addSec = Math.max(0, Number(ttlDays || 0) * 86400 + Number(ttlHours || 0) * 3600 + Number(ttlMinutes || 0) * 60 + Number(ttlSeconds || 0));
    if (addSec <= 0) return;
    const now = Date.now();
    const curExp = Number((room as any)?.ttl?.explodeRoomAt || (room as any)?.roomExpiresAt || now);
    const base = Math.max(now, curExp);
    let nextExp = base + addSec * 1000;
    const maxExp = now + TTL_MAX_EXTEND_MS_FROM_NOW;
    if (nextExp > maxExp) {
      nextExp = maxExp;
      Alert.alert(
        tr('연장 한도', 'Extension limit', '延長上限', '延长上限'),
        tr('현재 시각 기준 최대 30일까지 반영했습니다.', 'Applied up to 30 days from now.', '現在時刻基準で最大30日まで適用しました。', '已按当前时间最多应用到 30 天。')
      );
    }
    const opId = await Crypto.randomUUID();
    try {
      await callInternalYoyLedgerV1({
        action: 'ttl_extend_charge',
        opId,
        roomId: room.id,
        amount: TTL_EXTEND_COST_YOY,
      });
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const human = msg.includes('insufficient_user_yoy')
        ? tr(
            'YOY가 부족합니다. 출석 등으로 적립 후 다시 시도해 주세요.',
            'Not enough YOY. Earn more (e.g. daily check-in) and try again.',
            'YOYが不足しています。出席チェックインなどで貯めてから再試行してください。',
            'YOY 不足，请先通过签到等方式获取后再试。'
          )
        : msg;
      Alert.alert(tr('연장 불가', 'Cannot extend', '延長できません', '无法延长'), human);
      return;
    }
    try {
      // eslint-disable-next-line no-console
      console.log('[YY_CHAT_TTL]', JSON.stringify({ roomId: room.id, roomType: room.type, extend: 'start', roomExpiresAt: nextExp }));
    } catch {}
    try {
      const batch = writeBatch(firestore);
      batch.set(
        getRoomDocRef(firestore, room.id),
        {
          ttl: {
            ...((room as any)?.ttl || {}),
            explodeRoomAt: nextExp,
            ttlStatus: 'active',
            ttlLastExtendedAt: Date.now(),
            ttlLastModifiedBy: uid,
          },
          roomExpiresAt: nextExp,
          ttlStatus: 'active',
          ttlLastExtendedAt: Date.now(),
          ttlLastModifiedBy: uid,
        } as any,
        { merge: true }
      );
      await batch.commit();
      try {
        const { useMonitorStore } = await import('@/lib/monitorStore');
        await useMonitorStore.getState().syncMe('[ttl_extend][ledger]', { force: true });
      } catch {}
      try {
        // eslint-disable-next-line no-console
        console.log('[YY_CHAT_TTL]', JSON.stringify({ roomId: room.id, roomType: room.type, extend: 'success', roomExpiresAt: nextExp }));
      } catch {}
    } catch (e: any) {
      try {
        await callInternalYoyLedgerV1({ action: 'ttl_extend_refund', opId });
      } catch {}
      Alert.alert(
        tr('연장 실패', 'Extend failed', '延長失敗', '延长失败'),
        String(e?.message || e || tr('알 수 없는 오류', 'Unknown error', '不明なエラー', '未知错误'))
      );
    }
  };

  return (
    <>
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' }}>
        {/* 외곽 골드 굵은 테두리: 기존 채팅 팝업처럼 확실히 구분 */}
        <View style={{ marginTop: 60, width: 340, maxWidth: '94%', backgroundColor: '#0F0F0F', borderWidth: 3, borderColor: '#FFD700', borderRadius: 12, overflow: 'hidden', shadowColor: '#FFD700', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
            <Text style={{ color: '#F6F6F6', fontWeight: '900' }}>{tr('방 설정', 'Room settings', 'ルーム設定', '房间设置')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: '#CFCFCF' }}>{tr('닫기', 'Close', '閉じる', '关闭')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}>
            {pills.map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setTab(p.key)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: tab === p.key ? '#FFD700' : '#333', marginRight: 6 }}
              >
                <Text style={{ color: tab === p.key ? '#FFD700' : '#CFCFCF', fontWeight: '800', fontSize: 12 }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          >
            <ScrollView
              style={{ maxHeight: 440 }}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 14 + Math.max(0, keyboardHeight) }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
            >
            {tab === 'basic' && (
              <View>
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('방 정보', 'Room info', 'ルーム情報', '房间信息')}</Text>
                <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <Text style={{ color: '#AAA' }}>{tr('방 이미지', 'Room image', 'ルーム画像', '房间图片')}</Text>
                  <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                    {tr(
                      '모든 멤버에게 보이는 대표 이미지입니다. 나만 보는 채팅 배경은 「테마」 탭에서 설정합니다.',
                      'Visible to all members. For your own chat background only, use the Theme tab.',
                      '全メンバーに見える代表画像。自分だけの背景は「テーマ」タブから。',
                      '对所有成员可见。仅自己可见的聊天背景请在「主题」中设置。'
                    )}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
                      {avatarDraft ? (
                        <Image source={{ uri: avatarDraft }} style={{ width: 52, height: 52 }} />
                      ) : (
                        <Text style={{ color: '#D4AF37', fontWeight: '900' }}>{String(room.title || room.id || 'C').charAt(0)}</Text>
                      )}
                    </View>
                    {canEditRoomIdentity ? (
                      <TouchableOpacity
                        disabled={busy}
                        onPress={pickAndUploadRoomAvatar}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333' }}
                      >
                        <Text style={{ color: '#AAA', fontWeight: '900' }}>{tr('이미지 변경', 'Change image', '画像変更', '更换图片')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={{ color: '#777' }}>
                        {String(room.type) === 'dm'
                          ? tr('수정 권한 없음', 'No edit permission', '編集権限なし', '无编辑权限')
                          : tr('방장만 변경 가능', 'Owner only', 'オーナーのみ', '仅房主')}
                      </Text>
                    )}
                  </View>

                  <Text style={{ color: '#AAA' }}>{tr('방 이름', 'Room name', 'ルーム名', '房间名称')}</Text>
                  {canEditRoomIdentity ? (
                    <TextInput
                      value={titleDraft}
                      onChangeText={setTitleDraft}
                      placeholder={tr('방 이름을 입력하세요', 'Enter room name', 'ルーム名を入力', '输入房间名称')}
                      placeholderTextColor="#666"
                      style={{
                        marginTop: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#333',
                        backgroundColor: '#0C0C0C',
                        color: '#EEE',
                        fontWeight: '900',
                      }}
                    />
                  ) : (
                    <Text style={{ color: '#EEE', fontWeight: '900', marginTop: 8 }} numberOfLines={2}>
                      {String(room.title || room.id)}
                    </Text>
                  )}
                  {!canEditRoomIdentity ? (
                    <Text style={{ color: '#777', marginTop: 6, fontSize: 12 }}>
                      {String(room.type) === 'dm'
                        ? tr('DM 방 이름은 상대방 표시명으로 관리됩니다.', 'DM room name follows peer display name.', 'DMルーム名は相手の表示名で管理されます。', 'DM 房间名使用对方显示名。')
                        : tr('방 이름은 방장만 바꿀 수 있습니다.', 'Only the owner can change the room name.', 'ルーム名はオーナーのみ変更できます。', '仅房主可修改房间名称。')}
                    </Text>
                  ) : (
                    <Text style={{ color: '#777', marginTop: 6, fontSize: 12 }}>{tr('저장 시 방 이름이 적용됩니다.', 'Room name is applied when saved.', '保存時にルーム名が適用されます。', '保存后应用房间名称。')}</Text>
                  )}
                </View>

                <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <Text style={{ color: '#AAA' }}>{tr('방 설명', 'Room description', 'ルーム説明', '房间描述')}</Text>
                  {canEditRoomIdentity ? (
                    <TextInput
                      value={descDraft}
                      onChangeText={setDescDraft}
                      placeholder={tr('방 설명을 입력하세요', 'Enter room description', 'ルーム説明を入力', '输入房间描述')}
                      placeholderTextColor="#666"
                      multiline
                      style={{
                        marginTop: 8,
                        minHeight: 64,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#333',
                        backgroundColor: '#0C0C0C',
                        color: '#EEE',
                      }}
                    />
                  ) : (
                    <Text style={{ color: '#EEE', marginTop: 8 }} numberOfLines={4}>
                      {String((room as any)?.description || '').trim() || tr('설명 없음', 'No description', '説明なし', '无描述')}
                    </Text>
                  )}
                  {canEditRoomIdentity ? (
                    <Text style={{ color: '#777', marginTop: 6, fontSize: 12 }}>{tr('저장 시 방 설명이 적용됩니다.', 'Description is applied when saved.', '保存時に説明が適用されます。', '保存后应用描述。')}</Text>
                  ) : String(room.type) !== 'dm' ? (
                    <Text style={{ color: '#777', marginTop: 6, fontSize: 12 }}>{tr('방 설명은 방장만 바꿀 수 있습니다.', 'Only the owner can edit the description.', '説明はオーナーのみ編集できます。', '仅房主可编辑描述。')}</Text>
                  ) : null}
                </View>

                <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <Text style={{ color: '#AAA' }}>{tr('방 ID', 'Room ID', 'ルームID', '房间ID')}</Text>
                  <Text style={{ color: '#EEE', fontWeight: '800', marginTop: 6 }}>{room.id}</Text>
                  {String(room.type) !== 'dm' && secretLikeRoom && canInvite ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => setInviteOpen(true)}
                        style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: '#FFD700' }}
                      >
                        <Text style={{ color: '#FFD700', fontWeight: '900' }}>{tr('초대장', 'Invite', '招待', '邀请')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : String(room.type) !== 'dm' && !secretLikeRoom ? (
                    <Text style={{ color: '#666', fontSize: 11, marginTop: 8 }}>
                      {tr(
                        '초대 QR·코드는 참여 코드 필수(비밀)를 켠 뒤 사용할 수 있습니다.',
                        'Invite QR/code is available after “Join code required (secret)” is on.',
                        '招待QR/コードは「参加コード必須（秘密）」をオンにすると使えます。',
                        '开启「需参与码（私密）」后可使用邀请二维码与代码。'
                      )}
                    </Text>
                  ) : null}
                </View>

                <Text style={{ color: '#AAA', marginTop: 12 }}>{tr('타입', 'Type', 'タイプ', '类型')}</Text>
                <Text style={{ color: '#EEE', fontWeight: '800', marginTop: 4 }}>{String(room.type).toUpperCase()}</Text>

                {String(room.type) !== 'dm' ? (
                  <View style={{ marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                    <Text style={{ color: '#AAA' }}>태그 (쉼표·공백, 최대 10)</Text>
                    {canEditRoom ? (
                      <TextInput
                        value={tagsText}
                        onChangeText={setTagsText}
                        placeholder="예: 팀, 프로젝트"
                        placeholderTextColor="#666"
                        style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333', color: '#EEE', backgroundColor: '#0C0C0C' }}
                      />
                    ) : (
                      <Text style={{ color: '#EEE', marginTop: 8 }}>{normalizeRoomTags(tagsText).join(' · ') || '—'}</Text>
                    )}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {normalizeRoomTags(tagsText).map((t) => (
                        <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#2A2A2A' }}>
                          <Text style={{ color: '#AAA', fontSize: 12 }}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {String(room.type) !== 'dm' ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                    <Text style={{ color: '#AAA' }}>참여 인원 상한</Text>
                    {canEditRoom ? (
                      <TextInput
                        value={maxParticipantsStr}
                        onChangeText={setMaxParticipantsStr}
                        keyboardType="number-pad"
                        style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333', color: '#EEE', backgroundColor: '#0C0C0C' }}
                      />
                    ) : (
                      <Text style={{ color: '#EEE', marginTop: 8 }}>{maxParticipantsStr}</Text>
                    )}
                  </View>
                ) : null}

                {String(room.type) !== 'dm' && String(room.type) !== 'secret' ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: '#EEE', fontWeight: '800' }}>목록·검색에 노출</Text>
                      <Text style={{ color: '#777', fontSize: 11, marginTop: 4 }}>끄면 방 찾기 등에서 덜 보일 수 있습니다.</Text>
                    </View>
                    <Switch
                      value={!!searchVisibleDraft}
                      onValueChange={(v) => setSearchVisibleDraft(v)}
                      disabled={!canEditRoom}
                    />
                  </View>
                ) : null}

                {String(room.type) !== 'dm' ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: '#EEE', fontWeight: '800' }}>
                        {tr('참여 코드 필수 (비밀)', 'Join code required (secret)', '参加コード必須（秘密）', '需参与码（私密）')}
                      </Text>
                      <Text style={{ color: '#777', fontSize: 11, marginTop: 4 }}>
                        {tr(
                          '켜면 방장이 공유한 초대 QR·코드로만 새 멤버가 들어올 수 있습니다. 모든 방 유형에서 사용할 수 있습니다.',
                          'When on, new members need the invite QR/code from the owner. Works for any room type.',
                          'オンにすると、オーナーが共有した招待QR/コードでのみ入室できます。',
                          '开启后，新成员仅能通过房主的邀请码/二维码加入，适用于所有房间类型。'
                        )}
                      </Text>
                    </View>
                    <Switch
                      value={!!secretJoinDraft}
                      onValueChange={(v) => {
                        setSecretJoinDraft(v);
                        if (!v) setSecretJoinCodeDraft('');
                      }}
                      disabled={!isOwner}
                    />
                  </View>
                ) : null}

                {String(room.type) !== 'dm' && isOwner && secretJoinDraft ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2A3A2A', backgroundColor: '#0F140F' }}>
                    <Text style={{ color: '#AEE9C0', fontWeight: '800' }}>{tr('참여 코드 (저장 시 적용)', 'Join code (applied on save)', '参加コード（保存時に反映）', '参与码（保存时生效）')}</Text>
                    <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                      {tr('영문 대문자와 숫자만, 4~32자.', 'A–Z and 0–9 only, 4–32 characters.', '英大文字と数字のみ、4〜32文字。', '仅大写英文与数字，4–32 位。')}
                    </Text>
                    <TextInput
                      value={secretJoinCodeDraft}
                      onChangeText={(t) => setSecretJoinCodeDraft(String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="ABCD1234"
                      placeholderTextColor="#555"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!!isOwner}
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#333',
                        color: '#EEE',
                        backgroundColor: '#0C0C0C',
                        letterSpacing: 1,
                        fontWeight: '800',
                      }}
                    />
                  </View>
                ) : null}

                {room.type === 'ttl' && ttlInfo ? (
                  <>
                    <Text style={{ color: '#AAA', marginTop: 12 }}>TTL</Text>
                    <Text style={{ color: '#EEE', fontWeight: '800', marginTop: 4 }}>enabled={String(!!ttlInfo.enabled)}</Text>
                    <Text style={{ color: '#EEE', marginTop: 4 }}>explodeRoomAt={String(ttlInfo.explodeRoomAt ?? 'null')}</Text>
                    <Text style={{ color: '#EEE', marginTop: 4 }}>messageExpireSeconds={String(ttlInfo.messageExpireSeconds ?? 'null')}</Text>
                  </>
                ) : null}
              </View>
            )}

            {tab === 'members' && (
              <View>
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('멤버', 'Members', 'メンバー', '成员')}</Text>
                <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{String(room.type) === 'dm' ? tr('1:1 방은 참여자 2명입니다.', '1:1 room has 2 participants.', '1:1ルームは参加者2名です。', '1:1 房间有 2 位参与者。') : tr('roomMembers 기준·역할 관리', 'Role management based on roomMembers.', 'roomMembers基準のロール管理', '基于 roomMembers 的角色管理')}</Text>
                {canInvite && secretLikeRoom ? (
                  <TouchableOpacity
                    onPress={() => setInviteOpen(true)}
                    style={{ marginTop: 10, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#FFD700', fontWeight: '900' }}>{tr('초대 QR · 코드', 'Invite QR · Code', '招待QR・コード', '邀请二维码·代码')}</Text>
                  </TouchableOpacity>
                ) : canInvite && !secretLikeRoom ? (
                  <Text style={{ color: '#666', fontSize: 12, marginTop: 10 }}>
                    {tr(
                      '비밀(참여 코드) 모드가 꺼져 있으면 링크·QR 초대를 쓸 수 없습니다. 기본 탭에서 켜 주세요.',
                      'Invite link/QR needs secret join mode. Enable it on the Basic tab.',
                      'リンク/QR招待は秘密（参加コード）モードが必要です。基本タブでオンにしてください。',
                      '链接/二维码邀请需开启私密（参与码）模式，请在基础页开启。'
                    )}
                  </Text>
                ) : null}
                {sortedParticipantIds.map((id) => {
                  const isDm = String(room.type) === 'dm';
                  /** 1:1 DM 은 양쪽 모두 방장과 동일 권한(표시만 동일) */
                  const isOwnerMember = isDm || String(id) === ownerUid;
                  const isAdminM = Array.isArray(room.adminIds) && room.adminIds.map((x) => String(x)).includes(String(id));
                  const role = isOwnerMember
                    ? tr('방장', 'Owner', 'オーナー', '房主')
                    : isAdminM
                      ? tr('관리자', 'Admin', '管理者', '管理员')
                      : tr('멤버', 'Member', 'メンバー', '成员');
                  const label = names[id] || id;
                  const canManage = isOwner && !isDm && uid !== id && !isOwnerMember;
                  return (
                    <View key={id} style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={String(id) === String(uid)}
                        onPress={() => {
                          try {
                            router.push({
                              pathname: '/chatv2/friend-profile',
                              params: { id: String(id), userId: String(id) },
                            } as any);
                          } catch {}
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      >
                        <View style={{ width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
                          {photos[id] ? (
                            <Image source={{ uri: photos[id] }} style={{ width: 34, height: 34 }} />
                          ) : (
                            <Text style={{ color: '#D4AF37', fontWeight: '900' }}>{label.charAt(0)}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#EEE', fontWeight: '900' }}>{label}</Text>
                          {String(id) !== String(uid) ? (
                            <Text style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{tr('탭하여 프로필', 'Tap to open profile', 'タップしてプロフィール', '点击查看资料')}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                      <Text style={{ color: isOwnerMember || isAdminM ? '#FFD700' : '#AAA', marginTop: 4 }}>{role}</Text>
                      {canManage ? (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' as any }}>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(tr('관리자', 'Admin', '管理者', '管理员'), tr('이 멤버를 관리자로 승격할까요?', 'Promote this member to admin?', 'このメンバーを管理者に昇格しますか？', '将该成员提升为管理员吗？'), [
                                { text: tr('취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
                                {
                                  text: tr('승격', 'Promote', '昇格', '提升'),
                                  onPress: () =>
                                    setRoomMemberAdminV2({ firestore, roomId: room.id, actorUid: uid, targetUid: id, asAdmin: true }).catch((e) =>
                                      Alert.alert(tr('오류', 'Error', 'エラー', '错误'), String(e?.message || e))
                                    ),
                                },
                              ]);
                            }}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#444' }}
                          >
                            <Text style={{ color: '#EEE', fontSize: 12 }}>{tr('관리자 승격', 'Promote admin', '管理者に昇格', '提升管理员')}</Text>
                          </TouchableOpacity>
                          {!isAdminM ? null : (
                            <TouchableOpacity
                              onPress={() => {
                                Alert.alert(tr('관리자 해제', 'Remove admin', '管理者解除', '解除管理员'), tr('관리자 권한을 해제할까요?', 'Remove admin permission?', '管理者権限を解除しますか？', '要解除管理员权限吗？'), [
                                  { text: tr('취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
                                  {
                                    text: tr('해제', 'Remove', '解除', '解除'),
                                    onPress: () =>
                                      setRoomMemberAdminV2({ firestore, roomId: room.id, actorUid: uid, targetUid: id, asAdmin: false }).catch((e) =>
                                        Alert.alert(tr('오류', 'Error', 'エラー', '错误'), String(e?.message || e))
                                      ),
                                  },
                                ]);
                              }}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#444' }}
                            >
                              <Text style={{ color: '#EEE', fontSize: 12 }}>{tr('관리자 해제', 'Remove admin', '管理者解除', '解除管理员')}</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(tr('강퇴', 'Kick', '強制退室', '移出'), tr('이 멤버를 내보낼까요?', 'Kick this member?', 'このメンバーを退室させますか？', '要移出该成员吗？'), [
                                { text: tr('취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
                                {
                                  text: tr('강퇴', 'Kick', '強制退室', '移出'),
                                  style: 'destructive',
                                  onPress: () =>
                                    kickMemberFromRoomV2({ firestore, roomId: room.id, actorUid: uid, targetUid: id }).catch((e) =>
                                      Alert.alert(tr('오류', 'Error', 'エラー', '错误'), String(e?.message || e))
                                    ),
                                },
                              ]);
                            }}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#7A1F1F' }}
                          >
                            <Text style={{ color: '#FF6B6B', fontSize: 12 }}>{tr('강퇴', 'Kick', '強制退室', '移出')}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {tab === 'permissions' && String(room.type) !== 'dm' && (
              <View>
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('권한 정책', 'Permission policy', '権限ポリシー', '权限策略')}</Text>
                <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                  {String(room.type) === 'notice'
                    ? tr('공지방: 일반 멤버 글쓰기를 기본 제한할 수 있습니다.', 'Notice room: you can restrict writing to admins by default.', '告知ルーム: 一般メンバーの書き込みを制限できます。', '公告房：可默认限制普通成员发言。')
                    : String(room.type) === 'secret'
                      ? tr('비밀방: 초대 권한을 제한하세요.', 'Secret room: restrict invite permission.', '秘密ルーム: 招待権限を制限してください。', '私密房：请限制邀请权限。')
                      : String(room.type) === 'ttl'
                        ? tr('TTL 방은 보안 정책과 함께 적용됩니다.', 'TTL room applies with security policy.', 'TTLルームはセキュリティポリシーと併用されます。', 'TTL 房间将与安全策略一同生效。')
                        : tr('그룹 방 권한 정책', 'Group room permission policy', 'グループルーム権限ポリシー', '群聊权限策略')}
                </Text>
                {[
                  { k: 'memberCanMessage' as const, label: tr('일반 멤버 메시지 작성', 'Member message write', '一般メンバーのメッセージ作成', '普通成员发消息') },
                  { k: 'memberCanUploadFile' as const, label: tr('파일 업로드', 'File upload', 'ファイルアップロード', '文件上传') },
                  { k: 'memberCanUploadImage' as const, label: tr('이미지 업로드', 'Image upload', '画像アップロード', '图片上传') },
                  { k: 'memberCanShareLink' as const, label: tr('링크 공유', 'Link sharing', 'リンク共有', '链接分享') },
                  { k: 'memberCanInvite' as const, label: tr('멤버 초대', 'Invite members', 'メンバー招待', '邀请成员') },
                ].map((row) => (
                  <View key={row.k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                    <Text style={{ color: '#EEE', flex: 1 }}>{row.label}</Text>
                    <TouchableOpacity
                      disabled={!canEditRoom}
                      onPress={() => setPermDraft((p) => ({ ...p, [row.k]: !((p as any)[row.k] !== false) }))}
                      style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: (permDraft as any)[row.k] !== false ? '#1F6B63' : '#2A2A2A', justifyContent: 'center', paddingHorizontal: 4, opacity: canEditRoom ? 1 : 0.45 }}
                    >
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: (permDraft as any)[row.k] !== false ? '#00BFA5' : '#666', alignSelf: (permDraft as any)[row.k] !== false ? 'flex-end' : 'flex-start' }} />
                    </TouchableOpacity>
                  </View>
                ))}
                {canShowDirectMemberInvite ? (
                  <View style={{ marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A4A2A', backgroundColor: '#0F1A0F' }}>
                    <Text style={{ color: '#AEE9C0', fontWeight: '900' }}>{tr('멤버 직접 초대', 'Invite member directly', 'メンバー直接招待', '直接邀请成员')}</Text>
                    <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                      {tr(
                        '친구 목록 또는 사용자 UID로 이 방에 추가합니다. (권한 변경 후에는 저장이 필요할 수 있습니다.)',
                        'Add someone by friends list or user UID. (Save permission changes if needed.)',
                        '友だち一覧またはUIDで追加します。（権限変更後は保存が必要な場合があります）',
                        '通过好友列表或用户 UID 加入本房。（若刚改了权限请先保存）'
                      )}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                      <TextInput
                        value={memberInviteIdDraft}
                        onChangeText={setMemberInviteIdDraft}
                        placeholder="UID"
                        placeholderTextColor="#666"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{
                          flex: 1,
                          padding: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#333',
                          color: '#EEE',
                          backgroundColor: '#0C0C0C',
                        }}
                      />
                      <TouchableOpacity
                        disabled={memberInviteBusy}
                        onPress={() => runInviteByUid(memberInviteIdDraft)}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700', opacity: memberInviteBusy ? 0.5 : 1 }}
                      >
                        <Text style={{ color: '#FFD700', fontWeight: '900' }}>{tr('초대', 'Invite', '招待', '邀请')}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => setMemberInviteModalOpen(true)}
                      style={{ marginTop: 10, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#3A5A3A', alignItems: 'center', backgroundColor: '#0C120C' }}
                    >
                      <Text style={{ color: '#9ED9A8', fontWeight: '800' }}>{tr('친구에서 초대', 'Invite from friends', '友だちから招待', '从好友邀请')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('방 정보 수정', 'Edit room info', 'ルーム情報編集', '编辑房间信息')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' as any }}>
                  {(['owner', 'admin'] as const).map((w) => {
                    const cur = permDraft.whoCanEditRoomInfo || 'admin';
                    const active = cur === w;
                    return (
                      <TouchableOpacity
                        key={w}
                        disabled={!canEditRoom}
                        onPress={() => setPermDraft((p) => ({ ...p, whoCanEditRoomInfo: w }))}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? '#FFD700' : '#333' }}
                      >
                        <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '900' }}>{w === 'owner' ? tr('방장만', 'Owner only', 'オーナーのみ', '仅房主') : tr('관리자 포함', 'Include admins', '管理者を含む', '含管理员')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {String(room.type) === 'notice' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 12,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#222',
                      backgroundColor: '#111',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: '#EEE', fontWeight: '800' }}>일반 멤버 글쓰기 제한</Text>
                      <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>켜면 관리자·방장만 메시지를 보낼 수 있습니다.</Text>
                    </View>
                    <Switch value={!!noticeOnlyDraft} onValueChange={setNoticeOnlyDraft} disabled={!canEditRoom} />
                  </View>
                ) : null}
                {String(room.type) !== 'dm' ? (
                  <View style={{ marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ color: '#EEE', fontWeight: '800' }}>입장 문구</Text>
                        <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>새 멤버가 입장할 때 시스템 메시지를 자동으로 보냅니다.</Text>
                      </View>
                      <Switch value={!!joinMsgEnabledDraft} onValueChange={setJoinMsgEnabledDraft} disabled={!canEditRoom} />
                    </View>
                    {joinMsgEnabledDraft ? (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ color: '#777', fontSize: 11, marginBottom: 6 }}>템플릿: {'{name}'} / {'{uid}'}</Text>
                        <TextInput
                          editable={canEditRoom}
                          value={joinMsgTemplateDraft}
                          onChangeText={setJoinMsgTemplateDraft}
                          placeholder="{name} 님이 입장했습니다."
                          placeholderTextColor="#666"
                          style={{ backgroundColor: '#0B0F12', borderWidth: 1, borderColor: '#2B3A3F', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#EEE' }}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {!canEditRoom ? (
                  <Text style={{ color: '#777', marginTop: 8 }}>
                    {tr(
                      '멤버 권한·공지 정책 등은 관리자(방장·부방장)만 변경할 수 있습니다. 알림·테마는 누구나 본인에게만 적용됩니다.',
                      'Policies here can be changed by admins (owner & co-admins). Notifications and theme apply only to you.',
                      'メンバー権限などは管理者のみ。通知・テーマは各自のみに適用されます。',
                      '成员权限等仅管理员可改。通知与主题仅对自己生效。'
                    )}
                  </Text>
                ) : null}
              </View>
            )}

            {tab === 'notification' && (
              <View>
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('알림', 'Notifications', '通知', '通知')}</Text>
                <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                  {tr(
                    '알림 설정은 나에게만 적용됩니다.',
                    'Notification settings apply only to you.',
                    '通知設定は自分だけに適用されます。',
                    '通知设置仅对自己生效。'
                  )}
                </Text>
                <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#EEE', fontWeight: '900' }}>{tr('알림 사용', 'Enable notifications', '通知を使用', '启用通知')}</Text>
                    <Switch
                      value={memberSettings.notifications?.enabled !== false}
                      onValueChange={(v) =>
                        setMemberSettings((s) => ({
                          ...s,
                          notifications: { ...(s.notifications || { enabled: true, mode: 'sound' as const }), enabled: v },
                        }))
                      }
                    />
                  </View>

                  <Text style={{ color: '#AAA', marginTop: 12 }}>{tr('알림 방식', 'Notification mode', '通知方式', '通知方式')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' as any }}>
                    {([
                      { k: 'sound' as const, label: tr('소리', 'Sound', 'サウンド', '声音') },
                      { k: 'vibrate' as const, label: tr('진동', 'Vibrate', 'バイブ', '震动') },
                      { k: 'mute' as const, label: tr('무음', 'Mute', 'ミュート', '静音') },
                    ] as const).map((row) => {
                      const cur = memberSettings.notifications?.mode || 'sound';
                      const active = cur === row.k;
                      return (
                        <TouchableOpacity
                          key={row.k}
                          onPress={() =>
                            setMemberSettings((s) => ({
                              ...s,
                              notifications: { ...(s.notifications || { enabled: true, mode: 'sound' }), mode: row.k },
                            }))
                          }
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? '#FFD700' : '#333' }}
                        >
                          <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '900' }}>{row.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {(memberSettings.notifications?.mode || 'sound') === 'sound' ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ color: '#AAA' }}>{tr('알림 소리', 'Notification sound', '通知サウンド', '通知音')}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' as any, gap: 6, marginTop: 8 }}>
                        {NOTIFICATION_SOUND_OPTIONS.map((opt) => {
                          const curS = (memberSettings.notifications?.notificationSound || 'gold') as NotificationSoundType;
                          const active = curS === opt.value;
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              onPress={() =>
                                setMemberSettings((s) => ({
                                  ...s,
                                  notifications: {
                                    ...(s.notifications || { enabled: true, mode: 'sound' }),
                                    notificationSound: opt.value,
                                  },
                                }))
                              }
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 6,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: active ? '#FFD700' : '#333',
                                backgroundColor: active ? 'rgba(255,215,0,0.08)' : 'transparent',
                              }}
                            >
                              <Text style={{ color: active ? '#FFD700' : '#AAA', fontSize: 11, fontWeight: '700' }}>{opt.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={{ color: '#AAA', marginTop: 12 }}>{tr('알림 음량', 'Notification volume', '通知音量', '通知音量')}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' as any }}>
                        {VOLUME_OPTIONS.map((level) => {
                          const vol = (memberSettings.notifications?.notificationVolume || 'medium') as 'low' | 'medium' | 'high' | 'max';
                          const active = vol === level.value;
                          return (
                            <TouchableOpacity
                              key={level.value}
                              onPress={() =>
                                setMemberSettings((s) => ({
                                  ...s,
                                  notifications: {
                                    ...(s.notifications || { enabled: true, mode: 'sound' }),
                                    notificationVolume: level.value,
                                  },
                                }))
                              }
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: active ? '#FFD700' : '#333',
                              }}
                            >
                              <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '800' }}>
                                {level.value === 'low'
                                  ? tr('낮음', 'Low', '低', '低')
                                  : level.value === 'medium'
                                    ? tr('보통', 'Medium', '中', '中')
                                    : level.value === 'high'
                                      ? tr('높음', 'High', '高', '高')
                                      : tr('최대', 'Max', '最大', '最大')}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        onPress={handleTestNotificationSound}
                        style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignSelf: 'flex-start' }}
                      >
                        <Text style={{ color: '#CFCFCF', fontSize: 13 }}>{tr('테스트 재생', 'Test play', 'テスト再生', '测试播放')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <Text style={{ color: '#AAA', marginTop: 12 }}>키워드 알림</Text>
                  <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>쉼표로 구분. 알림이 꺼져 있어도 키워드가 포함된 메시지는 알림됩니다.</Text>
                  <TextInput
                    value={(memberSettings.notifications?.keywordAlerts || []).join(', ')}
                    onChangeText={(v) =>
                      setMemberSettings((s) => ({
                        ...s,
                        notifications: {
                          ...(s.notifications || { enabled: true, mode: 'sound' }),
                          keywordAlerts: v
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        },
                      }))
                    }
                    placeholder={tr('예: 급함, 중요', 'e.g. urgent, important', '例: 緊急, 重要', '例如：紧急、重要')}
                    placeholderTextColor="#666"
                    style={{
                      marginTop: 8,
                      borderWidth: 1,
                      borderColor: '#333',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      color: '#EEE',
                      backgroundColor: '#0C0C0C',
                    }}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                    <Text style={{ color: '#EEE', fontWeight: '800' }}>멘션 알림</Text>
                    <Switch
                      value={memberSettings.notifications?.mentionAlertEnabled !== false}
                      onValueChange={(v) =>
                        setMemberSettings((s) => ({
                          ...s,
                          notifications: { ...(s.notifications || { enabled: true, mode: 'sound' }), mentionAlertEnabled: v },
                        }))
                      }
                    />
                  </View>
                </View>
              </View>
            )}

            {tab === 'theme' && (
              <View>
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('테마 · 채팅', 'Theme · Chat', 'テーマ・チャット', '主题·聊天')}</Text>
                <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                  {tr(
                    '이 설정은 이 기기·내 계정에서만 보입니다. 다른 멤버 화면에는 적용되지 않습니다.',
                    'These options apply only to your account on this device; other members are not affected.',
                    'この端末・あなたのアカウントにのみ適用され、他メンバーには影響しません。',
                    '仅在本设备、本账号生效，不影响其他成员。'
                  )}
                </Text>
                <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <Text style={{ color: '#AAA' }}>{tr('테마 종류', 'Theme type', 'テーマ種類', '主题类型')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' as any }}>
                    {([
                      { id: 'default' as const, label: tr('기본', 'Default', '基本', '默认') },
                      { id: 'darkGold' as const, label: tr('다크', 'Dark', 'ダーク', '深色') },
                      { id: 'custom' as const, label: tr('커스텀', 'Custom', 'カスタム', '自定义') },
                    ] as const).map((row) => {
                      const cur = memberSettings.theme?.themeId || 'default';
                      const active = cur === row.id;
                      return (
                        <TouchableOpacity
                          key={row.id}
                          onPress={() =>
                            setMemberSettings((s) => ({
                              ...s,
                              theme: { ...(s.theme || {}), themeId: row.id },
                            }))
                          }
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: active ? '#FFD700' : '#333' }}
                        >
                          <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '800' }}>{row.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {memberSettings.theme?.themeId === 'custom' ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ color: '#AAA' }}>{tr('채팅 배경색 (#HEX)', 'Chat background color (#HEX)', 'チャット背景色 (#HEX)', '聊天背景色 (#HEX)')}</Text>
                      <TextInput
                        value={memberSettings.theme?.backgroundColorHex || ''}
                        onChangeText={(v) =>
                          setMemberSettings((s) => ({
                            ...s,
                            theme: { ...(s.theme || {}), backgroundColorHex: v },
                          }))
                        }
                        placeholder="#0C0C0C"
                        placeholderTextColor="#666"
                        style={{
                          marginTop: 6,
                          borderWidth: 1,
                          borderColor: '#333',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          color: '#EEE',
                          backgroundColor: '#0C0C0C',
                        }}
                      />
                      <Text style={{ color: '#AAA', marginTop: 10 }}>{tr('말풍선 색 (#HEX)', 'Bubble color (#HEX)', '吹き出し色 (#HEX)', '气泡颜色 (#HEX)')}</Text>
                      <TextInput
                        value={memberSettings.theme?.bubbleColorHex || ''}
                        onChangeText={(v) =>
                          setMemberSettings((s) => ({
                            ...s,
                            theme: { ...(s.theme || {}), bubbleColorHex: v },
                          }))
                        }
                        placeholder="#D4AF37"
                        placeholderTextColor="#666"
                        style={{
                          marginTop: 6,
                          borderWidth: 1,
                          borderColor: '#333',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          color: '#EEE',
                          backgroundColor: '#0C0C0C',
                        }}
                      />
                      <Text style={{ color: '#AAA', marginTop: 10 }}>{tr('배경 이미지', 'Background image', '背景画像', '背景图片')}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' as any }}>
                        <TextInput
                          value={memberSettings.theme?.wallpaperUrl || ''}
                          onChangeText={(v) =>
                            setMemberSettings((s) => ({
                              ...s,
                              theme: { ...(s.theme || {}), wallpaperUrl: v.trim() || undefined },
                            }))
                          }
                          placeholder="https://..."
                          placeholderTextColor="#666"
                          style={{
                            flex: 1,
                            minWidth: 120,
                            borderWidth: 1,
                            borderColor: '#333',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            color: '#EEE',
                            backgroundColor: '#0C0C0C',
                          }}
                        />
                        <TouchableOpacity
                          disabled={busy}
                          onPress={async () => {
                            try {
                              const res = await ImagePicker.launchImageLibraryAsync({
                                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                                allowsMultipleSelection: false,
                                selectionLimit: 1,
                                quality: 0.85,
                              });
                              if (res.canceled || !res.assets?.[0]?.uri) return;
                              setBusy(true);
                              try {
                                const url = await uploadUserRoomWallpaperV2({
                                  storage: firebaseStorage,
                                  uid,
                                  roomId: room.id,
                                  localUri: String(res.assets[0].uri),
                                });
                                setMemberSettings((s) => ({
                                  ...s,
                                  theme: { ...(s.theme || {}), wallpaperUrl: url },
                                }));
                              } finally {
                                setBusy(false);
                              }
                            } catch (e: any) {
                              Alert.alert(tr('업로드 실패', 'Upload failed', 'アップロード失敗', '上传失败'), String(e?.message || e));
                            }
                          }}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333' }}
                        >
                          <Text style={{ color: '#AAA' }}>{tr('앨범', 'Album', 'アルバム', '相册')}</Text>
                        </TouchableOpacity>
                        {memberSettings.theme?.wallpaperUrl ? (
                          <TouchableOpacity
                            onPress={() =>
                              setMemberSettings((s) => ({
                                ...s,
                                theme: { ...(s.theme || {}), wallpaperUrl: undefined },
                              }))
                            }
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#7A1F1F' }}
                          >
                            <Text style={{ color: '#FF6B6B' }}>{tr('삭제', 'Delete', '削除', '删除')}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ) : null}

                  <Text style={{ color: '#AAA', marginTop: 14 }}>{tr('말풍선 모양', 'Bubble style', '吹き出し形状', '气泡样式')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {(['rounded', 'square'] as const).map((bs) => {
                      const cur = memberSettings.theme?.bubbleStyle || 'rounded';
                      const active = cur === bs;
                      return (
                        <TouchableOpacity
                          key={bs}
                          onPress={() =>
                            setMemberSettings((s) => ({
                              ...s,
                              theme: { ...(s.theme || {}), bubbleStyle: bs },
                            }))
                          }
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: active ? '#FFD700' : '#333' }}
                        >
                          <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '800' }}>
                            {bs === 'rounded' ? tr('둥글게', 'Rounded', '丸型', '圆角') : tr('각진', 'Sharp', '角型', '直角')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={{ color: '#AAA', marginTop: 14 }}>{tr('글자 크기 (1~5)', 'Font size (1~5)', '文字サイズ (1~5)', '字体大小 (1~5)')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' as any }}>
                    {([1, 2, 3, 4, 5] as const).map((lvl) => {
                      const cur = (memberSettings.chat?.fontSizeLevel || 3) as any;
                      const active = cur === lvl;
                      return (
                        <TouchableOpacity
                          key={lvl}
                          onPress={() => setMemberSettings((s) => ({ ...s, chat: { ...(s.chat || { fontSizeLevel: 3 as any }), fontSizeLevel: lvl } }))}
                          style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: active ? '#FFD700' : '#333', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '900' }}>{lvl}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {tab === 'ttl' && String(room.type) === 'ttl' && (
              <View>
                {!canEditTtl ? (
                  <Text style={{ color: '#777', marginTop: 6, marginBottom: 8 }}>{tr('TTL·보안(폭파 시각·연장·메시지 삭제 시간·업로드 등)은 방장만 변경할 수 있습니다.', 'Only the room owner can change TTL timer, extend, message expiry, and security.', 'TTL・セキュリティ（爆破時刻・延長・メッセージ削除時間など）はオーナーのみ変更できます。', '仅房主可修改 TTL（爆破时间、延长、消息删除时间、安全选项等）。')}</Text>
                ) : (
                  <Text style={{ color: '#777', marginTop: 6, marginBottom: 8 }}>
                    {ttlEditUnlocked
                      ? tr('방 폭파 시간은 하단 저장으로 반영합니다. 메시지 삭제 시간·TTL 보안은 각각 옆의 저장으로만 반영합니다.', 'Room timer: bottom Save. Message expiry & TTL security: each has its own Save beside the fields.', '爆破時刻は下の保存。メッセージ削除とTTLセキュリティはそれぞれ横の保存。', '房间爆破时间：底部保存。消息删除与 TTL 安全：各自旁侧保存。')
                      : tr('「수정」으로 방 폭파 시간을 편집합니다. 메시지 삭제·TTL 보안은 잠금 없이 바꾼 뒤 각각 옆 저장으로 반영하세요.', 'Press "Edit" for room timer. Message expiry & TTL security: edit anytime, use Save beside each section.', '「編集」で爆破時刻。メッセージ削除・TTLセキュリティはロックなしで変更し、それぞれ横の保存で反映。', '点击“编辑”修改房间计时。消息删除与 TTL 安全可随时修改，用各自旁侧保存。')}
                  </Text>
                )}
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('TTL (일 : 시 : 분 : 초)', 'TTL (day : hour : min : sec)', 'TTL（日 : 時 : 分 : 秒）', 'TTL（天 : 时 : 分 : 秒）')}</Text>
                <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    {[{ v: ttlDays, s: setTtlDays }, { v: ttlHours, s: setTtlHours }, { v: ttlMinutes, s: setTtlMinutes }, { v: ttlSeconds, s: setTtlSeconds }].map((x, idx) => (
                      <React.Fragment key={idx}>
                        <TextInput
                          value={x.v}
                          editable={canEditTtl && ttlEditUnlocked}
                          onChangeText={(t) => {
                            if (!canEditTtl || !ttlEditUnlocked) return;
                            setTtlRoomDirty(true);
                            x.s(t);
                          }}
                          keyboardType="number-pad"
                          style={{ width: 64, height: 54, textAlign: 'center', borderWidth: 1, borderColor: '#333', borderRadius: 12, color: '#EEE', fontSize: 30, fontWeight: '900', backgroundColor: '#0C0C0C' }}
                        />
                        {idx < 3 ? <Text style={{ color: '#666', fontWeight: '900' }}>:</Text> : null}
                      </React.Fragment>
                    ))}
                  </View>
                </View>

                <Text style={{ color: '#AAA', marginTop: 12 }}>{tr('Message TTL (시 : 분 : 초)', 'Message TTL (hour : min : sec)', 'メッセージTTL（時 : 分 : 秒）', '消息 TTL（时 : 分 : 秒）')}</Text>
                <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    {[{ v: ttlMsgH, s: setTtlMsgH }, { v: ttlMsgM, s: setTtlMsgM }, { v: ttlMsgS, s: setTtlMsgS }].map((x, idx) => (
                      <React.Fragment key={idx}>
                        <TextInput
                          value={x.v}
                          editable={canEditTtl}
                          onChangeText={(t) => {
                            if (!canEditTtl) return;
                            setTtlMessageDirty(true);
                            x.s(t);
                          }}
                          keyboardType="number-pad"
                          style={{ width: 78, height: 54, textAlign: 'center', borderWidth: 1, borderColor: '#333', borderRadius: 12, color: '#EEE', fontSize: 28, fontWeight: '900', backgroundColor: '#0C0C0C' }}
                        />
                        {idx < 2 ? <Text style={{ color: '#666', fontWeight: '900' }}>:</Text> : null}
                      </React.Fragment>
                    ))}
                    <TouchableOpacity
                      disabled={busy || !canEditTtl}
                      onPress={() => saveMessageTtlOnly()}
                      style={{ marginLeft: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#FFD700', borderRadius: 12, opacity: canEditTtl ? 1 : 0.45 }}
                    >
                      <Text style={{ color: '#FFD700', fontWeight: '900' }}>{tr('저장', 'Save', '保存', '保存')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={{ color: '#AAA', marginTop: 12 }}>{tr('TTL 잔여 시간', 'TTL remaining time', 'TTL残り時間', 'TTL 剩余时间')}</Text>
                <Text
                  style={{
                    color: ttlStatus === 'expired' ? '#FF6B6B' : remainingSec > 86400 ? '#4DA3FF' : '#FF4444',
                    fontSize: 46,
                    fontWeight: '900',
                    marginTop: 4,
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  }}
                >
                  {ttlStatus === 'expired'
                    ? tr('TTL 만료됨', 'TTL expired', 'TTL期限切れ', 'TTL 已过期')
                    : `${Math.floor(remainingSec / 86400)} | ${String(Math.floor((remainingSec % 86400) / 3600)).padStart(2, '0')}:${String(Math.floor((remainingSec % 3600) / 60)).padStart(2, '0')}:${String(remainingSec % 60).padStart(2, '0')}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    disabled={!canEditTtl}
                    onPress={() => {
                      if (!canEditTtl) return;
                      setTtlEditUnlocked((u) => !u);
                    }}
                    style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: canEditTtl ? '#FFD700' : '#444' }}
                  >
                    <Text style={{ color: canEditTtl ? '#FFD700' : '#666', fontWeight: '900' }}>{ttlEditUnlocked ? tr('편집 잠금', 'Lock edit', '編集ロック', '锁定编辑') : tr('수정', 'Edit', '編集', '编辑')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={!canEditTtl} onPress={doExtendTtl} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: canEditTtl ? '#FFD700' : '#444' }}>
                    <Text style={{ color: canEditTtl ? '#FFD700' : '#666', fontWeight: '900' }}>{tr('연장', 'Extend', '延長', '延长')}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={{ color: '#AAA', flex: 1 }}>{tr('TTL 보안 설정', 'TTL security settings', 'TTLセキュリティ設定', 'TTL 安全设置')}</Text>
                  <TouchableOpacity
                    disabled={busy || !canEditTtl}
                    onPress={() => saveTtlSecurityOnly()}
                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#FFD700', borderRadius: 12, opacity: canEditTtl ? 1 : 0.45 }}
                  >
                    <Text style={{ color: '#FFD700', fontWeight: '900' }}>{tr('저장', 'Save', '保存', '保存')}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: '#777', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                  {tr(
                    '스위치를 바꾼 뒤 이 저장을 눌러 반영합니다. 방 폭파 시간·메시지 삭제와 별도입니다.',
                    'After toggling, tap Save here to apply. Separate from room timer and message expiry.',
                    '切り替えたら横の保存で反映。爆破時刻・メッセージ削除とは別です。',
                    '切换后请按此处保存，与房间计时、消息删除无关。'
                  )}
                </Text>
                <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', backgroundColor: '#111', gap: 10 }}>
                  {[{ k: tr('이미지 등록 허용', 'Allow image upload', '画像アップロード許可', '允许图片上传'), v: allowImageUpload, s: setAllowImageUpload }, { k: tr('이미지 다운로드 허용', 'Allow image download', '画像ダウンロード許可', '允许图片下载'), v: allowImageDownload, s: setAllowImageDownload }, { k: tr('대화방 캡처 허용', 'Allow room capture', '画面キャプチャ許可', '允许聊天截图'), v: allowCapture, s: setAllowCapture }, { k: tr('외부 공유 허용', 'Allow external share', '外部共有許可', '允许外部分享'), v: allowExternalShare, s: setAllowExternalShare }].map((x) => (
                    <View key={x.k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#EEE', fontSize: 14, fontWeight: '700' }}>{x.k}</Text>
                      <TouchableOpacity
                        disabled={busy || !canEditTtl}
                        onPress={() => {
                          if (!canEditTtl) return;
                          setTtlSecurityDirty(true);
                          x.s(!x.v);
                        }}
                        style={{ width: 58, height: 34, borderRadius: 17, backgroundColor: x.v ? '#1F6B63' : '#2A2A2A', justifyContent: 'center', paddingHorizontal: 4, opacity: canEditTtl ? 1 : 0.45 }}
                      >
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: x.v ? '#00BFA5' : '#666', alignSelf: x.v ? 'flex-end' : 'flex-start' }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {tab === 'manage' && (
              <View>
                <Text style={{ color: '#AAA', marginTop: 6 }}>{tr('관리', 'Manage', '管理', '管理')}</Text>
                <Text style={{ color: '#777', marginTop: 6 }}>{tr('초기화/내보내기/나가기는 현재 방 기능 기준으로 동작합니다.', 'Reset / export / leave follow current room policy.', '初期化/エクスポート/退出は現在のルーム設定で動作します。', '重置/导出/退出遵循当前房间规则。')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={doReset}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#444', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#EEE', fontWeight: '900' }}>{tr('채팅방 초기화(나만)', 'Reset chat (me only)', 'チャット初期化（自分のみ）', '重置聊天（仅自己）')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    disabled={busy}
                    onPress={doExport}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#444', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#EEE', fontWeight: '900' }}>{tr('대화 내보내기', 'Export chat', 'チャットをエクスポート', '导出聊天')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            </ScrollView>
          </KeyboardAvoidingView>

          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: '#1E1E1E',
              marginBottom: Platform.OS === 'android' ? Math.max(0, keyboardHeight - 10) : 0,
            }}
          >
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <ActivityIndicator size="small" color="#FFD700" />
                <Text style={{ color: '#AAA' }}>{tr('처리 중...', 'Processing...', '処理中...', '处理中...')}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={doSaveSettings}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}
                >
                  <Text style={{ color: '#FFD700', fontWeight: '900' }}>{tr('저장', 'Save', '保存', '保存')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={doLeave}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#7A1F1F', backgroundColor: 'rgba(122,31,31,0.12)', alignItems: 'center' }}
                >
                  <Text style={{ color: '#FF6B6B', fontWeight: '900' }}>{tr('나가기', 'Leave', '退出', '退出')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={inviteOpen} animationType="fade" transparent onRequestClose={() => setInviteOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 320, maxWidth: '100%', backgroundColor: '#111', borderRadius: 14, borderWidth: 2, borderColor: '#FFD700', padding: 16 }}>
          <Text style={{ color: '#F6F6F6', fontWeight: '900', fontSize: 16 }}>{tr('방 초대', 'Invite to room', 'ルーム招待', '邀请入房')}</Text>
          <Text style={{ color: '#888', fontSize: 12, marginTop: 6 }}>{tr('QR을 스캔하거나 코드를 공유하세요.', 'Scan QR or share the code.', 'QRをスキャンするかコードを共有してください。', '扫描二维码或分享邀请码。')}</Text>
          {inviteBusy ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator color="#FFD700" />
            </View>
          ) : inviteSnap?.inviteQrValue ? (
            <View style={{ alignItems: 'center', marginTop: 10, width: '100%' }}>
              <QrSavePopupCard
                ref={inviteQrModalCaptureRef}
                payload={String(inviteSnap.inviteQrValue)}
                headline={tr('QR 이미지 저장', 'Save QR image', 'QR画像を保存', '保存二维码')}
                titleLine={
                  language === 'en'
                    ? `[Invite] / ${String(room.title || 'Room').slice(0, 28)}`
                    : `[초대] / ${String(room.title || '방').slice(0, 28)}`
                }
                language={language}
                webCaptureId="invite-qr-popup-card"
                variant="invite"
                onClose={() => setInviteOpen(false)}
              />
              {inviteSnap.inviteCode ? (
                <TouchableOpacity
                  onPress={() => Clipboard.setStringAsync(String(inviteSnap.inviteCode)).catch(() => {})}
                  style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#444' }}
                >
                  <Text style={{ color: '#FFD700', fontWeight: '800' }}>{tr('코드 복사', 'Copy code', 'コードをコピー', '复制代码')}: {inviteSnap.inviteCode}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : inviteError ? (
            <Text style={{ color: '#FF8A8A', marginTop: 16, textAlign: 'center' }}>{inviteError}</Text>
          ) : (
            <Text style={{ color: '#777', marginTop: 16 }}>{tr('초대 정보를 불러올 수 없습니다.', 'Unable to load invite info.', '招待情報を読み込めません。', '无法加载邀请信息。')}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <TouchableOpacity
              onPress={() => setInviteOpen(false)}
              style={{ flex: 1, minWidth: 120, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#444', alignItems: 'center' }}
            >
              <Text style={{ color: '#EEE', fontWeight: '800' }}>{tr('닫기', 'Close', '閉じる', '关闭')}</Text>
            </TouchableOpacity>
            {inviteSnap?.inviteCode && inviteSnap?.inviteToken ? (
              <TouchableOpacity
                onPress={() => {
                  try {
                    const roomId = String(room.id);
                    const lang: InviteShareLangV2 =
                      language === 'ja' ? 'ja' : language === 'zh' ? 'zh' : language === 'ko' ? 'ko' : 'en';
                    const { message, primaryUrl } = buildInviteExternalSharePayloadV2({
                      roomId,
                      inviteToken: String(inviteSnap.inviteToken),
                      inviteCode: String(inviteSnap.inviteCode),
                      lang,
                    });
                    const sharePayload: { message: string; title?: string; url?: string } = {
                      message,
                      title: tr('YooYLand 방 초대', 'YooYLand room invite', 'YooYLand ルーム招待', 'YooYLand 房间邀请'),
                    };
                    if (Platform.OS === 'ios') {
                      sharePayload.url = primaryUrl;
                    }
                    Share.share(sharePayload).catch(() => {});
                  } catch {}
                }}
                style={{ flex: 1, minWidth: 120, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}
              >
                <Text style={{ color: '#FFD700', fontWeight: '800' }}>공유</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>

    <Modal
      visible={memberInviteModalOpen}
      animationType="fade"
      transparent
      onRequestClose={() => {
        if (!memberInviteBusy) setMemberInviteModalOpen(false);
      }}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 340, maxWidth: '100%', maxHeight: '72%', backgroundColor: '#111', borderRadius: 14, borderWidth: 2, borderColor: '#3A5A3A', padding: 14 }}>
          <Text style={{ color: '#EEE', fontWeight: '900', fontSize: 16 }}>{tr('친구에서 초대', 'Invite from friends', '友だちから招待', '从好友邀请')}</Text>
          <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
            {inviteFriendRows.length === 0 ? (
              <Text style={{ color: '#777', paddingVertical: 20, textAlign: 'center' }}>
                {tr('친구 목록이 비어 있거나 불러오지 못했습니다.', 'No friends yet or could not load.', '友だちがいないか読み込めません。', '暂无好友或加载失败。')}
              </Text>
            ) : (
              inviteFriendRows.map((r) => (
                <TouchableOpacity
                  key={r.friendId}
                  disabled={memberInviteBusy || String(r.friendId) === String(uid)}
                  onPress={() => runInviteByUid(r.friendId)}
                  style={{ paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#222' }}
                >
                  <Text style={{ color: '#EEE', fontWeight: '800' }}>{r.name}</Text>
                  <Text style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{r.friendId}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          {memberInviteBusy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 }}>
              <ActivityIndicator color="#FFD700" size="small" />
              <Text style={{ color: '#AAA' }}>{tr('처리 중...', 'Processing...', '処理中...', '处理中...')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setMemberInviteModalOpen(false)}
              style={{ marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#444', alignItems: 'center' }}
            >
              <Text style={{ color: '#EEE', fontWeight: '800' }}>{tr('닫기', 'Close', '閉じる', '关闭')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

