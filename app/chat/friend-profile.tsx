import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useLocalSearchParams, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { useMediaStore, mediaSelectors, mediaIdForUri } from '@/src/features/chat/store/media.store';
import { Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Linking, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { useNotificationStore } from '@/src/features/chat/store/notification.store';
import { firebaseAuth, firebaseStorage, firestore, ensureAuthedUid } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
// Revert: ChatTopBar 사용 취소
import { useFollowStore } from '@/src/features/chat/store/follow.store';
import { detectType as mediaDetectType } from '@/src/features/chat/lib/media';
import { MediaPreviewModalV2 } from '@/src/features/chatv2/components/MediaPreviewModalV2';
import type { ChatMessageV2 } from '@/src/features/chatv2/core/messageSchema';
import { getOrCreateDmRoomIdForUsersV2 } from '@/src/features/chatv2/services/dmEntryService';
import { resolveChatDisplayNameFromUserDoc } from '@/src/features/chatv2/core/chatDisplayName';

// expo-image가 없을 때를 대비한 폴백
let EImage: any = null;
try { EImage = require('expo-image').Image; } catch {}
const ImgC: any = EImage || Image;
// content://, file:// 썸네일 보정
async function normalizeThumbUri(raw: string): Promise<string> {
  try {
    const u = String(raw || '');
    if (!u) return '';
    if (/^https?:/i.test(u) || /^data:/i.test(u)) return u;
    // 웹에서 blob: URL은 RN Image가 실패할 수 있어 dataURL로 변환
    if (/^blob:/i.test(u)) {
      try {
        if (Platform.OS === 'web') {
          const res = await fetch(u);
          const blob = await res.blob();
          const toDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
            try {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result || ''));
              fr.onerror = () => reject(new Error('reader'));
              fr.readAsDataURL(b);
            } catch (e) { reject(e as any); }
          });
          const data = await toDataUrl(blob);
          if (data) return data;
        }
      } catch {}
      return '';
    }
    if (/^file:/i.test(u)) {
      try { const b64 = await FileSystem.readAsStringAsync(u, { encoding: FileSystem.EncodingType.Base64 }); return `data:image/jpeg;base64,${b64}`; } catch {}
      return '';
    }
    if (/^content:/i.test(u)) {
      try {
        const RNBU = (()=>{ try { return require('react-native-blob-util'); } catch { return null; } })();
        if (RNBU?.fs?.readFile) {
          const b64 = await RNBU.fs.readFile(u, 'base64');
          if (b64) return `data:image/jpeg;base64,${b64}`;
        }
      } catch {}
      return '';
    }
    return '';
  } catch { return ''; }
}

/** 그리드/보물창고 동일 키 — 쿼리스트링 차이로 중복 저장 방지 */
function normalizeUriKey(u: string): string {
  try {
    const url = new URL(String(u));
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return String(u || '');
  }
}

function inferStoreMediaType(uri: string, kindHint?: string): 'image' | 'video' | 'file' | 'link' {
  const k = String(kindHint || '').toLowerCase();
  if (k === 'video') return 'video';
  if (k === 'file') return 'file';
  if (k === 'link') return 'link';
  if (k === 'qr') return 'image';
  try {
    const d = String(mediaDetectType(uri) || '').toLowerCase();
    if (d === 'video') return 'video';
    if (d === 'file') return 'file';
    if (d === 'link') return 'link';
  } catch {}
  return 'image';
}

export default function FriendProfileScreen() {
  const { language } = usePreferences();
  const params = useLocalSearchParams<{ id?: string; userId?: string; name?: string; avatar?: string }>();
  const store = useChatProfileStore();
  const selfUid = firebaseAuth.currentUser?.uid || store.currentProfile?.userId || '';
  const rawPeer = String(params.id || params.userId || '').trim();
  const resolvedId = (params.id === 'me' || params.id === 'self') ? String(selfUid) : String(rawPeer || selfUid);
  const friendId = resolvedId;
  const paramName = String(params.name || '').trim();
  const paramAvatar = String(params.avatar || '').trim();
  const storeProfEarly = store.getProfile(resolvedId);
  const [friendName, setFriendName] = useState(() =>
    String(paramName || storeProfEarly?.chatName || storeProfEarly?.displayName || '').trim()
  );
  const [gridItems, setGridItems] = useState<Array<{ uri: string; public?: boolean; createdAt?: number; type?: 'image'|'video'|'file'|'link'|'qr'|'other' }>>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<'grid' | 'tagged'>('grid');
  const [renameOpen, setRenameOpen] = useState(false);
  const [tempName, setTempName] = useState(String(friendName));
  const [friendPhone, setFriendPhone] = useState<string | null>(null);
  const [friendEmail, setFriendEmail] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const columnsConst = 4; // 고정 4장 진열
  const [followersOpen, setFollowersOpen] = useState(false);
  const [targetFollowersCount, setTargetFollowersCount] = useState(0);
  const [targetFollowingCount, setTargetFollowingCount] = useState(0);
  // 공용 미리보기 상태 (chatv2 미리보기와 동일 컴포넌트 사용)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const toPreviewMsg = React.useCallback((uriRaw: string, typeRaw?: string, idx = 0): ChatMessageV2 => {
    const uri = String(uriRaw || '').trim();
    const lowerNoQ = uri.toLowerCase().split('?')[0];
    let t = String(typeRaw || '').toLowerCase().trim();
    if (!t) {
      try { t = String(mediaDetectType(uri) || '').toLowerCase(); } catch { t = ''; }
    }
    if (t === 'qr') t = 'image';
    if (t === 'link') t = 'url';
    if (t !== 'image' && t !== 'video' && t !== 'file' && t !== 'audio' && t !== 'url') t = 'image';
    return {
      id: `profile-preview-${idx}-${mediaIdForUri(uri)}`,
      roomId: `profile:${friendId}`,
      senderId: String(friendId || 'me'),
      type: t as any,
      status: 'sent',
      text: t === 'url' ? uri : '',
      url: uri,
      attachment: {
        id: `att-${mediaIdForUri(uri)}`,
        type: (t === 'url' ? 'file' : t) as any,
        originalName: '',
        remoteUrl: uri,
      },
      createdAt: Date.now() + idx,
      updatedAt: Date.now() + idx,
    } as ChatMessageV2;
  }, [friendId]);

  const gridPreviewChain = useMemo(
    () => (gridItems || []).map((it, idx) => toPreviewMsg(String(it?.uri || ''), String(it?.type || ''), idx)),
    [gridItems, toPreviewMsg]
  );

  // 그리드 다중 선택 상태
  const [gridSelecting, setGridSelecting] = useState(false);
  const [gridSelected, setGridSelected] = useState<Set<string>>(new Set());
  const toggleGridSel = React.useCallback((uri:string) => { setGridSelected(prev => { const n = new Set(prev); if (n.has(uri)) n.delete(uri); else n.add(uri); return n; }); }, []);
  const clearGridSel = React.useCallback(()=>{ setGridSelected(new Set()); setGridSelecting(false); }, []);

  // 링크/파일 썸네일 캐시 (미디어갤러리와 동일한 구조의 미리보기용)
  const linkMetaRef = React.useRef<Record<string, { title?: string; image?: string; host?: string }>>({});
  const [linkMetaTick, setLinkMetaTick] = useState(0);
  const faviconFor = React.useCallback((url:string) => { try { const u=new URL(url); if (u.hostname==='localhost' || u.hostname==='127.0.0.1') return ''; return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=128`; } catch { return ''; } }, []);
  const ytThumbFor = React.useCallback((url:string) => { try { const u=new URL(url); if (u.host.includes('youtube.com') || u.host.includes('youtu.be')) { let vid=''; const s=/\/shorts\/([\w-]+)/.exec(u.pathname); if (s) vid=s[1]; const v=u.searchParams.get('v'); if (!vid && v) vid=v; if (!vid && u.host.includes('youtu.be')) { const seg=u.pathname.replace(/^\//,''); if (seg) vid=seg; } if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`; } return ''; } catch { return ''; } }, []);
  // 비디오 썸네일 캐시(웹)
  const [videoThumbs, setVideoThumbs] = useState<Record<string,string>>({});
  const videoKey = React.useCallback((s:string)=>{ try { const u=new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { try { return String(s).split('?')[0]; } catch { return String(s||''); } } }, []);
  // 그리드 이미지 onError 보정용(파일/콘텐츠 URI → dataURL 변환)
  const [gridOverrideThumbs, setGridOverrideThumbs] = useState<Record<number, string>>({});
  const [gridBroken, setGridBroken] = useState<Record<number, boolean>>({});
  const ensureVideoThumb = React.useCallback(async (url:string): Promise<string> => {
    try {
      if (Platform.OS!=='web') return '';
      const k = videoKey(url);
      if (videoThumbs[k]) return videoThumbs[k];
      try { const cached = await AsyncStorage.getItem(`video.thumb:${k}`); if (cached) { setVideoThumbs(p=>({ ...p, [k]: cached })); return cached; } } catch {}
      try { const U=new URL(String(url)); const h=U.host.toLowerCase(); if (h.includes('youtube.com')||h.includes('youtu.be')) return ''; } catch {}
      const v = document.createElement('video'); try { v.crossOrigin='anonymous'; } catch {}
      v.muted=true; v.preload='metadata'; v.src=String(url);
      await new Promise<void>((res, rej)=>{ v.onloadeddata=()=>res(); v.onerror=()=>rej(new Error('video')); });
      const canvas=document.createElement('canvas'); const w=Math.max(320,Math.min(800,v.videoWidth||480)); const h=Math.max(180,Math.min(450,Math.round((v.videoHeight||270)*(w/(v.videoWidth||480))))); canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('no-ctx'); ctx.drawImage(v,0,0,w,h); const data=canvas.toDataURL('image/jpeg',0.8); if(!data) return ''; setVideoThumbs(p=>({ ...p, [k]: data })); try { await AsyncStorage.setItem(`video.thumb:${k}`, data); } catch {} return data;
    } catch { return ''; }
  }, [videoThumbs, videoKey]);
  const ensureLinkMeta = React.useCallback(async (linkUrl:string) => {
    if (linkMetaRef.current[linkUrl]) return;
    try {
      const u = new URL(linkUrl);
      try {
        const ne = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(linkUrl)}`);
        const j = await ne.json();
        if (j && (j.title || j.thumbnail_url)) {
          linkMetaRef.current[linkUrl] = { title: j.title || u.host, image: j.thumbnail_url || faviconFor(linkUrl), host: u.host };
          setLinkMetaTick(v=>v+1); return;
        }
      } catch {}
      linkMetaRef.current[linkUrl] = { title: u.host, image: faviconFor(linkUrl), host: u.host };
      setLinkMetaTick(v=>v+1);
    } catch {
      linkMetaRef.current[linkUrl] = { title: '링크', image: faviconFor(linkUrl), host: '' };
      setLinkMetaTick(v=>v+1);
    }
  }, [faviconFor]);
  const deriveName = React.useCallback((u:string) => { try { const U=new URL(u); const last=decodeURIComponent((U.pathname.split('/').pop()||'').replace(/\+/g,' ')); return last || U.host; } catch { const m=/([^\/\?#]+)(?:\?|#|$)/.exec(String(u)||''); return decodeURIComponent((m?.[1]||'').replace(/\+/g,' ')); } }, []);
  const fileIconSvg = React.useCallback((ext:string) => { const label=(ext||'file').toUpperCase(); const color=/pdf/i.test(label)?'%23E53935':(/docx?/i.test(label)?'%231E88E5':(/xlsx?/i.test(label)?'%232E7D32':(/pptx?/i.test(label)?'%23E67E22':'%23FFD700'))); return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23151515'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='${color}' font-size='36' font-weight='900'>${(label||'FILE').slice(0,6)}</text></svg>`; }, []);

  const galleryKey = useMemo(() => friendId ? `u:${friendId}:chat.media.items` : 'chat.media.items:unknown', [friendId]);
  const isSelf = String(friendId) === String(selfUid);
  const [friendProfile, setFriendProfile] = useState<any | null>(store.getProfile(String(friendId)) || (isSelf ? store.currentProfile : null));
  const serverProfile = useChatProfileStore((s)=> s.profiles[String(friendId)] || null);
  useEffect(() => {
    (async () => {
      try {
        // 1) 스토어에 있으면 우선 사용
        const fromStore = useChatProfileStore.getState().getProfile(String(friendId));
        if (fromStore) { setFriendProfile(fromStore); return; }
        if (String(friendId) === String(selfUid)) {
          const mine = useChatProfileStore.getState().currentProfile;
          if (mine) { setFriendProfile(mine); return; }
        }
        // 2) 퍼시스트된 로컬 저장소에서 읽기
        const raw = await AsyncStorage.getItem('yoo-chat-profile-store');
        if (raw) {
          const parsed = JSON.parse(raw);
          const p = parsed?.state?.profiles?.[String(friendId)] || null;
          if (p) { setFriendProfile(p); return; }
        }
      } catch {}
      setFriendProfile(null);
    })();
  }, [friendId]);

  // 서버 프로필이 나중에 생기면 자동 대체
  useEffect(() => {
    if (serverProfile) setFriendProfile(serverProfile);
  }, [serverProfile]);

  /** 채팅에서 넘긴 프사(HTTPS) — Firestore 스냅샷 전에 즉시 반영 */
  useEffect(() => {
    if (!paramAvatar || isSelf) return;
    setFriendProfile((prev) => {
      const cur = String(prev?.avatar || '').trim();
      if (cur && /^https?:\/\//i.test(cur)) return prev;
      return { ...(prev || {}), userId: String(friendId), avatar: paramAvatar };
    });
  }, [paramAvatar, friendId, isSelf]);

  /** 로컬에서 지정한 별명(AsyncStorage) */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r1 = await AsyncStorage.getItem(`u:${selfUid}:friend:${friendId}:name`);
        if (r1?.trim()) {
          if (alive) setFriendName(r1.trim());
          return;
        }
        const raw = await AsyncStorage.getItem(`u:${selfUid}:friends.nameOverrides`);
        const map: Record<string, string> = raw ? JSON.parse(raw) : {};
        const n = String(map[String(friendId)] || '').trim();
        if (n) {
          if (alive) setFriendName(n);
          return;
        }
        if (alive && paramName) setFriendName(paramName);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [friendId, selfUid, paramName]);

  /** 카드에 보이는 이름: 별명 > 해시/대화명 규칙(resolve) > 라우트 힌트 > uid */
  const cardDisplayName = useMemo(() => {
    const custom = String(friendName || '').trim();
    if (custom && custom !== '친구') return custom;
    const fromProf = friendProfile
      ? resolveChatDisplayNameFromUserDoc(String(friendId || ''), friendProfile as Record<string, unknown>).trim()
      : '';
    return fromProf || paramName || String(friendId || '친구');
  }, [friendName, friendProfile, paramName, friendId]);

  useEffect(() => {
    if (!friendProfile) return;
    const fromSnap = resolveChatDisplayNameFromUserDoc(String(friendId || ''), friendProfile as Record<string, unknown>).trim();
    if (!fromSnap) return;
    setFriendName((prev) => {
      const p = String(prev || '').trim();
      if (p && p !== '친구') return prev;
      return fromSnap;
    });
  }, [friendProfile, friendId]);

  // 보물창고는 본인 전용: 상대 프로필 열면 강제로 grid 유지
  useEffect(() => {
    if (!isSelf && activeTab !== 'grid') setActiveTab('grid');
  }, [isSelf, activeTab]);

  const rebuildGrid = React.useCallback(() => {
    try {
      const state = useMediaStore.getState();
      const me = firebaseAuth.currentUser?.uid || (useChatProfileStore.getState().currentProfile?.userId || '');
      const owner = String(friendId) === String(me);
      // 스토어가 비어있으면 레거시 저장소에서 강제 마이그레이션 시도
      try {
        const hasAny = ((state.byLocation.gallery||[]).length + (state.byLocation.treasure||[]).length) > 0;
        if (!hasAny) {
          const uidForRead = String(friendId || me);
          void useMediaStore.getState().migrateFromLegacy(uidForRead);
        }
      } catch {}
      // PUBLIC ONLY: gallery에서 공개 항목만 (treasure와 중복된 URI는 제외)
      // 소유자일 때는 SSOT(store) 기준을 우선 사용하고, 그 외에는 폴백(AsyncStorage) 사용
      if (owner) {
        const idsG = (state.byLocation.gallery || []) as string[];
        const idsT = (state.byLocation.treasure || []) as string[];
        const listG = idsG.map(id => state.items[id]).filter(Boolean) as any[];
        const listT = idsT.map(id => state.items[id]).filter(Boolean) as any[];
        const treasureSet = new Set<string>();
        listT.forEach((it:any)=> { const u = String(it?.uriHttp || it?.uriData || ''); const k = normalizeUriKey(u); if (k) treasureSet.add(k); });
        if (listG.length > 0) {
          const seen = new Set<string>();
          const uniq: Array<{ uri: string; public?: boolean; createdAt?: number }> = [];
          listG
            .filter((it:any)=> it.visibility !== 'private')
            .sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0))
            .forEach((it:any) => {
              const u = String(it.uriHttp || it.uriData || '');
              const key = normalizeUriKey(u);
              if (!u || !key || treasureSet.has(key) || seen.has(key)) return; // treasure에 있으면 제외
              seen.add(key);
              const t = String(it?.type||'') as any;
              const type = (t==='image'||t==='video'||t==='file'||t==='link') ? (t as any) : (():any=>{ try { const guess = mediaDetectType(u); return guess as any; } catch { return 'image' as any; } })();
              const finalType = (type==='qr')? 'qr' : type;
              uniq.push({ uri: u, public: true, createdAt: it.createdAt, type: finalType });
            });
          // 스토어에 갤러리 id는 있으나 uri가 비어 있거나 전부 제외된 경우 AsyncStorage 폴백
          if (uniq.length > 0) {
            setGridItems(uniq);
            return;
          }
        }
      }

      // 폴백: AsyncStorage에서 공개(비공개 제외) + treasure 제외
      (async () => {
        try {
          // 친구 프로필에서도 동작하도록 friendId 기준 키 사용
          const uidForRead = String(friendId || me);
          const keyG = `u:${uidForRead}:chat.media.items`;
          const keyT = `u:${uidForRead}:treasure.items`;
          const [rawG, rawGlobal, rawT] = await Promise.all([
            AsyncStorage.getItem(keyG),
            AsyncStorage.getItem('chat.media.items'),
            AsyncStorage.getItem(keyT),
          ]);
          const treasureUris = new Set<string>();
          try { const t = rawT ? JSON.parse(rawT) : []; (t||[]).forEach((it:any)=>{ if (it?.uri) { const k = normalizeUriKey(String(it.uri)); if (k) treasureUris.add(k); } }); } catch {}
          const acc: Array<{ uri:string; createdAt?:number; public?:boolean; type?: any }> = [];
          const load = (raw?: string | null) => {
            if (!raw) return; try { const arr = JSON.parse(raw); if (Array.isArray(arr)) {
              arr.forEach((v:any)=>{ const uri = typeof v==='string'? v : v?.uri; if (!uri) return; const isPublic = (typeof v==='string') ? true : (v?.public !== false); const k = normalizeUriKey(String(uri)); if (!isPublic || !k || treasureUris.has(k)) return; const t = (typeof v==='string'? undefined : v?.type); const ty = (t==='image'||t==='video'||t==='file'||t==='link') ? t : mediaDetectType(String(uri)); acc.push({ uri, createdAt: (typeof v==='string'?0:(v?.createdAt??0)), public: true, type: (ty==='qr'?'qr':ty) }); });
            } } catch {}
          };
          load(rawG); load(rawGlobal);
          const seen = new Set<string>();
          const uniq: Array<{ uri: string; public?: boolean; createdAt?: number }> = [];
          acc.sort((a,b)=> (b.createdAt??0)-(a.createdAt??0)).forEach((it)=>{
            const key = normalizeUriKey(it.uri); if (!key || seen.has(key)) return; seen.add(key); uniq.push({ uri: it.uri, public: true, createdAt: it.createdAt });
          });
          // detect type for each uniq if missing
          const withType = uniq.map((x)=> ({ ...x, type: x.type || (():any=>{ try { return mediaDetectType(String(x.uri)); } catch { return 'image' as any; } })() }));
          setGridItems(withType);
        } catch { setGridItems([]); }
      })();
    } catch { setGridItems([]); }
  }, [friendId]);

  useEffect(() => { rebuildGrid(); }, [rebuildGrid]);
  useFocusEffect(React.useCallback(() => { rebuildGrid(); return () => {}; }, [rebuildGrid]));
  // 탭 재진입 또는 외부 전환 후 돌아올 때도 최신 상태 로드
  useEffect(() => { const t = setTimeout(() => { try { rebuildGrid(); } catch {} }, 50); return () => clearTimeout(t); }, [friendId, rebuildGrid]);
  useEffect(() => {
    const unsub = useMediaStore.subscribe(() => rebuildGrid());
    return () => { try { unsub(); } catch {} };
  }, [rebuildGrid]);

  /** 그리드(공개) → 보물창고(비공개) — 나만 보기 */
  const moveGridSelectionToTreasure = React.useCallback(async () => {
    if (!isSelf) return;
    const sel = Array.from(gridSelected);
    if (!sel.length) return;
    const store = useMediaStore.getState();
    for (const rawUri of sel) {
      const id = mediaIdForUri(rawUri);
      const existing = store.items[id];
      const meta = gridItems.find((g) => normalizeUriKey(String(g.uri)) === normalizeUriKey(String(rawUri)));
      const ty = inferStoreMediaType(String(rawUri), meta?.type);
      store.addOrUpdate({
        id,
        uriHttp: /^https?:/i.test(rawUri) ? rawUri : existing?.uriHttp,
        uriData: !/^https?:/i.test(rawUri) ? rawUri : existing?.uriData,
        name: existing?.name,
        visibility: 'private',
        location: 'treasure',
        protect: true,
        type: ty,
        createdAt: existing?.createdAt ?? Date.now(),
      });
    }
    try {
      const raw = await AsyncStorage.getItem(galleryKey);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const next = list.filter((it: any) => {
        const u = typeof it === 'string' ? it : it?.uri;
        if (!u) return true;
        return !sel.some((s) => normalizeUriKey(String(s)) === normalizeUriKey(String(u)));
      });
      await AsyncStorage.setItem(galleryKey, JSON.stringify(next));
    } catch {}
    clearGridSel();
    rebuildGrid();
    Alert.alert('보물창고', '선택한 항목을 비공개(보물창고)로 옮겼습니다.');
  }, [isSelf, gridSelected, gridItems, galleryKey, clearGridSel, rebuildGrid]);

  // 팔로우 스토어 초기화(실시간 구독)
  const initFollow = useFollowStore((s)=> s.initialize);
  useEffect(() => { try { initFollow(); } catch {} }, [initFollow]);

  // 상대 프로필일 때 상대 팔로워/팔로잉 실시간 구독
  useEffect(() => {
    if (!friendId || String(friendId) === String(selfUid)) return;
    try {
      const unsub1 = onSnapshot(collection(firestore, 'users', String(friendId), 'followers'), (snap) => {
        setTargetFollowersCount(snap.size);
      });
      const unsub2 = onSnapshot(collection(firestore, 'users', String(friendId), 'following'), (snap) => {
        setTargetFollowingCount(snap.size);
      });
      return () => { try { unsub1(); } catch {}; try { unsub2(); } catch {}; };
    } catch {
      setTargetFollowersCount(0); setTargetFollowingCount(0);
    }
  }, [friendId, selfUid]);

  // 정렬(열 수) 고정: 별도 저장/선택 UI 제거

  // 내 프로필 아바타 자동 복구(이전 dataURL/레거시 저장분 → Storage 업로드 후 HTTPS URL로 교체)
  useEffect(() => {
    (async () => {
      try {
        const me = firebaseAuth.currentUser?.uid || '';
        const owner = String(friendId) === String(me);
        if (!owner) return;
        const currentAvatar = String(friendProfile?.avatar || '');
        if (currentAvatar && /^https?:\/\//i.test(currentAvatar)) return; // 이미 정상

        // 1) 최근 저장 이력에서 우선 복구
        try {
          const last = await AsyncStorage.getItem(`u:${me}:chat.profile.lastAvatar`);
          if (last && /^https?:\/\//i.test(last)) {
            useChatProfileStore.getState().setAvatar(last);
            useChatProfileStore.getState().updateProfile({ avatar: last });
            setFriendProfile(p => ({ ...(p||{}), avatar: last }));
            return;
          }
        } catch {}

        // 2) 레거시 갤러리/글로벌에서 하나 찾기
        const keys = [`u:${me}:chat.media.items`, 'chat.media.items'];
        let candidate: string | null = null;
        for (const k of keys) {
          try {
            const raw = await AsyncStorage.getItem(k);
            const arr: any[] = raw ? JSON.parse(raw) : [];
            const first = arr.find((it:any)=> it?.uri && (typeof it.uri === 'string'));
            if (first?.uri) { candidate = String(first.uri); break; }
          } catch {}
        }
        if (!candidate) return;

        // 3) HTTPS면 바로 적용, dataURL이면 업로드 후 적용
        let finalUrl = candidate;
        if (/^data:/i.test(candidate)) {
          try {
            const realUid = await ensureAuthedUid();
            const path = `chatMedia/${realUid}/avatar_${Date.now()}_migrated.jpg`;
            const r = storageRef(firebaseStorage, path);
            await uploadString(r, candidate, 'data_url');
            finalUrl = await getDownloadURL(r);
          } catch {}
        }
        if (finalUrl) {
          useChatProfileStore.getState().setAvatar(finalUrl);
          useChatProfileStore.getState().updateProfile({ avatar: finalUrl });
          setFriendProfile(p => ({ ...(p||{}), avatar: finalUrl }));
          try { await AsyncStorage.setItem(`u:${me}:chat.profile.lastAvatar`, finalUrl); } catch {}
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId]);

  // 친구 연락처 로드 (로컬 캐시 기준)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`u:${selfUid}:local.friends`);
        if (!raw) return;
        const list: any[] = JSON.parse(raw) || [];
        const f = list.find((x) => String(x.id) === String(friendId));
        if (f) { setFriendPhone(f.phone || null); setFriendEmail(f.email || null); }
      } catch {}
    })();
  }, [friendId]);

  // 차단 상태 로드
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`u:${selfUid}:friends.blocked`);
        const arr: string[] = raw ? JSON.parse(raw) : [];
        setIsBlocked(arr.includes(String(friendId)));
      } catch { setIsBlocked(false); }
    })();
  }, [friendId]);

  const handleToggleBlock = async () => {
    try {
      const raw = await AsyncStorage.getItem(`u:${selfUid}:friends.blocked`);
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const id = String(friendId);
      const next = isBlocked ? arr.filter(v => v !== id) : Array.from(new Set([...arr, id]));
      await AsyncStorage.setItem(`u:${selfUid}:friends.blocked`, JSON.stringify(next));
      setIsBlocked(!isBlocked);
    } catch {}
  };

  const handleStartChat = async () => {
    try {
      const me = firebaseAuth.currentUser?.uid || '';
      if (!me || !friendId) return;
      const roomId = await getOrCreateDmRoomIdForUsersV2(firestore as any, me, String(friendId));
      router.push({ pathname: '/chatv2/room', params: { id: roomId } } as any);
    } catch (e: any) {
      try {
        Alert.alert('안내', String(e?.message || e || '대화방을 열 수 없습니다.'));
      } catch {}
    }
  };

  const ensureDmRoom = async (): Promise<string | null> => {
    try {
      const me = firebaseAuth.currentUser?.uid || 'me';
      const id = await (useKakaoRoomsStore as any).getState().getOrCreateDmRoom(me, String(friendId));
      return id;
    } catch { return null; }
  };

  const handleSendAlarmMessage = async () => {
    setComposeOpen(true);
  };

  const handleComposeSend = async () => {
    const text = composeText.trim();
    if (!text) { Alert.alert('안내','메세지 내용을 입력하세요.'); return; }
    try {
      const roomId = await ensureDmRoom();
      const me = firebaseAuth.currentUser?.uid || 'me';
      if (roomId) {
        useKakaoRoomsStore.getState().sendMessage(roomId, me, text, 'text');
        // 수신자에게 알림 생성(로컬 스토어 데모)
        try {
          useNotificationStore.getState().addNotification({ type: 'message', title: '새 메시지', content: text, channelId: roomId, senderId: me, senderName: String(friendName) });
        } catch {}
      }
      setComposeText(''); setComposeOpen(false);
      Alert.alert('전송됨','메세지를 보냈습니다.');
    } catch { Alert.alert('오류','메세지 전송에 실패했습니다.'); }
  };

  const handleSaveName = async () => {
    try {
      // 단일 키(구버전 호환)
      await AsyncStorage.setItem(`friend:${friendId}:name`, String(friendName));
      // 이름 오버라이드 맵 갱신(계정별)
      try {
        const raw = await AsyncStorage.getItem(`u:${selfUid}:friends.nameOverrides`);
        const map: Record<string,string> = raw ? JSON.parse(raw) : {};
        map[String(friendId)] = String(friendName);
        await AsyncStorage.setItem(`u:${selfUid}:friends.nameOverrides`, JSON.stringify(map));
      } catch {}
      router.back();
    } catch { router.back(); }
  };

  const handleRenameCommit = async () => {
    const next = String(tempName || '').trim();
    if (!next) { setRenameOpen(false); return; }
    setFriendName(next);
    try {
      await AsyncStorage.setItem(`u:${selfUid}:friend:${friendId}:name`, next);
      const raw = await AsyncStorage.getItem(`u:${selfUid}:friends.nameOverrides`);
      const map: Record<string,string> = raw ? JSON.parse(raw) : {};
      map[String(friendId)] = next;
      await AsyncStorage.setItem(`u:${selfUid}:friends.nameOverrides`, JSON.stringify(map));
    } catch {}
    setRenameOpen(false);
  };

  // 프로필 아바타 소스: 다른 조건 없이
  const currentProfileAvatar = useChatProfileStore((s)=> s.currentProfile?.avatar || '');
  const [headerResolved, setHeaderResolved] = useState<string>('');
  const headerAvatar = useMemo(() => {
    const raw = isSelf ? currentProfileAvatar : String(friendProfile?.avatar || '');
    return String(headerResolved || raw || '');
  }, [isSelf, currentProfileAvatar, friendProfile?.avatar, headerResolved]);
  useEffect(() => {
    (async () => {
      try {
        const raw = isSelf ? currentProfileAvatar : String(friendProfile?.avatar || '');
        if (!raw) { setHeaderResolved(''); return; }
        if (/^https?:\/\//i.test(String(raw)) || /^data:/i.test(String(raw))) { setHeaderResolved(''); return; }
        const url = await getDownloadURL(storageRef(firebaseStorage, String(raw)));
        setHeaderResolved(url);
      } catch { setHeaderResolved(''); }
    })();
  }, [isSelf, currentProfileAvatar, friendProfile?.avatar]);

  // 서버 프로필 실시간 구독: 본인/상대 구분 없이 users/{friendId}를 구독하여 아바타/대화명 변경 즉시 반영
  useEffect(() => {
    if (!friendId) return;
    try {
      const { doc, onSnapshot } = require('firebase/firestore');
      const unsub = onSnapshot(doc(firestore, 'users', String(friendId)), async (snap: any) => {
        try {
          if (!snap.exists()) return;
          const d: any = snap.data() || {};
          let avatar: string | undefined = d.avatarUrl || d.photoURL || d.avatar || undefined;
          try {
            if (avatar && !/^https?:\/\//i.test(String(avatar))) {
              const url = await getDownloadURL(storageRef(firebaseStorage, String(avatar)));
              avatar = url;
            }
          } catch {}
          const prof = {
            id: `chat_profile_${friendId}`,
            userId: String(friendId),
            displayName: d.displayName || '',
            chatName: d.chatName || d.displayName || '',
            nickname: d.nickname || '',
            useHashInChat: d.useHashInChat === true,
            avatar,
            status: 'online',
            createdAt: Date.now(),
            lastActive: Date.now(),
          };
          try { useChatProfileStore.getState().updateProfileById(String(friendId), prof as any); } catch {}
          setFriendProfile((prev) => ({ ...(prev || {}), ...prof }));
        } catch {}
      }, () => {});
      return () => { try { unsub(); } catch {} };
    } catch { return; }
  }, [friendId]);

  // 아바타/ID 기반 일관 랜덤 포인트 컬러
  const accentColor = useMemo(() => {
    try {
      const src = String(headerAvatar || friendProfile?.avatar || friendId || friendName || 'yoy');
      const palette = ['#FFD700','#77DD77','#AEC6CF','#FFB3BA','#CFCFFF','#B0E0E6','#F4A460','#98FB98','#DAA520'];
      let h = 0;
      for (let i=0;i<src.length;i++) { h = ((h<<5)-h) + src.charCodeAt(i); h |= 0; }
      const idx = Math.abs(h) % palette.length;
      return palette[idx];
    } catch { return '#FFD700'; }
  }, [headerAvatar, friendProfile?.avatar, friendId, friendName]);

  // 팔로우/팔로워 스토어
  const followingCount = useFollowStore((s)=> s.followingCount);
  const followersCount = useFollowStore((s)=> s.followersCount);
  const unreadFollowerEventsCount = useFollowStore((s)=> s.unreadFollowerEventsCount);
  const followersEvents = useFollowStore((s)=> s.followersEvents);
  const follow = useFollowStore((s)=> s.follow);
  const unfollow = useFollowStore((s)=> s.unfollow);
  const isFollowing = useFollowStore((s)=> s.isFollowing);
  const markAllRead = useFollowStore((s)=> s.markAllRead);

  return (
    <ThemedView style={styles.container}>
      {/* rooms와 동일한 상단바 복구: 좌 60%(프로필), 우 40%(아이콘) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.profileButton}
            onPress={() => router.push('/chat/profile-settings')}
          >
            <View style={styles.profileImage}>
              {useChatProfileStore.getState().currentProfile?.avatar ? (
                <ImgC source={{ uri: String(useChatProfileStore.getState().currentProfile?.avatar||'') }} style={styles.profileImagePlaceholder} {...(EImage?{contentFit:'cover'}:{})} />
              ) : (
                <Text style={styles.profileText}>👤</Text>
              )}
            </View>
            <View style={styles.profileStatus}><Text style={styles.profileStatusText}>🟢</Text></View>
          </TouchableOpacity>
          <View style={styles.profilePreview}>
            <ThemedText style={styles.profilePreviewName} numberOfLines={1}>{useChatProfileStore.getState().currentProfile?.displayName || '사용자'}</ThemedText>
            <ThemedText style={styles.profilePreviewStatus} numberOfLines={1}>{useChatProfileStore.getState().currentProfile?.customStatus || t('chat', language)}</ThemedText>
          </View>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon} onPress={()=>router.push('/chat/notifications' as any)}><Text style={styles.iconText}>🔔</Text></TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={()=>router.push('/chat/friends')}><Text style={styles.iconText}>👥</Text></TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={()=>router.push('/chat/rooms')}><Text style={styles.iconText}>💬</Text></TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={()=>router.push('/chat/settings')}><Text style={styles.iconText}>⚙️</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* 프로필 헤더 (항상 표시, 내 프로필 사진은 상단바와 동일 소스 우선) */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {/* 닫기(X) 버튼 - 팔로잉 영역 상단 우측에 오버레이 */}
          <TouchableOpacity onPress={()=>router.back()} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:'row', alignItems:'center' }}>
            <View style={styles.avatarWrapLg}>
              {headerAvatar ? (
                <ImgC source={{ uri: headerAvatar }} style={styles.avatarImg} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />
              ) : (
                <View style={styles.avatarFallback}><ThemedText style={styles.avatarFallbackText}>{String(friendName).charAt(0)}</ThemedText></View>
              )}
            </View>
            <View style={{ flex: 1, flexDirection:'row', justifyContent:'space-around' }}>
              <View style={styles.countBox}><Text style={styles.countNum}>{gridItems.length}</Text><Text style={styles.countLabel}>{t('posts', language)}</Text></View>
              <TouchableOpacity
                onPress={() => { setFollowersOpen(v => { const n=!v; if (!v) { try { markAllRead(); } catch {} } return n; }); }}
                style={styles.countBox}
              >
                <Text style={styles.countNum}>{isSelf ? followersCount : targetFollowersCount}</Text>
                <View style={{ flexDirection:'row', alignItems:'center' }}>
                  <Text style={styles.countLabel}>{t('followers', language)}</Text>
                  {isSelf && unreadFollowerEventsCount > 0 && (
                    <View style={styles.badgeSmall}><Text style={styles.badgeSmallText}>{unreadFollowerEventsCount}</Text></View>
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.countBox}><Text style={styles.countNum}>{isSelf ? followingCount : targetFollowingCount}</Text><Text style={styles.countLabel}>{t('following', language)}</Text></View>
            </View>
          </View>
          {/* 친구 이름 + 편집 버튼 (별명) */}
          <View style={{ marginTop: 12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <Text style={{ color:'#F6F6F6', fontWeight:'800', fontSize:16 }} numberOfLines={1}>{friendName}</Text>
            <TouchableOpacity onPress={()=>{ setTempName(friendName); setRenameOpen(true); }} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#FFD700' }}>
              <Text style={{ color:'#FFD700', fontWeight:'800' }}>편집</Text>
            </TouchableOpacity>
          </View>
          {/* 상세소개/마지막 접속 */}
          <View style={{ marginTop: 10 }}>
            {!!friendProfile?.bio && (
              <View style={[styles.bioBox, { borderColor: accentColor }]}>
                <Text style={styles.bioText}>{friendProfile.bio}</Text>
              </View>
            )}
            {!!friendProfile?.lastActive && (
              <View style={{ alignItems:'flex-end' }}>
                <Text style={styles.lastActive}>{t('lastSeen', language)}: {new Date(friendProfile.lastActive).toLocaleString(language==='ko'?'ko-KR':language==='ja'?'ja-JP':language==='zh'?'zh-CN':'en-US')}</Text>
              </View>
            )}
          </View>
          {/* 액션 버튼들 */}
          <View style={styles.actionRowTop}>
            <TouchableOpacity style={[styles.actionPill, { flex: 1 }]} onPress={handleSendAlarmMessage}><Text style={styles.actionPillText}>{t('message', language)}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionPill, { flex: 1 }]} onPress={handleStartChat}><Text style={styles.actionPillText}>{t('chatAction', language)}</Text></TouchableOpacity>
            {!isSelf && (
              isFollowing(String(friendId)) ? (
                <TouchableOpacity style={[styles.actionPill, { flex: 1, borderColor:'#2A2A2A' }]} onPress={()=>unfollow(String(friendId))}><Text style={[styles.actionPillText,{ color:'#CFCFCF' }]}>{t('unfollow', language)}</Text></TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.actionPill, { flex: 1 }]} onPress={()=>follow(String(friendId))}><Text style={styles.actionPillText}>{t('follow', language)}</Text></TouchableOpacity>
              )
            )}
            <TouchableOpacity style={[styles.actionPill, isBlocked && { borderColor:'#2A2A2A', opacity:0.7 }]} onPress={handleToggleBlock}>
              <Text style={styles.actionPillText}>
                {language==='ko' ? (isBlocked ? '차단 해제' : '차단') : (isBlocked ? t('unblock', language) : t('block', language))}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 팔로워 이벤트 토글 리스트 */}
        {isSelf && followersOpen && (
          <View style={styles.followersPanel}>
            {followersEvents.length === 0 ? (
              <View style={{ paddingVertical: 10, alignItems:'center' }}><Text style={{ color:'#9BA1A6' }}>{t('noNewFollowers', language)}</Text></View>
            ) : (
              followersEvents.map(ev => (
                <View key={ev.id} style={styles.followerItem}>
                  <View style={{ flex:1 }}>
                    <Text style={styles.followerName} numberOfLines={1}>{ev.name || ev.userId}</Text>
                    {!!ev.message && (<Text style={styles.followerMsg} numberOfLines={2}>{ev.message}</Text>)}
                    <Text style={styles.followerTime}>{new Date(ev.timestamp).toLocaleString('ko-KR')}</Text>
                  </View>
                  {isFollowing(ev.userId) ? (
                    <View style={[styles.followBtn,{ borderColor:'#2A2A2A' }]}><Text style={[styles.followBtnText,{ color:'#CFCFCF' }]}>{t('followingLabel', language)}</Text></View>
                  ) : (
                    <TouchableOpacity onPress={()=>follow(ev.userId)} style={styles.followBtn}><Text style={styles.followBtnText}>{t('followBack', language)}</Text></TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* 탭 (그리드/보물창고) - 보물창고는 본인에게만 표시 */}
        <View style={[styles.tabsRow, { justifyContent:'space-between' }]}>
          {/* Left 50%: Grid (정렬 아이콘 제거) */}
          <TouchableOpacity onPress={() => setActiveTab('grid')} style={[styles.tabHalf, activeTab==='grid' && styles.tabHalfActive]}>
            <Text style={[styles.tabText, activeTab==='grid' && styles.tabTextActive]}>{t('grid', language)}</Text>
          </TouchableOpacity>

          {/* Right 50%: Treasure (only self) */}
          {isSelf && (
            <TouchableOpacity onPress={() => setActiveTab('tagged')} style={[styles.tabHalf, activeTab==='tagged' && styles.tabHalfActive]}>
              <Text style={[styles.tabText, activeTab==='tagged' && styles.tabTextActive]}>{t('treasure', language)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {(!isSelf || activeTab === 'grid') ? (
          gridItems.length === 0 ? (
            <View style={styles.empty}><ThemedText style={{ color:'#777' }}>{t('noPosts', language)}</ThemedText></View>
          ) : (
            <View style={[styles.gridWrap, { paddingHorizontal: 16 }]}>
              {gridItems.map((it, idx)=> {
                const kind = (it.type as any) || (mediaDetectType(String(it.uri)) as any);
                // 링크 썸네일 선로딩
                if (kind === 'link') { try { void ensureLinkMeta(String(it.uri)); } catch {} }
                const renderThumb = () => {
                  if (kind === 'image' || kind === 'qr' || !kind) {
                    const src = gridOverrideThumbs[idx] || String(it.uri);
                    if (gridBroken[idx]) {
                      const ph = 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\"><rect width=\"100%\" height=\"100%\" fill=\"%23111111\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" fill=\"%23FFD700\" font-size=\"28\" font-weight=\"900\">IMG</text></svg>';
                      return (<ImgC source={{ uri: ph }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />);
                    }
                    return (
                      <ImgC
                        source={{ uri: src }}
                        style={styles.gridImage}
                        {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})}
                        onError={async () => {
                          try {
                            const fixed = await normalizeThumbUri(src);
                            if (fixed) { setGridOverrideThumbs(p=>({ ...p, [idx]: fixed })); return; }
                          } catch {}
                          setGridBroken(p=>({ ...p, [idx]: true }));
                        }}
                      />
                    );
                  }
                  if (kind === 'video') {
                    return (Platform.OS === 'web'
                      ? (<video src={String(it.uri)} style={{ width:'100%', height:'100%', objectFit:'cover' }} muted playsInline preload="metadata" autoPlay />)
                      : (()=>{
                          const data = 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"180\"><rect width=\"100%\" height=\"100%\" fill=\"%23111111\"/><polygon points=\"130,90 210,135 210,45\" fill=\"%23FFD700\"/></svg>';
                          return (<ImgC source={{ uri: data }} style={styles.gridImage} {...(EImage?{contentFit:'cover'}:{})} />);
                        })());
                  }
                  if (kind === 'file') {
                    const name = deriveName(String(it.uri));
                    const ext = String(name).split('.').pop()?.toLowerCase() || '';
                    const svg = fileIconSvg(ext);
                    return (<ImgC source={{ uri: svg }} style={styles.gridImage} {...(EImage?{contentFit:'cover'}:{})} />);
                  }
                  if (kind === 'link') {
                    const meta = linkMetaRef.current[String(it.uri)] || {};
                    const yt = ytThumbFor(String(it.uri));
                    const thumb = meta.image || yt || faviconFor(String(it.uri)) || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23111111"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23FFD700" font-size="28">LINK</text></svg>';
                    return (<ImgC source={{ uri: thumb }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />);
                  }
                  // other
                  return (<View style={{ flex:1, backgroundColor:'#111' }} />);
                };
                const title = (() => {
                  if (kind === 'file') return deriveName(String(it.uri));
                  if (kind === 'link') { const m = linkMetaRef.current[String(it.uri)] || {}; return m.title || deriveName(String(it.uri)); }
                  if (kind === 'video') return deriveName(String(it.uri));
                  return '';
                })();
                const onPress = () => {
                  if (gridSelecting) { toggleGridSel(it.uri); return; }
                  try { setPreviewIndex(idx); setPreviewOpen(true); } catch {}
                };
                return (
                <View key={it.uri} style={[styles.gridCell, { flexBasis: '25%', maxWidth: '25%' }]}>
                  <TouchableOpacity onLongPress={()=>{ setGridSelecting(true); toggleGridSel(it.uri); }} onPress={()=>{ setPreviewIndex(idx); onPress(); }} activeOpacity={0.9} style={styles.gridItem}>
                      {renderThumb()}
                      {!!title && (
                        <View style={{ position:'absolute', left:6, right:28, bottom:6 }}>
                          <Text style={{ color:'#CFCFCF', fontSize:11 }} numberOfLines={1}>{title}</Text>
                        </View>
                      )}
                      {gridSelecting && (
                        <View style={{ position:'absolute', left:4, top:4, width:18, height:18, borderRadius:9, borderWidth:1, borderColor:'#FFD700', backgroundColor: gridSelected.has(it.uri)?'#FFD700':'transparent', alignItems:'center', justifyContent:'center' }}>
                          {gridSelected.has(it.uri) && <Text style={{ color:'#111', fontSize:10, fontWeight:'800' }}>✓</Text>}
                        </View>
                      )}
                      {it.public === false && (
                        <View style={{ position:'absolute', right:4, top:4, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                          <Text style={{ color:'#FFD700', fontSize:11 }}>🔒</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )
        ) : (
          <TreasureBox friendId={friendId} friendName={friendName} />
        )}
      </ScrollView>

      {/* 그리드 선택 하단 고정바 */}
      {activeTab==='grid' && gridSelecting && (
        <FixedBottomBar>
          {isSelf && (
            <TouchableOpacity style={[styles.bulkBtn, styles.chipMini]} onPress={async ()=>{ try { const sel = Array.from(gridSelected); if (!sel.length) return; // remove from gallery
              const raw = await AsyncStorage.getItem(galleryKey); const list: any[] = raw? JSON.parse(raw): []; const next = list.filter((it:any)=> !sel.includes(String(it?.uri||it))); await AsyncStorage.setItem(galleryKey, JSON.stringify(next));
              try { const ids = sel.map(u=> mediaIdForUri(String(u))); useMediaStore.getState().remove(ids); } catch {}
              setGridItems(prev=> prev.filter(it=> !sel.includes(it.uri))); clearGridSel(); } catch {} }}>
              <Text style={styles.chipMiniText}>삭제</Text>
            </TouchableOpacity>
          )}
          {isSelf && (
            <TouchableOpacity style={[styles.bulkBtn, styles.chipMini]} onPress={() => { void moveGridSelectionToTreasure(); }}>
              <Text style={styles.chipMiniText}>비공개</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.bulkBtn, styles.chipMini]} onPress={()=>{ try { const first = Array.from(gridSelected)[0]; if (first) { const kind = mediaDetectType(String(first)); const store = require('@/src/features/chat/store/forward-modal.store'); (store as any).useForwardModalStore.getState().open({ imageUrl:String(first), name: kind||'media' }); } } catch {} }}>
            <Text style={styles.chipMiniText}>보내기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, styles.chipMini]} onPress={clearGridSel}>
            <Text style={styles.chipMiniText}>취소</Text>
          </TouchableOpacity>
        </FixedBottomBar>
      )}

      {/* 이름 편집 모달 */}
      <Modal transparent visible={renameOpen} animationType="fade" onRequestClose={()=>setRenameOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>이름 편집</Text>
            <TextInput value={tempName} onChangeText={setTempName} style={styles.modalInput} placeholder="표시 이름" placeholderTextColor="#777" maxLength={24} />
            <View style={{ flexDirection:'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[styles.actionPill, { flex:1 }]} onPress={handleRenameCommit}><Text style={styles.actionPillText}>저장</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionPill, { flex:1, borderColor:'#2A2A2A' }]} onPress={()=>setRenameOpen(false)}><Text style={[styles.actionPillText, { color:'#CFCFCF' }]}>취소</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 메세지 작성 모달 */}
      <Modal transparent visible={composeOpen} animationType="fade" onRequestClose={()=>setComposeOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>메세지 보내기</Text>
            <TextInput value={composeText} onChangeText={setComposeText} style={[styles.modalInput,{height:88}]} placeholder="메세지 내용을 입력" placeholderTextColor="#777" multiline maxLength={500} />
            <View style={{ flexDirection:'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[styles.actionPill, { flex:1 }]} onPress={handleComposeSend}><Text style={styles.actionPillText}>보내기</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionPill, { flex:1, borderColor:'#2A2A2A' }]} onPress={()=>setComposeOpen(false)}><Text style={[styles.actionPillText, { color:'#CFCFCF' }]}>취소</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MediaPreviewModalV2
        visible={previewOpen}
        msg={previewIndex >= 0 ? (gridPreviewChain[previewIndex] || null) : null}
        previewChain={gridPreviewChain}
        previewIndex={Math.max(0, previewIndex)}
        onPreviewIndexChange={setPreviewIndex}
        onClose={() => setPreviewOpen(false)}
        onForward={async (m) => {
          try {
            const u = String((m as any)?.url || '');
            if (!u) return;
            const store = require('@/src/features/chat/store/forward-modal.store');
            setPreviewOpen(false);
            setTimeout(() => {
              try { store.useForwardModalStore.getState().open({ imageUrl: u, name: 'media' }); } catch {}
            }, 0);
          } catch {}
        }}
      />
    </ThemedView>
  );
}

function TreasurePreviewBridge() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Array<{ uri: string; type?: string; roomId?: string; senderId?: string }>>([]);
  const [index, setIndex] = useState<number>(0);
  useEffect(() => {
    (globalThis as any).__treasureOpen = (payload: any, legacyKind?: string) => {
      try {
        if (payload && typeof payload === 'object' && Array.isArray(payload.list)) {
          const arr = payload.list as Array<{ uri: string; type?: string }>;
          const idx = Math.max(0, Math.min(arr.length - 1, Number(payload.index) || 0));
          setList(arr);
          setIndex(idx);
          setOpen(true);
          return;
        }
        // 레거시 시그니처(u, kind)
        const u = String(payload || '');
        setList([{ uri: u, type: legacyKind }]);
        setIndex(0);
        setOpen(true);
      } catch {}
    };
    return () => { try { delete (globalThis as any).__treasureOpen; } catch {} };
  }, []);
  const toMsg = (it: { uri: string; type?: string; roomId?: string; senderId?: string }, i: number): ChatMessageV2 => {
    const uri = String(it?.uri || '').trim();
    let t = String(it?.type || '').toLowerCase().trim();
    if (!t) t = 'image';
    if (t === 'qr') t = 'image';
    if (t === 'link') t = 'url';
    if (t !== 'image' && t !== 'video' && t !== 'file' && t !== 'audio' && t !== 'url') t = 'image';
    return {
      id: `treasure-preview-${i}-${mediaIdForUri(uri)}`,
      roomId: String(it?.roomId || 'treasure'),
      senderId: String(it?.senderId || 'me'),
      type: t as any,
      status: 'sent',
      text: t === 'url' ? uri : '',
      url: uri,
      attachment: { id: `att-${mediaIdForUri(uri)}`, type: (t === 'url' ? 'file' : t) as any, originalName: '', remoteUrl: uri },
      createdAt: Date.now() + i,
      updatedAt: Date.now() + i,
    } as ChatMessageV2;
  };
  const chain = (list || []).map((it, i) => toMsg(it, i));
  return (
    <MediaPreviewModalV2
      visible={open}
      msg={chain[index] || null}
      previewChain={chain}
      previewIndex={Math.max(0, index)}
      onPreviewIndexChange={setIndex}
      onClose={() => setOpen(false)}
      onForward={async (m) => {
        try {
          const u = String((m as any)?.url || '');
          if (!u) return;
          const store = require('@/src/features/chat/store/forward-modal.store');
          setOpen(false);
          setTimeout(() => {
            try { store.useForwardModalStore.getState().open({ imageUrl: u, name: 'media' }); } catch {}
          }, 0);
        } catch {}
      }}
    />
  );
}

function FixedBottomBar({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ReactDOM = require('react-dom');
    const [node] = React.useState(() => { const d=document.createElement('div'); document.body.appendChild(d); return d; });
    React.useEffect(()=>()=>{ try { document.body.removeChild(node); } catch {} },[node]);
    return ReactDOM.createPortal(
      <View style={{ position:'fixed', left:12, right:12, bottom:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'rgba(0,0,0,0.65)', borderWidth:1, borderColor:'#333', paddingHorizontal:10, paddingVertical:8, borderRadius:12, zIndex:2147483647 }}>{children}</View>,
      node
    );
  }
  return (
    <View style={{ position:'absolute', left:12, right:12, bottom:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'rgba(0,0,0,0.65)', borderWidth:1, borderColor:'#333', paddingHorizontal:10, paddingVertical:8, borderRadius:12 }}>{children}</View>
  );
}

function TreasureBox({ friendId, friendName }: { friendId: string, friendName: string }) {
  const { language } = usePreferences();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all'|'image'|'video'|'file'|'link'|'qr'|'other'>('all');
  const [privateOnly, setPrivateOnly] = useState<boolean>(false);
  /** 인덱스가 아니라 URI 키로 선택 (필터·AsyncStorage 인덱스 불일치 방지) */
  const [treasureSelUris, setTreasureSelUris] = useState<Set<string>>(new Set());
  const [treasureSelecting, setTreasureSelecting] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const me = firebaseAuth.currentUser?.uid || (useChatProfileStore.getState().currentProfile?.userId || 'anonymous');
  /** 보물창고 편집·삭제는 본인만 */
  const isOwnerOrAdmin = String(me) === String(friendId);
  // 링크/파일 썸네일 & 제목 메타 (보물창고 전용)
  const linkMetaRef = React.useRef<Record<string, { title?: string; image?: string; host?: string }>>({});
  const [linkMetaTick, setLinkMetaTick] = useState(0);
  const faviconFor = React.useCallback((url:string) => { try { const u=new URL(url); if (u.hostname==='localhost' || u.hostname==='127.0.0.1') return ''; return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=128`; } catch { return ''; } }, []);
  const ytThumbFor = React.useCallback((url:string) => { try { const u=new URL(url); if (u.host.includes('youtube.com') || u.host.includes('youtu.be')) { let vid=''; const s=/\/shorts\/([\w-]+)/.exec(u.pathname); if (s) vid=s[1]; const v=u.searchParams.get('v'); if (!vid && v) vid=v; if (!vid && u.host.includes('youtu.be')) { const seg=u.pathname.replace(/^\//,''); if (seg) vid=seg; } if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`; } return ''; } catch { return ''; } }, []);
  // Local video key normalizer (same logic as profile grid)
  const normalizeVideoKey = React.useCallback((s:string)=>{ try { const u=new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { try { return String(s).split('?')[0]; } catch { return String(s||''); } } }, []);
  // Local thumbnail cache for Treasure tab
  const [videoThumbs2, setVideoThumbs2] = useState<Record<string, string>>({});
  const [overrideThumbs, setOverrideThumbs] = useState<Record<number, string>>({});
  const ensureLinkMeta = React.useCallback(async (linkUrl:string) => {
    if (linkMetaRef.current[linkUrl]) return;
    try {
      const u = new URL(linkUrl);
      try {
        const ne = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(linkUrl)}`);
        const j = await ne.json();
        if (j && (j.title || j.thumbnail_url)) {
          linkMetaRef.current[linkUrl] = { title: j.title || u.host, image: j.thumbnail_url || faviconFor(linkUrl), host: u.host };
          setLinkMetaTick(v=>v+1); return;
        }
      } catch {}
      linkMetaRef.current[linkUrl] = { title: u.host, image: faviconFor(linkUrl), host: u.host };
      setLinkMetaTick(v=>v+1);
    } catch {
      linkMetaRef.current[linkUrl] = { title: '링크', image: faviconFor(linkUrl), host: '' };
      setLinkMetaTick(v=>v+1);
    }
  }, [faviconFor]);
  const deriveName = React.useCallback((u:string) => { try { const U=new URL(u); const last=decodeURIComponent((U.pathname.split('/').pop()||'').replace(/\+/g,' ')); return last || U.host; } catch { const m=/([^\/\?#]+)(?:\?|#|$)/.exec(String(u)||''); return decodeURIComponent((m?.[1]||'').replace(/\+/g,' ')); } }, []);
  const fileIconSvg = React.useCallback((ext:string) => { const label=(ext||'file').toUpperCase(); const color=/pdf/i.test(label)?'%23E53935':(/docx?/i.test(label)?'%231E88E5':(/xlsx?/i.test(label)?'%232E7D32':(/pptx?/i.test(label)?'%23E67E22':'%23FFD700'))); return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23151515'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='${color}' font-size='36' font-weight='900'>${(label||'FILE').slice(0,6)}</text></svg>`; }, []);
  const reloadTreasure = React.useCallback(async () => {
    try {
      const st = useMediaStore.getState();
      // 스토어 비어있을 때 레거시 마이그레이션 시도
      try {
        const total = (st.byLocation?.treasure?.length||0) + (st.byLocation?.gallery?.length||0);
        if (total === 0 && friendId) { await useMediaStore.getState().migrateFromLegacy(String(friendId)); }
      } catch {}
      let fromStore = (st.byLocation.treasure || []).map((id:string)=> st.items[id]).filter(Boolean) as any[];
      // 추가: 스토어의 갤러리 항목 중 비공개(privacy)도 보물창고에 포함
      try {
        const privateFromGallery = (st.byLocation.gallery || [])
          .map((id:string)=> st.items[id])
          .filter((it:any)=> !!it && (it.visibility === 'private')) as any[];
        if (privateFromGallery.length) fromStore = [...fromStore, ...privateFromGallery];
      } catch {}
      // 폴백: 레거시 AsyncStorage
      if (!Array.isArray(fromStore) || fromStore.length === 0) {
        const key = `u:${friendId}:treasure.items`;
        const keyG = `u:${friendId}:chat.media.items`;
        const [rawT, rawG] = await Promise.all([
          AsyncStorage.getItem(key),
          AsyncStorage.getItem(keyG),
        ]);
        const tArr = rawT ? JSON.parse(rawT) : [];
        const gArr = rawG ? JSON.parse(rawG) : [];
        // gallery 쪽에서 public:false 인 항목도 함께 포함
        const privFromG = Array.isArray(gArr) ? gArr.filter((v:any)=> (typeof v==='object' && v?.public===false)) : [];
        fromStore = ([...(Array.isArray(tArr)?tArr:[]), ...privFromG]) || [];
      }
      const uniq: Record<string, any> = {};
      const normalize = (u:string) => { try { const url = new URL(String(u)); url.search=''; url.hash=''; return url.toString(); } catch { return String(u||''); } };
      (fromStore||[]).forEach((it:any) => {
        const uri = (typeof it === 'string') ? String(it) : String(it?.uri || it?.uriHttp || it?.uriData || '');
        const key = normalize(uri);
        if (!key) return;
        const baseType = (typeof it === 'string') ? undefined : (it?.type);
        const type = (baseType==='image'||baseType==='video'||baseType==='file'||baseType==='link'||baseType==='qr')
          ? baseType
          : (():any=>{ try { return mediaDetectType(String(uri)); } catch { return 'image' as any; } })();
        const createdAt = (typeof it === 'string') ? 0 : (it?.createdAt||0);
        const name = (typeof it === 'string') ? undefined : it?.name;
        const protect = (typeof it === 'string') ? true : !!it?.protect;
        if (!uniq[key]) uniq[key] = { uri, type, name, protect, createdAt };
        else { uniq[key].createdAt = Math.max(uniq[key].createdAt, createdAt); }
      });
      const final = Object.values(uniq).sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0));
      setItems(final);
    } catch { setItems([]); }
  }, [friendId]);
  useEffect(() => { reloadTreasure(); }, [reloadTreasure]);
  // 썸네일 사전 보정: content://, file:// → data: (상위 24개 우선)
  useEffect(() => {
    (async () => {
      try {
        const max = Math.min(items.length, 24);
        for (let i=0;i<max;i++) {
          try {
            const uri = String(items[i]?.uri||'');
            if (/^(content:|file:)/i.test(uri)) {
              const fixed = await normalizeThumbUri(uri);
              if (fixed) setOverrideThumbs(p=>({ ...p, [i]: fixed }));
            }
          } catch {}
        }
      } catch {}
    })();
  }, [items]);
  // 스토어 하이드레이션/변경 구독 → 자동 새로고침
  useEffect(() => {
    const unsub = useMediaStore.subscribe(() => { try { reloadTreasure(); } catch {} });
    return () => { try { unsub(); } catch {} };
  }, [reloadTreasure]);
  if (!isOwnerOrAdmin) return <View style={styles.empty}><ThemedText style={{ color:'#777' }}>{`${friendName} 님의 소중한 보물창고 입니다.`}</ThemedText></View>;

  const kindOf = (it: any): 'image'|'video'|'file'|'link'|'qr'|'other' => {
    try {
      const t = String(it?.type || '').toLowerCase();
      const uri = String(it?.uri || '');
      const isQr = /chart\.googleapis\.com\/chart/.test(uri) && /[?&]cht=qr\b/.test(uri);
      if (t === 'image') return isQr ? 'qr' : 'image';
      if (t === 'qr') return 'qr';
      if (t === 'video') return 'video';
      if (t === 'file') return 'file';
      if (t === 'link') {
        // 호스트 기준 보정: 유튜브는 video로 간주 (갤러리와 동일 분류)
        try { const u = new URL(uri); const h = u.host.toLowerCase(); if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) return 'video'; } catch {}
        return 'link';
      }
      return 'other'; // 명함/위치/메모 등
    } catch { return 'other'; }
  };
  const filtered = items.filter(it => {
    if (filter === 'all') return true;
    const k = kindOf(it);
    if (filter === 'other') return k === 'other';
    const ok = k === filter;
    return ok;
  });
  const filteredWithPrivacy = privateOnly ? filtered.filter((it:any) => (it?.protect === true) || (it?.public === false)) : filtered;

  // 보물창고 탭별 아이템 수 집계
  const treasureCounts = React.useMemo(() => {
    const c: Record<string, number> = { all: 0, image: 0, video: 0, file: 0, link: 0, qr: 0, other: 0 };
    try {
      (items||[]).forEach((it:any) => { const k = kindOf(it); c.all++; if (c[k] !== undefined) c[k]++; else c.other++; });
    } catch {}
    return c;
  }, [items]);

  const toggleTreasureSel = (uri: string) => {
    const k = normalizeUriKey(uri);
    setTreasureSelUris((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };
  const removeSel = async () => {
    const key = `u:${friendId}:treasure.items`;
    const selKeys = Array.from(treasureSelUris);
    if (!selKeys.length) return;
    const next = items.filter((it: any) => !selKeys.includes(normalizeUriKey(String(it?.uri || ''))));
    const ids = selKeys.map((k) => {
      const it = items.find((x: any) => normalizeUriKey(String(x?.uri || '')) === k);
      return mediaIdForUri(String(it?.uri || k));
    });
    setItems(next);
    setTreasureSelUris(new Set());
    setTreasureSelecting(false);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {}
    try {
      useMediaStore.getState().remove(ids);
    } catch {}
  };
  const shareSel = async () => {
    try {
      const first = items.find((it: any) => treasureSelUris.has(normalizeUriKey(String(it?.uri || ''))));
      if (!first) return;
      const url = first.url || first.uri || '';
      if ((navigator as any).share && url) (navigator as any).share({ url });
    } catch {}
  };
  const publishSel = async () => {
    try {
      const keyT = `u:${friendId}:treasure.items`;
      const keyG = `u:${friendId}:chat.media.items`;
      const selKeys = Array.from(treasureSelUris);
      if (!selKeys.length) return;
      const toPublish = items.filter((it: any) => selKeys.includes(normalizeUriKey(String(it?.uri || ''))));
      for (const it of toPublish) {
        const uri = String(it?.uri || '').trim();
        if (!uri) continue;
        const id = mediaIdForUri(uri);
        const ty = inferStoreMediaType(uri, it?.type);
        const st = useMediaStore.getState();
        if (st.items[id]) {
          st.restoreToGallery([id]);
        } else {
          const isHttp = /^https?:/i.test(uri);
          const isData = /^data:/i.test(uri);
          const isLocal = /^(file|content):/i.test(uri);
          st.addOrUpdate({
            id,
            uriHttp: isHttp || isLocal ? uri : undefined,
            uriData: isData ? uri : undefined,
            name: it.name,
            visibility: 'public',
            location: 'gallery',
            protect: false,
            type: ty,
            createdAt: it.createdAt || Date.now(),
          });
        }
      }
      const rawT = await AsyncStorage.getItem(keyT);
      const rawG = await AsyncStorage.getItem(keyG);
      const listT: any[] = rawT ? JSON.parse(rawT) : [];
      const listG: any[] = rawG ? JSON.parse(rawG) : [];
      const setSel = new Set(selKeys);
      const keepTreasure = listT.filter((row: any) => {
        const u = typeof row === 'string' ? row : row?.uri;
        return !setSel.has(normalizeUriKey(String(u || '')));
      });
      const exists = new Set(listG.map((x: any) => normalizeUriKey(String(typeof x === 'string' ? x : x?.uri || ''))));
      const addEntries = toPublish.map((row: any) => {
        const raw = String(row.uri);
        let ty = String(row?.type || '');
        if (!['image', 'video', 'file', 'link', 'qr'].includes(ty)) {
          try {
            ty = mediaDetectType(raw) as any;
          } catch {
            ty = 'image';
          }
        }
        if (ty === 'qr') ty = 'image';
        if (ty === 'link') {
          try {
            const u = new URL(raw);
            const h = u.host.toLowerCase();
            if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) ty = 'video';
          } catch {}
        }
        return { uri: row.uri, type: ty, public: true, name: row.name, createdAt: Date.now() };
      });
      const nextG = [...addEntries.filter((e) => !exists.has(normalizeUriKey(String(e.uri)))), ...listG];
      await AsyncStorage.multiSet([
        [keyT, JSON.stringify(keepTreasure)],
        [keyG, JSON.stringify(nextG)],
      ]);
      const afterPublish = items.filter((it: any) => !selKeys.includes(normalizeUriKey(String(it?.uri || ''))));
      setItems(afterPublish);
      setTreasureSelUris(new Set());
      setTreasureSelecting(false);
      Alert.alert('완료', '선택한 항목을 공개(그리드)로 옮겼습니다.');
    } catch {
      Alert.alert('오류', '공개 전환에 실패했습니다.');
    }
  };
  const setAsProfile = async () => {
    try {
      const first = items.find((it: any) => treasureSelUris.has(normalizeUriKey(String(it?.uri || ''))));
      if (first && first.type==='image' && first.uri) {
        const uid = firebaseAuth.currentUser?.uid || 'anonymous';
        let final = String(first.uri);
        // dataURL이면 업로드해 https URL 확보
        if (/^data:/i.test(final)) {
          try {
            const realUid = await ensureAuthedUid();
            const path = `chatMedia/${realUid}/avatar_${Date.now()}_fromTreasure.jpg`;
            const r = storageRef(firebaseStorage, path);
            await uploadString(r, final, 'data_url');
            final = await getDownloadURL(r);
          } catch {}
        }
        const { setAvatar, updateProfile } = useChatProfileStore.getState();
        setAvatar(final); updateProfile({ avatar: final });
        try {
          const me = firebaseAuth.currentUser?.uid || 'me';
          await AsyncStorage.setItem(`u:${me}:chat.profile.lastAvatar`, final);
        } catch {}
      }
      setTreasureSelUris(new Set());
      setTreasureSelecting(false);
    } catch {}
  };
  return (
    <>
      {/* 공통 미리보기 */}
      <TreasurePreviewBridge />
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 12 }}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:8 }}>
        {(['all','image','video','file','link','qr','other'] as const).map(key => {
          const label = key==='all'?t('all', language):key==='image'?t('photo', language):key==='video'?t('video', language):key==='file'?t('file', language):key==='link'?t('link', language):key==='qr'?t('qr', language):t('other', language);
          const num = (treasureCounts as any)[key] ?? 0;
          return (
            <TouchableOpacity key={key} onPress={()=>setFilter(key)} style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:999, borderWidth:1, borderColor: filter===key?'#FFD700':'#333', backgroundColor: 'transparent' }}>
              <Text style={{ color: filter===key?'#FFD700':'#B8B8B8', fontSize:12 }}>
                {label}{num>0?` (${num})`:''}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* 비공개 토글 */}
        <TouchableOpacity onPress={()=> setPrivateOnly(v=>!v)} style={{ marginLeft:8, paddingHorizontal:10, paddingVertical:4, borderRadius:999, borderWidth:1, borderColor: privateOnly?'#FFD700':'#333' }}>
          <Text style={{ color: privateOnly ? '#FFD700' : '#B8B8B8', fontSize:12 }}>🔒 비공개</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
      {filteredWithPrivacy.length === 0 ? (
        <View style={styles.empty}><ThemedText style={{ color:'#777' }}>{(() => { const tabLabel = filter==='all'?t('all', language):filter==='image'?t('photo', language):filter==='video'?t('video', language):filter==='file'?t('file', language):filter==='link'?t('link', language):filter==='qr'?t('qr', language):t('other', language); return `${tabLabel} ${t('noItems', language)}`; })()}</ThemedText></View>
      ) : (
        <View style={[styles.gridWrap, { paddingHorizontal: 16 }]}>
          {(() => {
            const nodes: React.ReactNode[] = [];
            filteredWithPrivacy.forEach((it, idx) => {
              const k = kindOf(it);
              // 링크 미리보기 메타 준비
              if (k === 'link') { try { void ensureLinkMeta(String(it.uri)); } catch {} }
              const renderThumb = () => {
                if (k === 'image' || k === 'qr') {
                  const src = overrideThumbs[idx] || String(it.uri);
                  if (broken[idx]) {
                    const ph = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23111111"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23FFD700" font-size="28" font-weight="900">IMG</text></svg>';
                    return (<ImgC source={{ uri: ph }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />);
                  }
                  return (
                    <React.Suspense fallback={null}>
                      <ImgC
                        source={{ uri: src }}
                        style={styles.gridImage}
                        {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})}
                        onError={async () => {
                          try {
                            // content:// or file:// → dataURL 변환 시도
                        const fixed = await normalizeThumbUri(src);
                        if (fixed) { setOverrideThumbs(p=>({ ...p, [idx]: fixed })); return; }
                          } catch {}
                          try { setBroken((p)=>({ ...p, [idx]: true })); } catch {}
                        }}
                      />
                    </React.Suspense>
                  );
                }
                if (k === 'video') {
                  if (Platform.OS==='web') {
                    try { const u=new URL(String(it.uri)); const h=u.host.toLowerCase(); if (h.includes('youtu.be')||h.endsWith('youtube.com')) { const thumb = ytThumbFor(String(it.uri)); return (<ImgC source={{ uri: thumb||'' }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />); } } catch {}
                    const key = normalizeVideoKey(String(it.uri));
                    const cached = videoThumbs2[key];
                    if (cached) return (<ImgC source={{ uri: cached }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />);
                    try { void (async()=>{ 
                      try { 
                        // 1) try local storage
                        const prev = await AsyncStorage.getItem(`video.thumb:${key}`);
                        if (prev) { setVideoThumbs2(p=>({ ...p, [key]: prev })); return; }
                        // 2) capture frame
                        const v = document.createElement('video'); try { v.crossOrigin='anonymous'; (v as any).playsInline = true; } catch {} 
                        v.muted=true; v.preload='metadata'; v.src=String(it.uri);
                        await new Promise<void>((res, rej)=>{ v.onloadeddata=()=>res(); v.onerror=()=>rej(new Error('video')); });
                        const canvas=document.createElement('canvas'); 
                        const w=Math.max(320,Math.min(800,v.videoWidth||480)); 
                        const h=Math.max(180,Math.min(450,Math.round((v.videoHeight||270)*(w/(v.videoWidth||480))))); 
                        canvas.width=w; canvas.height=h; 
                        const ctx=canvas.getContext('2d'); if(!ctx) return; 
                        ctx.drawImage(v,0,0,w,h); 
                        const data=canvas.toDataURL('image/jpeg',0.8); 
                        if(!data) return; 
                        setVideoThumbs2(p=>({ ...p, [key]: data }));
                        try { await AsyncStorage.setItem(`video.thumb:${key}`, data); } catch {} 
                      } catch { 
                        // 캡쳐 실패 시 아이콘형 썸네일로 대체
                        const data = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='100%' height='100%' fill='%23111111'/><polygon points='130,90 210,135 210,45' fill='%23FFD700'/></svg>`;
                        setVideoThumbs2(p=>({ ...p, [key]: data })); try { await AsyncStorage.setItem(`video.thumb:${key}`, data); } catch {}
                      } 
                    })(); } catch {} 
                    return (<View style={{ flex:1, backgroundColor:'#111', alignItems:'center', justifyContent:'center' }}><Text style={{ color:'#FFD700' }}>▶</Text></View>);
                  }
                  // 네이티브: 비디오는 직접 렌더 불가 → 플레이 아이콘 썸네일
                  const data = 'data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"320\" height=\"180\"><rect width=\"100%\" height=\"100%\" fill=\"%23111111\"/><polygon points=\"130,90 210,135 210,45\" fill=\"%23FFD700\"/></svg>';
                  return (<ImgC source={{ uri: data }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} />);
                }
                if (k === 'file') { const name = (()=>{ const raw = String(it?.name||'')||String(it?.uri||''); return raw || ''; })(); const ext = String(name).split('.').pop()?.toLowerCase() || ''; const svg = fileIconSvg(ext); return (<ImgC source={{ uri: svg }} style={styles.gridImage} {...(EImage?{contentFit:'cover'}:{})} />); }
                if (k === 'link') { const meta = linkMetaRef.current[String(it.uri)] || {}; const yt = ytThumbFor(String(it.uri)); const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23111111'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23FFD700' font-size='28'>LINK</text></svg>`; const thumb = meta.image || yt || faviconFor(String(it.uri)) || fallbackSvg; return (<ImgC source={{ uri: thumb }} style={styles.gridImage} {...(EImage?{contentFit:'cover', cachePolicy:'memory-disk'}:{})} onError={() => { try { setLinkMetaTick(v=>v+1); } catch {} }} />); }
                return (<View style={{ flex:1, backgroundColor:'#111' }} />);
              };
              const title = (()=>{
                if (k==='file') { const nm = String(it?.name||'') || String(it?.uri||''); return nm ? nm.split('/').pop() : '파일'; }
                if (k==='link') { const m = linkMetaRef.current[String(it.uri)] || {}; return m.title || deriveName(String(it.uri)); }
                if (k==='video') return deriveName(String(it.uri));
                return '';
              })();
              const uriKey = normalizeUriKey(String(it?.uri || ''));
              const onRemove = async () => {
                try {
                  const keyT = `u:${friendId}:treasure.items`;
                  const uri = String(it?.uri || '');
                  const id = mediaIdForUri(uri);
                  const list = items.filter((x: any) => normalizeUriKey(String(x?.uri || '')) !== uriKey);
                  setItems(list);
                  try {
                    await AsyncStorage.setItem(keyT, JSON.stringify(list));
                  } catch {}
                  try {
                    useMediaStore.getState().remove([id]);
                  } catch {}
                } catch {}
              };
              nodes.push(
                <View key={`${uriKey}-${idx}`} style={[styles.gridCell, { flexBasis: '25%', maxWidth: '25%' }]}>
                  <TouchableOpacity
                    onLongPress={() => {
                      setTreasureSelecting(true);
                      toggleTreasureSel(String(it.uri));
                    }}
                    onPress={() => {
                      if (treasureSelecting) {
                        toggleTreasureSel(String(it.uri));
                        return;
                      }
                      setTreasureSelUris(new Set());
                      try {
                        (globalThis as any).__treasureOpen?.({ list: filteredWithPrivacy, index: idx });
                      } catch {}
                    }}
                    style={[styles.gridItem, treasureSelUris.has(uriKey) && { borderWidth: 1, borderColor: '#FFD700' }]}
                  >
                    {renderThumb()}
                    {treasureSelecting ? (
                      <View
                        style={{
                          position: 'absolute',
                          left: 4,
                          top: 4,
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: 1,
                          borderColor: '#FFD700',
                          backgroundColor: treasureSelUris.has(uriKey) ? '#FFD700' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {treasureSelUris.has(uriKey) ? (
                          <Text style={{ color: '#111', fontSize: 10, fontWeight: '800' }}>✓</Text>
                        ) : null}
                      </View>
                    ) : null}
                    {/* 잠금 배지 */}
                    {!!title && (
                      <View style={{ position:'absolute', left:6, right:28, bottom:6 }}>
                        <Text style={{ color:'#CFCFCF', fontSize:11 }} numberOfLines={1}>{title}</Text>
                      </View>
                    )}
                    {it.protect === true || it.public === false ? (
                      <View style={{ position:'absolute', top:6, left:6, backgroundColor:'rgba(0,0,0,0.5)', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                        <Text style={{ color:'#FFD700', fontSize:12 }}>🔒</Text>
                      </View>
                    ) : null}
                    {/* X 삭제 버튼 */}
                    <TouchableOpacity onPress={onRemove} style={{ position:'absolute', top:6, right:6, width:18, height:18, borderRadius:9, backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#FFD700' }}>
                      <Text style={{ color:'#FFD700', fontSize:10, fontWeight:'900' }}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              );
            });
            return nodes;
          })()}
        </View>
      )}
      {/* 하단 고정 툴바 */}
      {treasureSelUris.size > 0 && (
        <FixedBottomBar>
          <TouchableOpacity onPress={removeSel} style={[styles.chipMini, { flex:1, marginRight:6 }]}><Text style={styles.chipMiniText}>삭제</Text></TouchableOpacity>
          <TouchableOpacity onPress={publishSel} style={[styles.chipMini, { flex:1, marginRight:6 }]}><Text style={styles.chipMiniText}>공개</Text></TouchableOpacity>
          <TouchableOpacity onPress={shareSel} style={[styles.chipMini, { flex:1, marginRight:6 }]}><Text style={styles.chipMiniText}>보내기</Text></TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setTreasureSelUris(new Set());
              setTreasureSelecting(false);
            }}
            style={[styles.chipMini, { flex:1 }]}
          >
            <Text style={styles.chipMiniText}>취소</Text>
          </TouchableOpacity>
        </FixedBottomBar>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, backgroundColor:'#0C0C0C', borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  back: { color:'#D4AF37', fontSize: 18, fontWeight:'800' },
  title: { color:'#F6F6F6', fontSize: 16, fontWeight:'700' },
  // rooms 상단바와 동일 스타일 추가
  headerLeft: { flexDirection:'row', alignItems:'center', flex:6, minWidth:0 },
  profileButton: { width: 40, height: 40 },
  profileImage: { width: 40, height: 40, borderRadius: 20, backgroundColor:'#D4AF37', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#FFD700' },
  profileImagePlaceholder: { width: 36, height: 36, borderRadius: 18 },
  profileText: { fontSize: 20 },
  profileStatus: { position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:6, backgroundColor:'#0C0C0C', borderWidth:2, borderColor:'#0C0C0C', alignItems:'center', justifyContent:'center' },
  profileStatusText: { fontSize: 8 },
  profilePreview: { marginLeft:8, flex:1, justifyContent:'center' },
  profilePreviewName: { fontSize: 16, fontWeight:'bold', color:'#F6F6F6', marginBottom:2 },
  profilePreviewStatus: { fontSize: 12, color:'#B8B8B8' },
  iconText: { color:'#B8B8B8' },
  headerIcons: { flexDirection:'row', alignItems:'center', gap:6, flex:4, justifyContent:'flex-end' },
  closeBtn: { position:'absolute', right: 12, top: 8, width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor:'#D4AF37', alignItems:'center', justifyContent:'center', backgroundColor:'#0C0C0C', zIndex: 10 },
  closeTxt: { color:'#B8B8B8', fontSize: 12, fontWeight: '800' },
  avatarWrap: { width: 88, height: 88, borderRadius: 44, overflow:'hidden', borderWidth:2, borderColor:'#D4AF37' },
  avatarWrapLg: { width: 92, height: 92, borderRadius: 46, overflow:'hidden', borderWidth:2, borderColor:'#D4AF37', marginRight: 18 },
  avatarWrapSm: { width: 40, height: 40, borderRadius: 20, overflow:'hidden', borderWidth:2, borderColor:'#D4AF37' },
  avatarImg: { width:'100%', height:'100%' },
  avatarFallback: { width:'100%', height:'100%', alignItems:'center', justifyContent:'center', backgroundColor:'#2A2A2A' },
  avatarFallbackText: { color:'#D4AF37', fontSize:22, fontWeight:'800' },
  empty: { paddingVertical: 24, alignItems: 'center' },
  gridWrap: { flexDirection:'row', flexWrap:'wrap', justifyContent:'flex-start' },
  gridItem: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow:'hidden', backgroundColor:'#111' },
  gridCell: { padding: 2 },
  gridImage: { width:'100%', height:'100%' },
  inlineToolbar: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 6, backgroundColor:'transparent' },
  fullToolbar: { width:'100%', flexDirection:'row', alignItems:'center', justifyContent:'center', gap: 6, marginTop: 6, marginBottom: 2 },
  chipMini: { height: 26, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor:'#FFD700', alignItems:'center', justifyContent:'center' },
  chipMiniText: { color:'#FFD700', fontSize: 12, fontWeight: '700' },
  countBox: { alignItems:'center' },
  countNum: { color:'#F6F6F6', fontWeight:'800', fontSize:16 },
  countLabel: { color:'#9BA1A6', fontSize:11, marginTop: 2 },
  actionRowTop: { flexDirection:'row', alignItems:'center', gap: 8, marginTop: 12 },
  actionPill: { paddingHorizontal: 12, height: 32, borderRadius: 10, borderWidth: 1, borderColor:'#FFD700', alignItems:'center', justifyContent:'center', backgroundColor:'transparent' },
  actionPillText: { color:'#FFD700', fontWeight:'800' },
  tabsRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-around', paddingVertical: 8, borderTopWidth:1, borderBottomWidth:1, borderColor:'#1E1E1E', marginTop: 16 },
  headerIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor:'#D4AF37', alignItems:'center', justifyContent:'center', backgroundColor:'#0C0C0C' },
  tabHalf: { width:'50%', flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:6 },
  tabHalfActive: { backgroundColor:'#111', borderRadius: 8 },
  colsPickerRow: { flexDirection:'row', alignItems:'center', justifyContent:'flex-end', paddingHorizontal:16, paddingTop:6 },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  tabActive: { backgroundColor:'#111' },
  tabText: { color:'#9BA1A6', fontWeight:'700' },
  tabTextActive: { color:'#FFD700' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'center' },
  modalCard: { width: 280, backgroundColor:'#0F0F0F', borderRadius: 12, borderWidth: 1, borderColor:'#2A2A2A', padding: 14 },
  modalTitle: { color:'#F6F6F6', fontWeight:'800', marginBottom: 8 },
  modalInput: { backgroundColor:'#111', color:'#F6F6F6', borderWidth:1, borderColor:'#2A2A2A', borderRadius:10, paddingHorizontal:12, paddingVertical:10 },
  badgeSmall: { marginLeft: 6, minWidth: 16, height:16, borderRadius: 8, backgroundColor:'#FFD700', alignItems:'center', justifyContent:'center', paddingHorizontal:4 },
  badgeSmallText: { color:'#0C0C0C', fontSize:10, fontWeight:'800' },
  followersPanel: { marginTop: 12, borderTopWidth:1, borderBottomWidth:1, borderColor:'#1E1E1E' },
  followerItem: { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#111' },
  followerName: { color:'#F6F6F6', fontWeight:'700' },
  followerMsg: { color:'#CFCFCF', fontSize:12, marginTop:2 },
  followerTime: { color:'#9BA1A6', fontSize:11, marginTop:2 },
  followBtn: { height:28, paddingHorizontal:12, borderRadius:999, borderWidth:1, borderColor:'#FFD700', alignItems:'center', justifyContent:'center' },
  followBtnText: { color:'#FFD700', fontWeight:'800', fontSize:12 },
  bioBox: { borderWidth: 1, borderRadius: 10, padding: 10, backgroundColor:'transparent' },
  bioText: { color:'#CFCFCF' },
  lastActive: { color:'#777', marginTop: 6, fontSize: 12 },
});
