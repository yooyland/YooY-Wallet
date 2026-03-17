// @ts-nocheck
/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, PanResponder, ActivityIndicator } from 'react-native';
import { Image as RNImage } from 'react-native';
import { Image as EImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { buildMapEmbedUrl, buildStaticMapUrl, reverseGeocode } from '@/src/features/chat/lib/media';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { firebaseApp } from '@/lib/firebase';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

type Kind = 'image'|'video'|'youtube'|'web'|'map'|'pdf'|'audio'|'file'|'text';

export interface ChatViewerProps {
  visible: boolean;
  url: string;
  kind?: Kind;
  title?: string;
  hideHeader?: boolean;
  headerAvatarUrl?: string;
  headerTs?: number;
  headerLocked?: boolean;
  onClose: () => void;
  onSave?: () => void;
  onCopy?: () => void;
  onOpen?: () => void;
  onForward?: () => void;
  onKeep?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete?: () => void;
}

export default function ChatViewer(props: ChatViewerProps) {
  const { visible, url, kind, title, hideHeader, headerAvatarUrl, headerTs, headerLocked, onClose, onSave, onCopy, onOpen, onForward, onKeep, onPrev, onNext, onDelete } = props;
  // SafeAreaContext 직접 조회: Provider 미주입 시 0 폴백
  const insetsFromCtx = React.useContext(SafeAreaInsetsContext as any) as { top: number; bottom: number; left: number; right: number } | null;
  const topPad = Math.max(insetsFromCtx?.top || 16, 16); // 상태바와 겹치지 않게
  const bottomPad = Math.max(insetsFromCtx?.bottom || 0, 0);
  const [addr, setAddr] = useState<string>('');
  const [lat, setLat] = useState<string|undefined>(undefined);
  const [lng, setLng] = useState<string|undefined>(undefined);
  const [pdfLoaded, setPdfLoaded] = useState<boolean>(false);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);
  useEffect(() => { if (kind==='map') setMapLoaded(false); }, [kind, url]);
  useEffect(() => { if (kind==='map') setMapImageFailed(false); }, [kind, url]);
  // 시작을 1(Mozilla viewer)로 하여 웹에서 빈 화면 가능성을 낮춤. blob/data 는 0(canvas) 유지
  const [pdfSrcIdx, setPdfSrcIdx] = useState<number>(1);
  const pdfCanvasRef = useRef<any>(null);
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string>(String(url||''));
  const [pdfResolving, setPdfResolving] = useState<boolean>(false);
  // PDF zoom/pan (web only, native viewer mode)
  const [pdfZoom, setPdfZoom] = useState<number>(1);
  const [pdfPan, setPdfPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pdfPanMode, setPdfPanMode] = useState<boolean>(false);
  const pdfDragRef = useRef<{ dx: number; dy: number; sx: number; sy: number; on: boolean }>({ dx: 0, dy: 0, sx: 0, sy: 0, on: false });
  // Map: stabilize embed URL to prevent flicker on state updates
  const [mapEmbedUrl, setMapEmbedUrl] = useState<string>('');
  const [mapEmbedLocked, setMapEmbedLocked] = useState<boolean>(false);
  const [mapImageFailed, setMapImageFailed] = useState<boolean>(false);
  // Image zoom/pan (web)
  const [imgZoom, setImgZoom] = useState<number>(1);
  const [imgPan, setImgPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgPanMode, setImgPanMode] = useState<boolean>(false);
  const imgDragRef = useRef<{ dx: number; dy: number; sx: number; sy: number; on: boolean }>({ dx: 0, dy: 0, sx: 0, sy: 0, on: false });
  const [qrText, setQrText] = useState<string>('');
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  // Swipe navigation (prev/next) support
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => {
        const ax = Math.abs(g.dx), ay = Math.abs(g.dy);
        return (ax > 20 && ax > ay * 1.5) && !!(onPrev || onNext);
      },
      onPanResponderMove: () => {},
      onPanResponderRelease: (_e, g) => {
        try {
          if (g.dx > 40 && onPrev) onPrev();
          else if (g.dx < -40 && onNext) onNext();
        } catch {}
      },
    })
  ).current;
  useEffect(() => {
    (async () => {
      try {
        setQrText('');
        if (kind !== 'image') return;
        
        // 네이티브: ML Kit + scanQRFromImage 사용
        if (Platform.OS !== 'web') {
          let detected = '';
          // 1) ML Kit 시도
          try {
            const { scanBarcodes, BarcodeFormat } = require('@react-native-ml-kit/barcode-scanning');
            const FS = require('expo-file-system');
            let scanTarget = String(url || '');
            if (/^(content|ph):\/\//i.test(scanTarget) && FS?.cacheDirectory) {
              const dest = `${FS.cacheDirectory}qr_viewer_${Date.now()}.jpg`;
              await FS.copyAsync({ from: scanTarget, to: dest });
              scanTarget = dest;
            }
            const formats = BarcodeFormat?.QR_CODE ? [BarcodeFormat.QR_CODE] : undefined;
            const out = formats ? await scanBarcodes(scanTarget, formats) : await scanBarcodes(scanTarget);
            const first = Array.isArray(out) && out.length ? out[0] : null;
            detected = String(first?.displayValue || first?.rawValue || '');
          } catch {}
          // 2) ML Kit 실패 시 scanQRFromImage 폴백
          if (!detected) {
            try {
              const { scanQRFromImage } = require('@/lib/qrScanner');
              detected = await scanQRFromImage(String(url || '')) || '';
            } catch {}
          }
          if (detected) setQrText(detected);
          return;
        }
        
        // 웹: BarcodeDetector 사용
        const anyWin: any = window as any;
        const Det = anyWin.BarcodeDetector;
        if (!Det) return;
        const img = document.createElement('img');
        try { img.setAttribute('crossorigin','anonymous'); } catch {}
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = String(url||''); });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width; canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const det = new Det({ formats: ['qr_code'] });
        const res: any[] = await det.detect(canvas as any);
        if (Array.isArray(res) && res.length) {
          const raw = String(res[0]?.rawValue || '').trim();
          if (raw) setQrText(raw);
        }
      } catch { setQrText(''); }
    })();
  }, [url, kind]);
  const ensureFirebaseDirect = (u: string) => {
    try {
      let out = u;
      // alt=media 부착 (googleapis + appspot/firebasestorage.app 버킷 호스트 스타일 모두)
      const needAlt = (s: string) => /firebasestorage\.googleapis\.com/i.test(s) || /\.appspot\.com\b/i.test(s) || /\.firebasestorage\.app\b/i.test(s);
      if (needAlt(out) && !/[?&]alt=media\b/i.test(out)) {
        out = out.includes('?') ? `${out}&alt=media` : `${out}?alt=media`;
      }
      return out;
    } catch {}
    return u;
  };
  const getProxyUrl = (raw: string) => {
    const base = (typeof window !== 'undefined' && window.location) ? `${window.location.protocol}//localhost:8080` : 'http://localhost:8080';
    return `${base}/api/pdf-proxy?url=${encodeURIComponent(raw)}`;
  };

  // Helpers for file fallback (unrenderable types)
  const fileNameFromUrl = (raw: string) => {
    try { const u = new URL(String(raw||'')); const last = decodeURIComponent((u.pathname.split('/').pop()||'').replace(/\+/g,' ')); return last || '파일'; } catch { try { const m=/([^\/\?#]+)(?:\?|#|$)/.exec(String(raw)||''); return decodeURIComponent((m?.[1]||'').replace(/\+/g,' ')) || '파일'; } catch { return '파일'; } }
  };
  const extFromUrl = (raw: string) => {
    try { const u = new URL(String(raw||'')); const p = u.pathname.toLowerCase(); const name = p.split('/').pop()||''; const e = name.includes('.') ? (name.split('.').pop()||'') : ''; return e; } catch { try { const m=/\.([a-z0-9]{1,8})(?:\?|#|$)/i.exec(String(raw)||''); return (m?.[1]||'').toLowerCase(); } catch { return ''; } }
  };
  const fileIconSvg = (ext: string) => {
    const label = (ext||'file').toUpperCase();
    const color = /PDF/i.test(label)?'%23E53935':(/DOCX?/i.test(label)?'%231E88E5':(/XLSX?/i.test(label)?'%232E7D32':(/PPTX?/i.test(label)?'%23E67E22':'%23FFD700')));
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='%23151515'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='${color}' font-size='36' font-weight='900'>${(label||'FILE').slice(0,6)}</text></svg>`;
  };
  const treatAsFileByExt = (raw: string) => {
    const e = extFromUrl(raw);
    return /^(docx?|xlsx?|pptx?|csv|zip|rar|7z|tar|gz|psd|ai|apk|ipa)$/i.test(e);
  };
  const isAudioExt = (raw: string) => {
    const e = extFromUrl(raw);
    return /^(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(e);
  };
  const isTextExt = (raw: string) => {
    const e = extFromUrl(raw);
    return /^(txt|json|xml|md|log|csv|ini|cfg|yaml|yml|toml|html|css|js|ts|jsx|tsx|py|java|c|cpp|h|hpp|go|rs|rb|php|sql|sh|bat|ps1)$/i.test(e);
  };
  const [textContent, setTextContent] = useState<string>('');
  const [textLoading, setTextLoading] = useState<boolean>(false);
  
  // Load text file content
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (kind !== 'text' && !isTextExt(String(url||''))) {
          setTextContent('');
          setTextLoading(false);
          return;
        }
        setTextLoading(true);
        setTextContent('');
        const resp = await fetch(String(url||''));
        const text = await resp.text();
        if (alive) setTextContent(text.slice(0, 50000)); // Limit to 50KB
      } catch (err) {
        if (alive) setTextContent('텍스트를 불러올 수 없습니다.');
      } finally {
        if (alive) setTextLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url, kind]);

  // Resolve Firebase Storage URLs to fresh download URLs (handles rotated tokens and wrong bucket hostnames)
  useEffect(() => {
    (async () => {
      try {
        if (kind !== 'pdf') { setResolvedPdfUrl(String(url||'')); setPdfResolving(false); return; }
        setPdfResolving(true);
        let u = ensureFirebaseDirect(String(url||''));
        // 지원 패턴: googleapis /v0/b/{bucket}/o/{object} | gs://bucket/object | https://{bucket}.appspot.com/o/{object} | https://{bucket}.firebasestorage.app/o/{object}
        let m = u.match(/\/v0\/b\/([^/]+)\/o\/([^?]+)/i) || (u.startsWith('gs://') ? [null, u.replace(/^gs:\/\//i,'').split('/')[0], u.replace(/^gs:\/\//i,'').split('/').slice(1).join('/')] : null);
        if (!m) {
          try {
            const U = new URL(u);
            if ((/\.appspot\.com$/i.test(U.host) || /\.firebasestorage\.app$/i.test(U.host)) && /^\/o\//i.test(U.pathname)) {
              const bucketHost = U.host; // 버킷 = 호스트
              const objectPath = decodeURIComponent(U.pathname.replace(/^\/o\//i, ''));
              m = [null as any, bucketHost, objectPath] as any;
            }
          } catch {}
        }
        const hasToken = /[?&]token=/.test(u);
        if (m) {
          const bucketRaw = m[1];
          const objectPath = decodeURIComponent(m[2]);
          const needsRefetch = /\.firebasestorage\.app$/i.test(bucketRaw) || /\.appspot\.com$/i.test(bucketRaw) || !hasToken;
          if (needsRefetch) {
            const bucketCandidates = [
              String(bucketRaw),
              String(bucketRaw).replace(/\.appspot\.com$/i, '.firebasestorage.app'),
              String(bucketRaw),
            ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);
            for (const bucket of bucketCandidates) {
              try {
                const storage = getStorage(firebaseApp, `gs://${bucket}`);
                const dl = await getDownloadURL(storageRef(storage, objectPath));
                setResolvedPdfUrl(dl);
                setPdfResolving(false);
                return;
              } catch {}
            }
          }
          // 토큰 있고 refetch 불필요하면 그대로 사용
          setResolvedPdfUrl(u);
          setPdfResolving(false);
          return;
        }
        // m이 없으면 그대로 사용
        setResolvedPdfUrl(u);
        setPdfResolving(false);
      } catch { setResolvedPdfUrl(String(url||'')); }
    })();
  }, [url, kind]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (kind !== 'map' || !url || Platform.OS !== 'web') { if (alive) { setAddr(''); setLat(undefined); setLng(undefined); } return; }
        const u = new URL(String(url));
        let la: string | undefined; let ln: string | undefined;
        try { const m = u.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/i); if (m) { la=m[1]; ln=m[2]; } } catch {}
        if (!(la&&ln)) { try { const ll = u.searchParams.get('ll'); if (ll && /-?\d+\.?\d*,-?\d+\.?\d*/.test(ll)) { const [a,b]=ll.split(','); la=a; ln=b; } } catch {} }
        if (!(la&&ln)) { try { const q = u.searchParams.get('q'); if (q && /-?\d+\.?\d*,-?\d+\.?\d*/.test(q)) { const [a,b]=q.split(','); la=a; ln=b; } } catch {} }
        // Support Google Static Map: center=lat,lng or markers=lat,lng
        if (!(la&&ln)) { try { const c = u.searchParams.get('center'); if (c && /-?\d+\.?\d*,-?\d+\.?\d*/.test(c)) { const [a,b]=c.split(','); la=a; ln=b; } } catch {} }
        if (!(la&&ln)) { try { const mk = u.searchParams.get('markers'); if (mk && /-?\d+\.?\d*,-?\d+\.?\d*/.test(mk)) { const [a,b]=mk.split(','); la=a; ln=b; } } catch {} }
        let pretty = '';
        try { if (la && ln) { pretty = await reverseGeocode(parseFloat(la), parseFloat(ln)); } } catch {}
        if (!alive) return;
        setLat(la); setLng(ln); setAddr(pretty);
      } catch {}
    })();
    return () => { alive = false; };
  }, [url, kind]);

  useEffect(() => {
    if (kind !== 'pdf') { setPdfLoaded(false); setPdfSrcIdx(0); return; }
    let cancelled = false;
    setPdfLoaded(false);
    // 시작 후보 결정: 로컬(blob/data/localhost)은 Canvas(0), 외부는 Native(2) 우선(안정성)
    let isLocal = false;
    try {
      const s = String(url||'');
      if (/^(blob:|data:)/i.test(s)) isLocal = true;
      else { try { const u = new URL(s); isLocal = /^localhost(:\d+)?$/i.test(u.host); } catch {} }
    } catch {}
    const seq = isLocal ? [0,1,2] : [2,1,0];
    setPdfSrcIdx(seq[0]);
    // 단발성 폴백 드라이버: 로딩 성공(pdfLoaded)하거나 마지막 후보까지 시도하면 중단
    const drive = (idx: number) => {
      if (cancelled) return;
      if (pdfLoaded || pdfResolving) return;
      const next = idx + 1;
      if (next >= seq.length) return;
      const t = setTimeout(() => {
        if (cancelled) return;
        if (!pdfLoaded && !pdfResolving) {
          setPdfSrcIdx(seq[next]);
          drive(next);
        }
      }, 2400);
      // cleanup: 다음 effect 재실행 시 타이머 해제
      (drive as any)._t = t;
    };
    drive(0);
    return () => { cancelled = true; try { clearTimeout((drive as any)._t); } catch {} };
  }, [kind, url, pdfResolving, pdfLoaded]);

  // 네이티브(object) 뷰어일 때 안정화: 잠시 후 로딩 완료로 간주하여 자동 회전을 멈춤(깜빡임 방지)
  useEffect(() => {
    if (kind !== 'pdf') return;
    if (pdfSrcIdx !== 2) return;
    if (pdfLoaded) return;
    const t = setTimeout(() => { try { if (!pdfLoaded) setPdfLoaded(true); } catch {} }, 900);
    return () => { try { clearTimeout(t); } catch {} };
  }, [kind, pdfSrcIdx, pdfLoaded]);

  // reset zoom/pan when URL changes or viewer changes
  useEffect(() => {
    if (kind !== 'pdf') return;
    setPdfZoom(1); setPdfPan({ x: 0, y: 0 }); setPdfPanMode(false);
  }, [kind, url, pdfSrcIdx]);

  // reset image zoom/pan on change
  useEffect(() => {
    if (kind !== 'image') return;
    setImgZoom(1); setImgPan({ x: 0, y: 0 }); setImgPanMode(false);
  }, [kind, url]);

  // Initialize map embed once from raw URL (does not wait for lat/lng)
  useEffect(() => {
    if (kind !== 'map') { setMapEmbedUrl(''); setMapEmbedLocked(false); return; }
    try {
      const initial = buildMapEmbedUrl(String(url||''));
      setMapEmbedUrl(initial);
      setMapEmbedLocked(false);
    } catch { setMapEmbedUrl(String(url||'')); setMapEmbedLocked(false); }
  }, [kind, url]);

  // Upgrade embed to coordinate-based (once) to avoid reload loops when addr updates
  useEffect(() => {
    if (kind !== 'map') return;
    if (!lat || !lng) return;
    if (mapEmbedLocked) return;
    try {
      const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        || (process as any)?.env?.GOOGLE_MAPS_API_KEY
        || ((globalThis as any)?.Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY
        || '';
      const z = 16; const mt = 'roadmap';
      let upgraded = '';
      if (String(addr||'').trim()) {
        upgraded = key
          ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(String(key))}&q=${encodeURIComponent(String(addr||''))}`
          : `https://www.google.com/maps?hl=ko&output=embed&q=${encodeURIComponent(String(addr||''))}`;
      } else {
        upgraded = key
          ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(String(key))}&center=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&zoom=${z}&maptype=${mt}`
          : `https://www.google.com/maps?hl=ko&output=embed&q=${encodeURIComponent(String(lat)+","+String(lng))}&z=${z}`;
      }
      setMapEmbedUrl(upgraded);
      setMapEmbedLocked(true);
    } catch {}
  }, [kind, lat, lng, addr, mapEmbedLocked]);
  // Map watchdog 비활성화: 구글 → OSM 전환으로 인한 깜빡임 방지
  useEffect(() => { if (kind !== 'map') return; }, [kind]);

  // Try inline pdf.js render first (idx 0). On success set loaded.
  useEffect(() => {
    (async () => {
      try {
        if (kind !== 'pdf') return;
        if (pdfSrcIdx !== 0) return;
        const canvas: HTMLCanvasElement | null = pdfCanvasRef.current;
        if (!canvas) return;
        if (pdfResolving) return; // wait until resolved URL ready
        let safetyTimer: any;
        // dynamic import pdf.js
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      // Load pdf.js via CDN to avoid bundler dependency issues
      const ensurePdfJsLib = async (): Promise<any> => {
        try {
          const anyWin: any = (typeof window !== 'undefined') ? window : {};
          if (anyWin.pdfjsLib) return anyWin.pdfjsLib;
          await new Promise<void>((resolve, reject) => {
            try {
              const s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
              s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('pdfjs-load'));
              document.head.appendChild(s);
            } catch (e) { reject(e as any); }
          });
          return (window as any).pdfjsLib;
        } catch { return null; }
      };
      const pdfjsLib = await ensurePdfJsLib();
      try { if (pdfjsLib && (pdfjsLib as any).GlobalWorkerOptions) { (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; } } catch {}
        const direct = ensureFirebaseDirect(String(resolvedPdfUrl));
        const proxied = getProxyUrl(direct);
        // 프록시 우선: 크롬 내장 PDF 뷰어 개입을 최소화하고, CORS/XFO를 회피
        const candidates = [proxied, direct];
        let success = false;
        // 안전 타임아웃: 3.5초 내 로딩 완료 안 되면 다음 폴백으로 전환
        safetyTimer = setTimeout(() => {
          if (kind === 'pdf' && pdfSrcIdx === 0 && !pdfLoaded) {
            try { setPdfSrcIdx(1); } catch {}
          }
        }, 3500);
        for (const candidate of candidates) {
          try {
          const loadingTask = (pdfjsLib as any).getDocument(candidate);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.1 });
            canvas.width = viewport.width; canvas.height = viewport.height;
            const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no-ctx');
            await page.render({ canvasContext: ctx, viewport }).promise;
            setPdfLoaded(true);
            success = true;
            if (safetyTimer) clearTimeout(safetyTimer);
            break;
          } catch {}
        }
        if (!success) throw new Error('pdf-inline-failed');
      } catch {
        // swallow; timer will advance to next candidate
      }
    })();
  }, [kind, resolvedPdfUrl, pdfSrcIdx]);

  // 웹에서 배경 스크롤 방지
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!visible) return;
    const prev = (document.body.style as any).overflow;
    (document.body.style as any).overflow = 'hidden';
    return () => { try { (document.body.style as any).overflow = prev; } catch {} };
  }, [visible]);
  if (!visible) return null as any;

  // 네이티브: 비-HTTPS 웹은 자동으로 외부로 열고 닫기
  useEffect(() => {
    try {
      if (Platform.OS !== 'web' && kind === 'web' && url && !/^https?:\/\//i.test(String(url))) {
        onOpen?.(); onClose?.();
      }
    } catch {}
  }, [kind, url]);

  return (
    <View style={{ position: (Platform.OS==='web' ? 'fixed' as any : 'absolute' as any), left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.95)', zIndex: 2147483647, paddingTop: topPad, paddingBottom: bottomPad }}>
      {/* 상단 바 (옵션) */}
      {hideHeader ? null : (
        <View style={{ height: 52, paddingHorizontal:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
            {headerAvatarUrl ? (
              <EImage source={{ uri: headerAvatarUrl }} style={{ width:24, height:24, borderRadius:12 }} contentFit={'cover'} />
            ) : (
              <View style={{ width:24, height:24, borderRadius:12, backgroundColor:'#333' }} />
            )}
            <View style={{ flex:1, minWidth:0 }}>
              <Text style={{ color:'#FFF', fontWeight:'800', fontSize:14 }} numberOfLines={1} ellipsizeMode={'tail'}>
                {headerLocked ? '🔒 ' : ''}{title || '보낸 사람'}
              </Text>
              <Text style={{ color:'#BBB', fontSize:10 }}>{headerTs ? new Date(headerTs).toLocaleString('ko-KR') : new Date().toLocaleString('ko-KR')}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose}><Text style={{ color:'#FFF', fontSize:18, fontWeight:'800' }}>✕</Text></TouchableOpacity>
        </View>
      )}

      {/* 본문 */}
      <View style={{ position:'absolute', left:0, right:0, top: (hideHeader ? 0 : 52) + topPad, bottom: 64 + bottomPad, alignItems:'center', justifyContent:'center' }}>
        {(() => {
          // derive effective kind based on URL/failed image
          let effKind: Kind = (kind as any);
          try {
            const raw = String(url||'');
            const lowerNoQ = raw.toLowerCase().split('?')[0];
            // Auto-detect kind from extension if not specified or 'web'
            if (!effKind || effKind === 'web' || effKind === 'file') {
              if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(lowerNoQ)) effKind = 'image';
              else if (/\.(mp4|mov|webm|avi|mkv|m4v|3gp)(\?|$)/i.test(lowerNoQ)) effKind = 'video';
              else if (/\.pdf(\?|$)/i.test(lowerNoQ)) effKind = 'pdf';
              else if (isAudioExt(raw)) effKind = 'audio';
              else if (isTextExt(raw)) effKind = 'text';
              else if (treatAsFileByExt(raw)) effKind = 'file';
              else if (effKind !== 'web') effKind = 'file';
            }
            if (effKind === 'image' && imgFailed) effKind = 'file';
            // If video points to YouTube, switch to youtube embed for proper playback
            if (effKind === 'video') {
              try {
                const u = new URL(String(raw));
                const h = u.host.toLowerCase().replace(/^www\./,'');
                if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) effKind = 'youtube';
              } catch {}
            }
          } catch {}
          const src = String(effKind==='pdf' ? resolvedPdfUrl : (url||''));
          if (effKind === 'video') {
            if (Platform.OS === 'web') {
              const pad = hideHeader ? 64 : (64 + 52);
              return (<video src={src} style={{ width: '96%', height: `calc(100vh - ${pad}px)`, maxHeight: `calc(100vh - ${pad}px)`, objectFit: 'contain' }} controls playsInline preload="metadata" autoPlay />);
            }
            return (<Video source={{ uri: src }} style={{ width:'96%', height:'100%' }} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />);
          }
          if (effKind === 'audio') {
            const name = fileNameFromUrl(src);
            const ext = (extFromUrl(src) || 'audio').toUpperCase();
            if (Platform.OS === 'web') {
              return (
                <View style={{ width:'96%', alignItems:'center', justifyContent:'center', padding:24 }}>
                  <View style={{ width:160, height:160, borderRadius:80, backgroundColor:'#1A1A1A', alignItems:'center', justifyContent:'center', marginBottom:24, borderWidth:2, borderColor:'#9C27B0' }}>
                    <Text style={{ fontSize:48 }}>🎵</Text>
                  </View>
                  <Text style={{ color:'#EEE', fontWeight:'800', fontSize:16, textAlign:'center', marginBottom:8 }} numberOfLines={2}>{name}</Text>
                  <Text style={{ color:'#888', fontSize:12, marginBottom:24 }}>{ext} 오디오</Text>
                  <audio src={src} controls autoPlay style={{ width:'100%', maxWidth:400 }} />
                </View>
              );
            }
            return (
              <View style={{ width:'96%', alignItems:'center', justifyContent:'center', padding:24 }}>
                <View style={{ width:160, height:160, borderRadius:80, backgroundColor:'#1A1A1A', alignItems:'center', justifyContent:'center', marginBottom:24, borderWidth:2, borderColor:'#9C27B0' }}>
                  <Text style={{ fontSize:48 }}>🎵</Text>
                </View>
                <Text style={{ color:'#EEE', fontWeight:'800', fontSize:16, textAlign:'center', marginBottom:8 }} numberOfLines={2}>{name}</Text>
                <Text style={{ color:'#888', fontSize:12, marginBottom:24 }}>{ext} 오디오</Text>
                <Video source={{ uri: src }} style={{ width:1, height:1 }} useNativeControls shouldPlay />
                <TouchableOpacity 
                  onPress={() => { try { require('expo-linking').openURL(src); } catch {} }}
                  style={{ marginTop:12, paddingHorizontal:24, paddingVertical:12, borderRadius:10, borderWidth:1, borderColor:'#9C27B0', backgroundColor:'rgba(156,39,176,0.1)' }}
                >
                  <Text style={{ color:'#9C27B0', fontWeight:'800' }}>외부 앱으로 재생</Text>
                </TouchableOpacity>
              </View>
            );
          }
          if (effKind === 'youtube') {
            try {
              const u = new URL(src); const h=u.host.toLowerCase().replace(/^www\./,'');
              let id = ''; if (/^youtu\.be$/.test(h)) id = u.pathname.replace(/^\//,'');
              if (h.endsWith('youtube.com')) { const p=u.pathname||''; if (p.startsWith('/shorts/')) id=p.split('/')[2]||''; if (p.startsWith('/watch')) id=u.searchParams.get('v')||''; }
              const base = id ? `https://www.youtube.com/embed/${id}` : src;
              const sep = base.includes('?') ? '&' : '?';
              const embed = `${base}${sep}autoplay=1&mute=0&playsinline=1`;
              if (Platform.OS === 'web') {
              return (<iframe title={'yt'} src={embed} style={{ width:'96%', height:'100%', border:'none' }} allow='autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share' allowFullScreen />);
              }
              // Native: WebView로 재생 (웹에서는 import하지 않음)
              const WebView = require('react-native-webview').default || require('react-native-webview');
              return (<WebView originWhitelist={['*']} source={{ uri: embed }} style={{ width:'96%', height:'100%', backgroundColor:'#000' }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} />);
            } catch { 
              return (
                <View style={{ alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ color:'#FFF', marginBottom:12 }}>YouTube 미리보기를 열 수 없습니다</Text>
                  <TouchableOpacity onPress={onOpen} style={{ paddingHorizontal:16, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#FFD700' }}>
                    <Text style={{ color:'#FFD700', fontWeight:'800' }}>YouTube 열기</Text>
                  </TouchableOpacity>
                </View>
              ); 
            }
          }
          if (effKind === 'web') {
            if (Platform.OS === 'web') {
            try {
              const isPdf = /\.pdf(\?|$)/i.test(src);
              const effective = isPdf ? `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(src)}` : src;
              return (<iframe title={'web'} src={effective} style={{ width:'96%', height:'100%', border:'none' }} />);
            } catch {
              return (<iframe title={'web'} src={src} style={{ width:'96%', height:'100%', border:'none' }} />);
            }
            }
            // Native: WebView로 미리보기 (웹에서는 import하지 않음). http(s)만 미리보기 허용
            if (!/^https?:\/\//i.test(String(src))) {
              return (
                <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ color:'#EEE', marginBottom:12 }}>이 파일은 내부 미리보기를 지원하지 않습니다.</Text>
                  <TouchableOpacity onPress={onOpen} style={{ paddingHorizontal:16, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#FFD700' }}>
                    <Text style={{ color:'#FFD700', fontWeight:'800' }}>외부로 열기</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const WebView = require('react-native-webview').default || require('react-native-webview');
            return (<WebView originWhitelist={['*']} mixedContentMode={'always'} javaScriptEnabled domStorageEnabled source={{ uri: src }} style={{ width:'96%', height:'100%' }} allowsInlineMediaPlayback />);
          }
          if (effKind === 'map') {
            // Use stabilized embed URL to prevent flicker across state updates
            let embed = mapEmbedUrl || buildMapEmbedUrl(src);
            try {
              const U = new URL(src);
              const isStatic = /maps\.googleapis\.com$/i.test(U.host) && /\/staticmap/i.test(U.pathname);
              if (isStatic) {
                const center = U.searchParams.get('center') || '';
                const markers = U.searchParams.get('markers') || '';
                const coord = /-?\d+\.?\d*,-?\d+\.?\d*/.test(center) ? center : (/^-?\d+\.?\d*,-?\d+\.?\d*/.test(markers) ? markers.split('|')[0] : '');
                if (coord) embed = buildMapEmbedUrl(`https://www.google.com/maps?q=${encodeURIComponent(coord)}`);
              }
            } catch {}
            // Prefer Google embeds to match chat: with key use embed/v1/view, without key use output=embed&q=
            try {
              const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
                || (process as any)?.env?.GOOGLE_MAPS_API_KEY
                || ((globalThis as any)?.Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY
                || '';
              if (lat && lng) {
                const z = 16; const mt = 'roadmap';
                embed = key
                  ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(String(key))}&center=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&zoom=${z}&maptype=${mt}`
                  : `https://www.google.com/maps?hl=ko&output=embed&q=${encodeURIComponent(String(lat)+","+String(lng))}&z=${z}`;
              }
            } catch {}
            if (Platform.OS === 'web') {
              // Web: iframe embed
            return (
              <View style={{ width:'100%', height:'100%' }}>
                {/* 좌상단 카드 */}
                <View style={{ position:'absolute', left:10, top:10, zIndex:2, backgroundColor:'#FFF', borderRadius:8, borderWidth:1, borderColor:'#DDD', padding:10, width:260 }}>
                  <Text style={{ color:'#111', fontSize:12, fontWeight:'800' }}>{(lat && lng) ? `${lat}, ${lng}` : '위치'}</Text>
                  {!!addr && (<Text style={{ color:'#333', fontSize:12, marginTop:4 }} numberOfLines={2}>{addr}</Text>)}
                  <TouchableOpacity onPress={onOpen} style={{ marginTop:8 }}><Text style={{ color:'#1a73e8', fontSize:12, fontWeight:'700' }}>큰 지도 보기</Text></TouchableOpacity>
                </View>
                <iframe id={'yv-embed-map'} title={'map'} src={embed} style={{ width:'100%', height:'100%', border:'none' }} referrerPolicy={'no-referrer-when-downgrade'} allow={'fullscreen; geolocation'} onLoad={()=>{ try { setMapLoaded(true); } catch {} }} />
              </View>
            );
            }
            // Native: 정적 지도 이미지 우선(블랙스크린 회피), 실패 시 WebView 임베드 폴백
            {
              let staticUrl = buildStaticMapUrl(src);
              if (!staticUrl && lat && lng) {
                staticUrl = buildStaticMapUrl(`https://www.google.com/maps?q=${encodeURIComponent(String(lat)+','+String(lng))}`);
              }
              // 폴백용 임베드 URL 준비
              let embedFallback = buildMapEmbedUrl(src);
              try {
                const key = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
                  || (process as any)?.env?.GOOGLE_MAPS_API_KEY
                  || ((globalThis as any)?.Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY
                  || '';
                if (lat && lng) {
                  const z = 16; const mt = 'roadmap';
                  embedFallback = key
                    ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(String(key))}&center=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&zoom=${z}&maptype=${mt}`
                    : `https://www.google.com/maps?hl=ko&output=embed&q=${encodeURIComponent(String(lat)+","+String(lng))}&z=${z}`;
                }
              } catch {}
              return (
                <View style={{ width:'100%', height:'100%' }}>
                  {/* 좌상단 카드 */}
                  <View style={{ position:'absolute', left:12, top:12, zIndex:2, backgroundColor:'rgba(255,255,255,0.95)', borderRadius:8, borderWidth:1, borderColor:'#DDD', padding:10, maxWidth:280 }}>
                    <Text style={{ color:'#111', fontSize:12, fontWeight:'800' }}>{(lat && lng) ? `${lat}, ${lng}` : '위치'}</Text>
                    {!!addr && (<Text style={{ color:'#333', fontSize:12, marginTop:4 }} numberOfLines={2}>{addr}</Text>)}
                    <TouchableOpacity onPress={onOpen} style={{ marginTop:8, alignSelf:'flex-start' }}>
                      <Text style={{ color:'#1a73e8', fontSize:12, fontWeight:'700' }}>큰 지도 보기</Text>
                    </TouchableOpacity>
                  </View>
                  {(!mapImageFailed && staticUrl)
                    ? <EImage source={{ uri: staticUrl }} style={{ width:'100%', height:'100%' }} contentFit={'cover'} onError={()=>{ try { setMapImageFailed(true); } catch {} }} />
                    : (() => {
                        try {
                          const WebView = require('react-native-webview').default || require('react-native-webview');
                          return (<WebView originWhitelist={['*']} mixedContentMode={'always'} javaScriptEnabled domStorageEnabled source={{ uri: embedFallback }} style={{ width:'100%', height:'100%', backgroundColor:'#000' }} />);
                        } catch {
                          return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text style={{ color:'#FFF' }}>지도를 표시할 수 없습니다</Text></View>;
                        }
                      })()
                  }
                </View>
              );
            }
          }
          if (effKind === 'image') {
            // 이미지 미리보기: 로딩/실패/재시도 상태를 명시적으로 관리
            const [imgLoading, setImgLoading] = React.useState(true);
            const [imgError, setImgError] = React.useState<string | null>(null);
            const [reloadTick, setReloadTick] = React.useState(0);
            // 12초 내 로딩 안 되면 타임아웃 처리
            React.useEffect(() => {
              if (!imgLoading) return;
              const t = setTimeout(() => {
                try {
                  if (imgLoading) {
                    setImgError('이미지를 불러오지 못했습니다.');
                    setImgLoading(false);
                  }
                } catch {}
              }, 12000);
              return () => { try { clearTimeout(t); } catch {} };
            }, [imgLoading, reloadTick]);
            const retry = () => {
              try {
                setImgError(null);
                setImgLoading(true);
                setReloadTick((v) => v + 1);
              } catch {}
            };
            if (Platform.OS === 'web') {
              const looksQr = (() => { try { const s=String(src).toLowerCase(); if (s.includes('chart.googleapis.com') && /[?&]cht=qr\b/.test(s)) return true; const u=new URL(s); return /\/(qr|codes)\//i.test(u.pathname); } catch { return false; } })();
              return (
                <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden', backgroundColor:'#000' }}>
                    <div style={{ position:'absolute', left:0, top:0, right:0, bottom:0, transform:`translate(${imgPan.x}px, ${imgPan.y}px) scale(${imgZoom})`, transformOrigin:'center center', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <img
                        src={reloadTick ? `${src}${src.includes('?') ? '&' : '?'}r=${reloadTick}` : src}
                        alt={'image'}
                        onLoad={()=>{ try { setImgLoading(false); setImgFailed(false); } catch {} }}
                        onError={()=>{ try { setImgFailed(true); setImgError('이미지를 불러올 수 없습니다.'); setImgLoading(false); } catch {} }}
                        style={{ maxWidth:'100%', maxHeight:'100%', display:'block', objectFit: looksQr ? 'contain' : 'contain' }}
                      />
                    </div>
                    {imgPanMode && (
                      <div
                        onMouseDown={(e)=>{ try { imgDragRef.current.on=true; imgDragRef.current.sx=e.clientX; imgDragRef.current.sy=e.clientY; imgDragRef.current.dx=imgPan.x; imgDragRef.current.dy=imgPan.y; (e.currentTarget as any).style.cursor='grabbing'; e.preventDefault?.(); } catch {} }}
                        onMouseMove={(e)=>{ try { if (!imgDragRef.current.on) return; const nx = imgDragRef.current.dx + (e.clientX - imgDragRef.current.sx); const ny = imgDragRef.current.dy + (e.clientY - imgDragRef.current.sy); setImgPan({ x: nx, y: ny }); e.preventDefault?.(); } catch {} }}
                        onMouseUp={(e)=>{ try { imgDragRef.current.on=false; (e.currentTarget as any).style.cursor='grab'; e.preventDefault?.(); } catch {} }}
                        onMouseLeave={(e)=>{ try { imgDragRef.current.on=false; (e.currentTarget as any).style.cursor='grab'; } catch {} }}
                        onTouchStart={(e)=>{ try { const t=e.touches?.[0]; if (!t) return; imgDragRef.current.on=true; imgDragRef.current.sx=t.clientX; imgDragRef.current.sy=t.clientY; imgDragRef.current.dx=imgPan.x; imgDragRef.current.dy=imgPan.y; e.preventDefault?.(); } catch {} }}
                        onTouchMove={(e)=>{ try { if (!imgDragRef.current.on) return; const t=e.touches?.[0]; if (!t) return; const nx = imgDragRef.current.dx + (t.clientX - imgDragRef.current.sx); const ny = imgDragRef.current.dy + (t.clientY - imgDragRef.current.sy); setImgPan({ x: nx, y: ny }); e.preventDefault?.(); } catch {} }}
                        onTouchEnd={(e)=>{ try { imgDragRef.current.on=false; e.preventDefault?.(); } catch {} }}
                        style={{ position:'absolute', left:0, top:0, right:0, bottom:0, cursor:'grab', zIndex:2, touchAction:'none' as any }}
                      />
                    )}
                    <View style={{ position:'absolute', right:10, bottom:10, flexDirection:'row', gap:8, zIndex:3 }}>
                      <TouchableOpacity onPress={()=> setImgZoom((z)=> Math.min(4, parseFloat((z+0.15).toFixed(2))))} style={{ backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>＋</Text></TouchableOpacity>
                      <TouchableOpacity onPress={()=> setImgZoom((z)=> Math.max(0.3, parseFloat((z-0.15).toFixed(2))))} style={{ backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>－</Text></TouchableOpacity>
                      <TouchableOpacity onPress={()=> setImgPanMode((v)=> !v)} style={{ backgroundColor: imgPanMode?'#1a73e8':'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>{imgPanMode?'이동 ON':'이동'}</Text></TouchableOpacity>
                      <TouchableOpacity onPress={()=> { setImgZoom(1); setImgPan({ x:0, y:0 }); setImgPanMode(false); }} style={{ backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>초기화</Text></TouchableOpacity>
                    </View>
                  </div>
                  {/* 로딩/에러 오버레이 */}
                  {imgLoading && !imgError && (
                    <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.35)' }}>
                      <ActivityIndicator size="large" color="#FFD700" />
                      <Text style={{ color:'#EEE', marginTop:8, fontSize:12 }}>이미지 불러오는 중...</Text>
                    </View>
                  )}
                  {imgError && (
                    <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.55)' }}>
                      <Text style={{ color:'#FF6B6B', fontSize:13, marginBottom:6 }}>{imgError}</Text>
                      <TouchableOpacity onPress={retry} style={{ paddingHorizontal:16, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#FFD700', backgroundColor:'rgba(0,0,0,0.7)' }}>
                        <Text style={{ color:'#FFD700', fontWeight:'800', fontSize:12 }}>다시 시도</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={onOpen} style={{ marginTop:8 }}>
                        <Text style={{ color:'#CCC', fontSize:11, textDecorationLine:'underline' }}>외부 앱에서 열기</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }
            // Native: EImage + 로딩/에러/재시도
            const [imgLoadingNative, setImgLoadingNative] = React.useState(true);
            const [imgErrorNative, setImgErrorNative] = React.useState<string | null>(null);
            const [reloadNative, setReloadNative] = React.useState(0);
            React.useEffect(() => {
              if (!imgLoadingNative) return;
              const t = setTimeout(() => {
                try {
                  if (imgLoadingNative) {
                    setImgErrorNative('이미지를 불러오지 못했습니다.');
                    setImgLoadingNative(false);
                  }
                } catch {}
              }, 12000);
              return () => { try { clearTimeout(t); } catch {} };
            }, [imgLoadingNative, reloadNative]);
            const retryNative = () => {
              try {
                setImgErrorNative(null);
                setImgLoadingNative(true);
                setReloadNative((v)=>v+1);
              } catch {}
            };
            return (
              <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                <EImage
                  source={{ uri: reloadNative ? `${src}${src.includes('?') ? '&' : '?'}r=${reloadNative}` : src }}
                  style={{ width:'100%', height:'100%' }}
                  contentFit={'contain'}
                  onLoad={()=>{ try { setImgLoadingNative(false); setImgFailed(false); } catch {} }}
                  onError={()=>{ try { setImgFailed(true); setImgErrorNative('이미지를 불러올 수 없습니다.'); setImgLoadingNative(false); } catch {} }}
                />
                {imgLoadingNative && !imgErrorNative && (
                  <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.35)' }}>
                    <ActivityIndicator size="large" color="#FFD700" />
                    <Text style={{ color:'#EEE', marginTop:8, fontSize:12 }}>이미지 불러오는 중...</Text>
                  </View>
                )}
                {imgErrorNative && (
                  <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(0,0,0,0.55)' }}>
                    <Text style={{ color:'#FF6B6B', fontSize:13, marginBottom:6 }}>{imgErrorNative}</Text>
                    <TouchableOpacity onPress={retryNative} style={{ paddingHorizontal:16, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#FFD700', backgroundColor:'rgba(0,0,0,0.7)' }}>
                      <Text style={{ color:'#FFD700', fontWeight:'800', fontSize:12 }}>다시 시도</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onOpen} style={{ marginTop:8 }}>
                      <Text style={{ color:'#CCC', fontSize:11, textDecorationLine:'underline' }}>외부 앱에서 열기</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }
          if (effKind === 'pdf') {
            // inline canvas 렌더는 웹 전용
            if (pdfSrcIdx === 0) {
              if (Platform.OS !== 'web') {
                try { setPdfSrcIdx(1); } catch {}
              } else {
                return (
                  <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                    <canvas ref={pdfCanvasRef as any} style={{ maxWidth:'100%', maxHeight:'100%', backgroundColor:'#111' }} />
                    {!pdfLoaded && (<Text style={{ color:'#EEE', fontSize:12, marginTop:8 }}>PDF 로딩 중...</Text>)}
                  </View>
                );
              }
            }
            const direct = ensureFirebaseDirect(String(src));
            // 1: Mozilla pdf.js viewer (임베드 허용) - 툴바/확대 + 주석 편집 모드 활성화
            if (pdfSrcIdx === 1) {
              const hash = '#zoom=page-width&annotationEditorMode=2';
              const mozilla = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(direct)}${hash}`;
              if (Platform.OS === 'web') {
              return (<iframe title={'pdf-mozilla'} src={mozilla} style={{ width:'96%', height:'100%', border:'none', backgroundColor:'#111' }} onLoad={()=>{ try { setPdfLoaded(true); } catch {} }} />);
              }
              // Native: WebView로 PDF 뷰어 표시
              const WebView = require('react-native-webview').default || require('react-native-webview');
              return (<WebView originWhitelist={['*']} source={{ uri: mozilla }} style={{ width:'96%', height:'100%', backgroundColor:'#111' }} />);
            }
            // 2: 브라우저 네이티브 뷰어 (object) + 커스텀 확대/축소/이동(웹 전용)
            if (Platform.OS === 'web') {
            return (
              <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                <View style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden', backgroundColor:'#111', borderRadius: 6 }}>
                  <div
                    style={{ position:'absolute', left:0, top:0, right:0, bottom:0, transform:`translate(${pdfPan.x}px, ${pdfPan.y}px) scale(${pdfZoom})`, transformOrigin:'center center' }}
                  >
                    <object data={direct} type={'application/pdf'} style={{ width:'100%', height:'100%' }}>
                      <iframe title={'pdf-fallback'} src={direct} style={{ width:'100%', height:'100%', border:'none', backgroundColor:'#111' }} />
                    </object>
                  </div>
                  {Platform.OS==='web' && pdfPanMode && (
                    <div
                      onMouseDown={(e)=>{ try { pdfDragRef.current.on=true; pdfDragRef.current.sx=e.clientX; pdfDragRef.current.sy=e.clientY; pdfDragRef.current.dx=pdfPan.x; pdfDragRef.current.dy=pdfPan.y; (e.currentTarget as any).style.cursor='grabbing'; } catch {} }}
                      onMouseMove={(e)=>{ try { if (!pdfDragRef.current.on) return; const nx = pdfDragRef.current.dx + (e.clientX - pdfDragRef.current.sx); const ny = pdfDragRef.current.dy + (e.clientY - pdfDragRef.current.sy); setPdfPan({ x: nx, y: ny }); } catch {} }}
                      onMouseUp={(e)=>{ try { pdfDragRef.current.on=false; (e.currentTarget as any).style.cursor='grab'; } catch {} }}
                      onMouseLeave={(e)=>{ try { pdfDragRef.current.on=false; (e.currentTarget as any).style.cursor='grab'; } catch {} }}
                      style={{ position:'absolute', left:0, top:0, right:0, bottom:0, cursor:'grab', zIndex:2 }}
                    />
                  )}
                  {/* 확대/축소/이동 컨트롤 */}
                  <View style={{ position:'absolute', right:10, bottom:10, flexDirection:'row', gap:8, zIndex:3 }}>
                    <TouchableOpacity onPress={()=> setPdfZoom((z)=> Math.min(3, parseFloat((z+0.15).toFixed(2))))} style={{ backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>＋</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=> setPdfZoom((z)=> Math.max(0.5, parseFloat((z-0.15).toFixed(2))))} style={{ backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>－</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=> setPdfPanMode((v)=> !v)} style={{ backgroundColor: pdfPanMode?'#1a73e8':'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>{pdfPanMode?'이동 ON':'이동'}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=> { setPdfZoom(1); setPdfPan({ x:0, y:0 }); setPdfPanMode(false); }} style={{ backgroundColor:'rgba(0,0,0,0.6)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}><Text style={{ color:'#FFF', fontWeight:'800' }}>초기화</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            );
            }
            // Native fallback (should not reach here due to idx=1 WebView)
            return (<WebView source={{ uri: direct }} style={{ width:'96%', height:'100%' }} />);
          }
          // Text file viewer
          if (effKind === 'text') {
            const name = fileNameFromUrl(src);
            const ext = (extFromUrl(src) || 'txt').toUpperCase();
            return (
              <View style={{ width:'96%', height:'100%', backgroundColor:'#111', borderRadius:8, overflow:'hidden' }}>
                <View style={{ padding:12, borderBottomWidth:1, borderBottomColor:'#333', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                  <View style={{ flex:1, marginRight:12 }}>
                    <Text style={{ color:'#EEE', fontWeight:'800', fontSize:14 }} numberOfLines={1}>{name}</Text>
                    <Text style={{ color:'#888', fontSize:10, marginTop:2 }}>{ext} 파일</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => { try { require('expo-linking').openURL(src); } catch {} }}
                    style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:6, borderWidth:1, borderColor:'#FFD700' }}
                  >
                    <Text style={{ color:'#FFD700', fontWeight:'700', fontSize:12 }}>다운로드</Text>
                  </TouchableOpacity>
                </View>
                {textLoading ? (
                  <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
                    <Text style={{ color:'#888' }}>로딩 중...</Text>
                  </View>
                ) : Platform.OS === 'web' ? (
                  <pre style={{ flex:1, margin:0, padding:12, color:'#DDD', fontSize:12, fontFamily:'monospace', overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all' } as any}>{textContent}</pre>
                ) : (
                  <View style={{ flex:1, padding:12 }}>
                    <Text style={{ color:'#DDD', fontSize:12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} selectable>{textContent}</Text>
                  </View>
                )}
              </View>
            );
          }
          // Fallback: show extension icon + file name (unrenderable types)
          if (effKind === 'file') {
            const name = fileNameFromUrl(src);
            const ext = (extFromUrl(src) || 'file').toUpperCase();
            const icon = fileIconSvg(ext);
            // Determine file type for icon
            const isDoc = /^(DOCX?|DOC)$/.test(ext);
            const isXls = /^(XLSX?|XLS|CSV)$/.test(ext);
            const isPpt = /^(PPTX?|PPT)$/.test(ext);
            const isZip = /^(ZIP|RAR|7Z|TAR|GZ)$/.test(ext);
            const iconEmoji = isDoc ? '📄' : isXls ? '📊' : isPpt ? '📽️' : isZip ? '📦' : '📁';
            const iconColor = isDoc ? '#1E88E5' : isXls ? '#2E7D32' : isPpt ? '#E67E22' : isZip ? '#9C27B0' : '#FFD700';
            return (
              <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                <View style={{ width:160, height:160, borderRadius:16, backgroundColor:'#1A1A1A', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:iconColor }}>
                  <Text style={{ fontSize:64 }}>{iconEmoji}</Text>
                  <Text style={{ color:iconColor, fontSize:16, fontWeight:'900', marginTop:8 }}>{ext}</Text>
                </View>
                <Text style={{ color:'#EEE', marginTop:20, fontWeight:'800', fontSize:16, textAlign:'center', paddingHorizontal:20 }} numberOfLines={2}>{name}</Text>
                <Text style={{ color:'#888', marginTop:8, fontSize:12 }}>{ext} 파일</Text>
                <View style={{ flexDirection:'row', gap:12, marginTop:24 }}>
                  <TouchableOpacity 
                    onPress={() => { try { require('expo-linking').openURL(src); } catch {} }}
                    style={{ paddingHorizontal:24, paddingVertical:12, borderRadius:10, borderWidth:1, borderColor:'#FFD700', backgroundColor:'rgba(255,215,0,0.1)' }}
                  >
                    <Text style={{ color:'#FFD700', fontWeight:'800' }}>외부 앱으로 열기</Text>
                  </TouchableOpacity>
                  {onSave && (
                    <TouchableOpacity 
                      onPress={onSave}
                      style={{ paddingHorizontal:24, paddingVertical:12, borderRadius:10, borderWidth:1, borderColor:'#4CAF50', backgroundColor:'rgba(76,175,80,0.1)' }}
                    >
                      <Text style={{ color:'#4CAF50', fontWeight:'800' }}>저장</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }
          // default: image
          if (Platform.OS === 'web' && /^(blob:|data:)/i.test(src)) {
            return (<RNImage source={{ uri: src }} style={{ width:'96%', height:'100%' }} resizeMode={'contain'} />);
          }
          return (<EImage source={{ uri: src }} style={{ width:'96%', height:'100%' }} contentFit={'contain'} />);
        })()}
        {Platform.OS==='web' && kind==='image' && !!qrText ? (
          <View style={{ position:'absolute', left:12, right:12, bottom:76, backgroundColor:'rgba(0,0,0,0.7)', borderWidth:1, borderColor:'#333', borderRadius:12, padding:10 }}>
            <Text style={{ color:'#FFD700', fontWeight:'800', marginBottom:6 }}>스캔 결과</Text>
            <Text style={{ color:'#EEE' }} numberOfLines={3}>{qrText}</Text>
            <View style={{ flexDirection:'row', gap:12, marginTop:8, justifyContent:'flex-end' }}>
              <TouchableOpacity onPress={async ()=>{ try { await (navigator as any).clipboard?.writeText?.(String(qrText)); } catch {} }}><Text style={{ color:'#FFF', fontWeight:'800' }}>복사</Text></TouchableOpacity>
              {/^https?:\/\//i.test(qrText) ? (
                <TouchableOpacity onPress={()=>{ try { (window as any).open(String(qrText), '_blank'); } catch {} }}><Text style={{ color:'#FFF', fontWeight:'800' }}>열기</Text></TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
        {/* 좌/우 네비게이션 (옵션) */}
        {onPrev ? (
          <TouchableOpacity onPress={onPrev} style={{ position:'absolute', left:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }], zIndex:3 }}>
            <Text style={{ color:'#000', fontWeight:'900' }}>‹</Text>
          </TouchableOpacity>
        ) : null}
        {onNext ? (
          <TouchableOpacity onPress={onNext} style={{ position:'absolute', right:12, top:'50%', width:36, height:36, borderRadius:18, backgroundColor:'rgba(255,255,255,0.7)', alignItems:'center', justifyContent:'center', transform:[{ translateY:-18 }], zIndex:3 }}>
            <Text style={{ color:'#000', fontWeight:'900' }}>›</Text>
          </TouchableOpacity>
        ) : null}
        {/* Swipe overlay to allow left/right navigation by gesture */}
        {(onPrev || onNext) ? (
          <View
            {...(swipePan.panHandlers as any)}
            style={{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'transparent' }}
            pointerEvents="auto"
          />
        ) : null}
      </View>

      {/* 하단 액션바 */}
      <View style={{ position:'absolute', left:0, right:0, bottom:0, height:64, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.08)', flexDirection:'row', alignItems:'center', justifyContent:'space-around' }}>
        {!!onOpen && (kind==='web' || kind==='map') ? (
          <TouchableOpacity onPress={onOpen}><Text style={{ color:'#FFF', fontWeight:'800' }}>{kind==='map'?'지도 열기':'링크 열기'}</Text></TouchableOpacity>
        ) : (
          !!onSave && <TouchableOpacity onPress={onSave}><Text style={{ color:'#FFF', fontWeight:'800' }}>저장</Text></TouchableOpacity>
        )}
        {!!onCopy && (<TouchableOpacity onPress={onCopy}><Text style={{ color:'#FFF', fontWeight:'800' }}>복사</Text></TouchableOpacity>)}
        {!!onForward && (<TouchableOpacity onPress={onForward}><Text style={{ color:'#FFF', fontWeight:'800' }}>전달</Text></TouchableOpacity>)}
        {!!onKeep && (<TouchableOpacity onPress={onKeep}><Text style={{ color:'#FFF', fontWeight:'800' }}>보관</Text></TouchableOpacity>)}
        {!!onDelete && (<TouchableOpacity onPress={onDelete}><Text style={{ color:'#FF6B6B', fontWeight:'800' }}>삭제</Text></TouchableOpacity>)}
        <TouchableOpacity onPress={onClose}><Text style={{ color:'#FFF', fontWeight:'800' }}>닫기</Text></TouchableOpacity>
      </View>
    </View>
  );
}


