// @ts-nocheck
/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Image, FlatList, Alert, Switch, ImageBackground, Keyboard, Modal, InteractionManager, Share, ActivityIndicator } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { useLocalSearchParams, router } from 'expo-router';
import RoomSettingsModal from '@/src/features/chat/settings/components/RoomSettingsModal';
import TTLCountdownHeader from '@/src/features/chat/settings/components/TTLCountdownHeader';
import TTLSettingsModal from '@/src/features/chat/settings/components/TTLSettingsModal';
// Static imports to guarantee availability in release builds
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import * as VideoThumbnails from 'expo-video-thumbnails';
import useRoomSettingsState from '@/src/features/chat/settings/hooks/useRoomSettingsState';
import { createDefaultRoomSettings, type RoomSettings, type RoomType } from '@/src/features/chat/settings/types';
const ChatViewer = React.lazy(() => import('@/src/features/chat/components/ChatViewer'));
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { firebaseAuth } from '@/lib/firebase';
import { playNotificationSound, type NotificationMode } from '@/lib/notificationSound';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Ionicons } from '@expo/vector-icons';
import { perfStart, perfEnd } from '@/lib/perfTimer';
// 안정 참조: 빈 배열 상수 (zustand selector에서 새 배열 생성으로 인한 무한 업데이트 방지)
const EMPTY_LIST: any[] = [];
class RoomErrorBoundary extends React.Component<any, { hasError: boolean; err?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, err: error }; }
  componentDidCatch(error: any) { try { (globalThis as any).__lastRoomError = { message: String(error?.message||error), stack: String(error?.stack||'') }; console.error('Room error:', error); } catch {} }
  render() {
    if (this.state.hasError) {
      // 주의: 이 뷰는 최대한 단순한 RN View로 렌더하여 또다른 오류 루프를 예방
      return (
        <View style={{ flex:1, backgroundColor:'#0C0C0C' }}>
          <View style={[styles.roomTitleBar, { paddingTop: 0 }]}>
            <TouchableOpacity style={styles.roomLeaveBtn} onPress={() => { try { router.push('/chat/rooms'); } catch {} }}>
              <Text style={styles.roomLeaveText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.roomTitleText}>대화방</Text>
          </View>
          <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
            <Text style={{ color:'#EDEDED', fontSize:16, fontWeight:'800' }}>예상치 못한 오류가 발생했습니다</Text>
            {!!this.state?.err?.message && (
              <Text style={{ color:'#888', fontSize:12, marginTop:8, paddingHorizontal:16, textAlign:'center' }} numberOfLines={4}>
                {String(this.state?.err?.message||'')}
              </Text>
            )}
            <TouchableOpacity onPress={() => { try { this.setState({ hasError: false, err: null }); } catch {} }} style={{ marginTop:12, backgroundColor:'#FFD700', paddingHorizontal:16, paddingVertical:10, borderRadius:10 }}>
              <Text style={{ color:'#000', fontWeight:'800' }}>계속</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

function RoomInner() {
  // Performance: track chat room enter time
  useEffect(() => {
    perfStart('chat-room-enter');
    return () => { perfEnd('chat-room-enter'); };
  }, []);
  
  // SafeAreaInsetsContext로 직접 조회하여 Provider 미주입 시에도 0 폴백
  const insetsFromCtx = React.useContext(SafeAreaInsetsContext as any) as { top: number; bottom: number; left: number; right: number } | null;
  const insets = insetsFromCtx || { top: 0, bottom: 0, left: 0, right: 0 };
  const params = useLocalSearchParams<{ id?: string }>();
  const roomId = String(params.id || '');
  // Hooks는 규칙에 따라 최상위에서 호출
  const currentUser = (firebaseAuth && (firebaseAuth as any).currentUser) ? (firebaseAuth as any).currentUser : null;
  const uid = (currentUser && (currentUser.uid)) ? String(currentUser.uid) : 'me';
  const { language } = usePreferences();

  // 스토어 선택 안정화: 빈 배열은 항상 동일 참조를 반환
  const storeMessages = useKakaoRoomsStore((s) => (s.messages && s.messages[roomId]) ? s.messages[roomId] : EMPTY_LIST);
  // 방 객체는 selector에서 직접 구독하여 변경(예: TTL/메시지TTL) 시 재렌더되도록 한다.
  const room = useKakaoRoomsStore((s) => (s.rooms || []).find(r => r.id === roomId));
  const enterRoom = useKakaoRoomsStore((s) => s.enterRoom);
  const sendMessage = useKakaoRoomsStore((s) => s.sendMessage);
  const removeMessage = useKakaoRoomsStore((s) => s.deleteMessage);
  const markRead = useKakaoRoomsStore((s) => s.markRead);
  const saveRoomSettings = useKakaoRoomsStore((s) => s.saveRoomSettings);
  const updateRoomMeta = useKakaoRoomsStore((s) => s.updateRoomMeta);
  const setRoomPrivacy = useKakaoRoomsStore((s) => s.setRoomPrivacy);
  const loadRoomSettings = useKakaoRoomsStore((s) => s.loadRoomSettings);
  const setMemberRole = useKakaoRoomsStore((s) => s.setMemberRole);
  const generateInvite = useKakaoRoomsStore((s) => s.generateInvite);
  const leaveRoom = useKakaoRoomsStore((s) => s.leaveRoom);
  const roomSettingsMap = useKakaoRoomsStore((s) => s.roomSettings || {});
  const messages = Array.isArray(storeMessages) ? storeMessages : [];
  const isTTLRoom = String((room as any)?.type || '').toLowerCase() === 'ttl';
  const settingsTtlMs = useMemo(() => {
    try { return Number(((roomSettingsMap as any)?.[roomId]?.ttl?.messageTtlMs) || 0); }
    catch { return 0; }
  }, [roomSettingsMap, roomId]);
  // Prefer top-level messageTtlMs; if absent, fall back to settings.ttl.messageTtlMs (regardless of room.type)
  const ttlMs = useMemo(() => {
    try {
      // 일반 방은 TTL 미적용(카톡과 동일한 기본 규칙)
      if (!isTTLRoom) return 0;
      const top = Number((room as any)?.messageTtlMs || 0);
      if (top > 0) return top;
      if (settingsTtlMs > 0) return Number(settingsTtlMs || 0);
      return 0;
    } catch {
      return 0;
    }
  }, [room, settingsTtlMs, isTTLRoom]);
  const roomExpireAt = useMemo(() => {
    try {
      const top = Number((room as any)?.expiresAt || 0);
      const fromSettings = Number(((roomSettingsMap as any)?.[roomId]?.ttl?.expiresAtMs) || 0);
      return top || fromSettings || 0;
    } catch { return 0; }
  }, [room, roomSettingsMap, roomId]);
  const memberIds = Array.isArray((room as any)?.members) ? ((room as any).members as string[]) : [];
  // 참여자 수 계산: members 배열 → room.memberCount → roles.keys → 메시지 발신자 유추 순으로 폴백
  const participantCount = React.useMemo(() => {
    try {
      if (Array.isArray((room as any)?.members) && (room as any).members.length) return (room as any).members.length;
      const mc = Number((room as any)?.memberCount || 0);
      if (mc > 0) return mc;
      const roles = ((roomSettingsMap as any)?.[roomId]?.members?.roles) || {};
      const roleCount = Object.keys(roles || {}).length;
      if (roleCount > 0) return roleCount;
      // 마지막 폴백: 대화에 등장한 고유 발신자 수 + 나(최소 2 보장)
      const uniqueSenders = new Set<string>((messages || []).map((m:any)=> String(m?.senderId||'')).filter(Boolean));
      if (uniqueSenders.size >= 2) return uniqueSenders.size;
      return Math.max(2, uniqueSenders.size || 1);
    } catch { return 2; }
  }, [room, roomSettingsMap, roomId, messages]);
  // 테마 설정
  const themeSettings = useMemo(() => {
    try { return (roomSettingsMap as any)?.[roomId]?.theme || {}; } catch { return {}; }
  }, [roomSettingsMap, roomId]);
  const bgColorTheme = String(themeSettings?.backgroundColorHex || '#0C0C0C');
  const bgImage = String(themeSettings?.backgroundImageUrl || '') || undefined;
  const bubbleColorTheme = String(themeSettings?.bubbleColorHex || '#D4AF37');
  const fontScaleLevel = Number(themeSettings?.fontScaleLevel || 3) as 1|2|3|4|5;
  const fontSizes = [12, 13.5, 15, 17, 19];
  const bodyFont = fontSizes[Math.min(Math.max(1, fontScaleLevel), 5)-1];
  const timeFont = Math.max(8, Math.floor(bodyFont - 4));
  // TTL 보안 정책
  const ttlSecurity = useMemo(() => {
    try { return (roomSettingsMap as any)?.[roomId]?.ttlSecurity || {}; } catch { return {}; }
  }, [roomSettingsMap, roomId]);
  // TTL 모달에 넘길 보안 기본값(조건부 훅 호출 방지용 최상위 계산)
  const modalSecurity = useMemo(() => {
    try {
      return {
        allowImageUpload: ttlSecurity?.allowImageUpload !== false,
        allowImageDownload: !!ttlSecurity?.allowImageDownload,
        allowCapture: !!ttlSecurity?.allowCapture,
        allowExternalShare: !!ttlSecurity?.allowExternalShare,
      } as any;
    } catch {
      return { allowImageUpload: true, allowImageDownload: false, allowCapture: false, allowExternalShare: false } as any;
    }
  }, [ttlSecurity]);
  const myRole = useMemo(() => {
    try {
      const roles = ((roomSettingsMap as any)?.[roomId]?.members?.roles) || {};
      if (String((room as any)?.createdBy||'') === uid) return 'admin';
      return String(roles[uid] || 'member');
    } catch { return 'member'; }
  }, [roomSettingsMap, room, uid, roomId]);
  const isPrivileged = (myRole === 'admin' || myRole === 'moderator');
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  // 키보드/모달 열림 시에는 1초 갱신을 잠시 중단하여 리렌더링 간섭을 줄임(안드로이드 키보드 깜빡임 방지)
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const sh = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hd = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { try { sh.remove(); hd.remove(); } catch {} };
  }, []);

  // 새 메시지 알림 소리/진동 처리
  const prevMsgCountRef = useRef<number>(0);
  const isFirstLoadRef = useRef<boolean>(true);
  useEffect(() => {
    try {
      const msgCount = messages.length;
      // 첫 로드 시에는 알림 재생하지 않음
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        prevMsgCountRef.current = msgCount;
        return;
      }
      // 새 메시지가 추가되었을 때만
      if (msgCount > prevMsgCountRef.current) {
        const lastMsg = messages[messages.length - 1];
        // 내가 보낸 메시지가 아닐 때만 알림
        if (lastMsg && String(lastMsg?.senderId || '') !== uid) {
          // 알림 설정 확인
          const notifSettings = (roomSettingsMap as any)?.[roomId]?.notifications || {};
          const mode = String(notifSettings?.mode || notifSettings?.sound || 'sound') as NotificationMode;
          const enabled = notifSettings?.enabled !== false;
          if (enabled && mode !== 'mute' && mode !== 'off') {
            playNotificationSound(mode);
          }
        }
      }
      prevMsgCountRef.current = msgCount;
    } catch (e) { console.warn('[Room] notification error:', e); }
  }, [messages, uid, roomId, roomSettingsMap]);

  useEffect(() => {
    if (ttlModalOpen || !(ttlMs > 0)) return;
    const t = setInterval(() => { try { setNowTick(Date.now() + serverOffsetMs); } catch {} }, 1000);
    return () => { try { clearInterval(t); } catch {} };
  }, [ttlModalOpen, ttlMs, serverOffsetMs]);

  // 방 진입 시 실시간 구독 시작 (첫 페인트 후 실행해 입력창/채팅 화면이 빨리 나오도록)
  useEffect(() => {
    if (!roomId) return;
    const task = InteractionManager.runAfterInteractions(() => {
      try { enterRoom(roomId); } catch {}
    });
    return () => { task.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  // 방 진입/포커스 시 즉시 읽음 처리
  useEffect(() => {
    try { if (roomId && uid) markRead?.(roomId, uid); } catch {}
  }, [roomId, uid]);

  // TTL 만료 메시지 필터링: 서버에서 삭제가 지연되거나 실패해도 UI에서는 숨김
  const [hiddenMsgIds, setHiddenMsgIds] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const key = `u:${uid}:room:${roomId}:hiddenMsgIds`;
        const raw = await AsyncStorage.getItem(key);
        if (!alive) return;
        if (!raw) { setHiddenMsgIds(new Set()); return; }
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setHiddenMsgIds(new Set(arr.map((x) => String(x)).filter(Boolean)));
      } catch { setHiddenMsgIds(new Set()); }
    })();
    return () => { alive = false; };
  }, [roomId, uid]);

  const hideMessageForMe = React.useCallback(async (msgId: string) => {
    try {
      const id = String(msgId || '');
      if (!id) return;
      setHiddenMsgIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const key = `u:${uid}:room:${roomId}:hiddenMsgIds`;
      const prevArr = Array.from(hiddenMsgIds || []);
      const nextArr = Array.from(new Set([...prevArr, id]));
      await AsyncStorage.setItem(key, JSON.stringify(nextArr));
    } catch {}
  }, [roomId, uid, hiddenMsgIds]);

  const filteredMessages = React.useMemo(() => {
    try {
      const isTTL = String((room as any)?.type || '').toLowerCase() === 'ttl';
      const base = Array.isArray(messages) ? messages : [];
      const visible = hiddenMsgIds && hiddenMsgIds.size
        ? base.filter((m:any) => !hiddenMsgIds.has(String(m?.id || '')))
        : base;
      if (!(isTTL && ttlMs > 0)) return visible;
      const toMs = (v: any): number => {
        try {
          if (typeof v === 'number') return Number(v);
          if (v?.toMillis) return Number(v.toMillis());
          if (typeof v?.seconds === 'number') {
            const ns = typeof v?.nanoseconds === 'number' ? Math.floor(v.nanoseconds / 1e6) : 0;
            return v.seconds * 1000 + ns;
          }
          if (type === 'map') {
            // 지도: content는 JSON { address, url, lat, lng }
            let address = ''; let mapUrl = '';
            try {
              const j = JSON.parse(String(item?.content||'{}'));
              // 표시 문자열 우선순위: display > address > 필드 조합 > 재배열
              const disp = String(j?.display || j?.address || '');
              if (disp) {
                address = disp;
              } else if (j?.country || j?.region || j?.city || j?.street) {
                const roadWithNo = [String(j?.street||'').trim(), String(j?.streetNo||'').trim()].filter(Boolean).join(' ');
                address = [String(j?.country||'').trim(), String(j?.region||'').trim(), String(j?.city||'').trim(), roadWithNo].filter(Boolean).join(' ');
              } else {
                // fallback: "도로, 도시, 광역, 국가" → "국가 광역 도시 도로" 재배열
                const raw = String(j?.address||'');
                const parts = raw.split(',').map((s:string)=>s.trim());
                if (parts.length >= 4) {
                  address = `${parts[3]} ${parts[2]} ${parts[1]} ${parts[0]}`;
                } else {
                  address = raw;
                }
              }
              mapUrl = String(j?.url||'');
            } catch { /* fallback below */ }
            if (!mapUrl) {
              // fallback: content에 텍스트 포함된 형식 지원
              const text = String(item?.content||'');
              const m = text.match(/https?:\/\/[^\s]+/i);
              mapUrl = m && m[0] ? m[0] : '';
              address = (text || '').split('\n')[0] || address;
            }
            const onOpenMapPreview = () => {
              try {
                if (!mapUrl) return;
                // 헤더 정보 채우기
                try {
                  const senderId = String(item?.senderId || '');
                  const profStore = require('@/src/features/chat/store/chat-profile.store');
                  const prof = profStore.useChatProfileStore.getState().getProfile?.(senderId) || null;
                  const title = prof?.chatName || prof?.displayName || senderId || '보낸 사람';
                  setViewerTitle(title);
                  const avatar = prof?.avatar;
                  setViewerHeaderAvatar(avatar || undefined);
                } catch { setViewerTitle('보낸 사람'); setViewerHeaderAvatar(undefined); }
                try {
                  const ct: any = item?.createdAt;
                  let ts = 0;
                  if (typeof ct === 'number') ts = Number(ct);
                  else if (ct?.toMillis) ts = Number(ct.toMillis());
                  else if (typeof ct?.seconds === 'number') { const ns = typeof ct?.nanoseconds === 'number' ? Math.floor(ct.nanoseconds/1e6) : 0; ts = ct.seconds*1000 + ns; }
                  else ts = Date.now();
                  setViewerHeaderTs(ts);
                } catch { setViewerHeaderTs(Date.now()); }
                // 같은 대화의 지도 미디어 목록 수집
                try {
                  const mapUrls: string[] = [];
                  (messages || []).forEach((m:any) => {
                    try {
                      if (String(m?.type||'') !== 'map') return;
                      const j = JSON.parse(String(m?.content||'{}'));
                      const u = String(j?.url||'');
                      if (u) mapUrls.push(u);
                    } catch {}
                  });
                  const idx = Math.max(0, mapUrls.indexOf(mapUrl));
                  setViewerList(mapUrls.length ? mapUrls : [mapUrl]);
                  setViewerIndex(idx);
                } catch { setViewerList([mapUrl]); setViewerIndex(0); }
                setViewerMsgId(String(item?.id||'')); setViewerUrl(mapUrl); setViewerKind('map'); setViewerOpen(true);
              } catch {}
            };
            return (
              <View style={{ width: 240 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onOpenMapPreview}
                  style={{ flexDirection:'row', alignItems:'flex-start', gap:6 }}
                >
                  <Text style={{ color:'#B71C1C' }}>📍</Text>
                  <Text style={{ color:'#0C0C0C', fontWeight:'900', textDecorationLine:'underline' }}>{address || '지도 열기'}</Text>
                </TouchableOpacity>
                {!!mapUrl && <View style={{ marginTop:8 }}><LinkPreviewBox url={mapUrl} /></View>}
              </View>
            );
          }
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : 0;
        } catch { return 0; }
      };
      const now = nowTick;
      return (visible || []).filter((m: any) => {
        const created = toMs(m?.createdAt);
        if (!created) return true;
        return (created + ttlMs) > now;
      });
    } catch {
      return messages;
    }
  }, [messages, room, ttlMs, nowTick, hiddenMsgIds]);

  // ===== 메시지 메뉴(카톡 스타일) =====
  const [msgMenuOpen, setMsgMenuOpen] = React.useState(false);
  const [msgReactOpen, setMsgReactOpen] = React.useState(false);
  const [selectedMsg, setSelectedMsg] = React.useState<any>(null);
  const [selectedMsgIsMe, setSelectedMsgIsMe] = React.useState<boolean>(false);
  const openMsgMenu = React.useCallback((msg: any, isMeMsg: boolean) => {
    try {
      setSelectedMsg(msg || null);
      setSelectedMsgIsMe(!!isMeMsg);
      setMsgMenuOpen(true);
    } catch {}
  }, []);
  const closeMsgMenu = React.useCallback(() => {
    try { setMsgMenuOpen(false); setMsgReactOpen(false); } catch {}
  }, []);
  const openReactPicker = React.useCallback(() => { try { setMsgReactOpen(true); } catch {} }, []);
  const closeReactPicker = React.useCallback(() => { try { setMsgReactOpen(false); } catch {} }, []);

  const keepMessageMediaToTreasure = React.useCallback((msg: any) => {
    try {
      const m = msg || {};
      const kind = String(m?.type || 'text');
      const { useMediaStore, mediaIdForUri } = require('@/src/features/chat/store/media.store');
      const addOne = (uri: string, typeHint?: 'image'|'video'|'file'|'link') => {
        const u = String(uri || '').trim();
        if (!u) return;
        const id = mediaIdForUri(u);
        useMediaStore.getState().addOrUpdate({
          id,
          uriHttp: u,
          visibility: 'private',
          location: 'treasure',
          createdAt: Date.now(),
          type: typeHint,
        });
      };
      if (kind === 'image' && m?.imageUrl) addOne(String(m.imageUrl), 'image');
      else if (kind === 'video' && m?.imageUrl) addOne(String(m.imageUrl), 'video');
      else if (kind === 'file' && m?.imageUrl) addOne(String(m.imageUrl), 'file');
      else if (kind === 'album' && Array.isArray(m?.albumUrls)) (m.albumUrls||[]).forEach((u:any)=> addOne(String(u), 'image'));
      else if (kind === 'map') {
        try {
          const j = JSON.parse(String(m?.content || '{}'));
          const u = String(j?.url || '');
          if (u) addOne(u, 'link');
        } catch {}
      } else {
        // text: 첫 URL만 링크로 보관
        const txt = String(m?.content || '');
        const u = (txt.match(/(yooy:\/\/[^\s]+|appyooyland:\/\/[^\s]+|https?:\/\/[^\s]+)/i) || [])[1] || '';
        if (u) addOne(u, 'link');
      }
      Alert.alert('보물창고', '비공개로 보관되었습니다.');
    } catch {}
  }, []);

  // 프로필 실시간 구독: 방 멤버 + 최근 메시지 발신자 → users/{uid} onSnapshot (최대 20명으로 제한해 채팅 속도 유지)
  const profileSubsRef = React.useRef<Record<string, () => void>>({});
  const MAX_PROFILE_SUBS = 20;
  useEffect(() => {
    (async () => {
      try {
        const { firestore } = require('@/lib/firebase');
        const { doc, onSnapshot } = require('firebase/firestore');
        const memberSet = new Set<string>(memberIds.map((u)=>String(u)));
        (messages || []).forEach((m:any)=> { if (m?.senderId) memberSet.add(String(m.senderId)); });
        const want = Array.from(memberSet).filter(Boolean).slice(0, MAX_PROFILE_SUBS);
        // 구독 추가
        for (const uidX of want) {
          if (profileSubsRef.current[uidX]) continue;
          try {
            const unsub = onSnapshot(doc(firestore, 'users', uidX), (snap:any) => {
              try {
                const data:any = snap.exists() ? snap.data() : {};
                const displayName: string = data?.chatName || data?.displayName || data?.username || data?.name || uidX;
                let avatar: string | undefined = data?.avatarUrl || data?.photoURL || data?.avatar || undefined;
                const now = Date.now();
                const chatProfile = { id:`chat_profile_${uidX}`, userId: uidX, displayName, chatName: displayName, useHashInChat:false, avatar, status:'online', createdAt: now, lastActive: now };
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const store = require('@/src/features/chat/store/chat-profile.store');
                store.useChatProfileStore.setState((s:any)=>({ profiles: { ...(s?.profiles||{}), [uidX]: { ...(s?.profiles?.[uidX]||{}), ...chatProfile } } }));
                // 아바타가 http(s)가 아니면 Storage URL로 해석 시도
                (async () => {
                  try {
                    if (!avatar || /^https?:\/\//i.test(String(avatar))) return;
                    const { ref: storageRef, getDownloadURL } = require('firebase/storage');
                    const { firebaseStorage } = require('@/lib/firebase');
                    const r = storageRef(firebaseStorage, String(avatar));
                    const url = await getDownloadURL(r);
                    store.useChatProfileStore.setState((s:any)=>({ profiles: { ...(s?.profiles||{}), [uidX]: { ...(s?.profiles?.[uidX]||{}), avatar: url } } }));
                  } catch {}
                })();
              } catch {}
            }, () => {});
            profileSubsRef.current[uidX] = unsub;
          } catch {}
        }
        // 구독 제거(더 이상 필요 없는 사용자)
        Object.keys(profileSubsRef.current).forEach((uidX) => {
          if (!want.includes(uidX)) {
            try { profileSubsRef.current[uidX](); } catch {}
            delete profileSubsRef.current[uidX];
          }
        });
      } catch {}
    })();
    return () => {
      try {
        Object.values(profileSubsRef.current).forEach((fn)=>{ try { fn(); } catch {} });
        profileSubsRef.current = {};
      } catch {}
    };
  }, [JSON.stringify(memberIds||[]), messages.length]);

  // 대화 내 등장하는 모든 사용자 프로필을 미리 채워서 이름/아바타가 정확히 보이도록
  useEffect(() => {
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const store = require('@/src/features/chat/store/chat-profile.store');
        const { firestore } = require('@/lib/firebase');
        const { doc, getDoc } = require('firebase/firestore');
        const ids = Array.from(new Set((messages || []).map((m:any)=> String(m?.senderId||'')).filter(Boolean)));
        const need = ids.filter((u)=> !store.useChatProfileStore.getState().getProfile(u));
        for (const u of need) {
          try {
            const snap = await getDoc(doc(firestore, 'users', u));
            const data: any = snap.exists() ? (snap.data() as any) : {};
            const displayName: string = data?.chatName || data?.displayName || data?.username || data?.name || u;
            const avatar: string | undefined = data?.avatarUrl || data?.photoURL || data?.avatar || undefined;
            const now = Date.now();
            const chatProfile = {
              id: `chat_profile_${u}`,
              userId: u,
              displayName,
              chatName: displayName,
              useHashInChat: false,
              avatar,
              status: 'online',
              createdAt: now,
              lastActive: now,
            };
            store.useChatProfileStore.setState((s: any) => ({
              profiles: { ...(s?.profiles || {}), [u]: { ...(s?.profiles?.[u]||{}), ...chatProfile } },
            }));
          } catch {}
        }
      } catch {}
    })();
  }, [messages]);

  // 멤버 문서 구독: rooms/{roomId}/members → (chatName/displayName/avatar) 힌트를 프로필 스토어에 반영
  useEffect(() => {
    let unsub: null | (() => void) = null;
    (async () => {
      try {
        if (!roomId) return;
        const { firestore } = require('@/lib/firebase');
        const { collection, onSnapshot } = require('firebase/firestore');
        unsub = onSnapshot(collection(firestore, 'rooms', roomId, 'members'), (snap:any) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const store = require('@/src/features/chat/store/chat-profile.store');
            snap.forEach((d:any) => {
              try {
                const v = d.data() || {};
                const uidX = String(d.id || '');
                if (!uidX) return;
                const display = String(v.chatName || v.displayName || v.name || '');
                let avatar = String(v.avatarUrl || v.photoURL || v.avatar || '');
                store.useChatProfileStore.setState((s:any)=>({
                  profiles: {
                    ...(s?.profiles||{}),
                    [uidX]: {
                      ...(s?.profiles?.[uidX]||{}),
                      id: `chat_profile_${uidX}`,
                      userId: uidX,
                      displayName: display || (s?.profiles?.[uidX]?.displayName) || uidX,
                      chatName: display || (s?.profiles?.[uidX]?.chatName) || (s?.profiles?.[uidX]?.displayName),
                      avatar: avatar || (s?.profiles?.[uidX]?.avatar),
                      status: (s?.profiles?.[uidX]?.status) || 'online',
                      createdAt: (s?.profiles?.[uidX]?.createdAt) || Date.now(),
                      lastActive: Date.now(),
                      useHashInChat: false,
                    }
                  }
                }));
                // 아바타 URL 해석 (gs:// 또는 경로일 때)
                (async () => {
                  try {
                    if (!avatar || /^https?:\/\//i.test(String(avatar))) return;
                    const { ref: storageRef, getDownloadURL } = require('firebase/storage');
                    const { firebaseStorage } = require('@/lib/firebase');
                    const r = storageRef(firebaseStorage, String(avatar));
                    const url = await getDownloadURL(r);
                    store.useChatProfileStore.setState((s:any)=>({ profiles: { ...(s?.profiles||{}), [uidX]: { ...(s?.profiles?.[uidX]||{}), avatar: url } } }));
                  } catch {}
                })();
              } catch {}
            });
          } catch {}
        }, () => {});
      } catch {}
    })();
    return () => { try { unsub && unsub(); } catch {} };
  }, [roomId]);

  // 방에 들어오면 읽음 처리: 로컬 readBy 반영 + 서버 members/{uid}.unread=0, lastReadAt 갱신
  useEffect(() => {
    try {
      const fn = (useKakaoRoomsStore as any).getState()?.markRead;
      if (roomId && uid && typeof fn === 'function') fn(roomId, uid);
    } catch {}
  }, [roomId, uid, messages.length]);

  // Estimate server time offset once per room entry (used to keep TTL countdown identical across devices)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
        const uidNow = uid || 'me';
        const clockRef = doc((await import('@/lib/firebase')).firestore, 'rooms', roomId, '__clock__', uidNow);
        await setDoc(clockRef, { ping: serverTimestamp(), clientAt: Date.now() }, { merge: true });
        // give Firestore a moment to resolve serverTimestamp
        let tries = 0;
        let srv = 0;
        while (tries < 5 && !srv) {
          const snap = await getDoc(clockRef);
          const data: any = snap.exists() ? snap.data() : {};
          srv = data?.ping?.toMillis ? Number(data.ping.toMillis()) : 0;
          if (!srv) { await new Promise(r=>setTimeout(r, 80)); }
          tries++;
        }
        if (srv && !cancelled) {
          const offset = srv - Date.now();
          setServerOffsetMs(offset);
          setNowTick(Date.now() + offset);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  // If we detect a TTL value from settings but the room's top-level messageTtlMs is zero, propagate it so deletion applies immediately.
  useEffect(() => {
    try {
      if (isTTLRoom) {
        const top = Number((room as any)?.messageTtlMs || 0);
        const eff = Number(ttlMs || 0);
        if (eff > 0 && top === 0) {
          (useKakaoRoomsStore as any).getState().setMessageTTL?.(roomId, eff);
        }
      }
    } catch {}
  }, [isTTLRoom, ttlMs, room, roomId]);
  const formatRemain = (ms: number) => {
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    const mm = m % 60;
    const hh = Math.floor(m / 60);
    if (hh > 0) return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  };

  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState<number>(36);
  const [sending, setSending] = useState(false);
  const lastSentRef = useRef<{ value: string; ts: number } | null>(null);
  const listRef = useRef<any>(null);
  const didAutoScrollRef = useRef<boolean>(false);
  const nearBottomRef = useRef<boolean>(true);
  const lastEndIdRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general'|'members'|'ttl'|'rule'|'alarm'>('general');
  const [settingsInitialTab, setSettingsInitialTab] = useState<'basic'|'members'|'permission'|'notification'|'theme'|'ttl'>('basic');
  const [ttlModalOpen, setTtlModalOpen] = useState(false);
  // TTL 모달이 열릴 때는 키보드/첨부 메뉴를 닫아 입력 충돌을 방지
  useEffect(() => {
    if (ttlModalOpen) {
      try { Keyboard.dismiss(); } catch {}
      try { setAttachOpen(false); } catch {}
    }
  }, [ttlModalOpen]);
  // 캡처 차단: TTL 방에서 허용되지 않으면 모두 차단(권한 무시)
  useEffect(() => {
    let reverted = false;
    (async () => {
      try {
        if (isTTLRoom && ttlSecurity && ttlSecurity.allowCapture === false) {
          await ScreenCapture.preventScreenCaptureAsync();
          reverted = true;
        } else {
          await ScreenCapture.allowScreenCaptureAsync();
        }
      } catch {}
    })();
    return () => {
      (async () => {
        try {
          if (reverted) await ScreenCapture.allowScreenCaptureAsync();
        } catch {}
      })();
    };
  }, [isTTLRoom, ttlSecurity]);

  // 새 메시지 도착 시, 사용자가 바닥 근처에 있으면 자동으로 끝으로 스크롤
  useEffect(() => {
    try {
      const last = filteredMessages.length ? String(filteredMessages[filteredMessages.length - 1]?.id || '') : '';
      const appended = last && last !== lastEndIdRef.current;
      if (appended && nearBottomRef.current) {
        listRef.current?.scrollToEnd?.({ animated: true });
      }
      if (appended) lastEndIdRef.current = last;
    } catch {}
  }, [filteredMessages.length]);

  // 키보드가 열릴 때 입력창이 가려지지 않도록 즉시 바닥으로 스크롤
  useEffect(() => {
    if (keyboardOpen) {
      setTimeout(() => { try { listRef.current?.scrollToEnd?.({ animated: true }); } catch {} }, 0);
    }
  }, [keyboardOpen]);

  // General 탭 편집 상태
  const [editorTitle, setEditorTitle] = useState<string>('');
  const [editorDesc, setEditorDesc] = useState<string>('');
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [passwordDraft, setPasswordDraft] = useState<string>('');
  // Theme (간략 버전: 버블/배경색)
  const [bubbleColor, setBubbleColor] = useState<string>('default');
  const [bgColor, setBgColor] = useState<string>('#0C0C0C');
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({}); // userId -> role
  const [expD, setExpD] = useState<string>('0');
  const [expH, setExpH] = useState<string>('0');
  const [expM, setExpM] = useState<string>('0');
  const [expS, setExpS] = useState<string>('0');
  const [ttlH, setTtlH] = useState<string>('0');
  const [ttlMin, setTtlMin] = useState<string>('0');
  const [ttlSec, setTtlSec] = useState<string>('30');
  const normalizeNum = (s: string) => { const n = Math.max(0, Number(String(s||'').replace(/[^0-9]/g,''))||0); return String(n); };
  const calcMs = (d: number, h: number, m: number, s: number) => (((((d*24)+h)*60 + m)*60)+s)*1000;

  // 설정 열릴 때 현재 값 로드
  useEffect(() => {
    if (!settingsOpen || !roomId) return;
    (async () => {
      try {
        const s = await loadRoomSettings(roomId);
        setEditorTitle(String(((room as any)?.title || '')));
        setEditorDesc(String((s?.basic?.description || '') as any));
        setIsPublic(typeof (s?.basic?.isPublic) === 'boolean' ? !!s.basic.isPublic : !!(room as any)?.isPublic);
        setBubbleColor(String(s?.theme?.bubbleColor || 'default'));
        setBgColor(String(s?.theme?.backgroundColor || '#0C0C0C'));
        setMemberRoles({ ...(s?.members?.roles || {}) } as any);
        setSettingsTab(isTTLRoom ? 'ttl' : 'general');
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, roomId]);

  const [attachOpen, setAttachOpen] = useState(false);
  const onAttach = () => setAttachOpen(v=>!v);
  // 키보드가 열리면 + 메뉴는 자동으로 닫힘
  useEffect(() => {
    const sh = Keyboard.addListener('keyboardDidShow', () => setAttachOpen(false));
    return () => { try { sh.remove(); } catch {} };
  }, []);
  const pickMedia = async (mode: 'image'|'video'|'all') => {
    try {
      try { await (ImagePicker as any).requestMediaLibraryPermissionsAsync?.(); } catch {}
      const IP: any = ImagePicker as any;
      const mediaTypes = IP.MediaTypeOptions?.[mode==='image'?'Images':mode==='video'?'Videos':'All'] || IP.MediaTypeOptions.All;
      const allowsMultiple = mode !== 'video';
      const res: any = await IP.launchImageLibraryAsync?.({
        mediaTypes,
        allowsMultipleSelection: allowsMultiple,
        // 한 번에 너무 많은 선택은 방지 (이미지/앨범 기준 최대 10장)
        selectionLimit: allowsMultiple ? 10 : 1,
        quality: mode==='image' ? 0.8 : 1,
        base64: false,
        exif: false,
      });
      if (!res || res.canceled || !Array.isArray(res.assets) || res.assets.length === 0) return;
      const assets: Array<{ uri: string; type?: string }> = res.assets.map((a: any) => ({ uri: String(a?.uri||''), type: a?.type }));
      // 이미지: 여러 장이면 앨범 또는 개별 이미지로 전송, 1장이면 단일 이미지
      if (mode !== 'video') {
        const images = assets.filter(a => !String(a.type||'').includes('video'));
        if (images.length > 1) {
          const urls = images.map(a => String(a.uri));
          // 앨범 타입으로 한 번에 묶어서 전송
          sendMessage(roomId, uid, '', 'album', undefined, undefined, urls);
        } else if (images.length === 1) {
          sendMessage(roomId, uid, '', 'image', String(images[0].uri));
        }
      }
      // 비디오: 선택된(또는 강제) 비디오 각각 전송
      const videos = assets.filter(a => String(a.type||'').includes('video') || mode==='video');
      for (const v of videos) {
        if (v?.uri) sendMessage(roomId, uid, '[video]', 'video', String(v.uri));
      }
    } catch {}
    setAttachOpen(false);
  };
  const pickFile = async () => {
    try {
      const out: any = await (DocumentPicker as any).getDocumentAsync({ copyToCacheDirectory: true });
      if (out && out.assets && out.assets[0]?.uri) {
        const u = String(out.assets[0].uri);
        sendMessage(roomId, uid, out.assets[0].name || '[file]', 'file', u);
      }
    } catch {}
    setAttachOpen(false);
  };
  const sendLocation = async () => {
    try {
      const { status } = await (Location as any).requestForegroundPermissionsAsync?.();
      if (status !== 'granted') { setAttachOpen(false); return; }
      const pos = await (Location as any).getCurrentPositionAsync?.({});
      const lat = pos?.coords?.latitude; const lng = pos?.coords?.longitude;
      if (lat && lng) {
        const url = `https://maps.google.com/?q=${encodeURIComponent(String(lat)+','+String(lng))}`;
        // 도로명 주소 역지오코딩 (OS 제공)
        let pretty = '';
        try {
          const addr = await (Location as any).reverseGeocodeAsync?.({ latitude: Number(lat), longitude: Number(lng) });
          if (Array.isArray(addr) && addr[0]) {
            const a = addr[0] as any;
            const city = String(a.subregion || a.city || a.district || '').trim();
            const region = String(a.region || '').trim();
            const country = String(a.country || '').trim();
            let street = String(a.street || '').trim();
            let streetNo = '';
            let nameLine = String(a.name || '').trim();
            if (!street && nameLine) {
              const m = nameLine.match(/^([\p{L}\s\.\-]+?)\s+(\d[\d\-]*)$/u);
              if (m) {
                street = m[1].trim();
                streetNo = m[2].trim();
              }
            }
            if (!streetNo) {
              const n = (a.streetNumber ?? '').toString().trim();
              if (/^\d+([-\s]?\d+)?$/.test(n)) streetNo = n;
            }
            const roadWithNo = [street, streetNo].filter(Boolean).join(' ').trim();
            pretty = [country, region, city, roadWithNo].filter(Boolean).join(' ').replace(/\s+/g, ' ');
          }
        } catch {}
        const addrLine = (pretty || `${lat}, ${lng}`).trim();
        // 1) 도로명 주소 텍스트 말풍선
        try { sendMessage(roomId, uid, addrLine, 'text'); } catch {}
        // 2) 지도 링크 말풍선 (썸네일/미리보기 팝업은 LinkPreviewBox/ChatViewer가 처리)
        try { sendMessage(roomId, uid, url, 'text'); } catch {}
      }
    } catch {}
    setAttachOpen(false);
  };
  // QR: 이미지 선택 후 링크 주소를 함께 보낼 수 있도록 간단 입력 모달 지원
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrImageUri, setQrImageUri] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string>('');
  const sendQR = async () => {
    try {
      try { await (ImagePicker as any).requestMediaLibraryPermissionsAsync?.(); } catch {}
      const IP: any = ImagePicker as any;
      const res: any = await IP.launchImageLibraryAsync?.({ mediaTypes: IP.MediaTypeOptions.Images, allowsMultipleSelection: false, selectionLimit: 1, quality: 0.95, base64: false, exif: false });
      if (res && !res.canceled && Array.isArray(res.assets) && res.assets[0]?.uri) {
        const uri = String(res.assets[0].uri);
        let detected = '';
        
        // 1) ML Kit 시도 (가장 안정적)
        try {
          const { scanBarcodes, BarcodeFormat } = require('@react-native-ml-kit/barcode-scanning');
          const FS = require('expo-file-system');
          // content:// 또는 ph:// URI를 file:// URI로 복사
          let scanTarget = uri;
          if (/^(content|ph):\/\//i.test(uri) && FS?.cacheDirectory) {
            const dest = `${FS.cacheDirectory}qr_mlkit_${Date.now()}.jpg`;
            await FS.copyAsync({ from: uri, to: dest });
            scanTarget = dest;
          }
          console.log('[sendQR] ML Kit scanTarget:', scanTarget);
          const formats = BarcodeFormat?.QR_CODE ? [BarcodeFormat.QR_CODE] : undefined;
          const out = formats ? await scanBarcodes(scanTarget, formats) : await scanBarcodes(scanTarget);
          console.log('[sendQR] ML Kit result:', out);
          const first = Array.isArray(out) && out.length ? out[0] : null;
          detected = String(first?.displayValue || first?.rawValue || '');
        } catch (e) {
          console.warn('[sendQR] ML Kit error:', e);
        }
        
        // 2) ML Kit 실패 시 scanQRFromImage 유틸 사용
        if (!detected) {
          try {
            const { scanQRFromImage } = require('@/lib/qrScanner');
            detected = await scanQRFromImage(uri) || '';
            console.log('[sendQR] scanQRFromImage result:', detected);
          } catch (e) {
            console.warn('[sendQR] scanQRFromImage error:', e);
          }
        }
        
        // 이미지 먼저 전송 (QR 이미지)
        try { sendMessage(roomId, uid, '[QR 이미지]', 'image', uri); } catch {}
        
        // URL 인식 결과 전송
        if (detected) {
          try { sendMessage(roomId, uid, detected, 'text'); } catch {}
        } else {
          try { Alert.alert('QR', 'QR 인식에 실패했습니다. 이미지만 전송했습니다.'); } catch {}
        }
      }
    } catch (e) {
      console.error('[sendQR] error:', e);
    }
    setAttachOpen(false);
  };
  // 투표 만들기 모달 상태
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState<string>('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMulti, setPollMulti] = useState<boolean>(false);
  const openPoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollMulti(false);
    setPollOpen(true);
    setAttachOpen(false);
  };
  const sendPoll = () => {
    try {
      const opts = pollOptions.map(s => String(s||'').trim()).filter(Boolean);
      const question = String(pollQuestion||'').trim();
      if (!question) { Alert.alert('투표', '질문을 입력하세요.'); return; }
      if (opts.length < 2) { Alert.alert('투표', '항목을 2개 이상 입력하세요.'); return; }
      const options = opts.map((text, idx) => ({ id: `op-${Date.now()}-${idx}`, text }));
      const poll = {
        question,
        options,
        votes: {} as Record<string, string[]>,
        multi: !!pollMulti,
        createdAt: Date.now(),
      };
      sendMessage(roomId, uid, `POLL:${JSON.stringify(poll)}`, 'poll');
      setPollOpen(false);
    } catch {}
  };

  const onSend = async () => {
    const raw = String(text || '');
    const val = raw.trim();
    if (!val || sending) return;
    // 같은 내용을 너무 빨리 여러 번 누르는 경우, 1초 이내 중복은 무시
    const now = Date.now();
    const last = lastSentRef.current;
    if (last && last.value === val && now - last.ts < 1000) {
      return;
    }
    lastSentRef.current = { value: val, ts: now };
    setSending(true);
    setText('');
    try {
      await Promise.resolve(sendMessage(roomId, uid, val, 'text'));
      try { listRef.current?.scrollToEnd?.({ animated: true }); } catch {}
    } finally {
      setSending(false);
    }
  };

  const VideoThumb: React.FC<{ uri: string }> = ({ uri }) => {
    const [thumb, setThumb] = React.useState<string | null>(() => videoThumbCacheRef.current[uri] || null);
    React.useEffect(() => {
      let alive = true;
      (async () => {
        // 캐시 우선
        const cached = videoThumbCacheRef.current[uri];
        if (cached) { setThumb(cached); return; }
        // 1차: expo-video-thumbnails
        try {
          const out: any = await (VideoThumbnails as any).getThumbnailAsync(String(uri), { time: 700 });
          if (alive && out?.uri) {
            videoThumbCacheRef.current[uri] = String(out.uri);
            setThumb(String(out.uri));
            return;
          }
        } catch {}
        // 2차: react-native-create-thumbnail (있을 때만)
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const RNCT = require('react-native-create-thumbnail');
          if (RNCT?.createThumbnail) {
            const out = await RNCT.createThumbnail({ url: String(uri), timeStamp: 1000 });
            const p = out?.path || out?.url;
            if (alive && p) {
              videoThumbCacheRef.current[uri] = String(p);
              setThumb(String(p));
              return;
            }
          }
        } catch {}
        // 실패 시 그대로 플레이 아이콘만 표시
      })();
      return () => { alive = false; };
    }, [uri]);
    return (
      <View style={{ width: 220, height: 220, borderRadius: 10, overflow:'hidden', backgroundColor:'#111', alignItems:'center', justifyContent:'center' }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ width:'100%', height:'100%' }} /> : null}
        <View style={{ position:'absolute', right:8, bottom:8, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:12, paddingHorizontal:8, paddingVertical:4 }}>
          <Text style={{ color:'#FFF', fontWeight:'800' }}>▶</Text>
        </View>
      </View>
    );
  };

  const fileIcon = (ext: string) => {
    const label = (ext||'FILE').toUpperCase().slice(0,6);
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='120'><rect width='100%' height='100%' fill='%23f7f7f7'/><rect x='0' y='0' width='120' height='120' fill='%23151515'/><text x='60' y='68' dominant-baseline='middle' text-anchor='middle' fill='%23FFD700' font-size='28' font-weight='900'>${label}</text></svg>`;
  };

  // 비디오 썸네일 메모리 캐시(플리커 방지)
  const videoThumbCacheRef = useRef<Record<string, string>>({});

  // 미리보기 뷰어 상태
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerKind, setViewerKind] = useState<'image'|'video'|'web'|'youtube'|'map'|'pdf'>('image');
  const [viewerList, setViewerList] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [viewerMsgId, setViewerMsgId] = useState<string | null>(null);
  // 미리보기 헤더 표시(발신자/시간/아바타)
  const [viewerTitle, setViewerTitle] = useState<string>('');
  const [viewerHeaderTs, setViewerHeaderTs] = useState<number | undefined>(undefined);
  const [viewerHeaderAvatar, setViewerHeaderAvatar] = useState<string | undefined>(undefined);

  // 입장 알림: 새 멤버 감지 → 알림 스토어 + 토스트
  const prevMembersRef = useRef<Set<string>>(new Set<string>(memberIds || []));
  const [joinToast, setJoinToast] = useState<string>('');
  useEffect(() => {
    try {
      const prev = prevMembersRef.current;
      const curr = new Set<string>((memberIds || []).map(String));
      // 추가된 멤버
      const added: string[] = [];
      curr.forEach((id) => { if (!prev.has(id)) added.push(id); });
      prevMembersRef.current = curr;
      if (added.length === 0) return;
      // 자신 제외
      const others = added.filter(id => String(id) !== String(uid));
      if (others.length === 0) return;
      // 프로필에서 이름 가져오기
      const store = require('@/src/features/chat/store/chat-profile.store');
      const getProf = (id: string) => {
        try { return store.useChatProfileStore.getState().getProfile?.(id) || null; } catch { return null; }
      };
      const names = others.map(id => (getProf(id)?.chatName || getProf(id)?.displayName || id));
      const msg = names.length === 1 ? `${names[0]} 님이 입장했습니다` : `${names.join(', ')} 님이 입장했습니다`;
      // 방 입장은 쪽지 알림 대신, 화면 내 토스트만 표시
      setJoinToast(msg);
      const t = setTimeout(() => { try { setJoinToast(''); } catch {} }, 3000);
      return () => { try { clearTimeout(t); } catch {} };
    } catch {}
  // stringify로 안정 비교
  }, [JSON.stringify(memberIds||[]), roomId, uid]);

  // 링크 미리보기(카카오톡 스타일 간단 버전)
  const linkPreviewCacheRef = useRef<Record<string, { url: string; title?: string; description?: string; image?: string }>>({});
  const LinkPreviewBox: React.FC<{ url: string }> = ({ url }) => {
    const [data, setData] = React.useState<{ url: string; title?: string; description?: string; image?: string } | null>(() => linkPreviewCacheRef.current[url] || null);
    React.useEffect(() => {
      let alive = true;
      (async () => {
        try {
          if (linkPreviewCacheRef.current[url]) { setData(linkPreviewCacheRef.current[url]); return; }
          // 3초 타임아웃
          const controller = new AbortController();
          const tid = setTimeout(() => { try { controller.abort(); } catch {} }, 3000);
          const resp = await fetch(url, { method: 'GET', signal: (controller as any).signal });
          clearTimeout(tid);
          const html = await resp.text();
          const pick = (re: RegExp) => {
            const m = re.exec(html);
            return m && m[1] ? String(m[1]).trim() : undefined;
          };
          const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) || pick(/<title[^>]*>([^<]+)<\/title>/i);
          const ogDesc = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) || pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
          let ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
          try { if (ogImage) ogImage = new URL(ogImage, url).toString(); } catch {}
          // YouTube 썸네일 보강
          if (!ogImage && /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.test(url)) {
            const vid = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(url)?.[1];
            if (vid) ogImage = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
          }
          const out = { url, title: ogTitle, description: ogDesc, image: ogImage };
          linkPreviewCacheRef.current[url] = out;
          if (alive) setData(out);
        } catch {}
      })();
      return () => { alive = false; };
    }, [url]);
    // 데이터가 아직 없더라도 최소 카드(링크만) 표시
    if (!data) {
      const canOpenFallback = (!isTTLRoom) || (ttlSecurity?.allowExternalShare !== false);
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { try { if (canOpenFallback && url) require('expo-linking').openURL(url); else if (!canOpenFallback) Alert.alert('제한','외부 링크 열기가 제한된 방입니다.'); } catch {} }}
          style={{ width: 220, borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', marginTop: 8, borderWidth: 1, borderColor: '#E5E5EA' }}
        >
          <View style={{ padding: 8 }}>
            <Text numberOfLines={2} style={{ color:'#111', fontWeight:'800' }}>{url}</Text>
          </View>
        </TouchableOpacity>
      );
    }
    const canOpen = (!isTTLRoom) || (ttlSecurity?.allowExternalShare !== false);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { try { if (canOpen && data.url) require('expo-linking').openURL(data.url); else if (!canOpen) Alert.alert('제한','외부 링크 열기가 제한된 방입니다.'); } catch {} }}
        style={{ width: 220, borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', marginTop: 8, borderWidth: 1, borderColor: '#E5E5EA' }}
      >
        <View style={{ flexDirection: 'row' }}>
          {!!data.image && <Image source={{ uri: data.image }} style={{ width: 72, height: 72, backgroundColor: '#EEE' }} />}
          <View style={{ flex: 1, padding: 8, minHeight: 72, justifyContent: 'center' }}>
            {!!data.title && <Text numberOfLines={2} style={{ color:'#111', fontWeight:'800' }}>{data.title}</Text>}
            <Text numberOfLines={1} style={{ color:'#666', fontSize: 12, marginTop: 4 }}>{data.url}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  // 프로필 탭시 바로 상세로 이동

  const visibleIdsRef = React.useRef<Set<string>>(new Set());
  const MessageBubble = React.useMemo(() => React.memo(({ item, showHeader, isVisible }: { item: any; showHeader: boolean; isVisible: boolean }) => {
    const senderId = String(item?.senderId || '');
    const isMe = senderId === String(uid);
    const type = String(item?.type || 'text');
    // 상대방 프로필/대화명 표시용: Zustand hook으로 구독하여 변경 시 자동 반영
    const otherProfile = useChatProfileStore((s:any) => (isMe ? null : (s.profiles?.[senderId] || null)));
    // Firestore Timestamp도 안전하게 ms로 변환 (서버 메시지 자동삭제 실패 원인 보정)
    const createdAt = (() => {
      try {
        const v: any = item?.createdAt;
        if (typeof v === 'number') return Number(v);
        if (v?.toMillis) return Number(v.toMillis());
        if (typeof v?.seconds === 'number') {
          const ns = typeof v?.nanoseconds === 'number' ? Math.floor(v.nanoseconds / 1e6) : 0;
          return v.seconds * 1000 + ns;
        }
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : Date.now();
      } catch { return Date.now(); }
    })();
    // 로컬 카운트다운 상태(이 컴포넌트만 1초마다 업데이트 → 리스트 전체 리렌더 방지)
    const [remainMsLocal, setRemainMsLocal] = React.useState<number>(() => {
      const baseTtl = (String((room as any)?.type || '').toLowerCase() === 'ttl' && ttlMs > 0) ? ttlMs : 0;
      return baseTtl > 0 ? Math.max(0, createdAt + baseTtl - (Date.now() + (serverOffsetMs||0))) : 0;
    });
    React.useEffect(() => {
      const baseTtl = (String((room as any)?.type || '').toLowerCase() === 'ttl' && ttlMs > 0) ? ttlMs : 0;
      if (!(baseTtl > 0)) return;
      let alive = true;
      const tick = setInterval(() => {
        if (!alive) return;
        try {
          const now = Date.now() + (serverOffsetMs||0);
          const next = Math.max(0, (createdAt + baseTtl) - now);
          setRemainMsLocal(next);
          if (next <= 0 && item?.id) {
            clearInterval(tick);
            // 삭제는 한 번만 시도
            setTimeout(() => { try { removeMessage(roomId, String(item.id)); } catch {} }, 0);
          }
        } catch {}
      }, 1000);
      return () => { alive = false; try { clearInterval(tick); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, item?.id, createdAt, ttlMs, (room as any)?.type]);
    const remainMs = (isTTLRoom && ttlMs > 0) ? Math.max(0, createdAt + ttlMs - nowTick) : 0;
    return (
      <View style={{ marginBottom: 8 }}>
        {/* 프로필/대화명: 말풍선 밖 상단, 동일 발신자 연속이면 생략 */}
        {(!isMe && showHeader) ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: String(item?.senderId||''), name: String(otherProfile?.chatName || otherProfile?.displayName || '') } as any }); } catch {} }}
            style={{ flexDirection:'row', alignItems:'center', gap: 10, marginBottom: 6, paddingLeft: 4 }}
          >
            <View style={{ width:36, height:36, borderRadius:18, overflow:'hidden', backgroundColor:'#333', alignItems:'center', justifyContent:'center' }}>
              {!!otherProfile?.avatar
                ? <Image source={{ uri: String(otherProfile.avatar) }} style={{ width:'100%', height:'100%' }} />
                : <Text style={{ color:'#FFD700', fontWeight:'800' }}>{String(otherProfile?.chatName || otherProfile?.displayName || String(item?.senderId||'')).charAt(0)}</Text>}
            </View>
            <Text style={{ color:'#EDEDED', fontSize:15, fontWeight:'900' }}>
              {otherProfile?.chatName || otherProfile?.displayName || String(item?.senderId||'')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { try { openMsgMenu(item, isMe); } catch {} }}
          onLongPress={() => { try { openMsgMenu(item, isMe); } catch {} }}
          style={[
            styles.bubble,
            isMe ? [styles.meBubble, { backgroundColor: bubbleColorTheme }] : styles.otherBubble,
            (!isMe && showHeader) ? { marginLeft: 46 } : null // 아바타(36) + 간격(10)
          ]}
        >
        {(() => {
          if (type === 'image') {
            // imageUrl이 있으면 이미지 표시, 없으면 업로드 중 로딩 표시
            if (item?.imageUrl) {
              return (
                <TouchableOpacity activeOpacity={0.9} onPress={() => { try { setViewerList([]); setViewerMsgId(String(item?.id||'')); setViewerUrl(String(item.imageUrl)); setViewerKind('image'); setViewerOpen(true); } catch {} }}>
                  <Image source={{ uri: String(item.imageUrl) }} style={{ width: 220, height: 220, borderRadius: 10 }} />
                </TouchableOpacity>
              );
            }
            // imageUrl이 아직 없는 경우 (업로드 중)
            return (
              <View style={{ width: 220, height: 160, borderRadius: 10, backgroundColor: '#2A2A2A', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FFD700" />
                <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>이미지 업로드 중...</Text>
              </View>
            );
          }
          // text 내에 map JSON이 온 경우에도 지도 버블로 렌더링
          if (type === 'text') {
            try {
              const rawText = String(item?.content || '');
              const j = JSON.parse(rawText);
              if (j && (j.lat != null) && (j.lng != null) && (j.url || (typeof j.address === 'string'))) {
                const mapUrl = String(j.url || `https://maps.google.com/?q=${encodeURIComponent(String(j.lat)+','+String(j.lng))}`);
                const roadWithNo = [String(j.street||'').trim(), String(j.streetNo||'').trim()].filter(Boolean).join(' ');
                const address =
                  String(j.display || j.address || [String(j.country||'').trim(), String(j.region||'').trim(), String(j.city||'').trim(), roadWithNo].filter(Boolean).join(' '));
                return (
                  <View style={{ width: 240 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => { try { if (mapUrl) require('expo-linking').openURL(mapUrl); } catch {} }}
                      style={{ flexDirection:'row', alignItems:'flex-start', gap:6 }}
                    >
                      <Text style={{ color:'#B71C1C' }}>📍</Text>
                      <Text style={{ color:'#0C0C0C', fontWeight:'900', textDecorationLine:'underline' }}>{address}</Text>
                    </TouchableOpacity>
                    <View style={{ marginTop:8 }}>
                      <LinkPreviewBox url={mapUrl} />
                    </View>
                  </View>
                );
              }
            } catch {}
            // JSON.parse 실패 시에도 address만 추출(정규식)
            try {
              const txt = String(item?.content || '');
              const mAddr = /"address"\s*:\s*"([^"]+)"/.exec(txt);
              const mLat = /"lat"\s*:\s*([0-9.\-]+)/.exec(txt);
              const mLng = /"lng"\s*:\s*([0-9.\-]+)/.exec(txt);
              const mUrl = /"url"\s*:\s*"(https?:[^"]+)"/.exec(txt);
              if (mAddr) {
                const address = mAddr[1];
                const mapUrl = mUrl ? mUrl[1] : ((mLat && mLng) ? `https://maps.google.com/?q=${encodeURIComponent(`${mLat[1]},${mLng[1]}`)}` : '');
                return (
                  <View style={{ width: 240 }}>
                    <View style={{ flexDirection:'row', alignItems:'flex-start', gap:6 }}>
                      <Text style={{ color:'#B71C1C' }}>📍</Text>
                      <Text style={{ color:'#0C0C0C', fontWeight:'900', textDecorationLine:'underline' }}>{address}</Text>
                    </View>
                    {!!mapUrl && <View style={{ marginTop:8 }}><LinkPreviewBox url={mapUrl} /></View>}
                  </View>
                );
              }
            } catch {}
          }
          if (type === 'album' && Array.isArray(item?.albumUrls) && item.albumUrls.length) {
            const urls: string[] = item.albumUrls.filter((u:string)=> !!u).map((u:string)=> String(u));
            const thumbSize = 108; // (220 - 4) / 2
            return (
              <View style={{ width: 220, borderRadius:10, overflow:'hidden' }}>
                <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
                  {urls.map((u, idx) => (
                    <TouchableOpacity key={`${u}-${idx}`} activeOpacity={0.9} onPress={() => { try { setViewerList(urls); setViewerIndex(idx); setViewerMsgId(String(item?.id||'')); setViewerUrl(urls[idx]); setViewerKind('image'); setViewerOpen(true); } catch {} }} style={{ marginRight: (idx % 2 === 0) ? 4 : 0, marginBottom: 4 }}>
                      <Image source={{ uri: u }} style={{ width: thumbSize, height: thumbSize }} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          }
          if (type === 'video') {
            const hasUrl = !!item?.imageUrl;
            const thumbUri = hasUrl ? String(item.imageUrl) : '';
            return (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  try {
                    if (!hasUrl) { Alert.alert('영상 준비 중', '영상 업로드가 완료되면 자동으로 재생할 수 있습니다.'); return; }
                    setViewerList([]); setViewerMsgId(String(item?.id||'')); setViewerUrl(String(item.imageUrl)); setViewerKind('video'); setViewerOpen(true);
                  } catch {}
                }}
              >
                {hasUrl
                  ? <VideoThumb uri={thumbUri} />
                  : (
                    <View style={{ width: 220, height: 160, borderRadius: 10, backgroundColor:'#000', alignItems:'center', justifyContent:'center' }}>
                      <Text style={{ color:'#FFF', fontSize:32 }}>▶</Text>
                    </View>
                  )}
              </TouchableOpacity>
            );
          }
          if (type === 'poll') {
            // 간단 투표 렌더러 (POLL:JSON)
            const raw = String(item?.content||'');
            const json = (() => { try { return JSON.parse(raw.replace(/^POLL:/,'')); } catch { return null; } })();
            if (!json) return <Text style={{ color:'#0C0C0C' }}>[잘못된 투표]</Text>;
            const question = String(json.question||'투표');
            const options: Array<{ id:string; text:string }> = Array.isArray(json.options)? json.options : [];
            const votes: Record<string,string[]> = json.votes || {};
            const myUid = String(uid);
            const hasVoted = Object.values(votes||{}).some((arr)=> Array.isArray(arr) && arr.includes(myUid));
            const total = Object.values(votes||{}).reduce((acc, arr)=> acc + (Array.isArray(arr)? arr.length : 0), 0);
            const onVote = async (optionId: string) => {
              try {
                // 로컬 업데이트
                const nextVotes: Record<string, string[]> = { ...(votes||{}) };
                if (!Array.isArray(nextVotes[optionId])) nextVotes[optionId] = [];
                if (json.multi) {
                  // 복수 선택: 토글
                  if (nextVotes[optionId].includes(myUid)) {
                    nextVotes[optionId] = nextVotes[optionId].filter(u => u !== myUid);
                  } else {
                    nextVotes[optionId].push(myUid);
                  }
                } else {
                  // 단일 선택: 기존 표 제거 후 추가
                  Object.keys(nextVotes).forEach(k => { nextVotes[k] = (nextVotes[k]||[]).filter(u => u !== myUid); });
                  nextVotes[optionId].push(myUid);
                }
                const next = { ...json, votes: nextVotes };
                (useKakaoRoomsStore as any).getState().updateMessage?.(roomId, String(item?.id||''), { content: `POLL:${JSON.stringify(next)}` });
                // 서버 반영
                try {
                  const { doc, updateDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
                  const mref = doc((await import('@/lib/firebase')).firestore, 'rooms', roomId, 'messages', String(item?.id||''));
                  await updateDoc(mref, { content: `POLL:${JSON.stringify(next)}`, updatedAt: serverTimestamp() } as any).catch(async()=>{ try { await setDoc(mref, { content: `POLL:${JSON.stringify(next)}`, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
                } catch {}
              } catch {}
            };
            return (
              <View style={{ width: 240 }}>
                <Text style={{ color:'#0C0C0C', fontWeight:'900', marginBottom:6 }}>{question}</Text>
                {options.map((op) => {
                  const count = Array.isArray((votes||{})[op.id]) ? (votes[op.id].length) : 0;
                  const pct = total>0 ? Math.round((count/total)*100) : 0;
                  const picked = Array.isArray((votes||{})[op.id]) && (votes[op.id].includes(myUid));
                  return (
                    <TouchableOpacity key={op.id} onPress={()=> onVote(op.id)} activeOpacity={0.85} style={{ marginVertical:4, borderWidth:1, borderColor: picked? '#0C0C0C' : '#C8B46A', borderRadius:8, overflow:'hidden' }}>
                      <View style={{ backgroundColor: picked? '#F4E19A':'#FFF' }}>
                        <View style={{ width: `${pct}%`, backgroundColor:'#FFE082', height: 8 }} />
                        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:10, paddingVertical:8 }}>
                          <Text style={{ color:'#0C0C0C', fontWeight:'800' }}>{op.text}</Text>
                          <Text style={{ color:'#0C0C0C' }}>{count}{total>0?` (${pct}%)`:''}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          }
          if (type === 'file') {
            const refForExt = String(item.imageUrl || item.content || '');
            const ext = (() => { try { const m = /\\.([a-z0-9]{1,8})(?:\\?|#|$)/i.exec(refForExt); return (m?.[1]||'file'); } catch { return 'file'; } })();
            const icon = fileIcon(ext);
            const hasUrl = !!item.imageUrl;
            return (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  try {
                    if (!hasUrl) {
                      Alert.alert('파일 준비 중', '파일 업로드가 완료되면 미리보기를 열 수 있습니다.');
                      return;
                    }
                    const lower = String(item.imageUrl || '').toLowerCase();
                    if (lower.endsWith('.pdf') || /(?:^|\\.|\\?)pdf(?:$|[&#])/i.test(lower)) { setViewerList([]); setViewerMsgId(String(item?.id||'')); setViewerUrl(String(item.imageUrl)); setViewerKind('pdf'); setViewerOpen(true); }
                    else { setViewerList([]); setViewerMsgId(String(item?.id||'')); setViewerUrl(String(item.imageUrl)); setViewerKind('web'); setViewerOpen(true); }
                  } catch {}
                }}
              >
                <View style={{ width: 220, borderRadius: 10, overflow:'hidden', backgroundColor:'#FFF' }}>
                  <Image source={{ uri: icon }} style={{ width: 220, height: 120 }} />
                  <View style={{ padding:8 }}>
                    <Text style={{ color:'#111', fontWeight:'700' }} numberOfLines={2}>{String(item?.content||'파일')}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }
          // yooy:// URL이 포함되어 있으면 클릭 가능한 링크로 렌더링
          const content = String(item?.content || '');
          const yooyMatch = content.match(/yooy:\/\/[^\s]+/i);
          if (yooyMatch) {
            const url = yooyMatch[0];
            const idx = content.indexOf(url);
            const before = content.slice(0, idx);
            const after = content.slice(idx + url.length);
            return (
              <Text style={[styles.bubbleText, { fontSize: bodyFont, lineHeight: bodyFont + 4 }, isMe ? { color:'#0C0C0C' } : { color:'#0C0C0C' }]}>
                {before}
                <Text style={{ color:'#1E90FF', textDecorationLine:'underline' }} onPress={() => { try { require('expo-linking').openURL(url); } catch {} }}>{url}</Text>
                {after}
              </Text>
            );
          }
          return <Text style={[styles.bubbleText, { fontSize: bodyFont, lineHeight: bodyFont + 4 }, isMe ? { color:'#0C0C0C' } : { color:'#0C0C0C' }]}>{content}</Text>;
        })()}
        {(() => {
          try {
            // 지도 버튼: 구글 맵 링크일 때 "지도 열기" 버튼 제공
            const text = String(item?.content || '');
            // text가 map JSON이면 여기서는 추가 렌더를 하지 않음(윗부분에서 지도 버블로 처리됨)
            try {
              const j = JSON.parse(text);
              if (j && (j.lat != null) && (j.lng != null)) return null;
            } catch {}
            if (/https?:\/\/(?:maps\.google\.[^\/]+|goo\.gl)\/\?q=/i.test(text) || /https?:\/\/maps\.google\.[^\/]+\/\?q=/i.test(text)) {
              const m = text.match(/https?:\/\/[^\s]+/i);
              const mapUrl = m && m[0] ? m[0] : null;
              if (mapUrl) {
                return (
                  <TouchableOpacity onPress={()=>{ try { require('expo-linking').openURL(mapUrl); } catch {} }} style={{ marginTop:8, alignSelf:'flex-start', backgroundColor:'#FFD700', paddingHorizontal:10, paddingVertical:6, borderRadius:8 }}>
                    <Text style={{ color:'#0C0C0C', fontWeight:'900' }}>지도 열기</Text>
                  </TouchableOpacity>
                );
              }
            }
            // 일반 링크 미리보기
            if (type !== 'text') return null;
            const m = text.match(/https?:\/\/[^\s]+/i);
            const firstUrl = m && m[0] ? m[0] : null;
            if (!firstUrl) return null;
            return <LinkPreviewBox url={firstUrl} />;
          } catch { return null; }
        })()}
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
          {/* TTL 남은시간 배지(메시지별 삭제 타이머) - 로컬 카운트다운 사용 */}
          {(() => {
            if (!(ttlMs > 0 && remainMsLocal > 0)) return <View />;
            const totalSec = Math.floor(remainMsLocal / 1000);
            const dd = Math.floor(totalSec / (24 * 3600));
            const hh = Math.floor((totalSec % (24 * 3600)) / 3600);
            const mm = Math.floor((totalSec % 3600) / 60);
            const ss = totalSec % 60;
            let label = '';
            if (dd > 0) label = `${String(dd).padStart(2,'0')} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
            else if (hh > 0) label = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
            else if (mm > 0) label = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
            else label = `${String(ss).padStart(2,'0')}s`;
            return (
              <View style={{ backgroundColor:'#E53935', paddingHorizontal:6, paddingVertical:2, borderRadius:10 }}>
                <Text style={{ color:'#FFFFFF', fontSize:10, fontWeight:'800' }}>{label}</Text>
              </View>
            );
          })()}
          {/* 보낸 시각 */}
          <Text style={[styles.timeText, { fontSize: timeFont }]}>{new Date(createdAt).toLocaleTimeString()}</Text>
        </View>
        {/* 읽지않음 수 표시(가능한 경우) */}
        {(() => {
          try {
            const readBy = Array.isArray((item as any)?.readBy) ? (item as any).readBy : [];
            const unread = Math.max(0, participantCount - readBy.length);
            if (unread <= 0) return null;
            return (
              <View style={[{ position:'absolute', bottom:8, backgroundColor:'#E53935', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }, isMe ? { left: -24 } : { right: -24 }]}>
                <Text style={{ color:'#FFF', fontSize:10, fontWeight:'800' }}>{unread}</Text>
              </View>
            );
          } catch { return null; }
        })()}
        </TouchableOpacity>
        {/* 연속 메시지일 때도 왼쪽 36x36 영역을 탭하면 프로필로 이동 가능하게 히트영역 추가 */}
        {(!isMe && !showHeader) ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { try { router.push({ pathname: '/chat/friend-profile', params: { id: senderId, name: String(otherProfile?.chatName || otherProfile?.displayName || '') } as any }); } catch {} }}
            style={{ position:'absolute', left: 4, top: 0, width: 36, height: 36 }}
          />
        ) : null}
      </View>
    );
  }), [uid, room, ttlSecurity, bubbleColorTheme, bodyFont, timeFont, ttlMs, serverOffsetMs]);

  const renderItem = React.useCallback(({ item, index }: any) => {
    try {
      const isMe = String(item?.senderId || '') === String(uid);
      const prev = index > 0 ? filteredMessages[index - 1] : null;
      const prevSender = prev ? String(prev?.senderId || '') : '';
      const curSender = String(item?.senderId || '');
      const showHeader = !isMe && prevSender !== curSender;
      const isVisible = visibleIdsRef.current.has(String(item?.id || ''));
      return <MessageBubble item={item} showHeader={showHeader} isVisible={isVisible} />;
    } catch {
      return <MessageBubble item={item} showHeader={true} isVisible={true} />;
    }
  }, [MessageBubble, filteredMessages, uid]);

  // ---- RoomSettingsModal local state (must be declared unconditionally to keep hook order) ----
  const modalRoomType = React.useMemo(() => {
    const t = String((room as any)?.type || '').toUpperCase();
    return (t === 'TTL' ? 'TTL' : 'NORMAL') as 'NORMAL' | 'TTL';
  }, [room]);
  const modalDefault = React.useMemo(() => (
    createDefaultRoomSettings({ roomId, roomType: modalRoomType, ownerUserId: String((room as any)?.createdBy || uid) })
  ), [roomId, modalRoomType, uid]);
  const [modalSettings, setModalSettings] = React.useState(modalDefault);
  React.useEffect(() => {
    if (!settingsOpen) return;
    (async () => {
      try {
        const saved: any = await loadRoomSettings(roomId);
        const base = createDefaultRoomSettings({ roomId, roomType: modalRoomType, ownerUserId: String(uid) });
        const merged: typeof base = {
          ...base,
             basic: {
               ...base.basic,
               ...(saved?.basic || {}),
               title: String((room as any)?.title || base.basic.title),
               imageUrl: String((room as any)?.avatarUrl || (room as any)?.image || (saved?.basic?.imageUrl || '')) || null,
               tags: Array.isArray((room as any)?.tags) ? (room as any).tags : (saved?.basic?.tags || []),
               isPublic: typeof (room as any)?.isPublic === 'boolean' ? !!(room as any).isPublic : (saved?.basic?.isPublic ?? base.basic.isPublic),
             },
          members: {
            ...base.members,
            ...(saved?.members || {}),
            ownerUserId: String((saved?.members?.ownerUserId) || (room as any)?.createdBy || base.members.ownerUserId),
            participantUserIds: Array.isArray(memberIds) ? [...memberIds] : (base.members.participantUserIds || []),
          },
          permissions: { ...base.permissions, ...(saved?.permissions || {}) },
          notifications: { ...base.notifications, ...(saved?.notifications || {}) },
          theme: { ...base.theme, ...(saved?.theme || {}) },
          ttl: modalRoomType === 'TTL'
            ? { ...base.ttl, ...(saved?.ttl || {}), expiresAtMs: Number(roomExpireAt || base.ttl.expiresAtMs) }
            : base.ttl,
        };
        setModalSettings(merged);
      } catch {
        setModalSettings(modalDefault);
      }
    })();
    // include memberIds and room expiry to refresh when opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, roomId, modalRoomType, JSON.stringify(memberIds), room, roomExpireAt]);
  const onModalChange = React.useCallback((partial: Partial<typeof modalSettings>) => {
    setModalSettings(prev => ({
      ...prev,
      ...partial,
      basic: { ...prev.basic, ...(partial as any).basic },
      members: { ...prev.members, ...(partial as any).members },
      permissions: { ...prev.permissions, ...(partial as any).permissions },
      notifications: { ...prev.notifications, ...(partial as any).notifications },
      theme: { ...prev.theme, ...(partial as any).theme },
      ttl: { ...prev.ttl, ...(partial as any).ttl },
    }));
  }, []);

  // roomId 없거나 비정상인 경우도 안전 처리
  if (!roomId) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.roomTitleBar, { paddingTop: 0 }]}>
          <TouchableOpacity style={styles.roomLeaveBtn} onPress={() => { try { router.push('/chat/rooms'); } catch {} }}>
            <Text style={styles.roomLeaveText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.roomTitleText}>대화방</Text>
        </View>
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <Text style={{ color:'#999' }}>방 정보가 없습니다</Text>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: bgColorTheme }]}>
      {!!bgImage && (
        <ImageBackground source={{ uri: bgImage }} style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }} imageStyle={{ opacity:0.22 }} />
      )}
      <View style={[styles.roomTitleBar, { paddingTop: 0 }]}>
        <TouchableOpacity
          style={styles.roomLeaveBtn}
          onPress={() => { try { router.push('/chat/rooms'); } catch {} }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.roomLeaveText}>←</Text>
        </TouchableOpacity>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          {(() => {
            try {
              if (String((room as any)?.type || '') !== 'dm') return null;
              const members: string[] = Array.isArray((room as any)?.members) ? (room as any).members as string[] : [];
              const otherId = members.find((u) => String(u) !== String(uid));
              if (!otherId) return null;
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const store = require('@/src/features/chat/store/chat-profile.store');
              const p = store.useChatProfileStore.getState().profiles?.[otherId];
              return (
                <>
                  <View style={{ width:22, height:22, borderRadius:11, overflow:'hidden', backgroundColor:'#333' }}>
                    {p?.avatar ? <Image source={{ uri: String(p.avatar) }} style={{ width:'100%', height:'100%' }} /> : null}
                  </View>
                  <Text style={styles.roomTitleText}>{p?.chatName || p?.displayName || otherId}</Text>
                </>
              );
            } catch {
              return <Text style={styles.roomTitleText}>{String((room as any)?.title || t('chatRoom', language) || '대화방')}</Text>;
            }
          })()}
          {String((room as any)?.type || '') !== 'dm' ? (
            <Text style={styles.roomTitleText}>{String((room as any)?.title || t('chatRoom', language) || '대화방')}</Text>
          ) : null}
        </View>
        <View style={{ flex:1 }} />
        {/* 상단 아이콘: 시계( TTL ), 사람(멤버), 설정(기본) */}
        {String((room as any)?.type || '').toUpperCase()==='TTL' && (
          <>
            <TouchableOpacity onPress={()=>{ try { setTtlModalOpen(true); } catch {} }} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Text style={{ color:'#FFD700', fontSize:16, fontWeight:'900' }}>🕒</Text>
            </TouchableOpacity>
            <View style={{ width:8 }} />
          </>
        )}
        <TouchableOpacity onPress={()=>{ try { setSettingsInitialTab('members'); setSettingsOpen(true); } catch {} }} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
          <Text style={{ color:'#FFD700', fontSize:16, fontWeight:'900' }}>👥</Text>
        </TouchableOpacity>
        <View style={{ width:8 }} />
        <TouchableOpacity onPress={()=>{ try { setSettingsInitialTab('basic'); setSettingsOpen(true); } catch {} }} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
          <Text style={{ color:'#FFD700', fontSize:16, fontWeight:'900' }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {(String((room as any)?.type || '').toUpperCase() === 'TTL' || roomExpireAt > 0) && (
        <TTLCountdownHeader
          roomType={'TTL'}
          expiresAtMs={roomExpireAt}
          onExpired={() => { try { router.push('/chat/rooms'); } catch {} }}
        />
      )}

      {/* 투표 만들기 모달 */}
      {pollOpen && (
        <Modal transparent animationType="fade" onRequestClose={()=> setPollOpen(false)}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center', justifyContent:'center' }}>
            <View style={{ width: 340, backgroundColor:'#0F0F0F', borderRadius:12, borderWidth:1, borderColor:'#2A2A2A', padding:12 }}>
              <Text style={{ color:'#F6F6F6', fontWeight:'900', fontSize:16, marginBottom:8 }}>투표 만들기</Text>
              <Text style={{ color:'#CFCFCF', fontSize:12, marginBottom:4 }}>질문</Text>
              <TextInput
                value={pollQuestion}
                onChangeText={setPollQuestion}
                placeholder="예: 저녁 메뉴는?"
                placeholderTextColor="#666"
                style={{ borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
              />
              <Text style={{ color:'#CFCFCF', fontSize:12, marginTop:10, marginBottom:4 }}>항목(최대 6개)</Text>
              {pollOptions.map((opt, idx) => (
                <View key={`opt-${idx}`} style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:6 }}>
                  <TextInput
                    value={opt}
                    onChangeText={(v)=> setPollOptions(prev => prev.map((s, i)=> i===idx? v : s))}
                    placeholder={`항목 ${idx+1}`}
                    placeholderTextColor="#666"
                    style={{ flex:1, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                  />
                  <TouchableOpacity onPress={()=> setPollOptions(prev => prev.length>2 ? prev.filter((_,i)=>i!==idx) : prev)} style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8 }}>
                    <Text style={{ color:'#CFCFCF' }}>삭제</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                <TouchableOpacity onPress={()=> setPollOptions(prev => prev.length<6 ? [...prev, ''] : prev)} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:10 }}>
                  <Text style={{ color:'#CFCFCF' }}>항목 추가</Text>
                </TouchableOpacity>
                <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                  <Text style={{ color:'#CFCFCF' }}>복수 선택</Text>
                  <Switch value={pollMulti} onValueChange={setPollMulti} />
                </View>
              </View>
              <View style={{ flexDirection:'row', justifyContent:'flex-end', gap:8, marginTop:12 }}>
                <TouchableOpacity onPress={()=> setPollOpen(false)} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:10 }}>
                  <Text style={{ color:'#CFCFCF' }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={sendPoll} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:10 }}>
                  <Text style={{ color:'#FFD700', fontWeight:'800' }}>보내기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {/* QR 링크 입력 모달 (기능은 자동 전송으로 대체됨) */}
      {/* 신규 방 설정 모달 (새 컴포넌트) */}
      {settingsOpen && (
        <RoomSettingsModal
          visible={true}
          onClose={()=> setSettingsOpen(false)}
          roomId={roomId}
          roomType={modalRoomType}
          settings={modalSettings}
          onChange={onModalChange}
          initialTab={settingsInitialTab}
          onSave={async()=>{
            // OPTIMIZED: Close modal immediately for instant feedback, save in background
            const s = modalSettings;
            setSettingsOpen(false);
            
            // Background save - don't block UI
            (async () => {
              try {
                const title = String(s.basic.title||'').trim();
                // 메타 업데이트: 제목/대표이미지/태그
                const meta: any = {};
                if (title && title !== (room as any)?.title) meta.title = title;
                if (s.basic.imageUrl) meta.avatarUrl = String(s.basic.imageUrl);
                if (Array.isArray(s.basic.tags)) meta.tags = s.basic.tags;
                if (Object.keys(meta).length) { await updateRoomMeta(roomId, meta); }
                // 공개/비공개 + 비밀번호
                await setRoomPrivacy(roomId, !!s.basic.isPublic, s.permissions.lockEnabled ? (s.permissions.lockPassword||'') : '');
                // 상세 설정 저장
                await saveRoomSettings(roomId, {
                  basic: {
                    description: s.basic.description||'',
                    participantLimit: s.basic.participantLimit ?? null,
                    tags: s.basic.tags||[],
                    imageUrl: s.basic.imageUrl||null,
                    isPublic: !!s.basic.isPublic,
                    title,
                  },
                  permissions: { lockEnabled: !!s.permissions.lockEnabled, lockPassword: s.permissions.lockPassword||'' } as any,
                  notifications: {
                    enabled: !!s.notifications.enabled,
                    keywordAlerts: s.notifications.keywordAlerts||[],
                    mentionAlertEnabled: !!s.notifications.mentionAlertEnabled,
                    mode: s.notifications.mode||'sound',
                  },
                  theme: {
                    bubbleColorHex: s.theme.bubbleColorHex||undefined,
                    backgroundColorHex: s.theme.backgroundColorHex||'#0C0C0C',
                    fontScaleLevel: s.theme.fontScaleLevel||3,
                    backgroundImageUrl: (s.theme as any).backgroundImageUrl,
                  } as any
                });
                if (modalRoomType === 'TTL' && (s.ttl?.expiresAtMs || 0) > 0) {
                  (useKakaoRoomsStore as any).getState().setRoomTTL?.(roomId, s.ttl.expiresAtMs);
                }
              } catch {}
            })();
          }}
          onLeave={async()=>{ try { await leaveRoom(roomId, uid); setSettingsOpen(false); router.push('/chat/rooms'); } catch {} }}
          onInvite={async()=>{ 
            try { 
              const res: any = await generateInvite(roomId);
              const deep = String(res?.deepLink || res?.deep || '');
              const code = String(res?.code || '');
              // 클립보드로 딥링크 복사
              try {
                const CB = (require('react-native').Clipboard) || require('@react-native-clipboard/clipboard');
                if (CB?.setString) CB.setString(deep || code);
              } catch {}
              // 안내
              Alert.alert(
                '초대',
                deep ? `링크가 복사되었습니다.\n\n${deep}` : (code ? `초대 코드가 복사되었습니다.\n\n${code}` : '초대 링크를 생성했습니다.'),
                [
                  { text: '닫기' },
                  deep ? { text: '열기', onPress: ()=>{ try { require('expo-linking').openURL(deep); } catch {} } } : undefined,
                ].filter(Boolean) as any
              );
            } catch {}
          }}
        />
      )}

      {/* TTL 설정 전용 모달 */}
      {ttlModalOpen && (
        <TTLSettingsModal
          visible={ttlModalOpen}
          onClose={()=> setTtlModalOpen(false)}
          onLeave={async()=>{ try { await leaveRoom(roomId, uid); setTtlModalOpen(false); router.push('/chat/rooms'); } catch {} }}
          roomType={String((room as any)?.type || '').toUpperCase()==='TTL' ? 'TTL' : 'NORMAL'}
          expiresAtMs={roomExpireAt}
          messageTtlMs={ttlMs}
          canEditSecurity={isPrivileged}
          onSetRoomTTL={async(target)=>{ try { (useKakaoRoomsStore as any).getState().setRoomTTL?.(roomId, target); } catch {} }}
          onSetMessageTTL={async(ms)=>{ 
            try { 
              // 1) 즉시 상단 room 값 반영(현재 방에 바로 적용)
              (useKakaoRoomsStore as any).getState().setMessageTTL?.(roomId, ms);
            } catch {}
            try {
              // 2) 설정에도 영구 저장하여 재입장/재로그인 후에도 TTL이 유지되도록
              await saveRoomSettings(roomId, { ttl: { messageTtlMs: Number(ms||0) } } as any);
            } catch {}
          }}
          security={modalSecurity}
          onSaveSecurity={async(sec)=>{
            try {
              await saveRoomSettings(roomId, { ttlSecurity: sec } as any);
            } catch {}
          }}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
      <FlatList
        ref={listRef}
        data={filteredMessages}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={10}
        windowSize={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={100}
        removeClippedSubviews={Platform.OS !== 'web'}
        onScroll={({ nativeEvent }) => {
          try {
            const y = Number(nativeEvent?.contentOffset?.y || 0);
            const h = Number(nativeEvent?.contentSize?.height || 0);
            const vh = Number(nativeEvent?.layoutMeasurement?.height || 0);
            const dist = Math.max(0, h - (y + vh));
            nearBottomRef.current = dist < 240; // 240px 이내면 바닥 근처로 간주(가변 높이 보정)
          } catch {}
        }}
        scrollEventThrottle={16}
        // 가시성 추적 → 미리보기/이미지 지연 로딩
        onViewableItemsChanged={({ viewableItems }) => {
          try {
            const setNew = new Set<string>();
            (viewableItems || []).forEach((vi:any) => { const id = String(vi?.item?.id || ''); if (id) setNew.add(id); });
            visibleIdsRef.current = setNew;
            // 화면에 메시지가 보이면 즉시 읽음 처리
            if ((viewableItems || []).length > 0) {
              try { if (roomId && uid) markRead?.(roomId, uid); } catch {}
            }
          } catch {}
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 25, minimumViewTime: 60 }}
        // 가변 높이 콘텐츠(링크/이미지/썸네일)로 인해 점프가 발생하여 근사 getItemLayout을 제거
        keyExtractor={(it:any, index:number)=> {
          try {
            if (it?.id) return String(it.id);
            if (it?.createdAt) return `t-${String(it.createdAt)}-${String(it?.senderId||'')}`;
          } catch {}
          return `idx-${index}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={styles.messagesContent}
        onLayout={() => { try { listRef.current?.scrollToEnd?.({ animated: false }); } catch {} }}
        onContentSizeChange={() => {
          try {
            if (!didAutoScrollRef.current) {
              listRef.current?.scrollToEnd?.({ animated: false });
              didAutoScrollRef.current = true;
            }
          } catch {}
        }}
        ListEmptyComponent={<View style={{ padding: 24, alignItems:'center' }}><Text style={{ color:'#777' }}>메시지가 없습니다</Text></View>}
      />
        <View style={[styles.inputContainer, { paddingBottom: keyboardOpen ? 4 : Math.max(insets.bottom, 6) }]}>
          <TouchableOpacity
            onPress={()=>{ try { onAttach(); } catch {} }}
            style={[styles.attachBtn, { width:36, height:36, borderRadius:18, backgroundColor:'#D4AF37', alignItems:'center', justifyContent:'center' }]}
            hitSlop={{ top:6, bottom:6, left:6, right:6 }}
          >
            <Text style={{ color:'#0C0C0C', fontWeight:'900', fontSize:18 }}>＋</Text>
          </TouchableOpacity>
          <View style={{ flex:1, flexDirection:'row', alignItems:'center', marginLeft:8, borderRadius:18, backgroundColor:'#111', borderWidth:1, borderColor:'#2A2A2A', paddingHorizontal:10 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={()=> setKeyboardOpen(true)}
              onBlur={()=> setKeyboardOpen(false)}
              onContentSizeChange={(e)=>{ try { const h=Math.min(120, Math.max(36, Math.ceil(e.nativeEvent?.contentSize?.height||36))); setInputHeight(h); } catch {} }}
              placeholder="메시지를 입력하세요..."
              placeholderTextColor="#777"
              style={[styles.input, { flex:1, marginLeft:0, marginRight:6, borderWidth:0, height: inputHeight, paddingVertical:8, backgroundColor:'transparent' }]}
              multiline
              blurOnSubmit={false}
              returnKeyType="send"
              onSubmitEditing={()=>{ if (Platform.OS==='ios') onSend(); }}
            />
            <TouchableOpacity
              onPress={onSend}
              disabled={sending || !text.trim()}
              style={{ paddingHorizontal:8, paddingVertical:6, borderRadius:14, backgroundColor:'transparent', opacity: (sending || !text.trim()) ? 0.4 : 1 }}
              hitSlop={{ top:6, bottom:6, left:4, right:2 }}
            >
              <Text style={{ color:'#FFD700', fontWeight:'800', fontSize:13 }}>Sent</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 메시지 액션 시트 (카톡 스타일) */}
      <Modal transparent visible={msgMenuOpen} animationType="fade" onRequestClose={closeMsgMenu}>
        <TouchableOpacity activeOpacity={1} onPress={closeMsgMenu} style={styles.msgSheetOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.msgSheet}>
            <Text style={styles.msgSheetTitle}>메시지</Text>
            <View style={styles.msgSheetRow}>
              <TouchableOpacity style={styles.msgSheetBtn} onPress={() => { try { setText((prev)=>`> ${String(selectedMsg?.content||'').slice(0,120)}\n`); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetBtnText}>답장</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgSheetBtn} onPress={() => { try { openReactPicker(); } catch {} }}>
                <Text style={styles.msgSheetBtnText}>공감</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgSheetBtn} onPress={async () => { try { await Share.share({ message: String(selectedMsg?.content || '') }); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetBtnText}>전달</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgSheetBtn} onPress={async () => { try { await Share.share({ message: String(selectedMsg?.content || '') }); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetBtnText}>나에게</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.msgSheetList}>
              <TouchableOpacity style={styles.msgSheetListItem} onPress={() => { try { (useKakaoRoomsStore as any).getState().pinMessage?.(roomId, String(selectedMsg?.id||'')); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetListText}>공지</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.msgSheetListItem}
                onPress={() => { try { keepMessageMediaToTreasure(selectedMsg); } catch {} closeMsgMenu(); }}
              >
                <Text style={styles.msgSheetListText}>보관</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgSheetListItem} onPress={() => { try { const Clipboard = require('@react-native-clipboard/clipboard'); Clipboard.setString(String(selectedMsg?.content||'')); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetListText}>복사</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgSheetListItem} onPress={async () => { try { await hideMessageForMe(String(selectedMsg?.id||'')); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetListText}>가리기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.msgSheetListItem} onPress={async () => { try { await hideMessageForMe(String(selectedMsg?.id||'')); } catch {} closeMsgMenu(); }}>
                <Text style={styles.msgSheetListText}>나에게만 삭제</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.msgSheetListItem}
                onPress={() => {
                  try {
                    const canDeleteAll = selectedMsgIsMe || String((room as any)?.type || '') === 'ttl';
                    if (!canDeleteAll) { Alert.alert('삭제', '내가 보낸 메시지만 모두에게서 삭제할 수 있습니다.'); closeMsgMenu(); return; }
                    Alert.alert('삭제', '모두에게서 삭제할까요?', [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: () => { try { removeMessage(roomId, String(selectedMsg?.id||'')); } catch {} } },
                    ]);
                  } catch {}
                  closeMsgMenu();
                }}
              >
                <Text style={[styles.msgSheetListText, { color:'#E53935', fontWeight:'900' }]}>모두에게 삭제</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 공감 이모티콘 선택 */}
      <Modal transparent visible={msgMenuOpen && msgReactOpen} animationType="fade" onRequestClose={closeReactPicker}>
        <TouchableOpacity activeOpacity={1} onPress={closeReactPicker} style={styles.reactOverlay}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.reactSheet}>
            <View style={styles.reactRow}>
              {['❤️','👍','😂','😮','😢','😡'].map((emo) => (
                <TouchableOpacity
                  key={emo}
                  style={styles.reactBtn}
                  onPress={() => {
                    try { (useKakaoRoomsStore as any).getState().reactMessage?.(roomId, String(selectedMsg?.id||''), emo); } catch {}
                    try { closeReactPicker(); closeMsgMenu(); } catch {}
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{emo}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 미리보기 뷰어 */}
            {viewerOpen && (
        <React.Suspense fallback={null}>
          <ChatViewer
            visible={true}
            url={String(viewerUrl||'')}
            kind={viewerKind}
            title={viewerTitle}
            headerAvatarUrl={viewerHeaderAvatar}
            headerTs={viewerHeaderTs}
            onClose={()=> setViewerOpen(false)}
                  onSave={(async ()=>{
                    // 일반방은 제한 없음, TTL방일 때만 allowImageDownload 검사
                    const allowed = (!isTTLRoom) || (ttlSecurity?.allowImageDownload !== false);
                    if (!allowed) { Alert.alert('제한','이미지/파일 저장이 제한된 방입니다.'); return; }
                    try {
                      const url = String(viewerUrl||'');
                      if (!url) return;
                      const FS: any = require('expo-file-system');
                      const ML: any = require('expo-media-library');
                      const perm = await ML.requestPermissionsAsync?.();
                      if (!perm?.granted) { Alert.alert('권한 필요','갤러리 접근 권한이 필요합니다.'); return; }
                      const fileUri = `${FS.cacheDirectory || FS.documentDirectory}dl_${Date.now()}.jpg`;
                      const dl = await FS.downloadAsync?.(url, fileUri);
                      const asset = await ML.saveToLibraryAsync?.(dl?.uri || fileUri);
                      Alert.alert('저장 완료','갤러리에 저장되었습니다.');
                    } catch (e) { try { const Linking = require('expo-linking'); Linking.openURL(String(viewerUrl)); } catch {} }
                  })}
                  onCopy={(()=>{
                    const allowed = (!isTTLRoom) || (ttlSecurity?.allowExternalShare !== false);
                    if (!allowed) { Alert.alert('제한','외부 공유가 제한된 방입니다.'); return; }
                    try {
                      const Clipboard = require('@react-native-clipboard/clipboard');
                      Clipboard?.setString?.(String(viewerUrl||''));
                      Alert.alert('복사됨','이미지 링크를 복사했습니다.\n대화창에 붙여넣기 하세요.');
                    } catch {}
                  })}
                  onForward={(()=>{
                    const allowed = (!isTTLRoom) || (ttlSecurity?.allowExternalShare !== false);
                    if (!allowed) { Alert.alert('제한','외부 공유가 제한된 방입니다.'); return; }
                    try {
                      const Share = require('react-native').Share;
                      Share.share({ message: String(viewerUrl||'') });
                    } catch {}
                  })}
                  onKeep={(()=>{
                    try {
                      const { useMediaStore, mediaIdForUri } = require('@/src/features/chat/store/media.store');
                      const id = mediaIdForUri(String(viewerUrl||''));
                      useMediaStore.getState().addOrUpdate({ id, uriHttp: String(viewerUrl||''), visibility:'private', location:'treasure' });
                      Alert.alert('보관함','비공개 보물창고로 이동했습니다.');
                    } catch {}
                  })}
                  onDelete={(()=>{
                    try {
                      const msgId = String(viewerMsgId||'');
                      if (!msgId) return;
                      const target = (messages||[]).find((m:any)=> String(m?.id||'')===msgId);
                      const canDel = isPrivileged || (String(target?.senderId||'')===uid);
                      if (!canDel) { Alert.alert('삭제 불가','해당 메시지를 삭제할 권한이 없습니다.'); return; }
                      Alert.alert('삭제','정말 삭제하시겠습니까?', [
                        { text:'취소', style:'cancel' as any },
                        { text:'삭제', style:'destructive' as any, onPress: ()=>{ try { removeMessage?.(roomId, msgId); setViewerOpen(false); } catch {} } }
                      ]);
                    } catch {}
                  })}
            onPrev={viewerList.length>0 && viewerIndex>0 ? (()=>{ try { const i = Math.max(0, viewerIndex-1); setViewerIndex(i); setViewerUrl(viewerList[i]); setViewerKind('image'); } catch {} }) : undefined}
            onNext={viewerList.length>0 && viewerIndex<viewerList.length-1 ? (()=>{ try { const i = Math.min(viewerList.length-1, viewerIndex+1); setViewerIndex(i); setViewerUrl(viewerList[i]); setViewerKind('image'); } catch {} }) : undefined}
          />
        </React.Suspense>
      )}

      {/* 입장 토스트 */}
      {!!joinToast && (
        <View style={{ position:'absolute', left:20, right:20, top: (insets?.top||0) + 12, alignItems:'center', zIndex: 1000 }}>
          <View style={{ backgroundColor:'rgba(0,0,0,0.8)', borderWidth:1, borderColor:'#333', borderRadius:12, paddingHorizontal:12, paddingVertical:8 }}>
            <Text style={{ color:'#FFD700', fontWeight:'800' }}>{joinToast}</Text>
          </View>
        </View>
      )}

      {/* 방 옵션 간단 시트 */}
      {false && settingsOpen && (
        <View style={{ position:'absolute', left:0, right:0, bottom:0, top:0, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'flex-start' }}>
          <View style={{ marginTop: 60, width: 320, maxWidth:'94%', backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:12, overflow:'hidden' }}>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1E1E1E' }}>
              <Text style={{ color:'#F6F6F6', fontWeight:'800' }}>{t('roomSettings', language) || '방 설정'}</Text>
              <TouchableOpacity onPress={()=> setSettingsOpen(false)}><Text style={{ color:'#CFCFCF' }}>{t('close', language) || '닫기'}</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection:'row', gap:6, paddingHorizontal:10, paddingVertical:8 }}>
              {((
                (String((room as any)?.type||'')==='ttl')
                  ? (['general','members','ttl','rule','alarm'] as const)
                  : (['general','members','rule','alarm'] as const)
              )).map(tab => (
                <TouchableOpacity key={tab} onPress={()=>setSettingsTab(tab)} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor: settingsTab===tab?'#FFD700':'#333' }}>
                  <Text style={{ color: settingsTab===tab?'#FFD700':'#CFCFCF', fontWeight:'700', fontSize:12 }}>
                    {tab==='general'? (t('general', language)||'일반')
                      : tab==='members'? (t('members', language)||'멤버')
                      : tab==='ttl'? 'TTL'
                      : tab==='rule'? ('권한')
                      : (t('notifications', language)||'알림')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ paddingHorizontal:12, paddingBottom:12 }}>
              {settingsTab==='general' && (
                <View>
                  {/* 대표 이미지 */}
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>대표 이미지</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:6 }}>
                    <View style={{ width:46, height:46, borderRadius:8, overflow:'hidden', borderWidth:1, borderColor:'#2A2A2A', position:'relative' }}>
                      <Image source={{ uri: String((room as any)?.image || '') }} style={{ width:'100%', height:'100%' }} />
                      {/* 상하 대비 오버레이 */}
                      <View style={{ position:'absolute', left:0, right:0, top:0, height:10, backgroundColor:'rgba(255,255,255,0.55)' }} />
                      <View style={{ position:'absolute', left:0, right:0, bottom:0, height:10, backgroundColor:'rgba(0,0,0,0.35)' }} />
                    </View>
                    <TouchableOpacity onPress={async()=>{ try { const IP = await import('expo-image-picker'); const Picker: any = (IP as any).ImagePicker || IP; const res: any = await Picker.launchImageLibraryAsync?.({ mediaTypes: Picker.MediaTypeOptions.Images, allowsMultipleSelection:false, quality:0.9, allowsEditing:true, aspect:[1,1] }); if (res && !res.canceled && res.assets?.[0]?.uri) { await updateRoomMeta(roomId, { image: String(res.assets[0].uri) }); } } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}>
                      <Text style={{ color:'#CFCFCF', fontWeight:'800' }}>변경</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>{t('roomTitle', language) || '방 제목'}</Text>
                  <TextInput
                    value={editorTitle}
                    onChangeText={setEditorTitle}
                    placeholder={t('enterRoomTitle', language) || '방 제목 입력'}
                    placeholderTextColor="#666"
                    style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                    onSubmitEditing={async()=>{ try { await updateRoomMeta(roomId, { title: String(editorTitle||'').trim() }); } catch {} }}
                  />

                  {/* 방 설명 */}
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>방 설명</Text>
                  <TextInput
                    value={editorDesc}
                    onChangeText={setEditorDesc}
                    placeholder="설명"
                    placeholderTextColor="#666"
                    multiline
                    style={{ marginTop:6, minHeight:70, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                  />

                  {/* 참가 인원수 제한 */}
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>참가 인원수 제한</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={String((room as any)?.limit ?? '')}
                    onChangeText={(v)=>{ try { const n = Number(String(v||'').replace(/[^0-9]/g,''))||0; (useKakaoRoomsStore as any).getState().updateRoomMeta?.(roomId, { limit: n }); } catch {} }}
                    placeholder="제한 없음 (0 또는 공란)"
                    placeholderTextColor="#666"
                    style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                  />

                  {/* 태그 */}
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>태그 (쉼표로 구분)</Text>
                  <TextInput
                    value={String((room as any)?.tags?.join(', ') || '')}
                    onChangeText={(v)=>{ try { const arr = String(v||'').split(',').map(s=>s.trim()).filter(Boolean); (useKakaoRoomsStore as any).getState().updateRoomMeta?.(roomId, { tags: arr }); } catch {} }}
                    placeholder="#travel, #food"
                    placeholderTextColor="#666"
                    style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                  />

                  <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
                    <Text style={{ color:'#CFCFCF' }}>{t('publicRoom', language) || '공개 방'}</Text>
                    <Switch value={isPublic} onValueChange={(v)=> setIsPublic(v)} trackColor={{ true: '#D4AF37' }} thumbColor={isPublic? '#FFD700':'#888'} />
                  </View>
                  {!isPublic && (
                    <View style={{ marginTop:8 }}>
                      <Text style={{ color:'#9BA1A6', fontSize:12 }}>{t('roomPasswordOptional', language) || '입장 비밀번호(선택)'}</Text>
                      <TextInput
                        value={passwordDraft}
                        onChangeText={setPasswordDraft}
                        placeholder={t('enterPasswordOptional', language) || '비밀번호 입력(선택)'}
                        placeholderTextColor="#666"
                        secureTextEntry
                        style={{ marginTop:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                      />
                    </View>
                  )}
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>{t('bubbleColor', language) || '말풍선 색상'}</Text>
                  <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:6 }}>
                    {(['default','gold','purple','mint','red','white'] as const).map(c => (
                      <TouchableOpacity key={c} onPress={()=> setBubbleColor(c)} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor: bubbleColor===c?'#FFD700':'#2A2A2A' }}>
                        <Text style={{ color: bubbleColor===c?'#FFD700':'#CFCFCF', fontWeight:'700', fontSize:12 }}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>{t('backgroundHex', language) || '배경 색상(hex)'}</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:6 }}>
                    <TextInput value={bgColor} onChangeText={setBgColor} placeholder="#0C0C0C" placeholderTextColor="#666" style={{ flex:1, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />
                    <View style={{ width:22, height:22, borderRadius:4, borderWidth:1, borderColor:'#333', backgroundColor:bgColor }} />
                  </View>
                  {/* 하단 버튼: 저장 / 초대 코드/QR / 나가기 */}
                  <View style={{ flexDirection:'row', gap:10, marginTop:14 }}>
                    <TouchableOpacity onPress={async()=>{ try { const title = String(editorTitle||'').trim(); if (title && title !== (room as any)?.title) { await updateRoomMeta(roomId, { title }); } await setRoomPrivacy(roomId, !!isPublic, isPublic ? '' : (passwordDraft||'')); await saveRoomSettings(roomId, { basic: { description: editorDesc }, theme: { bubbleColor, backgroundColor: bgColor } as any }); Alert.alert('저장됨','방 설정이 저장되었습니다.'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:10 }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>저장</Text></TouchableOpacity>
                    <TouchableOpacity onPress={async()=>{ try { await generateInvite(roomId); Alert.alert('초대','초대 코드/QR을 생성했습니다.'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:10 }}><Text style={{ color:'#CFCFCF' }}>초대 코드/QR</Text></TouchableOpacity>
                    <View style={{ flex:1 }} />
                    <TouchableOpacity onPress={async()=>{ try { await leaveRoom(roomId, uid); setSettingsOpen(false); router.push('/chat/rooms'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#7A1F1F', borderRadius:10 }}><Text style={{ color:'#FF6B6B' }}>나가기</Text></TouchableOpacity>
                  </View>
                </View>
              )}

              {settingsTab==='members' && (
                <View>
                  <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
                    <Text style={{ color:'#9BA1A6', fontSize:12 }}>{t('participants', language) || '참여 인원'}: {memberIds.length}</Text>
                  </View>
                  <View style={{ marginTop:8 }}>
                    {(memberIds || []).map((mid) => {
                      const role = String((memberRoles as any)?.[mid] || 'member');
                      const isMe = String(mid) === String(uid);
                      return (
                        <View key={mid} style={{ paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#1E1E1E', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                          <View style={{ flex:1, paddingRight:8 }}>
                            <Text style={{ color:'#F6F6F6' }} numberOfLines={1}>{mid}{isMe?' (me)':''}</Text>
                            <Text style={{ color:'#9BA1A6', fontSize:11 }}>{t('role', language)||'권한'}: {role}</Text>
                          </View>
                          <View style={{ flexDirection:'row', gap:6 }}>
                            {(['admin','moderator','member'] as const).map(r => (
                              <TouchableOpacity key={r} onPress={async()=>{ try { setMemberRoles((m)=>({ ...m, [mid]: r })); await setMemberRole(roomId, mid, r as any); } catch {} }} style={{ paddingHorizontal:8, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor: role===r?'#FFD700':'#2A2A2A' }}>
                                <Text style={{ color: role===r?'#FFD700':'#CFCFCF', fontSize:12 }}>{r}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
              {settingsTab==='ttl' && String((room as any)?.type||'')==='ttl' && (
                <View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>{t('roomExplosionTime', language) || '폭파 시간'} [DD] HH:MM:SS</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:6 }}>
                    <TextInput value={expD} onChangeText={(t)=>setExpD(normalizeNum(t))} keyboardType="number-pad" style={{ width:46, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} />
                    <TextInput value={expH} onChangeText={(t)=>setExpH(normalizeNum(t))} keyboardType="number-pad" style={{ width:60, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} placeholder="HH" placeholderTextColor="#666" />
                    <TextInput value={expM} onChangeText={(t)=>setExpM(normalizeNum(t))} keyboardType="number-pad" style={{ width:60, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} placeholder="MM" placeholderTextColor="#666" />
                    <TextInput value={expS} onChangeText={(t)=>setExpS(normalizeNum(t))} keyboardType="number-pad" style={{ width:60, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} placeholder="SS" placeholderTextColor="#666" />
                    <TouchableOpacity onPress={() => {
                      try {
                        const ms = calcMs(Number(expD||0), Number(expH||0), Number(expM||0), Number(expS||0));
                        const target = Date.now() + ms;
                        (useKakaoRoomsStore as any).getState().setRoomTTL?.(roomId, target);
                      } catch {}
                    }} style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>{t('edit', language) || '수정'}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      try {
                        const tenMin = 10*60*1000;
                        (useKakaoRoomsStore as any).getState().setRoomTTL?.(roomId, Date.now()+tenMin);
                      } catch {}
                    }} style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>{t('extend', language) || '연장'}</Text></TouchableOpacity>
                  </View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>{t('messageTTL', language) || 'TTL 시간 정하기'}</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:6 }}>
                    <TextInput value={ttlH} onChangeText={(t)=>setTtlH(normalizeNum(t))} keyboardType="number-pad" style={{ width:46, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} />
                    <TextInput value={ttlMin} onChangeText={(t)=>setTtlMin(normalizeNum(t))} keyboardType="number-pad" style={{ width:60, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} placeholder="MM" placeholderTextColor="#666" />
                    <TextInput value={ttlSec} onChangeText={(t)=>setTtlSec(normalizeNum(t))} keyboardType="number-pad" style={{ width:60, color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:8, paddingVertical:6, textAlign:'center' }} placeholder="SS" placeholderTextColor="#666" />
                    <TouchableOpacity onPress={() => {
                      try {
                        const ms = calcMs(0, Number(ttlH||0), Number(ttlMin||0), Number(ttlSec||0));
                        (useKakaoRoomsStore as any).getState().setMessageTTL?.(roomId, ms);
                      } catch {}
                    }} style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>{t('save', language) || '저장'}</Text></TouchableOpacity>
                  </View>
                  <Text style={{ color:'#777', fontSize:11, marginTop:6 }}>{t('ttlZeroHint', language) || '0으로 설정하면 TTL을 끕니다.'}</Text>
                </View>
              )}
              {settingsTab==='rule' && (
                <View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:6 }}>비밀번호 잠금</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:6 }}>
                    <TextInput value={passwordDraft} onChangeText={setPasswordDraft} placeholder="********" placeholderTextColor="#666" secureTextEntry style={{ flex:1, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />
                    <TouchableOpacity onPress={async()=>{ try { await updateRoomMeta(roomId, { password: String(passwordDraft||'') }); Alert.alert('적용됨','비밀번호가 적용되었습니다.'); } catch {} }} style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>적용</Text></TouchableOpacity>
                  </View>
                  <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
                    <Text style={{ color:'#CFCFCF' }}>2단계 인증 사용</Text>
                    <Switch value={!!(room as any)?.use2fa} onValueChange={(v)=>{ try { updateRoomMeta(roomId, { use2fa: !!v }); } catch {} }} trackColor={{ true:'#D4AF37' }} thumbColor={!!(room as any)?.use2fa? '#FFD700':'#888'} />
                  </View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>이 방에서 해시 표시</Text>
                  <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
                    {(['기본','해시','닉네임'] as const).map(opt => (
                      <TouchableOpacity key={opt} onPress={()=>{ try { updateRoomMeta(roomId, { nameDisplay: opt }); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: ((room as any)?.nameDisplay||'기본')===opt ? '#FFD700':'#333' }}>
                        <Text style={{ color: ((room as any)?.nameDisplay||'기본')===opt ? '#FFD700':'#CFCFCF' }}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:12 }}>블랙리스트</Text>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:6 }}>
                    <TextInput placeholder="차단할 사용자 UID" placeholderTextColor="#666" onSubmitEditing={(e)=>{ try { const uidBlk = String(e.nativeEvent.text||'').trim(); if (uidBlk) updateRoomMeta(roomId, { blacklist: [ ...(Array.isArray((room as any)?.blacklist)?(room as any).blacklist:[]), uidBlk ] }); } catch {} }} style={{ flex:1, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }} />
                    <TouchableOpacity onPress={()=>{}} style={{ paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8 }}><Text style={{ color:'#CFCFCF' }}>추가</Text></TouchableOpacity>
                  </View>
                  <Text style={{ color:'#9BA1A6', fontSize:12, marginTop:16 }}>데이터</Text>
                  <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
                    <TouchableOpacity onPress={async()=>{ try { const ids = (messages||[]).map((m:any)=> String(m.id||'')); ids.forEach((id:string)=>{ try { removeMessage(roomId, id); } catch {} }); Alert.alert('완료','채팅방을 초기화했습니다(로컬).'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}><Text style={{ color:'#CFCFCF' }}>채팅방 초기화</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=>{ try { Alert.alert('내보내기','대화 내보내기를 준비 중입니다.'); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}><Text style={{ color:'#CFCFCF' }}>대화 내보내기</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* + 메뉴 팝업 */}
             {attachOpen && (
        <View style={{ position:'absolute', left:12, bottom:60, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:10, padding:6 }}>
                 {[
                   { label:'사진', onPress: ()=>{
                     if (isTTLRoom && ttlSecurity?.allowImageUpload === false) { Alert.alert('업로드 제한','이미지 업로드가 제한된 방입니다.'); return; }
                     pickMedia('image');
                   }},
                   { label:'동영상', onPress: ()=>{
                     if (isTTLRoom && ttlSecurity?.allowImageUpload === false) { Alert.alert('업로드 제한','영상 업로드가 제한된 방입니다.'); return; }
                     pickMedia('video');
                   }},
                   { label:'파일', onPress: pickFile },
                   { label:'위치', onPress: sendLocation },
                  { label:'QR보내기', onPress: ()=>{ sendQR(); } },
                  { label:'투표', onPress: openPoll },
                 ].map((it) => (
            <TouchableOpacity key={it.label} onPress={it.onPress} style={{ paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#1E1E1E', marginVertical:3 }}>
              <Text style={{ color:'#FFD700', fontWeight:'800' }}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

export default function KakaoStyleRoomScreen() {
  return (
    <RoomErrorBoundary>
      <RoomInner />
    </RoomErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  roomTitleBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 0, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#1F1F1F' },
  roomLeaveBtn: { marginRight: 8 },
  roomLeaveText: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  roomTitleText: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  messagesContent: { padding: 12 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginBottom: 8 },
  meBubble: { backgroundColor: '#D4AF37', alignSelf: 'flex-end', borderTopRightRadius: 4 },
  otherBubble: { backgroundColor: '#FFFFFF', alignSelf: 'flex-start', borderTopLeftRadius: 4 },
  bubbleText: { color: '#0C0C0C', fontSize: 14, lineHeight: 18 },
  timeText: { color: '#666', fontSize: 10, marginTop: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: '#0C0C0C', borderTopWidth: 1, borderTopColor: '#1F1F1F' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, color: '#EDEDED', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  sendBtn: { marginLeft: 8, backgroundColor: '#FFD700', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: '#0C0C0C', fontWeight: '800' },
  msgSheetOverlay: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'flex-end' },
  msgSheet: { backgroundColor:'#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 14 },
  msgSheetTitle: { color:'#111', fontSize: 18, fontWeight:'900', marginBottom: 10 },
  msgSheetRow: { flexDirection:'row', justifyContent:'space-between', marginBottom: 12 },
  msgSheetBtn: { flex:1, paddingVertical: 12, alignItems:'center', justifyContent:'center' },
  msgSheetBtnText: { color:'#2E7D32', fontWeight:'900', fontSize: 15 },
  msgSheetList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor:'#E6E6E6' },
  msgSheetListItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor:'#EDEDED' },
  msgSheetListText: { color:'#111', fontSize: 15, fontWeight:'800' },
  reactOverlay: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.35)', alignItems:'center', justifyContent:'center', padding: 16 },
  reactSheet: { backgroundColor:'#FFFFFF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  reactRow: { flexDirection:'row', gap: 10, alignItems:'center', justifyContent:'center' },
  reactBtn: { width: 38, height: 38, borderRadius: 19, alignItems:'center', justifyContent:'center' },
});

