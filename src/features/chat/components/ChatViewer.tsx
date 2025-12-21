// @ts-nocheck
/* eslint-disable */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Image as RNImage } from 'react-native';
import { Image as EImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { buildMapEmbedUrl, buildStaticMapUrl, reverseGeocode } from '@/src/features/chat/lib/media';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { firebaseApp } from '@/lib/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Kind = 'image'|'video'|'youtube'|'web'|'map'|'pdf';

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
}

export default function ChatViewer(props: ChatViewerProps) {
  const { visible, url, kind, title, hideHeader, headerAvatarUrl, headerTs, headerLocked, onClose, onSave, onCopy, onOpen, onForward, onKeep, onPrev, onNext } = props;
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 0);
  const bottomPad = Math.max(insets.bottom, 0);
  const [addr, setAddr] = useState<string>('');
  const [lat, setLat] = useState<string|undefined>(undefined);
  const [lng, setLng] = useState<string|undefined>(undefined);
  const [pdfLoaded, setPdfLoaded] = useState<boolean>(false);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);
  useEffect(() => { if (kind==='map') setMapLoaded(false); }, [kind, url]);
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
  // Image zoom/pan (web)
  const [imgZoom, setImgZoom] = useState<number>(1);
  const [imgPan, setImgPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgPanMode, setImgPanMode] = useState<boolean>(false);
  const imgDragRef = useRef<{ dx: number; dy: number; sx: number; sy: number; on: boolean }>({ dx: 0, dy: 0, sx: 0, sy: 0, on: false });
  const [qrText, setQrText] = useState<string>('');
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      try {
        setQrText('');
        if (Platform.OS !== 'web') return;
        if (kind !== 'image') return;
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
    return /^(docx?|xlsx?|pptx?|csv|txt|zip|rar|7z|tar|gz|json|xml|psd|ai|apk|ipa)$/i.test(e);
  };

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
          let effKind: Kind | 'pdf' = (kind as any);
          try {
            const raw = String(url||'');
            const lowerNoQ = raw.toLowerCase().split('?')[0];
            if (effKind === 'web' && /\.pdf$/.test(lowerNoQ)) effKind = 'pdf' as any;
            if (effKind === 'web' && treatAsFileByExt(raw)) effKind = 'file' as any;
            if (effKind === 'image' && imgFailed) effKind = 'file' as any;
            // If video points to YouTube, switch to youtube embed for proper playback
            if (effKind === 'video') {
              try {
                const u = new URL(String(raw));
                const h = u.host.toLowerCase().replace(/^www\./,'');
                if (/(^|\.)youtube\.com$/.test(h) || /(^|\.)youtu\.be$/.test(h)) effKind = 'youtube' as any;
              } catch {}
            }
          } catch {}
          const src = String(effKind==='pdf' ? resolvedPdfUrl : (url||''));
          if (effKind === 'video') {
            if (Platform.OS === 'web') {
              const pad = hideHeader ? 64 : (64 + 52);
              return (<video src={src} style={{ width: '96%', height: `calc(100vh - ${pad}px)`, maxHeight: `calc(100vh - ${pad}px)`, objectFit: 'contain' }} controls playsInline preload="metadata" autoPlay />);
            }
            return (<Video source={{ uri: src }} style={{ width:'96%', height:'100%' }} resizeMode={ResizeMode.CONTAIN} useNativeControls />);
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
              return (<WebView source={{ uri: embed }} style={{ width:'96%', height:'100%', backgroundColor:'#000' }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} />);
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
            // Native: WebView로 미리보기 (웹에서는 import하지 않음)
            const WebView = require('react-native-webview').default || require('react-native-webview');
            return (<WebView source={{ uri: src }} style={{ width:'96%', height:'100%' }} allowsInlineMediaPlayback />);
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
            // Native: static map 이미지로 대체 + "지도 열기" 버튼
            try {
              const staticUrl = buildStaticMapUrl(String(src));
              return (
                <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                  <EImage source={{ uri: staticUrl }} style={{ width:'96%', height:'100%' }} contentFit={'cover'} />
                  <View style={{ position:'absolute', left:12, top:12, backgroundColor:'rgba(255,255,255,0.9)', borderRadius:8, paddingHorizontal:10, paddingVertical:6 }}>
                    <Text style={{ color:'#111', fontSize:12, fontWeight:'800' }}>{(lat && lng) ? `${lat}, ${lng}` : '위치'}</Text>
                    {!!addr && (<Text style={{ color:'#333', fontSize:12, marginTop:2 }} numberOfLines={2}>{addr}</Text>)}
                    <TouchableOpacity onPress={onOpen} style={{ marginTop:6, alignSelf:'flex-start' }}>
                      <Text style={{ color:'#1a73e8', fontSize:12, fontWeight:'700' }}>큰 지도 보기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } catch {
              return (
                <View style={{ alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ color:'#FFF', marginBottom:12 }}>지도를 열 수 없습니다</Text>
                  <TouchableOpacity onPress={onOpen} style={{ paddingHorizontal:16, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#FFD700' }}>
                    <Text style={{ color:'#FFD700', fontWeight:'800' }}>지도 열기</Text>
                  </TouchableOpacity>
                </View>
              );
            }
          }
          if (effKind === 'image') {
            if (Platform.OS === 'web') {
              const looksQr = (() => { try { const s=String(src).toLowerCase(); if (s.includes('chart.googleapis.com') && /[?&]cht=qr\b/.test(s)) return true; const u=new URL(s); return /\/(qr|codes)\//i.test(u.pathname); } catch { return false; } })();
              return (
                <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden', backgroundColor:'#000' }}>
                    <div style={{ position:'absolute', left:0, top:0, right:0, bottom:0, transform:`translate(${imgPan.x}px, ${imgPan.y}px) scale(${imgZoom})`, transformOrigin:'center center', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <img src={src} alt={'image'} onError={()=>{ try { setImgFailed(true); } catch {} }} style={{ maxWidth:'100%', maxHeight:'100%', display:'block', objectFit: looksQr ? 'contain' : 'contain' }} />
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
                </View>
              );
            }
            return (<EImage source={{ uri: src }} style={{ width:'96%', height:'100%' }} contentFit={'contain'} onError={()=>{ try { setImgFailed(true); } catch {} }} />);
          }
          if (effKind === 'pdf') {
            if (pdfSrcIdx === 0) {
              return (
                <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                  <canvas ref={pdfCanvasRef as any} style={{ maxWidth:'100%', maxHeight:'100%', backgroundColor:'#111' }} />
                  {!pdfLoaded && (<Text style={{ color:'#EEE', fontSize:12, marginTop:8 }}>PDF 로딩 중...</Text>)}
                </View>
              );
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
              return (<WebView source={{ uri: mozilla }} style={{ width:'96%', height:'100%', backgroundColor:'#111' }} />);
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
          // Fallback: show extension icon + file name (unrenderable types)
          if (effKind === ('file' as any)) {
            const name = fileNameFromUrl(src);
            const ext = (extFromUrl(src) || 'file').toUpperCase();
            const icon = fileIconSvg(ext);
            return (
              <View style={{ width:'96%', height:'100%', alignItems:'center', justifyContent:'center' }}>
                <EImage source={{ uri: icon }} style={{ width: 160, height: 160, borderRadius: 12, backgroundColor:'#111' }} contentFit={'cover'} />
                <Text style={{ color:'#EEE', marginTop: 12, fontWeight:'800' }} numberOfLines={2}>{name}</Text>
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
        <TouchableOpacity onPress={onClose}><Text style={{ color:'#FFF', fontWeight:'800' }}>닫기</Text></TouchableOpacity>
      </View>
    </View>
  );
}


