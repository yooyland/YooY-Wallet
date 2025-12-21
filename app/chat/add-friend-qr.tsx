import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { formatPhoneForLocale } from '@/lib/phone';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, findNodeHandle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
// html2canvas (web-only) 선언
declare var html2canvas: any;
// QRCode encoder (web fallback)
const QRCodeLib: any = (() => { try { return require('qrcode'); } catch { return null; } })();
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { firestore, firebaseAuth, ensureAuthedUid } from '@/lib/firebase';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

type TabKind = 'card' | 'scan';

export default function AddFriendQRScreen() {
  const { language } = usePreferences();
  const params = useLocalSearchParams<{ from?: string; roomId?: string }>();
  const from = String(params?.from || '');
  const targetRoomId = String(params?.roomId || '');
  const [tab, setTab] = React.useState<TabKind>('card');
  // 내 명함 필드
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [memo, setMemo] = React.useState('');
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<string>('');
  const [localQrData, setLocalQrData] = React.useState<string | null>(null);
  const qrCardRef = React.useRef<View | null>(null);
  const [saveInfo, setSaveInfo] = React.useState<boolean>(false);
  const [saveToast, setSaveToast] = React.useState<string | null>(null);

  // 스캔 결과
  const [scanImageUrl, setScanImageUrl] = React.useState<string | null>(null);
  const [scanText, setScanText] = React.useState<string>('');
  const [scanError, setScanError] = React.useState<string>('');
  const [savedCards, setSavedCards] = React.useState<any[]>([]);
  const [savedSort, setSavedSort] = React.useState<'timeDesc'|'timeAsc'|'nameAsc'|'nameDesc'>('timeDesc');
  const [showSavedSortMenu, setShowSavedSortMenu] = React.useState(false);
  const roomsStore = useKakaoRoomsStore();
  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);
  const qrDomRef = React.useRef<View | null>(null);
  const scanScrollRef = React.useRef<ScrollView | null>(null);
  const sentOnceRef = React.useRef(false);
  // jsQR 동적 로드 (웹)
  let jsQRLib: any = null as any;
  const ensureJsQRLoaded = React.useCallback(async () => {
    try {
      if (jsQRLib) return;
      // 우선 require 시도(번들 가능 시 즉시 사용)
      try { jsQRLib = require('jsqr'); if (jsQRLib) return; } catch {}
      if (typeof window === 'undefined') return;
      if ((window as any).jsQR) { jsQRLib = (window as any).jsQR; return; }
      await new Promise<void>((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/jsqr/dist/jsQR.js';
        s.async = true;
        s.onload = () => { try { jsQRLib = (window as any).jsQR; } catch {} finally { resolve(); } };
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    } catch {}
  }, []);

  // ZXing 폴백(웹)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ZXingLib: any = React.useMemo(() => { try { return require('@zxing/browser'); } catch { try { return require('@zxing/library'); } catch { return null; } } }, []);

  // 통합 스캔 파이프라인
  const scanImageWithAll = React.useCallback(async (uri: string): Promise<string | null> => {
    try {
      // 1) ZXing 우선 시도
      try {
        const ReaderCtor = ZXingLib?.BrowserQRCodeReader || ZXingLib?.BrowserMultiFormatReader;
        if (ReaderCtor) {
          const reader = new ReaderCtor();
          if (typeof reader.decodeFromImageUrl === 'function') {
            try {
              const res = await reader.decodeFromImageUrl(uri);
              if (res?.text) return String(res.text);
            } catch {}
          }
        }
      } catch {}

      // 2) (제거) Expo BarCodeScanner 사용 구간은 안전모드에서 제외

      // 3) jsQR 고급 시도
      try {
        await ensureJsQRLoaded();
        if (!jsQRLib || typeof document === 'undefined') return null;
        const loadImg = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
          try {
            const img = document.createElement('img');
            try { img.crossOrigin = 'anonymous'; } catch {}
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('img'));
            img.src = src;
          } catch (e) { reject(e as any); }
        });
        const img = await loadImg(uri);
        const create = (w:number,h:number)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
        const tryDecode = (cv: HTMLCanvasElement): string => { const ctx=cv.getContext('2d'); if(!ctx) return ''; const im=ctx.getImageData(0,0,cv.width,cv.height); const r=jsQRLib(im.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' }); return String(r?.data||''); };
        // 리사이즈 + 정사각 + 패딩 + 마스크 후보들
        const maxSide = 1200;
        const iw = (img.naturalWidth||img.width)||0, ih = (img.naturalHeight||img.height)||0;
        const scale = Math.min(1, maxSide/Math.max(iw, ih));
        const bw = Math.max(1, Math.round(iw*scale));
        const bh = Math.max(1, Math.round(ih*scale));
        const base = create(bw, bh); { const b=base.getContext('2d'); if(b){ b.imageSmoothingEnabled=false; b.drawImage(img,0,0,bw,bh);} }
        let hit = tryDecode(base); if (hit) return hit;
        const square = Math.min(bw, bh); const sx=Math.floor((bw-square)/2); const sy=Math.floor((bh-square)/2);
        const sq = create(square, square); { const c=sq.getContext('2d'); if(c){ c.imageSmoothingEnabled=false; c.drawImage(base, sx, sy, square, square, 0, 0, square, square);} }
        hit = tryDecode(sq); if (hit) return hit;
        const pad = 24; const padded = create(square+2*pad, square+2*pad); { const c=padded.getContext('2d'); if(c){ c.fillStyle='#fff'; c.fillRect(0,0,padded.width,padded.height); c.imageSmoothingEnabled=false; c.drawImage(sq, pad, pad);} }
        hit = tryDecode(padded); if (hit) return hit;
        for (const ratio of [0.16,0.18,0.22,0.26,0.30,0.34,0.38]){
          for (const color of ['#ffffff','#000000']){
            const m=create(padded.width, padded.height); const c=m.getContext('2d'); if(!c) continue; c.imageSmoothingEnabled=false; c.drawImage(padded,0,0); const cw=Math.floor(padded.width*ratio), ch=Math.floor(padded.height*ratio); const cx=Math.floor((padded.width-cw)/2), cy=Math.floor((padded.height-ch)/2); c.fillStyle=color; c.fillRect(cx,cy,cw,ch); hit = tryDecode(m); if (hit) return hit;
          }
        }
      } catch {}
    } catch {}
    return null;
  }, [ZXingLib, ensureJsQRLoaded]);

  const toDataUrl = React.useCallback(async (fileOrUrl: any): Promise<string> => {
    // 파일 -> data URL, http(s) -> fetch 후 data URL, data/blob은 그대로 사용
    if (!fileOrUrl) return '';
    try {
      if (typeof fileOrUrl === 'string') {
        const s = String(fileOrUrl);
        if (/^(data|blob):/i.test(s)) return s;
        if (/^https?:/i.test(s)) {
          const res = await fetch(s, { mode: 'cors' as any });
          const blob = await res.blob();
          const data = await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result||'')); fr.onerror = reject; fr.readAsDataURL(blob); });
          return data;
        }
        return s;
      }
      if (typeof File !== 'undefined' && fileOrUrl instanceof File) {
        return await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result||'')); fr.onerror = reject; fr.readAsDataURL(fileOrUrl); });
      }
    } catch {}
    return '';
  }, []);

  // 스캔 저장 목록 로드/저장
  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('qr.scan.saved');
        if (raw) setSavedCards(JSON.parse(raw));
      } catch {}
    })();
  }, []);
  const persistSaved = React.useCallback(async (list: any[]) => {
    try { await AsyncStorage.setItem('qr.scan.saved', JSON.stringify(list)); } catch {}
  }, []);

  const handleSaveCard = React.useCallback(async (card: any) => {
    try {
      const item = { id: `sc_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, card, image: scanImageUrl || null, savedAt: Date.now() };
      setSavedCards(prev => { const next = [item, ...prev]; void persistSaved(next); return next; });
      Alert.alert('보관', '보관 목록에 추가되었습니다.');
      // 보관 직후 목록이 화면에 보이도록 스크롤 이동
      try { setTimeout(() => { scanScrollRef.current?.scrollToEnd?.({ animated: true }); }, 150); } catch {}
    } catch {}
  }, [scanImageUrl, persistSaved]);
  const handleRemoveSaved = React.useCallback((id: string) => {
    setSavedCards(prev => { const next = prev.filter(x => x.id !== id); void persistSaved(next); return next; });
  }, [persistSaved]);

  const cycleSavedSort = React.useCallback(() => {
    setSavedSort((m) => (m === 'timeDesc' ? 'timeAsc' : m === 'timeAsc' ? 'nameAsc' : m === 'nameAsc' ? 'nameDesc' : 'timeDesc'));
  }, []);

  const sortedSavedCards = React.useMemo(() => {
    const arr = [...savedCards];
    try {
      if (savedSort === 'timeDesc') arr.sort((a, b) => (b.savedAt||0) - (a.savedAt||0));
      else if (savedSort === 'timeAsc') arr.sort((a, b) => (a.savedAt||0) - (b.savedAt||0));
      else if (savedSort === 'nameAsc') arr.sort((a, b) => String(a.card?.name||'').localeCompare(String(b.card?.name||''), 'ko'));
      else if (savedSort === 'nameDesc') arr.sort((a, b) => String(b.card?.name||'').localeCompare(String(a.card?.name||''), 'ko'));
    } catch {}
    return arr;
  }, [savedCards, savedSort]);

  const saveScanToMediaGallery = React.useCallback(async () => {
    try {
      let dataUri: string | null = null;
      if (Platform.OS === 'web') {
        if (scanImageUrl) {
          try {
            const res = await fetch(scanImageUrl);
            const blob = await res.blob();
            dataUri = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result||'')); fr.onerror = reject; fr.readAsDataURL(blob); });
          } catch {}
        }
      }
      // html2canvas 제거: RN에서는 ViewShot만 사용, 웹은 위 fetch 처리
      if (!dataUri) { Alert.alert('안내', '저장할 이미지가 없습니다.'); return; }
      const uid = firebaseAuth.currentUser?.uid || 'anonymous-user';
      const key = `u:${uid}:gallery.photos`;
      const raw = await AsyncStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const item = { id: `m_${Date.now()}`, uri: dataUri, name: '스캔', createdAt: Date.now(), public: true };
      arr.unshift(item);
      await AsyncStorage.setItem(key, JSON.stringify(arr));
      Alert.alert('저장됨', '미디어 갤러리에 저장되었습니다.');
    } catch {
      Alert.alert('오류', '미디어 갤러리 저장에 실패했습니다.');
    }
  }, [scanImageUrl]);

  // 로고를 DataURL로 사전 변환(저장 시 CORS 무관하게 사용)
  React.useEffect(() => {
    (async () => {
      try {
        const r = (Image as any).resolveAssetSource(require('@/assets/images/side_logo.png'));
        const uri = r?.uri || '';
        if (!uri) return;
        const res = await fetch(uri);
        const blob = await res.blob();
        const data: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result||'')); fr.onerror = reject; fr.readAsDataURL(blob); });
        setLogoDataUrl(data);
      } catch {}
    })();
  }, []);

  const ensureLogoDataUrl = React.useCallback(async (): Promise<string | null> => {
    try {
      if (logoDataUrl) return logoDataUrl;
      const r = (Image as any).resolveAssetSource(require('@/assets/images/side_logo.png'));
      const uri = r?.uri || '';
      if (!uri) return null;
      const res = await fetch(uri);
      const blob = await res.blob();
      const data: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result||'')); fr.onerror = reject; fr.readAsDataURL(blob); });
      setLogoDataUrl(data);
      return data;
    } catch { return null; }
  }, [logoDataUrl]);

  const buildCardPayload = React.useCallback(() => {
    const data = { type: 'card', name, phone, email, company, title, memo };
    try {
      const raw = JSON.stringify(data);
      // base64 우선, 미지원 환경에선 URL 인코딩으로 폴백
      const encoded = (typeof btoa === 'function')
        ? btoa(unescape(encodeURIComponent(raw)))
        : encodeURIComponent(raw);
      const key = (typeof btoa === 'function') ? 'd' : 'j';
      return `yooy://card?${key}=${encoded}`;
    } catch {
      return `yooy://card?j=${encodeURIComponent(JSON.stringify(data))}`;
    }
  }, [name, phone, email, company, title, memo]);

  // 유니코드 안전: 항상 URL-encoded JSON으로 생성
  const buildCardPayloadJson = React.useCallback(() => {
    const data = { type: 'card', name, phone, email, company, title, memo };
    return `yooy://card?j=${encodeURIComponent(JSON.stringify(data))}`;
  }, [name, phone, email, company, title, memo]);

  // 저장/로드
  React.useEffect(() => {
    (async () => {
      try {
        const keep = await AsyncStorage.getItem('qr.card.keep');
        setSaveInfo(keep === '1');
        const raw = await AsyncStorage.getItem('qr.card.info');
        if (raw) {
          const d = JSON.parse(raw);
          setName(d.name || ''); setPhone(d.phone || ''); setEmail(d.email || ''); setCompany(d.company || ''); setTitle(d.title || ''); setMemo(d.memo || '');
        }
      } catch {}
    })();
  }, []);

  const persistInfo = React.useCallback(async (force?: boolean) => {
    try {
      if (!saveInfo && !force) return;
      const data = { name, phone, email, company, title, memo };
      await AsyncStorage.setItem('qr.card.info', JSON.stringify(data));
      await AsyncStorage.setItem('qr.card.keep', saveInfo ? '1' : '0');
    } catch {}
  }, [saveInfo, name, phone, email, company, title, memo]);

  React.useEffect(() => { void persistInfo(); }, [name, phone, email, company, title, memo, saveInfo, persistInfo]);

  const handleGenerateCard = async () => {
    try {
      const p = buildCardPayloadJson();
      setPayload(p);
      if (Platform.OS === 'web') {
        const url = `https://chart.googleapis.com/chart?cht=qr&chs=480x480&chld=H|1&chl=${encodeURIComponent(p)}`;
        setQrUrl(url);
      } else {
        setQrUrl(null);
      }
      setLocalQrData(null);
    } catch {
      setQrUrl(null);
    }
  };

  const parseQrContent = (text: string) => {
    try {
      // 1) 카드 포맷(base64)
      if (/yooy:\/\/card\?d=/i.test(text)) {
        const m = text.match(/yooy:\/\/card\?d=([^&]+)/i);
        if (m && m[1]) {
          const json = decodeURIComponent(atob(m[1]));
          return { kind: 'card', data: JSON.parse(json) } as any;
        }
      }
      // 1-2) 카드 포맷(URL 인코딩 json)
      if (/yooy:\/\/card\?j=/i.test(text)) {
        const m = text.match(/yooy:\/\/card\?j=([^&]+)/i);
        if (m && m[1]) {
          const json = decodeURIComponent(m[1]);
          return { kind: 'card', data: JSON.parse(json) } as any;
        }
      }
      // 2) 방 초대
      if (/yooy:\/\/share\?room=/i.test(text)) {
        const url = new URL(text.replace('yooy://', 'https://yooy.land/'));
        const room = url.searchParams.get('room') || '';
        return { kind: 'invite', roomId: room } as any;
      }
      // 3) 웹 링크 형태의 방
      if (/\/chat\/room\//i.test(text)) {
        const id = text.split('/chat/room/')[1]?.split(/[?#]/)[0];
        if (id) return { kind: 'invite', roomId: id } as any;
      }
      return { kind: 'text', text } as any;
    } catch {
      return { kind: 'text', text } as any;
    }
  };

  const detectFromImage = async (fileOrUrl: any) => {
    setScanError('');
    try {
      if (Platform.OS === 'web') {
        const dataUrl = await toDataUrl(fileOrUrl);
        if (!dataUrl) throw new Error('이미지를 선택해주세요');
        setScanImageUrl(dataUrl);
        const decoded = await scanImageWithAll(dataUrl);
        if (decoded) { setScanText(decoded); return; }
        setScanError('이미지 인식 실패: 텍스트에 직접 붙여넣기 해주세요.');
      } else {
        // 네이티브: 갤러리에서 이미지 선택 후 jsQR로 디코딩
        try {
          const Picker = require('expo-image-picker');
          const pick = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8, base64: true } as any);
          if (pick.canceled || !pick.assets?.length) { return; }
          const a = pick.assets[0];
          const b64 = a.base64 || '';
          if (!b64) { setScanError('이미지를 선택해주세요.'); return; }
          // 디코딩 파이프라인
          let width = 0, height = 0, data: Uint8ClampedArray | null = null;
          try {
            const P = require('pngjs/browser');
            const PNG = P.PNG || P;
            const buf = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : Uint8Array.from(atob(b64), (c:any)=>c.charCodeAt(0));
            const parsed = PNG.sync.read(buf as any);
            width = parsed.width; height = parsed.height;
            data = new Uint8ClampedArray(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
          } catch {}
          if (!data) {
            try {
              const jpeg = require('jpeg-js');
              const buf = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : Uint8Array.from(atob(b64), (c:any)=>c.charCodeAt(0));
              const decoded = jpeg.decode(buf as any, { useTArray: true });
              width = decoded.width; height = decoded.height;
              data = new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
            } catch {}
          }
          if (data && width && height) {
            const jsQR = require('jsqr');
            const r = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
            if (r?.data) { setScanText(String(r.data)); return; }
          }
          setScanError('이미지 인식 실패');
        } catch {
          setScanError('스캔 실패');
        }
      }
    } catch (e: any) {
      setScanError(e?.message || '스캔 실패');
    }
  };

  const handleSaveGenerated = async () => {
    try {
      try { console.log('[QR] save clicked'); } catch {}
      setSaveToast('저장 중...');
      if (Platform.OS !== 'web') { Alert.alert('안내', '디바이스 저장은 추후 네이티브 모듈로 연결됩니다.'); return; }
      // 0) 먼저 화면 QR 컨테이너 영역을 DOM 캡처하여 저장(파란 테두리/로고 100% 반영)
      try {
        const el = document.getElementById('qr-card');
        if (el) {
          const canvas0 = await html2canvas(el as HTMLElement, { backgroundColor: '#FFFFFF', scale: 2, useCORS: true });
          const uri0 = canvas0.toDataURL('image/png');
          const a0 = document.createElement('a'); a0.href = uri0; a0.download = 'my-card-qr.png'; document.body.appendChild(a0); a0.click(); a0.remove();
          setSaveToast('이미지 저장됨'); setTimeout(() => setSaveToast(null), 2000);
          return;
        }
      } catch {}
      setSaveToast('이미지 저장됨'); setTimeout(() => setSaveToast(null), 2000);
    } catch {
      Alert.alert('오류', '이미지 저장에 실패했습니다.');
      setSaveToast('저장 실패'); setTimeout(() => setSaveToast(null), 2000);
    }
  };

  const handleCopyGenerated = async () => {
    try {
      let dataUri: string | null = null;
      if (qrCardRef.current) {
        try { dataUri = await captureRef(qrCardRef.current, { format: 'png', quality: 1, result: 'data-uri' }); } catch {}
      }
      // RN: 추가 폴백 제거
      if (!dataUri) throw new Error('no-data');
      // 이미지로 복사 시도 (지원 브라우저)
      const supportImageClipboard = typeof (window as any).ClipboardItem !== 'undefined' && (navigator as any).clipboard?.write;
      if (supportImageClipboard) {
        const res = await fetch(dataUri);
        const blob = await res.blob();
        const item = new (window as any).ClipboardItem({ 'image/png': blob });
        await (navigator as any).clipboard.write([item]);
        Alert.alert('복사됨', '이미지를 클립보드에 복사했습니다. 붙여넣기 해보세요.');
        return;
      }
      // 텍스트로 복사 대체
      try { await (navigator as any).clipboard?.writeText?.(dataUri); Alert.alert('복사됨', '이미지 링크를 복사했습니다.'); } catch { Alert.alert('안내', '이 브라우저는 이미지 복사를 지원하지 않습니다.'); }
    } catch {
      Alert.alert('오류', '복사에 실패했습니다.');
    }
  };

  const [copied, setCopied] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const camStreamRef = React.useRef<MediaStream | null>(null);
  const [camFacing, setCamFacing] = React.useState<'environment'|'user'>('environment');
  const [torchOn, setTorchOn] = React.useState<boolean>(false);

  // VisionCamera (네이티브 전용, 선택적)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const VC: any = React.useMemo(() => { try { return require('react-native-vision-camera'); } catch { return null; } }, []);
  const VisionCamera = VC?.Camera;
  const useCameraDevices = VC?.useCameraDevices;
  // VisionCamera 내장 훅 우선, 없으면 code-scanner 훅 폴백
  const useCodeScanner = VC?.useCodeScanner || (() => {
    try { return require('vision-camera-code-scanner').useCodeScanner; } catch { return null; }
  })();

  const stopCamera = React.useCallback(() => {
    try { camStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    camStreamRef.current = null;
    setCameraOpen(false);
  }, []);

  const applyTorch = React.useCallback(async () => {
    try {
      const stream = camStreamRef.current; if (!stream) return;
      const track = stream.getVideoTracks?.()[0]; if (!track) return;
      const cap: any = (track as any).getCapabilities?.();
      if (!cap || !('torch' in cap)) return;
      await (track as any).applyConstraints({ advanced: [{ torch: !!torchOn }] });
    } catch {}
  }, [torchOn]);

  React.useEffect(() => { void applyTorch(); }, [applyTorch]);

  const startCamera = React.useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: camFacing } as any } as any, audio: false } as any;
      // 일부 브라우저는 exact 요구
      try { (constraints.video as any).facingMode = { exact: camFacing }; } catch {}
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      camStreamRef.current = stream;
      setCameraOpen(true);
      setTimeout(async () => {
        try {
          if (!videoRef.current) return;
          videoRef.current.srcObject = stream as any;
          await (videoRef.current as any).play();
          await applyTorch();
        } catch {}
      }, 50);
    } catch {
      Alert.alert('카메라', '카메라를 열 수 없습니다. 권한 또는 장치를 확인해주세요.');
    }
  }, [camFacing, applyTorch]);

  const startNativeCamera = React.useCallback(async () => {
    try {
      if (Platform.OS === 'web') return;
      if (VisionCamera) {
        try { const p = await VisionCamera.requestCameraPermission(); if (p !== 'authorized' && p !== 'granted') { Alert.alert('카메라', '권한이 필요합니다. 설정에서 허용해주세요.'); return; } } catch {}
      } else {
        Alert.alert('카메라', '스캐너 모듈이 비활성화된 빌드입니다.');
        return;
      }
      setCameraOpen(true);
    } catch { Alert.alert('카메라', '카메라를 열 수 없습니다.'); }
  }, [VisionCamera]);
  const handleCopyUrl = async () => {
    try {
      const p = payload || buildCardPayload();
      await (navigator as any)?.clipboard?.writeText?.(p);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Alert.alert('복사됨', 'URL을 클립보드에 복사했습니다.');
    } catch {
      try {
        // 폴백: 텍스트 영역 생성 후 선택/복사
        const ta = document.createElement('textarea');
        ta.value = payload || buildCardPayload();
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        Alert.alert('복사됨', 'URL을 클립보드에 복사했습니다.');
      } catch { Alert.alert('오류', 'URL 복사에 실패했습니다.'); }
    }
  };

  const handleResetQR = () => { setQrUrl(null); setLocalQrData(null); setPayload(''); };
  const handleRegenerate = () => { handleGenerateCard(); };

  return (
    <>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={{ color: '#FFD700', fontSize: 16, fontWeight: '800' }}>←</Text>
          </TouchableOpacity>
          <ThemedText style={styles.title}>{t('myCardMake', language)}</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        {/* 상단 탭 */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, styles.tabLeft, tab==='card' && styles.tabActive]} onPress={() => setTab('card')}>
            <Text style={[styles.tabText, tab==='card' && styles.tabTextActive]}>{t('myCard', language)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, styles.tabRight, tab==='scan' && styles.tabActive]} onPress={() => setTab('scan')}>
            <Text style={[styles.tabText, tab==='scan' && styles.tabTextActive]}>{t('readQr', language)}</Text>
          </TouchableOpacity>
        </View>

        {tab === 'card' ? (
          <ScrollView ref={(r) => { scanScrollRef.current = r; }} style={styles.scroll} contentContainerStyle={[styles.body, styles.bodyPad]} showsVerticalScrollIndicator persistentScrollbar keyboardShouldPersistTaps="handled">
            <View style={styles.row}><Text style={styles.label}>{t('name', language)}</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="" placeholderTextColor="#666" /></View>
            <View style={styles.row}><Text style={styles.label}>{t('phone', language)}</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="" placeholderTextColor="#666" keyboardType="phone-pad" /></View>
            <View style={styles.row}><Text style={styles.label}>{t('email2', language)}</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="" placeholderTextColor="#666" keyboardType="email-address" /></View>
            <View style={styles.row}><Text style={styles.label}>{t('company', language)}</Text><TextInput style={styles.input} value={company} onChangeText={setCompany} placeholder="" placeholderTextColor="#666" /></View>
            <View style={styles.row}><Text style={styles.label}>{t('position', language)}</Text><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="" placeholderTextColor="#666" /></View>
            <View style={styles.row}><Text style={styles.label}>{t('memo2', language)}</Text><TextInput style={[styles.input,{height:66}]} value={memo} onChangeText={setMemo} placeholder="" placeholderTextColor="#666" multiline /></View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.checkRow} onPress={() => setSaveInfo(v => !v)}>
                <View style={[styles.square, saveInfo && styles.squareOn]} />
                <Text style={{ color: '#CFCFCF', marginLeft: 6 }}>{t('saveInfo', language)}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateCard}><Text style={styles.generateText}>{t('generateMyCardQr', language)}</Text></TouchableOpacity>
              </View>
            </View>
            {qrUrl && (
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                <View ref={(el) => { qrCardRef.current = el; qrDomRef.current = el; }} collapsable={false} style={styles.qrCardOuter} id="qr-card">
                  <View style={styles.qrCardBorderBlue}>
                    <View style={styles.qrCardBorderBlack}>
                      {localQrData ? (
                        <Image source={{ uri: localQrData }} style={{ width: 240, height: 240 }} />
                      ) : (
                        <Image source={{ uri: qrUrl }} style={{ width: 240, height: 240 }} onError={async () => {
                          try {
                            const dataUrl = await QRCodeLib.toDataURL(payload || '');
                            setLocalQrData(String(dataUrl));
                          } catch {}
                        }} />
                      )}
                      {/* 센터 로고 오버레이 */}
                      <View style={styles.centerLogoBox}>
                        <View style={styles.centerLogoInnerBlue}>
                          <Image source={require('@/assets/images/side_logo.png')} style={{ width: 48, height: 48 }} resizeMode="contain" />
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
                <Text style={{ color: '#777', marginTop: 8, fontSize: 12 }}>{t('shareTip', language)}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <TouchableOpacity style={styles.generateBtn} onPress={handleSaveGenerated}><Text style={styles.generateText}>{t('save', language)}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.generateBtn} onPress={handleCopyUrl}><Text style={styles.generateText}>{t('copy', language)}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.generateBtn} onPress={handleRegenerate}><Text style={styles.generateText}>{t('reset', language)}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.generateBtn} onPress={handleResetQR}><Text style={styles.generateText}>{t('cancel', language)}</Text></TouchableOpacity>
                </View>
                {(copied || !!saveToast) && (
                  <View style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'center', borderWidth: 1, borderColor: '#FFD700', borderRadius: 10 }}>
                    <Text style={{ color: '#FFD700', fontSize: 12 }}>{saveToast ? saveToast : t('copy', language)}</Text>
                  </View>
                )}
              </View>
            )}
            {/* 스캔 이미지 프리뷰 및 저장 목록 (스크롤 영역 내 포함) */}
            {!!scanImageUrl && (
              <View style={{ alignItems: 'center', marginTop: 6 }}>
                <Image source={{ uri: scanImageUrl }} style={{ width: 220, height: 220, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A2A' }} />
                <Text style={{ color: '#777', fontSize: 12, marginTop: 6 }}>{t('scannedImage', language)}</Text>
              </View>
            )}
            {savedCards.length > 0 && (
              <View style={{ marginTop: 6, position: 'relative', zIndex: 10000, overflow: 'visible' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, position: 'relative', zIndex: 10000, overflow: 'visible' }}>
                  <Text style={{ color: '#CFCFCF', fontWeight: '700' }}>{t('savedList', language)} ({savedCards.length})</Text>
                  <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSavedSortMenu(v => !v)}>
                    <MaterialIcons name="sort" size={18} color="#FFD700" />
                  </TouchableOpacity>
                  {showSavedSortMenu && (
                    <View style={styles.sortMenu}>
                      <TouchableOpacity style={styles.sortMenuItem} onPress={() => { setSavedSort('nameAsc'); setShowSavedSortMenu(false); }}>
                        <Text style={[styles.sortMenuText, savedSort==='nameAsc' && { color: '#FFD700' }]}>{t('sortNameAsc', language)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.sortMenuItem} onPress={() => { setSavedSort('nameDesc'); setShowSavedSortMenu(false); }}>
                        <Text style={[styles.sortMenuText, savedSort==='nameDesc' && { color: '#FFD700' }]}>{t('sortNameDesc', language)}</Text>
                      </TouchableOpacity>
                      <View style={{ height: 1, backgroundColor: '#2A2A2A', marginVertical: 4 }} />
                      <TouchableOpacity style={styles.sortMenuItem} onPress={() => { setSavedSort('timeDesc'); setShowSavedSortMenu(false); }}>
                        <Text style={[styles.sortMenuText, savedSort==='timeDesc' && { color: '#FFD700' }]}>{t('sortTimeDesc', language)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.sortMenuItem} onPress={() => { setSavedSort('timeAsc'); setShowSavedSortMenu(false); }}>
                        <Text style={[styles.sortMenuText, savedSort==='timeAsc' && { color: '#FFD700' }]}>{t('sortTimeAsc', language)}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {sortedSavedCards.map((it) => (
                  <View key={it.id} style={styles.savedItem}>
                    <TouchableOpacity style={styles.savedClose} onPress={() => handleRemoveSaved(it.id)}>
                      <Text style={{ color: '#FFD700', fontWeight: '900' }}>×</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {it.image ? (
                        <Image source={{ uri: it.image }} style={{ width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderColor: '#2A2A2A' }} />
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="image" size={20} color="#777" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#F6F6F6', fontWeight: '700' }}>{it.card?.name || t('noName', language)}</Text>
                        <Text style={{ color: '#CFCFCF', fontSize: 12 }}>{[it.card?.company, it.card?.title].filter(Boolean).join(' · ')}</Text>
                        <Text style={{ color: '#AFAFAF', fontSize: 12 }}>{it.card?.phone ? formatPhoneForLocale(it.card?.phone, language) : (it.card?.email || '')}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.body, styles.bodyPad]} showsVerticalScrollIndicator persistentScrollbar keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {Platform.OS === 'web' && (
                <TouchableOpacity style={styles.scanBtn} onPress={async () => {
                  try {
                    const txt = await (navigator as any)?.clipboard?.readText?.();
                    if (txt) setScanText(String(txt));
                  } catch {
                    Alert.alert(t('alertSettings', language), t('reject', language));
                  }
                }}>
                  <Text style={styles.scanText}>{t('paste', language)}</Text>
                </TouchableOpacity>
              )}
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={styles.scanBtn} onPress={async () => { await startNativeCamera(); }}>
                  <Text style={styles.scanText}>{t('cameraScan', language)}</Text>
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' && (
                <TouchableOpacity style={styles.scanBtn} onPress={async () => {
                  await new Promise<void>((resolve) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                      try { const f = (input.files && input.files[0]) || null; if (f) await detectFromImage(f); } catch {}
                      resolve();
                    };
                    input.click();
                  });
                }}>
                  <Text style={styles.scanText}>{t('imageScan', language)}</Text>
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' && (
                <TouchableOpacity style={styles.scanBtn} onPress={async () => {
                  try {
                    // 카메라 오픈 및 스캔 시작
                    try {
                      await startCamera();
                    } catch {}
                    setTimeout(async () => {
                      try {
                        if (!videoRef.current) return;
                        // startCamera에서 play 처리함 (보조 재시도)
                        if ((videoRef.current as any).play) { try { await (videoRef.current as any).play(); } catch {} }
                        // 스캔 루프
                        const cvs = document.createElement('canvas');
                        const ctx = cvs.getContext('2d');
                        const loop = async () => {
                          try {
                            if (!cameraOpen || !videoRef.current) return;
                            const vw = videoRef.current.videoWidth || 640;
                            const vh = videoRef.current.videoHeight || 640;
                            const s = Math.min(vw, vh);
                            cvs.width = 640; cvs.height = 640;
                            if (ctx) {
                              const sx = Math.floor((vw - s) / 2); const sy = Math.floor((vh - s) / 2);
                              ctx.drawImage(videoRef.current as any, sx, sy, s, s, 0, 0, 640, 640);
                            }
                            // 1) BarcodeDetector
                            let got = '';
                            try {
                              const BD = (window as any).BarcodeDetector;
                              if (BD && ctx) {
                                const bitmap = await createImageBitmap(cvs);
                                const detector = new BD({ formats: ['qr_code'] });
                                const res = await detector.detect(bitmap);
                                if (res && res[0]?.rawValue) got = String(res[0].rawValue);
                              }
                            } catch {}
                            // 2) jsQR
                            if (!got) {
                              try { await ensureJsQRLoaded(); } catch {}
                              try {
                                if ((window as any).jsQR && ctx) {
                                  const im = ctx.getImageData(0,0,cvs.width,cvs.height);
                                  const out = (window as any).jsQR(im.data, cvs.width, cvs.height, { inversionAttempts: 'attemptBoth' });
                                  if (out?.data) got = String(out.data);
                                }
                              } catch {}
                            }
                            if (got) {
                              setScanText(got);
                              try { const frame = cvs.toDataURL('image/png'); setScanImageUrl(frame); } catch {}
                              // stop camera
                              stopCamera();
                              return;
                            }
                            requestAnimationFrame(loop);
                          } catch { requestAnimationFrame(loop); }
                        };
                        requestAnimationFrame(loop);
                      } catch {}
                    }, 100);
                  } catch {
                    Alert.alert('카메라', '카메라 권한을 허용해주세요.');
                  }
                }}>
                  <Text style={styles.scanText}>{t('cameraScan', language)}</Text>
                </TouchableOpacity>
              )}
            </View>
            {!!scanError && <Text style={{ color: '#FF6B6B', marginTop: 10 }}>{scanError}</Text>}
            <TextInput value={scanText} onChangeText={setScanText} placeholder={t('pasteQrTextPlaceholder', language)} placeholderTextColor="#666" style={[styles.input,{ marginTop: 12 }]} />
            {(() => {
              const res = scanText ? parseQrContent(scanText) : null;
              if (!res) return null;
              if (res.kind === 'card') {
                const d = res.data || {};
                const initials = String(d.name || '?').trim().slice(0, 1) || 'Y';
                return (
                  <View style={styles.vCard}>
                    <View style={styles.vHeader}>
                      <AvatarResolver email={d.email} name={d.name} fallbackInitial={initials} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.vName}>{d.name || '이름 없음'}</Text>
                        <Text style={styles.vTitle} numberOfLines={1}>{[d.company, d.title].filter(Boolean).join(' · ')}</Text>
                      </View>
                    </View>
                    <View style={styles.vDivider} />
                    <View style={styles.vInfoBlock}>
                      {!!d.phone && (
                        <View style={styles.vRow}>
                          <MaterialIcons name="phone" size={16} color="#CFCFCF" />
                          <Text style={styles.vRowText}>{formatPhoneForLocale(d.phone, language)}</Text>
                        </View>
                      )}
                      {!!d.email && (
                        <View style={styles.vRow}>
                          <MaterialIcons name="email" size={16} color="#CFCFCF" />
                          <Text style={styles.vRowText}>{d.email}</Text>
                        </View>
                      )}
                      {!!d.memo && (
                        <View style={[styles.vRow, { alignItems: 'flex-start' }]}>
                          <MaterialIcons name="notes" size={16} color="#CFCFCF" style={{ marginTop: 2 }} />
                          <Text style={[styles.vRowText, { color: '#AFAFAF' }]}>{d.memo}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                      <TouchableOpacity style={styles.vBtn} onPress={() => handleSaveCard(d)}>
                    <Text style={styles.vBtnText}>{t('saveToTreasure', language)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.vBtn} onPress={saveScanToMediaGallery}>
                    <Text style={styles.vBtnText}>{t('save', language)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.vBtn} onPress={() => { try { const ta = document.createElement('textarea'); ta.value = JSON.stringify(d, null, 2); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); Alert.alert('복사됨', '명함 정보를 복사했어요.'); } catch {} }}>
                    <Text style={styles.vBtnText}>{t('copy', language)}</Text>
                      </TouchableOpacity>
                      {!!d.email && (
                        <TouchableOpacity style={styles.vBtn} onPress={() => { try { window.open(`mailto:${d.email}`,'_blank'); } catch {} }}>
                        <Text style={styles.vBtnText}>{t('email2', language)}</Text>
                        </TouchableOpacity>
                      )}
                      {!!d.phone && (
                        <TouchableOpacity style={styles.vBtn} onPress={() => { try { window.open(`tel:${d.phone.replace(/\D/g,'')}`,'_self'); } catch {} }}>
                        <Text style={styles.vBtnText}>{t('phone', language)}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }
              if (res.kind === 'invite') {
                const rm = roomsStore.rooms.find(r => r.id === res.roomId);
                return (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>{rm?.title || `방 ${res.roomId}`}</Text>
                    {!!(rm?.tags && rm.tags.length) && (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        {rm.tags.slice(0,5).map(t => (<View key={t} style={styles.tagChip}><Text style={styles.tagText}>#{t}</Text></View>))}
                      </View>
                    )}
                    <TouchableOpacity style={[styles.generateBtn,{ marginTop: 12 }]} onPress={() => { try { router.push({ pathname: '/chat/room/[id]', params: { id: res.roomId } }); } catch {} }}>
                      <Text style={styles.generateText}>{t('enterRoom', language)}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              // 채팅에서 진입했고 roomId가 있으면 즉시 전송 버튼 노출
              const canQuickSend = from === 'room' && !!targetRoomId && !sentOnceRef.current;
              return (
                <View style={styles.resultCard}>
                  <Text style={styles.resultLine}>{res.text}</Text>
                  {canQuickSend && (
                  <TouchableOpacity style={[styles.generateBtn,{ marginTop: 10 }]} onPress={() => {
                      try {
                        const send = (useKakaoRoomsStore as any).getState().sendMessage;
                        if (typeof send === 'function') {
                          const me = (firebaseAuth as any)?.currentUser?.uid || 'me';
                          // 상단: 텍스트(말줄임), 하단: 이미지(웹캠 프레임) 전송 형식 준수
                          const text = String(res.text || '').trim();
                          const doSend = async () => {
                            let url = scanImageUrl || '';
                            try {
                              if (/^data:image\//i.test(String(url))) {
                                const storage = require('@/lib/firebase').firebaseStorage;
                                const realUid = await ensureAuthedUid();
                                const path = `qr/${realUid}/${Date.now()}.png`;
                                const r = storageRef(storage, path);
                                await uploadString(r, String(url), 'data_url');
                                url = await getDownloadURL(r);
                              }
                            } catch {}
                            if (url) send(targetRoomId, me, text, 'image', url); else send(targetRoomId, me, text, 'text');
                          };
                          void doSend();
                          sentOnceRef.current = true;
                          router.back();
                        }
                      } catch {}
                    }}>
                      <Text style={styles.generateText}>{t('sendToCurrentRoom', language)}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}
          </ScrollView>
        )}
      </ThemedView>
      
      {/* 카메라 미리보기 오버레이 (웹 전용) */}
      {cameraOpen && Platform.OS === 'web' && (
        <View style={styles.camOverlay} pointerEvents="auto">
          <View style={styles.camCard}>
            <View style={{ position:'relative' }}>
              <video ref={videoRef as any} style={{ width: '100%', height: 300, backgroundColor: '#000', borderRadius: 8 }} muted playsInline />
              {/* 뷰파인더 */}
              <View style={{ position:'absolute', left: '50%', top: '50%', width: 220, height: 220, marginLeft: -110, marginTop: -110, borderColor: '#FFD700', borderWidth: 2, borderRadius: 20, opacity: 0.9 }} />
              {/* 코너 강조 */}
              <View style={{ position:'absolute', left: '50%', top: '50%', width: 220, height: 220, marginLeft: -110, marginTop: -110 }}>
                <View style={{ position:'absolute', left: -2, top: -2, width: 26, height: 2, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', left: -2, top: -2, width: 2, height: 26, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', right: -2, top: -2, width: 26, height: 2, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', right: -2, top: -2, width: 2, height: 26, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', left: -2, bottom: -2, width: 26, height: 2, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', left: -2, bottom: -2, width: 2, height: 26, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', right: -2, bottom: -2, width: 26, height: 2, backgroundColor:'#FFD700' }} />
                <View style={{ position:'absolute', right: -2, bottom: -2, width: 2, height: 26, backgroundColor:'#FFD700' }} />
              </View>
            </View>
            {/* 컨트롤 바 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', marginTop: 10 }}>
              <View style={{ flexDirection:'row', gap: 8 }}>
                <TouchableOpacity style={styles.scanBtn} onPress={() => setCamFacing((v)=> v==='environment'?'user':'environment')}>
                  <Text style={styles.scanText}>{camFacing==='environment'?t('front', language):t('back', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanBtn} onPress={() => setTorchOn((v)=>!v)}>
                  <Text style={styles.scanText}>{torchOn?t('torchOff', language):t('torchOn', language)}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.scanBtn} onPress={stopCamera}>
                <Text style={styles.scanText}>{t('close', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 네이티브 카메라 모달 (VisionCamera 우선, 폴백: BarCodeScanner) */}
      {cameraOpen && Platform.OS !== 'web' && (
        <View style={styles.camOverlay} pointerEvents="auto">
          <View style={styles.camCard}>
            {VisionCamera ? (
              <View style={{ width: '100%', height: 320, borderRadius: 8, overflow: 'hidden' }}>
                {(() => {
                  const devices = useCameraDevices?.();
                  const device = camFacing === 'environment' ? devices?.back : devices?.front;
                  const codeScanner = useCodeScanner?.({
                    codeTypes: ['qr', 'ean-13', 'code-128'],
                    onCodeScanned: (codes: any[]) => {
                      const value = String(codes?.[0]?.value || codes?.[0]?.rawValue || '');
                      if (!value) return;
                      setScanText(value);
                      setCameraOpen(false);
                    },
                  });
                  return device ? (
                    <VisionCamera style={{ width: '100%', height: '100%' }} device={device} isActive codeScanner={codeScanner} torch={torchOn ? 'on' : 'off'} />
                  ) : (
                    <View style={{ alignItems:'center', justifyContent:'center', height: '100%' }}><Text style={{ color:'#EDEDED' }}>카메라 준비 중...</Text></View>
                  );
                })()}
                {/* 뷰파인더 */}
                <View style={{ position:'absolute', left: '50%', top: '50%', width: 220, height: 220, marginLeft: -110, marginTop: -110, borderColor: '#FFD700', borderWidth: 2, borderRadius: 20, opacity: 0.9 }} />
              </View>
            ) : (
              <View style={{ alignItems:'center', justifyContent:'center', height: 320 }}>
                <Text style={{ color:'#EDEDED' }}>스캐너 준비 중...</Text>
              </View>
            )}
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: 10 }}>
              <View style={{ flexDirection:'row', gap: 8 }}>
                <TouchableOpacity style={styles.scanBtn} onPress={() => setCamFacing((v)=> v==='environment'?'user':'environment')}>
                  <Text style={styles.scanText}>{camFacing==='environment'?t('front', language):t('back', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanBtn} onPress={() => setTorchOn((v)=>!v)}>
                  <Text style={styles.scanText}>{torchOn?t('torchOff', language):t('torchOn', language)}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.scanBtn} onPress={() => setCameraOpen(false)}>
                <Text style={styles.scanText}>{t('close', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <ChatBottomBar active="chat" />
    </>
  );
}

function AvatarResolver({ email, name, fallbackInitial }: { email?: string; name?: string; fallbackInitial: string }) {
  const [photoURL, setPhotoURL] = React.useState<string | null>(null);
  const color = React.useMemo(() => {
    const base = (email || name || fallbackInitial || 'Y').toLowerCase();
    let h = 0; for (let i = 0; i < base.length; i++) { h = (h * 131 + base.charCodeAt(i)) >>> 0; }
    const hue = h % 360;
    return `hsl(${hue}, 75%, 55%)`;
  }, [email, name, fallbackInitial]);
  React.useEffect(() => {
    (async () => {
      try {
        if (!email) { setPhotoURL(null); return; }
        const q = query(collection(firestore, 'users'), where('email', '==', email), limit(1));
        const snap = await getDocs(q);
        const doc = snap.docs[0];
        const p = doc?.data()?.photoURL || doc?.data()?.avatar || null;
        setPhotoURL(p || null);
      } catch { setPhotoURL(null); }
    })();
  }, [email]);
  if (photoURL) {
    return (
      <View style={styles.vAvatarWrap}>
        <Image source={{ uri: photoURL }} style={{ width: 46, height: 46, borderRadius: 9 }} />
      </View>
    );
  }
  return (
    <View style={[styles.vAvatarWrap, { borderColor: 'transparent' }]}> 
      <View style={[styles.vAvatar, { backgroundColor: color }]}>
        <Text style={[styles.vAvatarText, { color: '#0C0C0C' }]}>{(fallbackInitial || 'Y').slice(0,1)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  tabs: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: 'transparent' },
  tabLeft: { },
  tabRight: { },
  tabActive: { backgroundColor: '#FFD700' },
  tabText: { color: '#CFCFCF', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0C0C0C' },
  body: { padding: 16 },
  bodyPad: { paddingBottom: 140 },
  scroll: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { width: 64, color: '#CFCFCF', fontSize: 12 },
  input: { flex: 1, color: '#F6F6F6', borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#121212', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  generateBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#FFD700', borderRadius: 8, backgroundColor: 'transparent' },
  generateText: { color: '#FFD700', fontSize: 13, fontWeight: '700' },
  scanBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#FFD700', borderRadius: 8 },
  scanText: { color: '#FFD700' },
  camOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  camCard: { width: 360, backgroundColor: '#111', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 12 },
  resultCard: { marginTop: 16, padding: 12, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, backgroundColor: '#101010' },
  resultTitle: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  resultLine: { color: '#CFCFCF', marginTop: 4 },
  // vCard 스타일
  vCard: { marginTop: 16, padding: 14, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, backgroundColor: '#0E0E0E' },
  vHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vAvatarWrap: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#2A2A2A' },
  vAvatar: { width: 46, height: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00A3FF' },
  vAvatarText: { color: '#0C0C0C', fontWeight: '900' },
  vName: { color: '#F6F6F6', fontSize: 16, fontWeight: '800' },
  vTitle: { color: '#BBBBBB', fontSize: 12, marginTop: 2 },
  vDivider: { height: 1, backgroundColor: '#1E1E1E', marginVertical: 10 },
  vRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  vRowText: { color: '#CFCFCF' },
  vBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#141414' },
  vBtnText: { color: '#FFD700', fontWeight: '700' },
  vInfoBlock: { marginTop: 6, paddingLeft: 100 },
  savedItem: { position: 'relative', padding: 8, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, marginBottom: 8, backgroundColor: '#101010', zIndex: 1 },
  savedClose: { position: 'absolute', right: 8, top: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center', justifyContent: 'center' },
  sortBtn: { paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8 },
  sortMenu: { position: 'absolute', right: 0, top: 28, backgroundColor: '#0F0F0F', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingVertical: 4, minWidth: 160, zIndex: 9999, elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  sortMenuItem: { paddingHorizontal: 10, paddingVertical: 8 },
  sortMenuText: { color: '#CFCFCF', fontSize: 13 },
  tagChip: { borderWidth: 1, borderColor: '#FFD700', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { color: '#FFD700', fontSize: 11 },
  // 카드 프레임(골드 외곽 테두리 + 검정 내곽)
  qrCardOuter: { padding: 12, backgroundColor: 'transparent' },
  qrCardBorderBlue: { padding: 6, borderRadius: 16, borderWidth: 4, borderColor: '#00A3FF', backgroundColor: 'transparent' },
  qrCardBorderBlack: { padding: 8, borderRadius: 12, borderWidth: 6, borderColor: '#0C0C0C', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  centerLogoBox: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerLogoInnerBlue: { width: 70, height: 70, borderRadius: 14, backgroundColor: '#0C0C0C', borderWidth: 4, borderColor: '#00A3FF', alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, marginTop: 8 },
  square: { width: 14, height: 14, borderWidth: 1, borderColor: '#CFCFCF', backgroundColor: 'transparent' },
  squareOn: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
});


