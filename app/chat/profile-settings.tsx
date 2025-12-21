import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as EImage } from 'expo-image';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadString, getStorage, getMetadata } from 'firebase/storage';
import { firebaseStorage, ensureAppCheckReady } from '@/lib/firebase';
import React, { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useMediaStore, mediaSelectors, mediaIdForUri } from '@/src/features/chat/store/media.store';
import { Alert, Image, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
const ChatViewer = React.lazy(() => import('@/src/features/chat/components/ChatViewer'));
import { detectType as mediaDetectType } from '@/src/features/chat/lib/media';

export default function ChatProfileSettingsScreen() {
  const { language } = usePreferences();
  const BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';
  const { currentProfile, updateProfile, setStatus, setCustomStatus, setAvatar: setAvatarInStore, initialize } = useChatProfileStore();
  const [displayName, setDisplayName] = useState('');
  const [useHash, setUseHash] = useState(false);
  const [bio, setBio] = useState('');
  const [username, setUsername] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [customStatus, setCustomStatusText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [pendingAvatar, setPendingAvatar] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('online');
  const [isSaving, setIsSaving] = useState(false);
  type MediaItem = { uri: string; type: 'image' | 'video' | 'file' | 'link'; public?: boolean; name?: string; protect?: boolean; createdAt?: number; by?: string };
  const [gallery, setGallery] = useState<MediaItem[]>([]);
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (Platform.OS === 'web' && (navigator as any)?.clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      // 폴백: 임시 저장소에 기록
      await AsyncStorage.setItem('clip.lastText', text);
      return true;
    } catch {}
    return false;
  }, []);
  const [linkViewer, setLinkViewer] = useState<{ index: number } | null>(null);
  const [videoViewer, setVideoViewer] = useState<{ index: number } | null>(null);
  const [viewerBox, setViewerBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [viewerRatio, setViewerRatio] = useState<number | null>(null);
  const [viewerImgSize, setViewerImgSize] = useState<{ w: number; h: number } | null>(null);
  // PDF 썸네일 캐시(웹): uri -> dataURL
  const [pdfThumbs, setPdfThumbs] = useState<Record<string, string>>({});
  // 비디오 썸네일 캐시(웹): uri -> dataURL
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  // gallery URL 정규화: gs://, 버킷/오브젝트 경로, 잘못된 버킷 호스트 교정 → http(s) 다운로드 URL
  const resolveStorageUrl = useCallback(async (raw: string): Promise<string> => {
    try {
      let s = String(raw||'');
      if (!s) return s;
      // 0) Legacy UUID-like id -> resolve from SSOT store
      try {
        const looksUuid = /^[a-z0-9\-]{20,}$/i.test(s) && !/^https?:/i.test(s) && !/^gs:\/\//i.test(s) && s.indexOf('/') < 0;
        if (looksUuid) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const store = require('@/src/features/chat/store/media.store');
          const st = store.useMediaStore.getState();
          const it = (st.items && st.items[s]) || null;
          const mapped = it?.uriHttp || it?.uriData || '';
          if (mapped) return mapped;
        }
      } catch {}
      // absolute http(s)
      if (/^https?:\/\//i.test(s)) {
        // 로컬 UUID 주소면 메타 매핑에서 해석 (현재 UID + anonymous 메타 모두 조회)
        try {
          const u = new URL(s);
          if (/^localhost(:\d+)?$/i.test(u.host) && /^[a-z0-9\-]{20,}$/i.test(u.pathname.replace(/^\//,''))) {
            const keys = [metaKey, 'u:anonymous:chat.media.meta'];
            for (const k of keys) {
              try {
                const rawM = await AsyncStorage.getItem(k);
                const m = rawM ? JSON.parse(rawM) : {};
                const mapped = m[s]?.resolved;
                if (mapped) return String(mapped);
              } catch {}
            }
          }
        } catch {}
        // alt=media 보강 (버킷 호스트는 그대로 유지)
        if (/firebasestorage\.googleapis\.com/i.test(s) && !/[?&]alt=media\b/i.test(s)) s = s.includes('?') ? `${s}&alt=media` : `${s}?alt=media`;
        return s;
      }
      // gs://bucket/object
      if (s.startsWith('gs://')) {
        const [, bucketAndPath] = s.split('gs://');
        const [bucket, ...rest] = bucketAndPath.split('/');
        const objectPath = rest.join('/');
        const storage = getStorage(firebaseAuth.app as any, `gs://${bucket}`);
        return await getDownloadURL(storageRef(storage, objectPath));
      }
      // bucket 누락: 오브젝트 경로로 간주
      return await getDownloadURL(storageRef(firebaseStorage, s));
    } catch {
      return String(raw||'');
    }
  }, []);
  const linkMetaRef = useRef<Record<string, { title?: string; image?: string; host?: string }>>({});
  const [linkMetaTick, setLinkMetaTick] = useState(0);
  // 영속 캐시 키(사용자별로 분리)
  const addrCacheKey = useMemo(() => {
    const uid = firebaseAuth.currentUser?.uid || 'anonymous';
    return `u:${uid}:cache.map.addresses`;
  }, []);

  // PDF 썸네일 키 표준화: 쿼리/해시 제거하여 토큰 회전에도 캐시를 재사용
  const pdfKey = useCallback((s: string): string => {
    try { const u = new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { try { return String(s).split('?')[0]; } catch { return String(s||''); } }
  }, []);
  const videoKey = useCallback((s: string): string => {
    try { const u = new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { try { return String(s).split('?')[0]; } catch { return String(s||''); } }
  }, []);
  // PDF 첫 페이지 썸네일 생성기(웹 전용): pdfjs-dist 동적 로딩
  const ensurePdfThumb = useCallback(async (url: string): Promise<string> => {
    try {
      if (Platform.OS !== 'web') return '';
      if (!/\.pdf(\?|$)/i.test(String(url))) return '';
      const key0 = pdfKey(url);
      if (pdfThumbs[key0]) return pdfThumbs[key0];
      try {
        const cached = await AsyncStorage.getItem(`pdf.thumb:${key0}`);
        if (cached) { setPdfThumbs((p)=>({ ...p, [key0]: cached })); return cached; }
      } catch {}
      // URL 정규화: firebase storage 교정 + 토큰/alt=media 보완
      const ensureFirebaseDirect = (u: string) => {
        try {
          let out = u;
          const needAlt = (s: string) => /firebasestorage\.googleapis\.com/i.test(s) || /\.appspot\.com\b/i.test(s) || /\.firebasestorage\.app\b/i.test(s);
          if (needAlt(out) && !/[?&]alt=media\b/i.test(out)) out = out.includes('?') ? `${out}&alt=media` : `${out}?alt=media`;
          return out;
        } catch { return u; }
      };
      const getProxyUrl = (raw: string) => {
        try {
          const base = (typeof window !== 'undefined' && window.location) ? `${window.location.protocol}//localhost:8080` : 'http://localhost:8080';
          return `${base}/api/pdf-proxy?url=${encodeURIComponent(raw)}`;
        } catch { return raw; }
      };
      let effective = /^https?:\/\//.test(url) ? url : await resolveStorageUrl(url);
      try {
        if (/firebasestorage\.googleapis\.com\/v0\/b\//i.test(effective)) {
          // 토큰 없으면 SDK로 fresh URL 발급
          const hasToken = /[?&]token=/.test(effective);
          if (!hasToken) {
            const m = effective.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
            if (m) {
              const bucket = m[1];
              const objectPath = decodeURIComponent(m[2]);
              try {
                const tryBuckets = [bucket, bucket.replace(/\.firebasestorage\.app$/i, '.appspot.com')].filter((v, i, a)=>v && a.indexOf(v)===i);
                for (const b of tryBuckets) {
                  try {
                    const r = storageRef(getStorage(firebaseAuth.app as any, `gs://${b}`), objectPath);
                    const dl = await getDownloadURL(r);
                    effective = dl;
                    break;
                  } catch {}
                }
              } catch {}
            }
          }
          // alt=media 보완
          if (!/[?&]alt=media\b/i.test(effective)) effective = effective.includes('?') ? `${effective}&alt=media` : `${effective}?alt=media`;
        }
      } catch {}
      // lazy load pdf.js via CDN to avoid bundler dependency on pdfjs-dist
      const ensurePdfJsLib = async (): Promise<any> => {
        try {
          // reuse if already loaded
          const anyWin: any = (typeof window !== 'undefined') ? window : {};
          if (anyWin.pdfjsLib) return anyWin.pdfjsLib;
          await new Promise<void>((resolve, reject) => {
            try {
              const s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
              s.async = true;
              s.onload = () => resolve();
              s.onerror = () => reject(new Error('pdfjs-load'));
              document.head.appendChild(s);
            } catch (e) { reject(e as any); }
          });
          return (window as any).pdfjsLib;
        } catch { return null; }
      };
      const pdfjsLib = await ensurePdfJsLib();
      try { if (pdfjsLib && (pdfjsLib as any).GlobalWorkerOptions) { (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; } } catch {}
      const direct = ensureFirebaseDirect(String(effective));
      const proxied = getProxyUrl(direct);
      const candidates = [proxied, direct];
      let dataUrl = '';
      for (const candidate of candidates) {
        try {
          const loadingTask = (pdfjsLib as any).getDocument(candidate);
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no-ctx');
          await page.render({ canvasContext: ctx, viewport }).promise;
          dataUrl = canvas.toDataURL('image/png');
          break;
        } catch {}
      }
      if (!dataUrl) return '';
      // 원본/정규화/표준화 키 모두 캐싱(토큰 회전 대응)
      const k1 = pdfKey(url); const k2 = pdfKey(effective); const k3 = pdfKey(direct);
      setPdfThumbs((p)=>({ ...p, [k1]: dataUrl, [k2]: dataUrl, [k3]: dataUrl }));
      try { await AsyncStorage.multiSet([[`pdf.thumb:${k1}`, dataUrl],[`pdf.thumb:${k2}`, dataUrl],[`pdf.thumb:${k3}`, dataUrl]]); } catch {}
      return dataUrl;
    } catch { return ''; }
  }, [pdfThumbs, resolveStorageUrl, pdfKey]);

  // 비디오 첫 프레임 썸네일 생성(웹 전용)
  const ensureVideoThumb = useCallback(async (url: string): Promise<string> => {
    try {
      if (Platform.OS !== 'web') return '';
      const key0 = videoKey(url);
      if (videoThumbs[key0]) return videoThumbs[key0];
      try { const cached = await AsyncStorage.getItem(`video.thumb:${key0}`); if (cached) { setVideoThumbs((p)=>({ ...p, [key0]: cached })); return cached; } } catch {}
      // 유튜브는 여기서 처리하지 않음
      try { const U = new URL(String(url)); const h = U.host.toLowerCase(); if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) return ''; } catch {}
      // 재생 URL 정규화
      let effective = /^https?:\/\//.test(url) ? url : await resolveStorageUrl(url);
      try {
        // Firebase Storage URL 교정: 토큰 부재 시 SDK로 fresh URL 발급
        const tryResolveFresh = async (raw: string): Promise<string> => {
          try {
            // 패턴 1: googleapis /v0/b/{bucket}/o/{object}
            let m = raw.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
            if (m) {
              const bucket = m[1];
              const objectPath = decodeURIComponent(m[2]);
              const st = getStorage(firebaseAuth.app as any, `gs://${bucket}`);
              return await getDownloadURL(storageRef(st, objectPath));
            }
            // 패턴 2: {bucket}.appspot.com/o/{object} 또는 {bucket}.firebasestorage.app/o/{object}
            try {
              const U = new URL(raw);
              if ((/\.appspot\.com$/i.test(U.host) || /\.firebasestorage\.app$/i.test(U.host)) && /^\/o\//i.test(U.pathname)) {
                const bucket = U.host;
                const objectPath = decodeURIComponent(U.pathname.replace(/^\/o\//i, ''));
                const st = getStorage(firebaseAuth.app as any, `gs://${bucket}`);
                return await getDownloadURL(storageRef(st, objectPath));
              }
            } catch {}
          } catch {}
          return raw;
        };
        const hasToken = /[?&]token=/.test(effective);
        if (!hasToken && /(firebasestorage\.googleapis\.com|\.appspot\.com|\.firebasestorage\.app)/i.test(effective)) {
          effective = await tryResolveFresh(effective);
        }
        if (/firebasestorage\.googleapis\.com/i.test(effective) && !/[?&]alt=media\b/i.test(effective)) {
          effective = effective.includes('?') ? `${effective}&alt=media` : `${effective}?alt=media`;
        }
      } catch {}
      const v = document.createElement('video');
      try { v.crossOrigin = 'anonymous'; } catch {}
      v.muted = true; v.preload = 'metadata'; v.playsInline = true as any;
      // CORS로 캔버스가 오염되는 것을 피하기 위해 가능하면 blob → objectURL 사용
      let objectUrl: string | null = null;
      try {
        const resp = await fetch(effective, { method: 'GET' });
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        v.src = objectUrl;
      } catch {
        v.src = effective;
      }
      // 1) 메타데이터 로드 대기
      await new Promise<void>((res, rej) => {
        const to = setTimeout(()=>{ rej(new Error('video-meta-timeout')); }, 8000);
        v.onloadedmetadata = () => { try { clearTimeout(to); res(); } catch {} };
        v.onerror = () => { try { clearTimeout(to); } catch {}; rej(new Error('video-meta-error')); };
      });
      // 2) 첫 프레임 위치로 시킹 후 프레임 로드 대기
      await new Promise<void>((res, rej) => {
        const target = Math.min(0.25, Math.max(0.01, (v.duration||1) * 0.05));
        let done = false;
        const cleanup = () => { v.onseeked = null as any; v.ontimeupdate = null as any; v.onloadeddata = null as any; };
        const finish = () => { if (!done) { done = true; cleanup(); res(); } };
        const timer = setTimeout(()=>{ if (!done) { done = true; cleanup(); rej(new Error('video-seek-timeout')); } }, 8000);
        v.onseeked = () => { try { clearTimeout(timer); finish(); } catch {} };
        v.onloadeddata = () => { try { /* some browsers fire this after seek */ clearTimeout(timer); finish(); } catch {} };
        v.ontimeupdate = () => { try { if (!done) { clearTimeout(timer); finish(); } } catch {} };
        try { v.currentTime = target; } catch { /* ignore */ }
      });
      const canvas = document.createElement('canvas');
      const w = Math.max(320, Math.min(800, v.videoWidth || 480));
      const h = Math.max(180, Math.min(450, Math.round((v.videoHeight||270) * (w/(v.videoWidth||480)))));
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no-ctx');
      ctx.drawImage(v, 0, 0, w, h);
      let dataUrl = '';
      try { dataUrl = canvas.toDataURL('image/jpeg', 0.8); } catch { dataUrl = ''; }
      try { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } } catch {}
      if (!dataUrl) return '';
      const k1 = videoKey(url); const k2 = videoKey(effective);
      setVideoThumbs((p)=>({ ...p, [k1]: dataUrl, [k2]: dataUrl }));
      try { await AsyncStorage.multiSet([[`video.thumb:${k1}`, dataUrl],[`video.thumb:${k2}`, dataUrl]]); } catch {}
      return dataUrl;
    } catch { return ''; }
  }, [videoThumbs, resolveStorageUrl, videoKey]);

  // (정의 위치 이동: mediaTab 초기화 이후에 실행되도록 아래에서 등록)
  // 초기 로드: 주소 캐시 불러오기
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(addrCacheKey);
        const obj = raw ? JSON.parse(raw) : {};
        Object.assign(linkMetaRef.current, obj);
        setLinkMetaTick((v) => v + 1);
      } catch {}
    })();
  }, [addrCacheKey]);
  // helpers: map parsing / thumbnails / reverse geocode
  const parseLatLng = (u: URL): { lat: number; lng: number } | null => {
    try {
      const cand = u.searchParams.get('q') || u.searchParams.get('ll') || '';
      const m = /(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/.exec(cand);
      if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    } catch {}
    return null;
  };
  const mapThumbUrl = (lat: number, lng: number): string => {
    try {
      const key = String((process as any).env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
      if (key) return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&scale=2&maptype=roadmap&markers=color:red|${lat},${lng}&key=${key}`;
      return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=400x200&markers=${lat},${lng},red-pushpin`;
    } catch { return ''; }
  };

  
  const reverseGeocodeAddress = async (lat: number, lng: number): Promise<string> => {
    try {
      const key = String((process as any).env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
      if (key) {
        // 우선 도로명/번지 포함 결과를 우선 요청
        const url1 = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=ko&result_type=street_address&location_type=ROOFTOP|RANGE_INTERPOLATED`;
        const url2 = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&language=ko`;
        const fetchJ = async (u: string) => { const r = await fetch(u); return r.json(); };
        const j1 = await fetchJ(url1);
        const j2 = j1?.results?.length ? null : await fetchJ(url2);
        const res = (j1?.results?.length ? j1.results : (Array.isArray(j2?.results) ? j2.results : []))?.[0];
        if (res) {
          const comps = Array.isArray(res.address_components) ? res.address_components : [];
          const get = (types: string[]) => {
            try { return (comps.find((c:any)=> types.every(t=> (c.types||[]).includes(t)))||{}).long_name || ''; } catch { return ''; }
          };
          const country = get(['country']);
          const level1 = get(['administrative_area_level_1']);
          const level2 = get(['administrative_area_level_2']) || get(['administrative_area_level_3']);
          const route = get(['route']);
          const streetNo = get(['street_number']);
          const dong = get(['sublocality_level_1']) || get(['sublocality_level_2']) || get(['neighborhood']);
          const building = get(['premise']) || get(['subpremise']) || get(['establishment']) || get(['point_of_interest']);
          // 지번 후보: formatted_address에서 숫자-숫자 패턴 추출 (예: 702-23)
          const jibunMatch = String(res.formatted_address||'').match(/\b(\d{1,5}-\d{1,5})\b/);
          const jibun = jibunMatch ? jibunMatch[1] : '';
          const head = [country, level1, level2].filter(Boolean).join(' ');
          const road = [route, streetNo].filter(Boolean).join(' ');
          if (road) {
            const tail = [dong, jibun].filter(Boolean).join(' ');
            const addr = tail ? `${head} ${road} (${tail})` : `${head} ${road}`;
            return building ? `${addr} ${building}` : addr;
          }
          const addr = res.formatted_address || '';
          if (addr) return String(addr);
        }
      }
    } catch {}
    try {
      const r2 = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`);
      const j2 = await r2.json();
      const a = j2?.address || {};
      const roadName = (a.road || a.pedestrian || a.footway || a.residential || a.path || a.cycleway || a.construction || a.neighbourhood || a.suburb || '');
      const roadLine = [roadName, a.house_number].filter(Boolean).join(' ');
      const region1 = a.state || a.province || a.region || '';
      const region2 = a.city || a.town || a.village || '';
      const region3 = a.county || a.district || a.suburb || a.borough || '';
      const dong = a.suburb || a.quarter || a.neighbourhood || a.neighborhood || '';
      const building = j2?.namedetails?.name || j2?.name || a.building || '';
      // 지번 후보: display_name에서 숫자-숫자 패턴 추출
      const jibunMatch2 = String(j2?.display_name||'').match(/\b(\d{1,5}-\d{1,5})\b/);
      const jibun2 = jibunMatch2 ? jibunMatch2[1] : '';
      const parts = [region1, region2, region3].filter(Boolean);
      const uniq: string[] = [];
      parts.forEach(p => { if (p && !uniq.includes(p)) uniq.push(p); });
      const head = uniq.join(' ');
      if (roadLine) {
        const tail = [dong, jibun2].filter(Boolean).join(' ');
        const addr = tail ? `${head} ${roadLine} (${tail})` : `${head} ${roadLine}`;
        return building ? `${addr} ${building}` : addr;
      }
      const line = head || a.road || '';
      if (line) return String(line);
      const fallback = j2?.display_name || a.road || '';
      if (fallback) return String(fallback);
    } catch {}
    return '';
  };

  // 품질 검사: 도로명/괄호(지번)가 포함되었는지
  const isGoodAddress = (s: string): boolean => {
    try {
      const hasParen = /\(.+\)/.test(s);
      const hasRoad = /([가-힣A-Za-z]+(로|길)\s*\d+)/.test(s);
      return hasParen && hasRoad;
    } catch { return false; }
  };

  // 카드 타이틀용 포맷: "서울시 강남구 테헤란로 323 (역삼1동 702-23). 건물이름"
  const formatCardTitle = (s: string): string => {
    try {
      let x = String(s || '').trim();
      // 양쪽의 국가/우편번호 제거
      x = x.replace(/^대한민국\s*/,'').replace(/\s*대한민국\s*$/,'');
      x = x.replace(/\b\d{5}\.?\s*$/,'').trim();
      // "에 위치한 건물." → ". 건물" 변환
      x = x.replace(/\s*에 위치한\s*/g, ' ').replace(/\.\s*$/, '');
      // 괄호가 없으면 그대로 반환, 있으면 괄호 뒤에 마침표 추가
      if (/\(.+\)/.test(x)) {
        const m = x.match(/^(.*?\))\s*(.*)$/);
        if (m) {
          const head = m[1]; const tail = m[2];
          return tail ? `${head}. ${tail}` : head;
        }
      }
      return x;
    } catch { return s; }
  };

  const ensureLinkMeta = useCallback(async (linkUrl: string) => {
    if (!linkUrl) return;
    if (linkMetaRef.current[linkUrl]) return;
    try {
      const u = new URL(linkUrl);
      // Google Maps: build thumbnail + address
      if (/maps\.google\./i.test(u.host)) {
        const ll = parseLatLng(u);
        let title = 'Google 지도';
        let image = '';
        if (ll) {
          image = mapThumbUrl(ll.lat, ll.lng);
          try { const addr = await reverseGeocodeAddress(ll.lat, ll.lng); if (addr) title = addr; } catch {}
        }
        linkMetaRef.current[linkUrl] = { title, image: image || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=128`, host: u.host };
        setLinkMetaTick(v=>v+1);
        return;
      }
      // 1) 서버 프리뷰 API 우선 시도 (제목/이미지/설명)
      try {
        const primary = (process as any)?.env?.NEXT_PUBLIC_PREVIEW_API || 'http://localhost:8080/api/link-preview';
        const r = await fetch(primary, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: linkUrl }) });
        if (r.ok) {
          const j = await r.json();
          if (j) {
            linkMetaRef.current[linkUrl] = {
              title: j.title || u.host,
              image: j.image || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=128`,
              host: j.siteName || u.host,
            };
            setLinkMetaTick(v=>v+1); return;
          }
        }
      } catch {}
      try {
        const ne = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(linkUrl)}`);
        const j = await ne.json();
        if (j && (j.title || j.thumbnail_url)) {
          linkMetaRef.current[linkUrl] = { title: j.title || u.host, image: j.thumbnail_url || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=64`, host: u.host };
          setLinkMetaTick(v=>v+1); return;
        }
      } catch {}
      linkMetaRef.current[linkUrl] = { title: u.host, image: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=64`, host: u.host };
      setLinkMetaTick(v=>v+1);
    } catch {}
  }, []);

  // 현재 뷰어가 이미지일 때 가로 100% 기준 비율 계산
  useEffect(() => {
    try {
      if (!linkViewer) { setViewerRatio(null); return; }
      const links = gallery.filter((g:any) => String(g?.type||'') === 'link' || (/^https?:/i.test(String(g?.uri||'')) && !/\.(jpg|jpeg|png|gif|webp)$/i.test(String(g?.uri||''))));
      const cur = links[Math.max(0, Math.min(linkViewer.index, links.length-1))];
      const url = String(cur?.uri || '');
      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(url);
      if (!isImg) { setViewerRatio(null); setViewerImgSize(null); return; }
      if (Platform.OS === 'web') {
        try {
          const img = document.createElement('img');
          img.addEventListener('load', () => { try { const w = (img as any).naturalWidth || img.width; const h = (img as any).naturalHeight || img.height; if (w && h) { setViewerRatio(w/h); setViewerImgSize({ w, h }); } } catch {} });
          img.src = url;
        } catch { setViewerRatio(null); }
      } else {
        try { const RNImage = require('react-native').Image; RNImage.getSize(url, (w:number,h:number)=> { setViewerRatio(w/h); setViewerImgSize({ w, h }); }, ()=> { setViewerRatio(null); setViewerImgSize(null); }); } catch { setViewerRatio(null); setViewerImgSize(null); }
      }
    } catch { setViewerRatio(null); }
  }, [linkViewer, gallery]);
  // v2 미리보기 상태 제거 (v3에서 재정의)
  // 갤러리 간소화: 옵션 제거
  const SHOW_GALLERY = true; // 갤러리 v3 활성화

// 웹에서 하단 고정 바를 뷰포트에 붙이기 위한 포털 컴포넌트
function FixedBottomBar({ children, style }: { children: React.ReactNode; style?: any }) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ReactDOM = require('react-dom');
    const [node] = React.useState(() => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      return div;
    });
    React.useEffect(() => () => { try { document.body.removeChild(node); } catch {} }, [node]);
    return ReactDOM.createPortal(
      <View style={[styles.bulkBarFixed, style]}>{children}</View>,
      node
    );
  }
  return <View style={[styles.bulkBar, style]}>{children}</View>;
}
  // New simple gallery v2
  // 갤러리 v3: 매우 단순한 4열 그리드 + 미리보기
  const [mediaV3, setMediaV3] = useState<string[]>([]);
  const [mediaTab, setMediaTab] = useState<'image'|'video'|'file'|'link'|'qr'|'other'>('image');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [resolvedPreviewUri, setResolvedPreviewUri] = useState<string | null>(null);
  // 파일 항목 URL 선해결 캐시 (로컬 UUID/라우트 → Storage 다운로드 URL로 정규화)
  const [resolvedFileMap, setResolvedFileMap] = useState<Record<string, string>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [userMetaMap, setUserMetaMap] = useState<Record<string, any>>({});
  const ensureMediaName = useCallback(async (raw: string): Promise<string> => {
    try {
      const key = (()=>{ try { const u=new URL(String(raw)); u.search=''; u.hash=''; return u.toString(); } catch { return String(raw||''); } })();
      if (nameMap[key]) return nameMap[key];
      try { const c = await AsyncStorage.getItem(`media.name:${key}`); if (c) { setNameMap((p)=>({ ...p, [key]: c })); return c; } } catch {}
      // Special case: YouTube/oEmbed title
      try {
        const U = new URL(String(raw));
        const host = U.host.toLowerCase();
        if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host)) {
          try {
            const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(String(key))}&format=json`;
            const resp = await fetch(oembed);
            if (resp.ok) {
              const data: any = await resp.json();
              const nm = String(data?.title || '').trim();
              if (nm) {
                setNameMap((p)=>({ ...p, [key]: nm }));
                try { await AsyncStorage.setItem(`media.name:${key}`, nm); } catch {}
                try {
                  const rawM = await AsyncStorage.getItem(metaKey);
                  const m = rawM ? JSON.parse(rawM) : {};
                  m[key] = { ...(m[key]||{}), name: nm };
                  await AsyncStorage.setItem(metaKey, JSON.stringify(m));
                  setUserMetaMap(m);
                } catch {}
                return nm;
              }
            }
          } catch {}
        }
      } catch {}
      // extract bucket/object from URL
      let bucket=''; let objectPath='';
      try {
        const m = String(raw).match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
        if (m) { bucket = m[1]; objectPath = decodeURIComponent(m[2]); }
        else {
          const U = new URL(String(raw));
          if ((/\.appspot\.com$/i.test(U.host) || /\.firebasestorage\.app$/i.test(U.host)) && /^\/o\//i.test(U.pathname)) {
            bucket = U.host; objectPath = decodeURIComponent(U.pathname.replace(/^\/o\//i,''));
          }
        }
      } catch {}
      if (!(bucket && objectPath)) return '';
      // 보안 규칙 대비: 메타 조회 전 인증 보장
      try { if (!firebaseAuth.currentUser) { const { signInAnonymously } = await import('firebase/auth'); await signInAnonymously(firebaseAuth).catch(()=>{}); } } catch {}
      const storage = getStorage(firebaseAuth.app as any, `gs://${bucket}`);
      let md: any = null;
      try { md = await getMetadata(storageRef(storage, objectPath)); } catch {}
      let nm = '';
      try { nm = md?.customMetadata?.originalName || ''; } catch {}
      if (!nm) {
        const cd = String(md?.contentDisposition||'');
        const m1 = cd.match(/filename\*=\s*(?:UTF-8''|utf-8'')?([^;]+)/);
        if (m1) { try { nm = decodeURIComponent(m1[1]); } catch { nm = m1[1]; } }
        if (!nm) {
          const m2 = cd.match(/filename\s*=\s*"?([^";]+)"?/);
          if (m2) nm = m2[1];
        }
      }
      // 최후 보강: HEAD 요청으로 커스텀 메타(원본명) 읽기
      if (!nm) {
        try {
          const head = await fetch(key, { method: 'HEAD' });
          const metaHead = head?.headers?.get('x-goog-meta-originalname') || head?.headers?.get('X-Goog-Meta-Originalname');
          if (metaHead) nm = decodeURIComponent(metaHead);
        } catch {}
      }
      // md.name(객체 경로명)이 UUID/타임스탬프 기반일 수 있으므로 사람이 읽기 좋은 형태일 때만 채택
      if (!nm) {
        const rawObjectName = String(md?.name||'');
        const looksUuidish = /^[0-9a-f]{8}-[0-9a-f-]{13,}\.[a-z0-9]+$/i.test(rawObjectName) || /^\d{10,}[-_][0-9a-f-]{6,}.*\.[a-z0-9]+$/i.test(rawObjectName);
        if (!looksUuidish && /\.[a-z0-9]+$/i.test(rawObjectName)) {
          nm = rawObjectName;
        }
      }
      if (nm) {
        setNameMap((p)=>({ ...p, [key]: nm }));
        try { await AsyncStorage.setItem(`media.name:${key}`, nm); } catch {}
        // 사용자 메타에도 동기 기록해 이후 우선 표시되도록 함
        try {
          const rawM = await AsyncStorage.getItem(metaKey);
          const m = rawM ? JSON.parse(rawM) : {};
          m[key] = { ...(m[key]||{}), name: nm };
          await AsyncStorage.setItem(metaKey, JSON.stringify(m));
          setUserMetaMap(m);
        } catch {}
      }
      return nm;
    } catch { return ''; }
  }, [nameMap]);
  useEffect(() => {
    (async () => {
      try {
        if (!previewUri) { setResolvedPreviewUri(null); return; }
        // 1) 선해결 캐시가 있으면 즉시 사용
        const cached = resolvedFileMap[previewUri];
        if (cached) { setResolvedPreviewUri(cached); return; }
        // 2) 정규화 함수로 해석 (UUID/gs/http 모두)
        const out = await resolveStorageUrl(previewUri);
        setResolvedPreviewUri(out);
        // 3) PDF면 썸네일 프리페치
        try { if (/\.pdf(\?|$)/i.test(String(out))) { await ensurePdfThumb(String(out)); } } catch {}
      } catch { setResolvedPreviewUri(previewUri); }
    })();
  }, [previewUri, resolveStorageUrl, resolvedFileMap, ensurePdfThumb]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editProtect, setEditProtect] = useState(false);
  const [editPublic, setEditPublic] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 로딩 실패한 이미지 추적하여 정리 대상으로 표시
  const [broken, setBroken] = useState<Set<string>>(new Set());
  // 갤러리 전체 비공개 플래그 제거(개별 토글만 사용)
  const [galleryPrivate, setGalleryPrivate] = useState<boolean>(false);

  // 파일 탭 노출 시 PDF 썸네일 프리페치(웹 전용)
  useEffect(() => {
    try {
      if ((Platform as any).OS !== 'web') return;
      if (mediaTab !== 'file') return;
      const files = (gallery||[]).filter((g:any)=> String(g?.type||'')==='file' && g.uri && /\.pdf(\?|$)/i.test(String(g.uri))).map((g:any)=> String(g.uri));
      files.forEach(async (u:string)=>{ try { const ku = pdfKey(u); if (pdfThumbs[ku]) return; const cached = await AsyncStorage.getItem(`pdf.thumb:${ku}`); if (cached) { setPdfThumbs((p)=>({ ...p, [ku]: cached })); return; } await ensurePdfThumb(u); } catch {} });
    } catch {}
  }, [gallery, mediaTab, ensurePdfThumb, pdfKey, pdfThumbs]);

  // 파일 탭이 열릴 때 모든 파일 URI를 선해결하여 썸네일/제목/미리보기에 사용
  useEffect(() => {
    (async () => {
      try {
        if ((Platform as any).OS !== 'web') return;
        if (mediaTab !== 'file') return;
        const files = (gallery||[]).filter((g:any)=> String(g?.type||'')==='file' && g.uri);
        const next: Record<string,string> = { ...resolvedFileMap };
        await Promise.all(files.map(async (it:any) => {
          try {
            if (next[it.uri]) return;
            const resolved = await resolveStorageUrl(String(it.uri));
            if (resolved && /^https?:\/\//i.test(resolved)) next[it.uri] = resolved;
            // PDF면 썸네일 즉시 생성 트리거
            try { if (/\.pdf(\?|$)/i.test(String(resolved))) { await ensurePdfThumb(String(resolved)); } } catch {}
          } catch {}
        }));
        setResolvedFileMap(next);
      } catch {}
    })();
  }, [gallery, mediaTab, resolveStorageUrl, ensurePdfThumb]);

  // 동영상 탭: 원본 파일명 메타데이터 프리페치 (contentDisposition/customMetadata)
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== 'web') return;
        if (mediaTab !== 'video') return;
        const vids = (gallery||[]).filter((g:any)=> String(g?.type||'')==='video' && g.uri);
        for (const it of vids) {
          try { await ensureMediaName(String(it.uri)); } catch {}
        }
      } catch {}
    })();
  }, [gallery, mediaTab, ensureMediaName]);

  // 동영상 탭: 비디오 썸네일 프리페치
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== 'web') return;
        if (mediaTab !== 'video') return;
        const vids = (gallery||[]).filter((g:any)=> String(g?.type||'')==='video' && g.uri);
        for (const it of vids) {
          try {
            const u = new URL(String(it.uri));
            const h = u.host.toLowerCase();
            if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) continue;
          } catch {}
          try { await ensureVideoThumb(String(it.uri)); } catch {}
        }
      } catch {}
    })();
  }, [gallery, mediaTab, ensureVideoThumb]);

  // 사진 탭: 원본 파일명 메타데이터 프리페치
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== 'web') return;
        if (mediaTab !== 'image') return;
        const imgs = (gallery||[]).filter((g:any)=> String(g?.type||'')==='image' && g.uri);
        for (const it of imgs) {
          try { await ensureMediaName(String(it.uri)); } catch {}
        }
      } catch {}
    })();
  }, [gallery, mediaTab, ensureMediaName]);

  // 1회 마이그레이션: 갤러리에 남아있는 UUID/비-URL 항목을 실제 다운로드 URL로 교정 저장
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== 'web') return;
        if (mediaTab !== 'file') return;
        const needsFix = (gallery||[]).filter((g:any)=> g.type==='file' && g.uri && !/^https?:\/\//i.test(String(g.uri)) && !/^gs:\/\//i.test(String(g.uri)));
        if (!needsFix.length) return;
        const fixed: any[] = [];
        for (const it of needsFix) {
          try {
            const resolved = await resolveStorageUrl(String(it.uri));
            let finalUrl = resolved;
            if (!/^https?:\/\//i.test(String(finalUrl||''))) {
              // 추가 보강: 같은 이름으로 저장된 SSOT 항목 중 http URL이 있으면 사용
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const store = require('@/src/features/chat/store/media.store');
                const st = store.useMediaStore.getState();
                const list = Object.values(st.items||{}) as any[];
                const hit = list.filter((m:any)=> String(m?.name||'')===String(it.name||'') && /^https?:\/\//i.test(String(m?.uriHttp||''))).sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0))[0];
                if (hit?.uriHttp) finalUrl = String(hit.uriHttp);
              } catch {}
            }
            if (finalUrl && /^https?:\/\//i.test(finalUrl)) {
              fixed.push({ from: it.uri, to: finalUrl, name: it.name });
            }
          } catch {}
        }
        if (!fixed.length) return;
        // 상태 반영 + 메타에 매핑 기록(legacyUri -> resolvedUri)
        const updated = (gallery||[]).map((g:any)=>{
          const hit = fixed.find(f=>f.from===g.uri);
          return hit ? { ...g, uri: hit.to, type: 'file' } : g;
        });
        setGallery(updated);
        // 퍼시스트 저장 (글로벌 + 사용자 키)
        try {
          const uidNow = firebaseAuth.currentUser?.uid || 'anonymous';
          const keyGlobal = 'chat.media.items';
          const keyUser = `u:${uidNow}:chat.media.items`;
          await AsyncStorage.setItem(keyGlobal, JSON.stringify(updated));
          await AsyncStorage.setItem(keyUser, JSON.stringify(updated));
          try {
            const rawM = await AsyncStorage.getItem(metaKey);
            const m = rawM ? JSON.parse(rawM) : {};
            fixed.forEach(f => { m[f.from] = { ...(m[f.from]||{}), resolved: f.to, name: f.name }; });
            await AsyncStorage.setItem(metaKey, JSON.stringify(m));
          } catch {}
        } catch {}
        // SSOT에도 정합성 반영
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const store = require('@/src/features/chat/store/media.store');
          fixed.forEach(f=>{
            const id = store.mediaIdForUri(String(f.to));
            store.useMediaStore.getState().addOrUpdate({ id, uriHttp: f.to, name: f.name, location: 'gallery', visibility: 'private', type: 'file' });
          });
        } catch {}
      } catch {}
    })();
  }, [mediaTab, gallery, resolveStorageUrl]);

  

  const toggleSelect = (u: string) => {
    setSelecting(true);
    setSelected((prev) => { const n = new Set(prev); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  };
  const scrollRef = useRef<ScrollView>(null);
  const [viewportH, setViewportH] = useState(0);
  const [canScroll, setCanScroll] = useState(false);

  const [authUid, setAuthUid] = useState<string | null>(firebaseAuth.currentUser?.uid ?? null);
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => setAuthUid(u?.uid ?? null));
    return () => unsub();
  }, []);
  const uid = useMemo(() => authUid || currentProfile?.userId || null, [authUid, currentProfile]);
  const metaKey = useMemo(() => (uid ? `u:${uid}:chat.media.meta` : 'chat.media.meta:unknown'), [uid]);
  const treasureKey = useMemo(() => (uid ? `u:${uid}:treasure.items` : 'treasure.items:unknown'), [uid]);
  const galleryKey = useMemo(() => (uid ? `u:${uid}:chat.media.items` : 'chat.media.items'), [uid]);

  // 사용자 메타(수동 매핑/이름) 로드: 파일/영상 제목 보강용
  useEffect(() => {
    (async () => {
      try { const raw = await AsyncStorage.getItem(metaKey); setUserMetaMap(raw ? JSON.parse(raw) : {}); } catch { setUserMetaMap({}); }
    })();
  }, [metaKey, mediaTab, galleryKey]);

  const deriveName = (u?: string) => {
    if (!u) return '사진';
    try {
      const clean = decodeURIComponent(u.split('?')[0]);
      const parts = clean.split('/');
      const last = parts[parts.length - 1] || '사진';
      return last.slice(0, 60);
    } catch { return '사진'; }
  };

  const addToGallery = React.useCallback(async (uri: string, type: 'image' | 'video' | 'file' | 'link' | 'qr' = 'image') => {
    if (!uri) return;
    try {
      // 메모리 상태 반영 (중복 방지) - 최신이 항상 위로
      if (type === 'image' || type === 'qr') {
        setMediaV3((prev) => {
          const next = [uri, ...prev.filter(u => u !== uri)];
          return next;
        });
      }
      setGallery((prev) => {
        const exists = prev.some((it) => it.uri === uri);
        if (exists) {
          // 이미 존재하면 맨 앞으로 이동
          const moved = [{ ...prev.find(it=>it.uri===uri)! }, ...prev.filter(it=>it.uri!==uri)];
          (async () => { try { await AsyncStorage.setItem(galleryKey, JSON.stringify(moved)); } catch {} })();
          return moved;
        }
        // 기본 공개 정책: 비공개 설정하지 않으면 공개
        const finalType: 'image'|'video'|'file' = (type === 'qr' ? 'image' : (type as any));
        const entry = { uri, type: finalType, public: true, name: deriveName(uri), protect: false, createdAt: Date.now() } as any;
        const next = [entry, ...prev];
        (async () => { try { await AsyncStorage.setItem(galleryKey, JSON.stringify(next)); } catch {} })();
        return next;
      });

      // 글로벌 키에도 동기 기록 (기존 항목이 있으면 메타 유지하고 순서만 갱신)
      try {
        const keyGlobal = 'chat.media.items';
        const rawGlobal = await AsyncStorage.getItem(keyGlobal);
        const listGlobal: any[] = rawGlobal ? JSON.parse(rawGlobal) : [];
        const idx = listGlobal.findIndex((it) => it?.uri === uri);
        const entry = { uri, type, public: true, createdAt: Date.now(), name: deriveName(uri), protect: false };
        const nextGlobal = idx >= 0 ? [listGlobal[idx], ...listGlobal.filter((it:any)=>it?.uri!==uri)] : [entry, ...listGlobal];
        await AsyncStorage.setItem(keyGlobal, JSON.stringify(nextGlobal));
      } catch {}

      // SSOT 반영
      try {
        const id = mediaIdForUri(uri);
        useMediaStore.getState().addOrUpdate({
          id,
          uriHttp: /^https?:\/\//i.test(uri) ? uri : undefined,
          uriData: /^data:/i.test(uri) ? uri : undefined,
          name: deriveName(uri),
          createdAt: Date.now(),
          visibility: 'public',
          location: 'gallery',
          protect: false,
        });
      } catch {}
    } catch {}
  }, [galleryKey]);

  const detectType = (u: string): any => {
    if (!u) return 'file';
    const src = u.toLowerCase();
    // 1) QR: 구글 차트 API 또는 저장 경로에 /qr/ 포함
    try {
      if (/chart\.googleapis\.com\/chart/.test(src) && /[?&]cht=qr\b/.test(src)) return 'qr' as any;
      try {
        const url = new URL(src);
        const path = decodeURIComponent(String(url.pathname||''));
        if (path.includes('/qr/')) return 'qr' as any;
      } catch {}
    } catch {}
    // 2) data/blob/file 스킴 우선 처리
    if (src.startsWith('data:image/')) return 'image';
    if (src.startsWith('blob:')) return 'image';
    if (src.startsWith('file:')) {
      const base = src.split('?')[0];
      if (/(\.jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/.test(base)) return 'image';
      if (/(\.mp4|mov|m4v|webm|mkv|avi)$/.test(base)) return 'video';
      return 'file';
    }
    // 3) 확장자 기반 분류(쿼리 제거)
    const lower = src.split('?')[0];
    if (/(\.jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/.test(lower)) return 'image';
    if (/(\.mp4|mov|m4v|webm|mkv|avi)$/.test(lower)) return 'video';
    if (/(\.pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/.test(lower)) return 'file';
    // 4) 나머지 http(s)는 호스트로 분류
    if (/^https?:/.test(src)) {
      try {
        const uo = new URL(u);
        const h = uo.host.toLowerCase();
        if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) return 'video';
      } catch {}
      return 'link';
    }
    return 'file';
  };

  useEffect(() => {
    // 스토어 초기화로 저장된 아바타/프로필 로드
    initialize();
    if (currentProfile) {
      setDisplayName((currentProfile as any).chatName || currentProfile.displayName);
      try { setUsername(((currentProfile as any).username || '').trim()); } catch {}
      setUseHash(Boolean((currentProfile as any).useHashInChat));
      setBio(currentProfile.bio || '');
      setCustomStatusText(currentProfile.customStatus || '');
      setTags(Array.isArray(currentProfile?.tags) ? ([...currentProfile!.tags!] as string[]) : []);
      setTagDraft('');
      setAvatar(currentProfile.avatar);
      setSelectedStatus(currentProfile.status);
      // 아바타가 있는데 갤러리에 항목이 없다면 미리보기 소스로 활용
      if (currentProfile.avatar && !currentProfile.avatar.startsWith('blob:')) {
        setMediaV3((prev) => {
          const set = new Set(prev);
          set.add(currentProfile.avatar!);
          return Array.from(set);
        });
        // 갤러리에 자동 저장
        addToGallery(currentProfile.avatar!, 'image');
      }
    }
  }, [currentProfile, initialize, addToGallery]);

  const saveUsername = useCallback(async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) { Alert.alert('안내','로그인이 필요합니다.'); return; }
      const raw = (username || '').trim();
      if (!raw) { Alert.alert('안내','아이디를 입력해 주세요.'); return; }
      const valid = /^[a-z0-9_.-]{3,20}$/i.test(raw);
      if (!valid) { Alert.alert('안내','아이디는 3~20자 영문/숫자/_.- 만 가능합니다.'); return; }
      setUsernameSaving(true);
      const lower = raw.toLowerCase();
      const usersRef = (await import('firebase/firestore')).collection(firestore, 'users');
      const { getDocs, query, where, limit } = await import('firebase/firestore');
      const snap = await getDocs(query(usersRef, where('usernameLower','==', lower), limit(1)));
      if (!snap.empty && snap.docs[0].id !== uid) {
        Alert.alert('안내','이미 사용 중인 아이디입니다.');
        setUsernameSaving(false);
        return;
      }
      const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(firestore, 'users', uid), { username: raw, usernameLower: lower, updatedAt: serverTimestamp() } as any, { merge: true });
      try { useChatProfileStore.getState().updateProfile?.({ username: raw } as any); } catch {}
      Alert.alert('완료','아이디가 저장되었습니다.');
    } catch {
      Alert.alert('오류','아이디 저장에 실패했습니다.');
    } finally {
      setUsernameSaving(false);
    }
  }, [username]);

  // 갤러리 비공개 메타 로드 제거: 전역 플래그는 사용하지 않음
  useEffect(() => { setGalleryPrivate(false); }, [metaKey]);

  // 갤러리 전체 비공개/공개 토글 제거: 개별 항목 토글만 지원

  // 동영상 항목도 동일하게 URL 정규화(legacy URI → download URL) 및 이름 메타 백필
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== 'web') return;
        if (mediaTab !== 'video') return;
        const needsFix = (gallery||[]).filter((g:any)=> g.type==='video' && g.uri && !/^https?:\/\//i.test(String(g.uri)) && !/^gs:\/\//i.test(String(g.uri)));
        if (!needsFix.length) return;
        const fixed: any[] = [];
        for (const it of needsFix) {
          try {
            const resolved = await resolveStorageUrl(String(it.uri));
            if (resolved && /^https?:\/\//i.test(String(resolved))) {
              fixed.push({ from: it.uri, to: resolved, name: it.name });
            }
          } catch {}
        }
        if (!fixed.length) return;
        const updated = (gallery||[]).map((g:any)=>{ const hit=fixed.find(f=>f.from===g.uri); return hit ? { ...g, uri: hit.to, type: 'video' } : g; });
        setGallery(updated);
        try {
          const uidNow = firebaseAuth.currentUser?.uid || 'anonymous';
          const keyGlobal = 'chat.media.items';
          const keyUser = `u:${uidNow}:chat.media.items`;
          await AsyncStorage.setItem(keyGlobal, JSON.stringify(updated));
          await AsyncStorage.setItem(keyUser, JSON.stringify(updated));
          try {
            const rawM = await AsyncStorage.getItem(metaKey);
            const m = rawM ? JSON.parse(rawM) : {};
            fixed.forEach(f => { m[f.from] = { ...(m[f.from]||{}), resolved: f.to, name: f.name }; });
            await AsyncStorage.setItem(metaKey, JSON.stringify(m));
            setUserMetaMap(m);
          } catch {}
        } catch {}
        // 이름 메타 프리페치
        for (const f of fixed) { try { await ensureMediaName(String(f.to)); } catch {} }
      } catch {}
    })();
  }, [mediaTab, gallery, resolveStorageUrl, metaKey, ensureMediaName]);

  const reloadGallery = React.useCallback(async () => {
      try {
      const normalizeUri = (u: string) => { try { const url = new URL(String(u)); url.search = ''; url.hash = ''; return url.toString(); } catch { return String(u||''); } };
      // 해시 캐시: uri -> hash (동일 이미지 중복 제거용)
      const getHashCache = async (): Promise<Record<string,string>> => { try { const r = await AsyncStorage.getItem('chat.media.hashes'); return r ? JSON.parse(r) : {}; } catch { return {}; } };
      const setHashCache = async (m: Record<string,string>) => { try { await AsyncStorage.setItem('chat.media.hashes', JSON.stringify(m)); } catch {} };
      const computeHash = async (uri: string): Promise<string | null> => {
        try {
          // 웹: SubtleCrypto 우선
          if (typeof window !== 'undefined' && (window as any).crypto?.subtle) {
            const res = await fetch(uri, { cache: 'force-cache' });
            const buf = await res.arrayBuffer();
            const digest = await (window as any).crypto.subtle.digest('SHA-1', buf);
            const b = Array.from(new Uint8Array(digest)).map((x)=>x.toString(16).padStart(2,'0')).join('');
            return `sha1:${b}`;
          }
          // 네이티브/폴백: 앞뒤 바이트로 경량 해시(djb2)
          const res2 = await fetch(uri);
          const buf2 = new Uint8Array(await res2.arrayBuffer());
          let hash = 5381;
          const take = 65536; // 64KB
          const head = buf2.slice(0, Math.min(take, buf2.length));
          const tail = buf2.slice(Math.max(0, buf2.length - take));
          const mix = new Uint8Array(head.length + tail.length);
          mix.set(head, 0); mix.set(tail, head.length);
          for (let i=0;i<mix.length;i++) hash = ((hash << 5) + hash) + mix[i];
          return `djb2:${(hash>>>0).toString(16)}`;
        } catch { return null; }
      };
      const hashFor = async (uri: string, cache: Record<string,string>): Promise<string | null> => {
        if (!uri) return null; if (cache[uri]) return cache[uri];
        const h = await computeHash(uri); if (h) cache[uri] = h; return h;
      };
      // 우선 SSOT 존재 시 그것을 우선 사용 (갤러리+보물창고 모두 포함, 비공개도 함께 표시)
      const uidNow = uid || firebaseAuth.currentUser?.uid || 'anonymous';
      try {
        // 갤러리(공개) + 보물창고(비공개) 함께 취합
        const state = useMediaStore.getState();
        const idsG = state.byLocation.gallery || [];
        const idsT = state.byLocation.treasure || [];
        const uniqIds = Array.from(new Set([...(idsG as string[]), ...(idsT as string[])]));
        if (uniqIds.length > 0) {
          const list = uniqIds.map(id => state.items[id]).filter(Boolean) as any[];
          // 정합성: 링크로 저장된 항목 중 URL 기반으로 파일/QR로 판별되는 경우 스토어 타입 교정
          try {
            for (const it of list) {
              try {
                const uri = String(it?.uriHttp || it?.uriData || '');
                const detected = detectType(uri);
                if (it?.type === 'link' && detected !== 'link') {
                  useMediaStore.getState().addOrUpdate({ id: it.id, type: detected as any });
                }
              } catch {}
            }
          } catch {}
          // id가 다르더라도 동일한 이미지 URI면 하나만 남김
          const mapped: MediaItem[] = list
            .sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0))
            .map((it:any)=> {
              const uri = it.uriHttp || it.uriData || '';
              const nameExt = String(it.name||'');
              const looksFileByName = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/i.test(nameExt);
              const t: MediaItem['type'] = (it.type as MediaItem['type']) || (looksFileByName ? 'file' : detectType(uri));
              return {
                uri,
                type: t,
                public: it.visibility !== 'private',
                name: it.name,
                protect: it.protect,
                createdAt: it.createdAt,
              } as MediaItem;
            });
          const seen = new Set<string>();
          const sorted: MediaItem[] = [];
          for (const m of mapped) {
            const key = normalizeUri(m.uri);
            if (!key) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            sorted.push(m);
          }
          // 빠른 웹 로드: 해시 기반 중복 제거를 건너뛰고 즉시 렌더링
          if (Platform.OS === 'web') {
            setGallery(sorted);
            setMediaV3(sorted.filter(x=>x.type==='image').map(x=>x.uri));
            return;
          }
          // 이미지/QR 한정: 해시 기반 추가 중복 제거 (비동기 계산, 캐시 활용)
          try {
            const cache = await getHashCache();
            const seenHash = new Set<string>();
            const afterHash: MediaItem[] = [];
            for (const m of sorted) {
              if ((m as any).type !== 'image' && (m as any).type !== 'qr') { afterHash.push(m); continue; }
              const h = await hashFor(m.uri, cache);
              if (h && seenHash.has(h)) continue;
              if (h) seenHash.add(h);
              afterHash.push(m);
            }
            await setHashCache(cache);
            setGallery(afterHash);
            setMediaV3(afterHash.filter(x=>x.type==='image').map(x=>x.uri));
            return;
          } catch {}
          setGallery(sorted);
          setMediaV3(sorted.filter(x=>x.type==='image').map(x=>x.uri));
          return;
        } else {
          // 없으면 한 번 마이그레이션 시도 후 다시 로드
          await useMediaStore.getState().migrateFromLegacy(uidNow);
          const s2 = useMediaStore.getState();
          if ((s2.byLocation.gallery||[]).length>0) {
            const list2 = s2.byLocation.gallery.map(id=>s2.items[id]).filter(Boolean) as any[];
            const sorted2: MediaItem[] = list2
              .filter((it:any)=> it.visibility !== 'private')
              .sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0))
              .map((it:any)=> ({
              uri: it.uriHttp || it.uriData || '',
              type: 'image' as MediaItem['type'], public: it.visibility!=='private', name: it.name, protect: it.protect, createdAt: it.createdAt,
            }));
            setGallery(sorted2); setMediaV3(sorted2.filter(x=>x.type==='image').map(x=>x.uri));
            return;
          }
        }
      } catch {}
      const [rawNew, rawOld, rawGlobal, rawMeta, rawTreasure] = await Promise.all([
          AsyncStorage.getItem(galleryKey),
          AsyncStorage.getItem(uid ? `u:${uid}:chat.media.photos` : 'chat.media.photos'),
        AsyncStorage.getItem('chat.media.items'),
        AsyncStorage.getItem(metaKey),
        AsyncStorage.getItem(treasureKey),
        ]);
        const acc: MediaItem[] = [];
        let meta: Record<string, any> = {};
        try { meta = rawMeta ? JSON.parse(rawMeta) : {}; } catch {}
        // 보물창고 항목도 함께 읽어와 acc에 추가(비공개)
        try {
          const t = rawTreasure ? JSON.parse(rawTreasure) : [];
          (t||[]).forEach((it:any)=>{ if (it?.uri) { const looksFileByName = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/i.test(String(it.name||'')); const typ = it.type ?? (looksFileByName ? 'file' : detectType(String(it.uri))); acc.push({ uri: String(it.uri), type: typ, public: false, name: it.name || deriveName(String(it.uri)), protect: !!it.protect, createdAt: it.createdAt ?? 0 }); } });
        } catch {}
        const loadArr = (raw?: string | null) => {
          if (!raw) return;
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              arr.forEach((v: any) => {
              if (typeof v === 'string') acc.push({ uri: v, type: detectType(v), public: true, name: deriveName(v), protect: false, createdAt: 0 });
              else if (v?.uri) { const looksFileByName = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/i.test(String(v.name||'')); const typ = v.type ?? (looksFileByName ? 'file' : detectType(String(v.uri))); acc.push({ uri: v.uri, type: typ, public: (v.public === false ? false : true), name: v.name || deriveName(v.uri), protect: !!v.protect, createdAt: v.createdAt ?? 0 }); }
              });
            }
          } catch {}
        };
      loadArr(rawNew); loadArr(rawOld); loadArr(rawGlobal);
      // blob: 링크 제거 (새로고침 후 무효), data:는 유지, http/https/file만 허용. 공개/비공개 모두 포함
      const filtered = acc.filter(it => it.uri && !String(it.uri).startsWith('blob:'));
          const uniq: Record<string, MediaItem> = {};
      filtered.forEach(it => {
        const ex = uniq[it.uri];
        if (!ex) { uniq[it.uri] = it; return; }
        uniq[it.uri] = {
          ...it,
          ...ex,
          // 비공개 우선 병합 (false 우선)
          public: (ex.public === false || it.public === false) ? false : (ex.public ?? it.public),
          protect: (ex.protect ?? it.protect),
          name: (ex.name ?? it.name),
          createdAt: Math.max(ex?.createdAt ?? 0, it?.createdAt ?? 0),
        } as any;
      });
      // 메타(비공개/보호/이름) 오버레이
      Object.entries(meta).forEach(([uri, m]: any) => {
        if (!uniq[uri]) return;
        uniq[uri] = { ...uniq[uri], ...m, public: m?.public === false ? false : (uniq[uri].public ?? m?.public) } as any;
      });
      const itemsRaw = Object.values(uniq)
        .map((it:any)=> {
          const uriStr = String(it?.uri||'');
          let typ = it.type || detectType(uriStr);
          // 강제 보정: 동영상 확장자 또는 메타 타입이 video면 video로 고정
          try {
            const lower = uriStr.split('?')[0].toLowerCase();
            const isVid = /(\.mp4|\.mov|\.m4v|\.webm|\.mkv|\.avi)$/.test(lower);
            let normKey = uriStr;
            try { const u = new URL(uriStr); u.search=''; u.hash=''; normKey = u.toString(); } catch {}
            const metaType = (userMetaMap?.[uriStr]?.type) || (userMetaMap?.[normKey]?.type);
            if (isVid || String(metaType||'').toLowerCase()==='video') typ = 'video';
          } catch {}
          return ({ ...it, type: typ, public: (it.public === false ? false : true) });
        })
        .filter((it:any)=> it.type !== 'link'); // 링크는 사진탭(source)에 섞이지 않게 제거
      // query/hash 제거 기준으로 최종 중복 제거
      const seen2 = new Set<string>();
      let items: MediaItem[] = [] as any;
      for (const m of itemsRaw) {
        const key = normalizeUri(m.uri);
        if (!key) continue;
        if (seen2.has(key)) continue;
        seen2.add(key);
        items.push(m as any);
      }
      // 웹에서는 초기 진입 속도를 위해 해시 계산을 생략하고 빠르게 렌더
      if (Platform.OS === 'web') {
        const sortedQuick = (items as any[]).sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setGallery(sortedQuick);
        setMediaV3(sortedQuick.filter(x=>x.type==='image').map(x=>x.uri));
        return;
      }
      // 이미지/QR 해시 기반 추가 중복 제거
      try {
        const cache = await getHashCache();
        const seenHash = new Set<string>();
        const afterHash: MediaItem[] = [];
        for (const m of items) {
          if ((m as any).type !== 'image' && (m as any).type !== 'qr') { afterHash.push(m); continue; }
          const h = await hashFor(m.uri, cache);
          if (h && seenHash.has(h)) continue;
          if (h) seenHash.add(h);
          afterHash.push(m);
        }
        await setHashCache(cache);
        items = afterHash;
      } catch {}
      // 최신순 정렬 (createdAt 내림차순)
      const sorted = (items as any[]).sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setGallery(sorted);
      setMediaV3(sorted.filter(x=>x.type==='image').map(x=>x.uri));
      // 정합성 보강: 비공개 항목은 SSOT에서 treasure로 이동시켜
      // 그리드(공개 전용) 화면에서 혼입되지 않도록 보장
      try {
        const privIds = sorted.filter((it:any)=> it.public === false).map((it:any)=> mediaIdForUri(String(it.uri)));
        if (privIds.length) {
          useMediaStore.getState().moveToTreasure(privIds);
        }
      } catch {}
      setBroken(new Set());
      try { await AsyncStorage.setItem(galleryKey, JSON.stringify(sorted)); } catch {}
      } catch {}
  }, [galleryKey, uid]);

  // 갤러리 로드 (초기): 유휴 시간에 지연 실행하여 첫 페인트를 보장
  useEffect(() => {
    const idle = (cb: () => void) => {
      try { (window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 0); } catch { setTimeout(cb, 0); }
    };
    idle(() => { try { reloadGallery(); } catch {} });
  }, [reloadGallery]);
  useFocusEffect(React.useCallback(() => { reloadGallery(); return () => {}; }, [reloadGallery]));
  // 스토어 변경을 구독하여 프로필 그리드/보물창고에도 즉시 반영되도록 트리거
  useEffect(() => {
    const pending: { t?: any } = {};
    const unsub = useMediaStore.subscribe(() => {
      try {
        if (pending.t) { try { clearTimeout(pending.t); } catch {} }
        pending.t = setTimeout(() => { try { reloadGallery(); } catch {} }, 120);
      } catch {}
    });
    return () => { try { if (pending.t) clearTimeout(pending.t); unsub(); } catch {} };
  }, [reloadGallery]);

  const handleInsertSample = async () => {
    const seed = `yooyland-${Date.now()}`;
    const url = `https://picsum.photos/seed/${seed}/800/600`;
    await addToGallery(url, 'image');
    await reloadGallery();
  };

  // 갤러리 전체 비공개/공개 토글
  const toggleGalleryPrivacy = React.useCallback(async () => { /* no-op */ }, []);

  // 원격 수집 제거: 완전 초기화 준비

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        let uri = result.assets[0].uri;
        // 웹: 저장/보관 안정성을 위해 즉시 리사이즈+JPEG 변환 → dataURL 사용
        const compressWeb = async (src: string): Promise<string> => {
          try {
            const resp = await fetch(src);
            const blob = await resp.blob();
            return await new Promise((resolve) => {
              try {
                const url = URL.createObjectURL(blob);
                const canvas = document.createElement('canvas') as HTMLCanvasElement;
                const ctx = canvas.getContext('2d', { willReadFrequently: false }) as CanvasRenderingContext2D;
                const imageBitmapPromise = (window as any).createImageBitmap ? (window as any).createImageBitmap(blob) : null;
                if (imageBitmapPromise) {
                  (imageBitmapPromise as Promise<ImageBitmap>).then((bm) => {
                    const max = 1024; // 프로필용 최대 해상도 축소
                    const scale = Math.min(1, max / Math.max(bm.width, bm.height));
                    const w = Math.max(1, Math.round(bm.width * scale));
                    const h = Math.max(1, Math.round(bm.height * scale));
                    canvas.width = w; canvas.height = h;
                    ctx.drawImage(bm as any, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(dataUrl);
                  }).catch(() => resolve(src));
                } else {
                  const imgEl: any = document.createElement('img');
                  imgEl.onload = () => {
                    const max = 1024; // 프로필용 최대 해상도 축소
                    const scale = Math.min(1, max / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
                    const w = Math.max(1, Math.round(imgEl.naturalWidth * scale));
                    const h = Math.max(1, Math.round(imgEl.naturalHeight * scale));
                    canvas.width = w; canvas.height = h;
                    ctx.drawImage(imgEl, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(dataUrl);
                  };
                  imgEl.onerror = () => resolve(src);
                  imgEl.src = url;
                }
              } catch { resolve(src); }
            });
          } catch { return src; }
        };
        if (Platform.OS === 'web') {
          // 대용량/형식 불문하고 안정적인 JPEG dataURL로 통일
          uri = await compressWeb(uri);
        }
        // 저장 전 임시 미리보기
        setPendingAvatar(uri);
        // 선택 즉시 우리 미디어 갤러리에 임시 파일 URI로 추가 (file:/dataURL도 허용)
        try { await addToGallery(uri, 'image'); } catch {}

        // 새 아바타를 Storage에 업로드하여 영구 URL 확보 후 갤러리에 반영
        try {
          // 업로드 전에 웹에서 인증이 없다면 익명 로그인 보장 (403 방지)
          if (Platform.OS === 'web' && !firebaseAuth.currentUser) {
            try { await signInAnonymously(firebaseAuth); } catch {}
          }
          // 로그인 완료를 짧게 대기하여 실제 UID 확보 (anonymous-user 폴더 방지)
          for (let i = 0; i < 20 && !firebaseAuth.currentUser?.uid; i++) {
            await new Promise((r) => setTimeout(r, 100));
          }
          const theUid = (firebaseAuth.currentUser?.uid) || 'anonymous';
          const storage = firebaseStorage;
          // 파일명은 안전한 ASCII로 고정 (원본 이름 미사용)
          const path = `chatMedia/${theUid}/avatar_${Date.now()}.jpg`;
          const r = storageRef(storage, path);
          // 웹에서는 dataURL 업로드로 CORS/타입 이슈 제거, 그 외엔 바이트 업로드
          if (Platform.OS === 'web' && typeof uri === 'string' && uri.startsWith('data:')) {
            await uploadString(r, uri, 'data_url', { contentType: 'image/jpeg' } as any);
          } else {
            const res = await fetch(uri);
            const buf = await res.arrayBuffer();
            await uploadBytes(r, new Uint8Array(buf), { contentType: 'image/jpeg' } as any);
          }
          const dl = await getDownloadURL(r);

          // 갤러리/미리보기에 즉시 반영 (http URL)
          await addToGallery(dl, 'image');
          // 임시 file:/data: 항목 정리: 전역/사용자/SSOT에서 제거하여 중복 방지
          try {
            const uidNow = firebaseAuth.currentUser?.uid || 'anonymous';
            const keyGlobal = 'chat.media.items';
            const keyUser = `u:${uidNow}:chat.media.items`;
            const cleanupList = async (key: string, tempUri: string) => {
              try {
                const raw = await AsyncStorage.getItem(key);
                const arr: any[] = raw ? JSON.parse(raw) : [];
                const next = Array.isArray(arr) ? arr.filter((it:any) => String((it?.uri||it)) !== String(tempUri)) : [];
                await AsyncStorage.setItem(key, JSON.stringify(next));
              } catch {}
            };
            if (uri && (uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('file:'))) {
              await cleanupList(keyGlobal, uri);
              await cleanupList(keyUser, uri);
              try {
                const { mediaIdForUri, useMediaStore } = require('@/src/features/chat/store/media.store');
                const id = mediaIdForUri(String(uri));
                useMediaStore.getState().remove([id]);
              } catch {}
            }
          } catch {}
          // 임시 미리보기 항목을 영구 URL로 치환 (메모리/로컬 갤러리)
          try {
            setGallery(prev => {
              const mapped = prev.map(it => it.uri === uri ? { ...it, uri: dl, name: (it.name||'사진') } : it);
              // 중복 제거 + 최신순 정렬
              const byUri: Record<string, any> = {};
              mapped.forEach(it => {
                const ex = byUri[it.uri];
                if (ex) {
                  byUri[it.uri] = {
                    ...it,
                    ...ex,
                    public: (ex.public === false || it.public === false) ? false : (ex.public ?? it.public),
                    protect: (ex.protect ?? it.protect),
                    name: (ex.name ?? it.name),
                    createdAt: Math.max(ex?.createdAt ?? 0, it?.createdAt ?? 0),
                  };
                } else {
                  byUri[it.uri] = it;
                }
              });
              const dedup = Object.values(byUri).sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0));
              AsyncStorage.setItem(galleryKey, JSON.stringify(dedup)).catch(()=>{});
              return dedup as any;
            });
            setMediaV3(prev => [dl, ...prev.filter(u=>u!==uri && u!==dl)]);
        } catch {}
          setPendingAvatar(dl);
        } catch {
          // 웹 CORS 등으로 업로드 실패 시 dataURL 폴백
          try {
            const resp2 = await fetch(uri); const blob2 = await resp2.blob();
            const dataUrl: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = reject; fr.readAsDataURL(blob2); });
            if (dataUrl) {
              await addToGallery(dataUrl, 'image');
              // 임시 file: 항목을 dataURL로 치환
              try {
                setGallery(prev => {
                  const mapped = prev.map(it => it.uri === uri ? { ...it, uri: dataUrl } : it);
                  const byUri: Record<string, any> = {};
                  mapped.forEach(it => {
                    const ex = byUri[it.uri];
                    if (ex) {
                      byUri[it.uri] = {
                        ...it,
                        ...ex,
                        public: (ex.public === false || it.public === false) ? false : (ex.public ?? it.public),
                        protect: (ex.protect ?? it.protect),
                        name: (ex.name ?? it.name),
                        createdAt: Math.max(ex?.createdAt ?? 0, it?.createdAt ?? 0),
                      };
                    } else {
                      byUri[it.uri] = it;
                    }
                  });
                  const dedup = Object.values(byUri).sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0));
                  AsyncStorage.setItem(galleryKey, JSON.stringify(dedup)).catch(()=>{});
                  return dedup as any;
                });
                setMediaV3(prev => [dataUrl, ...prev.filter(u=>u!==uri && u!==dataUrl)]);
              } catch {}
              setPendingAvatar(dataUrl);
            }
        } catch {}
        }
      }
    } catch (error) {
      Alert.alert('오류', '이미지 선택에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('오류', '채팅 대화명을 입력해주세요.');
      return;
    }

    if (isSaving) return; // 중복 저장 방지

    setIsSaving(true);

    try {
      // 최종 아바타 URI 계산
      let finalAvatarUri = pendingAvatar || avatar;

      // 비-HTTPS 아바타는 저장 전에 Storage로 업로드하여 영구 HTTPS URL로 치환
      const needsUpload = !!finalAvatarUri && !/^https?:\/\//i.test(String(finalAvatarUri));
      if (needsUpload) {
        try {
          // 웹에서 인증이 없다면 익명 로그인 보장 (403 방지)
          if (!firebaseAuth.currentUser) {
            try { await signInAnonymously(firebaseAuth); } catch {}
          }
          // UID 확보 대기
          for (let i = 0; i < 30 && !firebaseAuth.currentUser?.uid; i++) {
            // 3초 한도 (30*100ms)
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 100));
          }
          const theUid = (firebaseAuth.currentUser?.uid) || 'anonymous';
          const storage = firebaseStorage;
          const path = `chatMedia/${theUid}/avatar_${Date.now()}.jpg`;
          const r = storageRef(storage, path);

          if (typeof finalAvatarUri === 'string' && finalAvatarUri.startsWith('data:')) {
            await uploadString(r, finalAvatarUri, 'data_url', { contentType: 'image/jpeg' } as any);
          } else {
            try {
              const res = await fetch(String(finalAvatarUri));
              const buf = await res.arrayBuffer();
              await uploadBytes(r, new Uint8Array(buf), { contentType: 'image/jpeg' } as any);
            } catch {
              // 마지막 폴백: dataURL로 변환 후 업로드 시도
              try {
                const resp = await fetch(String(finalAvatarUri));
                const blob = await resp.blob();
                const dataUrl: string = await new Promise((resolve, reject) => {
                  const fr = new FileReader();
                  fr.onload = () => resolve(String(fr.result || ''));
                  fr.onerror = reject;
                  fr.readAsDataURL(blob);
                });
                if (dataUrl) {
                  await uploadString(r, dataUrl, 'data_url', { contentType: 'image/jpeg' } as any);
                }
              } catch {}
            }
          }

          const dl = await getDownloadURL(r);
          finalAvatarUri = dl;
          try { await addToGallery(dl, 'image'); } catch {}
          setPendingAvatar(dl);
        } catch {
          // 업로드가 완전히 실패해도 저장은 진행(기존 로직 유지)
        }
      }

      // 프로필 업데이트 (+태그)
      updateProfile({
        displayName: displayName.trim(),
        chatName: displayName.trim(),
        useHashInChat: Boolean(useHash),
        bio: bio.trim(),
        customStatus: customStatus.trim(),
        // 퍼시스트 용량 보호: http/https만 스토어에 저장, dataURL은 런타임에서만 유지
        avatar: /^https?:\/\//i.test(String(finalAvatarUri||'')) ? finalAvatarUri : (avatar || undefined),
        tags,
      });
      if (finalAvatarUri) {
        try { setAvatarInStore(finalAvatarUri); } catch {}
        setAvatar(finalAvatarUri);
        // 갤러리에 확실히 기록되도록 저장을 대기
        try { await addToGallery(finalAvatarUri!, 'image'); } catch {}
        try { await AsyncStorage.setItem('chat.profile.lastAvatar', finalAvatarUri!); } catch {}
      }
      setPendingAvatar(undefined);

      // 상태 업데이트
      setStatus(selectedStatus);
      setCustomStatus(customStatus.trim());

      // 마지막 활동 시간 업데이트
      const { setLastActive } = useChatProfileStore.getState();
      setLastActive(Date.now());

      // 저장 후 친구목록으로 이동 (즉시 트리거)
      setTimeout(() => { try { router.replace('/chat/friends'); } catch {} }, 120);
    } catch (error) {
      console.error('Profile save error:', error);
      Alert.alert('오류', '프로필 저장에 실패했습니다.');
    } finally {
      // 혹시 백그라운드 작업이 남아도 UI는 빠르게 복귀
      setIsSaving(false);
    }
  };

  const handleDeleteMedia = async (uri: string) => {
    try {
      // SSOT 제거
      try { useMediaStore.getState().remove([mediaIdForUri(uri)]); } catch {}
      // 상태/스토리지 동기화: prev 기반으로 next 계산, 두 키 모두 저장
      let nextForStore: any[] = [];
      setGallery((prev) => {
        const next = prev.filter((x) => x.uri !== uri);
        nextForStore = next;
        (async () => {
          try { await AsyncStorage.setItem(galleryKey, JSON.stringify(next)); } catch {}
          try {
            const rawG = await AsyncStorage.getItem('chat.media.items');
            const listG: any[] = rawG ? JSON.parse(rawG) : [];
            const nextG = listG.filter((x:any) => x?.uri !== uri);
            await AsyncStorage.setItem('chat.media.items', JSON.stringify(nextG));
          } catch {}
        })();
        return next;
      });
      setMediaV3((prev) => prev.filter((x) => x !== uri));
    } catch {}
  };

  // 모든 사진 초기화(갤러리만, 다른 기능은 유지)
  const handleClearGallery = async () => {
    try {
      const empty: any[] = [];
      setGallery(empty);
      setMediaV3([]);
      setBroken(new Set());
      await AsyncStorage.setItem(galleryKey, JSON.stringify(empty));
      try { await AsyncStorage.setItem('chat.media.items', JSON.stringify(empty)); } catch {}
      try {
        // SSOT에서도 갤러리 위치 항목 제거(보물창고는 유지)
        const state = useMediaStore.getState();
        const toRemove = (state.byLocation.gallery||[]).slice();
        if (toRemove.length) state.remove(toRemove);
      } catch {}
    } catch {}
  };

  const statusOptions = [
    { value: 'online', label: '온라인', color: '#4CAF50', icon: '🟢' },
    { value: 'idle', label: '자리비움', color: '#FF9800', icon: '🟡' },
    { value: 'dnd', label: '방해금지', color: '#F44336', icon: '🔴' },
    { value: 'offline', label: '오프라인', color: '#9E9E9E', icon: '⚫' },
  ] as const;

  return (
    <>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.backButton}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{t('chatProfileSettings', language)}</ThemedText>
        {/* 상단바 우측 수정 버튼 제거 */}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setCanScroll(h > viewportH + 2)}
      >
        {/* 프로필 사진 */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar}>
            {pendingAvatar ? (
              <Image 
                source={{ uri: pendingAvatar }} 
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : avatar ? (
              <Image 
                source={{ uri: avatar }} 
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <ThemedText style={styles.avatarText}>👤</ThemedText>
              </View>
            )}
            <View style={styles.avatarEdit}>
              <ThemedText style={styles.avatarEditText}>{t('edit', language)}</ThemedText>
            </View>
          </TouchableOpacity>
        </View>

        {/* 채팅 대화명 */}
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('chatNickname', language)}</ThemedText>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('enterChatNickname', language)}
            placeholderTextColor="#666"
            maxLength={20}
          />
        <View style={{ flexDirection:'row', alignItems:'center', marginTop:8 }}>
          <TouchableOpacity onPress={()=>setUseHash(v=>!v)} style={{ borderWidth:1, borderColor:'#2A2A2A', borderRadius:999, paddingHorizontal:12, paddingVertical:6, backgroundColor: useHash ? '#1f1f1f':'#111' }}>
            <ThemedText style={{ color:'#FFD700', fontWeight:'700' }}>{useHash?t('hashOn', language):t('hashOff', language)}</ThemedText>
          </TouchableOpacity>
          <ThemedText style={{ color:'#9BA1A6', marginLeft:8, fontSize:12 }}>Use hash in chat</ThemedText>
        </View>
        </View>

        {/* 상태 UI 제거: 상태메시지 + 마지막 접속만 표시 */}

        {/* 상태메시지 */}
        <View style={styles.inputGroup}>
          <ThemedText style={self ? styles.label : styles.label}>{t('userId', language)}</ThemedText>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <TextInput
              style={[styles.input, { flex:1 }]}
              value={username}
              onChangeText={setUsername}
              placeholder={t('enterUserId', language)}
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity disabled={usernameSaving} onPress={saveUsername} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#FFD700' }}>
              <ThemedText style={{ color:'#FFD700', fontWeight:'800' }}>{usernameSaving? t('processing', language) : t('save', language)}</ThemedText>
            </TouchableOpacity>
          </View>
          <ThemedText style={{ color:'#9BA1A6', fontSize:12, marginTop:4 }}>{t('userIdHint', language)}</ThemedText>
        </View>

        {/* 상태메시지 */}
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('statusMessage', language)}</ThemedText>
          <TextInput
            style={styles.input}
            value={customStatus}
            onChangeText={setCustomStatusText}
            placeholder={t('enterStatusMessage', language)}
            placeholderTextColor="#666"
            maxLength={50}
          />
        </View>

        {/* 마지막 접속 시간 */}
        {currentProfile?.lastActive ? (
          <View style={{ marginTop: -8, marginBottom: 12 }}>
            <ThemedText style={{ color: '#9BA1A6', fontSize: 12 }}>
              {t('lastSeen', language)}: {new Date(currentProfile.lastActive).toLocaleString(language==='ko'?'ko-KR':language==='ja'?'ja-JP':language==='zh'?'zh-CN':'en-US')}
            </ThemedText>
          </View>
        ) : null}

        {/* 자기소개 */}
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('bio', language)}</ThemedText>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder={(!bio || bio.trim().length===0) ? t('enterBio', language) : ''}
            placeholderTextColor="#666"
            multiline
            numberOfLines={3}
            maxLength={100}
          />
        </View>

        {/* 태그 */}
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('tags', language)}</ThemedText>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap: 6, marginBottom: 8 }}>
            {tags.map((t, idx) => (
              <TouchableOpacity key={`${t}-${idx}`} onPress={() => {}} style={{
                flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:2,
                borderRadius:12, borderWidth:1, borderColor:'#FFD700', backgroundColor:'transparent'
              }}>
                <ThemedText style={{ color:'#FFD700', marginRight:6, fontSize:11, lineHeight:12 }}>{t}</ThemedText>
                <TouchableOpacity onPress={() => setTags(tags.filter((x,i)=>i!==idx))}>
                  <ThemedText style={{ color:'#FFD700', fontSize:11, lineHeight:12 }}>✕</ThemedText>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={tagDraft}
            onChangeText={(v) => {
              // 쉼표 입력 시 토큰 확정
              if (v.includes(',')) {
                const parts = v.split(',');
                const last = parts.pop() || '';
                const newTags = parts.map(p=>p.trim()).filter(Boolean);
                if (newTags.length) setTags(prev => Array.from(new Set([...prev, ...newTags])));
                setTagDraft(last.trim());
              } else {
                setTagDraft(v);
              }
            }}
            onSubmitEditing={() => {
              const t = tagDraft.trim();
              if (t) setTags(prev => Array.from(new Set([...prev, t])));
              setTagDraft('');
            }}
            placeholder={t('tagsAddHint', language)}
            placeholderTextColor="#666"
          />
        </View>

        {/* 저장 버튼 */}
        <TouchableOpacity 
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={isSaving}
        >
          <LinearGradient
            colors={isSaving ? ['#666', '#555'] : ['#D4AF37', '#B9972C']}
            style={styles.saveButtonGradient}
          >
            <ThemedText style={styles.saveButtonText}>
              {isSaving ? t('saving', language) : t('save', language)}
            </ThemedText>
          </LinearGradient>
        </TouchableOpacity>

        {/* 개인 미디어 갤러리 */}
        {(() => { /* local helper to avoid name shadowing in map */ return null; })()}
        {/* alias for t inside tab map */}
        {/**/}
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.mediaTabsRow, { paddingHorizontal: 16 }]}> 
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          {(['image','video','file','link','qr','other'] as const).map((tab) => {
            const label = tab==='image'?t('photo', language):tab==='video'?t('video', language):tab==='file'?t('file', language):tab==='link'?t('link', language):tab==='qr'?t('qr', language):t('other', language);
            const count = (() => {
              try {
                if (tab==='image') return (gallery||[]).filter((g:any)=> String(g?.type||'')==='image' && g.uri).length;
                if (tab==='video') return (gallery||[]).filter((g:any)=> String(g?.type||'')==='video' && g.uri).length;
                if (tab==='file') return (gallery||[]).filter((g:any)=> String(g?.type||'')==='file' && g.uri).length;
                if (tab==='link') return (gallery||[]).filter((g:any)=> String(g?.type||'')==='link' && g.uri).length;
                if (tab==='qr') return (gallery||[]).filter((g:any)=> String(g?.type||'')==='qr' && g.uri).length;
                return (gallery||[]).filter((g:any)=> !['image','video','file','link','qr'].includes(String(g?.type||'')) && g.uri).length;
              } catch { return 0; }
            })();
            return (
            <TouchableOpacity key={tab} style={[styles.mediaTab, mediaTab===tab && styles.mediaTabActive]} onPress={() => setMediaTab(tab)}>
              <ThemedText style={[styles.mediaTabText, mediaTab===tab && styles.mediaTabTextActive]}>
                  {label} {count>0?`(${count})`:''}
              </ThemedText>
            </TouchableOpacity>
            );
          })}
          </View>
        </ScrollView>

        {mediaTab==='image' && (
          (gallery.filter((g:any)=>g.type==='image' && g.uri).length === 0) ? (
            <View style={styles.mediaEmpty}><ThemedText style={styles.mediaEmptyText}>{t('noPhotos', language)}</ThemedText></View>
          ) : (
        <View style={[styles.photoCard, { borderWidth: 0, paddingHorizontal: 0 }]}>
              <View style={[styles.gridWrap, { gap: 2 }]}> 
            {gallery.filter((g:any)=>g.type==='image' && g.uri).map((it:any, idx:number) => { const u = it.uri; const isPrivate = (gallery.find(g=>g.uri===u)?.public === false); const normalized = (()=>{ try { const url=new URL(String(u)); url.search=''; url.hash=''; return url.toString(); } catch { return String(u||''); } })(); const prettyName = (()=>{ const n=String(it?.name||'').trim(); const meta=nameMap[normalized]; if (meta) return meta; if (!n || ['image','photo','사진','file'].includes(n.toLowerCase())) return deriveName(String(u)); return n; })(); try { if (!nameMap[normalized] && (!it?.name || ['image','photo','사진','file'].includes(String(it?.name||'').toLowerCase()))) { ensureMediaName(String(u)); } } catch {} return (
              <View key={`${u}-${idx}`} style={[styles.gridItem, styles.gridItem4]}> 
                    <TouchableOpacity onLongPress={() => { setSelecting(true); toggleSelect(u); }} onPress={() => { if (selecting) { toggleSelect(u); } else { setPreviewUri(u); setPreviewOpen(true); setEditName(gallery.find(g=>g.uri===u)?.name||''); setEditProtect(!!gallery.find(g=>g.uri===u)?.protect); setEditPublic(!!gallery.find(g=>g.uri===u)?.public); } }} disabled={!u} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                  <EImage
                    source={{ uri: u }}
                    style={styles.gridImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                    onError={() => setBroken(prev => { const n = new Set(prev); n.add(u); return n; })}
                  />
                </TouchableOpacity>
                {/* 제목 (말줄임) */}
                <View style={{ position:'absolute', left:6, right:28, bottom:6 }}>
                  <ThemedText style={{ color:'#CFCFCF', fontSize:11 }} numberOfLines={1}>{prettyName}</ThemedText>
                </View>
                {/* 깨진 항목 배지 */}
                {broken.has(u) && (
                  <TouchableOpacity onPress={() => { setBroken(prev=>{ const n = new Set(prev); n.delete(u); return n; }); handleDeleteMedia(u); }} style={{ position:'absolute', left:4, bottom:4, backgroundColor:'rgba(255,0,0,0.55)', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                    <ThemedText style={{ color:'#FFF', fontSize:10, fontWeight:'700' }}>삭제</ThemedText>
                  </TouchableOpacity>
                )}
                {/* 비공개(열쇠) 배지: 삭제 배지 왼쪽에 정렬, 탭 시 공개 전환 */}
                {/* 비공개(열쇠) 배지: 항목이 비공개일 때만 표시. 탭 시 공개로 전환 */}
                {isPrivate && (
                    <TouchableOpacity onPress={async () => {
                    try {
                      const updated = gallery.map(g => g.uri===u ? { ...g, public: true } : g);
                      setGallery(updated);
                      await AsyncStorage.setItem(galleryKey, JSON.stringify(updated));
                      // 메타 업데이트
                      try {
                        const rawM = await AsyncStorage.getItem(metaKey);
                        const m = rawM ? JSON.parse(rawM) : {};
                        m[u] = { ...(m[u]||{}), public: true };
                        await AsyncStorage.setItem(metaKey, JSON.stringify(m));
                      } catch {}
                      // 보물창고 목록에서 제거
                      try {
                        const rawT = await AsyncStorage.getItem(treasureKey);
                        const listT: any[] = rawT ? JSON.parse(rawT) : [];
                        const nextT = (listT||[]).filter((x:any)=> String(x?.uri) !== String(u));
                        await AsyncStorage.setItem(treasureKey, JSON.stringify(nextT));
                      } catch {}
                      // SSOT에도 반영(공개 전환 시 갤러리로 되돌림)
                      try { useMediaStore.getState().restoreToGallery([mediaIdForUri(u)]); } catch {}
                    } catch {}
                  }} style={{ position:'absolute', right:26, top:4, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                    <ThemedText style={{ color:'#FFD700', fontSize:11 }}>🔒</ThemedText>
                  </TouchableOpacity>
                )}
                {/* 공개 상태에는 전환 아이콘을 표시하지 않음 (혼란 방지) */}
                {/* 삭제 배지 */}
                <TouchableOpacity style={styles.deleteBadge} onPress={() => handleDeleteMedia(u)}>
                  <ThemedText style={styles.deleteBadgeText}>✖</ThemedText>
                </TouchableOpacity>
                {selecting && (
                  <View style={{ position:'absolute', left:4, top:4, width:18, height:18, borderRadius:9, borderWidth:1, borderColor:'#FFD700', backgroundColor: selected.has(u)?'#FFD700':'transparent', alignItems:'center', justifyContent:'center' }}>
                    {selected.has(u) && <ThemedText style={{ color:'#111', fontSize:10 }}>✓</ThemedText>}
                  </View>
                )}
              </View>
            ); })}
          </View>
        </View>
          )
        )}

        {mediaTab==='video' && (() => {
          const vids = gallery.filter((g:any)=> g.type==='video' && g.uri);
          if (!vids.length) return (<View style={styles.mediaEmpty}><ThemedText style={styles.mediaEmptyText}>{t('noVideos', language)}</ThemedText></View>);
          return (
          <View style={[styles.photoCard, { borderWidth: 0, paddingHorizontal: 0 }]}>
              <View style={{ width:'100%', gap: 8 }}>
                {vids.map((it:any, idx:number)=> {
                  const isPrivate = (gallery.find(g=>g.uri===it.uri)?.public === false);
                  const normalized = (()=>{ try { const u=new URL(String(it.uri)); u.search=''; u.hash=''; return u.toString(); } catch { return String(it.uri||''); } })();
                  const prettyName = (()=>{
                    // 1) 사용자 로컬 메타/SSOT 우선 (업로드 시 원본명)
                    const userName = (userMetaMap?.[normalized]?.name) || (userMetaMap?.[String(it.uri)]?.name);
                    if (userName) return userName;
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-var-requires
                      const store = require('@/src/features/chat/store/media.store');
                      const id = store.mediaIdForUri(String(it.uri));
                      const st = store.useMediaStore.getState();
                      const fromStore = st.items?.[id]?.name;
                      if (fromStore) return String(fromStore);
                    } catch {}
                    // 2) 네트워크 메타(nameMap)는 보조 수단으로만 사용
                    const metaName = nameMap[normalized];
                    if (metaName) return metaName;
                    // 3) 현 항목의 name(없거나 무의미/UUID형이면 제외)
                    const n = String(it?.name||'').trim();
                    const looksUuidish = /^[0-9a-f]{8}-[0-9a-f-]{13,}\.[a-z0-9]+$/i.test(n) || /^\d{10,}[-_][0-9a-f-]{6,}.*\.[a-z0-9]+$/i.test(n);
                    if (n && !looksUuidish && !['file','video','image','동영상'].includes(n.toLowerCase())) return n;
                    // 4) URL에서 파일명 유추(부정확하면 이후 프리페치로 보완)
                    return deriveName(String(it.uri)) || '동영상';
                  })();
                  const title = prettyName;
                  // 이름 미확정이면 메타데이터에서 비동기 보강
                  try { if (!nameMap[String(it.uri)] && (!it?.name || ['file','video','image','동영상'].includes(String(it?.name||'').toLowerCase()))) { ensureMediaName(String(it.uri)); } } catch {}
                  return (
                    <View key={`${it.uri}-${idx}`} style={[styles.linkRow, { width:'100%' }]}> 
                      <TouchableOpacity onLongPress={() => { setSelecting(true); toggleSelect(it.uri); }} onPress={()=>{ if (selecting) { toggleSelect(it.uri); } else { setPreviewUri(String(it.uri)); setPreviewOpen(true); } }} style={{ flexDirection:'row', alignItems:'center', gap:10, width:'100%' }}>
                        <View style={{ width: 86, height: 86, borderRadius: 8, overflow: 'hidden', backgroundColor: '#111' }}>
                          {Platform.OS === 'web' ? (()=>{
                            try {
                              const u = new URL(String(it.uri));
                              const h = u.host.toLowerCase().replace(/^www\./,'');
                              if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) {
                                let id = '';
                                if (h === 'youtu.be') id = u.pathname.replace(/^\//,'');
                                if (h.endsWith('youtube.com')) {
                                  const p = u.pathname||'';
                                  if (p.startsWith('/shorts/')) id = (p.split('/')[2]||'');
                                  else if (p.startsWith('/watch')) id = (u.searchParams.get('v')||'');
                                }
                                const thumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
                                return thumb ? (<EImage source={{ uri: thumb }} style={styles.gridImage} contentFit={'cover'} cachePolicy={'memory-disk'} />) : (<View />);
                              }
                            } catch {}
                            const k = videoKey(String(it.uri));
                            const thumb = videoThumbs[k];
                            if (thumb) return (<EImage source={{ uri: thumb }} style={styles.gridImage} contentFit={'cover'} cachePolicy={'memory-disk'} />);
                            try { void ensureVideoThumb(String(it.uri)); } catch {}
                            return (<View style={{ width:'100%', height:'100%', backgroundColor:'#111' }} />);
                          })() : (
                            <ExpoVideo
                              source={{ uri: String(it.uri) }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode={ResizeMode.COVER}
                              isMuted
                              shouldPlay={false}
                              isLooping={false}
                              useNativeControls={false}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1, paddingRight: 28 }}>
                          <ThemedText style={{ color:'#F6F6F6', fontWeight:'800' }} numberOfLines={2}>{title}</ThemedText>
                        </View>
                  </TouchableOpacity>
                      {selecting && (
                        <View style={{ position:'absolute', left:8, top:8, width:18, height:18, borderRadius:9, borderWidth:1, borderColor:'#FFD700', backgroundColor: selected.has(it.uri)?'#FFD700':'transparent', alignItems:'center', justifyContent:'center' }}>
                          {selected.has(it.uri) && <ThemedText style={{ color:'#111', fontSize:10 }}>✓</ThemedText>}
                </View>
                      )}
                      {isPrivate && (
                        <TouchableOpacity onPress={async () => {
                          try {
                            try {
                              const rawT = await AsyncStorage.getItem(treasureKey);
                              const listT: any[] = rawT ? JSON.parse(rawT) : [];
                              const nextT = (listT||[]).filter((x:any)=> String(x?.uri) !== String(it.uri));
                              await AsyncStorage.setItem(treasureKey, JSON.stringify(nextT));
                            } catch {}
                            const updated = gallery.map(g => g.uri===it.uri ? { ...g, public: true } : g);
                            setGallery(updated);
                            await AsyncStorage.setItem(galleryKey, JSON.stringify(updated));
                            try { const rawM = await AsyncStorage.getItem(metaKey); const m = rawM ? JSON.parse(rawM) : {}; m[it.uri] = { ...(m[it.uri]||{}), public: true }; await AsyncStorage.setItem(metaKey, JSON.stringify(m)); } catch {}
                            try { useMediaStore.getState().restoreToGallery([mediaIdForUri(it.uri)]); } catch {}
                          } catch {}
                        }} style={{ position:'absolute', right:36, top:8, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                          <ThemedText style={{ color:'#FFD700', fontSize:11 }}>🔒</ThemedText>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={()=>handleDeleteMedia(it.uri)} style={[styles.deleteBadge,{ right:8, top:8, position:'absolute' }]}><ThemedText style={styles.deleteBadgeText}>✖</ThemedText></TouchableOpacity>
            </View>
                  );
                })}
          </View>
            </View>
          );
        })()}
        {mediaTab==='file' && (() => { const files = gallery.filter((g:any)=> g.type==='file' && g.uri); return files.length ? (
          <View style={[styles.photoCard, { borderWidth: 0, paddingHorizontal: 0 }]}>
            <View style={[styles.gridWrap, { gap: 6 }]}> 
              {files.map((it:any, idx:number)=> { 
                const isPrivate = (gallery.find(g=>g.uri===it.uri)?.public === false); 
                const effectiveUri = resolvedFileMap[String(it.uri)] || String(it.uri);
                const fileName = (()=>{ 
                  if (it?.name) return String(it.name);
                  try { const u = new URL(String(effectiveUri)); return decodeURIComponent((u.pathname.split('/').pop()||'').replace(/\+/g,' ')); } catch {}
                  try { const m = /([^\/\?#]+)(?:\?|#|$)/.exec(String(effectiveUri)||''); return decodeURIComponent((m?.[1]||'').replace(/\+/g,' ')); } catch {}
                  return '파일';
                })();
                const ext = String(fileName).split('.').pop()?.toLowerCase() || (()=>{ try { const u=new URL(String(effectiveUri)); return (u.pathname.split('.').pop()||'').toLowerCase(); } catch { return ''; } })();
                const label = (ext || 'file').toUpperCase();
                const color = /pdf/i.test(label) ? '%23E53935' : (/docx?/i.test(label) ? '%231E88E5' : (/xlsx?/i.test(label) ? '%232E7D32' : (/pptx?/i.test(label) ? '%23E67E22' : '%23FFD700')));
                const svg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23151515'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='${color}' font-size='36' font-weight='900'>${(label||'FILE').slice(0,6)}</text></svg>`;
                const thumb = svg;
                const isDataThumb = /^data:image\//i.test(String(thumb||''));
                return (
                <View key={`${it.uri}-${idx}`} style={[styles.gridItem, styles.gridItem4]}>
                  <TouchableOpacity onLongPress={() => { setSelecting(true); toggleSelect(it.uri); }} onPress={async ()=>{ if (selecting) { toggleSelect(it.uri); } else { try { let resolved = resolvedFileMap[String(it.uri)] || await resolveStorageUrl(String(it.uri)); if (!/^https?:\/\//i.test(String(resolved||'')) && it?.name) { const alt = (gallery||[]).find((g:any)=> g!==it && g.type==='file' && g.name===it.name && /^https?:\/\//i.test(String(g.uri))); if (alt) resolved = String(alt.uri); if (!/^https?:\/\//i.test(String(resolved||''))) { try { const store = require('@/src/features/chat/store/media.store'); const st = store.useMediaStore.getState(); const list = Object.values(st.items||{}) as any[]; const hit = list.filter((m:any)=> String(m?.name||'')===String(it.name||'') && /^https?:\/\//i.test(String(m?.uriHttp||''))).sort((a:any,b:any)=> (b.createdAt??0)-(a.createdAt??0))[0]; if (hit?.uriHttp) resolved = String(hit.uriHttp); } catch {} } } setPreviewUri(resolved || String(it.uri)); setPreviewOpen(true); if (resolved && /\.pdf(\?|$)/i.test(String(resolved))) { await ensurePdfThumb(String(resolved)); } } catch { setPreviewUri(String(it.uri)); setPreviewOpen(true); } } }} style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}>
                    <EImage source={{ uri: thumb }} style={styles.gridImage} contentFit="cover" />
                  </TouchableOpacity>
                  <View style={{ position:'absolute', left:6, right:28, bottom:6 }}>
                    <ThemedText style={{ color:'#CFCFCF', fontSize:11 }} numberOfLines={1}>{fileName}</ThemedText>
                  </View>
                  {isPrivate && (
                    <View style={{ position:'absolute', right:26, top:4, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                      <ThemedText style={{ color:'#FFD700', fontSize:11 }}>🔒</ThemedText>
                    </View>
                  )}
                  {selecting && (
                    <View style={{ position:'absolute', left:4, top:4, width:18, height:18, borderRadius:9, borderWidth:1, borderColor:'#FFD700', backgroundColor: selected.has(it.uri)?'#FFD700':'transparent', alignItems:'center', justifyContent:'center' }}>
                      {selected.has(it.uri) && <ThemedText style={{ color:'#111', fontSize:10 }}>✓</ThemedText>}
                    </View>
                  )}
                  <TouchableOpacity onPress={()=>handleDeleteMedia(it.uri)} style={styles.deleteBadge}><ThemedText style={styles.deleteBadgeText}>✖</ThemedText></TouchableOpacity>
                </View>
              )})}
            </View>
          </View>
        ) : (<View style={styles.mediaEmpty}><ThemedText style={styles.mediaEmptyText}>{t('noFiles', language)}</ThemedText></View>); })()}
        {mediaTab==='link' && (() => {
          // 링크 탭은 한 줄(가로 1개) 프리뷰 카드로 표시
          const normalize = (s:string) => { try { const u=new URL(String(s).replace(/^@/,'')); if (u.host.includes('youtu.be')) return u.toString(); u.hash=''; return u.toString(); } catch { return String(s||''); } };
          const rawLinks = gallery.filter((g:any) => String(g?.type||'') === 'link' && g.uri);
          const seen: Record<string, boolean> = {};
          const links = rawLinks.filter((g:any)=>{ const k=normalize(g.uri); if (seen[k]) return false; seen[k]=true; return true; });
          if (!links.length) return (
            <View style={styles.mediaEmpty}><ThemedText style={styles.mediaEmptyText}>{t('noLinks', language)}</ThemedText></View>
          );
          return (
            <View style={[styles.photoCard, { borderWidth: 0, paddingHorizontal: 0 }]}> 
              <View style={{ width:'100%', gap: 8 }}>
                {links.map((it:any, idx:number) => {
                  try {
                    const u = new URL(String(it.uri));
                    if (u.host.includes('maps.google.')) {
                      const q = u.searchParams.get('q') || u.searchParams.get('ll') || '';
                      const m = /(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/.exec(q||'');
                      const key = `map.addr:${q}`;
                      if (m && !(linkMetaRef.current as any)[key]) {
                        (async () => {
                          try {
                            const lat = parseFloat(m[1]);
                            const lng = parseFloat(m[2]);
                            let pretty = await reverseGeocodeAddress(lat, lng);
                            if (!isGoodAddress(pretty)) {
                              // 보정: 동/지번 누락 시 표시 문자열 구성 보강
                              const head = `대한민국`;
                              pretty = `${head} ${pretty}`.trim();
                            }
                            (linkMetaRef.current as any)[key] = { title: pretty };
                            setLinkMetaTick(v=>v+1);
                            try {
                              const raw = await AsyncStorage.getItem(addrCacheKey);
                              const obj = raw ? JSON.parse(raw) : {};
                              obj[key] = { title: pretty };
                              await AsyncStorage.setItem(addrCacheKey, JSON.stringify(obj));
                            } catch {}
                          } catch {}
                        })();
                      }
                    }
                  } catch {}
                  ensureLinkMeta(it.uri);
                  // 파일 링크(특히 Firebase Storage)의 원본 파일명 확보
                  try {
                    const key = (()=>{ try { const u=new URL(String(it.uri)); u.search=''; u.hash=''; return u.toString(); } catch { return String(it.uri||''); } })();
                    if (!nameMap[key]) { void ensureMediaName(String(it.uri)); }
                  } catch {}
                  const meta = linkMetaRef.current[it.uri] || {};
                  const host = (()=>{ try { return new URL(it.uri).host; } catch { return ''; } })();
                  // 지도: 역지오코딩 주소 우선, 아니면 메타 타이틀/파비콘
                  const isMap = /maps\.google\./i.test(host);
                  const urlObj = (()=>{ try { return new URL(it.uri); } catch { return null as any; } })();
                  const latlng = (() => { try { const q = urlObj?.searchParams?.get('q') || urlObj?.searchParams?.get('ll') || ''; const m = /(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/.exec(q); if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }; } catch {} return null; })();
                  const ytThumb = (()=>{ try { const u = new URL(it.uri); if (u.host.includes('youtube.com') || u.host.includes('youtu.be')) { let vid = ''; const shorts = /\/shorts\/([\w-]+)/.exec(u.pathname); if (shorts) vid = shorts[1]; const vq = new URLSearchParams(u.search).get('v'); if (!vid && vq) vid = vq; if (!vid && u.host.includes('youtu.be')) { const seg = u.pathname.replace(/^\//,''); if (seg) vid = seg; } if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`; } return ''; } catch { return ''; } })();
                  const thumb = (() => {
                    if (isMap && latlng) return mapThumbUrl(latlng.lat, latlng.lng);
                    if (meta?.image) return meta.image;
                    if (ytThumb) return ytThumb;
                    const favicon = (()=>{ try { const u=new URL(it.uri); if (u.hostname==='localhost' || u.hostname==='127.0.0.1') return ''; return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=128`; } catch { return ''; } })();
                    return favicon || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23111111"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23FFD700" font-size="28">LINK</text></svg>';
                  })();
                  const addrKey = (()=>{ try { const q = urlObj?.searchParams?.get('q') || urlObj?.searchParams?.get('ll') || ''; return `map.addr:${q}`; } catch { return ''; } })();
                  const addrCached = addrKey ? ((linkMetaRef.current as any)[addrKey]?.title || '') : '';
                  if (isMap && latlng && (!addrCached || !/\(.+\)/.test(addrCached))) {
                    // 캐시에 괄호(지번) 없는 경우 재해석하여 갱신 시도
                    (async () => { try { const pretty = await reverseGeocodeAddress(latlng.lat, latlng.lng); if (pretty && pretty !== addrCached) { (linkMetaRef.current as any)[addrKey] = { title: pretty }; setLinkMetaTick(v=>v+1); try { const raw = await AsyncStorage.getItem(addrCacheKey); const obj = raw ? JSON.parse(raw) : {}; obj[addrKey] = { title: pretty }; await AsyncStorage.setItem(addrCacheKey, JSON.stringify(obj)); } catch {} } } catch {} })();
                  }
                  const normKey = (()=>{ try { const u=new URL(String(it.uri)); u.search=''; u.hash=''; return u.toString(); } catch { return String(it.uri||''); } })();
                  const fileName = nameMap[normKey];
                  const titleRaw = (() => {
                    if (isMap && (addrCached || latlng)) { return addrCached || meta?.title || 'Google 지도'; }
                    if (fileName) return fileName; // 원본 파일 제목 우선
                    return (meta?.title && /\S/.test(meta.title)) ? meta.title : (it.name || host);
                  })();
                  const title = isMap ? formatCardTitle(titleRaw) : titleRaw;
                  const urlNorm = String(it.uri).replace(/^@/,'');
                  return (
                    <View key={`${it.uri}-${idx}`} style={[styles.linkRow, { width:'100%' }]}> 
                      <TouchableOpacity onLongPress={() => { setSelecting(true); toggleSelect(it.uri); }} onPress={() => { if (selecting) { toggleSelect(it.uri); } else { setPreviewOpen(false); setPreviewUri(null as any); setLinkViewer({ index: idx }); } }} style={{ flexDirection:'row', alignItems:'center', gap:10, width:'100%' }}>
                        <EImage source={{ uri: thumb }} style={{ width: 86, height: 86, borderRadius: 8, backgroundColor:'#111' }} contentFit="cover" cachePolicy="memory-disk" />
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ color:'#F6F6F6', fontWeight:'800' }} numberOfLines={2}>{title}</ThemedText>
                          <ThemedText style={{ color:'#9BA1A6', fontSize:11 }} numberOfLines={2}>{urlNorm}</ThemedText>
                        </View>
                    </TouchableOpacity>
                      {selecting && (
                        <View style={{ position:'absolute', left:8, top:8, width:18, height:18, borderRadius:9, borderWidth:1, borderColor:'#FFD700', backgroundColor: selected.has(it.uri)?'#FFD700':'transparent', alignItems:'center', justifyContent:'center' }}>
                          {selected.has(it.uri) && <ThemedText style={{ color:'#111', fontSize:10 }}>✓</ThemedText>}
                  </View>
                      )}
                      <TouchableOpacity onPress={()=>handleDeleteMedia(it.uri)} style={[styles.deleteBadge,{ right:8, top:8, position:'absolute' }]}><ThemedText style={styles.deleteBadgeText}>✖</ThemedText></TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}
      {(() => {
        if (!videoViewer) return null;
        const vidsRaw = gallery.filter((g:any)=> g.type==='video' && !!g.uri);
        if (!vidsRaw.length) return null;
        const idx = Math.max(0, Math.min(videoViewer.index, vidsRaw.length - 1));
        const cur = vidsRaw[idx];
        if (Platform.OS === 'web') {
          const fileTitle = (() => { try {
            const u = String(cur?.uri||'');
            const normalized = (()=>{ try { const U=new URL(u); U.search=''; U.hash=''; return U.toString(); } catch { return u; } })();
            // 1) 사용자 업로드 시점에 저장된 원본 파일명(userMetaMap 우선)
            const userName = (userMetaMap?.[normalized]?.name) || (userMetaMap?.[String(cur?.uri||'')]?.name);
            if (userName) return String(userName);
            // 2) Storage 메타데이터에서 가져온 이름(nameMap)
            const meta = nameMap[normalized];
            if (meta) return meta;
            // 3) 전역 미디어 스토어(SSOT)에 기록된 이름 시도
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const store = require('@/src/features/chat/store/media.store');
              const id = store.mediaIdForUri(String(u));
              const st = store.useMediaStore.getState();
              const fromStore = st.items?.[id]?.name;
              if (fromStore) return String(fromStore);
            } catch {}
            // 4) 항목 자체 name 값 사용(무의미 키워드는 제외)
            const nm = String(cur?.name||'').trim();
            const looksUuidish = /^[0-9a-f]{8}-[0-9a-f-]{13,}\.[a-z0-9]+$/i.test(nm) || /^\d{10,}[-_][0-9a-f-]{6,}.*\.[a-z0-9]+$/i.test(nm);
            if (!nm || looksUuidish || ['file','video','image','동영상'].includes(nm.toLowerCase())) {
              // 5) URL 에서 파일명 유추(최후 보조)
              return deriveName(u) || 'video';
            }
            return nm;
          } catch { return 'video'; } })();
          const hasPrev = idx > 0;
          const hasNext = idx < (vidsRaw.length - 1);
          return (
            <Suspense fallback={null}>
            <ChatViewer
              visible={true}
              url={String(cur.uri)}
              kind={(() => { try { const u=new URL(String(cur.uri)); const h=u.host.toLowerCase(); return (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) ? ('youtube' as any) : ('video' as any); } catch { return 'video' as any; } })()}
              title={fileTitle}
              onClose={() => setVideoViewer(null)}
              onOpen={() => { try { (require('react-native').Linking).openURL(String(cur.uri)); } catch {} }}
              onSave={() => { try { const a=document.createElement('a'); a.href=String(cur.uri); a.download=String(fileTitle||'video'); document.body.appendChild(a); a.click(); a.remove(); } catch {} }}
              onForward={() => { try { const store = require('@/src/features/chat/store/forward-modal.store'); setVideoViewer(null); setTimeout(()=>{ try { store.useForwardModalStore.getState().open({ imageUrl: String(cur.uri), name: String(fileTitle||'video') }); } catch {} }, 0); } catch {} }}
              onKeep={() => { try { addToGallery(String(cur.uri), 'video'); } catch {} }}
              onPrev={hasPrev ? (() => { try { setVideoViewer({ index: idx - 1 }); } catch {} }) : undefined}
              onNext={hasNext ? (() => { try { setVideoViewer({ index: idx + 1 }); } catch {} }) : undefined}
            />
            </Suspense>
          );
        }
        return (
          <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.95)', zIndex:9999 }}>
            {/* 상단 정보바 */}
            <View style={{ height: 52, paddingHorizontal:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                {avatar ? (<EImage source={{ uri: avatar }} style={{ width:24, height:24, borderRadius:12 }} />) : (<View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />)}
                <View>
                  <ThemedText style={{ color:'#FFF', fontWeight:'800', fontSize:14 }}>{(() => { try { const p=(useChatProfileStore as any).getState().profiles||{}; const uid=(firebaseAuth.currentUser?.uid||'me'); const prof=p[uid]||{}; return prof.chatName||prof.displayName||'me'; } catch { return 'me'; } })()}</ThemedText>
                  <ThemedText style={{ color:'#BBB', fontSize:10 }}>{new Date().toLocaleString('ko-KR')}</ThemedText>
                </View>
              </View>
              <TouchableOpacity onPress={() => setVideoViewer(null)}><ThemedText style={{ color:'#FFF', fontSize:18, fontWeight:'800' }}>✕</ThemedText></TouchableOpacity>
            </View>
            {/* 본문: 동영상 */}
            <View style={{ position:'absolute', left:0, right:0, top:52, bottom:64, alignItems:'center', justifyContent:'center' }} onLayout={(e:any)=>{ try { const { width, height } = e.nativeEvent.layout; setViewerBox({ w: width, h: height }); } catch {} }}>
              {(Platform as any).OS === 'web' ? (()=>{
                try {
                  const u = new URL(String(cur.uri));
                  const h = u.host.toLowerCase().replace(/^www\./,'');
                  if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) {
                    let id = '';
                    if (h === 'youtu.be') id = u.pathname.replace(/^\//,'');
                    if (h.endsWith('youtube.com')) {
                      const p = u.pathname||'';
                      if (p.startsWith('/shorts/')) id = (p.split('/')[2]||'');
                      else if (p.startsWith('/watch')) id = (u.searchParams.get('v')||'');
                    }
                    const base = id ? `https://www.youtube.com/embed/${id}` : String(cur.uri);
                    const sep = base.includes('?') ? '&' : '?';
                    const embed = `${base}${sep}autoplay=1&mute=0&playsinline=1`;
                    return (<iframe title={'yt'} src={embed} style={{ width:'96%', height:'100%', border:'none' }} allow='autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share' allowFullScreen />);
                  }
                } catch {}
                return (<video src={String(cur.uri)} style={{ width: '96%', height: 'auto', maxHeight: '100%', objectFit: 'contain' }} autoPlay playsInline controls preload="metadata" />);
              })() : (
                <ExpoVideo
                  source={{ uri: String(cur.uri) }}
                  style={{ width: '96%', height: '100%' }}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  useNativeControls
                />
              )}
            </View>
            {/* 좌/우 이동 */}
            {(() => {
              const scope = vidsRaw;
              return (
                <>
                  {idx>0 && (
                    <TouchableOpacity onPress={() => setVideoViewer({ index: idx - 1 })} style={{ position:'absolute', left:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }] }}>
                      <ThemedText style={{ color:'#222', fontSize:26, fontWeight:'800' }}>{'‹'}</ThemedText>
                    </TouchableOpacity>
                  )}
                  {idx<scope.length-1 && (
                    <TouchableOpacity onPress={() => setVideoViewer({ index: idx + 1 })} style={{ position:'absolute', right:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }] }}>
                      <ThemedText style={{ color:'#222', fontSize:26, fontWeight:'800' }}>{'›'}</ThemedText>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
            {/* 하단 액션바 */}
            <View style={{ position:'absolute', left:0, right:0, bottom:0, height:64, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.08)', flexDirection:'row', alignItems:'center', justifyContent:'space-around' }}>
              <TouchableOpacity onPress={() => { try { if (Platform.OS==='web') { const a=document.createElement('a'); a.href=String(cur.uri); a.download='video'; document.body.appendChild(a); a.click(); a.remove(); } } catch {} }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>저장</ThemedText></TouchableOpacity>
              <TouchableOpacity onPress={() => { void copyToClipboard(String(cur.uri)); }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>복사</ThemedText></TouchableOpacity>
              <TouchableOpacity onPress={() => { try { (navigator as any).share?.({ url: String(cur.uri) }); } catch {} }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>전달</ThemedText></TouchableOpacity>
              <TouchableOpacity onPress={async () => { try { await handleDeleteMedia(String(cur.uri)); } catch {} setVideoViewer(null); }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>삭제</ThemedText></TouchableOpacity>
              </View>
            </View>
        );
        })()}

        {mediaTab==='qr' && (() => {
          const qrs = gallery.filter((g:any)=> g.type==='qr' && g.uri);
          if (!qrs.length) return (<View style={styles.mediaEmpty}><ThemedText style={styles.mediaEmptyText}>{t('noQr', language)}</ThemedText></View>);
          return (
            <View style={[styles.photoCard, { borderWidth: 0, paddingHorizontal: 0 }]}> 
              <View style={[styles.gridWrap, { gap: 6 }]}> 
                {qrs.map((it:any, idx:number)=> (
                  <View key={`${it.uri}-${idx}`} style={[styles.gridItem, styles.gridItem4]}>
                    <TouchableOpacity onPress={()=>{ setPreviewUri(it.uri); setPreviewOpen(true); }} style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}>
                      <EImage source={{ uri: it.uri }} style={styles.gridImage} contentFit="cover" cachePolicy="memory-disk" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>handleDeleteMedia(it.uri)} style={styles.deleteBadge}><ThemedText style={styles.deleteBadgeText}>✖</ThemedText></TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {mediaTab==='other' && (() => { const others = gallery.filter((g:any)=> !['image','video','file','link','qr'].includes(String(g?.type||'')) && g.uri); return others.length ? (
          <View style={[styles.photoCard, { borderWidth: 0, paddingHorizontal: 0 }]}> 
            <View style={[styles.gridWrap, { gap: 6 }]}> 
              {others.map((it:any, idx:number)=> (
                <View key={`${it.uri}-${idx}`} style={[styles.gridItem, styles.gridItem4]}>
                  <TouchableOpacity onLongPress={() => { setSelecting(true); toggleSelect(it.uri); }} onPress={()=>{ if (selecting) { toggleSelect(it.uri); } else { setPreviewUri(it.uri); setPreviewOpen(true); } }} style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}>
                    <View style={styles.nonImageBox}><ThemedText style={{ color:'#D4AF37' }}>기타</ThemedText></View>
                  </TouchableOpacity>
                  {selecting && (
                    <View style={{ position:'absolute', left:4, top:4, width:18, height:18, borderRadius:9, borderWidth:1, borderColor:'#FFD700', backgroundColor: selected.has(it.uri)?'#FFD700':'transparent', alignItems:'center', justifyContent:'center' }}>
                      {selected.has(it.uri) && <ThemedText style={{ color:'#111', fontSize:10 }}>✓</ThemedText>}
                    </View>
                  )}
                  <TouchableOpacity onPress={()=>handleDeleteMedia(it.uri)} style={styles.deleteBadge}><ThemedText style={styles.deleteBadgeText}>✖</ThemedText></TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ) : (<View style={styles.mediaEmpty}><ThemedText style={styles.mediaEmptyText}>{t('noOther', language)}</ThemedText></View>); })()}

        {/* 상단 이동 + 다중 선택 작업 바 */}
        {SHOW_GALLERY && selecting && (
          <View style={styles.toTopWrap}>
            <TouchableOpacity style={styles.toTopBtn} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
              <ThemedText style={styles.toTopText}>▲</ThemedText>
            </TouchableOpacity>
          </View>
        )}
        {/* '사진 초기화' 버튼 제거 */}
        {SHOW_GALLERY && selecting && (
          <FixedBottomBar>
            <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={async () => {
              const toDelete = Array.from(selected).filter(u => !gallery.find(g=>g.uri===u)?.protect);
              for (const u of toDelete) { await handleDeleteMedia(u); }
              setSelected(new Set()); setSelecting(false);
            }}>
              <ThemedText style={styles.bulkBtnText}>삭제</ThemedText>
            </TouchableOpacity>
            {(() => {
              const selUris = Array.from(selected);
              const allPrivate = selUris.length>0 && selUris.every(u => gallery.find(g=>g.uri===u)?.public === false);
              const allPublic = selUris.length>0 && selUris.every(u => gallery.find(g=>g.uri===u)?.public !== false);
              const mixed = selUris.length>0 && !allPrivate && !allPublic;

              const makePublic = async () => {
                try {
                  // treasure에서 제거
                try {
                  const rawT = await AsyncStorage.getItem(treasureKey);
                  const listT: any[] = rawT ? JSON.parse(rawT) : [];
                    const nextT = (listT||[]).filter((x:any)=> !selUris.includes(String(x?.uri)));
                  await AsyncStorage.setItem(treasureKey, JSON.stringify(nextT));
                } catch {}
                  // gallery에 public:true 반영
                  const updated = gallery.map(it => selUris.includes(it.uri) ? { ...it, public: true } : it);
                setGallery(updated);
                setMediaV3(updated.filter(x=>x.type==='image').map(x=>x.uri));
                await AsyncStorage.setItem(galleryKey, JSON.stringify(updated));
                  // 메타 업데이트
                  try { const rawM = await AsyncStorage.getItem(metaKey); const m = rawM ? JSON.parse(rawM) : {}; selUris.forEach(u=>{ m[u] = { ...(m[u]||{}), public: true }; }); await AsyncStorage.setItem(metaKey, JSON.stringify(m)); } catch {}
                  // SSOT 복구
                  try { useMediaStore.getState().restoreToGallery(selUris.map(u=>mediaIdForUri(u))); } catch {}
                } catch {}
                setSelected(new Set()); setSelecting(false);
                try { await reloadGallery(); } catch {}
              };

              const makePrivate = async () => {
                try {
                  // treasure에 추가
                  try {
                    const rawT = await AsyncStorage.getItem(treasureKey);
                    const listT: any[] = rawT ? JSON.parse(rawT) : [];
                    const exists = new Set(listT.map((x:any)=>x?.uri));
                    const entries = gallery.filter(it => selUris.includes(it.uri)).map(it => { const looksFileByName = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|tar|gz|json|xml|psd|ai|svg|apk|ipa)$/i.test(String(it.name||'')); const typ = it.type || (looksFileByName ? 'file' : detectType(it.uri)); return { uri: it.uri, type: typ, public: false, name: it.name || deriveName(it.uri), protect: !!it.protect, createdAt: Date.now() }; });
                    const nextT = [...entries.filter(e=>!exists.has(String(e.uri))), ...listT];
                    await AsyncStorage.setItem(treasureKey, JSON.stringify(nextT));
                } catch {}
                  // gallery에 public:false 반영
                  const updated = gallery.map(it => selUris.includes(it.uri) ? { ...it, public: false } : it);
                  setGallery(updated);
                  setMediaV3(updated.filter(x=>x.type==='image').map(x=>x.uri));
                  await AsyncStorage.setItem(galleryKey, JSON.stringify(updated));
                  // 메타 업데이트
                  try { const rawM = await AsyncStorage.getItem(metaKey); const m = rawM ? JSON.parse(rawM) : {}; selUris.forEach(u=>{ m[u] = { ...(m[u]||{}), public: false }; }); await AsyncStorage.setItem(metaKey, JSON.stringify(m)); } catch {}
              // SSOT 이동 + 구독자(프로필 화면 포함)에게 즉시 반영
              try { useMediaStore.getState().moveToTreasure(selUris.map(u=>mediaIdForUri(u))); } catch {}
              } catch {}
              setSelected(new Set()); setSelecting(false);
              try { await reloadGallery(); } catch {}
              };

              if (allPrivate) {
                return (
                  <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={makePublic}>
                    <ThemedText style={styles.bulkBtnText}>공개</ThemedText>
                  </TouchableOpacity>
                );
              }
              if (allPublic) {
                return (
                  <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={makePrivate}>
              <ThemedText style={styles.bulkBtnText}>비공개</ThemedText>
            </TouchableOpacity>
                );
              }
              // 혼합 선택 시 두 버튼 모두 제공
              return (
                <>
                  <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={makePublic}>
                    <ThemedText style={styles.bulkBtnText}>공개</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={makePrivate}>
                    <ThemedText style={styles.bulkBtnText}>비공개</ThemedText>
                  </TouchableOpacity>
                </>
              );
            })()}
            <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={async () => {
              try {
                const arr = Array.from(selected);
                if ((navigator as any).share) {
                  (navigator as any).share({ url: arr[0] });
                } else {
                  Alert.alert('공유', '이 디바이스에서는 시스템 공유를 지원하지 않습니다.');
                }
              } catch {}
            }}>
              <ThemedText style={styles.bulkBtnText}>보내기</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkBtn, styles.chipBtn]} onPress={() => { setSelected(new Set()); setSelecting(false); }}>
              <ThemedText style={styles.bulkBtnText}>취소</ThemedText>
            </TouchableOpacity>
          </FixedBottomBar>
        )}
      </ScrollView>
      {(() => {
        const normalize = (s:string) => { try { const u=new URL(String(s).replace(/^@/,'')); if (u.host.includes('youtu.be')) return u.toString(); u.hash=''; return u.toString(); } catch { return String(s||''); } };
        const linksRaw = gallery.filter((g:any) => String(g?.type||'') === 'link' && !!g.uri);
        const seen: Record<string, boolean> = {};
        const links = linksRaw.filter((g:any)=>{ const k=normalize(g.uri); if (seen[k]) return false; seen[k]=true; return true; });
        if (!linkViewer) return null;
        const idx = Math.max(0, Math.min(linkViewer.index, links.length-1));
        const cur = links[idx];
        if (Platform.OS === 'web') {
          const url = String(cur?.uri||'').replace(/^@/, '').trim();
          const isYouTube = (()=>{ try { const u=new URL(url); const h=u.host.toLowerCase(); return /(^|\.)youtube\.com$/.test(h)||/(^|\.)youtu\.be$/.test(h); } catch { return false; } })();
          const isPdf = /\.pdf(\?|$)/i.test(url);
          const isMap = (()=>{ try { const u=new URL(url); const h=u.host.toLowerCase(); return (
              /^maps\.google\./i.test(h) /* maps.google.com / maps.google.co.kr 등 */
              || (/google\./i.test(h) && u.pathname.startsWith('/maps')) /* google.com/maps, google.co.kr/maps */
              || /maps\.app\.goo\.gl$/i.test(h) /* Google Maps 앱 단축 링크 */
              || (/goo\.gl$/i.test(h) && /\/maps\//i.test(u.pathname)) /* 구 단축링크 */
              || (/maps\.googleapis\.com$/i.test(h) && /\/staticmap$/i.test(u.pathname)) /* Static Maps */
              || /staticmap\.openstreetmap\.de$/i.test(h)
            );
          } catch { return false; } })();
          const hasPrev = idx > 0;
          const hasNext = idx < (links.length - 1);
          return (
            <Suspense fallback={null}>
            <ChatViewer
              visible={true}
              url={url}
              kind={(isPdf ? 'pdf' : (isYouTube ? 'youtube' : (isMap ? 'map' : 'web'))) as any}
              title={(() => { try { const u=new URL(url); if (isMap) return '지도'; if (isYouTube) return 'YouTube'; return (u.host||'').toLowerCase(); } catch { return isMap?'지도':(isYouTube?'YouTube':'링크'); } })()}
              onClose={() => setLinkViewer(null)}
              onOpen={() => { try { (require('react-native').Linking).openURL(String(url)); } catch {} }}
              onForward={() => { try { const store = require('@/src/features/chat/store/forward-modal.store'); setLinkViewer(null); setTimeout(()=>{ try { store.useForwardModalStore.getState().open({ imageUrl: String(url), name: 'link' }); } catch {} }, 0); } catch {} }}
              onKeep={() => { try {
                const raw = String(url);
                let kind: 'video'|'link' = 'link';
                try {
                  const u = new URL(raw);
                  const host = u.host.toLowerCase();
                  const pathLower = u.pathname.toLowerCase();
                  if (/(^|\.)youtube\.com$/.test(host) || /(^|\.)youtu\.be$/.test(host)) kind = 'video';
                  else if (/\.(mp4|mov|m4v|webm|mkv|avi)(?:$|\?)/i.test(pathLower)) kind = 'video';
                } catch {
                  const base = raw.split('?')[0].toLowerCase();
                  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/.test(base)) kind = 'video';
                }
                addToGallery(raw, kind);
              } catch {} }}
              onPrev={hasPrev ? (() => { try { setLinkViewer({ index: idx - 1 }); } catch {} }) : undefined}
              onNext={hasNext ? (() => { try { setLinkViewer({ index: idx + 1 }); } catch {} }) : undefined}
            />
            </Suspense>
          );
        }
        let startY = 0;
        const onMove = (dy:number) => {
          if (Math.abs(dy) < 60) return;
          const next = dy < 0 ? idx + 1 : idx - 1;
          if (next >= 0 && next < links.length) setLinkViewer({ index: next });
        };
        return (
          <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.92)' }}
            onTouchStart={(e:any)=>{ startY = e.nativeEvent.pageY; }}
            onTouchEnd={(e:any)=>{ const dy = e.nativeEvent.pageY - startY; onMove(dy); }}
          >
            {/* 상단 헤더 (사진 팝업 스타일) */}
            <View style={{ position:'absolute', left:0, right:0, top:0, height:54, paddingHorizontal:12, paddingTop:10, backgroundColor:'rgba(0,0,0,0.9)', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                {(() => { try { const profiles = (useChatProfileStore as any).getState().profiles || {}; const uid = String(cur?.by||''); const av = profiles[uid]?.avatar || ''; return av ? (<EImage source={{ uri: av }} style={{ width:24, height:24, borderRadius:12 }} />) : (<View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />); } catch { return (<View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />); } })()}
                <View>
                  <ThemedText style={{ color:'#FFF', fontWeight:'800' }}>{(() => { try { const profiles = (useChatProfileStore as any).getState().profiles || {}; const uid = String(cur?.by||''); const p = profiles[uid] || {}; return p.chatName || p.displayName || uid || '보낸 사람'; } catch { return '보낸 사람'; } })()}</ThemedText>
                  <ThemedText style={{ color:'#DDD', fontSize:11 }}>{cur?.createdAt ? new Date(cur.createdAt).toLocaleString('ko-KR') : ''}</ThemedText>
                </View>
              </View>
              <TouchableOpacity onPress={() => setLinkViewer(null)}>
                <ThemedText style={{ color:'#FFF', fontSize:22, fontWeight:'900' }}>✕</ThemedText>
              </TouchableOpacity>
            </View>
            {/* 본문 미리보기 + 좌우 넘기기 */}
            <View
              style={{ position:'absolute', left:0, right:0, top:54, bottom:72, alignItems:'center', justifyContent:'center', overflow:'hidden' }}
              onLayout={(e:any)=>{ try { const { width, height } = e.nativeEvent.layout; setViewerBox({ w: width, h: height }); } catch {} }}
            >
              {(() => {
                const url = String(cur?.uri||'').replace(/^@/, '').trim();
                const isImg = /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(url);
                if (isImg) {
                  // 디바이스 가로폭 기준으로 자동 축소(세로 초과 시 세로 기준으로 재조정)
                  const iw = Math.max(1, viewerImgSize?.w || 1);
                  const ih = Math.max(1, viewerImgSize?.h || 1);
                  const boxW = Math.max(1, viewerBox.w || 1);
                  const boxH = Math.max(1, viewerBox.h || 1);
                  const scale = Math.min(boxW / iw, boxH / ih);
                  const w = Math.floor(iw * scale);
                  const h = Math.floor(ih * scale);
                  return (
                    <View style={{ width: w, height: h }}>
                      <EImage source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                    </View>
                  );
                }
                // 링크(웹): 웹에서는 우선 임베드(iframe)로 미리보기 (YouTube는 embed로 자동 변환, autoplay)
                if ((Platform as any).OS === 'web') {
                  const toEmbed = (raw: string) => {
                    try {
                      const normalized = String(raw).replace(/^@/, '').trim();
                      const u = new URL(normalized);
                      const host = u.host;
                      // YouTube
                      if (host.includes('youtube.com') || host.includes('youtu.be')) {
                        // shorts or watch
                        let vid = '';
                        const shorts = /\/shorts\/([\w-]+)/.exec(u.pathname);
                        if (shorts) vid = shorts[1];
                        const vq = new URLSearchParams(u.search).get('v');
                        if (!vid && vq) vid = vq;
                        // youtu.be short link: pathname is /<id>
                        if (!vid && host.includes('youtu.be')) {
                          const seg = u.pathname.replace(/^\//, '');
                          if (seg) vid = seg;
                        }
                        if (vid) return `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&playsinline=1&rel=0`;
                      }
                      // Google Maps: embed로 변환 (좌표 있으면 embed/v1/view 우선, 없으면 output=embed)
                      if (/maps\.google\./i.test(host)) {
                        const q = u.searchParams.get('q') || '';
                        const ll = u.searchParams.get('ll') || '';
                        let lat: string | undefined; let lng: string | undefined;
                        const qIsLatLng = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(q);
                        if (qIsLatLng) { const [a,b] = q.split(','); lat=a; lng=b; }
                        if (!lat || !lng) { const llOk = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(ll); if (llOk) { const [a,b] = ll.split(','); lat=a; lng=b; } }
                        const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || (process as any)?.GOOGLE_MAPS_API_KEY || '';
                        if (lat && lng && key) return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(String(key))}&center=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&zoom=16&maptype=roadmap`;
                        const place = q || ll || u.pathname.replace(/^\//,'');
                        if (place) return `https://www.google.com/maps?hl=ko&output=embed&q=${encodeURIComponent(place)}`;
                        return `https://www.google.com/maps?hl=ko&output=embed`;
                      }
                      // Google Maps shorteners
                      if (/maps\.app\.goo\.gl$/i.test(host) || (/goo\.gl$/i.test(host) && /\/maps/i.test(u.pathname))) {
                        return `https://www.google.com/maps?output=embed&q=${encodeURIComponent(normalized)}`;
                      }
                      return raw;
                    } catch { return raw; }
                  };
                  const src = toEmbed(url);
                  // 상단 도구: 복사/열기/길찾기(지도일 때)
                  const isMap = /maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(String(url));
                  const copyUrl = async () => { try { if (Platform.OS==='web') await (navigator as any).clipboard.writeText(String(url)); } catch {} };
                  const openUrl = () => { try {
                    if (isMap) {
                      const u0 = new URL(String(url).replace(/^@/,'').trim());
                      const q = u0.searchParams.get('q') || u0.searchParams.get('query') || '';
                      const ll = u0.searchParams.get('ll') || '';
                      const dest = q || ll || '';
                      const out = dest ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}` : String(url);
                      (window as any).open(out, '_blank');
                      return;
                    }
                    (window as any).open(String(url), '_blank');
                  } catch {} };
                  const directionsUrl = (() => {
                    try {
                      if (!isMap) return '';
                      const u = new URL(String(url).replace(/^@/,'').trim());
                      const q = u.searchParams.get('q') || u.searchParams.get('query') || '';
                      const ll = u.searchParams.get('ll') || '';
                      const dest = q || ll;
                      if (!dest) return '';
                      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
                    } catch { return ''; }
                  })();
                  return (
                    <View style={{ width: viewerBox.w || '100%', height: viewerBox.h || '100%', overflow:'hidden' }}>
                      {/* 상단 링크 도구 */}
                      <View style={{ position:'absolute', left:8, right:8, top:8, zIndex:2, flexDirection:'row', gap:8, justifyContent:'flex-end' }}>
                        <TouchableOpacity onPress={copyUrl} style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:8, backgroundColor:'rgba(0,0,0,0.55)', borderWidth:1, borderColor:'#444' }}><ThemedText style={{ color:'#FFF', fontSize:12 }}>복사</ThemedText></TouchableOpacity>
                        <TouchableOpacity onPress={openUrl} style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:8, backgroundColor:'rgba(0,0,0,0.55)', borderWidth:1, borderColor:'#444' }}><ThemedText style={{ color:'#FFF', fontSize:12 }}>열기</ThemedText></TouchableOpacity>
                        {!!directionsUrl && (
                          <TouchableOpacity onPress={() => { try { (window as any).open(directionsUrl, '_blank'); } catch {} }} style={{ paddingHorizontal:10, paddingVertical:4, borderRadius:8, backgroundColor:'rgba(0,0,0,0.55)', borderWidth:1, borderColor:'#444' }}><ThemedText style={{ color:'#FFF', fontSize:12 }}>길찾기</ThemedText></TouchableOpacity>
                        )}
                      </View>
                      <iframe title={cur?.name||'link'} src={src} referrerPolicy="no-referrer-when-downgrade" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen scrolling="yes" style={{ width:'100%', height:'100%', border:'none', backgroundColor:'#111' } as any} />
                    </View>
                  );
                }
                // 네이티브 등: 썸네일이 있으면 보여주고 탭 시 브라우저 오픈
                const thumb = (() => { try { return linkMetaRef.current[url]?.image || undefined; } catch { return undefined; } })();
                if (thumb) {
                  return (
                    <TouchableOpacity activeOpacity={0.92} onPress={() => { try { (require('react-native').Linking).openURL(url); } catch {} }} style={{ width: viewerBox.w || '100%', height: viewerBox.h || '100%' }}>
                      <EImage source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity onPress={() => { try { (require('react-native').Linking).openURL(url); } catch {} }}>
                    <ThemedText style={{ color:'#FFF' }}>앱 브라우저에서 열기</ThemedText>
                  </TouchableOpacity>
                );
              })()}
            </View>
            {/* 좌우 버튼: 현재 탭 기준으로 이동 */}
            {(() => { 
              const normalize = (s:string) => { try { const u=new URL(String(s).replace(/^@/,'')); if (u.host.includes('youtu.be')) return u.toString(); u.hash=''; return u.toString(); } catch { return String(s||''); } };
              const raw = gallery.filter((g:any)=> String(g?.type||'')==='link' && !!g.uri);
              const seen: Record<string, boolean> = {};
              const links = raw.filter((g:any)=>{ const k=normalize(g.uri); if (seen[k]) return false; seen[k]=true; return true; });
              const scope = links;
              const curUri = String(cur?.uri||'');
              const idx = Math.max(0, Math.min(scope.findIndex((it:any)=> normalize(String(it?.uri||''))===normalize(curUri)), scope.length-1));
              return (
              <>
                {idx>0 && (
                  <TouchableOpacity onPress={() => setLinkViewer({ index: idx-1 })} style={{ position:'absolute', left:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }] }}>
                    <ThemedText style={{ color:'#222', fontSize:26, fontWeight:'800' }}>{'‹'}</ThemedText>
                  </TouchableOpacity>
                )}
                {idx<scope.length-1 && (
                  <TouchableOpacity onPress={() => setLinkViewer({ index: idx+1 })} style={{ position:'absolute', right:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }] }}>
                    <ThemedText style={{ color:'#222', fontSize:26, fontWeight:'800' }}>{'›'}</ThemedText>
                  </TouchableOpacity>
                )}
              </>
            ); })()}
            {/* 하단 액션 바 (링크) */}
            <View style={{ position:'absolute', left:12, right:12, bottom:12, backgroundColor:'rgba(0,0,0,0.75)', borderRadius:12, paddingVertical:10, paddingHorizontal:14 }}>
              <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-around' }}>
                {/* 저장 비활성화: 다운로드/복사/보관으로 분리 */}
                <View style={{ opacity: 0.35 }}><ThemedText style={{ color:'#FFF' }}>저장</ThemedText></View>
                <TouchableOpacity onPress={() => { void copyToClipboard(String(cur?.uri)); }}><ThemedText style={{ color:'#FFF' }}>복사</ThemedText></TouchableOpacity>
                <TouchableOpacity onPress={() => { try { (navigator as any).share?.({ url: String(cur?.uri) }); } catch {} }}><ThemedText style={{ color:'#FFF' }}>전달</ThemedText></TouchableOpacity>
                <TouchableOpacity onPress={async () => { try { await handleDeleteMedia(String(cur?.uri)); } catch {} setLinkViewer(null); }}><ThemedText style={{ color:'#FFF' }}>삭제</ThemedText></TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })()}
      {/* 이미지 미리보기 모달 (네이티브 전용) */}
          {SHOW_GALLERY && previewOpen && Platform.OS !== 'web' && (
        <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.95)', zIndex:9999 }}>
          {/* 상단 정보바: 프로필+대화명(갤러리는 본인), 시간 */}
          <View style={{ height: 52, paddingHorizontal:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              {avatar ? (<EImage source={{ uri: avatar }} style={{ width:24, height:24, borderRadius:12 }} />) : (<View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />)}
              <View>
                <ThemedText style={{ color:'#FFF', fontWeight:'800', fontSize:14 }}>{(() => { try { const p=(useChatProfileStore as any).getState().profiles||{}; const uid=(firebaseAuth.currentUser?.uid||'me'); const prof=p[uid]||{}; return prof.chatName||prof.displayName||'me'; } catch { return 'me'; } })()}</ThemedText>
                <ThemedText style={{ color:'#BBB', fontSize:10 }}>{new Date().toLocaleString('ko-KR')}</ThemedText>
              </View>
            </View>
            <TouchableOpacity onPress={() => setPreviewOpen(false)}><ThemedText style={{ color:'#FFF', fontSize:18, fontWeight:'800' }}>✕</ThemedText></TouchableOpacity>
          </View>
          {/* 이미지 영역: 처음은 화면 폭 기준으로 보여주고, 탭 시 확대(컨테인) */}
          <View style={{ position:'absolute', left:0, right:0, top:52, bottom:64, alignItems:'center', justifyContent:'center' }}>
            {previewUri && (
              <TouchableOpacity activeOpacity={0.95} onPress={() => { try { const img = document.querySelector('#ps-img') as HTMLImageElement | null; if (img) { const isContain = img.style.objectFit === 'contain'; img.style.objectFit = isContain ? 'cover' : 'contain'; } } catch {} }} style={{ width:'96%', height:'100%' }}>
                {(Platform as any).OS === 'web' && mediaTab === 'qr' ? (
                  <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#000' }}>
                    <img id={'ps-img' as any} src={String(previewUri)} alt={'qr'} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', display:'block' }} />
                  </div>
                ) : (
                  <EImage source={{ uri: previewUri }} style={{ width:'100%', height:'100%' }} contentFit={mediaTab==='qr' ? 'contain' : 'cover'} id={'ps-img' as any} />
                )}
              </TouchableOpacity>
            )}
          </View>
          {/* 좌/우 이동 (현재 탭 기준) */}
          {(() => { const normalize=(s:string)=>{ try{ const u=new URL(String(s)); u.search=''; u.hash=''; return u.toString(); }catch{ return String(s||''); } }; const scope = (mediaTab==='image') ? gallery.filter((g:any)=> g.type==='image' && g.uri) : (mediaTab==='video') ? gallery.filter((g:any)=> g.type==='video' && g.uri) : (mediaTab==='file') ? gallery.filter((g:any)=> g.type==='file' && g.uri) : (mediaTab==='qr') ? gallery.filter((g:any)=> g.type==='qr' && g.uri) : (mediaTab==='other') ? gallery.filter((g:any)=> !['image','video','file','link','qr'].includes(String(g?.type||'')) && g.uri) : gallery.filter((g:any)=> g.type==='image' && g.uri); const idx = Math.max(0, scope.findIndex((g:any)=> normalize(g.uri)===normalize(String(previewUri)))); const goTo = (target:any) => { if (!target) return; setPreviewUri(target.uri); setPreviewOpen(true); }; return (
            <>
              {idx>0 && (
                <TouchableOpacity onPress={() => goTo(scope[idx-1])} style={{ position:'absolute', left:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }] }}>
                  <ThemedText style={{ color:'#222', fontSize:26, fontWeight:'800' }}>{'‹'}</ThemedText>
                </TouchableOpacity>
              )}
              {idx<scope.length-1 && (
                <TouchableOpacity onPress={() => goTo(scope[idx+1])} style={{ position:'absolute', right:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }] }}>
                  <ThemedText style={{ color:'#222', fontSize:26, fontWeight:'800' }}>{'›'}</ThemedText>
                </TouchableOpacity>
              )}
            </>
          ); })()}
          {/* 하단 액션바 */}
          <View style={{ position:'absolute', left:0, right:0, bottom:0, height:64, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.08)', flexDirection:'row', alignItems:'center', justifyContent:'space-around' }}>
            {(() => {
              try {
                const u = new URL(String(previewUri||''));
                const host = (u.host||'').toLowerCase();
                const center = u.searchParams.get('center') || '';
                const m = /(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/.exec(center||'');
                const isStaticMap = /maps\.googleapis\.com$/.test(host) && u.pathname.includes('/staticmap') || /staticmap\.openstreetmap\.de$/.test(host);
                if (isStaticMap && m) {
                  const openUrl = `https://maps.google.com/?q=${m[1]},${m[2]}`;
                  return (
                    <TouchableOpacity onPress={() => { try { (window as any).open(openUrl, '_blank'); } catch {} }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>지도 열기</ThemedText></TouchableOpacity>
                  );
                }
              } catch {}
              return (
                <TouchableOpacity onPress={() => { try { if (previewUri) { const a=document.createElement('a'); a.href=previewUri; a.download='image'; document.body.appendChild(a); a.click(); a.remove(); } } catch {} }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>저장</ThemedText></TouchableOpacity>
              );
            })()}
            <TouchableOpacity onPress={async ()=>{ try { if (Platform.OS==='web' && previewUri) { const anyWin:any=window as any; const ClipboardItemCtor = anyWin.ClipboardItem; const r = await fetch(previewUri); const b = await r.blob(); await (navigator as any).clipboard.write([new ClipboardItemCtor({ 'image/png': b })]); } } catch {} }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>복사</ThemedText></TouchableOpacity>
            <TouchableOpacity onPress={()=>{ try{ (navigator as any).share?.({ url: previewUri }); } catch{} }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>전달</ThemedText></TouchableOpacity>
            <TouchableOpacity onPress={()=>{ try{ if (previewUri) handleDeleteMedia(previewUri); } catch{} setPreviewOpen(false); }}><ThemedText style={{ color:'#FFF', fontWeight:'800' }}>삭제</ThemedText></TouchableOpacity>
          </View>
        </View>
      )}
      {/* 공통 뷰어 적용 (웹) */}
      {SHOW_GALLERY && previewOpen && Platform.OS === 'web' && previewUri ? (() => {
        const normalize=(s:string)=>{ try{ const u=new URL(String(s)); u.search=''; u.hash=''; return u.toString(); } catch { return String(s||''); } };
        const matchItem = (()=>{ try { const want=normalize(String(previewUri)); return (gallery||[]).find((g:any)=> normalize(String(g.uri))===want) || null; } catch { return null; } })();
        const orig = String(matchItem?.uri || previewUri || '');
        const curType = String(matchItem?.type || mediaDetectType(String(orig)));
        const curName = String(matchItem?.name || '미디어');
        // 범위/인덱스 계산 (현재 탭 내)
        const scope = ((): any[] => {
          const g = (gallery||[]);
          if (mediaTab==='image') return g.filter((v:any)=> v.type==='image' && v.uri);
          if (mediaTab==='video') return g.filter((v:any)=> v.type==='video' && v.uri);
          if (mediaTab==='file') return g.filter((v:any)=> v.type==='file' && v.uri);
          if (mediaTab==='link') return g.filter((v:any)=> v.type==='link' && v.uri);
          if (mediaTab==='qr') return g.filter((v:any)=> v.type==='qr' && v.uri);
          return g.filter((v:any)=> !['image','video','file','link','qr'].includes(String(v?.type||'')) && v.uri);
        })();
        const idx = Math.max(0, Math.min(scope.findIndex((it:any)=> normalize(String(it.uri))===normalize(String(previewUri))), scope.length-1));
        const prevItem = scope[idx-1];
        const nextItem = scope[idx+1];
        return (
          <Suspense fallback={null}>
          <ChatViewer
            visible={true}
            url={String(resolvedPreviewUri || previewUri)}
            kind={((): any => {
              try {
                const s = String(resolvedPreviewUri || previewUri);
                if (/maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(s)) return 'map';
                if (/maps\.googleapis\.com\/maps\/api\/staticmap/i.test(s)) return 'map';
                // YouTube는 전용 임베드 사용
                try { const u = new URL(s); const h=u.host.toLowerCase().replace(/^www\./,''); if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) return 'youtube'; } catch {}
                const t = mediaDetectType(s);
                if (t === 'qr') return 'image';
                if (t === 'image') return 'image';
                if (t === 'video') return 'video';
                if (t === 'file') { try { const u = new URL(s); const ext=(u.pathname.split('.').pop()||'').toLowerCase(); if (ext==='pdf') return 'pdf'; } catch {} return 'web'; }
                return 'web';
              } catch { return 'web'; }
            })()}
            
            title={(() => { try {
              const normalize2=(s:string)=>{ try{ const u=new URL(String(s)); u.search=''; u.hash=''; return u.pathname.split('/').pop()||'미디어'; } catch { return (String(s||'').split('/').pop()||'미디어'); } };
              const sNow = String(resolvedPreviewUri || previewUri || '');
              const tNow = String(matchItem?.type || mediaDetectType(sNow));
              if (tNow === 'video') {
                const key = (()=>{ try { const u=new URL(sNow); u.search=''; u.hash=''; return u.toString(); } catch { return sNow; } })();
                // 1) 사용자 로컬 메타/SSOT 우선
                const userName = (userMetaMap?.[key]?.name) || (userMetaMap?.[String(matchItem?.uri||'')]?.name);
                if (userName) return userName;
                try {
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  const store = require('@/src/features/chat/store/media.store');
                  const id = store.mediaIdForUri(String(matchItem?.uri||sNow));
                  const st = store.useMediaStore.getState();
                  const fromStore = st.items?.[id]?.name;
                  if (fromStore) return String(fromStore);
                } catch {}
                // 2) 네트워크 메타(nameMap)는 보조
                const metaName = (nameMap as any)?.[key];
                if (metaName) return metaName;
                // 3) 항목 자체의 name
                const nm = String(matchItem?.name||'').trim();
                if (!nm || ['file','video','image','동영상'].includes(nm.toLowerCase())) return deriveName(sNow) || 'video';
                return nm;
              }
              if (tNow === 'link') { try { const u = new URL(sNow); return u.host; } catch { return normalize2(sNow); } }
              if (String(matchItem?.name||'').trim()) return String(matchItem?.name);
              return normalize2(sNow);
            } catch { return '미디어'; } })()}
            headerAvatarUrl={(() => { try { const store = require('@/src/features/chat/store/media.store'); const id = store.mediaIdForUri(String(previewUri)); const item = store.useMediaStore.getState().items?.[id]; const by = item?.by; if (!by) return undefined; const profs = (useChatProfileStore as any).getState().profiles || {}; return profs[by]?.avatar || undefined; } catch { return undefined; } })()}
            headerTs={(() => { try { const norm=(x:string)=>{ try{ const u=new URL(String(x)); u.search=''; u.hash=''; return u.toString(); } catch { return String(x||''); } }; const want=norm(String(previewUri)); const m=(gallery||[]).find((g:any)=> norm(String(g.uri))===want); if (m?.createdAt) return Number(m.createdAt); const store = require('@/src/features/chat/store/media.store'); const id = store.mediaIdForUri(String(previewUri)); const item = store.useMediaStore.getState().items?.[id]; return item?.createdAt ? Number(item.createdAt) : undefined; } catch { return undefined; } })()}
            headerLocked={(() => { try { const norm=(x:string)=>{ try{ const u=new URL(String(x)); u.search=''; u.hash=''; return u.toString(); } catch { return String(x||''); } }; const want=norm(String(previewUri)); const m=(gallery||[]).find((g:any)=> norm(String(g.uri))===want); return m?.public === false; } catch { return false; } })()}
            onClose={() => setPreviewOpen(false)}
            onOpen={() => { try {
              const s = String(resolvedPreviewUri || previewUri);
              const buildOpen = (raw: string) => { try { const u = new URL(raw); let lat: string | undefined; let lng: string | undefined; let q: string | undefined; try { const m = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/i); if (m) { lat=m[1]; lng=m[2]; } } catch {} if (!(lat&&lng)) { try { const v=u.searchParams.get('ll'); if (v && /-?\d+\.?\d*,-?\d+\.?\d*/.test(v)) { const [a,b]=v.split(','); lat=a; lng=b; } } catch {} } if (!(lat&&lng)) { try { const v=u.searchParams.get('q'); if (v) { q=v; if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(v)) { const [a,b]=v.split(','); lat=a; lng=b; } } } catch {} } if (!(lat&&lng)) { try { const v=u.searchParams.get('center'); if (v && /-?\d+\.?\d*,-?\d+\.?\d*/.test(v)) { const [a,b]=v.split(','); lat=a; lng=b; } } catch {} } if (!(lat&&lng)) { try { const v=u.searchParams.get('markers'); if (v && /-?\d+\.?\d*,-?\d+\.?\d*/.test(v)) { const [a,b]=(v.split('|')[0]||'').split(','); lat=a; lng=b; } } catch {} } const base = 'https://www.google.com/maps'; if (lat && lng) return `${base}/search/?api=1&query=${encodeURIComponent(lat+','+lng)}`; if (q) return `${base}/search/?api=1&query=${encodeURIComponent(q)}`; return `${base}/search/?api=1&query=${encodeURIComponent(raw)}`; } catch { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`; } };
              const isMap = /maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.googleapis\.com\/maps\/api\/staticmap/i.test(s);
              const urlOpen = isMap ? buildOpen(s) : s; (require('react-native').Linking).openURL(urlOpen);
            } catch {} }}
            onSave={async () => { try { const href = await resolveStorageUrl(orig); const a=document.createElement('a'); a.href=href; a.download=curName||'media'; document.body.appendChild(a); a.click(); a.remove(); } catch {} }}
            onCopy={async () => { try { if (curType==='image') { const anyWin:any=window as any; const ClipboardItemCtor = anyWin.ClipboardItem; const href = await resolveStorageUrl(orig); const r = await fetch(href); const b = await r.blob(); await (navigator as any).clipboard.write([new ClipboardItemCtor({ [b.type||'image/png']: b })]); } else { await (navigator as any)?.clipboard?.writeText?.(String(orig)); } } catch {} }}
            onForward={async () => { try { const href = await resolveStorageUrl(orig); const store = require('@/src/features/chat/store/forward-modal.store'); setPreviewOpen(false); setTimeout(()=>{ try { store.useForwardModalStore.getState().open({ imageUrl: String(href||orig), name: curName||'media' }); } catch {} }, 0); } catch {} }}
            onKeep={() => { try { addToGallery(String(orig), curType as any); } catch {} }}
            onPrev={prevItem ? (() => { try { setPreviewUri(String(prevItem.uri)); } catch {} }) : undefined}
            onNext={nextItem ? (() => { try { setPreviewUri(String(nextItem.uri)); } catch {} }) : undefined}
          />
          </Suspense>
        );
      })() : null}
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  backButton: {
    fontSize: 24,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F6F6F6',
  },
  headerEdit: {
    fontSize: 14,
    color: '#D4AF37',
    fontWeight: '700',
  },
  // 링크 탭
  linkRow: { flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#2A2A2A', backgroundColor:'#121212', borderRadius:10, paddingHorizontal:10, paddingVertical:8 },
  linkFavicon: { width: 24, height: 24, marginRight: 10, borderRadius: 4, backgroundColor:'#000' },
  linkUrl: { color:'#EEE', fontSize:13, lineHeight:16 },
  linkMeta: { color:'#9BA1A6', fontSize:11, marginTop:2 },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  avatarText: {
    fontSize: 32,
  },
  avatarEdit: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#D4AF37',
    borderRadius: 12,
  },
  badgePending: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#D4AF37',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    color: '#0C0C0C',
    fontWeight: '700',
  },
  avatarEditText: {
    fontSize: 12,
    color: '#0C0C0C',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F6F6F6',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#1A1A1A',
    color: '#F6F6F6',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  activeStatusOption: {
    borderColor: '#D4AF37',
    backgroundColor: '#2A2A2A',
  },
  statusIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#B8B8B8',
  },
  activeStatusText: {
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  saveButton: {
    marginBottom: 32,
  },
  saveButtonGradient: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C0C0C',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  galleryHeader: { marginTop: 0 },
  galleryControlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  controlGroup: { },
  groupLabel: { color: '#9BA1A6', fontSize: 12, marginBottom: 4 },
  segmentRow: { flexDirection: 'row', gap: 6 },
  sortBtn: { borderWidth: 1, borderColor: '#444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  sortBtnActive: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.12)' },
  sortBtnText: { color: '#9BA1A6', fontSize: 12 },
  sortBtnTextActive: { color: '#D4AF37', fontWeight: '700' },
  selectBtn: { borderWidth: 1, borderColor: '#444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  selectBtnActive: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.12)' },
  selectBtnText: { color: '#9BA1A6', fontSize: 12 },
  selectBtnTextActive: { color: '#D4AF37', fontWeight: '700' },
  bulkDeleteBtn: { borderWidth: 1, borderColor: '#D4AF37', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bulkDeleteText: { color: '#D4AF37', fontWeight: '700' },
  photoCard: { borderWidth: 1, borderColor: '#D4AF37', borderRadius: 12, padding: 10, marginTop: 8 },
  photoCardTitle: { color: '#F6F6F6', fontWeight: '700', marginBottom: 8 },
  galleryWrap: { },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' },
  gridItem: { position: 'relative', borderRadius: 8, overflow: 'hidden' },
  gridItem2: { width: '50%', aspectRatio: 1 },
  gridItem3: { width: '33.333%', aspectRatio: 1 },
  gridItem4: { width: '24.5%', aspectRatio: 1 },
  galleryItem: { },
  galleryItemSelected: {
    borderColor: '#D4AF37',
  },
  galleryImage: { width: '100%', height: '100%' },
  gridImage: { width: '100%', height: '100%' },
  nonImageBox: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  nonImageIcon: { fontSize: 22, color: '#D4AF37' },
  mediaTabsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  mediaTab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#141414' },
  mediaTabActive: { borderColor: '#FFD700', backgroundColor: '#2A2A2A' },
  mediaTabText: { color: '#B8B8B8', fontSize: 12 },
  mediaTabTextActive: { color: '#FFD700', fontWeight: '700' },
  mediaEmpty: { paddingVertical: 24, alignItems: 'center' },
  mediaEmptyText: { color: '#777' },
  deleteBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
    zIndex: 10,
  },
  deleteBadgeText: { color: '#FFD700', fontSize: 10, fontWeight: '700' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  previewBox: { width: '90%', height: '80%' },
  previewImage: { width: '100%', height: '100%' },
  // 상단 이동 버튼
  toTopWrap: { position: 'absolute', bottom: 8, right: 12 },
  toTopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  toTopText: { color: '#0C0C0C', fontSize: 14, fontWeight: '900' },
  bulkBar: {
    position: 'absolute', left: 12, right: 12, bottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: '#333',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
  },
  bulkBarFixed: {
    position: 'fixed', left: 12, right: 12, bottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1, borderColor: '#333',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
    zIndex: 2147483647,
  },
  bulkBtn: {
    flex: 1, marginHorizontal: 4,
    height: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  chipBtn: {
    borderRadius: 14, borderWidth: 1, borderColor: '#FFD700',
    backgroundColor: 'transparent', paddingHorizontal: 14,
  },
  bulkBtnText: { color: '#FFD700', fontWeight: '700', fontSize: 12 },
  // 갤러리 프라이버시 토글 스타일
  privacyPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#141414' },
  privacyPillActive: { borderColor: '#FFD700', backgroundColor: '#2A2A2A' },
  privacyPillText: { color: '#B8B8B8', fontSize: 12 },
  privacyPillTextActive: { color: '#FFD700', fontWeight: '700' },
});
