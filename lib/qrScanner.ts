/**
 * QR 코드 스캔 유틸리티
 * wallet.tsx의 scanImageWithAll 로직을 분리하여 공유
 */

// jsQR 동적 로딩
let jsQRLib: any = (() => { try { return require('jsqr'); } catch { return null; } })();

async function ensureJsQRLoaded(): Promise<void> {
  if (jsQRLib || typeof window === 'undefined') return;
  await new Promise<void>((resolve) => {
    try {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/jsqr/dist/jsQR.js';
      s.async = true;
      s.onload = () => { try { jsQRLib = (window as any).jsQR || jsQRLib; } catch {} finally { resolve(); } };
      s.onerror = () => resolve();
      document.head.appendChild(s);
    } catch { resolve(); }
  });
}

function normalizeScannedText(raw: string): string {
  if (!raw) return '';
  let s = raw;
  try { s = decodeURIComponent(s); } catch {}
  try {
    if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 20) {
      const dec = typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString('utf8');
      if (dec && /^[\x20-\x7E]+$/.test(dec)) s = dec;
    }
  } catch {}
  return s;
}

/**
 * 이미지 URI에서 QR 코드를 스캔
 * 여러 방법을 시도하여 가장 안정적인 결과 반환
 */
export async function scanQRFromImage(uri: string): Promise<string | null> {
  if (!uri) return null;
  console.log('[scanQRFromImage] start:', uri?.slice(0, 100));

  // 네이티브 환경에서만 실행
  if (typeof document !== 'undefined') return null;

  try {
    const src = String(uri || '');
    let dataUri = '';
    let mimeGuess = 'image/jpeg';

    // 1) 파일 경로에서 base64 데이터 읽기
    if (!/^data:image\//i.test(src)) {
      try {
        const FS = require('expo-file-system');
        const ext = (src.split('.').pop() || '').toLowerCase();
        if (ext === 'jpg' || ext === 'jpeg') mimeGuess = 'image/jpeg';
        else if (ext === 'png') mimeGuess = 'image/png';
        else if (ext === 'webp') mimeGuess = 'image/webp';

        // content:// 또는 ph:// URI 처리
        let readPath = src;
        if (/^(content|ph):\/\//i.test(src)) {
          const dest = `${FS.cacheDirectory}qr_scan_${Date.now()}.jpg`;
          await FS.copyAsync({ from: src, to: dest });
          readPath = dest;
        }

        const b64file = await FS.readAsStringAsync(readPath, { encoding: FS.EncodingType.Base64 });
        if (b64file && typeof b64file === 'string') {
          dataUri = `data:${mimeGuess};base64,${b64file}`;
        }
      } catch (e) {
        console.warn('[scanQRFromImage] readFile fail:', e);
        // RNBlobUtil 폴백
        try {
          const RNBU = (() => { try { const m = require('react-native-blob-util'); return m?.default ?? m; } catch { return null; } })();
          if (RNBU?.fs?.readFile) {
            const b64 = await RNBU.fs.readFile(src.replace(/^file:\/\//, ''), 'base64');
            if (b64) dataUri = `data:${mimeGuess};base64,${b64}`;
          }
        } catch {}
      }
    } else {
      dataUri = src;
    }

    // 2) base64 데이터에서 이미지 디코딩
    const m = String(dataUri || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
    if (!m || !m[2]) {
      console.warn('[scanQRFromImage] no valid base64 data');
      return null;
    }

    const mime = (m[1] || mimeGuess).toLowerCase();
    const b64 = m[2];

    const toU8 = (b64str: string): Uint8Array => {
      try {
        const B: any = (globalThis as any).Buffer;
        if (typeof B !== 'undefined') return B.from(b64str, 'base64') as unknown as Uint8Array;
      } catch {}
      try {
        const binary = (globalThis as any)?.atob ? (globalThis as any).atob(b64str) : '';
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
        return bytes;
      } catch { return new Uint8Array([]); }
    };

    let width = 0, height = 0, data: Uint8ClampedArray | null = null;

    // PNG 우선
    if (mime.includes('png')) {
      try {
        const P = require('pngjs/browser');
        const PNG = P.PNG || P;
        const buf = toU8(b64);
        const parsed = PNG.sync.read((typeof Buffer !== 'undefined' ? Buffer.from(buf) : buf) as any);
        width = parsed.width; height = parsed.height;
        data = new Uint8ClampedArray(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
      } catch (e) { console.warn('[scanQRFromImage] png decode fail:', e); }
    }

    // JPEG 폴백
    if (!data) {
      try {
        const jpeg = require('jpeg-js');
        const buf = toU8(b64);
        const decoded = jpeg.decode((typeof Buffer !== 'undefined' ? Buffer.from(buf) : buf) as any, { useTArray: true });
        width = decoded.width; height = decoded.height;
        data = new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
      } catch (e) { console.warn('[scanQRFromImage] jpeg decode fail:', e); }
    }

    if (!data || width <= 0 || height <= 0) {
      console.warn('[scanQRFromImage] no image data');
      return null;
    }

    console.log('[scanQRFromImage] image decoded:', width, 'x', height);

    // 이미지 전처리 함수: 그레이스케일 변환 + 대비 증가 + 투명도 제거
    const preprocessImage = (src: Uint8ClampedArray): Uint8ClampedArray => {
      const out = new Uint8ClampedArray(src.length);
      for (let i = 0; i < src.length; i += 4) {
        // 그레이스케일 변환 (luminance formula)
        const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];
        // 투명도가 있으면 흰색 배경으로 합성
        const alpha = a / 255;
        const bgWhite = 255;
        const blendR = Math.round(r * alpha + bgWhite * (1 - alpha));
        const blendG = Math.round(g * alpha + bgWhite * (1 - alpha));
        const blendB = Math.round(b * alpha + bgWhite * (1 - alpha));
        // 그레이스케일
        let gray = Math.round(0.299 * blendR + 0.587 * blendG + 0.114 * blendB);
        // 대비 증가 (contrast factor 1.5)
        const factor = 1.5;
        gray = Math.round(((gray / 255 - 0.5) * factor + 0.5) * 255);
        gray = Math.max(0, Math.min(255, gray));
        // 이진화 (threshold 128)
        const binary = gray > 128 ? 255 : 0;
        out[i] = binary; out[i + 1] = binary; out[i + 2] = binary; out[i + 3] = 255;
      }
      return out;
    };

    // 전처리된 이미지
    const preprocessedData = preprocessImage(data);
    console.log('[scanQRFromImage] preprocessed: grayscale + contrast + binarized');

    // 3) jsQR로 스캔 (전처리된 이미지 우선)
    try {
      await ensureJsQRLoaded();
      // 전처리된 이미지로 먼저 시도
      let out = jsQRLib ? jsQRLib(preprocessedData, width, height, { inversionAttempts: 'attemptBoth' }) : null;
      if (out?.data) {
        console.log('[scanQRFromImage] jsQR success (preprocessed):', out.data);
        return normalizeScannedText(String(out.data));
      }
      // 원본 이미지로 재시도
      out = jsQRLib ? jsQRLib(data, width, height, { inversionAttempts: 'attemptBoth' }) : null;
      if (out?.data) {
        console.log('[scanQRFromImage] jsQR success (original):', out.data);
        return normalizeScannedText(String(out.data));
      }
    } catch (e) { console.warn('[scanQRFromImage] jsQR fail:', e); }

    // 4) ZXing JS 폴백
    try {
      const ZXN = (() => { try { return require('@zxing/library'); } catch { return null; } })();
      if (ZXN && ZXN.RGBLuminanceSource && ZXN.BinaryBitmap && ZXN.HybridBinarizer) {
        const source = new ZXN.RGBLuminanceSource(data, width, height);
        const bitmap = new ZXN.BinaryBitmap(new ZXN.HybridBinarizer(source));
        const MF = ZXN.MultiFormatReader || ZXN.QRCodeReader;
        if (MF) {
          const reader = new MF();
          try {
            if (ZXN.DecodeHintType && reader.setHints) {
              const hints = new Map();
              hints.set(ZXN.DecodeHintType.TRY_HARDER, true);
              reader.setHints(hints);
            }
          } catch {}
          const res = reader.decode(bitmap);
          if (res?.text) {
            console.log('[scanQRFromImage] zxing success:', res.text);
            return normalizeScannedText(String(res.text));
          }
        }
      }
    } catch (e) { console.warn('[scanQRFromImage] zxing fail:', e); }

    // 5) 중앙 로고 마스킹 후 재시도 (QR 코드 중앙에 로고가 있는 경우)
    try {
      await ensureJsQRLoaded();
      if (jsQRLib && data) {
        const makeMasked = (src: Uint8ClampedArray, w: number, h: number, ratio: number, white: boolean): Uint8ClampedArray => {
          const out = new Uint8ClampedArray(src);
          const size = Math.max(4, Math.floor(Math.min(w, h) * ratio));
          const x0 = Math.floor((w - size) / 2);
          const y0 = Math.floor((h - size) / 2);
          const val = white ? 255 : 0;
          for (let y = y0; y < y0 + size && y < h; y++) {
            for (let x = x0; x < x0 + size && x < w; x++) {
              const i = (y * w + x) * 4;
              out[i] = val; out[i + 1] = val; out[i + 2] = val; out[i + 3] = 255;
            }
          }
          return out;
        };

        // 더 넓은 범위의 마스킹 비율 시도 (로고+배경 포함)
        const ratios = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
        console.log('[scanQRFromImage] trying masked scan with ratios:', ratios);
        for (const r of ratios) {
          for (const white of [true, false]) {
            try {
              const masked = makeMasked(data, width, height, r, white);
              const out = jsQRLib(masked, width, height, { inversionAttempts: 'attemptBoth' });
              if (out?.data) {
                console.log('[scanQRFromImage] masked success at ratio', r, 'white:', white, 'data:', out.data);
                return normalizeScannedText(String(out.data));
              }
            } catch {}
          }
        }
        console.log('[scanQRFromImage] all masked attempts failed');
      }
    } catch (e) { console.warn('[scanQRFromImage] mask error:', e); }

    console.warn('[scanQRFromImage] all methods failed');
    return null;
  } catch (e) {
    console.error('[scanQRFromImage] error:', e);
    return null;
  }
}
