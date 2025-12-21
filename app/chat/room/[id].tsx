// @ts-nocheck
/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, Platform, ActionSheetIOS, Alert, Linking, ScrollView, Share, Image, Modal, Pressable, Animated, Easing, Dimensions, LayoutAnimation, UIManager, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firestore } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, orderBy, limit as fsLimit, onSnapshot, getDocs } from 'firebase/firestore';
import { getLinkPreview } from 'link-preview-js';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { firebaseAuth, ensureAuthedUid, ensureAppCheckReady, firebaseStorage } from '@/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useChatSettingsStore } from '@/src/features/chat/store/chat-settings.store';
import { useNotificationStore } from '@/src/features/chat/store/notification.store';
import { useFollowStore } from '@/src/features/chat/store/follow.store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { Image as EImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes, uploadString } from 'firebase/storage';
import { useForwardModalStore } from '@/src/features/chat/store/forward-modal.store';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { buildMapEmbedUrl as mediaBuildMapEmbedUrl, buildStaticMapUrl as mediaBuildStaticMapUrl, reverseGeocode as mediaReverseGeocode, detectType as mediaDetectType } from '@/src/features/chat/lib/media';
import ChatViewer from '@/src/features/chat/components/ChatViewer';
// ZXing 폴백(웹) - 존재 시 사용
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZXingLib: any = (()=>{ try { return require('@zxing/browser'); } catch { try { return require('@zxing/library'); } catch { return null; } } })();

const EMPTY: any[] = Object.freeze([]);

export default function KakaoStyleRoomScreen() {
  const { language } = usePreferences();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const roomId = String(params.id || '');
  const type = String(params.type || '');

  // 스토어 선택자 (불변 기본값 사용)
  const messages = useKakaoRoomsStore((s) => s.messages[roomId] ?? EMPTY);
  const room = useKakaoRoomsStore((s) => s.rooms.find((r) => r.id === roomId));
  const sendMessage = useKakaoRoomsStore((s) => s.sendMessage);
  const toggleReaction = useKakaoRoomsStore((s) => s.toggleReaction);
  const deleteMessage = useKakaoRoomsStore((s) => s.deleteMessage);
  const removeRooms = useKakaoRoomsStore((s) => s.removeRooms);
  const profilesAll = useChatProfileStore((s) => s.profiles || {});
  const currentProfileAll = useChatProfileStore((s) => s.currentProfile);

  const [text, setText] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  // 하단 여백: 상위 레이아웃이 이미 안전영역 패딩을 주므로, 키보드가 있을 때만 오프셋 적용
  const keyboardShown = keyboardOffset > 0;
  const bottomGap = keyboardShown ? keyboardOffset : 0;
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<{
    visible: boolean;
    imageUrl: string;
    text: string;
    kind: 'card' | 'pay' | 'invite' | 'text';
    data?: any;
  } | null>(null);
  const [reactionDetail, setReactionDetail] = useState<null | { messageId: string; groups: { emoji: string; users: { uid: string; name: string; avatar?: string }[] }[] }>(null);
  const [memberMenu, setMemberMenu] = useState<null | { uid: string; name: string; role: string }>(null);
  const [reportDialog, setReportDialog] = useState<{ uid: string; reason: string } | null>(null);
  const roomSettingsForMenu = useKakaoRoomsStore((s) => s.roomSettings[roomId]);
  const transferOwnership = useKakaoRoomsStore((s) => (s as any).transferOwnership);
  const setMemberRoleAct = useKakaoRoomsStore((s) => s.setMemberRole);
  const kickMemberAct = useKakaoRoomsStore((s) => s.kickMember);
  const createRoomAct = useKakaoRoomsStore((s) => s.createRoom);
  const followAct = useFollowStore((s) => s.follow);

  // Screenshot detect (native) for TTL rooms: alert + optional watermark
  const [screenshotTick, setScreenshotTick] = useState(0);
  useEffect(() => {
    const isTtl = String((useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type) === 'ttl';
    const settings = (useKakaoRoomsStore as any).getState().roomSettings?.[roomId] || {};
    const wantAlert = isTtl && !!(settings?.ttl?.screenshotAlert);
    if (!wantAlert) return;
    let sub: any = null;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ScreenCapture = require('expo-screen-capture');
        if (ScreenCapture?.addScreenshotListener) {
          sub = ScreenCapture.addScreenshotListener(() => {
            setScreenshotTick(Date.now());
            try { Alert.alert('보안', '스크린샷이 감지되었습니다. 이 방의 캡쳐는 제한됩니다.'); } catch {}
          });
        }
      } catch {}
    })();
    return () => { try { sub?.remove?.(); } catch {} };
  }, [roomId]);

  // TTL 방: 캡쳐 차단(방장 설정에 따라 허용/차단)
  useEffect(() => {
    const isTtl = String((useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type) === 'ttl';
    const allowCapture = !!(roomSettingsForMenu?.ttl?.allowCapture);
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ScreenCapture = require('expo-screen-capture');
        if (!isTtl) {
          await ScreenCapture.allowScreenCaptureAsync?.().catch(()=>{});
          return;
        }
        if (allowCapture) {
          await ScreenCapture.allowScreenCaptureAsync?.().catch(()=>{});
        } else {
          await ScreenCapture.preventScreenCaptureAsync?.().catch(()=>{});
        }
      } catch {}
    })();
    return () => {
      try {
        // 방 나갈 때는 원복
        const ScreenCapture = require('expo-screen-capture');
        ScreenCapture.allowScreenCaptureAsync?.().catch(()=>{});
      } catch {}
    };
  }, [roomId, roomSettingsForMenu?.ttl?.allowCapture]);
  // 미디어 원본 파일명 캐시(대화 버블에서 즉시 표시)
  const [mediaNameCache, setMediaNameCache] = useState<Record<string, string>>({});
  const ensureMediaNameChat = useCallback(async (raw: string) => {
    try {
      const normalize = (s: string) => { try { const u=new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { return String(s||''); } };
      const key = normalize(raw);
      if (!key) return;
      if (mediaNameCache[key]) return;
      // 1) 로컬 캐시(프로필 뷰어가 저장한 키)
      try { const c = await AsyncStorage.getItem(`media.name:${key}`); if (c) { setMediaNameCache((p)=>({ ...p, [key]: c })); return; } } catch {}
      // 2) 업로드 시점에 기록한 사용자 메타 맵에서 찾기
      try {
        const uid = firebaseAuth.currentUser?.uid || 'anonymous';
        const metaKey = `u:${uid}:chat.media.meta`;
        const rawM = await AsyncStorage.getItem(metaKey);
        const m = rawM ? JSON.parse(rawM) : {};
        const direct = m[key]?.name;
        const viaResolved = Object.values(m as any).find((v: any) => String(v?.resolved||'') === key)?.['name'];
        const nm = String(direct || viaResolved || '').trim();
        if (nm) { setMediaNameCache((p)=>({ ...p, [key]: nm })); try { await AsyncStorage.setItem(`media.name:${key}`, nm); } catch {} return; }
      } catch {}
      // 3) URL에서 유추(최후 보조)
      try { const u = new URL(key); const guess = decodeURIComponent(u.pathname.split('/').pop()||''); if (guess) setMediaNameCache((p)=>({ ...p, [key]: guess })); } catch {}
    } catch {}
  }, [mediaNameCache]);

  // 카메라 스캔 진입(웹캠/모바일 카메라 실시간 스캔 화면으로 이동)
  const handleCameraScan = useCallback(() => {
    try {
      const target = `/chat/add-friend-qr?from=room&roomId=${encodeURIComponent(roomId)}`;
      router.push(target as any);
    } catch {}
  }, [roomId]);

  // QR 텍스트 파서들
  const parseCardFromText = useCallback((text: string) => {
    try {
      if (/yooy:\/\/card\?d=/i.test(text)) {
        const m = text.match(/yooy:\/\/card\?d=([^&]+)/i);
        if (m && m[1]) {
          const json = decodeURIComponent(atob(m[1]));
          return JSON.parse(json);
        }
      }
      if (/yooy:\/\/card\?j=/i.test(text)) {
        const m = text.match(/yooy:\/\/card\?j=([^&]+)/i);
        if (m && m[1]) {
          const json = decodeURIComponent(m[1]);
          return JSON.parse(json);
        }
      }
    } catch {}
    return null;
  }, []);

  const parsePayFromText = useCallback((data: string) => {
    try {
      const url = new URL(data);
      if (url.protocol !== 'yooy:') return null;
      if (!/\/\/pay/i.test(url.pathname)) return null;
      const addr = url.searchParams.get('addr') || '';
      const sym = url.searchParams.get('sym') || '';
      const amt = url.searchParams.get('amt') || '';
      return { addr, sym, amt };
    } catch { return null; }
  }, []);

  const parseInviteFromText = useCallback((text: string) => {
    try {
      if (/yooy:\/\/share\?room=/i.test(text)) {
        const u = new URL(text.replace('yooy://', 'https://yooy.land/'));
        const room = u.searchParams.get('room') || '';
        return { roomId: room };
      }
      if (/\/chat\/room\//i.test(text)) {
        const id = text.split('/chat/room/')[1]?.split(/[?#]/)[0];
        if (id) return { roomId: id };
      }
    } catch {}
    return null;
  }, []);

  const parseQrKind = useCallback((text: string): { kind: 'card'|'pay'|'invite'|'text'; data?: any } => {
    const card = parseCardFromText(text);
    if (card) return { kind: 'card', data: card };
    const pay = parsePayFromText(text);
    if (pay) return { kind: 'pay', data: pay };
    const inv = parseInviteFromText(text);
    if (inv) return { kind: 'invite', data: inv };
    return { kind: 'text', data: { text } };
  }, [parseCardFromText, parsePayFromText, parseInviteFromText]);
  const [inputHeight, setInputHeight] = useState(56);
  const inputFocusedRef = useRef(false);
  const [wrapHeight, setWrapHeight] = useState<number | null>(null);
  const listRef = useRef<FlatList<any> | null>(null);
  const atBottomRef = useRef(false);
  const lockAtBottomRef = useRef(true);
  // TTL 남은 시간 포맷터
  const formatTtl = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d)}:${pad(h)}:${pad(m)}:${pad(ss)}`;
  };
  // TTL 헤더(부모 리렌더 없이 자체적으로만 갱신)
  const TTLHeader = memo(function TTLHeader({ expiresAt }: { expiresAt: number }) {
    const [remain, setRemain] = useState<number>(Math.max(0, (expiresAt || 0) - Date.now()));
    useEffect(() => {
      // 1초마다 강제 업데이트 대신 시계가 화면에 보일 때만 갱신
      let raf: any; let iv: any;
      const start = () => { iv = setInterval(() => setRemain(Math.max(0, (expiresAt || 0) - Date.now())), 1000); };
      start();
      return () => clearInterval(iv);
    }, [expiresAt]);
    return (
      <View style={{ paddingHorizontal: 12, paddingTop: 8, alignItems: 'center', justifyContent: 'center' }}>
            {(() => {
          const totalSec = Math.floor(remain / 1000);
          const d = Math.floor(totalSec / 86400);
          const h = Math.floor((totalSec % 86400) / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          const pad = (n: number) => String(n).padStart(2, '0');
          const text = `[${pad(d)}] ${pad(h)}:${pad(m)}:${pad(s)}`;
              return (
                <Text style={{
              color: remain <= 24*60*60*1000 ? '#FF3B30' : '#00A3FF',
              fontWeight: '900',
                  letterSpacing: 2,
              fontSize: 22,
              textAlign: 'center',
            }}>
              {text}
                </Text>
              );
            })()}
                </View>
              );
  });
  const [returnTo, setReturnTo] = useState<{ id: string; preview: string } | null>(null);

  // 최초 1회만 초기 스크롤 제어: 항상 최신으로 이동
  const didInitRef = useRef(false);
  const initTargetRef = useRef<'end' | null>('end');

  // 웹 이미지 CORS 회피용 프록시
  const proxiedImageUrl = useCallback((u: string) => {
    try {
      if (!u) return u;
      // 미리보기/QR 업로드 등: 데이터/블롭 URL과 신뢰 도메인은 원본 사용
      if (/^(data|blob):/i.test(u)) return u;
      const isWhitelisted = /^https?:\/\/((?:.+\.)?yooyland\.com|firebasestorage\.googleapis\.com|chart\.googleapis\.com|maps\.googleapis\.com|staticmap\.openstreetmap\.de|(?:i\.)?ytimg\.com|img\.youtube\.com|ytimg\.com|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)/i.test(u);
      if (Platform.OS === 'web' && /^https?:/i.test(u) && !isWhitelisted) {
        const api = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || 'http://localhost:8080/api/link-preview';
        const root = String(api).replace(/\/?api\/link-preview$/, '');
        return `${root}/api/img?src=${encodeURIComponent(u)}`;
      }
      return u;
    } catch { return u; }
  }, []);

  // 방에 들어와 있는 동안은 클릭 여부와 무관하게 모두 읽음 처리
  useEffect(() => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      useKakaoRoomsStore.getState().markRead(roomId, uid);
    } catch {}
  }, [roomId]);

  // URL로 직접 접근 시(로컬에 방 정보가 없을 때) 공개/공지 방은 자동 합류 및 로컬 등록
  useEffect(() => {
    let alive = true;
    const ensureRoomLoaded = async () => {
      try {
        if (!roomId) return;
        // Ensure authenticated (anonymous allowed) before any writes/reads
        try { if (!firebaseAuth.currentUser) { await signInAnonymously(firebaseAuth).catch(()=>{}); } } catch {}
        const ref = doc(firestore, 'rooms', roomId);
        let data: any = null;
        const uid = firebaseAuth.currentUser?.uid || 'me';

        // 1) 선제적으로 공지/공개 속성 강제(없으면 생성, merge)
        try {
          if (String(type) === 'notice') {
            await setDoc(ref, { type: 'notice', isPublic: true, updatedAt: serverTimestamp() } as any, { merge: true }).catch(()=>{});
          }
        } catch {}

        // 2) 멤버십 기록을 먼저 시도(비공개 방도 멤버면 읽기 허용 규칙이므로 선행)
        try {
          const memberRef = doc(firestore, 'rooms', roomId, 'members', uid);
          const userRoomRef = doc(firestore, 'users', uid, 'joinedRooms', roomId);
          void setDoc(memberRef, { joinedAt: serverTimestamp() }, { merge: true });
          void setDoc(userRoomRef, { joinedAt: serverTimestamp() }, { merge: true });
          void setDoc(ref, { updatedAt: serverTimestamp() } as any, { merge: true }).catch(()=>{});
        } catch {}

        // 3) 방 문서 읽기 시도(공지/공개가 되었다면 read 가능)
        try {
          const snap = await getDoc(ref);
          data = snap.exists() ? (snap.data() as any) : null;
        } catch {}

        // 공지/공개 방만 자동 합류 허용 (URL 파라미터로 notice가 온 경우도 허용)
        const isPublic = (String(type) === 'notice') || (data?.isPublic === true) || (String(data?.type) === 'notice');
        if (!isPublic) return; // 비공개일 때는 멤버십만 기록하고 로컬 등록은 생략
        // 로컬 등록(없을 때만)
        try {
          const existsLocal = !!((useKakaoRoomsStore as any).getState().rooms || []).find((r:any)=> String(r.id)===roomId);
          if (!existsLocal) {
            useKakaoRoomsStore.setState((s:any)=>({ rooms: [{ id: roomId, title: (data&&data.title)||'채팅방', members:[uid], unreadCount:0, lastMessageAt: (data&&data.lastActiveAt)||Date.now(), type: (data&&data.type)||type||'group', expiresAt: data?.expiresAt, messageTtlMs: data?.messageTtlMs }, ...(s.rooms||[]) ] }));
          }
        } catch {}
        // 사용자 참여 기록에 타이틀 보강(읽기 성공 시)
        try {
          if (data && data.title) {
            const userRoomRef = doc(firestore, 'users', uid, 'joinedRooms', roomId);
            await setDoc(userRoomRef, { title: data.title }, { merge: true });
          }
        } catch {}
      } catch {}
    };
    ensureRoomLoaded();
    return () => { alive = false; };
  }, [roomId, type]);
  // 실시간 메시지 구독: Firestore rooms/{id}/messages
  useEffect(() => {
    if (!roomId) return;
    let stopped = false;
    const ref = collection(firestore, 'rooms', roomId, 'messages');
    const q = query(ref, orderBy('createdAt', 'asc'), fsLimit(500));
    const toList = (snap:any) => {
      try {
        const docs = Array.isArray(snap?.docs) ? snap.docs : [];
        const prevList = (() => { try { return (useKakaoRoomsStore as any).getState().messages?.[roomId] || []; } catch { return []; } })();
        const list = docs.map((d:any) => {
          try {
            const v:any = (typeof d.data === 'function' ? d.data() : (d.data || {})) || {};
            const ts:any = v.createdAt;
            let createdAt:number;
            if (ts && typeof ts.toMillis === 'function') {
              createdAt = ts.toMillis();
            } else if (ts && typeof ts.seconds === 'number') {
              createdAt = (ts.seconds * 1000) + Math.floor((ts.nanoseconds || 0) / 1e6);
            } else if (typeof ts === 'number') {
              createdAt = ts;
            } else {
              createdAt = Date.now();
            }
            // 업로드 치환 지연 시 사라짐 방지: 같은 id의 기존 로컬 메시지에서 이미지/앨범 URL을 보존
            const prev = prevList.find((m:any) => m.id === d.id) || null;
            const resolvedImageUrl = ((): string | undefined => {
              try {
                const fromRemote = v.imageUrl;
                if (fromRemote) return fromRemote;
                const fromPrev = prev?.imageUrl;
                if (fromPrev) return fromPrev;
              } catch {}
              return undefined;
            })();
            const resolvedAlbumUrls = ((): string[] | undefined => {
              try {
                const arr = Array.isArray(v.albumUrls) ? v.albumUrls : [];
                if (arr.length) return arr;
                const arrPrev = Array.isArray(prev?.albumUrls) ? prev?.albumUrls : [];
                if (arrPrev.length) return arrPrev;
              } catch {}
              return undefined;
            })();
            const nextMsg = {
              id: d.id,
              roomId,
              senderId: v.senderId || v.userId || 'unknown',
              content: String(v.content || ''),
              type: v.type || 'text',
              imageUrl: resolvedImageUrl,
              albumUrls: resolvedAlbumUrls,
              replyToId: v.replyToId,
              createdAt,
              reactionsByUser: v.reactionsByUser || {},
              reactionsCount: v.reactionsCount || {},
            } as any;
            // 변경 없음이면 기존 객체를 재사용하여 불필요한 리렌더 및 깜빡임 방지
            try {
              if (prev) {
                const shallowEqualObj = (a: any, b: any) => {
                  const ak = Object.keys(a||{}); const bk = Object.keys(b||{});
                  if (ak.length !== bk.length) return false; for (const k of ak) { if (a[k] !== b[k]) return false; }
                  return true;
                };
                const shallowEqualArr = (a?: any[], b?: any[]) => {
                  const aa = Array.isArray(a) ? a : []; const bb = Array.isArray(b) ? b : [];
                  if (aa.length !== bb.length) return false; for (let i=0;i<aa.length;i++){ if (aa[i] !== bb[i]) return false; }
                  return true;
                };
                const same = (
                  prev.roomId === nextMsg.roomId &&
                  prev.senderId === nextMsg.senderId &&
                  prev.content === nextMsg.content &&
                  prev.type === nextMsg.type &&
                  prev.imageUrl === nextMsg.imageUrl &&
                  shallowEqualArr(prev.albumUrls, nextMsg.albumUrls) &&
                  prev.replyToId === nextMsg.replyToId &&
                  prev.createdAt === nextMsg.createdAt &&
                  shallowEqualObj(prev.reactionsByUser||{}, nextMsg.reactionsByUser||{}) &&
                  shallowEqualObj(prev.reactionsCount||{}, nextMsg.reactionsCount||{})
                );
                if (same) return prev;
              }
            } catch {}
            return nextMsg;
          } catch { return null; }
        }).filter(Boolean);
        // 원격 스냅샷이 도착하는 동안 로컬 낙관적 메시지(특히 이미지/앨범)가 사라지는 현상 방지:
        // 직전에 보낸 내 메시지 중, 아직 원격에 동일 id가 없는 최근 항목을 병합 보존한다.
        try {
          const me = firebaseAuth.currentUser?.uid || 'me';
          const remoteIds = new Set(list.map((m:any) => m.id));
          const pendings = (prevList || []).filter((m:any) => {
            try {
              if (remoteIds.has(m.id)) return false;
              if (String(m.senderId||'') !== me) return false;
              const ageMs = Date.now() - Number(m.createdAt || 0);
              if (ageMs > 2 * 60 * 1000) return false; // 2분 초과 보류 항목은 제외
              const t = String(m.type || '');
              if (t === 'image' || t === 'album') return true;
              if (m?.imageUrl && /^(blob:|data:)/i.test(String(m.imageUrl))) return true;
              return false;
            } catch { return false; }
          });
          const merged = [...list, ...pendings];
          merged.sort((a:any, b:any) => Number(a?.createdAt||0) - Number(b?.createdAt||0));
          useKakaoRoomsStore.setState((s:any) => ({ messages: { ...(s.messages||{}), [roomId]: merged } }));
          // 안읽음 계산 후 스토어/서버 동기화
          try {
            const uid = me;
            const unread = merged.filter((m:any) => !(Array.isArray(m?.readBy) && m.readBy.includes(uid))).length;
            useKakaoRoomsStore.getState().setUnreadCount(roomId, unread);
            if (unread === 0) {
              const mref = doc(firestore, 'rooms', roomId, 'members', uid);
              void setDoc(mref, { unread: 0, lastReadAt: serverTimestamp() } as any, { merge: true });
            }
          } catch {}
        } catch {
          useKakaoRoomsStore.setState((s:any) => ({ messages: { ...(s.messages||{}), [roomId]: list } }));
        }
      } catch (e) {
        console.warn('[messages:toList:error]', (e as any)?.message || e);
      }
    };
    // 실시간 구독 + 폴백 폴링
    let unsub: any = null;
    try {
      unsub = onSnapshot(q, toList, async (err) => {
        const msg = String(err?.message || err || '');
        if (/Missing or insufficient permissions/i.test(msg)) {
          // 권한 부족 시: 멤버십을 보강하고 다시 한 번 폴링으로 읽어온다
          try {
            const uid = firebaseAuth.currentUser?.uid || 'me';
            const memberRef = doc(firestore, 'rooms', roomId, 'members', uid);
            await setDoc(memberRef, { joinedAt: serverTimestamp() }, { merge: true });
          } catch {}
          try { const snap = await getDocs(q); if (!stopped) toList(snap); } catch {}
        } else {
          console.warn('[messages:onSnapshot:error]', msg);
        }
      });
    } catch (e) {
      console.warn('[messages:onSnapshot:init:error]', (e as any)?.message || e);
    }
    // 폴백: 5초마다 폴링(권한/네트워크 이슈 대비)
    const tick = async () => {
      try { const snap = await getDocs(q); if (!stopped) toList(snap); } catch {}
    };
    const timer = setInterval(tick, 5000);
    void tick();
    return () => { stopped = true; try { if (unsub) unsub(); } catch {}; clearInterval(timer); };
  }, [roomId]);

  // 새 메시지가 추가될 때도 자동 읽음 처리
  useEffect(() => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      useKakaoRoomsStore.getState().markRead(roomId, uid);
    } catch {}
  }, [messages.length, roomId]);

  // 키보드 오버랩 회피
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      try {
        // 안드로이드 일부 기기에서 endCoordinates.height는 이미 내비게이션 바를 제외한 순수 키보드 높이
        // insets.bottom을 빼면 부족해져 입력창이 가려질 수 있으므로 그대로 사용
        const h = Math.max(0, (e?.endCoordinates?.height || 0));
        setKeyboardOffset(h);
        setTimeout(() => { try { listRef.current?.scrollToEnd?.({ animated: true }); } catch {} }, 20);
      } catch {}
    };
    const onHide = () => setKeyboardOffset(0);
    const sub1 = Keyboard.addListener(showEvt as any, onShow);
    const sub2 = Keyboard.addListener(hideEvt as any, onHide);
    return () => { try { sub1.remove(); } catch {}; try { sub2.remove(); } catch {}; };
  }, [insets.bottom]);

  // 하단 진입 1회 보정
  useEffect(() => {
    if (didInitRef.current) return;
    const go = () => { try { listRef.current?.scrollToEnd?.({ animated: false }); } catch {} };
    requestAnimationFrame(go);
    setTimeout(go, 40);
    setTimeout(go, 120);
    didInitRef.current = true;
    atBottomRef.current = true;
    lockAtBottomRef.current = true;
  }, []);

  // 뒤로가기로 나갔다가 다시 들어왔을 때 항상 최신 메시지로 이동
  useFocusEffect(useCallback(() => { lockAtBottomRef.current = true; scrollToBottom(true); setTimeout(() => scrollToBottom(true), 80); }, [roomId]));

  // TTL 방: 만료 시 자동 종료 및 목록으로 이동
  useEffect(() => {
    try {
      const expiresAt = Number(room?.expiresAt || 0);
      const isTtlRoom = String(room?.type || '') === 'ttl';
      if (!isTtlRoom || !expiresAt) return;
      let finished = false;
      const handleExpire = () => {
        if (finished) return; finished = true;
        try { removeRooms([roomId]); } catch {}
        try { Alert.alert('TTL 만료', '방이 만료되어 닫힙니다.'); } catch {}
        try { router.replace('/chat/rooms'); } catch {}
      };
      const now = Date.now();
      const remain = Math.max(0, expiresAt - now);
      if (remain <= 0) { handleExpire(); return; }
      const to = setTimeout(handleExpire, remain);
      return () => { try { clearTimeout(to); } catch {} finished = true; };
    } catch {}
  }, [room?.expiresAt, room?.type, roomId]);

  const scrollToBottom = (force: boolean = false) => {
    if (!force && !atBottomRef.current && !lockAtBottomRef.current) return;
    // 다중 보정: 레이아웃 직후와 지연 타이밍에 연속 호출
    const go = () => { try { listRef.current?.scrollToEnd({ animated: false }); } catch {} };
    requestAnimationFrame(go);
    setTimeout(go, 40);
    setTimeout(go, 120);
  };
  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    const uid = firebaseAuth.currentUser?.uid || 'me';
    sendMessage(roomId, uid, t, 'text', undefined, replyTo?.id);
    setText('');
    setReplyTo(null);
    // 전송 후에는 항상 하단으로 이동(내 메시지 우선 가시)
    lockAtBottomRef.current = true;
    scrollToBottom(true);
  };

  // 자동 스크롤 제거: 입력창/플러스 패널 변화에 따른 강제 스크롤 없음

  const handlePickImageWebSafe = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85, allowsMultipleSelection: true, base64: true } as any);
      if (res.canceled || !res.assets?.length) { setPlusOpen(false); return; }

      const toDataUrlIfNeeded = async (u: string, mime?: string, b64?: string) => {
        try {
          if (Platform.OS === 'web') {
            const isRemoteHttp = /^https?:\/\//i.test(u) && !/localhost:8081/i.test(u);
            if (!isRemoteHttp) {
              const resp = await fetch(u); const blob = await resp.blob();
              const asDataUrl: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = reject; fr.readAsDataURL(blob); });
              // 대용량 이미지는 업로드 실패/지연 방지를 위해 브라우저에서 리사이즈
              const needsResize = (() => { try { return blob.size > 3 * 1024 * 1024; } catch { return false; } })();
              if (needsResize) {
                try {
                  const img = document.createElement('img');
                  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = asDataUrl; });
                  const maxSide = 2560;
                  let w = img.naturalWidth || img.width; let h = img.naturalHeight || img.height;
                  const ratio = Math.min(1, maxSide / Math.max(w, h));
                  w = Math.max(1, Math.round(w * ratio)); h = Math.max(1, Math.round(h * ratio));
                  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
                  const ctx = canvas.getContext('2d'); if (ctx) ctx.drawImage(img, 0, 0, w, h);
                  const compressed: string = canvas.toDataURL('image/jpeg', 0.85);
                  if (compressed && compressed.length < asDataUrl.length) return compressed;
                } catch {}
              }
              if (asDataUrl) return asDataUrl;
            }
          } else {
            // Native: base64가 들어오면 그대로 data URL 구성
            if (b64 && typeof b64 === 'string' && b64.length > 0) {
              const m = (mime && mime.startsWith('image/')) ? mime : 'image/jpeg';
              return `data:${m};base64,${b64}`;
            }
            // 폴백: 파일에서 base64 읽기
            try {
              const m = (mime && mime.startsWith('image/')) ? mime : 'image/jpeg';
              const base = await FileSystem.readAsStringAsync(u, { encoding: (FileSystem as any).EncodingType.Base64 });
              if (base) return `data:${m};base64,${base}`;
            } catch {}
          }
        } catch {}
        return u;
      };

      // 30장 제한
      const MAX = 30;
      if (res.assets.length > MAX) {
        try { Alert.alert('안내', `한 번에 보낼 수 있는 최대 사진 수는 ${MAX}장입니다.`); } catch {}
      }
      const toTake = res.assets.slice(0, MAX);
      const uris: string[] = [];
      for (const a of toTake) {
        const u = await toDataUrlIfNeeded(String(a.uri), (a as any).mimeType as any, (a as any).base64 as any);
        uris.push(u);
      }

      const uid = firebaseAuth.currentUser?.uid || 'me';
      const sendBundled = async () => {
        // 한 개의 앨범 메시지로 전송
        sendMessage(roomId, uid, '', 'album', undefined, replyTo?.id, uris);
        lockAtBottomRef.current = true; scrollToBottom(true);
      };

      // 요구사항: 다중 선택 시 항상 묶음 전송
      if (uris.length >= 2) {
        await sendBundled();
      } else {
        // 1장일 때는 단일 이미지 메시지
        sendMessage(roomId, uid, '', 'image', uris[0], replyTo?.id);
        lockAtBottomRef.current = true; scrollToBottom(true);
      }
    } catch {}
    setPlusOpen(false);
  };

  const handlePickFile = async () => {
                try {
                  if (Platform.OS === 'web') {
                    await new Promise<void>((resolve) => {
                      const input = document.createElement('input');
                      input.type = 'file';
          input.accept = '*/*';
          input.onchange = async () => {
                        try {
                          const file = (input.files && input.files[0]) || null;
              if (file) {
                let uid = firebaseAuth.currentUser?.uid || '';
                let url = '';
                const typeKind: 'file'|'image'|'video' = (() => {
                  const t = String((file as any).type || '').toLowerCase();
                  if (t.startsWith('video/')) return 'video';
                  if (t.startsWith('image/')) return 'image';
                  return 'file';
                })();
                const done = () => {
                  // 보낸 사람 정체성 보장
                  uid = uid || firebaseAuth.currentUser?.uid || 'me';
                  const label = typeKind === 'video' ? `🎬 ${file.name}` : `📎 ${file.name}`;
                  sendMessage(roomId, uid, label, typeKind, url);
                  lockAtBottomRef.current = true; scrollToBottom(true);
                  resolve();
                };
                try {
                  try { await ensureAppCheckReady(); } catch {}
                  try { await new Promise((r)=>setTimeout(r, 150)); } catch {}
                  try { uid = uid || await ensureAuthedUid(); } catch {}
                  if (!uid) {
                    try { url = URL.createObjectURL(file); } catch {}
                    done();
                    return;
                  }
                  const storage = firebaseStorage;
                  const safeName = (file.name || 'file').replace(/[^\w\-\.]+/g, '_');
                  const path = `files/${uid}/${Date.now()}-${safeName}`;
                  const r = storageRef(storage, path);
                  const abPromise = (typeof (file as any).arrayBuffer === 'function')
                    ? (file as any).arrayBuffer()
                    : new Response(file as any).arrayBuffer();
                  console.info('[FILE] upload:start', { name: file.name, type: file.type });
                  const metaUp: any = { contentType: file.type || 'application/octet-stream', contentDisposition: `inline; filename*=utf-8''${encodeURIComponent(file.name||'file')}` , customMetadata: { originalName: file.name || 'file' } };
                  abPromise
                    .then((ab: ArrayBuffer) => uploadBytes(r, new Uint8Array(ab), metaUp))
                    .then(() => getDownloadURL(r))
                    .then(async (u) => {
                      url = u;
                      console.info('[FILE] upload:done', { url: u.slice(0, 80) });
                      try {
                        const key = `u:${uid}:chat.media.meta`;
                        const raw = await AsyncStorage.getItem(key);
                        const m = raw ? JSON.parse(raw) : {};
                        const norm = (()=>{ try { const U=new URL(String(u)); U.search=''; U.hash=''; return U.toString(); } catch { return String(u); } })();
                        m[norm] = { ...(m[norm]||{}), name: (file.name||'file') };
                        await AsyncStorage.setItem(key, JSON.stringify(m));
                      } catch {}
                    })
                    .catch((e) => { console.warn('[FILE] upload:error', e); })
                    .finally(() => {
                      try { if (!url) { url = URL.createObjectURL(file); console.info('[FILE] fallback:blob'); } } catch {}
                      done();
                    });
                } catch {
                  try { if (!url) url = URL.createObjectURL(file); } catch {}
                  done();
                }
              }
                        } catch {}
                        // resolve()는 업로드/폴백/전송 완료 후 done()에서 호출됨
                      };
                      input.click();
                    });
                  } else {
        // 네이티브: DocumentPicker로 선택 후 Firebase Storage 업로드
        const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (pick.canceled) { setPlusOpen(false); return; }
        const file = Array.isArray((pick as any).assets) ? (pick as any).assets[0] : (pick as any);
        const uri = String(file.uri || '');
        const name = String(file.name || 'file');
        const mime = String(file.mimeType || 'application/octet-stream');
        const typeKind: 'file'|'image'|'video' = mime.startsWith('video/') ? 'video' : (mime.startsWith('image/') ? 'image' : 'file');
        let uid = firebaseAuth.currentUser?.uid || '';
        try { await ensureAppCheckReady(); } catch {}
        try { uid = uid || await ensureAuthedUid(); } catch {}
        uid = uid || firebaseAuth.currentUser?.uid || 'me';
        const storage = firebaseStorage;
        const safeName = name.replace(/[^\w\-\.]+/g, '_');
        const path = `files/${uid}/${Date.now()}-${safeName}`;
        const r = storageRef(storage, path);
        let uploadedUrl = '';
        try {
          const res = await fetch(uri);
          const ab = await res.arrayBuffer();
          await uploadBytes(r, new Uint8Array(ab), { contentType: mime, contentDisposition: `inline; filename*=utf-8''${encodeURIComponent(name)}`, customMetadata: { originalName: name } } as any);
          uploadedUrl = await getDownloadURL(r);
        } catch (e) {
          console.warn('[FILE][native] upload fail(fetch). try base64 fallback', e);
          try {
            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 as any });
            await uploadString(r, b64, 'base64', { contentType: mime, contentDisposition: `inline; filename*=utf-8''${encodeURIComponent(name)}`, customMetadata: { originalName: name } } as any);
            uploadedUrl = await getDownloadURL(r);
          } catch (e2) {
            console.warn('[FILE][native] base64 upload fail', e2);
          }
        }
        if (uploadedUrl) {
          const label = typeKind === 'video' ? `🎬 ${name}` : `📎 ${name}`;
          sendMessage(roomId, uid, label, typeKind, uploadedUrl);
          try {
            const key = `u:${uid}:chat.media.meta`;
            const raw = await AsyncStorage.getItem(key);
            const m = raw ? JSON.parse(raw) : {};
            const norm = (()=>{ try { const U=new URL(String(uploadedUrl)); U.search=''; U.hash=''; return U.toString(); } catch { return String(uploadedUrl); } })();
            m[norm] = { ...(m[norm]||{}), name };
            await AsyncStorage.setItem(key, JSON.stringify(m));
          } catch {}
        } else {
          sendMessage(roomId, uid, '📎 파일 전송 실패');
        }
        lockAtBottomRef.current = true; scrollToBottom(true);
        }
                } catch {}
    setPlusOpen(false);
    };

  // 역지오코딩: 좌표 → 도로명 포함 현지 포맷 주소
  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
                    try {
                      const key = (process?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as any)
                        || (process?.env?.GOOGLE_MAPS_API_KEY as any)
                        || ((Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY)
                        || ((Constants as any)?.manifest?.extra?.GOOGLE_MAPS_API_KEY);
      if (key) {
        // 1) 집번 포함 주소 우선 시도
        const url1 = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=ko&result_type=street_address&location_type=ROOFTOP|RANGE_INTERPOLATED`;
        const url2 = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=ko`;
        const fetchJson = async (u: string) => { const r = await fetch(u); return r.json(); };
        const data1 = await fetchJson(url1);
        const data2 = data1?.results?.length ? null : await fetchJson(url2);
        const results: any[] = data1?.results?.length ? data1.results : (Array.isArray(data2?.results) ? data2.results : []);
        if (results.length) {
          // street_number가 있는 결과를 우선 선택
          const pick = (arr: any[]) => arr.find((r) => (r.address_components || []).some((c: any) => (c.types || []).includes('street_number') && (r.address_components || []).some((c2: any) => (c2.types || []).includes('route')))) || arr[0];
          const r = pick(results);
          const comps = r.address_components || [];
          const byType = (t: string) => comps.find((c: any) => (c.types || []).includes(t))?.long_name;
          const streetNum = byType('street_number');
          const route = byType('route');
          const building = byType('premise') || byType('subpremise') || byType('establishment') || byType('point_of_interest') || '';
          const sublocal = byType('sublocality_level_1') || byType('sublocality') || '';
          const neighbourhood = byType('neighborhood') || '';
          const district = byType('administrative_area_level_2') || byType('administrative_area_level_3') || '';
          const city = byType('locality') || '';
          const state = byType('administrative_area_level_1') || '';
          const postal = byType('postal_code') || '';
          const country = byType('country') || '';
          const lineRoad = `${route || ''}${streetNum ? ' ' + streetNum : ''}`.trim();
          const head = [building, lineRoad].filter(Boolean).join(', ');
          if (head) {
            const rawParts = [sublocal, neighbourhood, district, city, state, postal, country].filter(Boolean);
            const seen: Record<string, boolean> = {};
            const parts = rawParts.filter((p) => { const k = String(p); if (seen[k]) return false; seen[k] = true; return true; });
            return parts.length ? `${head}, ${parts.join(', ')}` : head;
          }
          const addr = r.formatted_address || null;
          if (addr) return addr;
        }
      }
      // Fallback: OpenStreetMap Nominatim (API 키 불필요)
      try {
        const osm = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&namedetails=1&lat=${lat}&lon=${lng}&accept-language=ko,en`, {
          headers: { 'User-Agent': 'YoYApp/1.0 (contact: support@example.com)' },
        });
        const j = await osm.json();
        let addr2 = j?.display_name || null;
        // 가능하면 건물명 + 도로명+번지 우선 조합
        const a = j?.address || {};
        const building2 = j?.namedetails?.name || j?.name || '';
        const line1 = [a.road, a.house_number].filter(Boolean).join(' ').trim();
        const head = [building2, line1].filter(Boolean).join(', ').trim();
        const rawParts = [a.neighbourhood, a.suburb, a.city_district, a.district, a.borough, a.city || a.town || a.village || a.county, a.state || a.region, a.postcode, a.country].filter(Boolean);
        const seen: Record<string, boolean> = {};
        const parts = rawParts.filter((p) => { const k = String(p); if (seen[k]) return false; seen[k] = true; return true; });
        if (head) addr2 = parts.length ? `${head}, ${parts.join(', ')}` : head;
        if (addr2) return addr2;
        } catch {}
      return null;
                    } catch {
      return null;
                    }
                  };
    const shareLocation = async () => {
      try {
                  if (Platform.OS === 'web' && 'geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                      const { latitude, longitude } = pos.coords;
          const uid = firebaseAuth.currentUser?.uid || 'me';
          (async () => {
            const addr = await reverseGeocode(latitude, longitude);
            const url = `https://maps.google.com/?q=${latitude},${longitude}`;
            const text = addr ? `📍 위치: ${addr}\n${url}` : `📍 위치 공유: ${url}`;
            sendMessage(roomId, uid, text);
            lockAtBottomRef.current = true; scrollToBottom(true);
          })();
          }, () => {
          const uid = firebaseAuth.currentUser?.uid || 'me';
          sendMessage(roomId, uid, '📍 위치 공유 실패');
          lockAtBottomRef.current = true; scrollToBottom(true);
          });
                  } else {
        // 네이티브: 위치 권한 요청 후 현재 위치 공유
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
        const uid = firebaseAuth.currentUser?.uid || 'me';
          sendMessage(roomId, uid, '📍 위치 공유 실패');
          lockAtBottomRef.current = true; scrollToBottom(true);
          setPlusOpen(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const uid = firebaseAuth.currentUser?.uid || 'me';
        const addr = await reverseGeocode(latitude, longitude);
        const url = `https://maps.google.com/?q=${latitude},${longitude}`;
        const text = addr ? `📍 위치: ${addr}\n${url}` : `📍 위치 공유: ${url}`;
        sendMessage(roomId, uid, text);
        lockAtBottomRef.current = true; scrollToBottom(true);
        }
      } catch {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      sendMessage(roomId, uid, '📍 위치 공유 실패');
      lockAtBottomRef.current = true; scrollToBottom(true);
      }
    setPlusOpen(false);
  };
  const handlePickVideo = async () => {
    try {
      if (Platform.OS === 'web') {
        await new Promise<void>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/*';
          input.onchange = () => {
            try {
              const file = (input.files && input.files[0]) || null;
              if (file) {
                const uid = firebaseAuth.currentUser?.uid || 'me';
                const url = URL.createObjectURL(file);
                const name = file.name || 'video.mp4';
                sendMessage(roomId, uid, `🎬 ${name}`, 'video', url, replyTo?.id);
                lockAtBottomRef.current = true; scrollToBottom(true);
              }
            } catch {}
            resolve();
          };
          input.click();
        });
      } else {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] as any, quality: 0.8 });
        if (!res.canceled && res.assets?.length) {
          const a = res.assets[0];
          const uid = firebaseAuth.currentUser?.uid || 'me';
          const name = (a.fileName as any) || 'video';
          sendMessage(roomId, uid, `🎬 ${name}`, 'video', String(a.uri), replyTo?.id);
          lockAtBottomRef.current = true; scrollToBottom(true);
        }
      }
    } catch {}
    setPlusOpen(false);
  };

  const sendQRCode = () => {
    const payload = `yooy://share?room=${roomId}`;
    const publicUrl = `https://yooyland.com/room/${roomId}`;
    const qrUri = `https://chart.googleapis.com/chart?cht=qr&chs=400x400&chld=H|1&chl=${encodeURIComponent(publicUrl)}`;
    const uid = firebaseAuth.currentUser?.uid || 'me';
    // 상단 URL 텍스트 + 하단 QR 이미지를 하나의 메시지로 전송 (텍스트 + imageUrl)
    sendMessage(roomId, uid, publicUrl, 'image', qrUri);
    lockAtBottomRef.current = true; scrollToBottom(true);
    setPlusOpen(false);
  };
  // 웹: QR 이미지 선택 후 자동 스캔하여 URL 전송
  const pickQrAndScan = async () => {
    try {
      if (Platform.OS !== 'web') {
        // 네이티브: 갤러리에서 이미지 선택 → jsQR로 디코드
        try {
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8, base64: true } as any);
          if (res.canceled || !res.assets?.length) { setPlusOpen(false); return; }
          const a = res.assets[0];
          const b64 = a.base64 || '';
          if (!b64) { setPlusOpen(false); return; }
          const tryDecode = async (): Promise<string> => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const jsQR = require('jsqr');
              // PNG 우선
              let width = 0, height = 0, data: Uint8ClampedArray | null = null;
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const P = require('pngjs/browser');
                const PNG = P.PNG || P;
                const buf = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
                const parsed = PNG.sync.read(buf as any);
                width = parsed.width; height = parsed.height;
                data = new Uint8ClampedArray(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
              } catch {}
              // JPEG 폴백
              if (!data) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  const jpeg = require('jpeg-js');
                  const buf = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
                  const decoded = jpeg.decode(buf as any, { useTArray: true });
                  width = decoded.width; height = decoded.height;
                  data = new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
                } catch {}
              }
              if (data && width && height) {
                const r = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
                if (r?.data) return String(r.data);
              }
            } catch {}
            return '';
          };
          const raw = await tryDecode();
          const text = normalizeScannedText(String(raw||''));
          const uid = firebaseAuth.currentUser?.uid || 'me';
          if (text) {
            sendMessage(roomId, uid, text);
          } else {
            Alert.alert('안내', 'QR 인식에 실패했습니다.');
          }
          lockAtBottomRef.current = true; scrollToBottom(true);
          setPlusOpen(false);
          return;
        } catch {
          setPlusOpen(false);
        return;
        }
      }
      const webLog = (...args: any[]) => { try { if (Platform.OS === 'web') console.log('[QR]', ...args); } catch {} };
      webLog('pickQrAndScan:start');
      const fileUrl: string = await new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const f = (input.files && input.files[0]) || null;
          if (!f) { webLog('file:none'); resolve(''); return; }
          try { webLog('file:selected', { name: (f as any).name, size: (f as any).size, type: (f as any).type }); } catch {}
          const reader = new FileReader();
          reader.onload = () => { const v = String(reader.result || ''); try { webLog('file:read', { length: v.length, head: v.slice(0, 32) }); } catch {} resolve(v); };
          reader.readAsDataURL(f);
        };
        input.click();
      });
      if (!fileUrl) { webLog('abort:no-file'); setPlusOpen(false); return; }

      const decodeWithBarcodeDetector = async (dataUrl: string): Promise<string> => {
        try {
          webLog('barcode:begin');
          const img = document.createElement('img');
          try { img.setAttribute('crossorigin', 'anonymous'); } catch {}
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = dataUrl; });
          try { webLog('barcode:image', { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }); } catch {}
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('ctx');
          ctx.drawImage(img, 0, 0);
          const Det = (window as any).BarcodeDetector;
          if (Det) {
            const det = new Det({ formats: ['qr_code'] });
            const res = await det.detect(canvas as any);
            try { webLog('barcode:result', { count: (res && res.length) || 0 }); } catch {}
            const v = (res && res[0] && (res[0].rawValue || res[0].rawValue)) || '';
            if (v) webLog('barcode:hit', v.slice(0, 120)); else webLog('barcode:miss');
            return String(v || '');
          }
          webLog('barcode:unsupported');
        } catch {}
        return '';
      };

      const decodeWithZXing = async (dataUrl: string): Promise<string> => {
        try {
          if (!ZXingLib) return '';
          const ReaderCtor = ZXingLib.BrowserQRCodeReader || ZXingLib.BrowserMultiFormatReader;
          if (!ReaderCtor) return '';
          const reader = new ReaderCtor();
          if (typeof reader.decodeFromImageUrl === 'function') {
            try { const res = await reader.decodeFromImageUrl(dataUrl); if (res?.text) return String(res.text); } catch {}
          }
          if (typeof reader.decodeFromImage === 'function') {
            try {
              const el = document.createElement('img');
              try { el.setAttribute('crossorigin', 'anonymous'); } catch {}
              await new Promise<void>((resolve, reject) => { el.onload = () => resolve(); el.onerror = () => reject(new Error('img')); el.src = dataUrl; });
              const res2 = await reader.decodeFromImage(el as any);
              if (res2?.text) return String(res2.text);
            } catch {}
          }
        } catch {}
        return '';
      };

      const ensureJsQr = async (): Promise<any> => {
        try { webLog('jsqr:require'); return require('jsqr'); } catch {}
        webLog('jsqr:load-script');
        return await new Promise<any>((resolve) => {
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/jsqr/dist/jsQR.js';
          s.onload = () => resolve((window as any).jsQR);
          document.head.appendChild(s);
        });
      };

      const decodeWithJsQr = async (dataUrl: string): Promise<string> => {
        // 견고한 디코딩: 리사이즈, 패딩, 중앙 로고 마스킹, 대비 조정 등 여러 후보 시도
        try {
          if (typeof document === 'undefined') return '';
          const img = document.createElement('img');
          try { img.setAttribute('crossorigin', 'anonymous'); } catch {}
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = dataUrl; });
          try { webLog('jsqr:image', { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }); } catch {}

          const loadCanvas = (w: number, h: number) => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h; return c;
          };
          const rotate = (src: HTMLCanvasElement, deg: number) => {
            const out = loadCanvas(deg % 180 === 0 ? src.width : src.height, deg % 180 === 0 ? src.height : src.width);
            const ctx = out.getContext('2d'); if (!ctx) return src; ctx.translate(out.width/2, out.height/2); ctx.rotate(deg*Math.PI/180); ctx.drawImage(src, -src.width/2, -src.height/2); return out;
          };
          const cropMargin = (src: HTMLCanvasElement, ratio: number) => {
            const ox = Math.floor(src.width * ratio); const oy = Math.floor(src.height * ratio);
            const ow = Math.max(1, src.width - ox*2); const oh = Math.max(1, src.height - oy*2);
            const out = loadCanvas(ow, oh); const c = out.getContext('2d'); if (!c) return src; c.drawImage(src, ox, oy, ow, oh, 0, 0, ow, oh); return out;
          };

          const jsQR = await ensureJsQr();
          if (!jsQR) return '';

          const tryDecode = (cv: HTMLCanvasElement): string => {
            const ctx = cv.getContext('2d'); if (!ctx) return '';
            const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
            const r = jsQR(imgData.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
            return String(r?.data || '');
          };
          const tryZXingPixel = async (cv: HTMLCanvasElement): Promise<string> => {
            try {
              if (!ZXingLib) return '';
              if (!(ZXingLib.RGBLuminanceSource && ZXingLib.BinaryBitmap && ZXingLib.HybridBinarizer)) return '';
              const ctx = cv.getContext('2d'); if (!ctx) return '';
              const px = ctx.getImageData(0, 0, cv.width, cv.height);
              const source = new ZXingLib.RGBLuminanceSource(px.data, cv.width, cv.height);
              const bitmap = new ZXingLib.BinaryBitmap(new ZXingLib.HybridBinarizer(source));
              const MF = ZXingLib.MultiFormatReader || ZXingLib.BrowserMultiFormatReader || ZXingLib.BrowserQRCodeReader;
              if (!MF) return '';
              const mfReader = new MF();
              try {
                if (ZXingLib.DecodeHintType && mfReader.setHints) {
                  const hints = new Map();
                  hints.set(ZXingLib.DecodeHintType.TRY_HARDER, true);
                  try { hints.set(ZXingLib.DecodeHintType.PURE_BARCODE, false); } catch {}
                  mfReader.setHints(hints);
                }
              } catch {}
              try { const res = mfReader.decode(bitmap); return res?.getText ? String(res.getText()) : String(res?.text || ''); } catch { return ''; }
            } catch { return ''; }
          };

          // 1) 기본: 원본 비율 유지, 긴 변 최대 1200으로 리사이즈
          const maxSide = 1200;
          const iw = (img.naturalWidth || img.width) || 0;
          const ih = (img.naturalHeight || img.height) || 0;
          const scale = Math.min(1, maxSide / Math.max(iw, ih));
          const bw = Math.max(1, Math.round(iw * scale));
          const bh = Math.max(1, Math.round(ih * scale));
          const base = loadCanvas(bw, bh);
          { const bctx = base.getContext('2d'); if (bctx) { bctx.imageSmoothingEnabled = false; bctx.drawImage(img, 0, 0, bw, bh); } }
          let hit = tryDecode(base);
          if (hit) { webLog('jsqr:hit:base'); return hit; }
          // ZXing 픽셀 폴백
          try { const z = await tryZXingPixel(base); if (z) { webLog('zxing:hit:base'); return z; } } catch {}

          // 2) 정사각 중심 크롭
          const square = Math.min(bw, bh);
          const sx = Math.floor((bw - square) / 2);
          const sy = Math.floor((bh - square) / 2);
          const sq = loadCanvas(square, square);
          { const c = sq.getContext('2d'); if (c) { c.imageSmoothingEnabled = false; c.drawImage(base, sx, sy, square, square, 0, 0, square, square); } }
          hit = tryDecode(sq);
          if (hit) { webLog('jsqr:hit:square'); return hit; }
          try { const z = await tryZXingPixel(sq); if (z) { webLog('zxing:hit:square'); return z; } } catch {}

          // 2-1) 두꺼운 외곽 테두리 제거: 다양한 마진 비율로 크롭 시도
          for (const m of [0.04, 0.06, 0.08, 0.10, 0.12]) {
            const trimmed = cropMargin(sq, m);
            let t = tryDecode(trimmed); if (t) { webLog('jsqr:hit:trim', { m }); return t; }
            try { const z = await tryZXingPixel(trimmed); if (z) { webLog('zxing:hit:trim', { m }); return z; } } catch {}
          }

          // 3) 흰색 패딩 추가
          const pad = 24;
          const padded = loadCanvas(square + 2 * pad, square + 2 * pad);
          { const c = padded.getContext('2d'); if (c) { c.fillStyle = '#ffffff'; c.fillRect(0,0,padded.width,padded.height); c.imageSmoothingEnabled = false; c.drawImage(sq, pad, pad); } }
          hit = tryDecode(padded);
          if (hit) { webLog('jsqr:hit:padded'); return hit; }
          try { const z = await tryZXingPixel(padded); if (z) { webLog('zxing:hit:padded'); return z; } } catch {}

          // 4) 중앙 로고 마스킹(여러 비율, 흰/검) - 더 큰 로고 대비 확장
          const ratios = [0.16, 0.18, 0.22, 0.26, 0.30, 0.34, 0.38];
          for (const r of ratios) {
            for (const color of ['#ffffff', '#000000']) {
              const m = loadCanvas(padded.width, padded.height);
              const c = m.getContext('2d');
              if (!c) continue;
              c.imageSmoothingEnabled = false;
              c.drawImage(padded, 0, 0);
              const cw = Math.floor(padded.width * r);
              const ch = Math.floor(padded.height * r);
              const cx = Math.floor((padded.width - cw) / 2);
              const cy = Math.floor((padded.height - ch) / 2);
              c.fillStyle = color; c.fillRect(cx, cy, cw, ch);
              hit = tryDecode(m);
              if (hit) { webLog('jsqr:hit:mask', { ratio: r, color }); return hit; }
              try { const z = await tryZXingPixel(m); if (z) { webLog('zxing:hit:mask', { ratio: r, color }); return z; } } catch {}
            }
          }
          // 5) 대비/감마 조정 다중 시도
          const adjust = (src: HTMLCanvasElement, contrast = 1.15, gamma = 0.95) => {
            const out = loadCanvas(src.width, src.height);
            const ctx = out.getContext('2d'); if (!ctx) return src;
            ctx.drawImage(src, 0, 0);
            const imgd = ctx.getImageData(0, 0, out.width, out.height);
            const d = imgd.data; const mid = 128;
            for (let i = 0; i < d.length; i += 4) {
              let r = d[i], g = d[i+1], b = d[i+2];
              r = mid + (r - mid) * contrast; g = mid + (g - mid) * contrast; b = mid + (b - mid) * contrast;
              r = 255 * Math.pow(r / 255, gamma); g = 255 * Math.pow(g / 255, gamma); b = 255 * Math.pow(b / 255, gamma);
              d[i] = r; d[i+1] = g; d[i+2] = b;
            }
            ctx.putImageData(imgd, 0, 0); return out;
          };
          const cgPairs = [
            [1.15, 0.95],
            [1.25, 0.90],
            [1.35, 0.85],
            [1.10, 1.00],
          ] as const;
          for (const [cst, gm] of cgPairs) {
            const adj = adjust(padded, cst, gm);
            hit = tryDecode(adj);
            if (hit) { webLog('jsqr:hit:adjust', { cst, gm }); return hit; }
            try { const z = await tryZXingPixel(adj); if (z) { webLog('zxing:hit:adjust', { cst, gm }); return z; } } catch {}
          }

          // 6) 회전 보정
          for (const deg of [90, 180, 270]) {
            const rot = rotate(padded, deg);
            hit = tryDecode(rot);
            if (hit) { webLog('jsqr:hit:rotate', { deg }); return hit; }
            try { const z = await tryZXingPixel(rot); if (z) { webLog('zxing:hit:rotate', { deg }); return z; } } catch {}
          }

        } catch {}
        return '';
      };

      const normalizeScannedText = (raw: string): string => {
        try {
          if (!raw) return '';
          let s = String(raw).trim();
          s = s.replace(/^['"]|['"]$/g, '');
          const m = s.match(/yooy:\/\/pay\?[^\s"']+/i);
          if (m) return m[0];
          return s;
        } catch { return String(raw || '').trim(); }
      };

      // 병렬 시도: BarcodeDetector, jsQR, ZXing을 순차+병렬로 적극 시도
      let decoded = '';
      try {
        const p: Promise<string>[] = [] as any;
        // 1) BarcodeDetector
        p.push((async()=> await decodeWithBarcodeDetector(fileUrl))());
        // 2) ZXing
        p.push((async()=> await decodeWithZXing(fileUrl))());
        // 3) jsQR 고급
        p.push((async()=> await decodeWithJsQr(fileUrl))());
        // 첫 성공 반환
        decoded = await new Promise<string>(async (resolve) => {
          let solved = false; const tryResolve = (v: string) => { if (!solved && v) { solved = true; resolve(v); } };
          p.forEach(async (pp) => { try { const v = await pp; if (v) tryResolve(v); } catch {} });
          // 타임아웃 4s 후 가장 강한 jsQR 결과 재시도
          setTimeout(async () => { if (!solved) { try { const v = await decodeWithJsQr(fileUrl); if (v) tryResolve(v); else resolve(''); } catch { resolve(''); } } }, 4000);
        });
      } catch {}
      if (!decoded) decoded = await decodeWithJsQr(fileUrl);
      if (decoded) decoded = normalizeScannedText(decoded);
      if (decoded) webLog('decode:hit', decoded.slice(0, 180)); else webLog('decode:miss');

      if (decoded) {
        let uid = firebaseAuth.currentUser?.uid || '';
        const text = decoded.trim();
        // dataURL이면 업로드 후 영구 URL 사용
        let imgUrl = fileUrl;
        try {
          if (/^data:image\//i.test(fileUrl)) {
            try { await ensureAppCheckReady(); } catch {}
            try { uid = uid || await ensureAuthedUid(); } catch {}
            if (!uid) { try { Alert.alert('안내', '인증이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.'); } catch {} throw new Error('auth-not-ready'); }
            const storage = firebaseStorage;
            const path = `qr/${uid}/${Date.now()}.png`;
            const r = storageRef(storage, path);
            await uploadString(r, fileUrl, 'data_url', { customMetadata: { originalName: 'image-from-url' } } as any);
            imgUrl = await getDownloadURL(r);
          }
        } catch {}
        // 하나의 말풍선에 URL(말줄임) + QR 이미지를 함께 전송
        // 로컬 즉시 표시용으로 dataURL이라도 전달(스토리지 업로드 후 서버에서 http로 치환됨)
        if (imgUrl) sendMessage(roomId, uid, text || '', 'image', imgUrl);
        else sendMessage(roomId, uid, text || '');
        lockAtBottomRef.current = true; scrollToBottom(true);
      } else {
        try {
          const uid = firebaseAuth.currentUser?.uid || 'me';
          sendMessage(roomId, uid, '인식할수 없는 파일입니다.');
          lockAtBottomRef.current = true; scrollToBottom(true);
        } catch {}
      }
    } catch { Alert.alert('안내', 'QR 처리 중 오류가 발생했습니다.'); }
    setPlusOpen(false);
  };
  const confirmSendQrPreview = async () => {
    try {
      if (!qrPreview) return;
      let uid = firebaseAuth.currentUser?.uid || '';
      const text = String(qrPreview.text || '').trim();
      let imgUrl = qrPreview.imageUrl;
      try {
        if (/^data:image\//i.test(imgUrl)) {
          try { await ensureAppCheckReady(); } catch {}
          try { uid = uid || await ensureAuthedUid(); } catch {}
          if (!uid) { try { Alert.alert('안내', '인증이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.'); } catch {} throw new Error('auth-not-ready'); }
          const storage = firebaseStorage;
          const path = `qr/${uid}/${Date.now()}.png`;
          const r = storageRef(storage, path);
          await uploadString(r, imgUrl, 'data_url', { customMetadata: { originalName: 'image' } } as any);
          imgUrl = await getDownloadURL(r);
        }
      } catch {}
      // kind별 전송 포맷: 항상 위 텍스트, 아래 원본 QR 이미지
        if (qrPreview.kind === 'card') {
        const d = qrPreview.data || {};
        const summary = [
          d.name || '명함',
          [d.company, d.title].filter(Boolean).join(' · '),
          d.phone ? `☎ ${require('@/contexts/PreferencesContext').usePreferences().language ? require('@/lib/phone').formatPhoneForLocale(d.phone, require('@/contexts/PreferencesContext').usePreferences().language) : d.phone}` : '',
          d.email ? `✉ ${d.email}` : '',
          d.memo ? `${d.memo}` : ''
        ].filter(Boolean).join('\n');
        sendMessage(roomId, uid, summary, 'image', imgUrl);
        } else if (qrPreview.kind === 'pay') {
        const d = qrPreview.data || {};
        const summary = `💳 받기 요청\n코인: ${d.sym || ''}\n수량: ${d.amt || ''}\n주소: ${d.addr || ''}`;
        sendMessage(roomId, uid, summary, 'image', imgUrl);
      } else if (qrPreview.kind === 'invite') {
        const d = qrPreview.data || {};
        const publicUrl = `https://yooyland.com/room/${d.roomId || ''}`;
        const r = (useKakaoRoomsStore as any).getState().getRoomById?.(String(d.roomId || roomId));
        const title = String(r?.title || '초대장');
        // 포맷: [방이름] \n [링크] \n (아래 QR 이미지)
        sendMessage(roomId, uid, `${title}\n${publicUrl}`, 'image', imgUrl);
      } else {
        // 일반 텍스트 + 이미지: 이미지가 있으면 항상 이미지 버블로, URL/텍스트는 상단에 표시
        if (imgUrl) sendMessage(roomId, uid, text || '', 'image', imgUrl); else if (text) sendMessage(roomId, uid, text);
      }
      lockAtBottomRef.current = true; scrollToBottom(true);
    } finally {
      setQrPreview(null);
    }
  };

  const cancelQrPreview = () => {
    setQrPreview(null);
  };

  const createPoll = () => { const uid = firebaseAuth.currentUser?.uid || 'me'; sendMessage(roomId, uid, '🗳️ [투표 만들기]'); setPlusOpen(false); lockAtBottomRef.current = true; scrollToBottom(true); };

  // 사진 보내기: data URL은 Storage에 업로드 후 URL로 전송해 Firestore 1MB 제한 회피
  const handlePickImage = async () => {
    try {
      if (Platform.OS === 'web') {
        const url: string = await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*';
          input.onchange = async () => { const f = (input.files && input.files[0]) || null; if (!f) { resolve(''); return; } const fr = new FileReader(); fr.onload = () => resolve(String(fr.result||'')); fr.readAsDataURL(f); };
          input.click();
        });
        if (!url) return;
        const uid = firebaseAuth.currentUser?.uid || 'me';
        let imageUrl = url;
        try {
          if (/^data:image\//i.test(url)) {
            try { await ensureAppCheckReady(); } catch {}
            const storage = firebaseStorage;
            const path = `chat/${uid}/${Date.now()}.png`;
            const r = storageRef(storage, path);
            await uploadString(r, url, 'data_url', { customMetadata: { originalName: displayName || 'file' } } as any);
            imageUrl = await getDownloadURL(r);
          }
        } catch {}
        sendMessage(roomId, uid, '', 'image', imageUrl);
        lockAtBottomRef.current = true; scrollToBottom(true);
      } else {
        // 네이티브는 기존 로직 유지(별도 구현 시 연동)
        try { const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 }); if (!res.canceled && res.assets?.length) { const uid = firebaseAuth.currentUser?.uid || 'me'; sendMessage(roomId, uid, '', 'image', res.assets[0].uri); } } catch {}
      }
    } catch {}
  };

  const onPlusPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['사진 보내기', '파일 보내기', 'QR보내기', '위치 공유', '투표 만들기', '취소'], cancelButtonIndex: 5, userInterfaceStyle: 'dark' },
        (i) => { if (i===0) handlePickImageWebSafe(); else if (i===1) handlePickFile(); else if (i===2) pickQrAndScan(); else if (i===3) shareLocation(); else if (i===4) createPoll(); }
      );
    } else {
      setPlusOpen((v) => !v);
    }
  };

  const groupByDate = (items: any[]) => {
    const fmt = (d: Date) => `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
    const map: Record<string, any[]> = {};
    items.forEach((m) => { const key = fmt(new Date(m.createdAt)); (map[key] = map[key] || []).push(m); });
    return Object.keys(map).map((date) => ({ date, items: map[date] }));
  };

  

  // 공용: 파일 저장/보관 핸들러
  const saveFileToDevice = async (fileUrl: string, fileName: string) => {
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = fileName || 'file';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      // 네이티브(최소 동작): 시도 후 미지원이면 안내
      try {
        const FileSystem = require('expo-file-system');
        const path = FileSystem.cacheDirectory + (fileName || 'file');
        const res = await FileSystem.downloadAsync(fileUrl, path);
        Alert.alert('저장됨', '파일이 디바이스에 저장되었습니다.');
        return res;
      } catch {
        Alert.alert('안내', '네이티브 저장 모듈 연결 후 지원됩니다.');
      }
    } catch {}
  };

  const addFileToGallery = async (fileUrl: string, fileName: string) => {
      try {
        const uid = firebaseAuth.currentUser?.uid || 'anonymous';
        const keyGlobal = 'chat.media.items';
      const keyUser = `u:${uid}:chat.media.items`;
      const entry = { uri: fileUrl, type: 'file', name: fileName || 'file', public: false, createdAt: Date.now(), by: uid };

      // 글로벌 갤러리
        const rawGlobal = await AsyncStorage.getItem(keyGlobal);
        const listGlobal: any[] = rawGlobal ? JSON.parse(rawGlobal) : [];
      if (!listGlobal.some((it) => it?.uri === entry.uri)) {
        await AsyncStorage.setItem(keyGlobal, JSON.stringify([entry, ...listGlobal]));
      }

      // 사용자별 갤러리
      const rawUser = await AsyncStorage.getItem(keyUser);
      const listUser: any[] = rawUser ? JSON.parse(rawUser) : [];
      if (!listUser.some((it) => it?.uri === entry.uri)) {
        await AsyncStorage.setItem(keyUser, JSON.stringify([entry, ...listUser]));
      }
      Alert.alert('보관함', '파일을 미디어 갤러리에 보관했습니다.');
    } catch { Alert.alert('보관함', '보관에 실패했습니다.'); }
  };
  // 미디어 갤러리로 보관(종류 자동 판별: image/video/file/link)
  const addToMediaGallery = async (uri: string, hint?: string, displayName?: string) => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'anonymous';
      const keyGlobal = 'chat.media.items';
      const keyUser = `u:${uid}:chat.media.items`;
      const metaKeyLocal = `u:${uid}:chat.media.meta`;
      let nameFromMeta: string | undefined;
      // 텍스트 안에 링크가 포함된 경우 첫 번째 링크를 추출하여 저장
      const linkInText = (() => {
        try { const m = String(uri||'').match(/https?:\/\/[^\s]+/i); return m ? m[0] : null; } catch { return null; }
      })();
      if (!/^https?:\/\//i.test(uri) && linkInText) uri = linkInText;
      const deriveName = (u: string) => {
        try { const url = new URL(u); return decodeURIComponent(url.pathname.split('/').pop() || displayName || 'item'); } catch { return displayName || 'item'; }
      };
      const ext = (uri.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
      const isImage = /^data:image\//i.test(uri) || ['png','jpg','jpeg','gif','webp','bmp','heic','heif','avif'].includes(ext);
      const isVideo = /^data:video\//i.test(uri) || ['mp4','mov','m4v','webm','mkv','avi'].includes(ext);
      const isFileByExt = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','7z','tar','gz','json','xml','psd','ai','svg','apk','ipa'].includes(ext);
      const isHttp = /^https?:\/\//i.test(uri) || /^data:/i.test(uri) || /^blob:/i.test(uri);

      const looksQrByUrl = (() => {
        try {
          const s = String(uri).toLowerCase();
          if (/chart\.googleapis\.com\/chart/.test(s) && /[?&]cht=qr\b/.test(s)) return true;
          try {
            const u = new URL(uri);
            const p = decodeURIComponent(String(u.pathname || '').toLowerCase());
            if (p.includes('/qr/')) return true; // Firebase Storage: qr/<uid>/...
          } catch {}
        } catch {}
        return false;
      })();

      const detectQrOnWeb = async (): Promise<boolean> => {
        try {
          if (typeof window === 'undefined') return false;
          const Det: any = (window as any).BarcodeDetector;
          if (!Det) return false;
          const img = document.createElement('img');
          try { img.setAttribute('crossorigin','anonymous'); } catch {}
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = uri; });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d'); if (!ctx) return false; ctx.drawImage(img, 0, 0);
          const det = new Det({ formats: ['qr_code'] });
          const res = await det.detect(canvas as any);
          return Array.isArray(res) && res.some((r:any)=> String(r?.format||'').toLowerCase().includes('qr'));
        } catch { return false; }
      };
      const decideKind = async (): Promise<'image'|'video'|'file'|'link'|'qr'> => {
        // 우선 힌트가 유효한 종류라면 우선 적용
        try {
          const h = String(hint||'').toLowerCase();
          if (h==='image' || h==='video' || h==='file' || h==='link' || h==='qr' || h==='youtube') {
            return (h==='youtube' ? 'video' : (h as any));
          }
          // 파일명 힌트에 확장자가 포함된 경우(예: name.pdf)도 파일로 처리
          if (/\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/i.test(h)) return 'file';
        } catch {}
        if (!isHttp) return 'file';
        if (looksQrByUrl) return 'qr';
        // YouTube 링크는 동영상으로 처리
        try {
          const u = new URL(String(uri));
          const host = u.host.toLowerCase();
          if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host)) return 'video';
        } catch {}
        if (isImage) {
          const isQr = await detectQrOnWeb().catch(()=>false);
          if (isQr) return 'qr';
          return 'image';
        }
        if (isVideo) return 'video';
        // 확장자로 판단이 어려운 Firebase Storage URL은 메타데이터 contentType으로 판정
        try {
          const s = String(uri);
          const m = s.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
          let bucket = ''; let objectPath = '';
          if (m) { bucket = m[1]; objectPath = decodeURIComponent(m[2]); }
          else {
            try {
              const U = new URL(s);
              if ((/\.appspot\.com$/i.test(U.host) || /\.firebasestorage\.app$/i.test(U.host)) && /^\/o\//i.test(U.pathname)) {
                bucket = U.host; objectPath = decodeURIComponent(U.pathname.replace(/^\/o\//i,''));
              }
            } catch {}
          }
          if (bucket && objectPath) {
            const st = getStorage(undefined as any, `gs://${bucket}`);
            // getMetadata는 import 되어 있음 위쪽에서 getStorage 사용 중
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getMetadata } = require('firebase/storage');
            const md = await getMetadata(storageRef(st, objectPath));
            const ct = String((md as any)?.contentType || '').toLowerCase();
            // 메타에서 원래 파일명 추출
            try {
              const orig = (md as any)?.customMetadata?.originalName || '';
              const dispo = String((md as any)?.contentDisposition || '');
              const mfn = /filename\*?=(?:UTF-8'')?([^;]+)/i.exec(dispo);
              const fromDispo = mfn ? decodeURIComponent(mfn[1].replace(/^"(.*)"$/,'$1')) : '';
              nameFromMeta = String(orig || fromDispo || '').trim() || undefined;
            } catch {}
            if (ct.startsWith('video/')) return 'video';
            if (ct.startsWith('image/')) return 'image';
            if (ct === 'application/pdf') return 'file';
          }
        } catch {}
        if (isFileByExt) return 'file';
        // 네트워크 헤더로 최후 판별: Content-Type 검사 (CORS 허용되는 경우)
        try {
          const resp = await fetch(uri, { method: 'HEAD' });
          try {
            const ct = String(resp.headers.get('content-type') || '').toLowerCase();
            const dispo = String(resp.headers.get('content-disposition') || '');
            const mfn = /filename\*?=(?:UTF-8'')?([^;]+)/i.exec(dispo);
            const fromDispo = mfn ? decodeURIComponent(mfn[1].replace(/^"(.*)"$/,'$1')) : '';
            if (fromDispo) nameFromMeta = fromDispo;
            if (ct.startsWith('video/')) return 'video';
            if (ct.startsWith('image/')) return 'image';
            if (ct === 'application/pdf' || ct.startsWith('application/pdf')) return 'file';
          } catch {}
        } catch {}
        // 남은 http(s)는 링크로 처리
        return 'link';
      };

      let kind: 'image'|'video'|'file'|'link'|'qr' = await decideKind();

      // 파일 보관 시 주소 정규화: blob:/data: 는 Storage에 업로드하여 영구 URL로 치환
      const ensureHttpDownloadUrl = async (raw: string): Promise<string> => {
        try {
          // data: → upload
          if (/^data:/i.test(raw)) {
            const m = /^data:([^;]+);/i.exec(raw);
            const mime = (m?.[1] || '').toLowerCase();
            const ext = (/pdf/.test(mime)) ? 'pdf' : (/png/.test(mime)) ? 'png' : (/jpe?g/.test(mime)) ? 'jpg' : (/txt/.test(mime)) ? 'txt' : 'bin';
            const storage = firebaseStorage;
            const r = storageRef(storage, `files/${uid}/${Date.now()}.${ext}`);
            await uploadString(r, raw, 'data_url', { customMetadata: { originalName: displayName || 'file' } } as any);
            return await getDownloadURL(r);
          }
          // blob: → upload
          if (/^blob:/i.test(raw)) {
            const resp = await fetch(raw);
            const b = await resp.blob();
            const mime = String((b as any)?.type || '').toLowerCase();
            const ext = (/pdf/.test(mime)) ? 'pdf' : (/png/.test(mime)) ? 'png' : (/jpe?g/.test(mime)) ? 'jpg' : 'bin';
            const storage = firebaseStorage;
            const r = storageRef(storage, `files/${uid}/${Date.now()}.${ext}`);
            await uploadBytes(r, b, { customMetadata: { originalName: displayName || 'file' } } as any);
            return await getDownloadURL(r);
          }
          // http localhost:8081/<uuid> → fetch & upload
          if (/^https?:\/\/localhost(?::\d+)?\//i.test(raw)) {
            const resp = await fetch(raw);
            const b = await resp.blob();
            const mime = String((b as any)?.type || 'application/octet-stream').toLowerCase();
            const nameFromHint = (displayName || hint || '').toString();
            const extFromName = nameFromHint.split('.').pop()?.toLowerCase() || '';
            const ext = extFromName || ((/pdf/.test(mime)) ? 'pdf' : (/png/.test(mime)) ? 'png' : (/jpe?g/.test(mime)) ? 'jpg' : 'bin');
            const storage = firebaseStorage;
            const r = storageRef(storage, `files/${uid}/${Date.now()}.${ext}`);
            await uploadBytes(r, b, { customMetadata: { originalName: displayName || 'file' } } as any);
            return await getDownloadURL(r);
          }
          // Firebase REST URL 교정: 토큰/alt=media 보강 (버킷 호스트는 그대로 유지)
          if (/firebasestorage\.googleapis\.com\/.*/i.test(raw)) {
            let out = raw;
            if (!/[?&]alt=media\b/i.test(out)) out = out.includes('?') ? `${out}&alt=media` : `${out}?alt=media`;
            // 토큰 없으면 SDK로 fresh URL 발급
            if (!/[?&]token=/.test(out)) {
              const m2 = out.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
              if (m2) {
                try {
                  const bucket = m2[1];
                  const objectPath = decodeURIComponent(m2[2]);
                  const r = storageRef(getStorage(undefined as any, `gs://${bucket}`), objectPath);
                  out = await getDownloadURL(r);
                } catch {}
              }
            }
            return out;
          }
        } catch {}
        return raw;
      };

      if (kind === 'file') {
        try {
          const original = String(uri);
          const resolved = await ensureHttpDownloadUrl(uri);
          uri = resolved || original;
          // 원본이 로컬/UUID였으면 메타에 매핑 저장 (미리보기 해석용)
          try {
            if (!/^https?:\/\//i.test(original) || /localhost/i.test(original)) {
              const rawM = await AsyncStorage.getItem(metaKeyLocal);
              const m = rawM ? JSON.parse(rawM) : {};
              m[original] = { ...(m[original]||{}), resolved: uri, name: displayName || deriveName(uri) };
              await AsyncStorage.setItem(metaKeyLocal, JSON.stringify(m));
            }
          } catch {}
          // Firebase Storage 메타데이터로 실제 타입 재판정 (video면 비디오 탭으로)
          try {
            const s = String(uri);
            const m2 = s.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
            let bucket = ''; let objectPath = '';
            if (m2) { bucket = m2[1]; objectPath = decodeURIComponent(m2[2]); }
            else {
              try { const U = new URL(s); if ((/\.appspot\.com$/i.test(U.host) || /\.firebasestorage\.app$/i.test(U.host)) && /^\/o\//i.test(U.pathname)) { bucket = U.host; objectPath = decodeURIComponent(U.pathname.replace(/^\/o\//i,'')); } } catch {}
            }
            if (bucket && objectPath) {
              const st = getStorage(undefined as any, `gs://${bucket}`);
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const { getMetadata } = require('firebase/storage');
              const md = await getMetadata(storageRef(st, objectPath));
              const ct = String((md as any)?.contentType || '').toLowerCase();
              if (ct.startsWith('video/')) kind = 'video';
              else if (ct.startsWith('image/')) kind = 'image';
            }
          } catch {}
        } catch {}
      }

      const entryName = displayName || nameFromMeta || (()=>{ try { const nm = deriveName(uri); return nm; } catch { return 'item'; } })();
      const entry = { uri, type: kind, name: entryName, public: false, createdAt: Date.now(), by: uid } as any;

      // 이름 메타를 사용자 로컬 메타맵(u:uid:chat.media.meta)에 즉시 기록하여 갤러리/뷰어에서 원본 파일명으로 표시
      try {
        const norm = (()=>{ try { const U=new URL(String(uri)); U.search=''; U.hash=''; return U.toString(); } catch { return String(uri); } })();
        const rawM = await AsyncStorage.getItem(metaKeyLocal);
        const m = rawM ? JSON.parse(rawM) : {};
        m[norm] = { ...(m[norm]||{}), name: entry.name, type: kind };
        await AsyncStorage.setItem(metaKeyLocal, JSON.stringify(m));
      } catch {}

      const saveList = async (key: string) => {
        const raw = await AsyncStorage.getItem(key);
        const list: any[] = raw ? JSON.parse(raw) : [];
        if (!list.some((it) => it?.uri === entry.uri)) {
          await AsyncStorage.setItem(key, JSON.stringify([entry, ...list]));
        }
      };
      // 링크는 image 리스트에 포함되지 않도록 저장만 하고 썸네일 생성 없음
      await saveList(keyGlobal);
      await saveList(keyUser);
      // SSOT 업데이트(링크/QR 탭 반영)
      try {
        const store = require('@/src/features/chat/store/media.store');
        const id = store.mediaIdForUri(String(uri));
        const payload: any = { id, location: 'gallery', visibility: 'private', name: entry.name, type: kind };
        payload.uriHttp = uri;
        payload.by = uid;
        payload.createdAt = Date.now();
        store.useMediaStore.getState().addOrUpdate(payload);
      } catch {}
      // PDF 썸네일: 갤러리 즉시 반영을 위해 백그라운드 생성/캐시 (웹 전용, CDN 로더 사용)
      try {
        if (Platform.OS === 'web' && /\.pdf(\?|$)/i.test(String(uri))) {
          const loadPdfJsViaCdn = () => new Promise<any>((res, rej) => {
            try {
              if ((window as any).pdfjsLib) { res((window as any).pdfjsLib); return; }
              const s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
              s.onload = () => res((window as any).pdfjsLib);
              s.onerror = rej;
              document.head.appendChild(s);
            } catch (e) { rej(e); }
          });
          const pdfjsLib: any = await loadPdfJsViaCdn();
          try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; } catch {}
          const loadingTask = pdfjsLib.getDocument(String(uri));
          const pdf = await loadingTask.promise; const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
          const ctx = canvas.getContext('2d'); if (ctx) { await page.render({ canvasContext: ctx, viewport }).promise; const dataUrl = canvas.toDataURL('image/png'); try { await AsyncStorage.setItem(`pdf.thumb:${uri}`, dataUrl); } catch {} }
        }
      } catch {}
      Alert.alert('보관함', '미디어 갤러리에 보관했습니다.');
    } catch { Alert.alert('보관함','보관에 실패했습니다.'); }
  };

  const [imageViewer, setImageViewer] = useState<{ url: string; senderId?: string; createdAt?: number; messageId?: string; index?: number; displayName?: string; avatar?: string; kind?: 'image'|'video'|'youtube'|'web'|'map' } | null>(null);
  const [fileViewer, setFileViewer] = useState<{ url: string; name: string; messageId?: string } | null>(null);
  const [mapViewer, setMapViewer] = useState<{ url: string; title: string; messageId?: string } | null>(null);
  // 퀵 메뉴(스와이프): 말풍선 바깥 오버레이
  const [quickMenu, setQuickMenu] = useState<{ id: string; display?: string; fileUrl?: string | null; mapUrl?: string | null; linkUrl?: string | null } | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [mapInfo, setMapInfo] = useState<{ lat?: string; lng?: string; addr?: string } | null>(null);
  // PDF 썸네일 캐시(웹)
  const [pdfThumbsChat, setPdfThumbsChat] = useState<Record<string, string>>({});
  const pdfKey = useCallback((s: string): string => {
    try { const u = new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { try { return String(s).split('?')[0]; } catch { return String(s||''); } }
  }, []);
  const ensurePdfThumbChat = useCallback(async (url: string): Promise<string> => {
    try {
      if (Platform.OS !== 'web') return '';
      if (!/\.pdf(\?|$)/i.test(String(url))) return '';
      const k0 = pdfKey(url);
      if (pdfThumbsChat[k0]) return pdfThumbsChat[k0];
      try { const c = await AsyncStorage.getItem(`pdf.thumb:${k0}`); if (c) { setPdfThumbsChat(p=>({ ...p, [k0]: c })); return c; } } catch {}
      const ensureFirebaseDirect = (u: string) => {
        try { let out = u; const needAlt = (s: string) => /firebasestorage\.googleapis\.com/i.test(s) || /\.appspot\.com\b/i.test(s) || /\.firebasestorage\.app\b/i.test(s); if (needAlt(out) && !/[?&]alt=media\b/i.test(out)) out = out.includes('?') ? `${out}&alt=media` : `${out}?alt=media`; return out; } catch { return u; }
      };
      const getProxyUrl = (raw: string) => { try { const base = (typeof window !== 'undefined' && window.location) ? `${window.location.protocol}//localhost:8080` : 'http://localhost:8080'; return `${base}/api/pdf-proxy?url=${encodeURIComponent(raw)}`; } catch { return raw; } };
      // URL 정규화: 토큰 없거나 잘못된 버킷일 수 있으므로 SDK로 fresh URL 시도
      let effective = String(url);
      try {
        const m = effective.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
        const hasToken = /[?&]token=/.test(effective);
        if (m && !hasToken) {
          const bucket = m[1]; const objectPath = decodeURIComponent(m[2]);
          const candidates = [bucket, bucket.replace(/\.appspot\.com$/i, '.firebasestorage.app'), bucket.replace(/\.firebasestorage\.app$/i, '.appspot.com')].filter((v,i,a)=>v && a.indexOf(v)===i);
          for (const b of candidates) {
            try {
              const r = storageRef(getStorage(undefined as any, `gs://${b}`), objectPath);
              const dl = await getDownloadURL(r);
              effective = dl; break;
            } catch {}
          }
        }
      } catch {}
      const direct = ensureFirebaseDirect(String(effective));
      const proxied = getProxyUrl(direct);
      const pdfjsLib = (await import('pdfjs-dist/build/pdf')).default || (await import('pdfjs-dist/build/pdf')) as any;
      try { (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; } catch {}
      const candidates = [proxied, direct];
      let dataUrl = '';
      for (const cand of candidates) {
        try {
          const loadingTask = (pdfjsLib as any).getDocument(cand);
          const pdf = await loadingTask.promise; const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
          const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no-ctx');
          await page.render({ canvasContext: ctx, viewport }).promise;
          dataUrl = canvas.toDataURL('image/png');
          break;
        } catch {}
      }
      if (!dataUrl) return '';
      const k1 = pdfKey(url); const k2 = pdfKey(effective); const k3 = pdfKey(direct);
      setPdfThumbsChat(p=>({ ...p, [k1]: dataUrl, [k2]: dataUrl, [k3]: dataUrl }));
      try { await AsyncStorage.multiSet([[`pdf.thumb:${k1}`, dataUrl],[`pdf.thumb:${k2}`, dataUrl],[`pdf.thumb:${k3}`, dataUrl]]); } catch {}
      return dataUrl;
    } catch { return ''; }
  }, [pdfThumbsChat, pdfKey]);
  const [menuFor, setMenuFor] = useState<null | { item: any; display: string; fileUrl?: string | null; imageUrl?: string | null; mapUrl?: string | null }>(null);
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 다중 삭제 모드
  const [multiDeleteMode, setMultiDeleteMode] = useState(false);
  useEffect(() => {
    try {
      const g:any = (globalThis as any); g.__multiDelete = g.__multiDelete || {};
      if (g.__multiDelete[roomId]) setMultiDeleteMode(true);
    } catch {}
  }, [roomId]);
  // 방이 바뀔 때 선택 상태/모드 초기화 후, 방별 저장값으로 복원
  useEffect(() => {
    setDeleteSelection(new Set());
    setMultiDeleteMode(false);
    try { const g:any=(globalThis as any); g.__multiDelete=g.__multiDelete||{}; g.__multiDelete[roomId]=false; } catch {}
    let alive = true;
    (async () => {
      try { const v = await AsyncStorage.getItem(`room:${roomId}:multiDelete`); if (!alive) return; if (String(v)==='1') setMultiDeleteMode(true); } catch {}
    })();
    return () => { alive = false; };
  }, [roomId]);
  // 방 재입장 시 저장된 다중선택 모드 복원 (전역 변수 외에 AsyncStorage에도 저장)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const key = `room:${roomId}:multiDelete`;
        const v = await AsyncStorage.getItem(key);
        if (!alive) return;
        if (String(v) === '1') setMultiDeleteMode(true);
      } catch {}
    })();
    return () => { alive = false; };
  }, [roomId]);
  useEffect(() => {
    (async () => { try { await AsyncStorage.setItem(`room:${roomId}:multiDelete`, multiDeleteMode ? '1' : '0'); } catch {} })();
  }, [multiDeleteMode, roomId]);
  const [deleteSelection, setDeleteSelection] = useState<Set<string>>(new Set());
  const multiDeleteOn = multiDeleteMode;
  const toggleDeleteSelect = useCallback((id: string) => {
    try { if (Platform.OS !== 'web') { UIManager.setLayoutAnimationEnabledExperimental && UIManager.setLayoutAnimationEnabledExperimental(true); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } } catch {}
    setDeleteSelection((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  // 전달/보관: 전역 모달 사용으로 지역 상태 제거
  const roomsAll = useKakaoRoomsStore((s) => s.rooms);
  const [forwardFriends, setForwardFriends] = useState<any[]>([]);
  // 메시지 만료 시점에만 목록 리렌더를 유도하는 bump
  const [expireBump, setExpireBump] = useState(0);
  const bumpExpire = useCallback(() => setExpireBump((v) => (v + 1) % 1_000_000_000), []);

  // 이미지 뷰어가 지도일 때 주소/좌표 파싱 및 역지오코딩
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (imageViewer?.kind !== 'map' || !imageViewer?.url) { if (alive) setMapInfo(null); return; }
        const raw = String(imageViewer.url);
        let lat: string | undefined; let lng: string | undefined;
        try { const u = new URL(raw); const m = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/i); if (m) { lat=m[1]; lng=m[2]; } } catch {}
        if (!(lat&&lng)) { try { const u=new URL(raw); const ll=u.searchParams.get('ll'); if (ll && /-?\d+\.?\d*,-?\d+\.?\d*/.test(ll)) { const [a,b]=ll.split(','); lat=a; lng=b; } } catch {} }
        if (!(lat&&lng)) { try { const u=new URL(raw); const q=u.searchParams.get('q'); if (q && /-?\d+\.?\d*,-?\d+\.?\d*/.test(q)) { const [a,b]=q.split(','); lat=a; lng=b; } } catch {} }
        let addr: string | undefined;
        try { if (lat && lng) { const pretty = await reverseGeocode(parseFloat(lat), parseFloat(lng)); if (pretty) addr = pretty; } } catch {}
        if (!alive) return;
        setMapInfo({ lat, lng, addr });
      } catch { if (alive) setMapInfo(null); }
    })();
    return () => { alive = false; };
  }, [imageViewer?.url, imageViewer?.kind]);

  // Memoized list props to keep hooks order stable (depend on expireBump which is now defined above)
  const messagesForList = useMemo(() => {
    try {
      const type = (useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type;
      const isTtlRoom = String(type) === 'ttl';
      const ttlRaw = Number(room?.messageTtlMs || 0);
      const ttlMs = isTtlRoom ? (ttlRaw > 0 ? ttlRaw : 180000) : 0; // TTL 방 기본 3분 폴백
      if (ttlMs > 0) {
        const now = Date.now();
        return messages.filter((m:any) => now - (m.createdAt || 0) < ttlMs);
      }
    } catch {}
    return messages;
  }, [messages, room?.messageTtlMs, expireBump, roomId]);
  const keyExtractorCb = useCallback((item: any) => item.id, []);
  const renderItemCb = useCallback(({ item }: any) => (
    <MessageBubble
      item={item}
      onExpire={bumpExpire}
      multiDeleteOn={multiDeleteMode}
      selected={deleteSelection.has(item.id)}
    />
  ), [bumpExpire, multiDeleteMode, deleteSelection]);
  // 이미지/비디오/유튜브 목록(현재 탭의 순서)
  const imageList = useMemo(() => {
    try {
      const profiles = profilesAll || {};
      const chatNameFor = (uid: string) => {
        const p = profiles[uid] || {};
        return p.chatName || p.nickname || p.nick || p.alias || p.displayName || p.username || p.email || uid;
      };
      const out: any[] = [];
      (messagesForList || []).forEach((m: any) => {
        if (Array.isArray(m.albumUrls) && m.albumUrls.length) {
          m.albumUrls.forEach((u: string) => {
            out.push({
              url: u,
              senderId: m.senderId,
              createdAt: m.createdAt,
              messageId: m.id,
              displayName: chatNameFor(m.senderId),
              avatar: profiles[m.senderId]?.avatar || '',
              kind: 'image',
            });
          });
        } else if (m.imageUrl) {
          out.push({
            url: m.imageUrl as string,
            senderId: m.senderId,
            createdAt: m.createdAt,
            messageId: m.id,
            displayName: chatNameFor(m.senderId),
            avatar: profiles[m.senderId]?.avatar || '',
            kind: String(m.type) === 'video' ? 'video' : (String(m.type) === 'file' ? 'web' : 'image'),
          });
        } else if (String(m.type) === 'video') {
          // 텍스트에 URL만 있고 imageUrl이 비어있는 비디오 메시지
          try {
            const hit = String(m.content||'').match(/(blob:[^\s]+|https?:\/\/[^\s]+)/i)?.[0];
            if (hit) out.push({ url: hit, senderId: m.senderId, createdAt: m.createdAt, messageId: m.id, displayName: chatNameFor(m.senderId), avatar: profiles[m.senderId]?.avatar || '', kind: 'video' });
          } catch {}
        } else if (m.content && /https?:\/\//i.test(String(m.content))) {
          // 유튜브 링크를 감지하여 동일 뷰어로 처리
          try {
            const link = String(m.content).match(/https?:\/\/[^\s]+/i)?.[0] || '';
            if (link) {
              const u = new URL(link);
              const host = u.host.toLowerCase();
              if (/youtube\.com$/.test(host) || /youtu\.be$/.test(host)) {
                out.push({ url: link, senderId: m.senderId, createdAt: m.createdAt, messageId: m.id, displayName: chatNameFor(m.senderId), avatar: profiles[m.senderId]?.avatar || '', kind: 'youtube' });
              } else if (/(^|\.)maps\.google\.com$/.test(host) || /openstreetmap\.org/i.test(host)) {
                out.push({ url: link, senderId: m.senderId, createdAt: m.createdAt, messageId: m.id, displayName: chatNameFor(m.senderId), avatar: profiles[m.senderId]?.avatar || '', kind: 'map' });
              } else {
                out.push({ url: link, senderId: m.senderId, createdAt: m.createdAt, messageId: m.id, displayName: chatNameFor(m.senderId), avatar: profiles[m.senderId]?.avatar || '', kind: 'web' });
              }
            }
          } catch {}
        }
      });
      return out;
    } catch { return [] as any[]; }
  }, [messagesForList]);

  const openImageViewer = useCallback((message: any, senderNameOverride?: string, avatarOverride?: string, specificUrl?: string, kindOverride?: 'image'|'video'|'youtube'|'web'|'map') => {
    try {
      let idx = -1;
      if (specificUrl) idx = imageList.findIndex((im:any) => im.messageId === message.id && String(im.url) === String(specificUrl));
      if (idx < 0) idx = imageList.findIndex((im:any) => im.messageId === message.id);
      const cur = idx >= 0 ? { ...imageList[idx], index: idx, displayName: senderNameOverride, avatar: avatarOverride } : { url: specificUrl || message.imageUrl, senderId: message.senderId, createdAt: message.createdAt, messageId: message.id, index: -1, displayName: senderNameOverride, avatar: avatarOverride, kind: kindOverride || message.kind };
      setImageViewer(cur);
    } catch { setImageViewer({ url: message.imageUrl, senderId: message.senderId, createdAt: message.createdAt, messageId: message.id, kind: kindOverride || message.kind }); }
  }, [imageList]);

  // 이미지 뷰어: 키보드 좌우 이동/ESC 닫기, 스와이프 제스처
  const goPrevImage = useCallback(() => {
    try {
      if (typeof imageViewer?.index !== 'number') return;
      const idx = Number(imageViewer.index);
      if (idx > 0) { const prev = imageList[idx - 1]; if (prev) setImageViewer({ ...prev, index: idx - 1 }); }
    } catch {}
  }, [imageViewer?.index, imageList]);
  const goNextImage = useCallback(() => {
    try {
      if (typeof imageViewer?.index !== 'number') return;
      const idx = Number(imageViewer.index);
      if (idx < imageList.length - 1) { const next = imageList[idx + 1]; if (next) setImageViewer({ ...next, index: idx + 1 }); }
    } catch {}
  }, [imageViewer?.index, imageList]);
  useEffect(() => {
    if (!imageViewer) return;
    if (Platform.OS !== 'web') return; // 키보드는 웹 우선 적용
    const onKey = (e: any) => {
      try {
        if (e.key === 'ArrowLeft') { e.preventDefault?.(); goPrevImage(); }
        else if (e.key === 'ArrowRight') { e.preventDefault?.(); goNextImage(); }
        else if (e.key === 'Escape') { e.preventDefault?.(); setImageViewer(null); }
      } catch {}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageViewer, goPrevImage, goNextImage]);
  const viewerTouchXRef = useRef<number | null>(null);
  const viewerTouchYRef = useRef<number | null>(null);
  const lastTapAtRef = useRef<number>(0);
  const [imageZoom, setImageZoom] = useState(false);
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  useEffect(() => { setImageZoom(false); setPanX(0); setPanY(0); }, [imageViewer?.messageId, imageViewer?.index]);
  useEffect(() => { if (imageZoom) { setPanX(0); setPanY(0); setZoomScale(1); } }, [imageZoom]);
  // 뷰어 컨테이너 크기 및 패닝 상태
  const [viewerSize, setViewerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const movedRef = useRef<boolean>(false);
  const mouseActiveRef = useRef<boolean>(false);

  // 자동 스크롤 제거: 새 메시지 도착해도 사용자 움직임 없으면 위치 유지

  const addToTreasureBox = async (entry: { uri: string; type: 'image'|'file'|'link'|'text'; name?: string }) => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'me';
      const key = `u:${uid}:treasure.items`;
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(key, JSON.stringify([{ ...entry, createdAt: Date.now() }, ...list]));
      Alert.alert('보관함','보물창고에 보관했습니다.');
    } catch { Alert.alert('보관함','보관에 실패했습니다.'); }
  };
  // 웹: 이미지 클립보드 복사 유틸
  const copyImageToClipboardWeb = async (src: string) => {
    if (Platform.OS !== 'web') throw new Error('web only');
    const toBlob = async (u: string): Promise<Blob> => {
      // data URL → Blob
      if (/^data:image\//i.test(u)) {
        const m = /^data:([^;]+);base64,(.*)$/i.exec(u);
        if (!m) throw new Error('bad data url');
        const mime = m[1];
        const bstr = atob(m[2]);
        const len = bstr.length; const u8 = new Uint8Array(len);
        for (let i=0;i<len;i++) u8[i] = bstr.charCodeAt(i);
        return new Blob([u8], { type: mime });
      }
      // 우선 직접 fetch 시도 (동일 출처 등)
      if (/^https?:/i.test(u) || /^blob:/i.test(u)) {
        try {
          const r1 = await fetch(u, { mode: 'cors' as any, credentials: 'omit' as any });
          if (r1.ok) return await r1.blob();
        } catch {}
        // 프록시 경유 (NEXT_PUBLIC_PREVIEW_API 또는 현재 오리진)
        try {
          const api = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || `${window.location.origin}/api/link-preview`;
          const root = String(api).replace(/\/?api\/link-preview$/, '');
          const proxied = `${root}/api/img?src=${encodeURIComponent(u)}`;
          const r2 = await fetch(proxied, { mode: 'cors' as any, credentials: 'omit' as any });
          if (r2.ok) return await r2.blob();
        } catch {}
      }
      // 동일 출처 캔버스 폴백
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.src = u;
      await new Promise<void>((res, rej)=>{ img.onload=()=>res(); img.onerror=()=>rej(new Error('img load fail')); });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no ctx');
      ctx.drawImage(img, 0, 0);
      const b: Blob | null = await new Promise((res)=> canvas.toBlob(res as any, 'image/png'));
      if (!b) throw new Error('toBlob fail');
      return b;
    };
    // 1차: ClipboardItem API 사용
    try {
      let blob = await toBlob(src);
      // 모든 포맷을 PNG로 표준화 (브라우저/앱 붙여넣기 호환성 확보)
      const toPng = async (b: Blob): Promise<Blob> => {
        try {
          const bmp = await createImageBitmap(b as any);
          const maxSide = 2560; // 제한 해상도
          let { width, height } = bmp;
          const ratio = Math.min(1, maxSide / Math.max(width, height));
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(bmp, 0, 0, width, height);
          const out: Blob | null = await new Promise((res) => canvas.toBlob((bb)=>res(bb), 'image/png'));
          if (out) return out;
      } catch {}
        return b; // 실패 시 원본 유지
      };

      blob = await toPng(blob);
      const anyWin: any = window as any;
      const ClipboardItemCtor = anyWin.ClipboardItem || (anyWin as any).window?.ClipboardItem;
      if (ClipboardItemCtor && (navigator as any).clipboard?.write) {
        await (navigator as any).clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
      return;
    }
      throw new Error('no clipboarditem');
    } catch {}

    // 2차 폴백: execCommand copy (선택 영역에 IMG 넣고 복사)
    await new Promise<void>((resolve, reject) => {
      try {
        const api = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || `${window.location.origin}/api/link-preview`;
        const root = String(api).replace(/\/?api\/link-preview$/, '');
        const proxied = /^https?:/i.test(src) ? `${root}/api/img?src=${encodeURIComponent(src)}` : src;
        const holder = document.createElement('div');
        holder.contentEditable = 'true';
        holder.style.position = 'fixed';
        holder.style.left = '-9999px';
        const img = document.createElement('img');
        img.src = proxied;
        img.crossOrigin = 'anonymous';
        holder.appendChild(img);
        document.body.appendChild(holder);
        const doCopy = () => {
          const range = document.createRange();
          range.selectNodeContents(holder);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          const ok = document.execCommand('copy');
          sel?.removeAllRanges();
          holder.remove();
          ok ? resolve() : reject(new Error('execCommand failed'));
        };
        if (img.complete) doCopy(); else img.onload = doCopy;
      } catch (e) { reject(e as any); }
    });

    // 3차 폴백: Canvas 그리기 후 toBlob → write (일부 브라우저에서 copy 차단 시)
    try {
      const api = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || `${window.location.origin}/api/link-preview`;
      const root = String(api).replace(/\/?api\/link-preview$/, '');
      const proxied = /^https?:/i.test(src) ? `${root}/api/img?src=${encodeURIComponent(src)}` : src;
                const img = new Image();
      img.crossOrigin = 'anonymous';
      const blob: Blob = await new Promise((resolve, reject) => {
                img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
            const ctx = c.getContext('2d');
            if (!ctx) return reject(new Error('canvas')); ctx.drawImage(img, 0, 0);
            c.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob')), 'image/png');
          } catch (e) { reject(e as any); }
        };
        img.onerror = reject; img.src = proxied;
      });
      const anyWin: any = window as any; const ClipboardItemCtor = anyWin.ClipboardItem || (anyWin as any).window?.ClipboardItem;
      if (ClipboardItemCtor && (navigator as any).clipboard?.write) await (navigator as any).clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
        } catch {}
    // 4차 폴백: 이미지 URL 텍스트 복사
    try { await (navigator as any)?.clipboard?.writeText?.(src); } catch {}
  };

  // 지도 정적 이미지 URL 생성 (Google Static Maps 우선, 폴백 OSM)
  const buildStaticMapUrl = (rawUrl: string): string => {
    try {
      const u = new URL(String(rawUrl||''));
      const h = u.host.toLowerCase();
      let lat: string | null = null;
      let lng: string | null = null;
      let q: string | null = null;
      // @lat,lng,zoomz 패턴
      try {
        const m = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/i);
        if (m) { lat = m[1]; lng = m[2]; }
      } catch {}
      // ll=lat,lng
      if (!lat || !lng) {
        try {
          const ll = u.searchParams.get('ll');
          if (ll && /-?\d+\.\d+,-?\d+\.\d+/.test(ll)) { const [a,b] = ll.split(','); lat=a; lng=b; }
        } catch {}
      }
      // q=address 또는 lat,lng
      try { q = u.searchParams.get('q'); } catch {}
      const hasLatLng = !!(lat && lng);
      const key = (Constants as any)?.expoConfig?.extra?.GOOGLE_STATIC_MAPS_KEY || (process as any)?.env?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
      const zoom = 16;
      const size = '1280x720';
      if (key) {
        if (hasLatLng) {
          return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(lat+','+lng)}&zoom=${zoom}&size=${size}&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(lat+','+lng)}&key=${encodeURIComponent(key)}`;
        }
        const center = q ? q : 'Seoul';
        return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center||'Seoul')}&zoom=${zoom}&size=${size}&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(center||'Seoul')}&key=${encodeURIComponent(key)}`;
      }
      // OSM 폴백
      if (hasLatLng) {
        return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(lat+','+lng)}&zoom=${zoom}&size=1280x720&markers=${encodeURIComponent(lat+','+lng+',red-pushpin')}`;
      }
      return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(q||'Seoul')}&zoom=${zoom}&size=1280x720`;
    } catch {
      return String(rawUrl||'');
    }
  };

  // 지도 임베드 URL 생성 (웹 전용, 확대/레이어 컨트롤 제공)
  const buildMapEmbedUrl = (rawUrl: string): string => {
    try {
      const u = new URL(String(rawUrl||''));
      const h = u.host.toLowerCase();
      // lat,lng 우선 추출
      let lat: string | undefined; let lng: string | undefined; let q: string | undefined;
      try { const m = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/i); if (m) { lat=m[1]; lng=m[2]; } } catch {}
      if (!(lat&&lng)) { try { const ll = u.searchParams.get('ll'); if (ll && /-?\d+\.?\d*,-?\d+\.?\d*/.test(ll)) { const [a,b]=ll.split(','); lat=a; lng=b; } } catch {} }
      if (!(lat&&lng)) { try { const qq = u.searchParams.get('q'); if (qq) { q = qq; if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(qq)) { const [a,b]=qq.split(','); lat=a; lng=b; } } } catch {} }
      const zoom = 16;
      if (/maps\.google\.|google\..*\/maps/i.test(h) || /google\./i.test(h)) {
        if (lat && lng) return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(lat+','+lng)}&z=${zoom}`;
        if (q) return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(q)}`;
        return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(u.toString())}`;
      }
      // generic → 구글 임베드로 프록시
      if (lat && lng) return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(lat+','+lng)}&z=${zoom}`;
      if (q) return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(q)}`;
      return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(u.toString())}`;
    } catch {
      return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(String(rawUrl||''))}`;
    }
  };
  // 웹: 채팅 입력창에서 이미지 붙여넣기 → 즉시 이미지 전송
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPaste = (e: any) => {
      try {
        if (!inputFocusedRef.current) return;
        const items = (e.clipboardData && e.clipboardData.items) || [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it && typeof it.type === 'string' && it.type.indexOf('image/') === 0) {
            const file = it.getAsFile();
            if (!file) continue;
            e.preventDefault();
            const uid = firebaseAuth.currentUser?.uid || 'me';
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const dataUrl = String(reader.result || '');
                let imageUrl = dataUrl;
                if (/^data:image\//i.test(dataUrl)) {
                  try {
                    try { await ensureAppCheckReady(); } catch {}
                    const storage = firebaseStorage;
                    const path = `chat/${uid}/${Date.now()}.png`;
                    const r = storageRef(storage, path);
                    await uploadString(r, dataUrl, 'data_url', { customMetadata: { originalName: 'pdf-thumb' } } as any);
                    imageUrl = await getDownloadURL(r);
                  } catch {}
                }
                // 로컬 즉시 표시용 optimistic 메시지: http URL이 준비되기 전이라도 data URL 유지
                sendMessage(roomId, uid, '', 'image', imageUrl || dataUrl);
                lockAtBottomRef.current = true; scrollToBottom(true);
              } catch {}
            };
            reader.readAsDataURL(file);
            break;
            }
          }
        } catch {}
    };
    document.addEventListener('paste', onPaste as any);
    return () => document.removeEventListener('paste', onPaste as any);
  }, [roomId]);

  const MessageBubble = memo(function MessageBubble({ item, onExpire, multiDeleteOn: multiDeleteOnProp, selected: selectedProp }: { item: any; onExpire?: () => void; multiDeleteOn?: boolean; selected?: boolean }) {
    const themeSettings = useKakaoRoomsStore((s) => s.roomSettings[roomId]?.theme);
    const globalAppearance = useChatSettingsStore((s)=> s.appearance);
    const permSettings = useKakaoRoomsStore((s) => s.roomSettings[roomId]?.permissions);
    const fontScale = Math.max(0.8, Math.min(1.4, Number(themeSettings?.fontScale || globalAppearance?.fontScale || 1)));
    const bubbleColorOverride = String(themeSettings?.bubbleColor || (()=>{
      const c = String(globalAppearance?.bubbleColor||'default');
      switch (c) {
        case 'gold': return '#D4AF37';
        case 'purple': return '#6C5CE7';
        case 'mint': return '#00C2A0';
        case 'red': return '#FF6B6B';
        case 'white': return '#FFFFFF';
        default: return '';
      }
    })());
    const allowLinks = permSettings?.allowLinks !== false;
    const hexToRgb = (hex?: string): { r: number; g: number; b: number } | null => {
      try {
        if (!hex) return null;
        const h = hex.replace('#','');
        const v = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
        const num = parseInt(v,16);
        return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
      } catch { return null; }
    };
    const getContrastColor = (hex?: string): string => {
      try {
        const norm = String(hex || '').trim().toLowerCase();
        // Force black text on gold/yellow chat bubbles for readability
        if (norm === '#d4af37' || norm === 'd4af37' || norm === '#ffd700' || norm === 'ffd700') {
          return '#111';
        }
        const rgb = hexToRgb(norm || '#ffffff') || { r:255,g:255,b:255 };
        const srgb = [rgb.r, rgb.g, rgb.b].map(c => { const x=c/255; return x<=0.03928? x/12.92 : Math.pow((x+0.055)/1.055,2.4); });
        const L = 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
        return L > 0.5 ? '#111' : '#FFFFFF';
      } catch { return '#111'; }
    };
    const myUid = useMemo(() => {
      try { return String(firebaseAuth.currentUser?.uid || '') as string; } catch { return ''; }
    }, [firebaseAuth.currentUser?.uid]);
    const senderNormalized = String(item?.senderId === 'me' || !item?.senderId ? myUid : item?.senderId);
    const isMe = String(senderNormalized) === String(myUid);
    const isSelected = Boolean(selectedProp ?? ((multiDeleteMode || deleteSelection.size > 0) && deleteSelection.has(item.id)));
    const [selectedSnap, setSelectedSnap] = useState<boolean>(isSelected);
    useEffect(() => { setSelectedSnap(isSelected); }, [isSelected]);
    // Ensure checkbox visibility reacts to prop even if outer state didn't change data
    const multiDeleteOn = Boolean(multiDeleteOnProp ?? multiDeleteMode);
    const hasImage = (item.type === 'image' && !!item.imageUrl) || (Array.isArray(item.albumUrls) && item.albumUrls.length > 0);
    const display = item.content || (hasImage ? '' : '');
    const isFileLink = !hasImage && /\bhttps?:\/\/|\bblob:|\bdata:/.test(display) && /📎\s/.test(display);
    const isExplicitFile = (String(item.type) === 'file') && !!item.imageUrl;
    const isVideoType = String(item.type) === 'video';
    const rawText = String(display || '').trim();
    const strictLoc = rawText.match(/^@?https?:\/\/maps\.google\.com\/\?q=([\-\d\.]+),\s*([\-\d\.]+)/i);
    const anyLoc = rawText.match(/https?:\/\/maps\.google\.com\/\?q=([\-\d\.]+),\s*([\-\d\.]+)/i);
    const isLocation = !hasImage && !!(strictLoc || anyLoc);
    const locLat = (strictLoc && strictLoc[1]) || (anyLoc && anyLoc[1]) || null;
    const locLng = (strictLoc && strictLoc[2]) || (anyLoc && anyLoc[2]) || null;
    const mapUrl = isLocation ? (() => {
      const hit = display.match(/https?:\/\/[^\s]+/i)?.[0] || '';
      if (/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/.test(hit)) return hit;
      if (locLat && locLng) return `https://maps.google.com/?q=${locLat},${locLng}`;
      return hit || '';
    })() : '';
    const fileUrlMatch = isFileLink ? display.match(/(blob:[^\s]+|https?:\/\/[^\s]+)/i) : null;
    const parsedFileUrl = fileUrlMatch ? fileUrlMatch[0] : null;
    const explicitFileUrl = isExplicitFile ? String(item.imageUrl || '') : null;
    const videoPreferredUrl = isVideoType ? String(item.imageUrl || parsedFileUrl || '') : '';
    // 파일 URL 정규화(말풍선 텍스트에서 추출 시 꼬리 문자 제거 등)
    const sanitizeUrl = (u?: string | null) => {
      try {
        if (!u) return '';
        let s = String(u).trim();
        // 양끝 따옴표/괄호 제거
        s = s.replace(/^['"<\(\[]+/, '').replace(/[>\)\]]+$/, '');
        // 줄바꿈/제어문자 제거
        s = s.replace(/[\r\n\t]/g, '');
        // 말풍선 내 붙는 구두점 제거(.,;:) 단, 쿼리스트링/확장자 뒤는 유지
        s = s.replace(/([\)\]\}\.!;,：]+)$/u, '');
        // 유효성 체크
        if (/^blob:|^data:|^https?:\/\//i.test(s)) return s;
        return '';
      } catch { return String(u||''); }
    };
    const fileUrl = sanitizeUrl(explicitFileUrl || videoPreferredUrl || parsedFileUrl);
    // 미디어 이름 캐시 선조회 + 프리페치
    const cacheName = (() => { try { const U=new URL(String(fileUrl||'')); U.search=''; U.hash=''; return mediaNameCache[U.toString()]; } catch { return undefined; } })();
    useEffect(() => { try { if (fileUrl) ensureMediaNameChat(String(fileUrl)); } catch {} }, [fileUrl]);
    const fileName = (() => {
      if (/📎\s/.test(display)) {
        const raw = (display.split('📎')[1] || '').trim();
        return raw.replace(/:\s*(blob:|https?:\/\/).*$/,'').trim();
      }
      if (/^\s*🎬\s*/.test(display)) {
        const first = String(display).split(/\r?\n/)[0] || '';
        return first.replace(/^\s*🎬\s*/,'').replace(/:\s*(blob:|https?:\/\/).*$/,'').trim();
      }
      if (cacheName) return cacheName;
      // fallback: derive from URL
      try { const u = new URL(String(fileUrl||'')); return decodeURIComponent(u.pathname.split('/').pop()||'file'); } catch { return 'file'; }
    })();
    const urlForExt = String(fileUrl || fileName || '').split('?')[0].split('#')[0];
    const fileExt = (urlForExt.split('.').pop() || '').toLowerCase();
    const isImageFile = (/^data:image\//i.test(String(fileUrl||''))) || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(urlForExt);
    const isVideoFile = (isVideoType && !!fileUrl) || (/^data:video\//i.test(String(fileUrl||''))) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(urlForExt);
    // 일반 링크 감지(파일/지도 아님)
    const linkMatch = allowLinks && !hasImage && !isFileLink && !isLocation ? display.match(/https?:\/\/[^\s]+/i) : null;
    const linkUrl = linkMatch ? linkMatch[0] : null;
    const [linkMeta, setLinkMeta] = useState<{ title?: string; description?: string; image?: string; host?: string } | null>(null);
    const [linkImgErr, setLinkImgErr] = useState(false);
    // 파일 크기 표시를 위한 텍스트(가능할 때만 계산)
    const [fileSizeText, setFileSizeText] = useState<string | null>(null);
    // 위치 미리보기(주소 포맷 + 정적 지도 이미지)
    const [locationMeta, setLocationMeta] = useState<{ text: string; mapImg?: string } | null>(null);
    const [locationImgErr, setLocationImgErr] = useState(false);
    useEffect(() => {
      let alive = true;
      const load = async () => {
        try {
          if (!isLocation) { if (alive) setLocationMeta(null); return; }
          const lat = Number(locLat); const lng = Number(locLng);
          if (!isFinite(lat) || !isFinite(lng)) { if (alive) setLocationMeta(null); return; }
          // 주소 파싱: Google → OSM 순으로 시도
          let text = '';
          try {
            // 공용 유틸(키가 있으면 Google, 없으면 OSM 폴백)
            const addr = await mediaReverseGeocode(lat, lng);
            if (addr) text = String(addr);
          } catch {}
          try {
            if (!text) {
            const osm = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&namedetails=1&lat=${lat}&lon=${lng}&accept-language=ko,en`, {
              headers: { 'User-Agent': 'YoYApp/1.0 (contact:support@yooyland.com)' },
            });
            const j = await osm.json();
            const a = j?.address || {};
            const building = j?.namedetails?.name || j?.name || a.building || '';
            const state = a.state || a.region || a.province || a.city || '';
            const district = a.district || a.city_district || a.borough || a.county || a.suburb || '';
            const road = a.road || '';
            const house = a.house_number || '';
            const cityPart = state ? (state.includes('서울') ? '서울시' : state) : '';
            const roadLine = [road, house].filter(Boolean).join(' ').trim();
            const core = [cityPart, district, roadLine].filter(Boolean).join(' ').trim();
              text = [core, building].filter(Boolean).join(' ').trim();
            }
          } catch {}
          // 정적 지도 URL: Google Static Maps 키가 있으면 사용, 없으면 OSM 정적 맵으로 폴백
          let mapImg: string | undefined = undefined;
          try {
            const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
              || (process as any)?.env?.GOOGLE_MAPS_API_KEY
              || ((Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY)
              || ((Constants as any)?.manifest?.extra?.GOOGLE_MAPS_API_KEY);
            if (key) {
              mapImg = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=640x360&markers=color:red%7C${lat},${lng}&scale=2&key=${key}`;
            } else {
              // OSM Static Map (no key required)
              // Docs: https://wiki.openstreetmap.org/wiki/Static_map_images
              const size = '520x300';
              mapImg = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=${size}&markers=${lat},${lng},red-pushpin`;
            }
          } catch {}
          const fallbackText = (() => {
            try { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; } catch { return '지도 미리보기'; }
          })();
          if (alive) setLocationMeta({ text: (text && String(text).trim()) || fallbackText, mapImg });
          // 미리보기 속도 개선: 정적 지도 이미지 프리페치
          try {
            const pre = mapImg || `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=520x300&markers=${lat},${lng},red-pushpin`;
            if (pre) {
              if (Platform.OS === 'web') { const im = new Image(); im.src = pre; }
              else { try { (Image as any).prefetch?.(pre); } catch {} }
            }
          } catch {}
          if (alive) setLocationImgErr(false);
        } catch { if (alive) setLocationMeta(null); }
      };
      void load();
      return () => { alive = false; };
    }, [isLocation, locLat, locLng]);
    useEffect(() => {
      let alive = true;
      const formatBytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(2)} KB`;
      const probe = async () => {
        try {
          const u = String(fileUrl || '');
          if (!u) { if (alive) setFileSizeText(null); return; }
          if (/^https?:/i.test(u)) {
            try {
              const r = await fetch(u, { method: 'HEAD' });
              const cl = r.headers.get('content-length');
              if (cl && alive) { const num = parseInt(cl, 10); if (!isNaN(num) && num > 0) { setFileSizeText(formatBytes(num)); return; } }
            } catch {}
          }
          // blob:/data: 는 환경에 따라 fetch가 실패(404/ERR_FILE_NOT_FOUND)할 수 있으므로 크기 계산을 생략
          if (/^(blob:|data:)/i.test(u)) { if (alive) setFileSizeText(null); return; }
        } catch { if (alive) setFileSizeText(null); }
      };
      void probe();
      return () => { alive = false; };
    }, [fileUrl]);
    // 상대 프로필(아바타/이름) - 채팅 대화명 우선
    const profiles = profilesAll || {};
    const ownerUidMsg = room?.createdBy || '';
    const senderProfile = profiles[item.senderId] || {};
    const getChatDisplayName = (uid: string) => {
      try {
        const cur = currentProfileAll || {} as any;
        const myUid = firebaseAuth.currentUser?.uid || '';
        const p = profiles[uid] || {} as any;
        const simpleHash = (s: string) => { try { let h=5381; for (let i=0;i<s.length;i++) h=((h<<5)+h) ^ s.charCodeAt(i); return `#${(h>>>0).toString(36).slice(0,8)}`; } catch { return `#${(s||'id').slice(0,8)}`; } };
        const roomHashOn = ((settings as any)?.security?.useHashInRoom) === true;
        if (roomHashOn) return simpleHash(uid);
        if (uid === cur.userId || uid === myUid || (ownerUidMsg && uid === ownerUidMsg)) {
          return cur.displayName || (firebaseAuth.currentUser as any)?.displayName || p.displayName || uid;
        }
        return p.chatName || p.nickname || p.nick || p.alias || p.displayName || p.username || p.email || uid;
      } catch { return uid; }
    };
    const senderName = getChatDisplayName(item.senderId);
    const senderAvatar = (() => {
      try {
        const cur = currentProfileAll || {} as any;
        const myUid = firebaseAuth.currentUser?.uid || '';
        if (item.senderId === cur.userId || item.senderId === myUid || (ownerUidMsg && item.senderId === ownerUidMsg)) {
          return (cur.avatar as any) || (firebaseAuth.currentUser as any)?.photoURL || '';
        }
        return senderProfile.avatar || '';
      } catch { return senderProfile.avatar || ''; }
    })();
    // 중복 텍스트 방지: 직전 메시지가 같은 발신자의 이미지 메시지이고, 동일 텍스트면 현재 텍스트-only 버블을 숨김
    const shouldHideAsDuplicate = (() => {
      try {
        if (hasImage) return false; // 이미지 버블은 표시
        const list = (useKakaoRoomsStore as any).getState().getMessages?.(roomId) || [];
        const idx = list.findIndex((m: any) => m.id === item.id);
        if (idx <= 0) return false;
        const prev = list[idx - 1];
        const prevHasImage = (prev?.type === 'image' && !!prev?.imageUrl) || (Array.isArray(prev?.albumUrls) && prev?.albumUrls.length > 0);
        if (!prevHasImage) return false;
        const sameSender = String(prev?.senderId) === String(item?.senderId);
        const sameText = String(prev?.content || '').trim() === String(item?.content || '').trim();
        const closeInTime = Math.abs(Number(item?.createdAt || 0) - Number(prev?.createdAt || 0)) < 15000; // 15초 이내
        return sameSender && sameText && closeInTime;
      } catch { return false; }
    })();
    if (shouldHideAsDuplicate) return null;
    useEffect(() => {
      let alive = true;
      const load = async () => {
        if (!linkUrl || !allowLinks) { setLinkMeta(null); return; }
        try {
          // 0) 서버 API(우선) — 단, 유튜브/쇼츠/직접 PDF 등은 스킵해 네트워크 에러 로그를 줄임
          const isPdfDirect = /\.pdf(\?|$)/i.test(String(linkUrl||''));
          const isYouTubeLink = (()=>{ try { const u=new URL(String(linkUrl||'')); const h=u.host.toLowerCase(); return /(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h); } catch { return false; } })();
          const shouldSkipServer = isPdfDirect || isYouTubeLink;
          if (!shouldSkipServer) {
            try {
              const primary = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || 'http://localhost:8080/api/link-preview';
              let r: any = null;
              try {
                r = await Promise.race([
                  fetch(primary, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: linkUrl }) }),
                  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1200)),
                ]);
              } catch {}
              if ((r as any)?.ok) {
                const j = await (r as any).json();
                if (alive && j) {
                  setLinkMeta({ title: j.title, description: j.description, image: j.image, host: j.siteName || new URL(linkUrl).host });
                  return;
                }
              }
            } catch {}
          }

          // 0.5) link-preview-js 폴백은 웹 CORS로 깜박임 유발 → 비활성화
          // 유튜브 Shorts → watch?v= 로 정규화 + 썸네일 생성
          const normalizeYouTube = (urlStr: string) => {
            try {
              const u = new URL(urlStr);
              const host = u.host.replace(/^www\./,'');
              let id: string | null = null;
              if (host === 'youtu.be') id = (u.pathname || '').slice(1) || null;
              if (!id && /youtube\.com$/i.test(host)) {
                const p = u.pathname || '';
                if (p.startsWith('/shorts/')) id = p.split('/')[2] || null;
                if (!id && p.startsWith('/watch')) id = u.searchParams.get('v');
              }
              if (id) {
                return {
                  watchUrl: `https://www.youtube.com/watch?v=${id}`,
                  thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                };
              }
            } catch {}
            return null;
          };
          const yt = normalizeYouTube(linkUrl);
          // 기본 host
          const u = new URL(yt?.watchUrl || linkUrl);
          const base: any = { host: u.host };
          // 시도: HTML 메타 파싱 (웹에서는 CORS로 차단되므로 네이티브에서만)
          if (Platform.OS !== 'web') {
            try {
              const res = await fetch(yt?.watchUrl || linkUrl, { method: 'GET', headers: { 'Accept-Language': 'ko,en' } as any });
              const html = await res.text();
              const og = (name: string) => new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1]
                || new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1];
              const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
              const ogImg = og('og:image') || yt?.thumb;
              const meta = {
                title: og('og:title') || titleTag || u.host,
                description: og('og:description') || undefined,
                image: ogImg || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=64`,
                host: u.host,
              };
              if (alive) setLinkMeta(meta);
              return;
            } catch {}
          }
          // Fallback: noembed(oEmbed) 시도로 제목 확보(YouTube 등)
          try {
            const ne = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(yt?.watchUrl || linkUrl)}`);
            const j = await ne.json();
            if (j && (j.title || j.thumbnail_url)) {
              const u2 = new URL(linkUrl);
              const meta2 = {
                title: j.title || u2.host,
                description: (j.author_name as string) || undefined,
                image: (j.thumbnail_url as string) || yt?.thumb || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u2.host)}&sz=64`,
                host: u2.host,
              };
              if (alive) setLinkMeta(meta2);
              return;
          }
        } catch {}
          // Fallback: CORS-free HTML fetch (r.jina.ai) - 서버 프록시가 없을 때 사용
          try {
            const prox = `https://r.jina.ai/http://${(yt?.watchUrl || linkUrl).replace(/^https?:\/\//,'')}`;
            const html = await (await fetch(prox)).text();
            const og = (name: string) => new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1]
              || new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1];
            const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1];
            const ogImg = og('og:image') || yt?.thumb;
            const u3 = new URL(linkUrl);
            const meta3 = {
              title: og('og:title') || titleTag || u3.host,
              description: og('og:description') || undefined,
              image: ogImg || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u3.host)}&sz=64`,
              host: u3.host,
            };
            if (alive) setLinkMeta(meta3);
            return;
          } catch {}
          // Fallback: 파비콘/호스트 기반 카드
          const meta = {
            title: base.host,
            description: undefined,
            image: yt?.thumb || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(base.host)}&sz=64`,
            host: base.host,
          };
          if (alive) setLinkMeta(meta);
        } catch { if (alive) setLinkMeta(null); }
      };
      void load();
      return () => { alive = false; };
    }, [linkUrl]);
  // TTL 남은 시간(진행바 표시용) - 초/퍼센트로 갱신하며 텍스트 깜빡임 제거
  const ttlMsGlobal = useMemo(() => {
    try {
      // TTL은 TTL 타입의 방에서만 작동
      const type = (useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type;
      const isTtlRoom = String(type) === 'ttl';
      const raw = Number(room?.messageTtlMs || 0);
      const val = raw > 0 ? raw : 180000; // 기본 3분
      return isTtlRoom ? val : 0;
    } catch {
      return 0;
    }
  }, [room?.messageTtlMs, roomId]);
  // 초기 렌더에서 100%로 튀는 현상 방지: 최초 값은 현재 남은 비율로 설정
  const endAtMemo = useMemo(() => (item.createdAt || 0) + ttlMsGlobal, [item.createdAt, ttlMsGlobal]);
  const initialRatio = useMemo(() => {
    if (ttlMsGlobal <= 0) return 0;
    const remaining = Math.max(0, endAtMemo - Date.now());
    return Math.max(0, Math.min(1, remaining / ttlMsGlobal));
  }, [endAtMemo, ttlMsGlobal]);
  const widthAnim = useRef(new Animated.Value(initialRatio || 0)).current; // 1 → 0
  const animStartedRef = useRef(false);
  useEffect(() => {
    if (ttlMsGlobal > 0 && !animStartedRef.current) {
      animStartedRef.current = true;
      const endAt = (item.createdAt || 0) + ttlMsGlobal;
      const remainingMs = Math.max(0, endAt - Date.now());
      const startRatio = Math.max(0, Math.min(1, remainingMs / ttlMsGlobal));
      widthAnim.stopAnimation();
      widthAnim.setValue(startRatio);
      const anim = Animated.timing(widthAnim, {
        toValue: 0,
        duration: remainingMs,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      anim.start(({ finished }) => {
        if (finished && onExpire) onExpire();
      });
      return () => { try { anim.stop(); } catch {} };
    }
  }, [ttlMsGlobal, item.createdAt]);
  // TTL 뱃지 표기를 위한 초단위 리렌더
  const [ttlTick, setTtlTick] = useState(0);
  useEffect(() => {
    if (ttlMsGlobal <= 0) return;
    const iv = setInterval(() => setTtlTick((v)=>(v+1)%1000000), 1000);
    return () => { try { clearInterval(iv); } catch {} };
  }, [ttlMsGlobal, endAtMemo]);
  const remainMsForBadge = Math.max(0, endAtMemo - Date.now());
    const replyMeta = (() => {
      try {
        const all = (useKakaoRoomsStore as any).getState().getMessages(roomId) as any[];
        const found = all.find((m:any) => m.id === item.replyToId);
        if (!found) return null;
        const text = String(found.content || (found.imageUrl ? '' : ''));
        const imageUrl = found.imageUrl || null;
        const profiles = profilesAll || {};
        const meId = firebaseAuth.currentUser?.uid || 'me';
        const isMe = found.senderId === meId;
        const name = profiles[found.senderId]?.displayName || found.senderId || '';
        const label = isMe ? '나에게 답장' : `${name} 님에게 답장`;
        return { text, label, imageUrl };
      } catch { return null; }
      })();
    // 스와이프 감지 및 팝업
    const [showQuick, setShowQuick] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const touchX = useRef<number | null>(null);
    const touchY = useRef<number | null>(null);
    const getEventX = (e: any): number => {
      try {
        const ne = e?.nativeEvent || e;
        if (typeof ne.pageX === 'number') return ne.pageX;
        if (typeof ne.locationX === 'number') return ne.locationX;
        const t = ne.touches?.[0] || ne.changedTouches?.[0];
        if (t) return (t.pageX ?? t.clientX ?? 0);
        return 0;
      } catch { return 0; }
    };
    const getEventY = (e: any): number => {
      try {
        const ne = e?.nativeEvent || e;
        if (typeof ne.pageY === 'number') return ne.pageY;
        if (typeof ne.locationY === 'number') return ne.locationY;
        const t = ne.touches?.[0] || ne.changedTouches?.[0];
        if (t) return (t.pageY ?? t.clientY ?? 0);
        return 0;
      } catch { return 0; }
    };
    const onTouchStart = (e: any) => { touchX.current = getEventX(e); touchY.current = getEventY(e); };
    const onTouchMove = (e: any) => {
      const sx = touchX.current; const sy = touchY.current; if (sx == null || sy == null) return;
      const dx = getEventX(e) - sx; const dy = getEventY(e) - sy;
      if (dx < -24 && Math.abs(dx) > Math.abs(dy) * 1.5) { setShowQuick(false); setQuickMenu({ id: item.id, display, fileUrl, mapUrl, linkUrl }); }
    };
    const onTouchEnd = () => { touchX.current = null; touchY.current = null; };
    const onMoveShouldSet = (e: any) => {
      const sx = touchX.current ?? getEventX(e); const sy = touchY.current ?? getEventY(e);
      const dx = getEventX(e) - sx; const dy = getEventY(e) - sy;
      return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
    };

    const multiOn = (multiDeleteOn || deleteSelection.size > 0);
    return (
      <View style={{ flexDirection:'row', alignItems:'flex-start', justifyContent: isMe ? 'flex-end' : 'flex-start', marginVertical: 6, width:'100%', position:'relative', paddingLeft: multiOn ? 36 : 0 }}>
        <View style={{ width: 0 }} />
        {multiDeleteOn ? (
          <TouchableOpacity
            pointerEvents="auto"
            onPressIn={() => { setSelectedSnap(v=>!v); toggleDeleteSelect(item.id); }}
            hitSlop={{ top:16, bottom:16, left:16, right:16 }}
            style={{ position:'absolute', top: 6, left: 8, zIndex: 2147483 }}
          >
            <View style={{ width:18, height:18, borderRadius:999, borderWidth:2, borderColor: isMe ? '#FFD700' : '#FFFFFF', backgroundColor:'rgba(0,0,0,0.9)', alignItems:'center', justifyContent:'center' }}>
              {selectedSnap ? <Text style={{ color:(isMe ? '#FFD700' : '#FFFFFF'), fontSize:11, fontWeight:'900' }}>✓</Text> : null}
            </View>
          </TouchableOpacity>
        ) : null}
        <View style={{ flexShrink: 1, maxWidth: '75%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        {!isMe && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: String(item.senderId) } as any }); } catch {} }}
            style={{ flexDirection:'row', alignItems:'center', marginBottom: 4 }}
          >
            {senderAvatar ? (
              <EImage source={{ uri: senderAvatar }} style={{ width: 24, height: 24, borderRadius: 12, marginRight: 6 }} contentFit="cover" />
            ) : (
              <View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333', marginRight:6 }} />
            )}
            <Text style={{ color:'#CFCFCF', fontSize:12, fontWeight:'700' }} numberOfLines={1}>{senderName}</Text>
          </TouchableOpacity>
        )}
        {hasImage ? (
          (() => {
            // 앨범(묶음) 메시지
            if (Array.isArray(item.albumUrls) && item.albumUrls.length > 0) {
              const urls = item.albumUrls; // 말풍선에서 모두 보여주기 (줄바꿈 그리드)
              const maxCols = 3; const gap = 2; const cell = 110; const width = maxCols*cell + (maxCols-1)*gap;
              return (
                <TouchableOpacity activeOpacity={0.9} onLongPress={() => setMenuFor({ item, display: '', imageUrl: undefined, fileUrl: undefined, mapUrl: null })} delayLongPress={350} style={{ borderRadius: 10, overflow: 'visible', backgroundColor: '#111', width, position: 'relative' }}>
                  <View style={{ flexDirection:'row', flexWrap:'wrap', width }}>
                    {urls.map((u: string, idx: number) => (
                      <TouchableOpacity key={`${u}-${idx}`} activeOpacity={0.9} onPress={() => { try { openImageViewer({ id: item.id, imageUrl: u, senderId: item.senderId, createdAt: item.createdAt }, senderName, senderAvatar, u); } catch {} }}>
                        {Platform.OS === 'web' ? (
                          <Image source={{ uri: proxiedImageUrl(String(u)) }} style={{ width: cell, height: cell, marginRight: ((idx%maxCols)!==(maxCols-1))?gap:0, marginBottom: gap }} resizeMode="cover" />
                        ) : (
                          <EImage source={{ uri: String(u) }} style={{ width: cell, height: cell, marginRight: ((idx%maxCols)!==(maxCols-1))?gap:0, marginBottom: gap }} contentFit="cover" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* checkbox rendered at row level */}
                </TouchableOpacity>
              );
            }
            // 단일 이미지 메시지: 상단에 텍스트(말줄임), 하단에 이미지 한 장
            return (
              <TouchableOpacity onPress={() => { if (multiDeleteMode) { return; } openImageViewer(item, senderName, senderAvatar); }} onLongPress={() => setMenuFor({ item, display, imageUrl: String(item.imageUrl||''), fileUrl: null, mapUrl: null })} delayLongPress={350} activeOpacity={0.9} style={{ borderRadius: 10, overflow: 'visible', backgroundColor: '#111', position:'relative' }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onStartShouldSetResponder={onMoveShouldSet} onMoveShouldSetResponder={onMoveShouldSet} onResponderGrant={onTouchStart} onResponderMove={onTouchMove} onResponderRelease={onTouchEnd}>
                {!!item.content && (
                  <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, width: 220 }}>
                    {(() => {
                      try {
                        const m = String(item.content||'').match(/https?:\/\/[^\s]+/i);
                        const link = m ? m[0] : '';
                        if (link) {
                          return (
                            <TouchableOpacity onPress={() => { try { Linking.openURL(link); } catch {} }}>
                              <Text style={{ color:'#1E88E5', fontWeight:'700' }} numberOfLines={2} ellipsizeMode="tail">{link}</Text>
                            </TouchableOpacity>
                          );
                        }
                      } catch {}
                      return <Text style={[styles.bubbleText, { color:'#EDEDED' }]} numberOfLines={2} ellipsizeMode="tail">{String(item.content)}</Text>;
                    })()}
                  </View>
                )}
                {Platform.OS === 'web' && /^(blob:|data:)/i.test(String(item.imageUrl||'')) ? (
                  <Image source={{ uri: String(item.imageUrl) }} style={{ width: 220, height: 220, borderRadius: 10 }} resizeMode="cover" />
                ) : (
                  <EImage source={{ uri: /^https?:/i.test(String(item.imageUrl||'')) ? proxiedImageUrl(String(item.imageUrl||'')) : String(item.imageUrl||'') }} style={{ width: 220, height: 220, borderRadius: 10 }} contentFit="cover" />
                )}
                {/* checkbox rendered at row level */}
                {showQuick && (
                  <View style={{ flexDirection:'row', gap: 10, marginTop: 6, justifyContent:'flex-end' }}>
                    <TouchableOpacity onPress={() => { toggleReaction(roomId, item.id, '👍', (firebaseAuth.currentUser?.uid || 'me')); setShowQuick(false); }}>
                      <Text style={{ color:'#222', fontWeight:'700' }}>👍 공감</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { const prev = item.content || (item.imageUrl ? '[이미지]' : ''); setReplyTo({ id: item.id, preview: String(prev).slice(0, 60) }); setShowQuick(false); }}>
                      <Text style={{ color:'#222', fontWeight:'700' }}>↩ 답장</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })()
        ) : null}
        {/* 공감 배지는 모든 콘텐츠 렌더 이후(아래)에만 표시 */}
        {/* 파일/링크/지도/텍스트 버블: 이미지가 없는 경우에만 렌더 */}
        {!hasImage && (((isFileLink && fileUrl) || isExplicitFile || (isVideoType && fileUrl)) ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.bubble, isMe ? styles.meBubble : styles.otherBubble, { position: 'relative' }, (isMe && bubbleColorOverride) ? { backgroundColor: bubbleColorOverride } : null]}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
            onStartShouldSetResponder={onMoveShouldSet}
            onMoveShouldSetResponder={onMoveShouldSet}
            onResponderGrant={onTouchStart}
            onResponderMove={onTouchMove}
            onResponderRelease={onTouchEnd}
            onPress={() => {
              if (multiDeleteMode) { return; }
              if (isImageFile) {
                try {
                  openImageViewer({ id: item.id, imageUrl: fileUrl, senderId: item.senderId, createdAt: item.createdAt } as any, senderName, senderAvatar);
                } catch {}
                return;
              }
              if (isVideoFile) {
                try { openImageViewer(item as any); } catch { setImageViewer({ url: String(fileUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'video', displayName: String(fileName||'video') } as any); }
                return;
              }
              // 일반 파일/웹 링크도 통합 뷰어로 처리 + 인덱싱 유지
              try { openImageViewer({ id: item.id, imageUrl: String(fileUrl), senderId: item.senderId, createdAt: item.createdAt } as any, senderName, senderAvatar, String(fileUrl), (/\.pdf(\?|$)/i.test(String(urlForExt)) ? 'pdf' : 'web')); }
              catch { setImageViewer({ url: String(fileUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'web' } as any); }
            }}
            onLongPress={() => setMenuFor({ item, display, fileUrl, mapUrl: null })}
            delayLongPress={350}
          >
            {item.replyToId && (
          <TouchableOpacity
                onPress={() => {
                  try {
                    const idx = (messages || []).findIndex((m:any) => m.id === item.replyToId);
                    if (idx >= 0) {
                      // 원본으로 돌아가기 배너 표시(현재 메시지로 복귀)
                      const prev = item.content || (item.imageUrl ? '[이미지]' : '');
                      setReturnTo({ id: item.id, preview: String(prev).slice(0, 60) });
                      listRef.current?.scrollToIndex?.({ index: idx, animated: true });
                    }
                  } catch {}
                }}
                activeOpacity={0.7}
              >
                <View style={styles.replyInlineBox}>
                  <Text style={styles.replyInlineLabel}>{replyMeta?.label || ''}</Text>
                  {replyMeta?.imageUrl ? (
                    (Platform.OS === 'web' && /^(blob:|data:)/i.test(String(replyMeta.imageUrl))) ? (
                      <Image source={{ uri: String(replyMeta.imageUrl) }} style={{ width: 42, height: 42, borderRadius: 6, marginTop: 4 }} resizeMode="cover" />
                    ) : (
                      <EImage source={{ uri: String(replyMeta.imageUrl) }} style={{ width: 42, height: 42, borderRadius: 6, marginTop: 4 }} contentFit="cover" />
                    )
                  ) : (
                    <Text style={styles.replyInlineText} numberOfLines={1}>{replyMeta?.text || '[원문 없음]'}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            {/* 동영상: 제목 헤더 */}
            {isVideoFile ? (
              <View style={{ marginTop: 6 }}>
                    <Text style={[styles.bubbleText, { color: getContrastColor((isMe && (bubbleColorOverride||'#D4AF37')) || (!isMe && '#FFFFFF')), fontWeight:'700', fontSize: 14*fontScale, lineHeight: 18*fontScale }]} numberOfLines={2}>
                  {String(fileName || '').replace(/:\s*(blob:|https?:\/\/).*$/,'').trim()}
                </Text>
              </View>
            ) : null}
            {/* 파일/이미지/동영상 썸네일 */}
            {(() => {
              try {
            if (isImageFile) {
                  return (Platform.OS === 'web' && /^(blob:|data:)/i.test(String(fileUrl))) ? (
                    <Image source={{ uri: String(fileUrl) }} style={{ width: 220, height: 160, borderRadius: 8, marginTop: 6 }} resizeMode="cover" />
                  ) : (
                    <EImage source={{ uri: /^https?:/i.test(String(fileUrl)) ? proxiedImageUrl(String(fileUrl)) : String(fileUrl) }} style={{ width: 220, height: 160, borderRadius: 8, marginTop: 6 }} contentFit="cover" />
                  );
                }
            if (isVideoFile) {
              // 클릭 시 통일된 이미지 뷰어(상단바/좌우/하단 액션)로 열기
              return (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setImageViewer({ url: String(fileUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'video', displayName: String(fileName||'video') })}>
                  {Platform.OS === 'web' ? (
                    <View style={{ width: '100%', aspectRatio: 16/9 as any, borderRadius: 10, overflow: 'hidden', backgroundColor: '#111', marginTop: 8, zIndex: 1 }}>
                      <video src={String(fileUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline controls preload="metadata" />
                    </View>
                  ) : (
                    <View style={{ width: '100%', aspectRatio: 16/9 as any, borderRadius: 10, overflow: 'hidden', backgroundColor: '#111', marginTop: 8, alignItems:'center', justifyContent:'center', zIndex: 1 }}>
                      <Text style={{ color:'#EEE', fontSize:12 }}>동영상 미리보기</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
                }
                // PDF 썸네일(웹)
                if (Platform.OS === 'web' && /\.pdf(\?|$)/i.test(String(urlForExt))) {
                  const u = String(fileUrl||'');
                  const thumb = pdfThumbsChat[pdfKey(u)] || pdfThumbsChat[u];
                  const placeholder = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='%23111111'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23E53935' font-size='38' font-weight='700'>PDF</text></svg>`;
                  const src = thumb || placeholder;
                  return (
                    /^data:image\//i.test(String(src)) ? (
                      <Image source={{ uri: src }} style={{ width: 220, height: 160, borderRadius: 8, marginTop: 6, backgroundColor:'#111' }} />
                    ) : (
                      <EImage source={{ uri: src }} style={{ width: 220, height: 160, borderRadius: 8, marginTop: 6, backgroundColor:'#111' }} contentFit="cover" onLoadStart={()=>{ try { if (!thumb) ensurePdfThumbChat(u); } catch {} }} />
                    )
                  );
                }
                return null;
              } catch { return null; }
            })()}
            {/* Kakao 스타일 파일 카드: (비디오 제외) 파일명/아이콘 + 유효기간/용량 + 액션 */}
            {(() => {
              const nameOnly = String(fileName || '').replace(/:\s*(blob:|https?:\/\/).*/, '').trim();
              if (isVideoFile) {
                // 비디오는 위에서 제목 + 아래 프리뷰만 노출
                return null;
              }
              // 확장자별 아이콘 매핑 (MaterialCommunityIcons 우선, 없으면 MaterialIcons 폴백)
              const pickIcon = (ext: string): { name: string; lib: 'mci'|'mi'; color: string } => {
                const e = String(ext || '').toLowerCase();
                if (/pdf/.test(e)) return { name: 'file-pdf-box', lib: 'mci', color: '#E53935' };
                if (/docx?$/.test(e)) return { name: 'file-word-box', lib: 'mci', color: '#1E88E5' };
                if (/xlsx?$/.test(e)) return { name: 'file-excel-box', lib: 'mci', color: '#2E7D32' };
                if (/pptx?$/.test(e)) return { name: 'file-powerpoint-box', lib: 'mci', color: '#E67E22' };
                if (/(zip|rar|7z|tar|gz)$/i.test(e)) return { name: 'folder-zip', lib: 'mci', color: '#6A5ACD' };
                if (/png|jpe?g|gif|webp|bmp|avif|heic|heif/i.test(e)) return { name: 'file-image', lib: 'mci', color: '#8E24AA' };
                if (/mp4|mov|m4v|webm|mkv|avi/i.test(e)) return { name: 'file-video', lib: 'mci', color: '#3F51B5' };
                if (/mp3|wav|m4a|ogg|flac/i.test(e)) return { name: 'file-music', lib: 'mci', color: '#00796B' };
                if (/txt|md|csv|log/i.test(e)) return { name: 'file-document', lib: 'mci', color: '#9E9E9E' };
                if (/js|ts|tsx|json|yml|yaml|xml|html|css|scss|sql/i.test(e)) return { name: 'file-code', lib: 'mci', color: '#546E7A' };
                return { name: 'insert-drive-file', lib: 'mi', color: '#666' };
              };
              const picked = pickIcon(fileExt);
              const openFile = () => {
                try { openImageViewer({ id: item.id, imageUrl: String(fileUrl), senderId: item.senderId, createdAt: item.createdAt } as any, senderName, senderAvatar, String(fileUrl), (/\.pdf(\?|$)/i.test(String(urlForExt)) ? 'pdf' : 'web')); }
                catch { setImageViewer({ url: String(fileUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'web' } as any); }
              };
              const saveFile = () => { try { saveFileToDevice(String(fileUrl), nameOnly || 'file'); } catch {} };
              const dateStr = (() => {
                try {
                  if (ttlMsGlobal > 0) {
                    const d = new Date(endAtMemo);
                    const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0');
                    return `${y}. ${m}. ${dd}.`;
                  }
                  return '';
                } catch { return ''; }
              })();
              const smallPdfThumb = (Platform.OS === 'web' && /\.pdf(\?|$)/i.test(String(urlForExt))) ? (pdfThumbsChat[pdfKey(String(fileUrl||''))] || pdfThumbsChat[String(fileUrl||'')] || '') : '';
              if (Platform.OS === 'web' && /\.pdf(\?|$)/i.test(String(urlForExt)) && !smallPdfThumb) { try { ensurePdfThumbChat(String(fileUrl||'')); } catch {} }
              return (
                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection:'row', alignItems:'flex-start', gap:8 }}>
                    {smallPdfThumb ? (
                      /^data:image\//i.test(String(smallPdfThumb)) ? (
                        <Image source={{ uri: smallPdfThumb }} style={{ width: 54, height: 72, borderRadius: 6, backgroundColor:'#111' }} />
                      ) : (
                        <EImage source={{ uri: smallPdfThumb }} style={{ width: 54, height: 72, borderRadius: 6, backgroundColor:'#111' }} contentFit="cover" />
                      )
                    ) : null}
                    <Text style={[styles.bubbleText, { color: getContrastColor((isMe && (bubbleColorOverride||'#D4AF37')) || (!isMe && '#FFFFFF')), flex:1, fontWeight:'700', fontSize: 14*fontScale, lineHeight: 18*fontScale }]} numberOfLines={2}>{nameOnly}</Text>
                    {picked.lib === 'mci' ? (
                      <MaterialCommunityIcons name={picked.name as any} size={20} color={picked.color} />
                    ) : (
                      <MaterialIcons name={picked.name as any} size={18} color={picked.color} />
                    )}
                  </View>
                  {!!(ttlMsGlobal > 0) && (
                    <Text style={{ color:'#666', fontSize:12, marginTop:6 }}>유효기간: ~{dateStr}</Text>
                  )}
                  {!!fileSizeText && (
                    <Text style={{ color:'#666', fontSize:12, marginTop:2 }}>용량: {fileSizeText}</Text>
                  )}
                  <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginTop:6 }}>
                    <TouchableOpacity onPress={openFile}><Text style={{ color:'#1E88E5', fontWeight:'700' }}>열기</Text></TouchableOpacity>
                    <Text style={{ color:'#777' }}>·</Text>
                    <TouchableOpacity onPress={saveFile}><Text style={{ color:'#1E88E5', fontWeight:'700' }}>저장</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })()}
            <View style={{ flexDirection:'row', gap: 10, marginTop: 6, justifyContent:'flex-end' }}>
              <TouchableOpacity onLongPress={() => setMenuFor({ item, display, fileUrl, mapUrl: null })} delayLongPress={350}><Text style={{ color:'#222', fontWeight:'700' }}>⋯</Text></TouchableOpacity>
              </View>
            {/* 반응 집계는 말풍선 외부에만 표시(중복 방지) */}
            {ttlMsGlobal > 0 && (
              <View style={styles.ttlBadge}>
                <Text style={styles.ttlBadgeText}>{formatTtl(remainMsForBadge)}</Text>
              </View>
            )}
            {showQuick && !quickMenu && (
              <View style={{ flexDirection:'row', gap: 10, marginTop: 6, justifyContent:'flex-end' }}>
                <TouchableOpacity onPress={() => { toggleReaction(roomId, item.id, '👍', (firebaseAuth.currentUser?.uid || 'me')); setShowQuick(false); }}>
                  <Text style={{ color:'#222', fontWeight:'700' }}>👍 공감</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const prev = item.content || (item.imageUrl ? '[이미지]' : ''); setReplyTo({ id: item.id, preview: String(prev).slice(0, 60) }); setShowQuick(false); }}>
                  <Text style={{ color:'#222', fontWeight:'700' }}>↩ 답장</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* checkbox rendered at row level */}
          </TouchableOpacity>
        ) : (
          (() => {
            const displayTrimmed = String(display || '').trim();
            if (!hasImage && !isFileLink && !isExplicitFile && !isLocation && !linkUrl && displayTrimmed === '') return null;
            return (
          <TouchableOpacity activeOpacity={1} style={[styles.bubble, isMe ? styles.meBubble : styles.otherBubble, { position: 'relative' }, (isMe && bubbleColorOverride) ? { backgroundColor: bubbleColorOverride } : null]} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onLongPress={() => setMenuFor({ item, display, fileUrl: null, mapUrl })} delayLongPress={350} onPress={() => {
            if (multiDeleteMode) { return; }
            if (isLocation && mapUrl) {
              try { openImageViewer({ id: item.id, imageUrl: String(mapUrl), senderId: item.senderId, createdAt: item.createdAt } as any, undefined, undefined, String(mapUrl), 'map'); } catch {
                setImageViewer({ url: String(mapUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'map' } as any);
              }
            }
          }}>
            {item.replyToId && (
          <TouchableOpacity
                onPress={() => {
                  try {
                    const idx = (messages || []).findIndex((m:any) => m.id === item.replyToId);
                    if (idx >= 0) {
                      const prev = item.content || (item.imageUrl ? '[이미지]' : '');
                      setReturnTo({ id: item.id, preview: String(prev).slice(0, 60) });
                      listRef.current?.scrollToIndex?.({ index: idx, animated: true });
                    }
                  } catch {}
                }}
                activeOpacity={0.7}
              >
                <View style={styles.replyInlineBox}>
                  <Text style={styles.replyInlineLabel}>{replyMeta?.label || ''}</Text>
                  {replyMeta?.imageUrl ? (
                    <EImage source={{ uri: String(replyMeta.imageUrl) }} style={{ width: 42, height: 42, borderRadius: 6, marginTop: 4 }} contentFit="cover" />
                  ) : (
                    <Text style={styles.replyInlineText} numberOfLines={1}>{replyMeta?.text || '[원문 없음]'}</Text>
                  )}
                </View>
          </TouchableOpacity>
        )}
            {/* 위치 메시지: 주소 요약 텍스트 + 지도 썸네일 카드 */}
            {isLocation && locationMeta ? (
              <View>
                {(() => {
                  const full = String(locationMeta.text || '');
                  const key = ' 에 위치한 ';
                  const at = full.indexOf(key);
                  if (at >= 0) {
                    const head = full.slice(0, at);
                    const rest = full.slice(at + key.length);
                    const dot = rest.indexOf('.');
                    const building = dot >= 0 ? rest.slice(0, dot) : rest;
                    const tail = dot >= 0 ? rest.slice(dot) : '';
                    return (
                      <Text style={[styles.bubbleText, { color: getContrastColor((isMe && (bubbleColorOverride||'#D4AF37')) || (!isMe && '#FFFFFF')), fontWeight:'700', fontSize: 14*fontScale, lineHeight: 18*fontScale }]} numberOfLines={3}>
                        {head}
                        <Text> </Text>
                        <Text style={{ color:'#2A2A2A', fontSize:12, fontWeight:'700' }}>에 위치한</Text>
                        <Text> </Text>
                        {building}
                        {tail}
                      </Text>
                    );
                  }
                  return (<Text style={[styles.bubbleText, { color: getContrastColor((isMe && (bubbleColorOverride||'#D4AF37')) || (!isMe && '#FFFFFF')), fontWeight:'700', fontSize: 14*fontScale, lineHeight: 18*fontScale }]} numberOfLines={3}>{full}</Text>);
                })()}
                <TouchableOpacity onPress={() => { 
                  try { 
                    if (Platform.OS !== 'web') { Linking.openURL(mapUrl); return; }
                    const embed = buildMapEmbedUrl(mapUrl); 
                    setMapViewer({ url: embed, title: '지도', messageId: item.id }); 
                  } catch { try { Linking.openURL(mapUrl); } catch {} } 
                }} activeOpacity={0.7}>
                  <Text style={{ color:'#1E88E5', fontSize:12, marginTop:4 }} numberOfLines={1}>maps.google.com</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {(() => {
                  // 초대장 텍스트 패턴 감지 → 링크 카드 비활성화 + 텍스트 터치 시 내부 이동
                  if (linkUrl) {
                    const only = String(display || '').trim();
                    const normalized = only.replace(/^@/, '');
                    const inviteMatch = normalized.match(/yooyland\.com\/room\/([a-z0-9\-]+)/i);
                    if (inviteMatch) {
                      return (
                        <TouchableOpacity onPress={() => { try { const id = inviteMatch[1]; if (id) { try { (useKakaoRoomsStore as any).getState()._ensureMember?.(id); } catch {} try { const uid=(firebaseAuth.currentUser?.uid||'me'); const { doc, setDoc, serverTimestamp } = require('firebase/firestore'); const { firestore } = require('@/lib/firebase'); const userRoomRef = doc(firestore, 'users', uid, 'joinedRooms', id); setDoc(userRoomRef, { joinedAt: serverTimestamp(), title: id, type: 'group' }, { merge: true }).catch(()=>{}); } catch {} router.push(`/chat/room/${id}` as any); } } catch {} }}>
                          <Text style={[styles.bubbleText, { color: getContrastColor((isMe && (bubbleColorOverride||'#D4AF37')) || (!isMe && '#FFFFFF')), fontSize: 14*fontScale, lineHeight: 18*fontScale }]}>{display}</Text>
                        </TouchableOpacity>
                      );
                    }
                    if (normalized === linkUrl) return null; // 링크만 있는 메시지는 카드로 대체
                  }
                  return (<Text style={[styles.bubbleText, { color: getContrastColor((isMe && (bubbleColorOverride||'#D4AF37')) || (!isMe && '#FFFFFF')), fontSize: 14*fontScale, lineHeight: 18*fontScale }]} selectable>{display}</Text>);
                })()}
              </View>
            )}
              {linkUrl && !isLocation && ((): any => {
                try {
                  const txt = String(display||'');
                  if (/yooyland\.com\/room\//i.test(txt)) return null; // 초대장은 링크 카드 표시하지 않음
                } catch {}
                return (
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.linkCard, { maxWidth: Dimensions.get('window').width * 0.78 }]}
                onPress={() => { try {
                  // 유튜브면 이미지 뷰어 스타일로, 그 외는 파일 뷰어
                  let isYouTube = false;
                  let isMap = false;
                  try {
                    const u = new URL(String(linkUrl)); const h = u.host.toLowerCase();
                    isYouTube = /(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h);
                    isMap = /(^|\.)maps\.google\./.test(h) || /maps\.app\.goo\.gl$/.test(h) || (/goo\.gl$/.test(h) && /\/maps/i.test(u.pathname||''));
                  } catch {}
                  if (isYouTube) {
                    // 유튜브는 통합 뷰어로 열어 인덱스/이전·다음 이동 지원
                    try { openImageViewer(item as any, undefined, undefined, String(linkUrl), 'youtube'); }
                    catch { setImageViewer({ url: String(linkUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'youtube' } as any); }
                  } else if (isMap) {
                    try { openImageViewer(item as any, undefined, undefined, String(linkUrl), 'map'); }
                    catch { setImageViewer({ url: String(linkUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'map' } as any); }
                  } else try { openImageViewer(item as any, undefined, undefined, String(linkUrl)); } catch { setImageViewer({ url: String(linkUrl), senderId: item.senderId, createdAt: item.createdAt, messageId: item.id, kind: 'web' } as any); }
                } catch {} }}
                onLongPress={() => setMenuFor({ item, display: linkUrl || display, fileUrl: linkUrl || null, mapUrl: null })}
                delayLongPress={350}
              >
                {/* 상단 전체 URL 표기 (@ 제거, 자동 줄바꿈) */}
                <View style={{ paddingHorizontal:10, paddingTop:8 }}>
                  <Text style={[{ color:'#111', fontWeight:'700', fontSize:12 }, Platform.OS==='web'?{ wordBreak:'break-word', overflowWrap:'anywhere', whiteSpace:'pre-wrap' } as any : null]}>
                    {String(linkUrl).replace(/^@/,'')}
                  </Text>
                </View>
                {(() => {
                  // 파비콘은 이미지로 노출하지 않음 → 제목 박스만
                  const looksLikeFavicon = (u?: string) => !!u && /favicon|\.ico(\?|$)/i.test(String(u));
                  const api = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || 'http://localhost:8080/api/link-preview';
                  const imgProxy = (u: string) => {
                    try {
                      const root = String(api).replace(/\/?api\/link-preview$/,'');
                      const base = root || 'http://localhost:8080';
                      return `${base}/api/img?src=${encodeURIComponent(u)}`;
                    } catch { return String(u); }
                  };
                  const rawImg = linkMeta?.image;
                  const finalImg = rawImg && !looksLikeFavicon(rawImg) ? imgProxy(String(rawImg)) : null;
                  if (finalImg && !linkImgErr) {
                    return (
              Platform.OS === 'web' ? (
                        <Image source={{ uri: proxiedImageUrl(finalImg) }} onError={() => setLinkImgErr(true)} style={styles.linkImage} resizeMode="cover" />
                      ) : (
                        <EImage source={{ uri: finalImg }} onError={() => setLinkImgErr(true)} style={styles.linkImage} contentFit="cover" />
                      )
                    );
                  }
                  // 프록시 실패 시 원본 이미지 시도
                  if (rawImg && !looksLikeFavicon(rawImg) && linkImgErr) {
                    return (
                      Platform.OS === 'web' ? (
                        <Image source={{ uri: proxiedImageUrl(String(rawImg)) }} onError={() => { /* 최종 실패 시 텍스트 카드 유지 */ }} style={styles.linkImage} resizeMode="cover" />
                      ) : (
                        <EImage source={{ uri: String(rawImg) }} onError={() => { /* 최종 실패 시 텍스트 카드 유지 */ }} style={styles.linkImage} contentFit="cover" />
                      )
                    );
                  }
                  return (
                    <View style={[styles.linkImage, { alignItems:'flex-start', justifyContent:'flex-end', padding:10, backgroundColor:'#F5F5F5' }] }>
                      {!!linkMeta?.title && (
                        <Text style={{ color:'#111', fontWeight:'800', fontSize:14 }} numberOfLines={2}>{linkMeta.title}</Text>
                      )}
                    </View>
                  );
                })()}
                <View style={{ paddingHorizontal:10, paddingTop:8, paddingBottom:8 }}>
                  {!!(linkMeta?.title) && (
                    <Text style={[{ color:'#111', fontWeight:'700', fontSize:12 }, Platform.OS==='web'?{ wordBreak:'break-word', overflowWrap:'anywhere' } as any : null]} numberOfLines={2}>{linkMeta.title}</Text>
                  )}
                  {!!(linkMeta?.description) && (
                    <Text style={{ color:'#444', fontSize:12, marginTop:4 }} numberOfLines={2}>{linkMeta.description}</Text>
                  )}
                    </View>
                  </TouchableOpacity>
            ); })()}
            {/* 위치 메시지는 텍스트 영역 클릭 시 지도 오픈 */}
            {ttlMsGlobal > 0 && (
              <View style={styles.ttlBadge}>
                <Text style={styles.ttlBadgeText}>{formatTtl(remainMsForBadge)}</Text>
              </View>
            )}
        {showQuick && (
              <View style={{ flexDirection:'row', gap: 10, marginTop: 6, justifyContent:'flex-end' }}>
                <TouchableOpacity onPress={() => { toggleReaction(roomId, item.id, '👍', (firebaseAuth.currentUser?.uid || 'me')); setShowQuick(false); }}>
                  <Text style={{ color:'#222', fontWeight:'700' }}>👍 공감</Text>
            </TouchableOpacity>
                <TouchableOpacity onPress={() => { const prev = item.content || (item.imageUrl ? '[이미지]' : ''); setReplyTo({ id: item.id, preview: String(prev).slice(0, 60) }); setShowQuick(false); }}>
                  <Text style={{ color:'#222', fontWeight:'700' }}>↩ 답장</Text>
                  </TouchableOpacity>
                </View>
              )}
            {/* checkbox rendered at row level */}
                    </TouchableOpacity>
            );
          })()
        ))}
        {(() => {
          try {
            const rcRaw: any = (item as any)?.reactionsCount || {};
            const hasRc = rcRaw && Object.keys(rcRaw).length > 0;
            const counts = hasRc ? rcRaw : (() => {
              const agg: Record<string, number> = {};
              try {
                const by = (item as any)?.reactionsByUser || {};
                Object.values(by).forEach((emoji: any) => {
                  const e = String(emoji || '');
                  if (!e) return;
                  agg[e] = (agg[e] || 0) + 1;
                });
              } catch {}
              return agg;
            })();
            const entries = Object.entries(counts).filter(([, c]) => Number(c) > 0);
            if (!entries.length) return null;
            return (
              <View style={{ marginTop: 6, alignSelf: isMe ? 'flex-end' : 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {entries.map(([emoji, c]) => (
                  <TouchableOpacity
                    key={String(emoji)}
                    activeOpacity={0.8}
                    onPress={() => {
                      try {
                        const by = (item as any)?.reactionsByUser || {};
                        const groupsMap: Record<string, { uid: string; name: string; avatar?: string }[]> = {};
                        const getName = (uid: string) => {
                          try {
                            const prof: any = (profilesAll as any)?.[uid] || {};
                            return (
                              prof.chatName || prof.nickname || prof.nick || prof.alias ||
                              prof.displayName || prof.username || prof.email || uid
                            );
                          } catch { return uid; }
                        };
                        Object.entries(by).forEach(([uid, em]) => {
                          const e = String(em || '');
                          if (!e) return;
                          const prof = (profilesAll as any)?.[uid];
                          const name = String(getName(String(uid))).trim() || '사용자';
                          const avatar = prof?.avatar || undefined;
                          groupsMap[e] = groupsMap[e] || [];
                          groupsMap[e].push({ uid: String(uid), name, avatar });
                        });
                        const groups = Object.entries(groupsMap).map(([e, users]) => ({
                          emoji: e,
                          users: users.slice().sort((a,b)=> String(a.name).localeCompare(String(b.name),'ko')),
                        }));
                        setReactionDetail({ messageId: item.id, groups });
                      } catch {}
                    }}
                    style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingVertical:4, borderRadius:999, borderWidth:1, borderColor:'#D4AF37', backgroundColor:'rgba(212,175,55,0.18)' }}
                  >
                    <Text style={{ fontSize:12 }}>{String(emoji)}</Text>
                    <Text style={{ fontSize:12, marginLeft:4, color:'#111' }}>{String(c)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          } catch { return null; }
        })()}
        
        <Text style={styles.timeText}>{new Date(item.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    );
  });

  

  // 상단 설정 버튼 + 모달 (컴포넌트 타입 고정: 재렌더 시 재마운트 방지)
  const RoomSettingsButton = useMemo(() => function RoomSettingsButton({ roomId }: { roomId: string }) {
    const [open, setOpen] = useState<boolean>(() => {
      try { return !!((globalThis as any).__roomSettingsOpen?.[roomId]); } catch { return false; }
    });
    const wasOpenRef = useRef(false);
    useEffect(()=>{ wasOpenRef.current = open; }, [open]);
    useEffect(()=>{ try { const g:any = (globalThis as any); g.__roomSettingsOpen = g.__roomSettingsOpen || {}; g.__roomSettingsOpen[roomId] = open; } catch {} }, [open, roomId]);
    const settings = useKakaoRoomsStore((s) => s.roomSettings[roomId]);
    const load = useKakaoRoomsStore((s) => s.loadRoomSettings);
    const save = useKakaoRoomsStore((s) => s.saveRoomSettings);
    const updateMeta = useKakaoRoomsStore((s) => s.updateRoomMeta);
    const genInvite = useKakaoRoomsStore((s) => s.generateInvite);
    const room = useKakaoRoomsStore((s) => s.getRoomById(roomId));
    const setRoomTTLAct = useKakaoRoomsStore((s) => s.setRoomTTL);
    const setMessageTTLAct = useKakaoRoomsStore((s) => (s as any).setMessageTTL);
    const setMemberRole = useKakaoRoomsStore((s) => s.setMemberRole);
    const kickMember = useKakaoRoomsStore((s) => s.kickMember);
    const closeChatForUser = useKakaoRoomsStore((s) => s.closeChatForUser);
    const transferOwnership = useKakaoRoomsStore((s) => (s as any).transferOwnership);
    const createRoomAct = useKakaoRoomsStore((s) => s.createRoom);
    const followAct = useFollowStore((s)=> s.follow);
    const leaveRoomAct = useKakaoRoomsStore((s) => s.leaveRoom);
    const setRoomPrivacy = useKakaoRoomsStore((s)=> (s as any).setRoomPrivacy);
    const resetRoomForUserAct = useKakaoRoomsStore((s)=> (s as any).resetRoomForUser);
    const [tab, setTab] = useState<'basic'|'ttl'|'members'|'permissions'|'security'|'notifications'|'theme'|'data'>('basic');
    const [localTitle, setLocalTitle] = useState(room?.title || '');
    const [localDesc, setLocalDesc] = useState(settings?.basic?.description || '');
    const [publicOn, setPublicOn] = useState(Boolean(settings?.basic?.isPublic ?? true));
    const [passwordDraft, setPasswordDraft] = useState<string>('');
    const [avatarDraft, setAvatarDraft] = useState<string>(room?.avatarUrl || '');
    const [participantLimitDraft, setParticipantLimitDraft] = useState<string>(
      (() => { try { const v = (settings as any)?.basic?.participantLimit; return (v || v === 0) ? String(v) : ''; } catch { return ''; } })()
    );
    const [tagsDraft, setTagsDraft] = useState<string[]>(room?.tags || []);
    const [tagInput, setTagInput] = useState('');
    const [blackAdd, setBlackAdd] = useState<string>('');
    // 초대 모달 상태
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteData, setInviteData] = useState<{ code: string; qrUrl: string } | null>(null);
    const [qrSrc, setQrSrc] = useState<string | null>(null);

    // 안전 종료: 포커스 해제 + 전역 플래그 OFF + visible=false
    const closeModal = useCallback(() => {
      try {
        if (Platform.OS === 'web') {
          try { (document.activeElement as any)?.blur?.(); } catch {}
        }
      } catch {}
      try { setOpen(false); } catch {}
      try { const g:any = (globalThis as any); g.__roomSettingsOpen = g.__roomSettingsOpen || {}; g.__roomSettingsOpen[roomId] = false; } catch {}
    }, [roomId]);

    // 모달을 열 때마다 현재 저장된 값으로 동기화 (초기 로딩/재진입 포함)
    useEffect(() => {
      if (!open) return;
      try {
        setLocalTitle(room?.title || '');
        setLocalDesc((settings as any)?.basic?.description || room?.description || '');
        const isPublicFromSettings = (settings as any)?.basic?.isPublic;
        const isPublicFromRoom = (typeof room?.isPublic === 'boolean' ? room?.isPublic : undefined);
        if (typeof isPublicFromSettings === 'boolean') setPublicOn(Boolean(isPublicFromSettings));
        else if (typeof isPublicFromRoom === 'boolean') setPublicOn(Boolean(isPublicFromRoom));
        setAvatarDraft(room?.avatarUrl || '');
        // passwordDraft는 사용자가 입력 중일 수 있으므로 여기서 강제 재설정하지 않음
        setTagsDraft(Array.from(new Set((room?.tags||[]).map((t:string)=>String(t).trim().toLowerCase()).filter(Boolean))));
        setTagInput('');
      } catch {}
    }, [open, settings, room?.title, room?.description, room?.avatarUrl, room?.isPublic]);
    const [expDays, setExpDays] = useState('0');
    const [expClock, setExpClock] = useState('00:00:00');
    const [ttlDays, setTtlDays] = useState('0');
    const [ttlClock, setTtlClock] = useState('00:03:00');
    // Theme custom controls
    const [bgCustomOpen, setBgCustomOpen] = useState(false);
    const [bgHexDraft, setBgHexDraft] = useState('');
    const [bgImageDraft, setBgImageDraft] = useState<string>('');

    useEffect(() => { void load(roomId).then((st) => {
      setLocalDesc(st.basic?.description || '');
      setPublicOn(Boolean(st.basic?.isPublic));
      try {
        const now = Date.now();
        const ms = Math.max(0, Number((useKakaoRoomsStore as any).getState().getRoomById(roomId)?.expiresAt || 0) - now);
        const s = Math.floor(ms/1000);
        const d = Math.floor(s/86400);
        const h = Math.floor((s%86400)/3600);
        const m = Math.floor((s%3600)/60);
        const ss = s%60;
        setExpDays(String(d));
        const pad=(n:number)=>String(n).padStart(2,'0');
        setExpClock(`${pad(h)}:${pad(m)}:${pad(ss)}`);
        // 메시지 TTL 초기값 (기본 3분)
        const msgTtlMs = Math.max(0, Number((useKakaoRoomsStore as any).getState().getRoomById(roomId)?.messageTtlMs || 0));
        const ttlS = Math.floor((msgTtlMs || 180000) / 1000); // 기본 180초
        const td = Math.floor(ttlS/86400);
        const th = Math.floor((ttlS%86400)/3600);
        const tm = Math.floor((ttlS%3600)/60);
        const tse = ttlS%60;
        setTtlDays(String(td));
        setTtlClock(`${pad(th)}:${pad(tm)}:${pad(tse)}`);
      } catch {}
    }); }, [roomId]);

    const onSaveBasic = () => {
      // 유효성: 비공개인데 비밀번호 미입력 시 경고
      try {
        const willPrivate = !publicOn;
        const hasPassword = !!String(passwordDraft||'').trim();
        if (willPrivate && !hasPassword) {
          Alert.alert('필요', '비공개 방에는 비밀번호가 필요합니다.');
          return;
        }
      } catch {}
      // 1) 먼저 즉시 닫기
      closeModal();
      // 2) 저장은 백그라운드로 병렬 수행
      try { void updateMeta(roomId, { title: localTitle, description: localDesc, isPublic: publicOn, avatarUrl: avatarDraft || undefined, tags: tagsDraft }); } catch {}
      try {
        const limNum = Math.max(0, Number(participantLimitDraft||0));
        const basicSave: any = { description: localDesc, isPublic: publicOn, participantLimit: limNum > 0 ? limNum : null };
        if (!publicOn) basicSave.password = String(passwordDraft||'').trim();
        else basicSave.password = null;
        void save(roomId, { basic: basicSave })
          .then(() => { try { Alert.alert('저장됨', '기본 설정을 저장했습니다.'); } catch {} })
          .catch(() => { try { Alert.alert('오류', '저장 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'); } catch {} });
      } catch {}
    };
    const onInvite = async () => {
      try {
        const res: any = await genInvite(roomId);
        const code = res?.code || '';
        const qrUrl = res?.qrUrl || '';
        const deep = res?.deepLink || `yooy://invite?room=${roomId}&code=${code}`;
        setInviteData({ code, qrUrl });
        setQrSrc(null);
        if (Platform.OS === 'web') {
          // 1) 웹에서는 로컬에서 QR DataURL 생성 (CORS 무관, 즉시 표시)
          try {
            const QRMod: any = (await import('qrcode')) as any;
            const QRLib: any = (QRMod?.default || QRMod);
            const dataUrl: string = await QRLib.toDataURL(deep, {
              errorCorrectionLevel: 'H',
              margin: 2,
              scale: 8,
              color: { dark: '#000000', light: '#ffffff' },
            });
            setQrSrc(String(dataUrl));
          } catch {
            // 2) 실패 시 구글 차트 URL 직접 사용
            setQrSrc(qrUrl || null);
          }
        } else {
          // 네이티브: 기존 URL 사용 (또는 react-native-qrcode-svg 도입 가능)
          setQrSrc(qrUrl || null);
        }
        setInviteOpen(true);
      } catch {
        Alert.alert('오류','초대 생성에 실패했습니다.');
      }
    };

    // 멤버 롱프레스 액션 상태
    const [memberSelect, setMemberSelect] = useState<string | null>(null);
    const handleMemberAction = async (action: 'promote' | 'kick' | 'close') => {
      if (!memberSelect) return;
      if (action === 'promote') await setMemberRole(roomId, memberSelect, 'moderator');
      if (action === 'kick') await kickMember(roomId, memberSelect);
      if (action === 'close') await closeChatForUser(roomId, memberSelect);
      setMemberSelect(null);
    };

    const renderFooterActions = () => (
      <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
        <TouchableOpacity onPress={onSaveBasic} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>{t('saveBtn', language)}</Text></TouchableOpacity>
        <TouchableOpacity onPress={onInvite} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>{t('inviteCodeQr', language)}</Text></TouchableOpacity>
        <View style={{ flex:1 }} />
        <TouchableOpacity onPress={async () => {
          try { console.log('[room-settings] leave click'); } catch {}
          if (Platform.OS === 'web') {
            // 웹: Alert 버튼 콜백 미동작 이슈 회피 → window.confirm 사용
            const ok = (()=>{ try { return window.confirm('정말 이 방을 나가시겠습니까? 내 리스트에서 제거됩니다.'); } catch { return true; } })();
            if (!ok) return;
            try { console.log('[room-settings] leave confirm(web)'); } catch {}
            // 낙관적 제거 후 서버 시도
            try { useKakaoRoomsStore.setState((s:any)=>({ rooms: (s.rooms||[]).filter((r:any)=>r.id!==roomId) })); } catch {}
            try {
              let uid = firebaseAuth.currentUser?.uid || '';
              if (!uid) { try { uid = await ensureAuthedUid(); } catch { uid = firebaseAuth.currentUser?.uid || 'me'; } }
              await leaveRoomAct(roomId, uid);
            } catch {}
            try { Alert.alert('완료','방에서 나갔습니다.'); } catch {}
            setOpen(false);
            try { router.replace('/chat/rooms'); } catch {}
            return;
          }
          Alert.alert(t('leaveRoom', language),'',[
            { text:t('cancel', language), style:'cancel' },
            { text:t('leaveRoom', language), style:'destructive', onPress: async ()=>{ try { console.log('[room-settings] leave confirm'); } catch {} try { useKakaoRoomsStore.setState((s:any)=>({ rooms: (s.rooms||[]).filter((r:any)=>r.id!==roomId) })); } catch {} try { let uid = firebaseAuth.currentUser?.uid || ''; if (!uid) { try { uid = await ensureAuthedUid(); } catch { uid = firebaseAuth.currentUser?.uid || 'me'; } } await leaveRoomAct(roomId, uid); } catch {} try { Alert.alert('완료','방에서 나갔습니다.'); } catch {} setOpen(false); try { router.replace('/chat/rooms'); } catch {} } }
          ]);
        }} style={[styles.secondaryBtn, { borderColor:'#7A1F1F' }]}>
          <Text style={[styles.secondaryBtnText, { color:'#FF6B6B' }]}>{t('leaveRoom', language)}</Text>
        </TouchableOpacity>
      </View>
    );
    const themeForTop = useKakaoRoomsStore((s)=> s.roomSettings[roomId]?.theme);
    const globalAppearanceTop = useChatSettingsStore((s)=> s.appearance);
    const isLightHex = (hex?: string): boolean => {
      try {
        if (!hex) return false;
        const h = hex.replace('#','');
        const v = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
        const num = parseInt(v,16);
        const r=(num>>16)&255, g=(num>>8)&255, b=num&255;
        const srgb = [r,g,b].map(c=>{ const x=c/255; return x<=0.03928? x/12.92 : Math.pow((x+0.055)/1.055,2.4); });
        const L = 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
        return L > 0.5;
      } catch { return false; }
    };
    const topIconIsDark = ((): boolean => {
      const t = themeForTop || ({} as any);
      if (t?.mode === 'light') return true;
      if (!t?.mode && (globalAppearanceTop?.theme === 'light')) return true;
      if (t?.backgroundType === 'custom-color' && t?.backgroundColor) return isLightHex(t.backgroundColor);
      return false;
    })();
    const topIconColor = topIconIsDark ? '#111' : '#FFFFFF';
  return (
    <>
        <TouchableOpacity onPress={() => setOpen(true)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <MaterialIcons name="settings" size={18} color={topIconColor} />
          </TouchableOpacity>
        <Modal animationType="fade" transparent visible={open} onRequestClose={closeModal}>
          <View style={styles.settingsOverlay} pointerEvents="auto">
            <View style={[styles.settingsSheet, { maxHeight: '100%', height: '68%' }]}>
              <View style={styles.settingsHeader}>
                <Text style={styles.settingsTitle}>{t('roomSettings', language)}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={closeModal}><Text style={{ color: '#999' }}>{t('close', language)}</Text></TouchableOpacity>
          </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.settingsTabsWrap} contentContainerStyle={styles.settingsTabs}>
                {([
                  {k:'basic',label:t('basicTab', language)},
                  ...(room?.type === 'ttl' ? [{k:'ttl',label:'TTL'}] as any : []),
                  {k:'members',label:t('membersTab', language)},
                  {k:'permissions',label:t('permissionsTab', language)},
                  {k:'notifications',label:t('notificationsTab', language)},
                  {k:'theme',label:t('themeTab', language)},
                ] as any[]).map(t => (
                  <TouchableOpacity key={t.k} style={[styles.tabBtn, tab===t.k && styles.tabBtnActive]} onPress={() => setTab(t.k as any)}>
                    <Text style={[styles.tabText, tab===t.k && styles.tabTextActive]} numberOfLines={1} ellipsizeMode="tail">{t.label}</Text>
          </TouchableOpacity>
                ))}
        </ScrollView>

              {/* 탭 내용 */}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                {tab === 'basic' && (
                  <View style={{ gap: 12 }}>
                    {/* 방 프로필 썸네일 업로드 */}
                    <Text style={styles.fieldLabel}>{t('coverImage', language)}</Text>
                    <View style={{ flexDirection:'row', alignItems:'center', gap: 12 }}>
                      {(() => {
                        const src = String(avatarDraft || room?.avatarUrl || '');
                        if (src) {
                          return (
                            <EImage source={{ uri: src }} style={{ width: 52, height: 52, borderRadius: 10, borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#0E0E0E' }} contentFit="cover" />
                          );
                        }
                        return (
                          <View style={{ width: 52, height: 52, borderRadius: 10, borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#0E0E0E', alignItems:'center', justifyContent:'center' }}>
                            <Text style={{ color:'#555', fontSize: 11 }}>이미지</Text>
                          </View>
                        );
                      })()}
                      <TouchableOpacity style={styles.secondaryBtn} onPress={async () => {
                        try {
                          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
                          if (!res.canceled && res.assets?.length) {
                            const uri = res.assets[0].uri;
                            setAvatarDraft(uri);
                            Alert.alert('이미지', '대표 이미지 미리보기를 업데이트했습니다. 저장을 눌러 확정하세요.');
                          }
                        } catch {}
                      }}>
                        <Text style={styles.secondaryBtnText}>{room?.avatarUrl ? t('change', language) : t('register', language)}</Text>
            </TouchableOpacity>
        </View>

                    <Text style={styles.fieldLabel}>{t('roomName', language)}</Text>
                    <TextInput value={localTitle} onChangeText={setLocalTitle} style={styles.fieldInput} placeholder={t('roomName', language)} placeholderTextColor="#666" />

                    <Text style={styles.fieldLabel}>{t('roomDesc', language)}</Text>
                    <TextInput
                      value={localDesc}
                      onChangeText={setLocalDesc}
                      style={[styles.fieldInput, { height: 80 }]}
                      placeholder={t('descriptionPh', language)}
                      placeholderTextColor="#666"
                      multiline
                    />

                    {/* 참가 인원수 제한 */}
                    <Text style={styles.fieldLabel}>{t('participantLimit', language)}</Text>
                    <TextInput
                      value={participantLimitDraft}
                      onChangeText={setParticipantLimitDraft}
                      style={styles.fieldInput}
                      placeholder={t('participantLimitNoneHint', language)}
                      placeholderTextColor="#666"
                      keyboardType="number-pad"
                    />
                    {/* 태그 입력 + 칩: 입력창 내부에 칩이 함께 보이고, 콤마 입력 즉시 칩 확정, 백스페이스로 삭제 */}
                    <Text style={styles.fieldLabel}>{t('tagsComma', language)}</Text>
                    <View style={styles.tagWrap}>
                      {(tagsDraft||[]).map((t:string, idx:number)=> (
                        <TouchableOpacity key={`${t}-${idx}`} style={styles.chip} onPress={() => {
                          const next = (tagsDraft||[]).filter((x, i) => i !== idx);
                          setTagsDraft(next);
                        }}>
                          <Text style={styles.chipText}>{t}</Text>
                          <Text style={styles.chipRemove}>×</Text>
                        </TouchableOpacity>
                      ))}
                      <TextInput
                        value={tagInput}
                        onChangeText={(text)=>{
                          if (text.includes(',')) {
                            const parts = text.split(',');
                            const last = parts.pop() || '';
                            const newOnes = parts.map(s=>s.trim().toLowerCase()).filter(Boolean);
                            if (newOnes.length) {
                              const merged = Array.from(new Set([...(tagsDraft||[]), ...newOnes]));
                              setTagsDraft(merged);
                            }
                            setTagInput(last);
                          } else {
                            setTagInput(text);
                          }
                        }}
                        onKeyPress={(e:any)=>{
                          try {
                            if (e.nativeEvent?.key === 'Backspace' && !tagInput.length && (tagsDraft||[]).length) {
                              const next = (tagsDraft||[]).slice(0, -1);
                              setTagsDraft(next);
                            }
                          } catch {}
                        }}
                        onSubmitEditing={()=>{
                          const v = tagInput.trim().toLowerCase();
                          if (!v) return;
                          const merged = Array.from(new Set([...(tagsDraft||[]), v]));
                          setTagsDraft(merged);
                          setTagInput('');
                          
                        }}
                        style={styles.tagTextInput}
                        placeholder="#travel, #food"
                        placeholderTextColor="#666"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>

                    <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
                      <Text style={styles.fieldLabel}>{t('publicState', language)}</Text>
                      <TouchableOpacity onPress={async () => {
                        // 저장 전에 최신 설정을 불러와 병합 손실을 방지
                        try { await load(roomId); } catch {}
                        const next = !publicOn; setPublicOn(next);
                        await setRoomPrivacy(roomId, next, next ? undefined as any : String(passwordDraft||'').trim());
                        await updateMeta(roomId, { isPublic: next });
                      }} style={styles.toggleBtn}><Text style={{ color:'#FFF' }}>{publicOn ? t('publicOn', language) : t('publicOff', language)}</Text></TouchableOpacity>
                    </View>
                    {!publicOn && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={styles.fieldLabel}>비밀번호</Text>
                        <TextInput
                          value={passwordDraft}
                          onChangeText={setPasswordDraft}
                          style={styles.fieldInput}
                          placeholder="비밀번호 입력"
                          placeholderTextColor="#666"
                          secureTextEntry
                        />
                        <Text style={{ color:'#777', fontSize:12, marginTop:4 }}>비공개 방은 입장 시 비밀번호가 필요합니다.</Text>
                      </View>
                    )}
                    
          </View>
        )}

                {tab === 'members' && (
                  <View style={{ gap: 12 }}>
                    {/* 운영자: 방장/부방장 */}
                    <Text style={styles.fieldLabel}>{t('operatorsLabel', language)}</Text>
                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:10 }}>
                      {(() => {
                        const meUid = firebaseAuth.currentUser?.uid || 'me';
                        const baseRoles = (settings?.members?.roles || {}) as Record<string,string>;
                        const roles = (Object.keys(baseRoles||{}).length ? baseRoles : { [meUid]: 'admin' }) as Record<string,string>;
                        const entries = Object.entries(roles);
                        const profiles = (()=>{ const base = profilesAll || {}; const cur = currentProfileAll as any; return cur ? { ...base, [cur.userId]: { ...(base[cur.userId]||{}), ...cur } } : base; })();
                        const ownerUid = room?.createdBy || entries.find(([,r])=>r==='admin')?.[0] || meUid;
                        const adminUids = Array.from(new Set([ownerUid, ...entries.filter(([,r])=>r==='admin').map(([u])=>u)])).filter(Boolean);
                        const modUids = entries.filter(([,r])=>r==='moderator').map(([u])=>u);
                        const renderUser = (uid:string, label:string) => {
                          const p = profiles[uid] || {};
                          const self = uid === meUid;
                          const name = (self && ((currentProfileAll as any)?.displayName || firebaseAuth.currentUser?.displayName)) || p.displayName || uid;
                          const avatar = (self && (((currentProfileAll as any)?.avatar as any) || (firebaseAuth.currentUser as any)?.photoURL)) || p.avatar || '';
                          return (
                            <View key={`${label}-${uid}`} style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:999, backgroundColor:'#141414' }}>
                              {avatar ? (
                                <EImage source={{ uri: avatar }} style={{ width:22, height:22, borderRadius:11, marginRight:8 }} contentFit="cover" />
                              ) : (
                                <View style={{ width:22, height:22, borderRadius:11, backgroundColor:'#333', marginRight:8 }} />
                              )}
                              <Text style={{ color:'#FFD700', fontWeight:'700', marginRight:6 }}>{label}</Text>
                              <Text style={{ color:'#EEE', fontWeight:'700' }}>{name}</Text>
        </View>
                          );
                        };
                  return (
                          <>
                            {adminUids.slice(0,1).map(uid => renderUser(uid,'방장'))}
                            {modUids.map(uid => renderUser(uid,'부방장'))}
                          </>
                        );
                      })()}
          </View>

                    {/* 참가자 리스트: 본인 → 운영자 → 이름 정렬 (프로필 사진 + 대화명) */}
                    <Text style={styles.fieldLabel}>{t('participantsList', language)} ({room?.members?.length || 0})</Text>
                    <View style={{ borderWidth:1, borderColor:'#1E1E1E', borderRadius:8 }}>
                      {(() => {
                        const me = firebaseAuth.currentUser?.uid || 'me';
                        const baseRoles = settings?.members?.roles || {} as Record<string,string>;
                        const roles = (Object.keys(baseRoles||{}).length ? baseRoles : { [me]: 'admin' }) as Record<string,string>;
                        const profiles = (()=>{ const base = profilesAll || {}; const cur = currentProfileAll as any; return cur ? { ...base, [cur.userId]: { ...(base[cur.userId]||{}), ...cur } } : base; })();
                        const ownerUid = room?.createdBy || (Object.entries(roles).find(([,r])=>r==='admin')?.[0] || '');
                        const simpleHash = (s: string) => {
                          try { let h=5381; for (let i=0;i<s.length;i++) h = ((h<<5)+h) ^ s.charCodeAt(i); const x=(h>>>0).toString(36); return `#${x.slice(0,8)}`; } catch { return `#${(s||'id').slice(0,8)}`; }
                        };
                        const nameFor = (uid: string) => {
                          const cur = (currentProfileAll as any) || {};
                          const p = profiles[uid] || {} as any;
                          const roomHashOn = ((settings as any)?.security?.useHashInRoom) === true;
                          if (roomHashOn) return simpleHash(uid);
                          if (uid === (cur.userId||'')) return cur.displayName || (firebaseAuth.currentUser as any)?.displayName || p.displayName || uid;
                          if (uid === (firebaseAuth.currentUser?.uid||'')) return (cur.displayName || (firebaseAuth.currentUser as any)?.displayName) || profiles[uid]?.displayName || uid;
                          if (ownerUid && uid === ownerUid) return p.displayName || (cur.displayName || (firebaseAuth.currentUser as any)?.displayName) || uid;
                          return p.chatName || p.nickname || p.nick || p.alias || p.displayName || p.username || p.email || uid;
                        };
                        const avatarFor = (uid: string) => {
                          const cur = (currentProfileAll as any) || {};
                          if (uid === (cur.userId||'')) return (cur.avatar as any) || (firebaseAuth.currentUser as any)?.photoURL || '';
                          if (uid === (firebaseAuth.currentUser?.uid||'')) return (cur.avatar as any) || (firebaseAuth.currentUser as any)?.photoURL || '';
                          const p = profiles[uid] || {} as any;
                          return p.avatar || '';
                        };
                        const list = (room?.members || []).map((uid:string)=>({
                          uid,
                          name: nameFor(uid),
                          avatar: avatarFor(uid),
                          role: roles[uid] || 'member',
                          isSelf: uid === me || uid === ownerUid,
                          isOperator: roles[uid]==='admin' || roles[uid]==='moderator',
                        }));
                        list.sort((a,b)=>{
                          if (a.isSelf && !b.isSelf) return -1; if (!a.isSelf && b.isSelf) return 1;
                          if (a.isOperator && !b.isOperator) return -1; if (!a.isOperator && b.isOperator) return 1;
                          return a.name.localeCompare(b.name, 'ko');
                        });
                return list.map(p => (
                   <View
                     key={p.uid}
                     style={{ paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#111', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}
                   >
                     <TouchableOpacity onPress={() => router.push({ pathname:'/chat/friend-profile', params:{ id: p.uid } as any })} onLongPress={() => setMemberSelect(p.uid)} style={{ flexDirection:'row', alignItems:'center', flex:1 }}>
                       {p.avatar ? (
                         <EImage source={{ uri: p.avatar }} style={{ width:28, height:28, borderRadius:14, marginRight:10 }} contentFit="cover" />
                       ) : (
                         <View style={{ width:28, height:28, borderRadius:14, backgroundColor:'#333', marginRight:10 }} />
                       )}
                       <Text style={{ color:'#EEE' }}>{p.name}</Text>
                     </TouchableOpacity>
                     <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                       <Text style={{ color:'#777', fontSize:12, marginRight:6 }}>{p.role}</Text>
                       <TouchableOpacity
                         onPress={() => setMemberMenu({ uid: p.uid, name: p.name, role: String(p.role||'member') })}
                         style={{ width:26, height:26, borderRadius:13, borderWidth:1, borderColor:'#2A2A2A', alignItems:'center', justifyContent:'center' }}
                       >
                         <MaterialIcons name="more-horiz" size={16} color="#CCCCCC" />
                       </TouchableOpacity>
                     </View>
                   </View>
                 ));
                      })()}
            </View>
            
          </View>
        )}
                {room?.type === 'ttl' && tab === 'ttl' && (
                  <View style={{ gap: 12 }}>
                    {/* 입력 + 칩 버튼 (상단) */}
                    <View style={{ flexDirection:'row', alignItems:'flex-end', marginBottom: 8 }}>
                      <View style={{ flexShrink: 1, flexGrow: 0, maxWidth: 220, marginRight: 8 }}>
                        <Text style={[styles.fieldLabel,{ marginBottom: 6 }]}>폭파 시간 [DD] TT:MM:SS</Text>
                        <View style={{ flexDirection:'row', gap:12, alignItems:'center' }}>
                          <TextInput
                            keyboardType="numeric"
                            placeholder="DD"
                            placeholderTextColor="#666"
                            value={expDays}
                            onChangeText={setExpDays}
                            style={[styles.fieldInput,{ width: 48, height: 36, paddingVertical: 0, textAlign:'center' }]}
                          />
                          <TextInput
                            keyboardType="numbers-and-punctuation"
                            placeholder="TT : MM : SS"
                            placeholderTextColor="#666"
                            value={(expClock || '').replace(/:/g, ' : ')}
                            onChangeText={(t)=>{
                              const v = String(t || '').replace(/\s+/g,'').replace(/\s*:\s*/g,':');
                              setExpClock(v);
                            }}
                            style={[styles.fieldInput,{ width: 112, height: 36, paddingVertical: 0, textAlign:'center' }]}
                          />
                        </View>
                      </View>
                      <View style={{ flexDirection:'row', gap:8 }}>
                        <TouchableOpacity style={[styles.secondaryBtn, { borderColor:'#FFD700' }]} onPress={async ()=>{
                          try {
                            const now = Date.now();
                            const cur = Number(room?.expiresAt||0);
                            const [hh,mm,ss] = (expClock||'00:00:00').split(':').map((v)=>Math.max(0,parseInt(v||'0',10)));
                            const days = Math.max(0, parseInt(expDays||'0',10));
                            const next = now + (((days*24+hh)*60+mm)*60+ss)*1000;
                            if (cur && next > cur) { Alert.alert('안내','수정은 현재 설정보다 늘릴 수 없습니다.'); return; }
                            await setRoomTTLAct(roomId, next);
                            Alert.alert('저장됨','폭파 시간이 수정되었습니다.');
                          } catch { Alert.alert('오류','수정에 실패했습니다.'); }
                        }}>
                          <Text style={[styles.secondaryBtnText,{ color:'#FFD700' }]}>수정</Text>
                </TouchableOpacity>
                        <TouchableOpacity style={[styles.secondaryBtn, { borderColor:'#FFD700' }]} onPress={async ()=>{
                          try {
                            const now = Date.now();
                            const cur = Number(room?.expiresAt||0);
                            const [hh,mm,ss] = (expClock||'00:00:00').split(':').map((v)=>Math.max(0,parseInt(v||'0',10)));
                            const days = Math.max(0, parseInt(expDays||'0',10));
                            const deltaMs = (((days*24+hh)*60+mm)*60+ss)*1000;
                            if (deltaMs <= 0) { Alert.alert('안내','연장할 시간을 입력해 주세요.'); return; }
                            const maxAbs = now + 30*24*60*60*1000;
                            const base = (cur && cur > now) ? cur : now;
                            const next = base + deltaMs;
                            if (next > maxAbs) { Alert.alert('안내','연장은 최대 30일까지 가능합니다.'); return; }

                            const human = (()=>{ const totalS=Math.floor(deltaMs/1000); const d=Math.floor(totalS/86400); const h=Math.floor((totalS%86400)/3600); const m=Math.floor((totalS%3600)/60); const s=totalS%60; const parts=[] as string[]; if(d) parts.push(`${d}일`); if(h) parts.push(`${h}시간`); if(m) parts.push(`${m}분`); if(s) parts.push(`${s}초`); return parts.join(' ')||'0초'; })();
                            Alert.alert('연장 확인', `폭파 시간을 ${human} 연장하며 10 YOY가 차감됩니다. 진행할까요?`, [
                              { text:'취소', style:'cancel' },
                              { text:'확인', style:'default', onPress: async ()=>{
                                try {
                                  // 비용 차감
                                  let newBal: number | null = null;
                                  try {
                                    const email = (firebaseAuth.currentUser as any)?.email || 'guest';
                                    const key = `user_balances_${email}`;
                                    const raw = await AsyncStorage.getItem(key);
                                    const balances = raw ? JSON.parse(raw) : {};
                                    const curYoy = Number(balances.YOY || 0);
                                    if (curYoy < 10) { Alert.alert('잔액 부족','YOY 잔액이 부족합니다.'); return; }
                                    balances.YOY = curYoy - 10; newBal = balances.YOY;
                                    await AsyncStorage.setItem(key, JSON.stringify(balances));
                                  } catch {}

                                  await setRoomTTLAct(roomId, next);
                                  // UI 동기화
                                  const remS = Math.floor((next-now)/1000); const d=Math.floor(remS/86400); const h=Math.floor((remS%86400)/3600); const m=Math.floor((remS%3600)/60); const sec=remS%60; const pad=(n:number)=>String(n).padStart(2,'0'); setExpDays(String(d)); setExpClock(`${pad(h)}:${pad(m)}:${pad(sec)}`);
                                  // 로그 기록(로컬)
                                  try {
                                    const key = `room:${roomId}:ttl.logs`;
                                    const raw = await AsyncStorage.getItem(key);
                                    const list = raw ? JSON.parse(raw) : [];
                                    const entry = { type:'extend', deltaMs, prev: cur||null, next, by: (firebaseAuth.currentUser?.uid||'me'), ts: Date.now() };
                                    const nextList = [entry, ...(Array.isArray(list)?list:[])].slice(0,50);
                                    await AsyncStorage.setItem(key, JSON.stringify(nextList));
                                    // 화면에 즉시 반영할 경우 로드 루틴 대신 현지 상태만 갱신
                                  } catch {}
                                  Alert.alert('연장 완료', `10 YOY가 차감되었습니다.${newBal!=null?` (잔액: ${newBal} YOY)`:''}`);
                                } catch { Alert.alert('오류','연장에 실패했습니다.'); }
                              } }
                            ]);
                          } catch { Alert.alert('오류','연장에 실패했습니다.'); }
                        }}>
                          <Text style={[styles.secondaryBtnText,{ color:'#FFD700' }]}>연장</Text>
                </TouchableOpacity>
              </View>
            </View>

                    <Text style={styles.fieldLabel}>TTL 시간 정하기</Text>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="DD"
                        placeholderTextColor="#666"
                        value={ttlDays}
                        onChangeText={setTtlDays}
                        style={[styles.fieldInput,{ width: 48, height: 36, paddingVertical: 0, textAlign:'center' }]}
                      />
                        <TextInput
                        keyboardType="numbers-and-punctuation"
                        placeholder="TT : MM : SS"
                        placeholderTextColor="#666"
                        value={(ttlClock || '').replace(/:/g,' : ')}
                        onChangeText={(t)=>{ const v = String(t||'').replace(/\s+/g,'').replace(/\s*:\s*/g,':'); setTtlClock(v); }}
                        style={[styles.fieldInput,{ width: 134, height: 36, paddingVertical: 0, textAlign:'center' }]}
                        onEndEditing={async ()=>{
                          try {
                            const [hh,mm,ss] = (ttlClock||'00:03:00').split(':').map((v)=>Math.max(0,parseInt(v||'0',10)));
                            const days = Math.max(0, parseInt(ttlDays||'0',10));
                            const ttlMs = (((days*24+hh)*60+mm)*60+ss)*1000;
                              await setMessageTTLAct(roomId, ttlMs);
                            Alert.alert('TTL 설정','메시지 TTL이 저장되었습니다.');
                          } catch { Alert.alert('오류','TTL 저장에 실패했습니다.'); }
                        }}
                      />
                      <TouchableOpacity style={[styles.primaryBtn, { height: 36 }]} onPress={async()=>{
                        try {
                          const [hh,mm,ss] = (ttlClock||'00:03:00').split(':').map((v)=>Math.max(0,parseInt(v||'0',10)));
                          const days = Math.max(0, parseInt(ttlDays||'0',10));
                          const ttlMs = (((days*24+hh)*60+mm)*60+ss)*1000;
                          await setMessageTTLAct(roomId, ttlMs);
                          Alert.alert('저장됨','메시지 TTL이 적용되었습니다.');
                        } catch { Alert.alert('오류','저장에 실패했습니다.'); }
                      }}>
                        <Text style={styles.primaryBtnText}>저장</Text>
                      </TouchableOpacity>
                      </View>
                    {/* 연장 로그 표시 */}
                    {/* 간단 텍스트 로그: 최근 5개만 (로컬) */}
                    <Text style={{ color:'#9BA1A6', fontSize:12 }}>0으로 설정하면 TTL을 끕니다.</Text>
                    {/* 아래 입력영역 제거(상단으로 이동) */}
                    
                    {/* TTL 방장 전용: 기능 허용 토글 (기본 OFF) */}
                    <View style={{ height:1, backgroundColor:'#1E1E1E', marginVertical:10 }} />
                    <Text style={styles.fieldLabel}>TTL 기능 허용</Text>
                    {(() => {
                      const cur = (settings?.ttl || {}) as any;
                      const Row = ({ label, keyName }: { label: string; keyName: 'allowCopy'|'allowSave'|'allowKeep'|'allowCapture' }) => {
                        const on = !!cur[keyName];
                        return (
                          <TouchableOpacity
                            onPress={async()=>{ try { await save(roomId, { ttl: { ...(settings?.ttl||{} as any), [keyName]: !on } }); } catch {} }}
                            style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#151515' }}
                          >
                            <Text style={{ color:'#EDEDED' }}>{label}</Text>
                            <View style={{ width:44, height:26, borderRadius:13, backgroundColor: on ? 'rgba(212,175,55,0.25)' : '#111', borderWidth:1, borderColor: on ? '#D4AF37' : '#2A2A2A', alignItems:'center', justifyContent:'center' }}>
                              <Text style={{ color: on ? '#D4AF37' : '#777', fontWeight:'700' }}>{on ? 'ON' : 'OFF'}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      };
                      return (
                        <View style={{ gap: 6 }}>
                          <Row label="복사 허용" keyName="allowCopy" />
                          <Row label="저장 허용" keyName="allowSave" />
                          <Row label="보관 허용" keyName="allowKeep" />
                          <Row label="캡쳐 허용(권장하지 않음)" keyName="allowCapture" />
                        </View>
                      );
                    })()}
                  </View>
                )}
                {tab === 'permissions' && (
                  <View style={{ gap: 14 }}>
                    <Text style={[styles.fieldLabel,{marginTop:4}]}>{t('permissionsTab', language)}</Text>
                    {(() => {
                      const cur = settings?.permissions || {} as any;
                      const Row = ({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) => (
                        <TouchableOpacity onPress={onPress} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#151515' }}>
                          <Text style={{ color:'#EDEDED' }}>{label}</Text>
                          <View style={{ width:44, height:26, borderRadius:13, backgroundColor: value ? 'rgba(212,175,55,0.25)' : '#111', borderWidth:1, borderColor: value ? '#D4AF37' : '#2A2A2A', alignItems:'center', justifyContent:'center' }}>
                            <Text style={{ color: value ? '#D4AF37' : '#777', fontWeight:'700' }}>{value ? 'ON' : 'OFF'}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                      return (
                        <>
                          <Row label={t('allowFileUpload', language)} value={!!cur.canUploadFiles} onPress={async()=>{ try { await save(roomId, { permissions: { ...(settings?.permissions||{}), canUploadFiles: !cur.canUploadFiles } }); } catch {} }} />
                          <Row label={t('allowDeletePin', language)} value={!!cur.canDeleteOrPin} onPress={async()=>{ try { await save(roomId, { permissions: { ...(settings?.permissions||{}), canDeleteOrPin: !cur.canDeleteOrPin } }); } catch {} }} />
                          <Row label={t('allowExternalLinks', language)} value={!!cur.allowLinks} onPress={async()=>{ try { await save(roomId, { permissions: { ...(settings?.permissions||{}), allowLinks: !cur.allowLinks } }); } catch {} }} />
                          <Row label={t('allowCreatePolls', language)} value={!!cur.canCreatePolls} onPress={async()=>{ try { await save(roomId, { permissions: { ...(settings?.permissions||{}), canCreatePolls: !cur.canCreatePolls } }); } catch {} }} />
                        </>
                      );
                    })()}
                    <View style={{ height:1, backgroundColor:'#1E1E1E', marginVertical:6 }} />
                    <Text style={styles.fieldLabel}>{t('securityLabel', language)}</Text>
                    {(() => {
                      const sec = settings?.security || {} as any;
                      const toggleRow = ({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) => (
                        <TouchableOpacity onPress={onPress} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#151515' }}>
                          <Text style={{ color:'#EDEDED' }}>{label}</Text>
                          <View style={{ width:44, height:26, borderRadius:13, backgroundColor: value ? 'rgba(212,175,55,0.25)' : '#111', borderWidth:1, borderColor: value ? '#D4AF37' : '#2A2A2A', alignItems:'center', justifyContent:'center' }}>
                            <Text style={{ color: value ? '#D4AF37' : '#777', fontWeight:'700' }}>{value ? 'ON' : 'OFF'}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                      return (
                        <View style={{ gap: 10 }}>
                          {/* 이 방에서 해시 사용: ON/OFF 토글 (기본 OFF) */}
                          {(() => {
                            const curVal = (settings as any)?.security?.useHashInRoom;
                            const on = curVal === true; // undefined/null → OFF로 간주
                            return (
                              <TouchableOpacity onPress={async()=>{
                                try {
                                  const next = !on;
                                  await save(roomId, { security: { ...(settings?.security||{}), useHashInRoom: next } });
                                } catch {}
                              }} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#151515' }}>
                                <Text style={{ color:'#EDEDED' }}>{t('useHashInThisRoom', language)}</Text>
                                <View style={{ width:44, height:26, borderRadius:13, backgroundColor: on ? 'rgba(212,175,55,0.25)' : '#111', borderWidth:1, borderColor: on ? '#D4AF37' : '#2A2A2A', alignItems:'center', justifyContent:'center' }}>
                                  <Text style={{ color: on ? '#D4AF37' : '#777', fontWeight:'700' }}>{on ? 'ON' : 'OFF'}</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })()}

                          {/* 블랙리스트 */}
                          <Text style={{ color:'#CFCFCF', marginTop:4 }}>{t('blacklistLabel', language)}</Text>
                          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                            <TextInput
                              value={blackAdd}
                              onChangeText={setBlackAdd}
                              style={[styles.fieldInput, { flex:1 }]}
                              placeholder={t('blockUserUidPh', language)}
                              placeholderTextColor="#666"
                              autoCapitalize="none"
                            />
                            <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{
                              const v = String(blackAdd||'').trim();
                              if (!v) return;
                              try {
                                setReportDialog({ uid: v, reason: '' });
                              } catch {}
                            }}>
                              <Text style={styles.secondaryBtnText}>{t('addBtn', language)}</Text>
                            </TouchableOpacity>
                          </View>
                          {!!(Array.isArray(sec.blacklist) && sec.blacklist.length) && (
                            <View style={{ borderWidth:1, borderColor:'#1E1E1E', borderRadius:8, overflow:'hidden' }}>
                              {sec.blacklist.map((uid:string) => (
                                <View key={uid} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#111' }}>
                                  <Text style={{ color:'#EDEDED' }}>{uid}</Text>
                                  <TouchableOpacity onPress={async()=>{ try { const list = Array.isArray(sec.blacklist) ? sec.blacklist : []; const next = list.filter((x:string)=> x!==uid); await save(roomId, { security: { ...(settings?.security||{}), blacklist: next } }); } catch {} }} style={[styles.secondaryBtn, { borderColor:'#7A1F1F' }]}>
                                    <Text style={[styles.secondaryBtnText, { color:'#FF6B6B' }]}>해제</Text>
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* 데이터 도구 */}
                          <View style={{ height:1, backgroundColor:'#1E1E1E', marginVertical:8 }} />
                          <Text style={{ color:'#CFCFCF' }}>{t('dataTools', language)}</Text>
                          <View style={{ flexDirection:'row', gap:8 }}>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{
                              try {
                                const myUid = firebaseAuth.currentUser?.uid || 'me';
                                resetRoomForUserAct?.(roomId, myUid);
                                Alert.alert('완료','내 화면에서만 채팅방을 초기화했습니다.');
                              } catch {}
                            }}>
                              <Text style={styles.secondaryBtnText}>{t('resetRoom', language)}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{
                              try {
                                const st = (useKakaoRoomsStore as any).getState();
                                const type = st.getRoomById?.(roomId)?.type;
                                if (String(type)==='ttl') { Alert.alert('불가','TTL 방에서는 내보내기를 사용할 수 없습니다.'); return; }
                                const list = (st.messages?.[roomId] || []) as any[];
                                const profiles = profilesAll || {};
                                const lines = list.map((m:any)=>{
                                  const nm = (profiles[m.senderId]?.chatName || profiles[m.senderId]?.displayName || m.senderId);
                                  const ts = new Date(Number(m.createdAt||0)).toISOString();
                                  const body = String(m.content||'');
                                  const img = Array.isArray(m.albumUrls)&&m.albumUrls.length?` [album:${m.albumUrls.length}]`:(m.imageUrl?` [img:${m.imageUrl}]`:'');
                                  return `[${ts}] ${nm}: ${body}${img}`;
                                }).join('\n');
                                const out = `Room: ${room?.title||roomId}\nExported: ${new Date().toISOString()}\n\n${lines}`;
                                if (typeof window !== 'undefined') {
                                  try {
                                    const blob = new Blob([out], { type:'text/plain;charset=utf-8' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url; a.download = `${(room?.title||'chat').replace(/[^\w\-]+/g,'_')}-${roomId}.txt`;
                                    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url), 500);
                                    Alert.alert('완료','대화 내용을 파일로 저장했습니다.');
                                  } catch {
                                    try { await (navigator as any)?.clipboard?.writeText(out); Alert.alert('완료','대화 내용을 클립보드에 복사했습니다.'); } catch {}
                                  }
                                } else {
                                  try { await (navigator as any)?.clipboard?.writeText(out); Alert.alert('완료','대화 내용을 클립보드에 복사했습니다.'); } catch {}
                                }
                              } catch { Alert.alert('오류','내보내기에 실패했습니다.'); }
                            }}>
                              <Text style={styles.secondaryBtnText}>{t('exportChat', language)}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}
                {tab === 'notifications' && (
                  <View style={{ gap: 14 }}>
                    <Text style={styles.fieldLabel}>{t('notificationsTab', language)}</Text>
                    {(() => {
                      const cur = settings?.notifications || {} as any;
                      const Row = ({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) => (
                        <TouchableOpacity onPress={onPress} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#151515' }}>
                          <Text style={{ color:'#EDEDED' }}>{label}</Text>
                          <View style={{ width:44, height:26, borderRadius:13, backgroundColor: value ? 'rgba(212,175,55,0.25)' : '#111', borderWidth:1, borderColor: value ? '#D4AF37' : '#2A2A2A', alignItems:'center', justifyContent:'center' }}>
                            <Text style={{ color: value ? '#D4AF37' : '#777', fontWeight:'700' }}>{value ? 'ON' : 'OFF'}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                      return (
                        <>
                          <Row label={t('messageNotifications', language)} value={!!cur.messages} onPress={async()=>{ try { await save(roomId, { notifications: { ...(settings?.notifications||{}), messages: !cur.messages } }); } catch {} }} />
                          <Row label={t('mentionsOnly', language)} value={!!cur.mentionsOnly} onPress={async()=>{ try { await save(roomId, { notifications: { ...(settings?.notifications||{}), mentionsOnly: !cur.mentionsOnly } }); } catch {} }} />
                          <Row label={t('joinLeaveAlerts', language)} value={!!cur.joinAlerts} onPress={async()=>{ try { await save(roomId, { notifications: { ...(settings?.notifications||{}), joinAlerts: !cur.joinAlerts } }); } catch {} }} />
                          <View style={{ paddingVertical:10 }}>
                            <Text style={{ color:'#CFCFCF', marginBottom:8 }}>{t('sound', language)}</Text>
                            <View style={{ flexDirection:'row', gap:8 }}>
                              {(['off','vibrate','sound'] as const).map((opt)=>{
                                const active = cur.sound === opt;
                                return (
                                  <TouchableOpacity key={opt} onPress={async()=>{ try { await save(roomId, { notifications: { ...(settings?.notifications||{}), sound: opt } }); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: active ? '#FFD700' : '#2A2A2A', backgroundColor:'#141414' }}>
                                    <Text style={{ color: active ? '#FFD700' : '#DDD', fontWeight: active ? '800' : '600' }}>{opt==='off'?t('off', language):opt==='vibrate'?t('vibrate', language):t('sound', language)}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                )}
                {tab === 'theme' && (
                  <View style={{ gap: 14 }}>
                    {(() => {
                      const cur = settings?.theme || {} as any;
                      return (
                        <>
                    <Text style={styles.fieldLabel}>{t('mode', language)}</Text>
                          <View style={{ flexDirection:'row', gap:8 }}>
                            {(['dark','light','system'] as const).map((opt)=>{
                              const active = cur.mode === opt;
                              return (
                                <TouchableOpacity key={opt} onPress={async()=>{
                                  try {
                                    if (opt === 'system') {
                                      await save(roomId, { theme: { mode: 'system', fontScale: 1, bubbleColor: undefined, backgroundType: 'default', backgroundColor: undefined, backgroundImageUrl: undefined } });
                                    } else {
                                      await save(roomId, { theme: { ...(settings?.theme||{}), mode: opt } });
                                    }
                                  } catch {}
                                }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: active ? '#FFD700' : '#2A2A2A', backgroundColor:'#141414' }}>
                                  <Text style={{ color: active ? '#FFD700' : '#DDD', fontWeight: active ? '800' : '600' }}>{opt==='dark'?t('dark', language):opt==='light'?t('light', language):t('system', language)}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <View style={{ height:1, backgroundColor:'#1E1E1E', marginVertical:8 }} />
                    <Text style={styles.fieldLabel}>{t('fontSize', language)}</Text>
                          <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{ try { const next = Math.max(0.8, Number(cur.fontScale||1) - 0.1); await save(roomId, { theme: { ...(settings?.theme||{}), fontScale: parseFloat(next.toFixed(1)) } }); } catch {} }}><Text style={styles.secondaryBtnText}>－</Text></TouchableOpacity>
                            <Text style={{ color:'#EDEDED', minWidth:48, textAlign:'center' }}>{(cur.fontScale||1).toFixed(1)}x</Text>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{ try { const next = Math.min(1.4, Number(cur.fontScale||1) + 0.1); await save(roomId, { theme: { ...(settings?.theme||{}), fontScale: parseFloat(next.toFixed(1)) } }); } catch {} }}><Text style={styles.secondaryBtnText}>＋</Text></TouchableOpacity>
                          </View>
                          <View style={{ height:1, backgroundColor:'#1E1E1E', marginVertical:8 }} />
                    <Text style={styles.fieldLabel}>{t('bubbleColor', language)}</Text>
                          <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
                            {(['#D4AF37','#6C5CE7','#00C2A0','#FF6B6B','#FFFFFF'] as const).map((color)=>{
                              const active = cur.bubbleColor === color;
                              return (
                                <TouchableOpacity key={color} onPress={async()=>{ try { await save(roomId, { theme: { ...(settings?.theme||{}), bubbleColor: color } }); } catch {} }} style={{ width:28, height:28, borderRadius:14, borderWidth:2, borderColor: active ? '#FFD700' : '#2A2A2A', backgroundColor: color }} />
                              );
                            })}
                            <TouchableOpacity onPress={async()=>{ try { await save(roomId, { theme: { ...(settings?.theme||{}), bubbleColor: undefined } }); } catch {} }} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#141414' }}>
                              <Text style={{ color:'#DDD' }}>{t('defaultLabel', language)}</Text>
                            </TouchableOpacity>
                          </View>
                          <View style={{ height:1, backgroundColor:'#1E1E1E', marginVertical:8 }} />
                    <Text style={styles.fieldLabel}>{t('background', language)}</Text>
                          {/* 배경 색상 선택 (모드별 팔레트) */}
                          <View style={{ flexDirection:'row', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                            {((() => {
                              const isLight = String(cur.mode||'dark') === 'light';
                              // 더 다양한 팔레트: 다크(여러 계열의 딥 톤), 라이트(파스텔/저채도 톤)
                              const darkPalette = [
                                '#0B0D10', // obsidian
                                '#0E1320', // navy night
                                '#111827', // slate blue
                                '#0F1A14', // deep green
                                '#0E1A1A', // deep teal
                                '#17121F', // eggplant
                                '#1A1423', // plum night
                                '#1A0F11', // crimson night
                                '#1C1917', // warm gray
                                '#1F2329', // graphite
                                '#202124', // neutral dark
                                '#242A2E', // blue-gray
                                '#132018', // forest deep
                                '#1A1E13', // olive deep
                              ];
                              const lightPalette = [
                                '#FFFFFF', // pure
                                '#F7FAFF', // powder blue
                                '#F0F6FF', // baby blue
                                '#ECF8FE', // sky mist
                                '#F2FFF8', // mint white
                                '#F6FFF2', // green tint
                                '#FFF8F2', // peach tint
                                '#FFF0F5', // pink-lavender
                                '#F9F5FF', // light lavender
                                '#FFFBE6', // lemon cream
                                '#FFF7E9', // apricot cream
                                '#F3F4F6', // light gray
                                '#F7F7FF', // periwinkle
                                '#F8FFF6', // mint pastel
                              ];
                              return isLight ? lightPalette : darkPalette;
                            })() as string[]).map((color:string)=>{
                              const active = cur.backgroundColor === color && cur.backgroundType==='custom-color';
                              return (
                                <TouchableOpacity key={color} onPress={async()=>{ try { await save(roomId, { theme: { ...(settings?.theme||{}), backgroundType: 'custom-color', backgroundColor: color } }); } catch {} }} style={{ width:26, height:26, borderRadius:6, borderWidth:2, borderColor: active ? '#FFD700' : '#2A2A2A', backgroundColor: color }} />
                              );
                            })}
                          </View>
                          {/* 사용자 지정: 색상 입력/배경 이미지 등록 */}
                          <View style={{ flexDirection:'row', gap:8, marginBottom:6 }}>
                            <TouchableOpacity onPress={()=> setBgCustomOpen(v=>!v)} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#D4AF37', backgroundColor: bgCustomOpen ? 'rgba(212,175,55,0.18)' : '#141414' }}>
                              <Text style={{ color: '#FFD700', fontWeight:'800' }}>{t('custom', language)}</Text>
                            </TouchableOpacity>
                          </View>
                          {bgCustomOpen && (
                            <View style={{ gap:10 }}>
                              <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
                                { (bgImageDraft || cur.backgroundImageUrl) ? (
                                  <EImage source={{ uri: String(bgImageDraft || cur.backgroundImageUrl) }} style={{ width:64, height:40, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }} contentFit="cover" />
                                ) : (
                                  <View style={{ width:64, height:40, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#0E0E0E' }} />
                                )}
                                <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{
                                  try {
                                    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85 });
                                    if (res.canceled || !res.assets?.length) return;
                                    const pickedUri = res.assets[0].uri;
                                    setBgImageDraft(pickedUri);
                                    // 업로드: Firebase Storage에 올린 후 다운로드 URL 저장
                                    try {
                                      try { await ensureAppCheckReady(); } catch {}
                                      if (!firebaseAuth.currentUser) { try { await signInAnonymously(firebaseAuth); } catch {} }
                                      const uid = firebaseAuth.currentUser?.uid || 'me';
                                      const path = `rooms/${roomId || uid}/theme/${Date.now()}-bg`;
                                      const r = storageRef(firebaseStorage, path);
                                      if (pickedUri.startsWith('data:')) {
                                        await uploadString(r, pickedUri, 'data_url' as any);
                                      } else {
                                        const resp = await fetch(pickedUri);
                                        const buf = await resp.arrayBuffer();
                                        await uploadBytes(r, new Uint8Array(buf) as any);
                                      }
                                      const dl = await getDownloadURL(r);
                                      await save(roomId, { theme: { ...(settings?.theme||{}), backgroundImageUrl: dl, backgroundType: 'custom' } });
                                    } catch {
                                      // 업로드 실패 시 로컬 URI라도 적용(개발 폴백)
                                      await save(roomId, { theme: { ...(settings?.theme||{}), backgroundImageUrl: pickedUri, backgroundType: 'custom' } });
                                    }
                                  } catch {}
                                }}>
                                  <Text style={styles.secondaryBtnText}>{t('register', language)}</Text>
                                </TouchableOpacity>
                              </View>
                              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                                <TextInput value={bgHexDraft} onChangeText={setBgHexDraft} placeholder="#RRGGBB" placeholderTextColor="#666" style={[styles.fieldInput,{ flex:1 }]} autoCapitalize="none" autoCorrect={false} />
                                {(() => { const v=String(bgHexDraft||'').trim(); const ok=/^#?[0-9a-fA-F]{6}$/.test(v); const hex= ok ? (v.startsWith('#')? v : `#${v}`) : ''; return (
                                  <View style={{ width:24, height:24, borderRadius:6, borderWidth:1, borderColor:'#2A2A2A', backgroundColor: hex || '#0E0E0E' }} />
                                ); })()}
                                <TouchableOpacity style={styles.secondaryBtn} onPress={async()=>{
                                  try {
                                    const v = String(bgHexDraft||'').trim();
                                    if (!/^#?[0-9a-fA-F]{6}$/.test(v)) { Alert.alert('형식 오류','HEX 색상(예: #1A1A1A)을 입력하세요.'); return; }
                                    const hex = v.startsWith('#') ? v : `#${v}`;
                                    await save(roomId, { theme: { ...(settings?.theme||{}), backgroundType: 'custom-color', backgroundColor: hex } });
                                  } catch {}
                                }}>
                                  <Text style={styles.secondaryBtnText}>{t('apply', language)}</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </>
                      );
                    })()}
                  </View>
                )}
            </ScrollView>
            {/* 고정 하단 버튼 영역: 스크롤과 분리된 하단 고정 영역 */}
            <View style={{ paddingHorizontal:12, paddingBottom:12, paddingTop:8 }}>
              {renderFooterActions()}
            </View>
              </View>
            </View>
        </Modal>
        {/* 초대 코드 모달 */}
        <Modal animationType="fade" transparent visible={inviteOpen} onRequestClose={() => setInviteOpen(false)}>
          <View style={styles.settingsOverlay} pointerEvents="auto">
            <View style={[styles.settingsSheet, { maxHeight: '100%', padding: 16 }] }>
              <View style={[styles.settingsHeader, { marginBottom: 10 }]}>
                <Text style={styles.settingsTitle}>초대 코드</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setInviteOpen(false)}><Text style={{ color: '#999' }}>{t('close', language)}</Text></TouchableOpacity>
              </View>
              <View style={{ alignItems:'center', gap: 12 }}>
                <Text style={{ color:'#EDEDED', fontSize: 16, fontWeight: '800' }}>{inviteData?.code || ''}</Text>
                {!!(qrSrc || inviteData?.qrUrl) && (
                  <View style={{ padding: 12 }}>
                    <View style={{ padding: 6, borderRadius: 16, borderWidth: 4, borderColor: '#9C27B0', backgroundColor: 'transparent' }}>
                      <View style={{ padding: 8, borderRadius: 12, borderWidth: 6, borderColor: '#0C0C0C', backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
                        {Platform.OS === 'web' ? (
                          <Image source={{ uri: String(qrSrc || inviteData?.qrUrl) }} style={{ width: 240, height: 240 }} resizeMode="contain" />
                        ) : (
                          <EImage source={{ uri: String(qrSrc || inviteData?.qrUrl) }} style={{ width: 240, height: 240 }} contentFit="contain" />
                        )}
                        {/* 센터 로고 오버레이 */}
                        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 70, height: 70, borderRadius: 14, backgroundColor: '#000000', borderWidth: 4, borderColor: '#9C27B0', alignItems: 'center', justifyContent: 'center' }}>
                            <Image source={require('@/assets/images/side_logo.png')} style={{ width: 48, height: 48 }} resizeMode="contain" />
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
                <View style={{ flexDirection:'row', gap: 10, marginTop: 8 }}>
                  {!!(qrSrc || inviteData?.qrUrl) && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={()=>{ try { const src = String(qrSrc || inviteData?.qrUrl || ''); if (!src) return; const deep = `yooy://invite?room=${roomId}&code=${inviteData?.code||''}`; const web = `https://yooyland.com/room/${roomId}`; const title = String(((useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.title) || '초대장'); /* 먼저 현재 초대 모달과 설정 모달 닫기 → 전달 모달이 맨 위로 */ setInviteOpen(false); try { setOpen(false); } catch {} setTimeout(()=>{ try { useForwardModalStore.getState().open({ kind:'invite', imageUrl: src, name: 'invite-qr', display: `${title}\n${web}`, deepLink: deep, webUrl: web, roomTitle: title }); } catch {} }, 10); } catch {} }}>
                      <Text style={styles.primaryBtnText}>QR 전송</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.secondaryBtn} onPress={async ()=>{ try { const deep = `yooy://invite?room=${roomId}&code=${inviteData?.code||''}`; try { const Clipboard = require('expo-clipboard'); await Clipboard.setStringAsync(deep); } catch { try { await (navigator as any)?.clipboard?.writeText?.(deep); } catch {} } Alert.alert('복사됨','초대 링크를 복사했습니다.'); } catch {} }}>
                    <Text style={styles.secondaryBtnText}>링크 복사</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
            </>
    );
  }, []);

          const themeForRoom = useKakaoRoomsStore((s)=> s.roomSettings[roomId]?.theme);
          const settingsForTop = useKakaoRoomsStore((s)=> s.roomSettings[roomId]);
          const explicitBgColor = themeForRoom?.backgroundColor && themeForRoom?.backgroundType==='custom-color' ? themeForRoom.backgroundColor : undefined;
          const containerStyle = [styles.container, explicitBgColor ? { backgroundColor: explicitBgColor } : (themeForRoom?.mode==='light' ? { backgroundColor:'#FAFAFA' } : null)] as any;
          const isLightHexTop = (hex?: string): boolean => {
            try {
              if (!hex) return false;
              const h = hex.replace('#','');
              const v = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
              const num = parseInt(v,16);
              const r=(num>>16)&255, g=(num>>8)&255, b=num&255;
              const srgb = [r,g,b].map(c=>{ const x=c/255; return x<=0.03928? x/12.92 : Math.pow((x+0.055)/1.055,2.4); });
              const L = 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
              return L > 0.5;
            } catch { return false; }
          };
          const isLightTop = themeForRoom?.mode==='light' || (themeForRoom?.backgroundType==='custom-color' && isLightHexTop(explicitBgColor));
          const uiTopColor = isLightTop ? '#111' : '#FFFFFF';
          const participantsNow = Array.isArray(room?.members) ? room!.members.length : 0;
          const limitRaw = Number(((settingsForTop as any)?.basic?.participantLimit ?? 0));
          const participantsText = limitRaw > 0 ? `${participantsNow}/${limitRaw}` : String(participantsNow);
          return (
      <ThemedView style={containerStyle}>
        {themeForRoom?.backgroundType==='custom' && !!themeForRoom?.backgroundImageUrl ? (
          <EImage source={{ uri: String(themeForRoom.backgroundImageUrl) }} style={{ position:'absolute', left:0, right:0, top:0, bottom:0, opacity: 0.12 }} contentFit="cover" pointerEvents="none" />
        ) : null}
        <View style={[styles.roomTitleBar, { paddingTop: Math.max(insets.top, 0) }]}>
          <TouchableOpacity style={styles.roomLeaveBtn} onPress={() => router.push('/chat/rooms')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.roomLeaveText, { color: uiTopColor }]}>←</Text>
                </TouchableOpacity>
          <View style={{ flex: 1, flexDirection:'row', alignItems:'center', gap:8 }}>
            {(() => {
              const thumb = (useKakaoRoomsStore.getState().roomSettings?.[roomId]?.basic as any)?.thumbnailUrl;
              const src = String(room?.avatarUrl || thumb || '');
              if (!src) return (<View style={{ width:22, height:22, borderRadius:11, backgroundColor:'#2A2A2A' }} />);
              return (<EImage source={{ uri: src }} style={{ width:22, height:22, borderRadius:11, borderWidth:1, borderColor:'#1F1F1F' }} contentFit="cover" />);
            })()}
            <Text style={[styles.roomTitleText, { color: uiTopColor }]} numberOfLines={1}>{room?.title || '대화방'}</Text>
            <Text style={{ marginLeft:6, color: isLightTop ? '#333' : '#CFCFCF', fontSize:12, fontWeight:'700' }} numberOfLines={1}>{participantsText}</Text>
          </View>
        <RoomSettingsButton roomId={roomId} />
                            </View>

        {multiDeleteOn && (
          <View style={{ height: 40, backgroundColor:'#101010', borderBottomWidth:1, borderBottomColor:'#2A2A2A', flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12 }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
              {(() => {
                const total = (messagesForList || []).length;
                const allSelected = total > 0 && deleteSelection.size >= total;
                return (
                  <TouchableOpacity onPress={() => {
                    try {
                      const totalIds = new Set<string>((messagesForList || []).map((m:any)=> String(m.id)));
                      if (deleteSelection.size < totalIds.size) setDeleteSelection(totalIds);
                      else setDeleteSelection(new Set());
                    } catch {}
                  }}
                  hitSlop={{ top:6, bottom:6, left:6, right:6 }}
                  style={{ width:22, height:22, borderRadius:999, borderWidth:2, borderColor: allSelected ? '#FFD700' : '#9CA3AF', backgroundColor: allSelected ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)', alignItems:'center', justifyContent:'center' }}>
                    {allSelected ? <Text style={{ color:'#FFD700', fontSize:14, fontWeight:'900' }}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })()}
              <Text style={{ color:'#EDEDED', fontWeight:'700' }}>선택 {deleteSelection.size}개</Text>
            </View>
            <View style={{ flexDirection:'row', gap: 12 }}>
              <TouchableOpacity onPress={() => { try { Array.from(deleteSelection).forEach((id) => deleteMessage(roomId, id)); } catch {} setDeleteSelection(new Set()); setMultiDeleteMode(false); }}>
                <Text style={{ color:'#FF6B6B', fontWeight:'800' }}>삭제</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDeleteSelection(new Set()); setMultiDeleteMode(false); }}>
                <Text style={{ color:'#BBB' }}>{t('cancel', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TTL 카운트다운 - 독립 컴포넌트로 부모 리렌더 방지 */}
        {room?.type === 'ttl' && room?.expiresAt ? (
          <TTLHeader expiresAt={room.expiresAt as number} />
        ) : null}

        <View style={[styles.messagesWrap, { marginBottom: inputHeight + bottomGap }]} onLayout={(e)=> setWrapHeight(e.nativeEvent.layout.height)}>
          {(() => {
            const filtered = messagesForList;
            if (filtered.length === 0) {
              return (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#777' }}>{t('noMessages', language)}</Text>
            </View>
              );
            }
            return (
              <FlatList
                ref={listRef as any}
                data={filtered}
                keyExtractor={keyExtractorCb}
                renderItem={renderItemCb}
                extraData={{ md: multiDeleteMode, selSize: deleteSelection.size }}
                onContentSizeChange={() => {
                  if (!didInitRef.current) {
                    try { listRef.current?.scrollToEnd?.({ animated: false }); } catch {}
                    didInitRef.current = true;
                    atBottomRef.current = true;
                    lockAtBottomRef.current = true;
                    return;
                  }
                  if (lockAtBottomRef.current) {
                    try { listRef.current?.scrollToEnd?.({ animated: false }); } catch {}
                  }
                }}
                onScroll={(e:any)=>{
                  try {
                    const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent || {};
                    const remain = (contentSize?.height || 0) - ((contentOffset?.y || 0) + (layoutMeasurement?.height || 0));
                    const atBottom = remain < 24;
                    atBottomRef.current = atBottom;
                    lockAtBottomRef.current = atBottom;
                  } catch {}
                }}
                contentContainerStyle={[styles.messagesContent, { paddingBottom: 8 }]}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={false}
                 initialNumToRender={20}
                 windowSize={7}
              />
          );
        })()}
        </View>
        {/* TTL 워터마크(옵션) */}
        {(() => { 
          const isTtl = String((useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type) === 'ttl';
          const wmOn = !!((useKakaoRoomsStore as any).getState().roomSettings?.[roomId]?.ttl?.screenshotWatermark);
          if (!isTtl || !wmOn) return null;
          const lines = Array.from({ length: 8 }).map((_,i)=> i);
          return (
            <View pointerEvents="none" style={{ position:'absolute', left:0, right:0, top:0, bottom: inputHeight + bottomGap, justifyContent:'space-around', alignItems:'center', opacity:0.12 }}>
              {lines.map(i=>(
                <Text key={`wm-${i}`} style={{ color:'#FFD700', fontWeight:'900', transform:[{ rotate:'-20deg' }], fontSize: 22 }}>
                  YOY TTL ROOM • SCREENSHOT PROTECTED
                </Text>
              ))}
            </View>
          );
        })()}

      {/* 플러스 패널 (안드/웹) */}
      {plusOpen && (()=>{ const perms = (useKakaoRoomsStore as any).getState().roomSettings?.[roomId]?.permissions || {}; const canUpload = perms.canUploadFiles !== false; const canPoll = perms.canCreatePolls !== false; return (
        <View style={[styles.plusPanel, { bottom: inputHeight + bottomGap + 12, flexDirection: 'column' }]}> 
          <TouchableOpacity style={[styles.plusItem, { width: 100, opacity: canUpload?1:0.4 }]} onPress={() => { if (!canUpload) { Alert.alert('제한','파일 업로드가 제한된 방입니다.'); return; } handlePickImageWebSafe(); }}><Text style={styles.plusText}>{t('photo', language)}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.plusItem, { width: 100, opacity: canUpload?1:0.4 }]} onPress={() => { if (!canUpload) { Alert.alert('제한','파일 업로드가 제한된 방입니다.'); return; } handlePickVideo(); }}><Text style={styles.plusText}>{t('video', language)}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.plusItem, { width: 100, opacity: canUpload?1:0.4 }]} onPress={() => { if (!canUpload) { Alert.alert('제한','파일 업로드가 제한된 방입니다.'); return; } handlePickFile(); }}><Text style={styles.plusText}>{t('file', language)}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.plusItem, { width: 100 }]} onPress={shareLocation}><Text style={styles.plusText}>{t('location', language)}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.plusItem, { width: 100 }]} onPress={pickQrAndScan}><Text style={styles.plusText}>{t('sendQr', language)}</Text></TouchableOpacity>
          {/** 사용자 요청에 따라 '카메라 스캔' 옵션 제거 */}
          {canPoll ? (
            <TouchableOpacity style={[styles.plusItem, { width: 100 }]} onPress={createPoll}><Text style={styles.plusText}>{t('vote', language)}</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.plusItem, { width: 100, opacity: 0.4 }]} onPress={() => Alert.alert('제한','투표 생성이 제한된 방입니다.') }><Text style={styles.plusText}>{t('vote', language)}</Text></TouchableOpacity>
          )}
        </View>
      ); })()}

      {/* QR 미리보기 모달 */}
      {qrPreview?.visible ? (
        <Modal animationType="fade" transparent visible onRequestClose={cancelQrPreview}>
          <View style={styles.settingsOverlay} pointerEvents="auto">
            <View style={[styles.settingsSheet, { width: 360, maxWidth: '92%' }]}> 
              <View style={[styles.settingsHeader, { justifyContent:'space-between' }]}> 
                <Text style={styles.settingsTitle}>QR 미리보기</Text>
                <TouchableOpacity onPress={cancelQrPreview}><Text style={{ color:'#FFD700', fontWeight:'700' }}>닫기</Text></TouchableOpacity>
              </View>
              <View style={{ padding: 12, gap: 12 }}>
                {qrPreview.imageUrl ? (
                  <EImage source={{ uri: qrPreview.imageUrl }} style={{ width: '100%', height: 280, borderRadius: 10, borderWidth:1, borderColor:'#2A2A2A' }} contentFit="contain" />
                ) : null}
                {(() => {
                  if (!qrPreview) return null;
                  if (qrPreview.kind === 'card') {
                    const d = qrPreview.data || {};
                    return (
                      <View style={{ padding: 10, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, backgroundColor:'#121212' }}>
                        <Text style={{ color:'#EDEDED', fontSize:15, fontWeight:'700' }}>{d.name || '명함'}</Text>
                        <Text style={{ color:'#CFCFCF', marginTop: 6 }}>{[d.company, d.title].filter(Boolean).join(' · ')}</Text>
                        {d.phone ? <Text style={{ color:'#CFCFCF', marginTop: 4 }}>☎ {require('@/lib/phone').formatPhoneForLocale(d.phone, require('@/contexts/PreferencesContext').usePreferences().language)}</Text> : null}
                        {d.email ? <Text style={{ color:'#CFCFCF', marginTop: 2 }}>✉ {d.email}</Text> : null}
                        {d.memo ? <Text style={{ color:'#AFAFAF', marginTop: 6 }}>{d.memo}</Text> : null}
                      </View>
                    );
                  }
                  if (qrPreview.kind === 'pay') {
                    const d = qrPreview.data || {};
                    return (
                      <View style={{ padding: 10, borderWidth:1, borderColor:'#FFD700', borderRadius:8, backgroundColor:'#121212' }}>
                        <Text style={{ color:'#FFD700', fontSize:14, fontWeight:'700' }}>받기 요청</Text>
                        <Text style={{ color:'#EDEDED', marginTop: 6 }}>코인: {d.sym || '-'}</Text>
                        <Text style={{ color:'#EDEDED', marginTop: 2 }}>수량: {d.amt || '-'}</Text>
                        <Text style={{ color:'#CFCFCF', marginTop: 6 }} numberOfLines={1} ellipsizeMode="middle">주소: {d.addr || '-'}</Text>
                        <View style={{ flexDirection:'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity
                            style={[styles.plusItem, { paddingHorizontal: 12, borderColor:'#FFD700' }]}
                            onPress={async ()=>{
                              try {
                                const txt = String(d.addr||'');
                                if (!txt) return;
                                try { const Clipboard = require('expo-clipboard'); await Clipboard.setStringAsync(txt); }
                                catch { try { await (navigator as any)?.clipboard?.writeText?.(txt); } catch {}
                                }
                                Alert.alert('복사됨', '지갑 주소가 복사되었습니다.');
                              } catch {}
                            }}
                          >
                            <Text style={{ color:'#FFD700', fontWeight:'700' }}>주소 복사</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.plusItem, { paddingHorizontal: 12 }]}
                            onPress={()=>{
                              try {
                                router.push({ pathname: '/(tabs)/wallet', params: { tab: 'send', addr: String(d.addr||''), sym: String(d.sym||''), amt: String(d.amt||'') } as any });
                              } catch {}
                            }}
                          >
                            <Text style={{ color:'#EDEDED' }}>보내기 열기</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }
                  if (qrPreview.kind === 'invite') {
                    const d = qrPreview.data || {};
                    return (
                      <View style={{ padding: 10, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, backgroundColor:'#121212' }}>
                        <Text style={{ color:'#EDEDED' }}>방 초대</Text>
                        <Text style={{ color:'#CFCFCF', marginTop: 4 }}>Room ID: {d.roomId || ''}</Text>
                      </View>
                    );
                  }
                  return qrPreview.text ? (
                    <View style={{ padding: 10, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, backgroundColor:'#121212' }}>
                      <Text style={{ color:'#EDEDED', fontSize:13 }}>{qrPreview.text}</Text>
                    </View>
                  ) : null;
                })()}
                <View style={{ flexDirection:'row', gap: 8, justifyContent:'flex-end' }}>
                  <TouchableOpacity onPress={cancelQrPreview} style={[styles.plusItem, { paddingHorizontal: 14 }]}>
                    <Text style={{ color:'#EDEDED' }}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmSendQrPreview} style={[styles.plusItem, { paddingHorizontal: 14, borderColor:'#FFD700' }]}>
                    <Text style={{ color:'#FFD700', fontWeight:'700' }}>보내기</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* 스와이프 퀵 메뉴 오버레이 */}
      {quickMenu ? (
        <View pointerEvents="box-none" style={{ position:'absolute', left:0, right:0, bottom: inputHeight + 56, alignItems:'center', zIndex: 40 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => { setQuickMenu(null); setReactionPickerOpen(false); }} style={{ position:'absolute', left:0, right:0, top:-1000, bottom:1000 }} />
          <View style={{ flexDirection:'row', gap:10, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:24, paddingHorizontal:12, paddingVertical:8 }}>
            <TouchableOpacity onPress={() => setReactionPickerOpen(v=>!v)}><Text style={{ color:'#FFD700', fontWeight:'800' }}>👍 공감</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { try { const tgt = (messages || []).find((m:any)=>m.id===quickMenu.id); const prev = tgt?.content || (tgt?.imageUrl ? '[이미지]' : ''); setReplyTo({ id: quickMenu.id, preview: String(prev).slice(0,60) }); } catch {} setQuickMenu(null); setReactionPickerOpen(false); }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>↩ 답장</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { try {
              const tgt = (messages || []).find((m:any)=>m.id===quickMenu.id);
              const fileUrl = (quickMenu.fileUrl || '') as string;
              const linkUrl = (quickMenu.linkUrl || '') as string;
              const mapUrl = (quickMenu.mapUrl || '') as string;
              const display = String(quickMenu.display||'');
              const isImage = !!tgt?.imageUrl || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)(\?|$)/i.test(fileUrl);
              const entry = isImage ? { uri: String(tgt?.imageUrl || fileUrl), type: 'image' as const, name: (display.slice(0,40)||'image') }
                : (fileUrl ? { uri: String(fileUrl), type: 'file' as const, name: (display.slice(0,40)||'file') }
                : (linkUrl ? { uri: String(linkUrl), type: 'link' as const, name: (display.slice(0,40)||'link') }
                : (mapUrl ? { uri: String(mapUrl), type: 'link' as const, name: 'map' } : { uri: display, type: 'text' as const, name: 'text' })));
              addToTreasureBox(entry as any);
            } catch {} setQuickMenu(null); setReactionPickerOpen(false); }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>📦 보관</Text></TouchableOpacity>
          </View>
          {reactionPickerOpen ? (
            <View style={{ marginTop:8, flexDirection:'row', gap:8, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:20, paddingHorizontal:10, paddingVertical:6 }}>
              {['👍','❤️','😂','😮','😢','😡'].map((emo)=> (
                <TouchableOpacity key={emo} onPress={() => { try { toggleReaction(roomId, quickMenu.id, emo, (firebaseAuth.currentUser?.uid || 'me')); } catch {} setQuickMenu(null); setReactionPickerOpen(false); }}>
                  <Text style={{ fontSize:18 }}>{emo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {/* 하단 입력창 */}
        <View style={[styles.inputContainer, { bottom: bottomGap, paddingBottom: 8 }]} onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}>
          <View style={styles.inputInner}>
          {returnTo && (
            <View style={{ position:'absolute', left: 12, right: 12, bottom: 80, backgroundColor: '#111', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity onPress={() => {
                try {
                  const idx = (messages || []).findIndex((m:any) => m.id === returnTo.id);
                  if (idx >= 0) listRef.current?.scrollToIndex?.({ index: idx, animated: true });
                } catch {}
                setReturnTo(null);
              }}>
                <Text style={{ color:'#D4AF37', fontSize: 12, fontWeight: '700' }}>↩ 원본으로 돌아가기</Text>
                </TouchableOpacity>
              <TouchableOpacity onPress={() => setReturnTo(null)} style={{ position:'absolute', right: 8 }}>
                <Text style={{ color:'#999', fontSize: 12 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            {replyTo && (
            <View style={{ position:'absolute', left: 12, right: 12, bottom: 44, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color:'#D4AF37', fontSize: 10 }}>답장 대상</Text>
              <Text style={{ color:'#EEE', flex: 1, fontSize: 12 }} numberOfLines={1}>{replyTo.preview}</Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                <Text style={{ color:'#999', fontSize: 12 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          <TouchableOpacity style={styles.addButton} onPress={onPlusPress}>
              <Text style={styles.addButtonText}>＋</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.inputField}
              onFocus={()=>{ inputFocusedRef.current = true; /* 포커스만으로 스크롤하지 않음 */ }}
              onBlur={()=>{ inputFocusedRef.current = false; }}
              value={text}
            onChangeText={(v)=>{ setText(v); /* 타이핑 중 자동 스크롤 금지 */ }}
              placeholder={t('messageInputPlaceholder', language)}
              placeholderTextColor="#666"
              onSubmitEditing={handleSend}
              blurOnSubmit
              returnKeyType="send"
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendButton} disabled={!text.trim()}>
            <IconSymbol size={20} name="paperplane.fill" color={text.trim() ? '#FFD700' : '#666666'} style={{ transform: [{ rotate: '-45deg' }] }} />
            </TouchableOpacity>
          </View>
        </View>
      {/* 길게누르기 팝업 (메뉴) - TTL 방에서도 자동 닫힘 없음 */}
      <Modal transparent animationType="fade" visible={!!menuFor} onRequestClose={() => setMenuFor(null)}>
        <View style={[styles.contextMenuOverlay, { alignItems:'center', justifyContent:'flex-start', paddingTop: 100 }]} pointerEvents="auto">
          <TouchableOpacity style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }} onPress={() => setMenuFor(null)} />
          <View style={[styles.contextMenu, { backgroundColor:'#FFFFFF', borderColor:'#E5E5E5', width: 240, borderRadius:16 }] }>
            {/* 빠른 공감 바 - 상단에 이모지 표시 */}
            <View style={{ flexDirection:'row', justifyContent:'space-between', paddingHorizontal:12, paddingTop:8, paddingBottom:6, borderBottomWidth:1, borderBottomColor:'#EEE' }}>
              {['👍','❤️','✅','😮','😡','😢'].map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => { try { if (menuFor) toggleReaction(roomId, menuFor.item.id, emoji, (firebaseAuth.currentUser?.uid || 'me')); } catch {} setMenuFor(null); }}>
                  <Text style={{ fontSize: 18 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(() => { const text = String(menuFor?.display||''); const linkMatch = text.match(/https?:\/\/[^\s]+/i); const linkOnly = linkMatch ? linkMatch[0] : null; const qrOrUrlMatch = text.match(/(yooy:\/\/[^\s"']+|https?:\/\/[^\s]+)/i); const urlForCopy = qrOrUrlMatch ? qrOrUrlMatch[0] : (text.trim() || ''); const hasFile = !!menuFor?.fileUrl; const fileUrlStr = String(menuFor?.fileUrl || ''); const isImageMsg = !!(menuFor?.imageUrl || menuFor?.item?.imageUrl) || /^data:image\//i.test(fileUrlStr) || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)(\?|#|$)/i.test(fileUrlStr); return (
            <>
            {isImageMsg ? (
              <>
                {!!urlForCopy && String(type)!=='ttl' && (
                  <TouchableOpacity style={styles.contextMenuItem} onPress={async () => {
                    try {
                      try { const Clipboard = require('expo-clipboard'); await Clipboard.setStringAsync(urlForCopy); }
                      catch { try { await (navigator as any)?.clipboard?.writeText?.(urlForCopy); } catch { try { const ta = document.createElement('textarea'); ta.value = urlForCopy; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch {} } }
                    } finally { setMenuFor(null); }
                  }}>
                    <Text style={[styles.contextMenuText, { fontSize: 13, fontWeight:'700' }]}>Url 복사</Text>
                  </TouchableOpacity>
                )}
                {String(type)!=='ttl' && (
                  <TouchableOpacity style={styles.contextMenuItem} onPress={async () => { try { const src = String(menuFor?.imageUrl || menuFor?.fileUrl || ''); await copyImageToClipboardWeb(src); } catch {} setMenuFor(null); }}>
                    <Text style={[styles.contextMenuText, { fontSize: 13 }]}>이미지 복사</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                {String(type)!=='ttl' && (<TouchableOpacity style={styles.contextMenuItem} onPress={async () => {
                  try {
                    try { const Clipboard = require('expo-clipboard'); await Clipboard.setStringAsync(linkOnly || text); } catch { try { await (navigator as any)?.clipboard?.writeText?.(linkOnly || text); } catch { try { const ta = document.createElement('textarea'); ta.value = linkOnly || text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch {} } }
                  } finally { setMenuFor(null); }
                }}>
                  <Text style={[styles.contextMenuText, { fontSize: 13 }]}>복사</Text>
                </TouchableOpacity>)}
                {(() => { const isTtl = String((useKakaoRoomsStore as any).getState().getRoomById?.(roomId)?.type) === 'ttl'; const ttl = (useKakaoRoomsStore as any).getState().roomSettings?.[roomId]?.ttl || {}; const ok = isTtl ? !!ttl.allowCopy : true; return ok; })() && (
                  <TouchableOpacity style={styles.contextMenuItem} onPress={() => { Alert.alert('안내','텍스트를 길게 눌러 범위를 선택 후 복사하세요.'); setMenuFor(null); }}>
                    <Text style={[styles.contextMenuText, { fontSize: 13 }]}>선택복사</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity style={styles.contextMenuItem} onPress={() => { if (menuFor) setReplyTo({ id: menuFor.item.id, preview: String(menuFor.display || '').slice(0,60) }); setMenuFor(null); }}>
              <Text style={[styles.contextMenuText, { fontSize: 13 }]}>답장</Text>
            </TouchableOpacity>
            {/* 전달 */}
            <TouchableOpacity style={styles.contextMenuItem} onPress={() => {
              if (!menuFor) return;
              try {
                useForwardModalStore.getState().open({ fileUrl: menuFor.fileUrl || undefined, imageUrl: menuFor.imageUrl || undefined, name: menuFor.imageUrl ? 'image' : 'file', display: menuFor.display });
              } catch {}
              setMenuFor(null);
            }}>
              <Text style={[styles.contextMenuText, { fontSize: 13 }]}>전달</Text>
            </TouchableOpacity>
            {(() => { try { const roles = (useKakaoRoomsStore as any).getState().roomSettings?.[roomId]?.members?.roles || {}; const me = firebaseAuth.currentUser?.uid || 'me'; const myRole = roles[me]; const canModerate = myRole==='admin' || myRole==='moderator'; const canDeleteAny = !!((useKakaoRoomsStore as any).getState().roomSettings?.[roomId]?.permissions?.canDeleteOrPin); const isMe = String(menuFor?.item?.senderId||'') === String(me); if (!(canModerate || canDeleteAny || isMe)) return null; return (
              <TouchableOpacity style={styles.contextMenuItem} onPress={() => { setDeleteOpen(true); setMenuFor(null); }}>
                <Text style={[styles.contextMenuText, { color:'#D0021B', fontSize: 13 }]}>삭제 ▸</Text>
              </TouchableOpacity>
            ); } catch { return null; } })()}
            <TouchableOpacity style={styles.contextMenuItem} onPress={() => { try { const g:any=(globalThis as any); g.__multiDelete=g.__multiDelete||{}; g.__multiDelete[roomId]=true; } catch {} setMultiDeleteMode(true); if (menuFor?.item?.id) setDeleteSelection(new Set([menuFor.item.id])); setMenuFor(null); }}>
              <Text style={[styles.contextMenuText, { fontSize: 13 }]}>여러개 삭제</Text>
            </TouchableOpacity>
            {!!menuFor?.mapUrl && (
                <TouchableOpacity style={[styles.contextMenuItem]} onPress={() => { try { openImageViewer(menuFor?.item as any, undefined, undefined, String(menuFor?.mapUrl), 'map'); } catch { try { setImageViewer({ url: String(menuFor?.mapUrl), senderId: String(menuFor?.item?.senderId||''), createdAt: Number(menuFor?.item?.createdAt||Date.now()), messageId: String(menuFor?.item?.id||''), kind: 'map' } as any); } catch {} } setMenuFor(null); }}>
                <Text style={[styles.contextMenuText, { fontSize: 13 }]}>지도보기</Text>
              </TouchableOpacity>
            )}
            {/* 파일 전용: 열기/저장/보관 */}
            {hasFile && (
              <>
                <TouchableOpacity style={[styles.contextMenuItem]} onPress={() => { try { openImageViewer(menuFor?.item as any, undefined, undefined, String(menuFor?.fileUrl), 'web'); } catch { try { setImageViewer({ url: String(menuFor?.fileUrl), senderId: String(menuFor?.item?.senderId||''), createdAt: Number(menuFor?.item?.createdAt||Date.now()), messageId: String(menuFor?.item?.id||''), kind: 'web' } as any); } catch {} } setMenuFor(null); }}>
                  <Text style={[styles.contextMenuText, { fontSize: 13 }]}>열기</Text>
                </TouchableOpacity>
                {String(type)!=='ttl' && (
                  <TouchableOpacity style={[styles.contextMenuItem]} onPress={() => { saveFileToDevice(String(menuFor.fileUrl), 'file'); setMenuFor(null); }}>
                    <Text style={[styles.contextMenuText, { fontSize: 13 }]}>저장</Text>
                  </TouchableOpacity>
                )}
                {String(type)!=='ttl' && (<TouchableOpacity style={[styles.contextMenuItem]} onPress={async () => {
                  const url = String(menuFor.fileUrl);
                  // 파일명은 URL에서 추출(메시지 표시 텍스트가 'file' 같은 경우 방지)
                  const nm = (()=>{
                    const disp = String(menuFor?.display||'').trim();
                    if (disp && disp.toLowerCase() !== 'file' && !/^https?:\/\//i.test(disp)) return disp;
                    try { const u=new URL(url); return decodeURIComponent(u.pathname.split('/').pop()||'item'); } catch { return 'item'; }
                  })();
                  // hint를 주지 않고 정밀 감지(decideKind: 확장자/YouTube/Storage metadata)를 사용
                  await addToMediaGallery(url, undefined as any, nm);
                  setMenuFor(null);
                }}>
                  <Text style={[styles.contextMenuText, { fontSize: 13 }]}>보관</Text>
                </TouchableOpacity>)}
              </>
            )}
            {/* 이미지 전용: 보관 (복사 버튼은 상단으로 이동) */}
            {!hasFile && isImageMsg && String(type)!=='ttl' && (
              <TouchableOpacity style={[styles.contextMenuItem]} onPress={async () => { try { const src = String(menuFor?.imageUrl || menuFor?.fileUrl || ''); await addToMediaGallery(src, 'image'); } catch {} setMenuFor(null); }}>
                <Text style={[styles.contextMenuText, { fontSize: 13 }]}>보관</Text>
              </TouchableOpacity>
            )}
            {/* 링크 전용: 열기/보관 */}
            {!hasFile && linkOnly && (
              <>
                <TouchableOpacity style={[styles.contextMenuItem]} onPress={() => { try { Linking.openURL(linkOnly); } catch {} setMenuFor(null); }}>
                  <Text style={[styles.contextMenuText, { fontSize: 13 }]}>열기</Text>
                </TouchableOpacity>
                {String(type)!=='ttl' && (
                  <TouchableOpacity style={[styles.contextMenuItem]} onPress={async () => { try { const host = (()=>{ try { return new URL(linkOnly).host.toLowerCase(); } catch { return ''; } })(); const isYt = /(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host); await addToMediaGallery(linkOnly, isYt ? 'youtube' : 'link', String(menuFor?.display||'')); } catch {} setMenuFor(null); }}>
                    <Text style={[styles.contextMenuText, { fontSize: 13 }]}>보관</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            </>
            ); })()}
            {(() => {
              try {
                const me = firebaseAuth.currentUser?.uid || 'me';
                const roles = (useKakaoRoomsStore as any).getState().roomSettings?.[roomId]?.members?.roles || {};
                const role = roles[me];
                const canModerate = role === 'admin' || role === 'moderator';
                if (!canModerate) return null;
                return (
                  <>
                    <TouchableOpacity style={[styles.contextMenuItem]} onPress={() => { Alert.alert('가리기','이 메시지를 가립니다.'); }}>
                      <Text style={styles.contextMenuText}>가리기</Text>
              </TouchableOpacity>
                    <TouchableOpacity style={[styles.contextMenuItem]} onPress={() => { Alert.alert('내보내기','해당 사용자를 내보냅니다.'); }}>
                      <Text style={styles.contextMenuText}>내보내기</Text>
              </TouchableOpacity>
                  </>
                );
              } catch { return null; }
            })()}
            <TouchableOpacity style={[styles.contextMenuItem, { borderTopWidth: 1, borderTopColor: '#EEE' }]} onPress={() => setMenuFor(null)}>
              <Text style={[styles.contextMenuText, { color: '#777', fontSize: 13 }]}>{t('close', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 멤버 행 점(…) 메뉴 */}
      <Modal transparent animationType="fade" visible={!!memberMenu} onRequestClose={() => setMemberMenu(null)}>
        <View style={[styles.contextMenuOverlay, { alignItems:'center', justifyContent:'center' }] }>
          <TouchableOpacity style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }} onPress={() => setMemberMenu(null)} />
          <View style={[styles.contextMenu, { backgroundColor:'#FFFFFF', borderColor:'#E5E5E5', width: 260, borderRadius:16 }]}>
            {(() => {
              const me = firebaseAuth.currentUser?.uid || 'me';
              const roles = (roomSettingsForMenu?.members?.roles || {}) as Record<string,string>;
              const myRole = roles[me] || (room?.createdBy === me ? 'admin' : 'member');
              const canModerate = myRole === 'admin' || myRole === 'moderator';
              const isAdmin = myRole === 'admin';
              const target = memberMenu;
              if (!target) return null;
              return (
                <>
                  {isAdmin && target.uid !== me && (
                    <TouchableOpacity style={styles.contextMenuItem} onPress={async () => { try { await transferOwnership(roomId, target.uid); } catch {} setMemberMenu(null); }}>
                      <Text style={styles.contextMenuText}>방장 임명</Text>
                    </TouchableOpacity>
                  )}
                  {isAdmin && (
                    <TouchableOpacity style={styles.contextMenuItem} onPress={async () => { try { await setMemberRoleAct(roomId, target.uid, 'moderator'); } catch {} setMemberMenu(null); }}>
                      <Text style={styles.contextMenuText}>부방장 임명</Text>
                    </TouchableOpacity>
                  )}
                  {canModerate && (
                    <TouchableOpacity style={styles.contextMenuItem} onPress={async () => { try { await kickMemberAct(roomId, target.uid); } catch {} setMemberMenu(null); }}>
                      <Text style={[styles.contextMenuText, { color:'#D0021B' }]}>내보내기</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.contextMenuItem} onPress={async () => { try { await followAct(target.uid); Alert.alert('팔로우','팔로우 신청을 보냈습니다.'); } catch {} setMemberMenu(null); }}>
                    <Text style={styles.contextMenuText}>{t('addFriend', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.contextMenuItem} onPress={() => { try { router.push({ pathname:'/chat/friend-profile', params:{ id: target.uid } as any }); } catch {} setMemberMenu(null); }}>
                    <Text style={styles.contextMenuText}>프로필 보기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.contextMenuItem, { borderTopWidth:1, borderTopColor:'#EEE' }]} onPress={() => { try { const dm = createRoomAct(target.name || 'DM', [me, target.uid], 'dm'); router.push(`/chat/room/${dm.id}` as any); } catch {} setMemberMenu(null); }}>
                    <Text style={styles.contextMenuText}>메세지 보내기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.contextMenuItem, { borderTopWidth:1, borderTopColor:'#EEE' }]} onPress={() => setMemberMenu(null)}>
                    <Text style={[styles.contextMenuText, { color:'#777' }]}>{t('close', language)}</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* 공감 상세 팝업: 누가 어떤 공감을 선택했는지 표시 */}
      {reactionDetail ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setReactionDetail(null)}>
          <View style={styles.settingsOverlay} pointerEvents="auto">
            <View style={[styles.settingsSheet, { width: 360, maxWidth: '92%' }]}> 
              <View style={[styles.settingsHeader, { justifyContent:'space-between' }]}> 
                <Text style={styles.settingsTitle}>공감</Text>
                <TouchableOpacity onPress={() => setReactionDetail(null)}><Text style={{ color:'#999' }}>{t('close', language)}</Text></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
                {(reactionDetail.groups||[]).map((g)=> (
                  <View key={g.emoji} style={{ borderWidth:1, borderColor:'#2A2A2A', borderRadius:12, padding:10 }}>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
                      <Text style={{ fontSize:18 }}>{g.emoji}</Text>
                      <Text style={{ color:'#DDD', fontWeight:'700' }}>{g.users?.length||0}</Text>
                    </View>
                    <View style={{ gap:8 }}>
                      {(g.users||[]).map((u)=> (
                        <View key={u.uid} style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                          {u.avatar ? (
                            <EImage source={{ uri: u.avatar }} style={{ width: 22, height: 22, borderRadius: 11 }} contentFit="cover" />
                          ) : (
                            <View style={{ width:22, height:22, borderRadius:11, backgroundColor:'#333' }} />
                          )}
                          <Text style={{ color:'#EEE', fontSize:12 }}>{u.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* 전달 모달은 전역 포털(ForwardModal)에서 렌더링됨 */}

      {/* 공감 전용 바(페이스북 스타일) */}
      <Modal transparent animationType="fade" visible={!!reactionFor} onRequestClose={() => setReactionFor(null)}>
        <View style={[styles.contextMenuOverlay, { alignItems:'center', justifyContent:'flex-end', paddingBottom: 140 }]}>
          <TouchableOpacity style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }} onPress={() => setReactionFor(null)} />
          <View style={[styles.reactionBar, { borderColor:'#E5E5E5' }] }>
            {['👍','❤️','✅','😮','😡','😢'].map((emoji) => (
              <TouchableOpacity key={emoji} onPress={() => {
                try { if (reactionFor) toggleReaction(roomId, reactionFor, emoji, (firebaseAuth.currentUser?.uid || 'me')); } catch {}
                setReactionFor(null);
              }}>
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" transparent visible={!!fileViewer && Platform.OS !== 'web'} onRequestClose={() => setFileViewer(null)}>
        <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor:'rgba(0,0,0,0.9)', alignItems:'center', justifyContent:'center' }}>
          <TouchableOpacity onPress={() => setFileViewer(null)} style={{ position:'absolute', top: 18 + Math.max(insets.top,0), right: 18 }}>
            <Text style={{ color:'#FFF', fontSize:18, fontWeight:'800' }}>X</Text>
          </TouchableOpacity>
          {fileViewer && Platform.OS === 'web' ? (() => {
            try {
              const u = new URL(String(fileViewer.url||''));
              const ext = (u.pathname.split('.').pop() || '').toLowerCase();
              const isVideo = /^(mp4|mov|m4v|webm|mkv|avi)$/.test(ext) || /^data:video\//i.test(String(fileViewer.url||''));
              const isYouTube = /(^|\.)youtube\.com$/i.test(u.host) || /(^|\.)youtu\.be$/i.test(u.host);
              if (isVideo) {
                return (
                  <video src={String(fileViewer.url)} style={{ width: '92%', height: '82%', objectFit:'contain', background:'#000' }} controls playsInline preload="metadata" />
                );
              }
              if (isYouTube) {
                const id = (() => {
                  try {
                    if (/youtu\.be/i.test(u.host)) return u.pathname.replace(/^\//,'');
                    const v = u.searchParams.get('v');
                    return v || '';
                  } catch { return ''; }
                })();
                const embed = id ? `https://www.youtube.com/embed/${id}` : String(fileViewer.url);
                return (
                  <iframe title={fileViewer.name} src={embed} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen style={{ width: '92%', height: '82%', backgroundColor:'#111', border:'none' } as any} />
                );
              }
              return (
                <iframe title={fileViewer.name} src={fileViewer.url} style={{ width: '92%', height: '82%', backgroundColor:'#111', border:'none' } as any} />
              );
            } catch {
              return (
                <iframe title={fileViewer?.name||'file'} src={String(fileViewer?.url||'about:blank')} style={{ width: '92%', height: '82%', backgroundColor:'#111', border:'none' } as any} />
              );
            }
          })() : null}
          {/* Native viewer: image/video/pdf/web 미리보기 */}
          {fileViewer && Platform.OS !== 'web' ? (() => {
            try {
              const raw = String(fileViewer.url||'');
              // 간단 확장자/스킴 판별
              const lower = raw.toLowerCase();
              const isVideo = /^data:video\//.test(lower) || /\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/.test(lower);
              const isImage = /^data:image\//.test(lower) || /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)(\?|#|$)/.test(lower);
              const isPdf = /\.pdf(\?|#|$)/.test(lower) || /application\/pdf/i.test(lower);
              if (isVideo) {
                const { Video } = require('expo-av');
                return (<Video source={{ uri: raw }} style={{ width:'92%', height:'82%' }} useNativeControls resizeMode={'contain'} />);
              }
              if (isImage) {
                const { Image: EImage } = require('expo-image');
                return (<EImage source={{ uri: raw }} style={{ width:'92%', height:'82%' }} contentFit={'contain'} />);
              }
              if (isPdf) {
                const WebView = require('react-native-webview').default || require('react-native-webview');
                const direct = raw;
                const mozilla = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(direct)}#zoom=page-width`;
                return (<WebView source={{ uri: mozilla }} style={{ width:'92%', height:'82%', backgroundColor:'#111' }} />);
              }
              // 기타 파일: WebView로 시도(서버가 미리보기 가능 시 표시)
              const WebView = require('react-native-webview').default || require('react-native-webview');
              return (<WebView source={{ uri: raw }} style={{ width:'92%', height:'82%', backgroundColor:'#111' }} />);
            } catch {
              return null;
            }
          })() : null}
          {fileViewer && (
            <View style={{ position:'absolute', bottom: 22 + Math.max(insets.bottom,0), left:0, right:0, alignItems:'center' }}>
              <View style={{ flexDirection:'row', gap: 10, backgroundColor:'rgba(15,15,15,0.85)', paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1, borderColor:'#2A2A2A' }}>
                <TouchableOpacity onPress={() => { try { saveFileToDevice(fileViewer.url, fileViewer.name || 'file'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#FFD700' }}>
                  <Text style={{ color:'#FFD700', fontWeight:'800', fontSize:12 }}>저장</Text>
              </TouchableOpacity>
                <TouchableOpacity onPress={async () => { try { const rawUrl = String(fileViewer.url); await addToMediaGallery(rawUrl, undefined as any, fileViewer.name || 'file'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#FFD700' }}>
                  <Text style={{ color:'#FFD700', fontWeight:'800', fontSize:12 }}>보관</Text>
              </TouchableOpacity>
                <TouchableOpacity onPress={() => { try { if (fileViewer?.messageId) deleteMessage(roomId, fileViewer.messageId); } catch {} setFileViewer(null); }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#D0021B' }}>
                  <Text style={{ color:'#D0021B', fontWeight:'800', fontSize:12 }}>삭제</Text>
              </TouchableOpacity>
          </View>
        </View>
      )}
            </View>
      </Modal>
      {/* 지도 보기(웹): Google Maps 임베드 */}
      {/* 지도 보기도 이미지 뷰어 UI와 통일: 상단 정보바 + 하단 액션 */}
      <Modal animationType="fade" transparent visible={!!mapViewer && Platform.OS !== 'web'} onRequestClose={() => setMapViewer(null)}>
        <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor:'rgba(0,0,0,0.95)', zIndex: 90000 }}>
          <View style={{ height: 52, paddingHorizontal:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />
              <View>
                <Text style={{ color:'#FFF', fontWeight:'800', fontSize:14 }}>지도</Text>
                <Text style={{ color:'#BBB', fontSize:10 }}>maps.google.com</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setMapViewer(null)}>
              <Text style={{ color:'#FFF', fontSize:18, fontWeight:'800' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ position:'absolute', left:0, right:0, top:52 + Math.max(insets.top,0), bottom:64 + Math.max(insets.bottom,0), alignItems:'center', justifyContent:'center' }}>
            {mapViewer ? (() => {
              const raw = String(mapViewer.url || '');
              const parseLatLng = (u: string): { lat?: string; lng?: string } => {
                try {
                  const url = new URL(u);
                  const q = url.searchParams.get('q');
                  if (q && /-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/.test(q)) {
                    const parts = q.split(',');
                    return { lat: parts[0].trim(), lng: parts[1].trim() };
                  }
                } catch {}
                return {};
              };
              const { lat, lng } = parseLatLng(raw);
              const buildStatic = (): string => {
                try {
                  if (lat && lng) {
                    const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
                      || (process as any)?.env?.GOOGLE_MAPS_API_KEY
                      || ((Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY)
                      || ((Constants as any)?.manifest?.extra?.GOOGLE_MAPS_API_KEY);
                    if (key) return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=1024x560&markers=color:red%7C${lat},${lng}&scale=2&key=${key}`;
                    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=1024x560&markers=${lat},${lng},red-pushpin`;
                  }
                } catch {}
                return '';
              };
              const src = buildStatic();
              if (Platform.OS === 'web') {
                return (
                  <Image source={{ uri: src }} style={{ width: '96%', height: '100%', objectFit: 'contain' } as any} resizeMode="contain" onClick={() => { try { Linking.openURL(raw); } catch {} }} />
                );
              }
              return (
                <TouchableOpacity activeOpacity={0.9} onPress={() => { try { Linking.openURL(raw); } catch {} }}>
                  <EImage source={{ uri: src }} style={{ width: '96%', height: '100%' }} contentFit="contain" />
                </TouchableOpacity>
              );
            })() : null}
          </View>
          <View style={{ position:'absolute', left:0, right:0, bottom: Math.max(insets.bottom,0), height:64, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.08)', flexDirection:'row', alignItems:'center', justifyContent:'space-around' }}>
            <TouchableOpacity onPress={() => { try { const raw = String(mapViewer?.url||''); const saveSrc = (()=>{ try { const url=new URL(raw); const q=url.searchParams.get('q'); if(q){ const parts=q.split(','); if(parts.length>=2){ const lat=parts[0].trim(); const lng=parts[1].trim(); const key=(process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY||(process as any)?.env?.GOOGLE_MAPS_API_KEY||((Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY)||((Constants as any)?.manifest?.extra?.GOOGLE_MAPS_API_KEY); if(key) return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=1024x560&markers=color:red%7C${lat},${lng}&scale=2&key=${key}`; return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=1024x560&markers=${lat},${lng},red-pushpin`; } } } catch{} return ''; })(); if(saveSrc) saveFileToDevice(saveSrc, 'map.png'); } catch {} }}>
              <Text style={{ color:'#FFF', fontWeight:'800' }}>저장</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={async () => { try { const raw=String(mapViewer?.url||''); await (navigator as any)?.clipboard?.writeText?.(raw); } catch {} }}>
              <Text style={{ color:'#FFF', fontWeight:'800' }}>복사</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { try { const raw = String(mapViewer?.url||''); const payload = { imageUrl: raw, name: 'map' }; setMapViewer(null); setTimeout(()=>{ try { useForwardModalStore.getState().open(payload as any); } catch {} },0); } catch {} }}>
              <Text style={{ color:'#FFF', fontWeight:'800' }}>전달</Text>
            </TouchableOpacity>
            {/* 위치 말풍선: 보관 비활성화 */}
            <TouchableOpacity onPress={() => { try { if (mapViewer?.messageId) deleteMessage(roomId, mapViewer.messageId); } catch {} setMapViewer(null); }}>
              <Text style={{ color:'#FFF', fontWeight:'800' }}>삭제</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* 이미지/비디오 뷰어(네이티브) */}
      <Modal animationType="fade" transparent visible={!!imageViewer && Platform.OS !== 'web' && (imageViewer.kind==='image' || imageViewer.kind==='video')} onRequestClose={() => setImageViewer(null)}>
        <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor:'rgba(0,0,0,0.95)', zIndex: 90000 }}>
          <View style={{ height: 52, paddingHorizontal:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />
              <View>
                <Text style={{ color:'#FFF', fontWeight:'800', fontSize:14 }}>{imageViewer?.displayName || (imageViewer?.kind === 'video' ? '비디오' : '이미지')}</Text>
                <Text style={{ color:'#BBB', fontSize:10 }}>{(() => { try { const u=new URL(String(imageViewer?.url||'')); return u.host; } catch { return ''; } })()}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setImageViewer(null)}>
              <Text style={{ color:'#FFF', fontSize:18, fontWeight:'800' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ position:'absolute', left:0, right:0, top:52 + Math.max(insets.top,0), bottom:64 + Math.max(insets.bottom,0), alignItems:'center', justifyContent:'center' }}>
            {imageViewer ? (
              imageViewer.kind === 'video' ? (
                <Video
                  source={{ uri: String(imageViewer.url) }}
                  style={{ width: '96%', height: '100%' }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                />
              ) : (
                <EImage source={{ uri: String(imageViewer.url) }} style={{ width: '96%', height: '100%' }} contentFit="contain" />
              )
            ) : null}
          </View>
          <View style={{ position:'absolute', left:0, right:0, bottom: Math.max(insets.bottom,0), height:64, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.08)', flexDirection:'row', alignItems:'center', justifyContent:'space-around' }}>
            {String(type)!=='ttl' && (
              <>
                <TouchableOpacity onPress={() => { try { saveFileToDevice(String(imageViewer?.url||''), (imageViewer?.displayName||'image')); } catch {} }}>
                  <Text style={{ color:'#FFF', fontWeight:'800' }}>저장</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => { try { const raw = String(imageViewer?.url||''); await addToMediaGallery(raw, (imageViewer?.kind as any)||undefined, imageViewer?.displayName||undefined); } catch {} }}>
                  <Text style={{ color:'#FFF', fontWeight:'800' }}>보관</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => { try { if (imageViewer?.messageId) deleteMessage(roomId, imageViewer.messageId); } catch {} setImageViewer(null); }}>
              <Text style={{ color:'#FFF', fontWeight:'800' }}>삭제</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* 공통 뷰어 적용 (웹/네이티브: 링크/유튜브 전용) */}
      {imageViewer && (Platform.OS === 'web' || (imageViewer.kind==='web' || imageViewer.kind==='youtube')) ? (
        <ChatViewer
          visible={!!imageViewer}
          url={String(imageViewer.url)}
          kind={(imageViewer.kind as any) || ((): any => {
            try {
              const t = mediaDetectType(String(imageViewer.url));
              if (t === 'image') return 'image';
              if (t === 'video') return 'video';
              if (t === 'file') {
                const u = new URL(String(imageViewer.url));
                const ext = (u.pathname.split('.').pop() || '').toLowerCase();
                if (ext === 'pdf') return 'pdf';
                return 'web';
              }
              try { const u = new URL(String(imageViewer.url)); const h=u.host.toLowerCase(); if (/(^|\.)youtube\.com$/.test(h)||/(^|\.)youtu\.be$/.test(h)) return 'youtube'; } catch {}
              return 'web';
            } catch { return 'web'; }
          })()}
          title={imageViewer.displayName}
          onClose={() => setImageViewer(null)}
          onOpen={() => { try { Linking.openURL(String(imageViewer.url)); } catch {} }}
          onPrev={typeof imageViewer.index === 'number' ? () => goPrevImage() : undefined}
          onNext={typeof imageViewer.index === 'number' ? () => goNextImage() : undefined}
          onForward={() => { try { const payload = { imageUrl: String(imageViewer.url), name: imageViewer.displayName||'image' }; setImageViewer(null); setTimeout(()=>{ try { useForwardModalStore.getState().open(payload as any); } catch {} }, 0); } catch {} }}
          onKeep={String(type)==='ttl' ? undefined : (async () => { try {
            const raw = String(imageViewer.url);
            const t = ((): any => { try { return mediaDetectType(raw) as any; } catch { return 'image' as any; } })();
            const hint = (t === 'youtube') ? 'video' : t;
            // 비디오의 경우에만 파일명 힌트를 전달(이미지는 계속 URL/메타에서 추론)
            const nameHint = (() => {
              try {
                if ((imageViewer as any)?.kind === 'video') {
                  const nm = String((imageViewer as any)?.displayName || '').trim();
                  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(nm)) return nm;
                }
              } catch {}
              return undefined as any;
            })();
            await addToMediaGallery(raw, hint as any, nameHint as any);
          } catch {} })}
        />
      ) : null}
      {Platform.OS === 'web' && fileViewer ? (
        <ChatViewer
          visible={!!fileViewer}
          url={String(fileViewer.url)}
          kind={((): any => {
            try {
              const t = mediaDetectType(String(fileViewer.url));
              if (t === 'image') return 'image';
              if (t === 'video') return 'video';
              if (t === 'file') {
                const u = new URL(String(fileViewer.url));
                const ext = (u.pathname.split('.').pop() || '').toLowerCase();
                if (ext === 'pdf') return 'pdf';
                return 'web';
              }
              // 링크: YouTube 여부
              try { const u = new URL(String(fileViewer.url)); const h=u.host.toLowerCase(); if (/(^|\.)youtube\.com$/.test(h)||/(^|\.)youtu\.be$/.test(h)) return 'youtube'; } catch {}
              return 'web';
            } catch { return 'web'; }
          })()}
          title={fileViewer.name}
          onClose={() => setFileViewer(null)}
          onOpen={() => { try { Linking.openURL(String(fileViewer.url)); } catch {} }}
          onSave={String(type)==='ttl' ? undefined : (() => { try { saveFileToDevice(String(fileViewer.url), fileViewer.name||'file'); } catch {} })}
          onForward={() => { try { const payload = { imageUrl: String(fileViewer.url), name: fileViewer.name||'file' }; setFileViewer(null); setTimeout(()=>{ try { useForwardModalStore.getState().open(payload as any); } catch {} }, 0); } catch {} }}
          onKeep={String(type)==='ttl' ? undefined : (async () => { try { const raw=String(fileViewer.url); await addToMediaGallery(raw, undefined as any, fileViewer.name || 'file'); } catch {} })}
        />
      ) : null}
      {Platform.OS === 'web' && mapViewer ? (
        <ChatViewer
          visible={!!mapViewer}
          url={String(mapViewer.url)}
          kind={'map' as any}
          title={'지도'}
          onClose={() => setMapViewer(null)}
          onOpen={() => { try { Linking.openURL(String(mapViewer.url)); } catch {} }}
          onForward={() => { try { const payload = { imageUrl: String(mapViewer.url), name: 'map' }; setMapViewer(null); setTimeout(()=>{ try { useForwardModalStore.getState().open(payload as any); } catch {} }, 0); } catch {} }}
          /* 위치 말풍선: 보관 메뉴 제거 */
        />
      ) : null}
      </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  roomTitleBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#1F1F1F' },
  roomLeaveBtn: { marginRight: 8 },
  roomLeaveText: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  roomTitleText: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  messagesWrap: { flex: 1, pointerEvents: 'box-none' },
  messagesContent: { padding: 12 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  meBubble: { backgroundColor: '#D4AF37', alignSelf: 'flex-end', borderTopRightRadius: 4 },
  otherBubble: { backgroundColor: '#FFFFFF', alignSelf: 'flex-start', borderTopLeftRadius: 4 },
  bubbleText: { color: '#0C0C0C', fontSize: 14, flexShrink: 1, maxWidth: '100%', lineHeight: 18, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
  timeText: { color: '#666', fontSize: 10, marginTop: 2, marginHorizontal: 6 },
  inputContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 8, paddingTop: 8, backgroundColor: '#0C0C0C' },
  inputInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' },
  addButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  addButtonText: { color: '#0C0C0C', fontWeight: 'bold', fontSize: 16, lineHeight: 16 },
  inputField: { flex: 1, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: '#F6F6F6', backgroundColor: '#1A1A1A', height: 36, marginRight: 6 },
  sendButton: { paddingHorizontal: 4, paddingVertical: 4 },
  plusPanel: { position: 'absolute', left: 12, width: 120, zIndex: 4000, elevation: 20, padding: 8, backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-around', pointerEvents: 'auto' },
  plusItem: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, backgroundColor: '#141414' },
  plusText: { color: '#FFD700', fontWeight: '700' },
  replyInlineBox: { marginBottom: 6, marginLeft: 10, padding: 0, borderWidth: 0, borderColor: 'transparent', borderRadius: 0, backgroundColor: 'transparent' },
  replyInlineLabel: { color: '#000', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyInlineText: { color: '#000', fontSize: 12 },
  // settings
  settingsOverlay: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex: 50, alignItems:'center', justifyContent:'center' },
  settingsSheet: { width: 320, maxWidth: '92%', backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:12, overflow:'hidden' },
  settingsHeader: { flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1E1E1E' },
  settingsTitle: { color:'#FFF', fontWeight:'700' },
  settingsTabsWrap: { flexGrow: 0, flexShrink: 0, height: 48 },
  settingsTabs: { flexDirection:'row', flexWrap:'nowrap', alignItems:'center', gap:6, paddingHorizontal:10, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#1E1E1E' },
  tagWrap: { flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6 },
  tagTextInput: { minWidth:80, flexGrow:1, color:'#EEE', paddingVertical:4 },
  chip: { flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#3A3A3A', borderRadius:999, paddingHorizontal:10, paddingVertical:6 },
  chipText: { color:'#CFCFCF', fontSize:12, marginRight:4 },
  chipRemove: { color:'#888', fontSize:12 },
  tabBtn: { paddingHorizontal:10, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, backgroundColor:'#141414', maxWidth: 140, height: 36, justifyContent:'center' },
  tabBtnActive: { borderColor:'#FFD700' },
  tabText: { color:'#CFCFCF', fontSize:12 },
  tabTextActive: { color:'#FFD700', fontWeight:'700' },
  fieldLabel: { color:'#BBB', fontSize:12 },
  fieldInput: { borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#151515', color:'#EEE', borderRadius:8, paddingHorizontal:10, paddingVertical:8 },
  toggleBtn: { paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, backgroundColor:'#141414' },
  primaryBtn: { paddingHorizontal:12, paddingVertical:8, borderRadius:8, backgroundColor:'#D4AF37' },
  primaryBtnText: { color:'#0C0C0C', fontWeight:'800' },
  secondaryBtn: { paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A', alignItems:'center', justifyContent:'center', height: 36 },
  secondaryBtnText: { color:'#DDD', textAlign:'center' },
  // context menu (popup)
  contextMenuOverlay: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.45)' },
  contextMenu: { backgroundColor:'#FFFFFF', borderRadius: 16, borderWidth:1, borderColor:'#E5E5E5', overflow:'hidden', shadowColor:'#000', shadowOpacity:0.2, shadowRadius:16, elevation:8 },
  contextMenuItem: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor:'#FFFFFF', borderBottomWidth:1, borderBottomColor:'#EEE' },
  contextMenuText: { color:'#111', fontSize:14, fontWeight:'600' },
  linkCard: { marginTop: 8, borderWidth:1, borderColor:'#E5E5E5', borderRadius:12, overflow:'hidden', backgroundColor:'#FFFFFF', alignSelf:'flex-start' },
  linkImage: { width: '100%', height: 160, backgroundColor:'#111' },
  linkTitle: { color:'#111', fontWeight:'800', fontSize:14, paddingHorizontal:10, paddingTop:8 },
  linkDesc: { color:'#333', fontSize:12, marginTop:4, paddingHorizontal:10 },
  linkHost: { color:'#777', fontSize:11, marginTop:8, paddingHorizontal:10, paddingBottom:10 },
  linkIframeWrap: { width:'100%', height: 220, backgroundColor:'#FFF' },
  reactionBar: { flexDirection:'row', gap: 12, backgroundColor:'#FFFFFF', borderWidth:1, borderColor:'#E5E5E5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:16, elevation:8 },
  ttlBadge: { position:'absolute', right:-6, bottom:-6, backgroundColor:'#000', borderWidth:1, borderColor:'#333', paddingHorizontal:6, paddingVertical:2, borderRadius:10 },
  ttlBadgeText: { color:'#FFD700', fontSize:10 },
  ttlBarWrap: { position:'absolute', left:0, right:0, top:-5, height:3, backgroundColor:'rgba(255,215,0,0.25)', borderTopLeftRadius:10, borderTopRightRadius:10, pointerEvents:'none', zIndex: 5 },
  ttlBarFill: { height:3, backgroundColor:'#FFD700', borderTopLeftRadius:10, borderTopRightRadius:10 },
});