import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Text, TextInput, TouchableOpacity, Platform, Modal, Keyboard, ScrollView, PanResponder, Dimensions, Alert, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { ChatRoomV2 } from '../core/roomSchema';
import { getMessageExpireSecondsV2 } from '../core/ttlEngine';
import { useChatV2Store } from '../store/chatv2.store';
import {
  sendLinkV2,
  sendImageAlbumV2,
  sendMediaV2,
  sendLocationV2,
  sendPollV2,
  sendQrV2,
  sendTextOptimisticV2,
  patchRoomMessageQrDecodedV2,
} from '../services/messageService';
import { yyChatFlow } from '../core/chatFlowLog';
import { logAttach } from '../core/attachLog';
import { formatChatUploadError } from '../core/uploadErrors';
import type { RunUploadFlowResultV2 } from '../core/uploadFlow';
import { resolvePickerAssetDisplayName } from '../core/pickerDisplayName';
import { materializePickerUriForUpload } from '../core/pickerUri';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '@/contexts/PreferencesContext';
import { chatTr } from '../core/chatI18n';
import { Image as EImage } from 'expo-image';
import { formatReplySnapshotSubtitle, isLikelyVideoStreamUri } from '../core/attachmentAccess';
import { scanBarcodeFromFileUri } from '@/lib/qrScanner';
import {
  canMemberComposeMessagesV2,
  canMemberSendFilesV2,
  canMemberSendGalleryMediaV2,
  canMemberShareLinksV2,
} from '../core/roomPermissions';

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

/** 여러 장 선택 시 순차 전송만 하면 총 업로드 시간이 합산되어 느려짐. Storage 부하는 피하면서 속도 개선 */
const MULTI_IMAGE_UPLOAD_CONCURRENCY = 3;

async function sendPreparedImagesInBatches(
  prepared: Array<{
    localUri: string;
    filename: string;
    mimeType: string;
    size?: number;
    width?: number;
    height?: number;
    createdAt: number;
  }>,
  sendOne: (one: (typeof prepared)[0]) => Promise<RunUploadFlowResultV2>
): Promise<void> {
  const errs: string[] = [];
  for (let i = 0; i < prepared.length; i += MULTI_IMAGE_UPLOAD_CONCURRENCY) {
    const chunk = prepared.slice(i, i + MULTI_IMAGE_UPLOAD_CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((one) => sendOne(one)));
    for (const s of settled) {
      if (s.status === 'rejected') {
        errs.push(formatChatUploadError(String((s.reason as any)?.message || s.reason || 'photo_send_failed')));
        continue;
      }
      const out = s.value;
      if (!out.ok) errs.push(formatChatUploadError(out.error || ''));
    }
  }
  if (errs.length) {
    const msg =
      errs.length === 1
        ? errs[0]
        : `${errs.length}장 전송 중 오류:\n${errs.slice(0, 4).join('\n')}${errs.length > 4 ? '\n…' : ''}`;
    Alert.alert('사진', msg);
  }
}

/** content:// · ph:// 등은 ML Kit이 직접 못 읽는 경우가 있어 캐시 파일로 복사 */
async function copyToScannablePathIfNeeded(uri: string): Promise<string> {
  const u = String(uri || '').trim();
  if (!u) return '';
  try {
    const FS = require('expo-file-system/legacy');
    if (/^(content|ph):\/\//i.test(u) && FS?.cacheDirectory) {
      const dest = `${FS.cacheDirectory}yy_qr_${Date.now()}.jpg`;
      await FS.copyAsync({ from: u, to: dest });
      return dest;
    }
  } catch {}
  return u;
}

/** 갤러리/캐시 파일 URI → 명함·지갑과 동일 파이프라인 (ML Kit + jsQR) */
async function decodeQrFromLocalPath(scanTarget: string): Promise<string> {
  const path = String(scanTarget || '').trim();
  if (!path) return '';
  try {
    const t = await scanBarcodeFromFileUri(path);
    return String(t || '').trim();
  } catch {
    return '';
  }
}

type Props = {
  firestore: Firestore;
  storage: FirebaseStorage;
  room: ChatRoomV2;
  uid: string;
  fontSize?: number;
  ttlPolicy?: {
    blocked?: boolean;
    reason?: string;
    allowImageUpload?: boolean;
    allowExternalShare?: boolean;
  };
  replyTarget?: {
    id: string;
    senderId: string;
    senderName?: string;
    type?: string;
    text?: string;
    thumbnailUrl?: string;
  } | null;
  onClearReply?: () => void;
};

export function ComposerV2({ firestore, storage, room, uid, fontSize = 16, ttlPolicy, replyTarget, onClearReply }: Props) {
  const insets = useSafeAreaInsets();
  const { language } = usePreferences();
  const t = useMemo(() => (ko: string, en: string, ja?: string, zh?: string) => chatTr(language as any, ko, en, ja, zh), [language]);
  const draft = useChatV2Store((s) => s.composerByRoomId[room.id]?.textDraft || '');
  const setDraftText = useChatV2Store((s) => s.setDraftText);
  const upsertLocal = useChatV2Store((s) => s.upsertMessage);
  const removeMessage = useChatV2Store((s) => s.removeMessage);
  const patchMessage = useChatV2Store((s) => s.patchMessage);

  const [height, setHeight] = useState(38);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [attachOpen, setAttachOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState<string>('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMulti, setPollMulti] = useState<boolean>(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const voiceRecObjRef = useRef<InstanceType<typeof Audio.Recording> | null>(null);
  const voiceTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [voiceSec, setVoiceSec] = useState(0);
  const sendingRef = useRef(false);
  const sheetHRef = useRef(260);
  const sheetY = useRef(new Animated.Value(9999)).current;
  const sheetDragY = useRef(new Animated.Value(0)).current;

  const ctx = useMemo(
    () => ({
      firestore,
      storage,
      roomId: room.id,
      senderId: uid,
      participantIds: room.participantIds || [],
      roomType: room.type,
      title: room.title,
      ttlMessageExpireSeconds: getMessageExpireSecondsV2(room),
      replyTo: replyTarget || undefined,
    }),
    [firestore, storage, room, uid, replyTarget]
  );

  const composeAllowed = useMemo(() => canMemberComposeMessagesV2(room, uid), [room, uid]);
  const galleryAllowed = useMemo(() => canMemberSendGalleryMediaV2(room, uid), [room, uid]);
  const fileAllowed = useMemo(() => canMemberSendFilesV2(room, uid), [room, uid]);
  const linkAllowed = useMemo(() => canMemberShareLinksV2(room, uid), [room, uid]);

  // ===== Mentions (@) =====
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionRows, setMentionRows] = useState<Array<{ uid: string; name: string; photo?: string }>>([]);
  const lastMentionRef = useRef<{ tokenStart: number; tokenEnd: number; uids: string[] }>({ tokenStart: 0, tokenEnd: 0, uids: [] });

  const detectMentionToken = (text: string, caret: number) => {
    try {
      const left = String(text || '').slice(0, Math.max(0, caret));
      const m = left.match(/(?:^|\\s)@([\\p{L}0-9_\\-]{0,32})$/u);
      if (!m) return null;
      const q = String(m[1] || '');
      const at = left.lastIndexOf('@');
      if (at < 0) return null;
      return { tokenStart: at, tokenEnd: caret, query: q };
    } catch {
      return null;
    }
  };

  const refreshMentionRows = async (queryText: string) => {
    try {
      const q = String(queryText || '').toLowerCase().trim();
      const base = Array.isArray(room.participantIds) ? room.participantIds.map((x) => String(x)).filter(Boolean) : [];
      const uniq = Array.from(new Set([uid, ...base])).filter(Boolean);
      const rows: Array<{ uid: string; name: string; photo?: string }> = [];
      const { doc, getDoc } = await import('firebase/firestore');
      const { resolveChatDisplayNameFromUserDoc } = await import('../core/chatDisplayName');
      for (const id of uniq.slice(0, 80)) {
        try {
          const snap = await getDoc(doc(firestore, 'users', id));
          const d = snap.exists() ? (snap.data() as any) : {};
          const name = (resolveChatDisplayNameFromUserDoc(id, d as any) || id).trim() || id;
          const photo = String(d?.photoURL || d?.avatarUrl || '').trim();
          if (!q || name.toLowerCase().includes(q) || id.toLowerCase().includes(q)) rows.push({ uid: id, name, photo });
        } catch {
          if (!q || id.toLowerCase().includes(q)) rows.push({ uid: id, name: id, photo: '' });
        }
      }
      rows.sort((a, b) => (a.uid === uid ? -1 : b.uid === uid ? 1 : a.name.localeCompare(b.name, 'ko')));
      setMentionRows(rows.slice(0, 30));
    } catch {
      setMentionRows([]);
    }
  };

  const clearReply = React.useCallback(() => {
    try { onClearReply?.(); } catch {}
  }, [onClearReply]);

  useEffect(() => {
    if (!attachOpen) return;
    // start hidden (below)
    sheetY.setValue(sheetHRef.current);
    sheetDragY.setValue(0);
    Animated.timing(sheetY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [attachOpen, sheetY]);

  const closeAttach = () => {
    try {
      sheetDragY.setValue(0);
      Animated.timing(sheetY, {
        toValue: sheetHRef.current,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setAttachOpen(false);
        else setAttachOpen(false);
      });
    } catch {
      setAttachOpen(false);
    }
  };

  const openAttachSheet = () => {
    if (!composeAllowed) {
      Alert.alert(
        t('채팅', 'Chat', 'チャット', '聊天'),
        t('이 방에서는 메시지를 보낼 수 없습니다.', 'You cannot send messages in this room.', 'このルームではメッセージを送信できません。', '此房间无法发送消息。')
      );
      return;
    }
    try { Keyboard.dismiss(); } catch {}
    setAttachOpen(true);
  };

  const clearVoiceTick = () => {
    if (voiceTickRef.current) {
      clearInterval(voiceTickRef.current);
      voiceTickRef.current = null;
    }
  };

  const stopVoiceRecordingOnly = async (): Promise<{ uri: string | null; durationMs: number }> => {
    clearVoiceTick();
    const rec = voiceRecObjRef.current;
    voiceRecObjRef.current = null;
    setVoiceRecording(false);
    let durationMs = Math.max(0, voiceSec * 1000);
    if (!rec) return { uri: null, durationMs: 0 };
    try {
      await rec.stopAndUnloadAsync();
    } catch {}
    try {
      const st = await rec.getStatusAsync();
      if (typeof (st as any)?.durationMillis === 'number') durationMs = Math.round((st as any).durationMillis);
    } catch {}
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch {}
    const uri = rec.getURI();
    return { uri: uri || null, durationMs };
  };

  const openVoiceModal = () => {
    if (ttlPolicy?.blocked) return;
    if (!fileAllowed) {
      Alert.alert(
        t('첨부', 'Attachments', '添付', '附件'),
        t('이 방에서는 파일·음성 전송이 제한되어 있습니다.', 'File and voice messages are restricted in this room.', 'このルームではファイル・音声の送信が制限されています。', '此房间限制文件与语音发送。')
      );
      return;
    }
    if (voiceRecording) return;
    setVoiceSec(0);
    setAttachOpen(false);
    setVoiceOpen(true);
  };

  const closeVoiceModal = async () => {
    if (voiceRecording) {
      await stopVoiceRecordingOnly();
    }
    setVoiceSec(0);
    setVoiceOpen(false);
  };

  const voiceStartRecord = async () => {
    if (ttlPolicy?.blocked) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('마이크', 'Microphone', 'マイク', '麦克风'), t('음성 메시지를 보내려면 마이크 권한이 필요합니다.', 'Microphone permission is required for voice messages.', '音声メッセージにはマイク権限が必要です。', '发送语音消息需要麦克风权限。'));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      voiceRecObjRef.current = recording;
      setVoiceRecording(true);
      setVoiceSec(0);
      clearVoiceTick();
      voiceTickRef.current = setInterval(async () => {
        try {
          const r = voiceRecObjRef.current;
          if (!r) return;
          const s = await r.getStatusAsync();
          if (s.isRecording && typeof (s as any).durationMillis === 'number') {
            setVoiceSec(Math.floor((s as any).durationMillis / 1000));
          }
        } catch {}
      }, 400);
      yyChatFlow('ui.voice.record.start', { roomId: room.id });
    } catch (e: any) {
      const emsg = String(e?.message || e || 'voice_record_failed');
      Alert.alert(t('음성 녹음', 'Voice recording', '音声録音', '语音录制'), emsg);
      yyChatFlow('ui.voice.record.error', { roomId: room.id, error: emsg });
    }
  };

  const voiceSend = async () => {
    if (ttlPolicy?.blocked) return;
    if (!voiceRecording) return;
    const { uri, durationMs } = await stopVoiceRecordingOnly();
    setVoiceOpen(false);
    setVoiceSec(0);
    if (!uri) {
      Alert.alert(t('음성', 'Voice', '音声', '语音'), t('녹음 파일을 찾을 수 없습니다.', 'Recording file not found.', '録音ファイルが見つかりません。', '找不到录音文件。'));
      return;
    }
    const voiceRes = await sendMediaV2(
      ctx as any,
      {
        type: 'audio',
        localUri: uri,
        filename: `voice_${Date.now()}.m4a`,
        mimeType: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
        durationMs: durationMs > 0 ? durationMs : undefined,
      },
      { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
    );
    if (!voiceRes.ok) {
      Alert.alert(t('음성', 'Voice', '音声', '语音'), formatChatUploadError(voiceRes.error || ''));
      return;
    }
    clearReply();
    yyChatFlow('ui.voice.send', { roomId: room.id, durationMs });
  };

  const voiceCancel = async () => {
    await closeVoiceModal();
  };

  useEffect(() => {
    return () => {
      clearVoiceTick();
      if (voiceRecObjRef.current) {
        try {
          voiceRecObjRef.current.stopAndUnloadAsync().catch(() => {});
        } catch {}
        voiceRecObjRef.current = null;
      }
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 4,
      onPanResponderMove: (_evt, g) => {
        const dy = Math.max(0, Number(g.dy || 0));
        sheetDragY.setValue(dy);
      },
      onPanResponderRelease: (_evt, g) => {
        const dy = Math.max(0, Number(g.dy || 0));
        const vy = Number(g.vy || 0);
        if (dy > 72 || vy > 1.15) {
          closeAttach();
          return;
        }
        Animated.spring(sheetDragY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetDragY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 18,
        }).start();
      },
    })
  ).current;

  const sendText = async () => {
    if (ttlPolicy?.blocked) {
      logTtl('blocked_action', { roomId: room.id, roomType: room.type, action: 'sendText', reason: ttlPolicy.reason || 'room_expired' });
      return;
    }
    if (!composeAllowed) {
      Alert.alert(
        t('채팅', 'Chat', 'チャット', '聊天'),
        t('이 방에서는 메시지를 보낼 수 없습니다.', 'You cannot send messages in this room.', 'このルームではメッセージを送信できません。', '此房间无法发送消息。')
      );
      return;
    }
    const t = String(draft || '').trim();
    if (!t || sendingRef.current) return;
    sendingRef.current = true;
    setDraftText(room.id, '');
    const isUrlLine = /^https?:\/\/\S+$/i.test(t);
    if (isUrlLine && !linkAllowed) {
      setDraftText(room.id, t);
      Alert.alert(
        t('링크', 'Link', 'リンク', '链接'),
        t('이 방에서는 링크 공유가 제한되어 있습니다.', 'Link sharing is restricted in this room.', 'このルームではリンク共有が制限されています。', '此房间限制链接分享。')
      );
      sendingRef.current = false;
      return;
    }
    try {
      yyChatFlow('ui.sendText.tap', { roomId: room.id, len: t.length });
      if (isUrlLine) {
        yyChatFlow('ui.sendUrl.tap', { roomId: room.id, url: t.slice(0, 160) });
        await sendLinkV2(ctx as any, { url: t });
        clearReply();
      } else {
        const metaMentions = (() => {
          try {
            const uids = Array.from(new Set(lastMentionRef.current.uids)).filter(Boolean);
            if (!uids.length) return undefined;
            return { mentions: { uids } };
          } catch {
            return undefined;
          }
        })();
        const textRes = await sendTextOptimisticV2(
          ctx as any,
          t,
          { upsertLocal: (rid, msg) => upsertLocal(rid, msg) },
          metaMentions ? { meta: metaMentions } : undefined
        );
        if (String(textRes?.message?.status || '') === 'failed') {
          const err = String((textRes.message as any)?.meta?.error || t('전송 실패', 'Send failed', '送信失敗', '发送失败'));
          setDraftText(room.id, t);
          Alert.alert(t('메시지', 'Message', 'メッセージ', '消息'), formatChatUploadError(err));
        } else {
          lastMentionRef.current = { tokenStart: 0, tokenEnd: 0, uids: [] };
          clearReply();
        }
      }
    } catch (e: any) {
      const emsg = String(e?.message || e || 'send_text_failed');
      logDm('composer.sendText.fail', { currentUid: uid, roomId: room.id, error: emsg });
      yyChatFlow('ui.sendText.error', { roomId: room.id, error: emsg });
      setDraftText(room.id, t);
      Alert.alert(isUrlLine ? t('링크', 'Link', 'リンク', '链接') : t('메시지', 'Message', 'メッセージ', '消息'), formatChatUploadError(emsg));
    } finally {
      sendingRef.current = false;
    }
  };

  const pickImage = async () => {
    if (ttlPolicy?.blocked) return;
    if (ttlPolicy?.allowImageUpload === false) {
      logTtl('blocked_action', { roomId: room.id, roomType: room.type, action: 'imageUpload', reason: 'image_upload_blocked' });
      return;
    }
    if (!galleryAllowed) {
      Alert.alert(
        t('사진', 'Photos', '写真', '图片'),
        t('이 방에서는 사진·동영상 전송이 제한되어 있습니다.', 'Photos and videos are restricted in this room.', 'このルームでは写真・動画の送信が制限されています。', '此房间限制发送图片与视频。')
      );
      return;
    }
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.length) return;
      yyChatFlow('ui.pickImage.ok', { roomId: room.id, count: res.assets.length });
      setAttachOpen(false);
      const baseTs = Date.now();
      const prepared: Array<{
        localUri: string;
        filename: string;
        mimeType: string;
        size?: number;
        width?: number;
        height?: number;
        createdAt: number;
      }> = [];
      for (let i = 0; i < res.assets.length; i++) {
        const a = res.assets[i];
        if (!a?.uri) continue;
        try {
          const localUri = await materializePickerUriForUpload(String(a.uri));
          const filename = await resolvePickerAssetDisplayName(a);
          prepared.push({
            localUri,
            filename,
            mimeType: (a as any).mimeType || 'image/jpeg',
            size: typeof (a as any)?.fileSize === 'number' ? Number((a as any).fileSize) : undefined,
            width: typeof (a as any)?.width === 'number' ? Number((a as any).width) : undefined,
            height: typeof (a as any)?.height === 'number' ? Number((a as any).height) : undefined,
            createdAt: baseTs + i,
          });
        } catch (err: any) {
          const emsg = String(err?.message || err || 'photo_prepare_failed');
          logAttach('attach.photo.flow.fail', { roomId: room.id, action: 'photo', success: false, errorMessage: emsg, error: emsg });
          logDm('composer.sendImage.fail', { currentUid: uid, roomId: room.id, error: emsg });
        }
      }
      if (prepared.length === 0) return;
      if (prepared.length >= 2) {
        // 요구사항: 카카오톡처럼 다중 선택은 앨범(한 말풍선)으로 전송.
        // 단, 앨범 경로 실패 시 사용자 체감 전송 실패를 줄이기 위해 장별 병렬 경로로 자동 폴백.
        try {
          const out = await sendImageAlbumV2(
            ctx as any,
            prepared.map((one) => ({
              localUri: one.localUri,
              filename: one.filename,
              mimeType: one.mimeType,
              size: one.size,
              width: one.width,
              height: one.height,
            })),
            { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
          );
          if (!out.ok) {
            await sendPreparedImagesInBatches(prepared, (one) =>
              sendMediaV2(
                ctx as any,
                {
                  type: 'image',
                  localUri: one.localUri,
                  filename: one.filename,
                  mimeType: one.mimeType,
                  size: one.size,
                  width: one.width,
                  height: one.height,
                  createdAt: one.createdAt,
                },
                { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
              )
            );
          }
        } catch {
          await sendPreparedImagesInBatches(prepared, (one) =>
            sendMediaV2(
              ctx as any,
              {
                type: 'image',
                localUri: one.localUri,
                filename: one.filename,
                mimeType: one.mimeType,
                size: one.size,
                width: one.width,
                height: one.height,
                createdAt: one.createdAt,
              },
              { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
            )
          );
        }
        clearReply();
        return;
      }
      const one = prepared[0];
      try {
        const out = await sendMediaV2(
          ctx as any,
          {
            type: 'image',
            localUri: one.localUri,
            filename: one.filename,
            mimeType: one.mimeType,
            size: one.size,
            width: one.width,
            height: one.height,
            createdAt: one.createdAt,
          },
          { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
        );
        if (!out.ok) Alert.alert(t('사진', 'Photos', '写真', '图片'), formatChatUploadError(out.error || ''));
        else clearReply();
      } catch (err: any) {
        const emsg = String(err?.message || err || 'photo_send_failed');
        logAttach('attach.photo.flow.fail', { roomId: room.id, action: 'photo', success: false, errorMessage: emsg, error: emsg });
        logDm('composer.sendImage.fail', { currentUid: uid, roomId: room.id, error: emsg });
      }
    } catch (e: any) {
      const emsg = String(e?.message || e || 'pick_image_failed');
      logAttach('attach.photo.pick.fail', { roomId: room.id, action: 'photo', success: false, errorMessage: emsg, error: emsg });
      logDm('composer.sendImage.fail', { currentUid: uid, roomId: room.id, error: emsg });
      yyChatFlow('ui.pickImage.error', { roomId: room.id, error: emsg });
    }
  };

  const pickVideo = async () => {
    if (ttlPolicy?.blocked) return;
    if (!galleryAllowed) {
      Alert.alert(
        t('동영상', 'Video', '動画', '视频'),
        t('이 방에서는 사진·동영상 전송이 제한되어 있습니다.', 'Photos and videos are restricted in this room.', 'このルームでは写真・動画の送信が制限されています。', '此房间限制发送图片与视频。')
      );
      return;
    }
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!a?.uri) return;
      yyChatFlow('ui.pickVideo.ok', { roomId: room.id, uri: String(a.uri).slice(0, 80) });
      setAttachOpen(false);
      const filename = await resolvePickerAssetDisplayName(a);
      const vOut = await sendMediaV2(
        ctx as any,
        {
          type: 'video',
          localUri: String(a.uri),
          filename,
          mimeType: (a as any).mimeType || 'video/mp4',
          size: typeof (a as any)?.fileSize === 'number' ? Number((a as any).fileSize) : undefined,
          width: typeof (a as any)?.width === 'number' ? Number((a as any).width) : undefined,
          height: typeof (a as any)?.height === 'number' ? Number((a as any).height) : undefined,
          durationMs: typeof (a as any)?.duration === 'number' ? Math.round(Number((a as any).duration) * 1000) : undefined,
        },
        { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
      );
      if (!vOut.ok) Alert.alert(t('동영상', 'Video', '動画', '视频'), formatChatUploadError(vOut.error || ''));
      else clearReply();
    } catch (e: any) {
      const emsg = String(e?.message || e || 'pick_video_failed');
      logAttach('attach.video.flow.fail', { roomId: room.id, action: 'video', success: false, errorMessage: emsg, error: emsg });
      yyChatFlow('ui.pickVideo.error', { roomId: room.id, error: emsg });
    }
  };

  /** expo-document-picker: assets[] 또는 구형 { uri, name, mimeType, size } 모두 처리 */
  const resolvePickedDocument = (out: any): { uri: string; name?: string; mimeType?: string; size?: number } | null => {
    if (!out || out.canceled) return null;
    const assets = out.assets;
    if (Array.isArray(assets) && assets[0]?.uri) {
      const a = assets[0];
      return {
        uri: String(a.uri),
        name: a.name,
        mimeType: a.mimeType,
        size: typeof a.size === 'number' ? a.size : undefined,
      };
    }
    if (typeof out.uri === 'string' && out.uri.length > 0) {
      return {
        uri: String(out.uri),
        name: out.name,
        mimeType: out.mimeType,
        size: typeof out.size === 'number' ? out.size : undefined,
      };
    }
    return null;
  };

  const pickFile = async () => {
    if (ttlPolicy?.blocked) return;
    if (!fileAllowed) {
      Alert.alert(
        t('파일', 'File', 'ファイル', '文件'),
        t('이 방에서는 파일 전송이 제한되어 있습니다.', 'File uploads are restricted in this room.', 'このルームではファイル送信が制限されています。', '此房间限制文件发送。')
      );
      return;
    }
    try {
      const out = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      } as DocumentPicker.DocumentPickerOptions);
      if ((out as any)?.canceled) return;
      const picked = resolvePickedDocument(out as any);
      if (!picked?.uri) {
        logAttach('attach.file.pick.empty', { roomId: room.id, action: 'file', success: false, errorMessage: 'no_uri', error: 'no_uri' });
        return;
      }
      yyChatFlow('ui.pickFile.ok', {
        roomId: room.id,
        uri: String(picked.uri).slice(0, 80),
        mimeType: picked.mimeType,
        name: picked.name,
      });
      setAttachOpen(false);
      const fOut = await sendMediaV2(
        ctx as any,
        {
          type: 'file',
          localUri: picked.uri,
          filename: picked.name || undefined,
          mimeType: picked.mimeType || 'application/octet-stream',
          size: picked.size,
        },
        { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
      );
      if (!fOut.ok) Alert.alert(t('파일', 'File', 'ファイル', '文件'), formatChatUploadError(fOut.error || ''));
      else clearReply();
    } catch (e: any) {
      const emsg = String(e?.message || e || 'pick_file_failed');
      logAttach('attach.file.flow.fail', { roomId: room.id, action: 'file', success: false, errorMessage: emsg, error: emsg });
      logDm('composer.sendFile.fail', { currentUid: uid, roomId: room.id, error: emsg });
      yyChatFlow('ui.pickFile.error', { roomId: room.id, error: emsg });
      Alert.alert(t('파일 전송', 'File send', 'ファイル送信', '文件发送'), t('파일을 선택하거나 전송하지 못했습니다. 다시 시도해 주세요.', 'Could not select or send file. Please try again.', 'ファイルを選択または送信できませんでした。もう一度お試しください。', '无法选择或发送文件，请重试。'));
    }
  };

  const capturePhoto = async () => {
    if (ttlPolicy?.blocked) return;
    if (ttlPolicy?.allowImageUpload === false) {
      logTtl('blocked_action', { roomId: room.id, roomType: room.type, action: 'imageUpload', reason: 'image_upload_blocked' });
      return;
    }
    if (!galleryAllowed) {
      Alert.alert(
        t('사진', 'Photos', '写真', '图片'),
        t('이 방에서는 사진·동영상 전송이 제한되어 있습니다.', 'Photos and videos are restricted in this room.', 'このルームでは写真・動画の送信が制限されています。', '此房间限制发送图片与视频。')
      );
      return;
    }
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert(t('카메라', 'Camera', 'カメラ', '相机'), t('사진을 찍으려면 카메라 권한이 필요합니다.', 'Camera permission is required to take photos.', '写真撮影にはカメラ権限が必要です。', '拍照需要相机权限。'));
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.88,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!a?.uri) return;
      yyChatFlow('ui.capturePhoto.ok', { roomId: room.id });
      setAttachOpen(false);
      const camFn = (await resolvePickerAssetDisplayName(a)) || `camera_${Date.now()}.jpg`;
      const camPhotoOut =       await sendMediaV2(
        ctx as any,
        {
          type: 'image',
          localUri: String(a.uri),
          filename: camFn,
          mimeType: (a as any).mimeType || 'image/jpeg',
          size: typeof (a as any)?.fileSize === 'number' ? Number((a as any).fileSize) : undefined,
          width: typeof (a as any)?.width === 'number' ? Number((a as any).width) : undefined,
          height: typeof (a as any)?.height === 'number' ? Number((a as any).height) : undefined,
        },
        { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
      );
      if (!camPhotoOut.ok) Alert.alert(t('사진', 'Photos', '写真', '图片'), formatChatUploadError(camPhotoOut.error || ''));
      else clearReply();
    } catch (e: any) {
      const emsg = String(e?.message || e || 'capture_photo_failed');
      logAttach('attach.camera.photo.fail', { roomId: room.id, action: 'photo', success: false, errorMessage: emsg, error: emsg });
      Alert.alert(t('사진 촬영', 'Take photo', '写真撮影', '拍照'), emsg);
    }
  };

  const captureVideo = async () => {
    if (ttlPolicy?.blocked) return;
    if (!galleryAllowed) {
      Alert.alert(
        t('동영상', 'Video', '動画', '视频'),
        t('이 방에서는 사진·동영상 전송이 제한되어 있습니다.', 'Photos and videos are restricted in this room.', 'このルームでは写真・動画の送信が制限されています。', '此房间限制发送图片与视频。')
      );
      return;
    }
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert(t('카메라', 'Camera', 'カメラ', '相机'), t('동영상을 녹화하려면 카메라 권한이 필요합니다.', 'Camera permission is required to record video.', '動画撮影にはカメラ権限が必要です。', '录制视频需要相机权限。'));
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 1,
        videoMaxDuration: 180,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!a?.uri) return;
      yyChatFlow('ui.captureVideo.ok', { roomId: room.id });
      setAttachOpen(false);
      const vidFn = (await resolvePickerAssetDisplayName(a)) || `video_${Date.now()}.mp4`;
      const camVideoOut =       await sendMediaV2(
        ctx as any,
        {
          type: 'video',
          localUri: String(a.uri),
          filename: vidFn,
          mimeType: (a as any).mimeType || 'video/mp4',
          size: typeof (a as any)?.fileSize === 'number' ? Number((a as any).fileSize) : undefined,
          width: typeof (a as any)?.width === 'number' ? Number((a as any).width) : undefined,
          height: typeof (a as any)?.height === 'number' ? Number((a as any).height) : undefined,
          durationMs: typeof (a as any)?.duration === 'number' ? Math.round(Number((a as any).duration) * 1000) : undefined,
        },
        { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
      );
      if (!camVideoOut.ok) Alert.alert(t('동영상', 'Video', '動画', '视频'), formatChatUploadError(camVideoOut.error || ''));
      else clearReply();
    } catch (e: any) {
      const emsg = String(e?.message || e || 'capture_video_failed');
      logAttach('attach.camera.video.fail', { roomId: room.id, action: 'video', success: false, errorMessage: emsg, error: emsg });
      Alert.alert(t('동영상 녹화', 'Video recording', '動画録画', '视频录制'), emsg);
    }
  };

  const sendMyLocation = async () => {
    if (ttlPolicy?.blocked) return;
    if (!composeAllowed) return;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('위치', 'Location', '位置情報', '位置'), t('내 위치를 보내려면 위치 권한을 허용해 주세요.', 'Allow location permission to send your location.', '現在地を送るには位置情報権限が必要です。', '发送我的位置需要开启定位权限。'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      yyChatFlow('ui.sendLocation.ok', { roomId: room.id, lat, lng });
      setAttachOpen(false);
      await sendLocationV2(ctx as any, { lat, lng });
      clearReply();
    } catch (e: any) {
      const emsg = String(e?.message || e || 'send_location_failed');
      yyChatFlow('ui.sendLocation.error', { roomId: room.id, error: emsg });
      Alert.alert(t('위치', 'Location', '位置情報', '位置'), formatChatUploadError(emsg));
    }
  };

  const openPoll = () => {
    if (!composeAllowed) return;
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollMulti(false);
    setAttachOpen(false);
    setPollOpen(true);
  };

  const sendPoll = async () => {
    if (ttlPolicy?.blocked) return;
    if (!composeAllowed) return;
    try {
      const question = String(pollQuestion || '').trim();
      const opts = pollOptions.map((s) => String(s || '').trim()).filter(Boolean);
      if (!question) return;
      if (opts.length < 2) return;
      const options = opts.map((text, idx) => ({ id: `op-${Date.now()}-${idx}`, text }));
      setPollOpen(false);
      const pollRes = await sendPollV2(
        ctx as any,
        { question, options, multi: pollMulti },
        { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
      );
      if (String(pollRes?.message?.status || '') === 'failed') {
        const err = String((pollRes.message as any)?.meta?.error || t('전송 실패', 'Send failed', '送信失敗', '发送失败'));
        Alert.alert(t('투표', 'Poll', '投票', '投票'), formatChatUploadError(err));
      } else {
        clearReply();
      }
    } catch (e: any) {
      const emsg = String(e?.message || e || 'send_poll_failed');
      logAttach('attach.poll.flow.fail', { roomId: room.id, action: 'poll', success: false, errorMessage: emsg, error: emsg });
      yyChatFlow('ui.sendPoll.error', { roomId: room.id, error: emsg });
    }
  };

  /** 갤러리/카메라에서 받은 QR 이미지 URI로: 이미지 전송 + 가능하면 QR 텍스트 메시지 */
  const sendQrFromImageUri = async (uri: string, fileName?: string, mimeType?: string) => {
    const u = String(uri || '').trim();
    if (!u) return;
    yyChatFlow('ui.sendQR.image', { roomId: room.id, uri: u.slice(0, 80) });
    setAttachOpen(false);

    const qrImgOut = await sendMediaV2(
      ctx as any,
      {
        type: 'image',
        localUri: u,
        filename: fileName || undefined,
        mimeType: mimeType || 'image/jpeg',
      },
      { upsertLocal: (rid, msg) => upsertLocal(rid, msg) }
    );
    if (!qrImgOut.ok) {
      Alert.alert(t('사진', 'Photos', '写真', '图片'), formatChatUploadError(qrImgOut.error || ''));
      return;
    }
    clearReply();

    const primaryPath = await copyToScannablePathIfNeeded(u);
    let detected = await decodeQrFromLocalPath(primaryPath);
    if (!detected && qrImgOut.remoteUrl) {
      const https = String(qrImgOut.remoteUrl || '').trim();
      if (/^https?:\/\//i.test(https)) {
        try {
          const FS = require('expo-file-system/legacy');
          if (FS?.cacheDirectory) {
            const dest = `${FS.cacheDirectory}yy_qr_dl_${Date.now()}.bin`;
            const dl = await FS.downloadAsync(https, dest);
            const localUri = String(dl?.uri || '').trim();
            if (localUri) detected = await decodeQrFromLocalPath(localUri);
          }
        } catch {}
      }
    }
    yyChatFlow('ui.sendQR.detected', { roomId: room.id, detectedLen: detected.length, triedRemote: !!qrImgOut.remoteUrl });
    if (detected) {
      const rawDetected = String(detected).replace(/\0/g, '').trim();
      const urlNorm = /^https?:\/\//i.test(rawDetected)
        ? rawDetected
        : /^www\./i.test(rawDetected)
          ? `https://${rawDetected}`
          : null;

      const imgId = String(qrImgOut.messageId || '').trim();
      let patchOk = false;
      try {
        await patchRoomMessageQrDecodedV2(ctx.firestore as any, room.id, imgId, rawDetected);
        const prev = useChatV2Store.getState().roomMessages[room.id]?.byId[imgId];
        patchMessage(room.id, imgId, {
          text: rawDetected,
          meta: { ...(prev?.meta || {}), qrDecodedText: rawDetected },
        });
        patchOk = true;
      } catch (ePatch: any) {
        yyChatFlow('ui.sendQR.patch.fail', { roomId: room.id, messageId: imgId, error: String(ePatch?.message || ePatch || '') });
      }

      const sendQrFallback = async () => {
        const qrTxtRes = await sendQrV2(ctx as any, { raw: rawDetected }, { upsertLocal: (rid, msg) => upsertLocal(rid, msg) });
        if (String(qrTxtRes?.message?.status || '') === 'failed') {
          const failedQrId = String(qrTxtRes?.message?.id || '');
          try {
            const textRes = await sendTextOptimisticV2(ctx as any, rawDetected, {
              upsertLocal: (rid, msg) => upsertLocal(rid, msg),
            });
            if (String(textRes?.message?.status || '') !== 'failed' && failedQrId) {
              removeMessage(room.id, failedQrId);
            } else if (String(textRes?.message?.status || '') === 'failed') {
              const err = String((textRes.message as any)?.meta?.error || (qrTxtRes.message as any)?.meta?.error || 'QR 텍스트 전송 실패');
              Alert.alert('QR', formatChatUploadError(err));
            }
          } catch (e2: any) {
            const err = String((qrTxtRes.message as any)?.meta?.error || e2?.message || 'QR 텍스트 전송 실패');
            Alert.alert('QR', formatChatUploadError(err));
          }
        }
      };

      if (urlNorm) {
        try {
          await sendLinkV2(ctx as any, { url: urlNorm });
          yyChatFlow('ui.sendQR.url.message.ok', { roomId: room.id, urlLen: urlNorm.length });
        } catch (eLink: any) {
          yyChatFlow('ui.sendQR.url.message.fail', { roomId: room.id, error: String(eLink?.message || eLink || '') });
          await sendQrFallback();
        }
      } else if (!patchOk) {
        await sendQrFallback();
      }
    }
  };

  const sendQR = async () => {
    if (ttlPolicy?.blocked) return;
    if (!galleryAllowed) {
      Alert.alert(
        t('QR 이미지', 'QR image', 'QR画像', '二维码图片'),
        t('이 방에서는 사진·동영상 전송이 제한되어 있습니다.', 'Photos and videos are restricted in this room.', 'このルームでは写真・動画の送信が制限されています。', '此房间限制发送图片与视频。')
      );
      return;
    }
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!a?.uri) return;
      const qrFn = await resolvePickerAssetDisplayName(a);
      await sendQrFromImageUri(String(a.uri), qrFn || undefined, (a as any).mimeType || 'image/jpeg');
    } catch (e: any) {
      const emsg = String(e?.message || e || 'send_qr_failed');
      logAttach('attach.qr.flow.fail', { roomId: room.id, action: 'qr', success: false, errorMessage: emsg, error: emsg });
      yyChatFlow('ui.sendQR.error', { roomId: room.id, error: emsg });
      Alert.alert(t('QR 이미지', 'QR image', 'QR画像', '二维码图片'), t('갤러리에서 선택하지 못했습니다. 다시 시도해 주세요.', 'Could not select from gallery. Please try again.', 'ギャラリーから選択できませんでした。もう一度お試しください。', '无法从相册选择，请重试。'));
    }
  };

  const captureQRPhoto = async () => {
    if (ttlPolicy?.blocked) return;
    if (ttlPolicy?.allowImageUpload === false) return;
    if (!galleryAllowed) return;
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert(t('카메라', 'Camera', 'カメラ', '相机'), t('QR을 촬영하려면 카메라 권한이 필요합니다.', 'Camera permission is required to capture QR.', 'QR撮影にはカメラ権限が必要です。', '拍摄二维码需要相机权限。'));
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.92,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const a = res.assets[0];
      const qrCamFn = (await resolvePickerAssetDisplayName(a)) || `qr_${Date.now()}.jpg`;
      await sendQrFromImageUri(String(a.uri), qrCamFn, (a as any).mimeType || 'image/jpeg');
    } catch (e: any) {
      const emsg = String(e?.message || e || 'capture_qr_failed');
      logAttach('attach.qr.camera.fail', { roomId: room.id, action: 'qr', success: false, errorMessage: emsg, error: emsg });
      Alert.alert(t('QR 촬영', 'QR capture', 'QR撮影', '二维码拍摄'), emsg);
    }
  };

  // Android: 시스템 내비/창 리사이즈와 겹쳐 보이는 하단 여백(x) 제거 — iOS만 safe area 반영
  const composerPadBottom = Platform.OS === 'ios' ? Math.max(8, Number(insets.bottom || 0) + 2) : 6;

  /** 첨부 시트: 6개 메뉴 + 최근사진이 잘리지 않도록 최대 높이 + 하단 safe area */
  const attachSheetMaxH = useMemo(() => {
    const h = Dimensions.get('window').height;
    return Math.min(h * 0.78, h - (insets.top || 0) - 24);
  }, [insets.top]);
  const attachSheetBottomPad = Math.max(16, Number(insets.bottom || 0) + 12);

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: '#1E1E1E',
        backgroundColor: '#0C0C0C',
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: composerPadBottom,
      }}
    >
      {/* Kakao-like bottom sheet attachment menu */}
      <Modal visible={attachOpen} transparent animationType="none" onRequestClose={closeAttach}>
        <TouchableOpacity activeOpacity={1} onPress={closeAttach} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ flex: 1 }} />
          <Animated.View
            onLayout={(e) => {
              try {
                const h = Number(e.nativeEvent?.layout?.height || 0);
                if (h > 0) sheetHRef.current = Math.min(620, Math.max(220, h));
              } catch {}
            }}
            style={{
              transform: [{ translateY: Animated.add(sheetY, sheetDragY) }],
              backgroundColor: '#0F0F0F',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderWidth: 1,
              borderColor: '#2A2A2A',
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 0,
              maxHeight: attachSheetMaxH,
            }}
          >
            <ScrollView
              style={{ maxHeight: attachSheetMaxH }}
              contentContainerStyle={{ paddingBottom: attachSheetBottomPad }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              bounces={false}
              nestedScrollEnabled
            >
              <View {...panResponder.panHandlers} style={{ paddingBottom: 6 }}>
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: '#5A5A5A' }} />
                </View>
                <Text style={{ color: '#EEE', fontWeight: '900', marginBottom: 8 }}>{t('첨부', 'Attachments', '添付', '附件')}</Text>
              </View>
              <View style={{ borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, backgroundColor: '#111', padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#AAA', fontSize: 12, fontWeight: '800', marginBottom: 8 }}>{t('사진·동영상', 'Photos · Videos', '写真・動画', '图片·视频')}</Text>
                <Text style={{ color: '#666', fontSize: 11, marginBottom: 8 }}>
                  {t('갤러리 전체 접근 없이 시스템 선택창에서만 고릅니다.', 'Use system picker without full gallery access.', 'ギャラリー全体アクセスなしでシステム選択のみ使用します。', '无需完整相册权限，仅使用系统选择器。')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
                  <TouchableOpacity
                    onPress={pickImage}
                    activeOpacity={0.85}
                    style={{ width: 66, height: 66, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
                  >
                    <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{t('앨범', 'Album', 'アルバム', '相册')}{'\n'}{t('사진', 'Photo', '写真', '照片')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={capturePhoto}
                    activeOpacity={0.85}
                    style={{ width: 66, height: 66, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
                  >
                    <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{t('카메라', 'Camera', 'カメラ', '相机')}{'\n'}{t('사진', 'Photo', '写真', '照片')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={captureVideo}
                    activeOpacity={0.85}
                    style={{ width: 66, height: 66, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
                  >
                    <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{t('카메라', 'Camera', 'カメラ', '相机')}{'\n'}{t('동영상', 'Video', '動画', '视频')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              <View style={{ borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, backgroundColor: '#111', overflow: 'hidden' }}>
                {[
                  {
                    k: 'photo',
                    label: t('사진(앨범)', 'Photo (album)', '写真（アルバム）', '照片（相册）'),
                    icon: '🖼',
                    onPress: pickImage,
                    disabled: ttlPolicy?.allowImageUpload === false || !galleryAllowed,
                  },
                  { k: 'video', label: t('동영상(앨범)', 'Video (album)', '動画（アルバム）', '视频（相册）'), icon: '🎬', onPress: pickVideo, disabled: !galleryAllowed },
                  {
                    k: 'voice',
                    label: t('음성 메시지', 'Voice message', '音声メッセージ', '语音消息'),
                    icon: '🎤',
                    onPress: openVoiceModal,
                    disabled: ttlPolicy?.blocked || !fileAllowed,
                  },
                  { k: 'file', label: t('파일', 'File', 'ファイル', '文件'), icon: '📎', onPress: pickFile, disabled: !fileAllowed },
                  { k: 'loc', label: t('위치', 'Location', '位置情報', '位置'), icon: '📍', onPress: sendMyLocation, disabled: !composeAllowed },
                  { k: 'qr', label: t('QR이미지', 'QR image', 'QR画像', '二维码图片'), icon: '▦', onPress: sendQR, disabled: !galleryAllowed },
                  { k: 'poll', label: t('투표하기', 'Create poll', '投票作成', '创建投票'), icon: '☑', onPress: openPoll, disabled: !composeAllowed },
                ].map((it, idx, arr) => (
                  <TouchableOpacity
                    key={it.k}
                    onPress={it.disabled ? undefined : it.onPress}
                    disabled={!!it.disabled}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 13,
                      borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                      borderBottomColor: '#232323',
                      opacity: it.disabled ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 17, width: 26 }}>{it.icon}</Text>
                    <Text style={{ color: '#EEE', fontWeight: '800', marginLeft: 8 }}>{it.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Poll create modal (old chat parity) */}
      <Modal visible={pollOpen} transparent animationType="fade" onRequestClose={() => setPollOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setPollOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <TouchableOpacity activeOpacity={1} style={{ width: '100%', maxWidth: 360, backgroundColor: '#0F0F0F', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#F6F6F6', fontWeight: '900', fontSize: 16, marginBottom: 8 }}>{t('투표 만들기', 'Create poll', '投票を作成', '创建投票')}</Text>
            <Text style={{ color: '#AAA', marginTop: 6 }}>{t('질문', 'Question', '質問', '问题')}</Text>
            <TextInput
              value={pollQuestion}
              onChangeText={setPollQuestion}
              placeholder={t('질문을 입력하세요', 'Enter question', '質問を入力', '输入问题')}
              placeholderTextColor="#666"
              style={{ marginTop: 6, borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, color: '#EEE', backgroundColor: '#0C0C0C', fontWeight: '800' }}
            />
            <Text style={{ color: '#AAA', marginTop: 12 }}>{t('항목(2~6)', 'Options (2~6)', '項目(2~6)', '选项(2~6)')}</Text>
            {pollOptions.map((opt, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <TextInput
                  value={opt}
                  onChangeText={(v) => setPollOptions((prev) => prev.map((s, i) => (i === idx ? v : s)))}
                  placeholder={`${t('항목', 'Option', '項目', '选项')} ${idx + 1}`}
                  placeholderTextColor="#666"
                  style={{ flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, color: '#EEE', backgroundColor: '#0C0C0C' }}
                />
                <TouchableOpacity
                  onPress={() => setPollOptions((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev))}
                  style={{ paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10 }}
                >
                  <Text style={{ color: '#AAA', fontWeight: '900' }}>−</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => setPollOptions((prev) => (prev.length < 6 ? [...prev, ''] : prev))}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10 }}
              >
                <Text style={{ color: '#CFCFCF', fontWeight: '900' }}>{t('항목 추가', 'Add option', '項目追加', '添加选项')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPollMulti((v) => !v)}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: pollMulti ? '#FFD700' : '#2A2A2A', borderRadius: 10 }}
              >
                <Text style={{ color: pollMulti ? '#FFD700' : '#CFCFCF', fontWeight: '900' }}>{t('복수 선택', 'Multiple choice', '複数選択', '多选')}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setPollOpen(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' }}>
                <Text style={{ color: '#AAA', fontWeight: '900' }}>{t('취소', 'Cancel', 'キャンセル', '取消')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sendPoll} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}>
                <Text style={{ color: '#FFD700', fontWeight: '900' }}>{t('보내기', 'Send', '送信', '发送')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 음성 메시지: 녹음 시작 → 전송 시 녹음 종료 + Storage 업로드 */}
      <Modal visible={voiceOpen} transparent animationType="fade" onRequestClose={closeVoiceModal}>
        <TouchableOpacity activeOpacity={1} onPress={closeVoiceModal} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ alignSelf: 'center', width: '100%', maxWidth: 340, backgroundColor: '#0F0F0F', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2A2A2A' }}>
            <Text style={{ color: '#EEE', fontWeight: '900', fontSize: 17, marginBottom: 8 }}>{t('음성 메시지', 'Voice message', '音声メッセージ', '语音消息')}</Text>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
              {t('마이크 권한이 필요합니다. 녹음 중에는 전송을 누르면 바로 보냅니다.', 'Microphone permission is required. While recording, press send to send immediately.', 'マイク権限が必要です。録音中に送信を押すとすぐ送れます。', '需要麦克风权限。录音中点击发送会立即发送。')}
            </Text>
            {!voiceRecording ? (
              <TouchableOpacity onPress={voiceStartRecord} style={{ paddingVertical: 14, backgroundColor: '#D4AF37', borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#0C0C0C', fontWeight: '900' }}>{t('녹음 시작', 'Start recording', '録音開始', '开始录音')}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={{ color: '#FFD700', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 14 }}>
                  {String(Math.floor(voiceSec / 60)).padStart(2, '0')}:{String(voiceSec % 60).padStart(2, '0')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={voiceCancel} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#444', alignItems: 'center' }}>
                    <Text style={{ color: '#AAA', fontWeight: '900' }}>{t('취소', 'Cancel', 'キャンセル', '取消')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={voiceSend} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}>
                    <Text style={{ color: '#FFD700', fontWeight: '900' }}>{t('전송', 'Send', '送信', '发送')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {!voiceRecording ? (
              <TouchableOpacity onPress={closeVoiceModal} style={{ marginTop: 14, alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: '#888', fontWeight: '800' }}>{t('닫기', 'Close', '閉じる', '关闭')}</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {replyTarget ? (
        <View
          style={{
            marginTop: 4,
            marginBottom: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#2A2A2A',
            backgroundColor: '#111',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {(() => {
            const rt = String(replyTarget.type || '');
            const thumb = String(replyTarget.thumbnailUrl || '').trim();
            const showSlot = !!thumb || ['image', 'video', 'file', 'audio'].includes(rt);
            if (!showSlot) return null;
            if (thumb && !isLikelyVideoStreamUri(thumb)) {
              return (
                <EImage
                  source={{ uri: thumb }}
                  style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: '#1A1A1A' }}
                  contentFit="cover"
                />
              );
            }
            if (thumb && isLikelyVideoStreamUri(thumb)) {
              return (
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
              );
            }
            if (rt === 'video') {
              return (
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
              );
            }
            if (rt === 'audio') {
              return (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: '#2A2A2A',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 15 }}>🎤</Text>
                </View>
              );
            }
            if (rt === 'file') {
              return (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: '#2A2A2A',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 15 }}>📎</Text>
                </View>
              );
            }
            return (
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
                <Text style={{ color: '#FFD700', fontSize: 9, fontWeight: '900' }}>IMG</Text>
              </View>
            );
          })()}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
              {replyTarget.senderName || t('답장', 'Reply', '返信', '回复')}
            </Text>
            <Text style={{ color: '#DDD', fontSize: 12 }} numberOfLines={2}>
              {formatReplySnapshotSubtitle(replyTarget)}
            </Text>
          </View>
          <TouchableOpacity onPress={clearReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: '#AAA', fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 }}>
        <TouchableOpacity
          onPress={ttlPolicy?.blocked || !composeAllowed ? undefined : openAttachSheet}
          disabled={!!ttlPolicy?.blocked || !composeAllowed}
          activeOpacity={0.85}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', opacity: ttlPolicy?.blocked || !composeAllowed ? 0.45 : 1 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: '#0C0C0C', fontWeight: '900', fontSize: 18 }}>＋</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 14, backgroundColor: '#111', paddingHorizontal: 10 }}>
          <TextInput
            value={draft}
            onChangeText={(t) => {
              setDraftText(room.id, t);
              try {
                const caret = selection?.end ?? String(t || '').length;
                const tok = detectMentionToken(t, caret);
                if (tok) {
                  lastMentionRef.current.tokenStart = tok.tokenStart;
                  lastMentionRef.current.tokenEnd = tok.tokenEnd;
                  setMentionQuery(tok.query);
                  setMentionOpen(true);
                  void refreshMentionRows(tok.query);
                } else if (mentionOpen) {
                  setMentionOpen(false);
                }
              } catch {}
            }}
            placeholder={
              ttlPolicy?.blocked
                ? t('TTL 만료됨', 'TTL expired', 'TTL期限切れ', 'TTL 已过期')
                : !composeAllowed
                  ? t('메시지를 보낼 권한이 없습니다.', 'No permission to send messages.', 'メッセージ送信権限がありません。', '无发送消息权限。')
                  : t('메시지 입력...', 'Type a message...', 'メッセージを入力...', '输入消息...')
            }
            placeholderTextColor="#777"
            multiline
            blurOnSubmit={false}
            editable={!ttlPolicy?.blocked && composeAllowed}
            returnKeyType="send"
            onSubmitEditing={() => { if (Platform.OS === 'ios') sendText(); }}
            onSelectionChange={(e) => {
              try {
                const sel = e?.nativeEvent?.selection;
                if (sel && typeof sel.start === 'number' && typeof sel.end === 'number') setSelection({ start: sel.start, end: sel.end });
              } catch {}
            }}
            onContentSizeChange={(e) => {
              try {
                const h = Math.min(120, Math.max(38, Math.ceil(e.nativeEvent?.contentSize?.height || 38)));
                setHeight(h);
              } catch {}
            }}
            style={{ color: '#EEE', fontSize, paddingVertical: 8, height }}
          />
        </View>
        <TouchableOpacity
          onPress={ttlPolicy?.blocked || !composeAllowed ? undefined : sendText}
          disabled={!!ttlPolicy?.blocked || !composeAllowed}
          activeOpacity={0.85}
          style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#D4AF37', minWidth: 56, alignItems: 'center', opacity: ttlPolicy?.blocked || !composeAllowed ? 0.45 : 1 }}
        >
          <Text style={{ color: '#0C0C0C', fontWeight: '900' }}>{t('전송', 'Send', '送信', '发送')}</Text>
        </TouchableOpacity>
      </View>

      {/* Mention picker */}
      <Modal visible={mentionOpen} transparent animationType="fade" onRequestClose={() => setMentionOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setMentionOpen(false)}>
          <Pressable
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 84,
              backgroundColor: '#0E1216',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#2B3A3F',
              paddingVertical: 8,
              maxHeight: 320,
            }}
            onPress={() => {}}
          >
            <Text style={{ color: '#9AB', fontSize: 12, fontWeight: '800', paddingHorizontal: 12, paddingBottom: 6 }}>
              @{mentionQuery || ''} · {t('멘션', 'Mention', 'メンション', '提及')}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {mentionRows.map((r) => (
                <TouchableOpacity
                  key={`m-${r.uid}`}
                  onPress={() => {
                    try {
                      const cur = String(draft || '');
                      const start = Math.max(0, lastMentionRef.current.tokenStart);
                      const end = Math.max(start, lastMentionRef.current.tokenEnd);
                      const before = cur.slice(0, start);
                      const after = cur.slice(end);
                      const ins = `@${r.name} `;
                      const next = before + ins + after;
                      setDraftText(room.id, next);
                      lastMentionRef.current.uids = Array.from(new Set([...(lastMentionRef.current.uids || []), r.uid]));
                    } catch {}
                    setMentionOpen(false);
                  }}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#162127' }}
                >
                  <Text style={{ color: '#EDEDED', fontWeight: '800' }} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={{ color: '#6B7A86', fontSize: 11 }} numberOfLines={1}>
                    {r.uid}
                  </Text>
                </TouchableOpacity>
              ))}
              {mentionRows.length === 0 ? (
                <View style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
                  <Text style={{ color: '#6B7A86' }}>{t('검색 결과 없음', 'No results', '結果なし', '无结果')}</Text>
                </View>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

