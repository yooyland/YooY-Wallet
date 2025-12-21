import CoinDetailModal from '@/components/CoinDetailModal';
import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import QuickActionsSettings from '@/components/QuickActionsSettings';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import TransactionDetailModal from '@/components/TransactionDetailModal';
import WalletCreateModal from '@/components/WalletCreateModal';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useQuickActions } from '@/contexts/QuickActionsContext';
import { useTransaction } from '@/contexts/TransactionContext';
import { useWallet } from '@/contexts/WalletContext';
import { t } from '@/i18n';
import { ExchangeRates, formatCurrency, getExchangeRates } from '@/lib/currency';
import { getCoinPriceByCurrency, updateRealTimePrices } from '@/lib/priceManager';
import { getAllUpbitMarkets, UpbitTicker } from '@/lib/upbit';
import { getMockBalancesForUser } from '@/lib/userBalances';
import { useTransactionStore } from '@/src/stores/transaction.store';
import { createVoucher, buildClaimUri, endVoucher, parseClaimUri, getVoucher, claimVoucher, type ClaimVoucher } from '@/lib/claims';
import { collection, onSnapshot, orderBy, query, where, deleteDoc, doc as fsDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useWalletConnect } from '@/contexts/WalletConnectContext';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Share, Linking, RefreshControl } from 'react-native';
// QR: 네이티브 라이브러리 우선, 없으면 Google Chart 이미지로 폴백
let QRCode: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCode = require('react-native-qrcode-svg').default || require('react-native-qrcode-svg');
} catch {}

// QR 중앙 로고 렌더링 토글
const QR_CENTER_LOGO = true;

// View capture (native 우선)
let captureRef: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  captureRef = require('react-native-view-shot').captureRef;
} catch {}

// VisionCamera 동적 로딩 (가능 시 고성능 스캔 사용)
let VisionCamera: any = null;
let useCameraDevices: any = null;
let useCodeScanner: any = null;
// Guard native-only imports on web to avoid bundling errors
if (Platform.OS !== 'web') {
  try {
    const vc = require('react-native-vision-camera');
    VisionCamera = vc.Camera;
    useCameraDevices = vc.useCameraDevices;
    try {
      useCodeScanner = vc.useCodeScanner || require('vision-camera-code-scanner').useCodeScanner;
    } catch {}
  } catch {}
}

// jsQR 동적 로딩 (웹에서만 사용)
// eslint-disable-next-line @typescript-eslint/no-var-requires
let jsQRLib: any = (()=>{ try { return require('jsqr'); } catch { return null; } })();
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
// qrcode-decoder 폴백(웹)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QrDecoder: any = (()=>{ try { return require('qrcode-decoder'); } catch { return null; } })();
// ZXing 폴백(웹) - 둘 중 하나라도 있으면 사용
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZXingLib: any = (()=>{ 
  try { return require('@zxing/browser'); } 
  catch { try { return require('@zxing/library'); } catch { return null; } }
})();
// zbar-wasm (강력한 WASM 디코더) - 선택적 폴백
// 웹 번들에서 import.meta 처리 문제를 피하기 위해 비활성화
const ZBarWasm: any = null;
// 브라우저 BarcodeDetector 존재 여부 체크
const hasBarcodeDetector = (typeof window !== 'undefined') && (window as any).BarcodeDetector && typeof (window as any).BarcodeDetector === 'function';
// Expo Camera (SDK54): CameraView로 바코드 스캔 지원
// eslint-disable-next-line @typescript-eslint/no-var-requires
let ExpoCamera: any = (()=>{ try { return require('expo-camera'); } catch { return null; } })();
const CameraView: any = ExpoCamera?.CameraView || null;

// 스캔 텍스트 정규화: 공백 제거, 줄바꿈 제거, 지원 URI만 추출
function normalizeScannedText(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  // 줄바꿈/공백 제거
  s = s.replace(/\s+/g, '');
  // 따옴표 래핑 제거
  s = s.replace(/^['"]|['"]$/g, '');
  // 내용 중에 yooy://(pay|claim|invite|card) 또는 http(s) 링크가 섞여 있으면 그 부분만 추출
  const m =
    s.match(/yooy:\/\/(?:pay|claim|invite|card)\?[^\s"']+/i) ||
    s.match(/https?:\/\/[^\s"']+/i);
  if (m) return m[0];
  return s;
}

// Base64URL helpers (파일명으로 payload를 안전하게 담기 위함)
function toBase64Url(input: string): string {
  try {
    const b64 = (typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(input))) : Buffer.from(input, 'utf8').toString('base64'));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch { return ''; }
}
function fromBase64Url(input: string): string {
  try {
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const s = b64 + pad;
    return decodeURIComponent(escape(typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString('utf8')));
  } catch { return ''; }
}

// 이미지 전처리 및 멀티 디코더 스캔 (네이티브 + 웹)
async function scanImageWithAll(uri: string): Promise<string | null> {
  try {
    console.log('[scanImageWithAll] start, uri:', uri?.slice(0,128));
    // 0) 네이티브(안드/iOS): data URL(base64)이면 pngjs/jpeg-js로 직접 디코드 → jsQR
    if (typeof document === 'undefined') {
      try {
        const m = String(uri || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
        if (m && m[2]) {
          const mime = (m[1] || 'image/png').toLowerCase();
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
              for (let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i) & 0xff;
              return bytes;
            } catch { return new Uint8Array([]); }
          };
          let width = 0, height = 0, data: Uint8ClampedArray | null = null;
          // PNG 우선
          if (mime.includes('png')) {
            try {
              // RN/웹 공용: 브라우저 번들만 사용 (Node 의존성 util/stream 회피)
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const P = require('pngjs/browser');
              const PNG = P.PNG || P;
              const buf = toU8(b64);
              const parsed = PNG.sync.read((typeof Buffer !== 'undefined' ? Buffer.from(buf) : buf) as any);
              width = parsed.width; height = parsed.height;
              data = new Uint8ClampedArray(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
            } catch (e) { console.warn('[scanImageWithAll][native][png] fail', e); }
          }
          // JPEG 폴백
          if (!data) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const jpeg = require('jpeg-js');
              const buf = toU8(b64);
              const decoded = jpeg.decode((typeof Buffer !== 'undefined' ? Buffer.from(buf) : buf) as any, { useTArray: true });
              width = decoded.width; height = decoded.height;
              data = new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
            } catch (e) { console.warn('[scanImageWithAll][native][jpeg] fail', e); }
          }
          if (data && width > 0 && height > 0) {
            try {
              await ensureJsQRLoaded();
              const out = (jsQRLib ? jsQRLib(data, width, height, { inversionAttempts: 'attemptBoth' }) : null);
              if (out?.data) return normalizeScannedText(String(out.data));
            } catch (e) { console.warn('[scanImageWithAll][native][jsQR] fail', e); }
            // 중앙 로고(또는 중심 가려짐)로 인한 실패 대비: 중심 정사각형을 여러 비율로 흰색/검정 마스킹 후 재시도
            try {
              await ensureJsQRLoaded();
              if (jsQRLib) {
                const makeMasked = (src: Uint8ClampedArray, w: number, h: number, ratio: number, white = true): Uint8ClampedArray => {
                  const out = new Uint8ClampedArray(src); // 복사본
                  const size = Math.max(4, Math.floor(Math.min(w, h) * ratio));
                  const x0 = Math.max(0, Math.floor((w - size) / 2));
                  const y0 = Math.max(0, Math.floor((h - size) / 2));
                  const rVal = white ? 255 : 0;
                  const gVal = white ? 255 : 0;
                  const bVal = white ? 255 : 0;
                  for (let y = y0; y < y0 + size; y++) {
                    const row = y * w;
                    for (let x = x0; x < x0 + size; x++) {
                      const i = (row + x) * 4;
                      out[i] = rVal; out[i+1] = gVal; out[i+2] = bVal; out[i+3] = 255;
                    }
                  }
                  return out;
                };
                const ratios = [0.12, 0.16, 0.18, 0.22, 0.26, 0.30, 0.34, 0.36, 0.40];
                const colors: Array<'white'|'black'> = ['white', 'black'];
                for (const r of ratios) {
                  for (const col of colors) {
                    try {
                      const masked = makeMasked(data, width, height, r, col === 'white');
                      const out2 = jsQRLib(masked, width, height, { inversionAttempts: 'attemptBoth' });
                      if (out2?.data) return normalizeScannedText(String(out2.data));
                    } catch {}
                  }
                }
              }
            } catch (e) {
              console.warn('[scanImageWithAll][native][mask-retry] fail', e);
            }
          }
        }
      } catch {}
      // 네이티브에서 인식 실패 시 null
      return null;
    }
    // 1) ZXing을 최우선 시도 (데이터 URL 기반)
    try {
      if (ZXingLib) {
        const ReaderCtor = ZXingLib.BrowserQRCodeReader || ZXingLib.BrowserMultiFormatReader;
        if (ReaderCtor) {
          const reader = new ReaderCtor();
          if (typeof reader.decodeFromImageUrl === 'function') {
            try {
              const res = await reader.decodeFromImageUrl(uri);
              if (res?.text) return normalizeScannedText(String(res.text));
            } catch {}
          }
        }
      }
    } catch {}

    // 2) (제거) Expo BarCodeScanner 사용 구간은 안전모드에서 제외

    if (typeof document === 'undefined') return null;

    // 이미지 로드 (CORS 우회 시도) - 웹 DOM 전용 API 사용
    const loadImg = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = document.createElement('img');
      img.setAttribute('crossorigin', 'anonymous');
      img.onload = () => resolve(img as HTMLImageElement);
      img.onerror = reject as any;
      img.src = src;
    });

    await ensureJsQRLoaded();
    const imgEl = await loadImg(uri);
    console.log('[scanImageWithAll] image loaded:', imgEl.width, imgEl.height);
    // 캔버스 준비: 원본 비율 유지한 채 정사각 중심 크롭 + 리사이즈(최대 1200)
    const square = Math.min(imgEl.naturalWidth || imgEl.width, imgEl.naturalHeight || imgEl.height);
    const sx = Math.floor(((imgEl.naturalWidth || imgEl.width) - square) / 2);
    const sy = Math.floor(((imgEl.naturalHeight || imgEl.height) - square) / 2);
    const TARGET = Math.min(1200, Math.max(640, Math.min(imgEl.naturalWidth || imgEl.width, imgEl.naturalHeight || imgEl.height)));
    const base = document.createElement('canvas');
    base.width = TARGET; base.height = TARGET;
    const bctx = base.getContext('2d');
    if (!bctx) return null;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(imgEl, sx, sy, square, square, 0, 0, TARGET, TARGET);

    // 컨텐츠 크롭(우리 앱 스크린샷의 흰 패널/QR 내부만 남기기)
    const contentCrop = (src: HTMLCanvasElement): HTMLCanvasElement => {
      try {
        const ctx2 = src.getContext('2d'); if (!ctx2) return src;
        const im = ctx2.getImageData(0, 0, src.width, src.height);
        const data = im.data;
        const isWhiteish = (i: number) => {
          const r = data[i], g = data[i+1], b = data[i+2];
          return r > 235 && g > 235 && b > 235 && Math.abs(r-g) < 15 && Math.abs(r-b) < 15; // 거의 흰색
        };
        const width = src.width, height = src.height;
        const colWhiteRatio: number[] = new Array(width).fill(0);
        const rowWhiteRatio: number[] = new Array(height).fill(0);
        for (let x = 0; x < width; x++) {
          let cnt = 0;
          for (let y = 0; y < height; y++) { const idx = (y*width + x)*4; if (isWhiteish(idx)) cnt++; }
          colWhiteRatio[x] = cnt / height;
        }
        for (let y = 0; y < height; y++) {
          let cnt = 0;
          for (let x = 0; x < width; x++) { const idx = (y*width + x)*4; if (isWhiteish(idx)) cnt++; }
          rowWhiteRatio[y] = cnt / width;
        }
        const needConsecutive = Math.max(3, Math.floor(Math.min(width, height) * 0.004));
        const findEdge = (arr: number[], fromStart = true, thr = 0.40) => {
          if (fromStart) {
            let streak = 0;
            for (let i=0;i<arr.length;i++) { streak = arr[i] > thr ? streak+1 : 0; if (streak >= needConsecutive) return Math.max(0, i-streak+1); }
            return 0;
          } else {
            let streak = 0;
            for (let i=arr.length-1;i>=0;i--) { streak = arr[i] > thr ? streak+1 : 0; if (streak >= needConsecutive) return Math.min(arr.length-1, i+streak-1); }
            return arr.length-1;
          }
        };
        let left = findEdge(colWhiteRatio, true, 0.35);
        let right = findEdge(colWhiteRatio, false, 0.35);
        let top = findEdge(rowWhiteRatio, true, 0.35);
        let bottom = findEdge(rowWhiteRatio, false, 0.35);
        // 폴백: 계산 실패 시 원본 유지
        if (right - left < 40 || bottom - top < 40) { left = 0; top = 0; right = width-1; bottom = height-1; }
        // 안전 마진 추가
        const margin = Math.round(Math.min(width, height) * 0.02);
        left = Math.max(0, left - margin);
        top = Math.max(0, top - margin);
        right = Math.min(width - 1, right + margin);
        bottom = Math.min(height - 1, bottom + margin);
        const w = Math.max(10, right - left + 1);
        const h = Math.max(10, bottom - top + 1);
        const out = document.createElement('canvas');
        out.width = 1000; out.height = 1000;
        const o = out.getContext('2d'); if (!o) return src;
        o.imageSmoothingEnabled = false;
        o.drawImage(src, left, top, w, h, 0, 0, out.width, out.height);
        console.log('[scanImageWithAll] contentCrop bbox:', { left, top, right, bottom, w, h });
        return out;
      } catch { return src; }
    };

    // 헬퍼: jsQR 한 번 시도
    const tryJsQR = (canvas: HTMLCanvasElement): string => {
      try {
        if (!jsQRLib) return '';
        const c = canvas.getContext('2d');
        if (!c) return '';
        const im = c.getImageData(0, 0, canvas.width, canvas.height);
        const out = jsQRLib(im.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
        return out?.data ? normalizeScannedText(String(out.data)) : '';
      } catch { return ''; }
    };

    // 헬퍼: ZXing 브라우저 리더 사용 (이미지 URL/엘리먼트 기반)
    const tryZXingFromCanvas = async (canvas: HTMLCanvasElement): Promise<string> => {
      try {
        if (!ZXingLib) return '';
        const dataUrl = canvas.toDataURL('image/png');
        const ReaderCtor = ZXingLib.BrowserQRCodeReader || ZXingLib.BrowserMultiFormatReader;
        if (!ReaderCtor) return '';
        const reader = new ReaderCtor();
        if (typeof reader.decodeFromImageUrl === 'function') {
          try {
            const res = await reader.decodeFromImageUrl(dataUrl);
            if (res?.text) return normalizeScannedText(String(res.text));
          } catch {}
        }
        if (typeof reader.decodeFromImage === 'function') {
          try {
            const imgElm = await loadImg(dataUrl);
            const res = await reader.decodeFromImage(imgElm as any);
            if (res?.text) return normalizeScannedText(String(res.text));
          } catch {}
        }
        // 픽셀 기반 디코딩 폴백 (RGBLuminanceSource → BinaryBitmap)
        try {
          if (ZXingLib.RGBLuminanceSource && ZXingLib.BinaryBitmap && ZXingLib.HybridBinarizer) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const source = new ZXingLib.RGBLuminanceSource(px.data, canvas.width, canvas.height);
              const bitmap = new ZXingLib.BinaryBitmap(new ZXingLib.HybridBinarizer(source));
              const MF = ZXingLib.MultiFormatReader || ZXingLib.BrowserMultiFormatReader || ZXingLib.BrowserQRCodeReader;
              if (MF) {
                const mfReader = new MF();
                try {
                  // TRY_HARDER 힌트로 탐지 강도를 높임
                  if (ZXingLib.DecodeHintType && mfReader.setHints) {
                    const hints = new Map();
                    hints.set(ZXingLib.DecodeHintType.TRY_HARDER, true);
                    try { hints.set(ZXingLib.DecodeHintType.PURE_BARCODE, false); } catch {}
                    mfReader.setHints(hints);
                  }
                } catch {}
                try {
                  const result = mfReader.decode(bitmap);
                  if (result?.text) return normalizeScannedText(String(result.text));
                } catch {}
              }
            }
          }
        } catch {}
      } catch {}
      return '';
    };

    // 헬퍼: zbar-wasm 디코딩 (마지막 강력 폴백)
    const tryZBar = async (canvas: HTMLCanvasElement): Promise<string> => {
      try {
        if (!ZBarWasm) return '';
        const mod = await ZBarWasm();
        const ctx = canvas.getContext('2d'); if (!ctx) return '';
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const symbols = mod.scanImageData(img);
        if (symbols && symbols.length) {
          const text = symbols[0].data || symbols[0].decoded || '';
          return text ? normalizeScannedText(String(text)) : '';
        }
      } catch {}
      return '';
    };

    // 헬퍼: 흑백/임계값 이진화 + padding
    const binarizeWithPadding = (src: HTMLCanvasElement, pad = 16, threshOverride?: number): HTMLCanvasElement => {
      const tmp = document.createElement('canvas');
      tmp.width = src.width; tmp.height = src.height;
      const tctx = tmp.getContext('2d');
      if (!tctx) return src;
      tctx.drawImage(src, 0, 0);
      const imgData = tctx.getImageData(0, 0, src.width, src.height);
      const data = imgData.data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        const y = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
        data[i] = data[i+1] = data[i+2] = y;
        sum += y;
      }
      const avg = sum / (data.length / 4);
      const thresh = typeof threshOverride === 'number' ? threshOverride : Math.max(96, Math.min(180, avg));
      for (let i = 0; i < data.length; i += 4) {
        const y = data[i];
        const v = y > thresh ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = v;
      }
      tctx.putImageData(imgData, 0, 0);

      const padded = document.createElement('canvas');
      padded.width = src.width + pad * 2; padded.height = src.height + pad * 2;
      const pctx = padded.getContext('2d');
      if (!pctx) return src;
      pctx.fillStyle = '#fff';
      pctx.fillRect(0,0,padded.width,padded.height);
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(tmp, pad, pad);
      return padded;
    };

    // 헬퍼: 샤프닝/블러/대비/감마
    const convolve = (src: HTMLCanvasElement, kernel: number[], dim: number, factor = 1, bias = 0): HTMLCanvasElement => {
      const out = document.createElement('canvas'); out.width = src.width; out.height = src.height; const octx = out.getContext('2d'); const sctx = src.getContext('2d'); if (!octx || !sctx) return src;
      const img = sctx.getImageData(0,0,src.width,src.height); const data = img.data; const w = src.width, h = src.height; const half = Math.floor(dim/2); const outData = new Uint8ClampedArray(data.length);
      for (let y=0;y<h;y++) {
        for (let x=0;x<w;x++) {
          let r=0,g=0,b=0,a=0, ki=0;
          for (let ky=-half; ky<=half; ky++) {
            for (let kx=-half; kx<=half; kx++) {
              const px = Math.min(w-1, Math.max(0, x+kx));
              const py = Math.min(h-1, Math.max(0, y+ky));
              const i = (py*w+px)*4; const kval = kernel[ki++];
              r += data[i]*kval; g += data[i+1]*kval; b += data[i+2]*kval; a += data[i+3]*kval;
            }
          }
          const o = (y*w+x)*4; outData[o] = Math.min(255, Math.max(0, factor*r + bias)); outData[o+1] = Math.min(255, Math.max(0, factor*g + bias)); outData[o+2] = Math.min(255, Math.max(0, factor*b + bias)); outData[o+3] = Math.min(255, Math.max(0, factor*a + bias));
        }
      }
      const outImg = new ImageData(outData, w, h); octx.putImageData(outImg,0,0); return out;
    };

    const get2d = (c: HTMLCanvasElement): CanvasRenderingContext2D | null => {
      // 일부 브라우저에서 readback 최적화 경고 대응
      return (c.getContext('2d', { willReadFrequently: true } as any) as any) || c.getContext('2d');
    };

    const adjustContrastGamma = (src: HTMLCanvasElement, contrast = 1.1, gamma = 1.0): HTMLCanvasElement => {
      const out = document.createElement('canvas'); out.width = src.width; out.height = src.height; const octx = out.getContext('2d'); const sctx = src.getContext('2d'); if (!octx || !sctx) return src;
      const img = sctx.getImageData(0,0,src.width,src.height); const d = img.data;
      const mid = 128; const invGamma = 1 / Math.max(0.01, gamma);
      for (let i=0;i<d.length;i+=4){
        for (let c=0;c<3;c++){
          let v = d[i+c]; v = mid + (v - mid) * contrast; v = Math.pow(v / 255, invGamma) * 255; d[i+c] = Math.max(0, Math.min(255, v));
        }
      }
      octx.putImageData(img,0,0); return out;
    };

    const withWhiteBorder = (src: HTMLCanvasElement, pad = 24): HTMLCanvasElement => {
      const out = document.createElement('canvas'); out.width = src.width + pad*2; out.height = src.height + pad*2; const o = get2d(out); if (!o) return src; o.fillStyle = '#fff'; (o as any).fillRect(0,0,out.width,out.height); (o as any).imageSmoothingEnabled=false; (o as any).drawImage(src, pad, pad); return out;
    };

    const maskCenterSquare = (src: HTMLCanvasElement, sizeRatio = 0.18, color = '#ffffff'): HTMLCanvasElement => {
      const out = document.createElement('canvas'); out.width = src.width; out.height = src.height; const o = get2d(out); if (!o) return src;
      (o as any).imageSmoothingEnabled = false; (o as any).drawImage(src, 0, 0);
      const size = Math.floor(Math.min(src.width, src.height) * sizeRatio);
      const x = Math.floor((src.width - size) / 2);
      const y = Math.floor((src.height - size) / 2);
      (o as any).fillStyle = color; (o as any).fillRect(x, y, size, size);
      return out;
    };

    // 중앙 로고가 있는 경우를 대비해 다양한 마스킹/패딩 변형으로 시도
    const tryMaskedAndPadded = async (canvas: HTMLCanvasElement): Promise<string> => {
      const ratios = [0.12, 0.16, 0.18, 0.22, 0.26, 0.30, 0.34, 0.36, 0.40];
      const colors = ['#ffffff', '#000000'];
      for (const r of ratios) {
        for (const col of colors) {
          const m = maskCenterSquare(canvas, r, col);
          let hit = await tryZXingFromCanvas(m); if (hit) return hit;
          hit = tryJsQR(m); if (hit) return hit;
          hit = await tryBarcodeDetector(m); if (hit) return hit;
          // 여유 quiet zone을 늘려 재시도
          const padded = withWhiteBorder(m, 24);
          hit = await tryZXingFromCanvas(padded); if (hit) return hit;
          hit = tryJsQR(padded); if (hit) return hit;
          hit = await tryBarcodeDetector(padded); if (hit) return hit;
        }
      }
      return '';
    };

    // 3) 원본/정사각/컨텐츠크롭 모두 시도: ZXing → jsQR → BarcodeDetector 순
    // 원본 캔버스 준비 (왜곡 없는 전체 프레임)
    const orig = document.createElement('canvas');
    orig.width = imgEl.naturalWidth || imgEl.width; orig.height = imgEl.naturalHeight || imgEl.height;
    const octx = orig.getContext('2d');
    if (octx) {
      octx.imageSmoothingEnabled = false;
      octx.drawImage(imgEl, 0, 0);
    }

    const tryBarcodeDetector = async (canvas: HTMLCanvasElement): Promise<string> => {
      try {
        if (!hasBarcodeDetector) return '';
        const det = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(canvas);
        const results = await det.detect(bitmap);
        if (results && results.length) {
          const txt = (results[0] as any).rawValue || '';
          if (txt) return normalizeScannedText(String(txt));
        }
      } catch {}
      return '';
    };

    const tight = contentCrop(base);
    const FAST_SCAN = ((): boolean => { try { return require('@/contexts/PreferencesContext'); } catch { return true; } })() ? true : true; // placeholder, will be replaced by context state at call site if needed
    const scales = FAST_SCAN ? [1.2, 1, 0.85] : [1.6, 1.4, 1.2, 1, 0.95, 0.85, 0.7, 0.55];
    for (const s of scales) {
      const sc1 = document.createElement('canvas');
      sc1.width = Math.max(64, Math.round(base.width * s));
      sc1.height = Math.max(64, Math.round(base.height * s));
      const sctx1 = sc1.getContext('2d'); if (!sctx1) continue;
      sctx1.imageSmoothingEnabled = false; sctx1.drawImage(base, 0, 0, sc1.width, sc1.height);
      // ZXing 1순위
      let hit = await tryZXingFromCanvas(sc1);
      if (hit) return hit;
      if (!hit) hit = await tryZBar(sc1);
      // jsQR
      hit = tryJsQR(sc1);
      if (hit) return hit;
      // BarcodeDetector
      hit = await tryBarcodeDetector(sc1);
      if (hit) return hit;
      // 중앙 로고 마스킹/패딩 변형 재시도
      hit = await tryMaskedAndPadded(sc1);
      if (hit) return hit;

      const sc2 = document.createElement('canvas');
      sc2.width = Math.max(64, Math.round(orig.width * s));
      sc2.height = Math.max(64, Math.round(orig.height * s));
      const sctx2 = sc2.getContext('2d'); if (!sctx2) continue;
      sctx2.imageSmoothingEnabled = false; sctx2.drawImage(orig, 0, 0, sc2.width, sc2.height);
      hit = await tryZXingFromCanvas(sc2);
      if (hit) return hit;
      if (!hit) hit = await tryZBar(sc2);
      hit = tryJsQR(sc2);
      if (hit) return hit;
      hit = await tryBarcodeDetector(sc2);
      if (hit) return hit;
      hit = await tryMaskedAndPadded(sc2);
      if (hit) return hit;

      const sc3 = document.createElement('canvas');
      sc3.width = Math.max(64, Math.round(tight.width * s));
      sc3.height = Math.max(64, Math.round(tight.height * s));
      const sctx3 = sc3.getContext('2d'); if (!sctx3) continue;
      sctx3.imageSmoothingEnabled = false; sctx3.drawImage(tight, 0, 0, sc3.width, sc3.height);
      hit = await tryZXingFromCanvas(sc3);
      if (hit) return hit;
      if (!hit) hit = await tryZBar(sc3);
      hit = tryJsQR(sc3);
      if (hit) return hit;
      hit = await tryBarcodeDetector(sc3);
      if (hit) return hit;
      hit = await tryMaskedAndPadded(sc3);
      if (hit) return hit;
    }

    // 3) 이진화 + padding에서 jsQR/ZXing/qrcode-decoder 순차 시도 (여러 threshold/pad)
    const pads = FAST_SCAN ? [12, 24] : [6, 8, 12, 16, 24, 32, 40, 48];
    const thresholds = FAST_SCAN ? [undefined, 120, 150] as Array<number | undefined> : [undefined, 90, 100, 115, 130, 150, 170, 190, 205, 210] as Array<number | undefined>;
    for (const pad of pads) {
      for (const th of thresholds) {
        let candidate = binarizeWithPadding(tight, pad, th);
        candidate = withWhiteBorder(candidate, 24);
        // 가벼운 샤프닝 -> 대비/감마 조정 -> 블러 순으로 후보 생성해가며 시도
        const kernels = {
          sharpen: [0,-1,0,-1,5,-1,0,-1,0],
          blur3: [1/9,1/9,1/9,1/9,1/9,1/9,1/9,1/9,1/9],
        } as any;
        const variants: HTMLCanvasElement[] = [candidate];
        // 중앙 로고 마스킹(여러 크기, 흰/검 모두 시도)
        ;[0.18, 0.22, 0.26, 0.30].forEach(r => { variants.push(maskCenterSquare(candidate, r, '#ffffff')); variants.push(maskCenterSquare(candidate, r, '#000000')); });
        variants.push(convolve(candidate, kernels.sharpen, 3));
        variants.push(adjustContrastGamma(candidate, 1.15, 0.95));
        variants.push(convolve(candidate, kernels.blur3, 3));
        for (const v of variants) {
          // jsQR
          // ZXing → jsQR
          const hitZX = await tryZXingFromCanvas(v);
          if (hitZX) return hitZX;
          const hit1 = tryJsQR(v);
          if (hit1) return hit1;
          // BarcodeDetector
          const hitBDv = await tryBarcodeDetector(v);
          if (hitBDv) return hitBDv;
        }
        // qrcode-decoder (마지막 폴백)
        try {
          if (QrDecoder) {
            const decoder = new QrDecoder();
            const dataUrl = candidate.toDataURL('image/png');
            const res: any = await decoder.decodeFromImage(undefined, dataUrl);
            if (res?.data) return normalizeScannedText(String(res.data));
          }
        } catch {}
        // BarcodeDetector
        const hitBD = await tryBarcodeDetector(candidate);
        if (hitBD) return hitBD;
      }
    }

    // 4) 중심이 아닌 위치를 위한 3x3 타일 스캔 (중첩 15% 오버랩)
    try {
      const tiles = FAST_SCAN ? 3 : 4; const overlap = FAST_SCAN ? 0.1 : 0.15;
      const tileSize = Math.floor(tight.width / tiles);
      for (let ty = 0; ty < tiles; ty++) {
        for (let tx = 0; tx < tiles; tx++) {
          const ox = Math.max(0, Math.floor(tx * tileSize - tileSize * overlap));
          const oy = Math.max(0, Math.floor(ty * tileSize - tileSize * overlap));
          const ow = Math.min(tight.width - ox, Math.floor(tileSize * (1 + overlap * 2)));
          const oh = Math.min(tight.height - oy, Math.floor(tileSize * (1 + overlap * 2)));
          const tile = document.createElement('canvas');
          tile.width = 640; tile.height = 640;
          const tctx = tile.getContext('2d');
          if (!tctx) continue;
          tctx.imageSmoothingEnabled = false;
          tctx.drawImage(tight, ox, oy, ow, oh, 0, 0, tile.width, tile.height);
          let hit = await tryZXingFromCanvas(tile);
          if (!hit) hit = await tryZBar(tile);
          if (!hit) hit = tryJsQR(tile) || tryJsQR(binarizeWithPadding(tile, 16));
          if (!hit) hit = await tryBarcodeDetector(tile);
          if (hit) return hit;
        }
      }
    } catch {}

    // 5) 회전 보정 시도 (90/180/270)
    try {
      const angles = [90, 180, 270, 8, -8, 4, -4, 2, -2];
      for (const deg of angles) {
        const rad = (deg * Math.PI) / 180;
        const rot = document.createElement('canvas');
        rot.width = tight.width; rot.height = tight.height;
        const rctx = rot.getContext('2d'); if (!rctx) continue;
        rctx.translate(rot.width / 2, rot.height / 2);
        rctx.rotate(rad);
        rctx.drawImage(tight, -tight.width / 2, -tight.height / 2);
        rctx.setTransform(1, 0, 0, 1, 0, 0);
        const hit = tryJsQR(rot) || tryJsQR(binarizeWithPadding(rot, 16)) || await tryBarcodeDetector(rot);
        if (hit) return hit;
      }
    } catch {}
  } catch {}
  console.log('[scanImageWithAll] no result');
  return null;
}

 type TabKey = 'assets' | 'send' | 'receive' | 'gift' | 'history' | 'orders';

export default function WalletScreen() {
  const { currentUser, accessToken } = useAuth();
  const { tab, coin, create } = useLocalSearchParams<{ tab?: string; coin?: string; create?: string }>();
  const { currency, language } = usePreferences();
  let wc: ReturnType<typeof useWalletConnect> | null = null;
  try { wc = useWalletConnect(); } catch {}
  
  // 전역 거래 스토어 사용
  const { getTransactions, getTransactionStats } = useTransactionStore();
  // zustand 거래 스토어에 기록하기 위한 add 함수 별도 참조
  const walletStore = useTransactionStore();
  
  // 대시보드와 동일한 잔액 데이터 사용
  const currentUserEmail = currentUser?.email || '';
  const baseBalances = getMockBalancesForUser(currentUserEmail);
  const cryptoOnlyBalances = baseBalances.filter(b => !['KRW', 'USD', 'JPY', 'CNY', 'EUR'].includes(b.symbol));
  const [realTimeBalances, setRealTimeBalances] = useState(cryptoOnlyBalances);

  // 코인 상세 모달 상태
  const [coinDetailModalVisible, setCoinDetailModalVisible] = useState(false);
  const [selectedCoinForDetail, setSelectedCoinForDetail] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [headBlock, setHeadBlock] = useState<number>(0);
  const [refreshingWallet, setRefreshingWallet] = useState(false);

  // 거래 내역을 기반으로 최종 잔액 계산
  const calculateFinalBalances = (initialBalances: Record<string, number>) => {
    const transactions = getTransactions();
    const finalBalances = { ...initialBalances };
    
    transactions.forEach(transaction => {
      if (transaction.type === 'swap') {
        // 새로운 스왑 거래 구조: symbol과 change 사용 (방어코드 포함)
        if (transaction.symbol && typeof transaction.change === 'number' && isFinite(transaction.change)) {
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) + transaction.change;
        }
        // 기존 스왑 거래 구조도 지원
        else if (transaction.fromToken && typeof transaction.fromAmount === 'number' && isFinite(transaction.fromAmount)) {
          finalBalances[transaction.fromToken] = (finalBalances[transaction.fromToken] || 0) - transaction.fromAmount;
        }
        if (transaction.toToken && typeof transaction.toAmount === 'number' && isFinite(transaction.toAmount)) {
          finalBalances[transaction.toToken] = (finalBalances[transaction.toToken] || 0) + transaction.toAmount;
        }
      } else if (transaction.type === 'reward' || transaction.type === 'daily_reward' || transaction.type === 'event_reward') {
        // 보상 거래: 해당 토큰 증가
        if (transaction.symbol && transaction.amount) {
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) + transaction.amount;
        }
      } else if (transaction.type === 'staking') {
        // 스테이킹 거래: 해당 토큰 차감
        if (transaction.symbol && transaction.amount) {
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) - transaction.amount;
        }
      } else if (transaction.type === 'transfer') {
        // 일반 입출금: change 필드가 있으면 그 값(+/-)을 누적, 없으면 타입으로 가늠
        const sym = transaction.symbol;
        if (sym) {
          if (typeof transaction.change === 'number' && isFinite(transaction.change)) {
            finalBalances[sym] = (finalBalances[sym] || 0) + (transaction.change as number);
          } else if (typeof transaction.amount === 'number' && isFinite(transaction.amount)) {
            // change가 없으면 amount를 그대로 더하거나 빼야 하지만
            // transfer 방향 정보를 알 수 없으므로 보수적으로 무시
            // (우리 앱에서 transfer는 항상 change를 세팅함)
          }
        }
      }
    });
    
    return finalBalances;
  };

  // 코인 클릭 핸들러
  const handleCoinPress = useCallback((coin: any) => {
    setSelectedCoinForDetail(coin);
    setCoinDetailModalVisible(true);
  }, []);

  // ===== 전송 사전 점검(가스/잔액) =====
  async function preflightTokenGasCheck(params: { to: string; symbol: string; amount: string }): Promise<{ ok: boolean; needEthWei?: bigint; haveEthWei?: bigint }> {
    try {
      const { to, symbol, amount } = params;
      if (symbol !== 'YOY') return { ok: true };
      const { ethers } = await import('ethers');
      const { getActiveChain } = await import('@/src/wallet/chains');
      const { getLocalWallet } = await import('@/src/wallet/wallet');
      const { default: Constants } = await import('expo-constants');
      const local = await getLocalWallet();
      if (!local) return { ok: true }; // 내장지갑이 아닐 때는 패스(연결지갑은 확인 불가)
      const active = getActiveChain();
      const provider = new ethers.JsonRpcProvider(active.rpcUrl, active.chainIdDec);
      const signer = local.wallet.connect(provider);
      // YOY 컨트랙트
      const addr = (() => {
        try { const extra = (Constants as any)?.expoConfig?.extra || {}; return extra.EXPO_PUBLIC_YOY_ERC20_ADDRESS as string; } catch { return undefined; }
      })() || (process as any)?.env?.EXPO_PUBLIC_YOY_ERC20_ADDRESS || '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701';
      const abi = ['function transfer(address to, uint256 value) public returns (bool)'];
      const c = new ethers.Contract(addr, abi, signer);
      const value = ethers.parseUnits(String(amount||'0'), 18);
      const fee = await provider.getFeeData();
      const gas = await c.transfer.estimateGas(params.to, value).catch(async () => BigInt(90000));
      const perGas = (fee.maxFeePerGas ?? fee.gasPrice ?? BigInt(0));
      // EIP-1559 수수료 없으면 conservative 가정
      const effPerGas = perGas && perGas > 0n ? perGas : BigInt(30_000_000_000); // 30 gwei 보정
      const needed = gas * effPerGas;
      const have = await provider.getBalance(local.address);
      if (have >= needed) return { ok: true, needEthWei: needed, haveEthWei: have };
      return { ok: false, needEthWei: needed, haveEthWei: have };
    } catch {
      return { ok: true };
    }
  }

  // 모달 닫기 핸들러
  const handleCloseModal = useCallback(() => {
    setCoinDetailModalVisible(false);
    setSelectedCoinForDetail(null);
  }, []);

  
  // 잔액을 영구적으로 저장하고 불러오기 (대시보드와 동일한 방식)
  useEffect(() => {
    const loadRealTimeBalances = async () => {
      if (!currentUserEmail) return;
      
      const storageKey = `user_balances_${currentUserEmail}`;
      
      try {
        const savedBalances = await AsyncStorage.getItem(storageKey);
        
        if (savedBalances) {
          // payments.tsx에서 저장된 userBalances를 dashboard 형식으로 변환
          const savedBalancesData = JSON.parse(savedBalances);
          console.log('Wallet - Parsed saved balances:', savedBalancesData);
          
          // 거래 내역을 기반으로 최종 잔액 계산
          const finalBalances = calculateFinalBalances(savedBalancesData);
          console.log('Wallet - Final balances after transactions:', finalBalances);
          console.log('Wallet - YOY balance:', finalBalances.YOY);
          
          const convertedBalancesAll = Object.entries(finalBalances).map(([symbol, amount]) => {
            const baseBalance = baseBalances.find(b => b.symbol === symbol);
            if (baseBalance) {
              return {
                ...baseBalance,
                amount: amount as number,
                valueUSD: (amount as number) * (baseBalance.valueUSD / baseBalance.amount)
              };
            }
            return {
              symbol,
              amount: amount as number,
              valueUSD: 0,
              name: symbol,
              change24h: 0,
              change24hPct: 0
            };
          });
          const email = (currentUser as any)?.email || '';
          const isAdmin = email === 'admin@yooyland.com';
          const yoyOnly = email === 'jch4389@gmail.com' || email === 'landyooy@gmail.com';
          // 운영 테스트 계정(yoyOnly)에서도 ETH는 반드시 표시되도록 허용
          const convertedBalances = isAdmin
            ? convertedBalancesAll
            : (yoyOnly
              ? convertedBalancesAll.filter(x => x.symbol === 'YOY' || x.symbol === 'ETH')
              : convertedBalancesAll);
          setRealTimeBalances(convertedBalances);
        } else {
          setRealTimeBalances(cryptoOnlyBalances);
        }
      } catch (error) {
        console.error('Error loading wallet balances:', error);
        setRealTimeBalances(cryptoOnlyBalances);
      }
    };
    
    loadRealTimeBalances();
  }, [currentUserEmail, baseBalances]);

  // 기프트 목록 구독
  useEffect(() => {
    try {
      const ref = collection(firestore, 'claim_vouchers');
      const q = query(ref, where('createdByEmail', '==', currentUserEmail), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const items: ClaimVoucher[] = [];
        snap.forEach((d)=> items.push(d.data() as ClaimVoucher));
        setGiftList(items);
      });
      // 수령 알림 구독
      const nref = collection(firestore, 'claim_notifications');
      const nq = query(nref, where('createdByEmail', '==', currentUserEmail));
      const unsubN = onSnapshot(nq, async (snap) => {
        snap.docChanges().forEach(async (ch) => {
          try {
            const data: any = ch.doc.data();
            if (ch.type === 'added' && data?.amount && data?.address) {
              Alert.alert(language==='en'?'Gift claimed':'기프트 수령', `${data.amount} ${'YOY'} / ${String(data.address).slice(0,8)}...`);
              // 일회 알림: 삭제
              try { await deleteDoc(fsDoc(firestore, 'claim_notifications', ch.doc.id)); } catch {}
            }
          } catch {}
        });
      });
      return () => { try { unsub(); } catch {}; try { unsubN(); } catch {}; };
    } catch {}
  }, [currentUserEmail]);

  // 주기적으로 잔액 새로고침 (5초마다)
  useEffect(() => {
    const loadRealTimeBalances = async () => {
      if (!currentUserEmail) return;
      
      const storageKey = `user_balances_${currentUserEmail}`;
      
      try {
        const savedBalances = await AsyncStorage.getItem(storageKey);
        
        if (savedBalances) {
          // payments.tsx에서 저장된 userBalances를 dashboard 형식으로 변환
          const savedBalancesData = JSON.parse(savedBalances);
          
          // 거래 내역을 기반으로 최종 잔액 계산
          const finalBalances = calculateFinalBalances(savedBalancesData);
          console.log('Wallet - YOY balance (periodic refresh):', finalBalances.YOY);
          
          const convertedBalances = Object.entries(finalBalances).map(([symbol, amount]) => {
            const baseBalance = baseBalances.find(b => b.symbol === symbol);
            if (baseBalance) {
              return {
                ...baseBalance,
                amount: amount as number,
                valueUSD: (amount as number) * (baseBalance.valueUSD / baseBalance.amount)
              };
            }
            return {
              symbol,
              amount: amount as number,
              valueUSD: 0,
              name: symbol,
              change24h: 0,
              change24hPct: 0
            };
          });
          setRealTimeBalances(convertedBalances);
        }
      } catch (error) {
        console.error('Error refreshing wallet balances:', error);
      }
    };

    const interval = setInterval(loadRealTimeBalances, 5000);
    return () => clearInterval(interval);
  }, [currentUserEmail, baseBalances]);
  
  // EVM 온체인 잔액 동기화(ETH/YOY) - 15초 주기
  useEffect(() => {
    let cancelled = false;
    const syncOnChain = async () => {
      try {
        if (!currentUserEmail) return;
        const { getLocalWallet } = await import('@/src/wallet/wallet');
        const { getActiveChain } = await import('@/src/wallet/chains');
        const { default: Constants } = await import('expo-constants');
        const { ethers } = await import('ethers');
        // WalletConnect 연결 주소 우선
        let wcAddr: string | null = null;
        try { wcAddr = wc?.state?.connected ? (wc?.state?.address || null) : null; } catch {}
        const local = await getLocalWallet().catch(()=>null);
        const addr = wcAddr || local?.address || getWalletBySymbol('YOY')?.address;
        if (!addr) return;
        const active = getActiveChain();
        const provider = new ethers.JsonRpcProvider(active.rpcUrl, active.chainIdDec);
        // ETH
        const ethWei = await provider.getBalance(addr);
        const eth = Number(ethers.formatEther(ethWei));
        // YOY (ERC-20)
        const yoyAddr = (() => {
          try { const extra = (Constants as any)?.expoConfig?.extra || {}; return extra.EXPO_PUBLIC_YOY_ERC20_ADDRESS as string; } catch { return undefined; }
        })() || (process as any)?.env?.EXPO_PUBLIC_YOY_ERC20_ADDRESS || null;
        let yoy = 0;
        if (yoyAddr) {
          try {
            const abi = ['function balanceOf(address) view returns (uint256)'];
            const erc = new ethers.Contract(yoyAddr, abi, provider);
            const bal: bigint = await erc.balanceOf(addr);
            yoy = Number(bal) / 1e18;
          } catch {}
        }
        if (cancelled) return;
        // 저장소 갱신
        const storageKey = `user_balances_${currentUserEmail}`;
        let parsed: Record<string, number> = {};
        try {
          const saved = await AsyncStorage.getItem(storageKey);
          parsed = saved ? JSON.parse(saved) : {};
        } catch {}
        parsed.ETH = eth;
        if (yoyAddr) parsed.YOY = Math.max(parsed.YOY || 0, yoy);
        await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
        // 화면 반영
        try {
          const finalBalances = calculateFinalBalances(parsed);
          const convertedBalancesAll = Object.entries(finalBalances).map(([symbol, amount]) => {
            const baseBalance = baseBalances.find(b => b.symbol === symbol);
            if (baseBalance) {
              return {
                ...baseBalance,
                amount: amount as number,
                valueUSD: (amount as number) * (baseBalance.valueUSD / baseBalance.amount)
              };
            }
            return {
              symbol,
              amount: amount as number,
              valueUSD: 0,
              name: symbol,
              change24h: 0,
              change24hPct: 0
            };
          });
          const email = (currentUser as any)?.email || '';
          const isAdmin = email === 'admin@yooyland.com';
          const yoyOnly = email === 'jch4389@gmail.com' || email === 'landyooy@gmail.com';
          const convertedBalances = isAdmin
            ? convertedBalancesAll
            : (yoyOnly
              ? convertedBalancesAll.filter(x => x.symbol === 'YOY' || x.symbol === 'ETH')
              : convertedBalancesAll);
          if (!cancelled) setRealTimeBalances(convertedBalances);
        } catch {}
      } catch {}
    };
    // 즉시 1회 + 주기 실행
    void syncOnChain();
    const interval = setInterval(syncOnChain, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUserEmail, baseBalances]);
  
  // 실제 가격 데이터 상태
  const [upbitMarkets, setUpbitMarkets] = useState<{
    KRW: UpbitTicker[];
    USDT: UpbitTicker[];
    BTC: UpbitTicker[];
    ETH: any[];
  }>({ KRW: [], USDT: [], BTC: [], ETH: [] });
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  // 전송 버튼 에러 상태
  const [sendErrorText, setSendErrorText] = useState<string | null>(null);
  // 기프트 탭 상태
  const [giftMode, setGiftMode] = useState<'per_claim'|'total'>('per_claim');
  const [giftPerClaimAmount, setGiftPerClaimAmount] = useState<string>('');
  const [giftClaimLimit, setGiftClaimLimit] = useState<string>('5');
  const [giftTotalAmount, setGiftTotalAmount] = useState<string>('');
  const [giftTotalPolicy, setGiftTotalPolicy] = useState<'all'|'equal'>('all');
  const [giftTotalPeople, setGiftTotalPeople] = useState<string>('5');
  // 기본 만료일: 오늘 기준 1년 후 (YYYY-MM-DD)
  const defaultGiftExpiry = (() => {
    try {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch { return ''; }
  })();
  const [giftExpiresISO, setGiftExpiresISO] = useState<string>(defaultGiftExpiry); // YYYY-MM-DD
  const [giftCreating, setGiftCreating] = useState(false);
  const [giftList, setGiftList] = useState<ClaimVoucher[]>([]);

  // QR 타입 감지: 기프트(청구) 여부
  const isGiftPayload = (payload: string | null | undefined): boolean => {
    try {
      if (!payload) return false;
      return String(payload).startsWith('yooy://claim');
    } catch { return false; }
  };

  // 숫자 입력(천단위 구분자 등) 정규화
  const parseNumericInput = (value: string | number | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    const s = String(value).replace(/,/g, '').trim();
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  
  // 중앙화된 가격 시스템 사용 (EXCHANGE 페이지와 동일한 방식)
  useEffect(() => {
    const loadPrices = async () => {
      try {
        console.log('🔄 지갑 실시간 가격 업데이트 시작...');
        await updateRealTimePrices();
        
        const [markets, rates] = await Promise.all([
          getAllUpbitMarkets(),
          getExchangeRates()
        ]);
        setUpbitMarkets(markets);
        setExchangeRates(rates);
        setPricesLoaded(true);
        
        console.log('✅ 지갑 가격 업데이트 완료');
      } catch (error) {
        console.error('❌ 지갑 가격 업데이트 실패:', error);
        setPricesLoaded(true);
        // 사용자에게 네트워크 오류 알림
        Alert.alert(
          language === 'en' ? 'Network Error' : '네트워크 오류',
          language === 'en' ? 'Failed to load market data. Please check your internet connection.' : '시장 데이터를 불러오는데 실패했습니다. 인터넷 연결을 확인해주세요.'
        );
      }
    };
    loadPrices();
    // 1분마다 가격 업데이트
    const interval = setInterval(loadPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  // YOY 입금 모니터 연결 (Alchemy/Infura WS → eth-monitor 서버)
  useEffect(() => {
    let ws: WebSocket | null = null;
    (async () => {
        try {
          const { getEthMonitorHttp, getEthMonitorWs } = await import('@/lib/config');
        const httpUrl = await getEthMonitorHttp();
        const wsUrl = await getEthMonitorWs();
        // EVM 지갑(ETH/YOY 공용) 주소 기준으로 구독 - WalletConnect 주소 우선
        const { getLocalWallet } = await import('@/src/wallet/wallet');
        const local = await getLocalWallet().catch(()=>null);
        const wcAddr = (() => { try { return wc?.state?.connected ? (wc?.state?.address || null) : null; } catch { return null; } })();
        const addr = wcAddr || local?.address || getWalletBySymbol('YOY')?.address;
        if (!addr) return;
        // Subscribe for YOY + common ERC-20s + custom tokens + native
        try { await fetch(`${httpUrl}/subscribe`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ address: addr }) }); } catch {}
        try {
          const { getEthChainIdHex } = await import('@/lib/config');
          const chainId = await getEthChainIdHex();
            const { Erc20Registry } = await import('@/lib/erc20Registry');
            const reg = (Erc20Registry as any)[String(chainId)?.toLowerCase()] || (Erc20Registry as any)[String(chainId)];
            if (reg) {
              for (const sym of Object.keys(reg)) {
                const tokenAddr = reg[sym]?.address;
                if (tokenAddr) {
                  await fetch(`${httpUrl}/subscribe`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ address: addr, token: tokenAddr }) });
                }
              }
            }
          // include admin custom tokens
          const { loadCustomCoins } = await import('@/lib/customCoins');
          const custom = await loadCustomCoins();
          for (const c of custom) {
            if (c.contract) {
              await fetch(`${httpUrl}/subscribe`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ address: addr, token: c.contract }) });
            }
          }
        } catch {}
        ws = new WebSocket(wsUrl);
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => setWsConnected(false);
        ws.onerror = () => {};
        ws.onmessage = async (ev) => {
          try {
            const data = JSON.parse((ev as any).data);
            if (data?.type === 'block') {
              if (typeof data.blockNumber === 'number') setHeadBlock(data.blockNumber);
              return;
            }
            if (data?.type === 'native_transfer' && String(data.to).toLowerCase() === String(addr).toLowerCase()) {
              const wei = BigInt(data.amount || '0');
              const human = Number(wei) / 1e18;
              const transactionData = {
                id: `rx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                type: 'receive' as const,
                from: data.from,
                to: addr,
                amount: human,
                currency: 'ETH',
                description: `Deposit ${human} ETH`,
                timestamp: new Date().toISOString(),
                status: 'completed' as const,
                hash: data.txHash,
                network: 'Ethereum' as const,
                blockTimestamp: new Date().toISOString(),
                blockNumber: data.blockNumber || undefined,
              };
              try { await addTransaction(transactionData as any); } catch {}
              try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol:'ETH', amount: human, change: human, description: transactionData.description, transactionHash: transactionData.hash, source:'monitor' } as any); } catch {}
              try { Alert.alert(language==='en'?'Deposit detected':'입금 감지', `${human} ETH`); } catch {}
              return;
            }
            if (data?.type === 'erc20_transfer' && String(data.to).toLowerCase() === String(addr).toLowerCase()) {
              const value = BigInt(data.amount || '0');
              const decimals = 18n;
              const human = Number(value) / Number(10n ** decimals);
              const transactionData = {
                id: `rx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                type: 'receive' as const,
                from: data.from,
                to: addr,
                amount: human,
                currency: 'YOY',
                description: `Deposit ${human} YOY`,
                timestamp: new Date().toISOString(),
                status: 'completed' as const,
                hash: data.txHash,
                network: 'Ethereum' as const,
                blockTimestamp: new Date().toISOString(),
                blockNumber: typeof data.blockNumber === 'number' ? data.blockNumber : undefined,
              };
              try { await addTransaction(transactionData as any); } catch {}
              try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol:'YOY', amount: human, change: human, description: transactionData.description, transactionHash: transactionData.hash, source:'monitor' } as any); } catch {}
              try { Alert.alert(language==='en'?'Deposit detected':'입금 감지', `${human} YOY`); } catch {}
            }
          } catch {}
        };
      } catch {}
    })();
    return () => { try { ws?.close(); } catch {} };
  }, []);
  
  // 정확한 코인 가격 가져오기 함수 (KRW 기준) - EXCHANGE 페이지와 동일한 방식
  const getCoinPriceKRW = (symbol: string): number => {
    if (!pricesLoaded) {
      // 가격이 로드되지 않았을 때는 기본값 사용
      const fallbackPrices: { [key: string]: number } = {
        'YOY': 500,
        'BTC': 45000000,
        'ETH': 3000000,
        'USDT': 1300,
        'USDC': 1300,
      };
      return fallbackPrices[symbol] || 0;
    }
    
    // 중앙화된 가격 시스템에서 KRW 가격 가져오기
    return getCoinPriceByCurrency(symbol, 'KRW');
  };
  
  // 사용자 설정 화폐로 변환된 가격 가져오기
  const getCoinPrice = (symbol: string): number => {
    if (!pricesLoaded || !exchangeRates) {
      // 가격이 로드되지 않았을 때는 기본값 사용
      const fallbackPrices: { [key: string]: number } = {
        'YOY': 0.5,
        'BTC': 45000,
        'ETH': 3000,
        'USDT': 1,
        'USDC': 1,
      };
      return fallbackPrices[symbol] || 0;
    }
    
    const krwPrice = getCoinPriceKRW(symbol);
    
    if (krwPrice === 0) {
      return 0;
    }
    
    // KRW를 사용자 설정 화폐로 변환
    let convertedPrice: number;
    switch (currency) {
      case 'USD':
        convertedPrice = krwPrice / exchangeRates.KRW;
        break;
      case 'KRW':
        convertedPrice = krwPrice;
        break;
      case 'EUR':
        convertedPrice = (krwPrice / exchangeRates.KRW) * exchangeRates.EUR;
        break;
      case 'JPY':
        convertedPrice = (krwPrice / exchangeRates.KRW) * exchangeRates.JPY;
        break;
      case 'CNY':
        convertedPrice = (krwPrice / exchangeRates.KRW) * exchangeRates.CNY;
        break;
      default:
        convertedPrice = krwPrice / exchangeRates.KRW; // USD 기본값
    }
    
    return convertedPrice;
  };
  
  // 금액을 수량으로 변환하는 함수 (정확한 계산, 반올림 없음)
  const convertAmountToQuantity = (amount: number, symbol: string): number => {
    if (!pricesLoaded) {
      // 가격이 로드되지 않았을 때는 기본값 사용
      const fallbackPrices: { [key: string]: number } = {
        'YOY': 0.5,
        'BTC': 45000,
        'ETH': 3000,
        'USDT': 1,
        'USDC': 1,
      };
      const fallbackPrice = fallbackPrices[symbol] || 1;
      const quantity = amount / fallbackPrice;
      // 정확한 계산, 반올림 없음
      return quantity;
    }
    
    const price = getCoinPrice(symbol);
    if (price === 0) {
      return 0;
    }
    
    const quantity = amount / price;
    // 정확한 계산, 반올림 없음 - JavaScript의 부동소수점 정밀도 유지
    return quantity;
  };
  
  // 수량을 금액으로 변환하는 함수 (정확한 계산, 반올림 없음)
  const convertQuantityToAmount = (quantity: number, symbol: string): number => {
    if (!pricesLoaded) {
      // 가격이 로드되지 않았을 때는 기본값 사용
      const fallbackPrices: { [key: string]: number } = {
        'YOY': 0.5,
        'BTC': 45000,
        'ETH': 3000,
        'USDT': 1,
        'USDC': 1,
      };
      const fallbackPrice = fallbackPrices[symbol] || 1;
      const amount = quantity * fallbackPrice;
      return amount;
    }
    
    const price = getCoinPrice(symbol);
    
    if (price === 0) {
      return 0;
    }
    
    const amount = quantity * price;
    // 정확한 계산, 반올림 없음 - JavaScript의 부동소수점 정밀도 유지
    return amount;
  };
  const { hasWallet, getWalletBySymbol, createWallet, deleteAllWallets, deleteWallet } = useWallet();
  const { addTransaction } = useTransaction();
  const [recvAddress, setRecvAddress] = useState('');
  const [sendAddress, setSendAddress] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [hasCamPerm, setHasCamPerm] = useState<boolean | null>(null);
  const [recvSelectedSymbol, setRecvSelectedSymbol] = useState('YOY');
  // 보내기 탭의 선택 코인은 상단 훅/이펙트에서 참조하므로 여기에서 먼저 초기화한다
  const [sendSelectedSymbol, setSendSelectedSymbol] = useState('YOY');
  const [recvInput, setRecvInput] = useState('');
  const [recvAmountType, setRecvAmountType] = useState<'quantity' | 'amount'>('quantity'); // 수량/금액 구분
  const scanLineY = useState(new Animated.Value(0))[0];
  // 웹 카메라 스캔용 ref
  const videoRef = useRef<any>(null);
  const webCanvasRef = useRef<any>(null);
  const webRafRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  // 간단한 거부 알림 시뮬레이터
  function sendRejectionNotification(payload: { toAddress: string; symbol: string; amount: string }) {
    try {
      // TODO: 서버/푸시 연동 지점. 현재는 콘솔 로그로 시뮬레이션
    } catch {}
  }
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [symbol, setSymbol] = useState('YOY');
  const [rates, setRates] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const total = useMemo(() => realTimeBalances.reduce((s, b) => s + b.valueUSD, 0), [realTimeBalances]);
  
  // Load username on component mount
  useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
        if (info) {
          try {
            const parsedInfo = JSON.parse(info);
            setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          } catch {
            setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          }
        } else {
          setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
        }
      }
    })();
  }, [currentUser?.uid]);
  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [orderFilter, setOrderFilter] = useState<'all' | 'buy' | 'sell'>('all');
  
  // 주문 관련 상태
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [orderSymbol, setOrderSymbol] = useState('BTC/KRW');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderQuantity, setOrderQuantity] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [showOrderReceiptModal, setShowOrderReceiptModal] = useState(false);
  
  // URL 파라미터로 전달된 탭 설정
  useEffect(() => {
    if (tab && ['assets', 'send', 'receive', 'gift', 'history'].includes(tab)) {
      setActiveTab(tab as TabKey);
    }
  }, [tab]);

  // Wallet 페이지로 이동하는 함수
  const handleNavigateToWallet = useCallback((tab: 'send' | 'receive', coinSymbol: string) => {
    // 지갑이 있는 코인인지 확인 (YOY, USDT, USDC, BTC, ETH 등)
    const supportedCoins = ['YOY', 'USDT', 'USDC', 'BTC', 'ETH'];
    
    if (supportedCoins.includes(coinSymbol)) {
      // 현재 Wallet 페이지에서 해당 탭과 코인 선택
      setActiveTab(tab);
      // 코인 선택 로직 추가 (필요시)
    } else {
      // 지갑이 없는 코인의 경우 Wallet 페이지로 이동 (지갑 생성 기능은 Wallet 페이지에서 처리)
      router.push(`/(tabs)/wallet?tab=${tab}&coin=${coinSymbol}&create=true`);
    }
  }, []);

  // 마켓 페이지로 이동하는 함수
  const handleNavigateToMarket = useCallback(async (coinSymbol: string) => {
    try {
      // 먼저 KRW 마켓이 있는지 확인
      const krwMarketSymbol = coinSymbol === 'YOY' ? 'KRW-YOY' : `KRW-${coinSymbol}`;
      
      // Upbit 마켓 목록을 가져와서 해당 마켓이 존재하는지 확인
      const markets = await getAllUpbitMarkets();
      const allMarkets = [...markets.KRW, ...markets.USDT, ...markets.BTC, ...markets.ETH];
      const availableMarkets = allMarkets.filter((market: any) => 
        market.market.includes(coinSymbol) || market.market.includes(krwMarketSymbol)
      );
      
      if (availableMarkets.length > 0) {
        // KRW 마켓이 있으면 KRW 마켓으로, 없으면 첫 번째 사용 가능한 마켓으로 이동
        const targetMarket = availableMarkets.find((market: any) => market.market.startsWith('KRW-')) || availableMarkets[0];
        router.push(`/market/${targetMarket.market}?tab=주문`);
      } else {
        // 마켓이 전혀 없는 경우 기본 KRW 마켓으로 이동
        router.push(`/market/${krwMarketSymbol}?tab=주문`);
      }
    } catch (error) {
      console.error('마켓 정보 조회 오류:', error);
      // 오류 발생 시 기본 KRW 마켓으로 이동
      const marketSymbol = coinSymbol === 'YOY' ? 'KRW-YOY' : `KRW-${coinSymbol}`;
      router.push(`/market/${marketSymbol}?tab=정보`);
    }
  }, []);
  const { transactions, loading: txLoading, updateTransactionMemo } = useTransaction();
  const [memoEditingId, setMemoEditingId] = useState<string|null>(null);
  const [txDetail, setTxDetail] = useState<any|null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (VisionCamera) {
          const camStatus = await VisionCamera.requestCameraPermission();
          setHasCamPerm(camStatus === 'authorized');
        } else {
          // VisionCamera가 없을 때는 Expo Camera 권한으로 대체
          try {
            if (ExpoCamera?.requestCameraPermissionsAsync) {
              const perm = await ExpoCamera.requestCameraPermissionsAsync();
              setHasCamPerm(perm.status === 'granted');
        } else {
          setHasCamPerm(false);
            }
          } catch {
            setHasCamPerm(false);
          }
        }
      } catch {
        setHasCamPerm(false);
      }
    })();
  }, []);

  // 스캔 라인 애니메이션 루프
  useEffect(() => {
    if (!scanOpen) return;
    const loop = () => {
      scanLineY.setValue(0);
      Animated.timing(scanLineY, { toValue: 0.6 *  (/* container height fraction */  (1) ), duration: 1600, useNativeDriver: true }).start(() => loop());
    };
    loop();
    return () => scanLineY.stopAnimation();
  }, [scanOpen, scanLineY]);

  // 웹: 카메라 스트림 열고 프레임 단위로 QR 스캔
  useEffect(() => {
    if (!scanOpen) {
      try { if (webRafRef.current) cancelAnimationFrame(webRafRef.current); } catch {}
      try { const s = webStreamRef.current; if (s) { s.getTracks?.().forEach((t:any)=>t.stop?.()); } } catch {}
      webStreamRef.current = null;
      return;
    }
      if ((Platform as any).OS !== 'web') return;
    if (VisionCamera) return; // 네이티브 카메라가 있으면 그쪽을 사용
    let cancelled = false;
    (async () => {
      try {
        const media = await (navigator as any)?.mediaDevices?.getUserMedia?.({ video: { facingMode: 'environment' }, audio: false });
        if (!media) return;
        if (cancelled) { media.getTracks?.().forEach((t:any)=>t.stop?.()); return; }
        webStreamRef.current = media;
        const v: any = videoRef.current;
        if (v) {
          try { v.srcObject = media; } catch { v.srcObject = (media as any); }
          try { await v.play?.(); } catch {}
        }
        await ensureJsQRLoaded();
        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;
          const vid: any = videoRef.current;
          const w = vid.videoWidth || 0, h = vid.videoHeight || 0;
          if (w > 0 && h > 0) {
            const canvas: HTMLCanvasElement = webCanvasRef.current || document.createElement('canvas');
            webCanvasRef.current = canvas;
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(vid, 0, 0, w, h);
              let hit: string = '';
              // BarcodeDetector 우선
              if (hasBarcodeDetector) {
                try {
                  const det = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
                  const results = await det.detect(canvas as any);
                  const txt = results?.[0]?.rawValue || results?.[0]?.raw || results?.[0]?.data;
                  if (txt) hit = normalizeScannedText(String(txt));
                } catch {}
              }
              // jsQR 보조
              if (!hit && jsQRLib) {
                try {
                  const im = ctx.getImageData(0, 0, w, h);
                  const qr = jsQRLib(im.data, w, h, { inversionAttempts: 'attemptBoth' });
                  if (qr?.data) hit = normalizeScannedText(String(qr.data));
                } catch {}
              }
              if (hit) {
                try {
                  const { parseClaimUri } = await import('@/lib/claims');
                  const claim = parseClaimUri(hit);
                  if (claim?.id) {
                    setScanOpen(false);
                    try {
                      const { getVoucher, claimVoucher } = await import('@/lib/claims');
                      const voucher = await getVoucher(claim.id);
                      if (!voucher) {
                        Alert.alert(language==='en'?'Invalid QR':'유효하지 않은 QR', language==='en'?'Voucher not found.':'바우처를 찾을 수 없습니다.');
                        return;
                      }
                      const sym = voucher.symbol || 'YOY';
                      const recvAddr = getWalletBySymbol(sym)?.address || recvAddress || '';
                      if (!recvAddr) {
                        Alert.alert(language==='en'?'No wallet address':'지갑 주소 없음', language==='en'?'Create wallet first.':'먼저 해당 코인 지갑을 생성하세요.');
                        return;
                      }
                      const previewAmt = voucher.mode === 'per_claim'
                        ? Math.max(0, Number(voucher.perClaimAmount || 0))
                        : Math.max(0, Number(voucher.remainingAmount || voucher.totalAmount || 0));
                      Alert.alert(
                        language==='en'?'Event voucher':'이벤트 수령',
                        language==='en'
                          ? `Receive ${previewAmt} ${sym} to:\n${recvAddr.slice(0,8)}...${recvAddr.slice(-6)}`
                          : `${sym} ${previewAmt} 수령합니다.\n받을 주소:\n${recvAddr.slice(0,8)}...${recvAddr.slice(-6)}`,
                        [
                          { text: language==='en'?'Cancel':'취소' },
                          { text: language==='en'?'Event':'수령', onPress: async () => {
                            const res = await claimVoucher({ id: voucher.id, recipientAddress: recvAddr, recipientEmail: currentUserEmail });
                            if ('error' in res) {
                              const msg = res.error;
                              Alert.alert(language==='en'?'Event failed':'수령 실패', String(msg));
                              return;
                            }
                            const gained = res.amount || previewAmt;
                            try {
                              const storageKey = `user_balances_${currentUserEmail}`;
                              const saved = await AsyncStorage.getItem(storageKey);
                              const parsed = saved ? JSON.parse(saved) : {};
                              parsed[sym] = (parsed[sym] || 0) + gained;
                              await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
                            } catch {}
                            try {
                              const transactionData = {
                                id: `rx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                                type: 'receive' as const,
                                from: `voucher:${voucher.id}`,
                                to: recvAddr,
                                amount: gained,
                                currency: sym,
                                description: language==='en'?'Event receive':'이벤트 수령',
                                timestamp: new Date().toISOString(),
                                status: 'completed' as const,
                                hash: `voucher_${voucher.id}`,
                                network: sym === 'YOY' ? 'YOY' as const : 'Ethereum' as const,
                                blockTimestamp: new Date().toISOString(),
                              };
                              await addTransaction(transactionData as any);
                              try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol: sym, amount: gained, change: gained, description: transactionData.description, transactionHash: transactionData.hash, source:'voucher' } as any); } catch {}
                            } catch {}
                            Alert.alert(language==='en'?'Received':'수령 완료', `${gained} ${sym}`);
                          }}
                        ]
                      );
                    } catch (e) {
                      Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
                    }
                    return;
                  }
                } catch {}
                const parsed = parsePayUri(hit);
                if (parsed) {
                  setSendToAddress(parsed.addr);
                  setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                  setSendInput(parsed.amt || '');
                  setIsRequest(true);
                  setOriginalUrlData(parsed);
                } else {
                  setSendToAddress(hit);
                  setIsRequest(false);
                  setOriginalUrlData(null);
                }
                setScanOpen(false);
                return;
              }
            }
          }
          webRafRef.current = requestAnimationFrame(scanFrame);
        };
        webRafRef.current = requestAnimationFrame(scanFrame);
      } catch (e) {
        // 웹 카메라 열기 실패 시 noop
      }
    })();
    return () => {
      cancelled = true;
      try { if (webRafRef.current) cancelAnimationFrame(webRafRef.current); } catch {}
      try { const s = webStreamRef.current; if (s) { s.getTracks?.().forEach((t:any)=>t.stop?.()); } } catch {}
      webStreamRef.current = null;
    };
  }, [scanOpen, sendSelectedSymbol]);

  // Receive 탭: 코인 선택 시 내 지갑 주소 자동 입력
  useEffect(() => {
    try {
      const w = getWalletBySymbol?.(recvSelectedSymbol);
      setRecvAddress(w?.address || '');
    } catch {}
  }, [recvSelectedSymbol, getWalletBySymbol]);

  // 공통 유틸: 텍스트에서 yooy://pay URL 추출
  const extractYooyPayUrl = useCallback((text?: string | null) => {
    if (!text) return null;
    try {
      const m = String(text).match(/yooy:\/\/pay\?[^ \n\r\n\t"]+/i);
      return m ? m[0] : null;
    } catch {
      return null;
    }
  }, []);

  // QR 저장/공유 헬퍼
  const qrRef = useRef<any>(null);
  // 저장용 오프스크린 전용 뷰(제목+프레임+QR) - 기기별 캡처 안정화를 위해 사용
  const qrExportRef = useRef<View|null>(null);
  const qrShotBoxRef = useRef<View|null>(null);
  
  // QR 공유 함수
  const handleShareQr = async () => {
    try {
      const addr = getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '';
      // 금액 모드인 경우 수량으로 변환
      const amountForUrl = recvAmountType === 'amount' 
        ? convertAmountToQuantity(parseFloat(recvInput) || 0, recvSelectedSymbol).toString()
        : recvInput;
      const payload = buildPayUri(addr, recvSelectedSymbol, amountForUrl);
      if (Platform.OS !== 'web') {
        // 네이티브 공유시트 (카카오톡 등 앱 목록)
        try {
          await Share.share({ message: payload });
          return;
        } catch (e) {
          // 아래 폴백 시도
        }
      }
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({
          title: '',
          text: payload,
        });
        return;
      }
      // 최종 폴백: 텍스트 복사
      await (navigator as any)?.clipboard?.writeText?.(payload);
        Alert.alert(
          language === 'en' ? 'Copied' : '복사됨', 
          language === 'en' ? 'QR code data copied to clipboard' : 'QR 코드 데이터가 클립보드에 복사되었습니다'
        );
    } catch (error) {
      // 폴백: 클립보드에 복사
      console.error('Share failed:', error);
      try {
        const addr = getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '';
        // 금액 모드인 경우 수량으로 변환
        const amountForUrl = recvAmountType === 'amount' 
          ? convertAmountToQuantity(parseFloat(recvInput) || 0, recvSelectedSymbol).toString()
          : recvInput;
        const payload = buildPayUri(addr, recvSelectedSymbol, amountForUrl);
        await (navigator as any)?.clipboard?.writeText?.(payload);
        Alert.alert(
          language === 'en' ? 'Copied' : '복사됨', 
          language === 'en' ? 'QR code data copied to clipboard' : 'QR 코드 데이터가 클립보드에 복사되었습니다'
        );
      } catch (clipboardError) {
        Alert.alert(
          language === 'en' ? 'Error' : '오류', 
          language === 'en' ? 'Failed to share QR code' : 'QR 코드 공유에 실패했습니다'
        );
      }
    }
  };
  
  async function handleSaveQrImage(payload: string, title?: string): Promise<boolean> {
    try {
      // 우선적으로 RN QR 컴포넌트의 toDataURL 사용
      let base64: string | null = null;
      if ((qrRef as any)?.current?.toDataURL) {
        base64 = await new Promise<string>((resolve) => (qrRef as any).current.toDataURL((d: string) => resolve(d)));
      }
      if ((Platform as any).OS === 'web') {
        // 0) 사용자 지정 파일명 구성(yooy__<base64url(payload)>-YYYYMMDD-<amt><sym>.png)
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth()+1).padStart(2,'0');
        const d = String(now.getDate()).padStart(2,'0');
        let sym = 'YOY'; let amt = '0';
        try { const u = new URL(payload); sym = u.searchParams.get('sym') || 'YOY'; amt = u.searchParams.get('amt') || '0'; } catch {}
        const encoded = toBase64Url(payload);
        const niceName = `yooy__${encoded}-${y}${m}${d}-${amt}${sym}.png`;
        // 1) 먼저 팝업 DOM을 그대로 캡처(디자인 유지)
        try {
          if (qrModalContentRef?.current) {
            const mod = await import('html2canvas');
            const html2canvas = (mod as any).default || (mod as any);
            if (html2canvas) {
              const node: any = qrModalContentRef.current;
              const canvasDom: any = await html2canvas(node, {
                scale: (window as any)?.devicePixelRatio || 2,
                backgroundColor: '#000000',
                useCORS: true,
                logging: false,
              });
              const dataDom = canvasDom.toDataURL('image/png');
              const linkDom = document.createElement('a');
              linkDom.href = dataDom; linkDom.download = niceName;
              document.body.appendChild(linkDom); linkDom.click(); document.body.removeChild(linkDom);
              Alert.alert('Saved', 'PNG saved to downloads');
              return true;
            }
          }
        } catch {}

        // 2) 로컬 qrcode로 순수 QR 생성 후 저장 (CORS 없음)
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const QRGen = (require('qrcode') as any);
          const dataUrl = await QRGen.toDataURL(payload, { errorCorrectionLevel: 'H', width: 600, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } });
          const a = document.createElement('a'); a.href = dataUrl; a.download = niceName;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          Alert.alert('Saved', 'PNG saved to downloads');
          return true;
        } catch {}
        // 3) 팝업 DOM을 그대로 캡처 시도 (하단 잘림 방지)
        try {
          if (qrModalContentRef?.current) {
            const mod = await import('html2canvas');
            const html2canvas = (mod as any).default || (mod as any);
            if (html2canvas) {
              const node: any = qrModalContentRef.current;
              const canvasDom: any = await html2canvas(node, {
                scale: (window as any)?.devicePixelRatio || 2,
                backgroundColor: '#000000',
                useCORS: true,
                logging: false,
              });
              const dataDom = canvasDom.toDataURL('image/png');
              // EXIF/메타 없음의 순수 PNG base64로 저장 -> 이후 스캔 시 CORS 문제 없이 처리 가능
              const linkDom = document.createElement('a');
              linkDom.href = dataDom;
              linkDom.download = niceName;
              document.body.appendChild(linkDom);
              linkDom.click();
              document.body.removeChild(linkDom);
              Alert.alert('Saved', 'PNG saved to downloads');
              return true;
            }
          }
        } catch {}
        // 캔버스 360x420, QR 300x300 완전 노출, 제목 골드, 외곽 골드 프레임 (이미지 합성 폴백)
        const imgEl: any = document.createElement('img');
        imgEl.crossOrigin = 'anonymous';
        imgEl.onload = () => {
          const CANVAS_W = 360;
          const CANVAS_H = 450;
          const TITLE_H = 64; // 상단에 코인/수량 타이틀 표시
          // 패널/QR 레이아웃 (finder 3개 모서리 완전 노출 보장)
          const QR_SIZE_TARGET = 200;       // 요청: QR 200x200 정사각형
          const PANEL_MARGIN_X = 0;         // 좌우 여백 0
          const PANEL_MARGIN_TOP = 0;       // 상단 여백 0
          const PANEL_MARGIN_BOTTOM = 0;    // 하단 여백 0
          const FRAME_RADIUS = 18;
          const OUTER_STROKE = 8;  // 골드 외곽 프레임
          const INNER_STROKE = 4;  // 안쪽 입체감
          const LOGO_SIZE = 56;

          const canvas: any = document.createElement('canvas');
          canvas.width = CANVAS_W;
          canvas.height = CANVAS_H;
          const ctx: any = canvas.getContext('2d');
          if (!ctx) return;
          // 스캔 안정화를 위해 안티앨리어싱 비활성화
          if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;

          // 배경
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

          // 전체 블록 중앙 오프셋 계산(제목+QR 패널)
          const panelW_pre = QR_SIZE_TARGET + PANEL_MARGIN_X * 2;
          const panelH_pre = QR_SIZE_TARGET + PANEL_MARGIN_TOP + PANEL_MARGIN_BOTTOM;
          const totalH = TITLE_H + panelH_pre;
          const offsetY = Math.floor((CANVAS_H - totalH) / 2);

          // 제목(상단 중앙)
          if (title) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 22px system-ui, -apple-system, Segoe UI, Roboto';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(title, CANVAS_W / 2, offsetY + (TITLE_H / 2));
          }

          // 패널/프레임 영역 계산
          const panelW = panelW_pre;
          const panelH = panelH_pre;
          const panelX = Math.round((CANVAS_W - panelW) / 2);
          const panelY = offsetY + TITLE_H; // 제목 아래에 패널 시작

          const roundRect = (x:number, y:number, w:number, h:number, r:number) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
          };

          // 외곽 골드 프레임
          roundRect(panelX, panelY, panelW, panelH, FRAME_RADIUS);
          ctx.lineWidth = OUTER_STROKE;
          ctx.strokeStyle = '#D4AF37';
          ctx.stroke();
          // 안쪽 입체감
          roundRect(panelX + OUTER_STROKE/2, panelY + OUTER_STROKE/2, panelW - OUTER_STROKE, panelH - OUTER_STROKE, FRAME_RADIUS - 6);
          ctx.lineWidth = INNER_STROKE;
          ctx.strokeStyle = '#333333';
          ctx.stroke();
          // 흰 패널 채움(프레임 내부)
          roundRect(panelX + OUTER_STROKE, panelY + OUTER_STROKE, panelW - OUTER_STROKE*2, panelH - OUTER_STROKE*2, FRAME_RADIUS - 8);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();

          // QR 그리기: 패널 내부 사각 영역에서 SAFE 여백 두고 1:1로 맞춤
          const SAFE = 0; // 안전 거리 0
          const innerW = panelW - OUTER_STROKE*2 - SAFE*2;
          const innerH = panelH - OUTER_STROKE*2 - SAFE*2;
          const QR_DRAW_SIZE = Math.floor(Math.min(innerW, innerH));
          const QR_X = Math.floor(panelX + OUTER_STROKE + SAFE);
          const QR_Y = Math.floor(panelY + OUTER_STROKE + SAFE);
          // 원본이 정사각형이 아닐 수 있으므로 중앙 정사각 크롭 후 그리기(1:1 유지)
          const srcSize = Math.min(imgEl.naturalWidth || imgEl.width, imgEl.naturalHeight || imgEl.height);
          const srcX = Math.floor(((imgEl.naturalWidth || imgEl.width) - srcSize) / 2);
          const srcY = Math.floor(((imgEl.naturalHeight || imgEl.height) - srcSize) / 2);
          if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
          ctx.drawImage(imgEl, srcX, srcY, srcSize, srcSize, QR_X, QR_Y, QR_DRAW_SIZE, QR_DRAW_SIZE);

          // 워터마크(우하단): 심볼/수량 소형 표기
          try {
            const wm = `${sym} ${amt}`;
            ctx.fillStyle = '#111111';
            ctx.fillRect(CANVAS_W - 140, CANVAS_H - 28, 130, 20);
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(wm, CANVAS_W - 12, CANVAS_H - 18);
          } catch {}

          // 저장
          const data = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = data;
          // 파일명: yooy__<base64url>-YYYYMMDD-<amt><sym>.png (팝업 합성 폴백)
          const now3 = new Date();
          const y3 = now3.getFullYear();
          const m3 = String(now3.getMonth()+1).padStart(2,'0');
          const d3 = String(now3.getDate()).padStart(2,'0');
          let sym3 = 'YOY'; let amt3 = '0';
          try { const u3 = new URL(payload); sym3 = u3.searchParams.get('sym') || 'YOY'; amt3 = u3.searchParams.get('amt') || '0'; } catch {}
          const encoded3 = toBase64Url(payload);
          link.download = `yooy__${encoded3}-${y3}${m3}${d3}-${amt3}${sym3}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          Alert.alert('Saved', 'PNG saved to downloads');
        };
        // 원본은 600x600로 받아 300으로 축소해 가장자리 손실 방지
        if (base64) imgEl.src = `data:image/png;base64,${base64.replace(/^data:image\/png;base64,/, '')}`;
        else imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(payload)}`;
        return true;
      }
      // 네이티브: 오프스크린 전용 뷰(qrExportRef)를 우선 캡처(제목+프레임+QR 포함)
      if (Platform.OS !== 'web' && captureRef) {
        try {
          await new Promise(res => setTimeout(res, 60));
          let uri: string | null = null;
          if ((qrExportRef as any)?.current) {
            uri = await captureRef((qrExportRef as any).current, { format: 'png', quality: 1, result: 'tmpfile' });
          }
          if (!uri && (qrModalContentRef as any)?.current) {
            uri = await captureRef((qrModalContentRef as any).current, { format: 'png', quality: 1, result: 'tmpfile' });
          }
          const perm = await MediaLibrary.requestPermissionsAsync();
          if (perm.status === 'granted' && uri) {
            // 파일명에 payload를 내장하여, 갤러리 선택 시 파일명 복구로 즉시 파싱 가능
            const encoded = toBase64Url(payload);
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth()+1).padStart(2,'0');
            const d = String(now.getDate()).padStart(2,'0');
            let sym = 'YOY'; let amt = '0';
            try { const u = new URL(payload); sym = u.searchParams.get('sym') || 'YOY'; amt = u.searchParams.get('amt') || '0'; } catch {}
            const target = `${(FileSystem as any).cacheDirectory || ''}yooy__${encoded}-${y}${m}${d}-${amt}${sym}.png`;
            try { await FileSystem.copyAsync({ from: uri, to: target }); } catch { /* ignore */ }
            const finalUri = (await (async()=>{ try{ await FileSystem.getInfoAsync(target); return target; } catch { return uri; }})());
            await MediaLibrary.saveToLibraryAsync(finalUri);
            Alert.alert('Saved', 'PNG saved to gallery');
            return true;
          }
          // 2) 전체 캡처 실패 시 QR 박스만 캡처(최소 보장)
          if ((qrShotBoxRef as any)?.current) {
            const uri1 = await captureRef((qrShotBoxRef as any).current, { format: 'png', quality: 1, result: 'tmpfile' });
            const perm1 = await MediaLibrary.requestPermissionsAsync();
            if (perm1.status === 'granted' && uri1) {
              const encoded = toBase64Url(payload);
              const now = new Date();
              const y = now.getFullYear();
              const m = String(now.getMonth()+1).padStart(2,'0');
              const d = String(now.getDate()).padStart(2,'0');
              let sym = 'YOY'; let amt = '0';
              try { const u = new URL(payload); sym = u.searchParams.get('sym') || 'YOY'; amt = u.searchParams.get('amt') || '0'; } catch {}
              const target = `${(FileSystem as any).cacheDirectory || ''}yooy__${encoded}-${y}${m}${d}-${amt}${sym}.png`;
              try { await FileSystem.copyAsync({ from: uri1, to: target }); } catch { /* ignore */ }
              const finalUri = (await (async()=>{ try{ await FileSystem.getInfoAsync(target); return target; } catch { return uri1; }})());
              await MediaLibrary.saveToLibraryAsync(finalUri);
              Alert.alert('Saved', 'PNG saved to gallery');
              return true;
            }
          }
        } catch (e) {
          // view-shot 실패 시 아래 base64 경로로 폴백
        }
      }
      // 네이티브: base64 존재 시 파일 저장, 없으면 외부 이미지 다운로드
      const encoded = toBase64Url(payload);
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth()+1).padStart(2,'0');
      const d = String(now.getDate()).padStart(2,'0');
      let sym = 'YOY'; let amt = '0';
      try { const u = new URL(payload); sym = u.searchParams.get('sym') || 'YOY'; amt = u.searchParams.get('amt') || '0'; } catch {}
      const fileUri = (FileSystem as any)?.cacheDirectory ? `${(FileSystem as any).cacheDirectory}yooy__${encoded}-${y}${m}${d}-${amt}${sym}.png` : `/data/user/0/yooy/yooy__${encoded}-${y}${m}${d}-${amt}${sym}.png`;
      if (base64) {
        await FileSystem.writeAsStringAsync(fileUri, base64.replace(/^data:image\/png;base64,/, ''), { encoding: 'base64' as any });
      } else {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(payload)}`;
        const download = await FileSystem.downloadAsync(url, fileUri);
        await FileSystem.copyAsync({ from: download.uri, to: fileUri }).catch(()=>{});
      }
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(fileUri);
        Alert.alert('Saved', 'PNG saved to gallery');
        return true;
      }
    } catch {}
    return false;
  }

  // 코드 URI 스킴: yooy://pay?addr=0x..&sym=YOY&amt=1.23
  const buildPayUri = (addr: string, sym: string, amt: string) => `yooy://pay?addr=${encodeURIComponent(addr)}&sym=${encodeURIComponent(sym)}&amt=${encodeURIComponent(amt||'')}`;
  const parsePayUri = (data: string) => {
    try {
      const url = new URL(data);
      if (url.protocol !== 'yooy:') return null;
      const addr = url.searchParams.get('addr') || '';
      const sym = url.searchParams.get('sym') || '';
      const amt = url.searchParams.get('amt') || '';
      return { addr, sym, amt };
    } catch { return null; }
  };

  // Pull-to-refresh (지갑 화면)
  const onRefreshWallet = useCallback(async () => {
    setRefreshingWallet(true);
    try {
      await updateRealTimePrices();
      try {
        const [markets, rates] = await Promise.all([
          getAllUpbitMarkets(),
          getExchangeRates()
        ]);
        setUpbitMarkets(markets);
        setExchangeRates(rates);
      } catch {}
    } finally {
      setRefreshingWallet(false);
    }
  }, []);

  // URL 파라미터(탭/코인/지갑생성) 반영
  useEffect(() => {
    try {
      // 탭 전환
      if (tab && ['assets','send','receive','gift','history','orders'].includes(String(tab))) {
        setActiveTab(String(tab) as TabKey);
      }
      // 코인 선택
      if (coin && typeof coin === 'string') {
        const sym = coin.toUpperCase();
        setSendSelectedSymbol(sym);
        setRecvSelectedSymbol(sym);
        const w = getWalletBySymbol(sym);
        if (w?.address) setRecvAddress(w.address);
        // 지갑 미보유 + 생성 요청 시, 지갑 생성 모달 오픈
        const wantCreate = (String(create || '').toLowerCase() === 'true') || !w;
        if (wantCreate && !w) {
          try {
            setSelectedCoin({ symbol: sym, name: sym, network: getCoinNetwork ? getCoinNetwork(sym) : 'Ethereum' } as any);
            setWalletModalVisible(true);
            Alert.alert(language==='en'?'Create wallet':'지갑 생성', language==='en'?'Please create the wallet to proceed.':'지갑을 생성해 주세요!');
          } catch {}
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, coin, create]);
  // 수량 포맷팅 함수: 천단위 구분, 소수점 3자리 금지
  const formatAmount = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    // 소수점이 있는 경우
    if (value.includes('.')) {
      const parts = value.split('.');
      const integerPart = parts[0];
      const decimalPart = parts[1];
      
      // 정수 부분에 천단위 구분 추가
      const formattedInteger = parseInt(integerPart).toLocaleString();
      
      // 소수점 부분 처리 (3자리 금지)
      let formattedDecimal = decimalPart;
      if (decimalPart.length === 3) {
        // 3자리면 2자리로 줄이기
        formattedDecimal = decimalPart.substring(0, 2);
      } else if (decimalPart.length > 4) {
        // 4자리 초과면 4자리로 제한
        formattedDecimal = decimalPart.substring(0, 4);
      }
      
      return `${formattedInteger}.${formattedDecimal}`;
    }
    
    // 정수면 천단위 구분 추가
    return num.toLocaleString();
  };

  // 받기 탭 URL 검증 함수
  const validateReceiveUrl = (urlData: {addr: string, sym: string, amt: string}) => {
    const errors: string[] = [];
    
    // 1. 코인 종류 검증
    if (urlData.sym !== recvSelectedSymbol) {
      errors.push(language === 'en' ? `Coin type mismatch. Expected ${recvSelectedSymbol}, but received ${urlData.sym}` : `코인 종류가 다릅니다. ${recvSelectedSymbol}을(를) 기대했지만 ${urlData.sym}이(가) 전송되었습니다.`);
    }
    
    // 2. 주소 검증
    const expectedAddress = getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress;
    if (urlData.addr !== expectedAddress) {
      errors.push(t('addressMismatch', language));
    }
    
    // 3. 수량 검증 (받기 희망 수량보다 같거나 크면 성공)
    if (urlData.amt && urlData.amt !== '0') {
      const requestedAmount = parseFloat(urlData.amt);
      const enteredAmount = parseFloat(recvInput);
      
      // 수량/금액 타입에 따라 변환
      let actualEnteredAmount = enteredAmount;
      if (recvAmountType === 'amount') {
        // 금액으로 입력된 경우 수량으로 변환
        actualEnteredAmount = convertAmountToQuantity(enteredAmount, recvSelectedSymbol);
      }
      
      if (actualEnteredAmount < requestedAmount) {
        errors.push(language === 'en' ? `Insufficient amount. URL requests ${urlData.amt} ${urlData.sym}, but you entered ${recvInput} ${recvAmountType === 'amount' ? currency : recvSelectedSymbol}` : `수량 부족. URL에서 ${urlData.amt} ${urlData.sym}을(를) 요청했지만 ${recvInput} ${recvAmountType === 'amount' ? currency : recvSelectedSymbol}을(를) 입력했습니다.`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // 보내기 탭 URL 검증 함수
  const validateSendUrl = (urlData: {addr: string, sym: string, amt: string}, currentInput?: string) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 현재 입력값 (붙여넣기 시에는 parsed.amt, 보내기 시에는 sendInput)
    const enteredAmount = currentInput ? parseFloat(currentInput) : parseNumericInput(sendInput);
    const currentSymbol = urlData.sym || sendSelectedSymbol;
    
    // 1. 코인 종류 검증 (실패 - 보내기 자체를 막음)
    if (urlData.sym !== sendSelectedSymbol) {
      errors.push(language === 'en' 
        ? `❌ Coin type mismatch!\n\nYou are trying to send ${sendSelectedSymbol}, but the request is for ${urlData.sym}.\n\nPlease select the correct coin type.`
        : `❌ 코인 종류가 다릅니다!\n\n${sendSelectedSymbol}을(를) 보내려고 하시지만, 요청은 ${urlData.sym}코인입니다.\n\n올바른 코인을 선택해주세요.`);
    }
    
    // 2. 수량 검증 (요청 수량보다 같거나 크면 성공, 미만이면 실패)
    if (urlData.amt && urlData.amt !== '0') {
      const requestedAmount = parseFloat(urlData.amt);
      
      // 입력값을 수량으로 변환 (금액 모드인 경우)
      let actualEnteredAmount = enteredAmount;
      if (sendAmountType === 'amount') {
        actualEnteredAmount = convertAmountToQuantity(enteredAmount, sendSelectedSymbol);
      }
      
      if (actualEnteredAmount < requestedAmount) {
        errors.push(language === 'en' 
          ? `❌ ${t('insufficientAmount', language)}\n\n${t('requested', language)}: ${urlData.amt} ${urlData.sym}\n${t('yourInput', language)}: ${currentInput || sendInput} ${sendAmountType === 'amount' ? currency : currentSymbol}`
          : `❌ ${t('insufficientAmount', language)}\n\n${t('requested', language)}: ${urlData.amt} ${urlData.sym}\n${t('yourInput', language)}: ${currentInput || sendInput} ${sendAmountType === 'amount' ? currency : currentSymbol}`);
      } else if (actualEnteredAmount > requestedAmount) {
        warnings.push(language === 'en' 
          ? `⚠️ ${t('amountExceedsRequest', language)}\n\n${t('requested', language)}: ${urlData.amt} ${urlData.sym}\n${t('yourInput', language)}: ${currentInput || sendInput} ${sendAmountType === 'amount' ? currency : currentSymbol}`
          : `⚠️ ${t('amountExceedsRequest', language)}\n\n${t('requested', language)}: ${urlData.amt} ${urlData.sym}\n${t('yourInput', language)}: ${currentInput || sendInput} ${sendAmountType === 'amount' ? currency : currentSymbol}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      hasWarnings: warnings.length > 0,
      errors,
      warnings
    };
  };

  // 받기 탭에서 URL 입력 처리
  const handleReceiveUrlInput = (inputText: string) => {
    const urlData = parsePayUri(inputText);
    if (!urlData) return; // yooy://pay URL이 아닌 경우 무시
    
    // URL 검증
    const validation = validateReceiveUrl(urlData);
    
    if (!validation.isValid) {
      // 경고 메시지 표시
      Alert.alert(
        language === 'en' ? '⚠️ Validation Warning' : '⚠️ 검증 경고',
        validation.errors.join('\n\n'),
        [
          {
            text: language === 'en' ? 'Cancel' : '취소',
            style: 'cancel',
            onPress: () => {
              // 입력값 초기화
              setRecvInput('');
            }
          },
          {
            text: language === 'en' ? 'Continue Anyway' : '그래도 진행',
            style: 'destructive',
            onPress: () => {
              // 사용자가 강제로 진행하길 원하는 경우
              // 실패 트랜잭션 기록
              const failedTransaction = {
                id: `tx_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'receive' as const,
                from: urlData.addr,
                to: getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '',
                amount: parseFloat(urlData.amt) || 0,
                currency: urlData.sym,
                description: `Failed receive attempt (user continued despite warning): ${validation.errors.join(', ')}`,
                timestamp: new Date().toISOString(),
                status: 'failed' as const,
                hash: `failed_${Date.now()}`,
                network: urlData.sym === 'YOY' ? 'YOY' as const : 'Ethereum' as const,
                blockTimestamp: new Date().toISOString(),
                memo: `Validation failed (user continued): ${validation.errors.join('; ')}`
              };
              
              // 실패 트랜잭션 추가
              addTransaction(failedTransaction);
              
              // 최종 경고
              Alert.alert(
                language === 'en' ? 'Transaction Failed' : '거래 실패',
                language === 'en' ? 'Transaction has been recorded as failed due to validation errors.' : '검증 오류로 인해 거래가 실패로 기록되었습니다.',
                [
                  {
                    text: language === 'en' ? 'OK' : '확인',
                    onPress: () => {
                      // 입력값 초기화
                      setRecvInput('');
                    }
                  }
                ]
              );
            }
          }
        ]
      );
      
      return;
    }
    
    // 성공 시 - 실제로는 여기서 받기 처리를 하지만, 
    // 현재는 검증만 하고 성공 메시지만 표시
    Alert.alert(
      language === 'en' ? 'Validation Success' : '검증 성공',
      language === 'en' ? 'All validation checks passed. Transaction can proceed.' : '모든 검증이 통과되었습니다. 거래를 진행할 수 있습니다.',
      [
        {
          text: language === 'en' ? 'OK' : '확인'
        }
      ]
    );
  };

  // 실제 보내기 기능
  const handleSendTransaction = async () => {
    try {
      // 입력값 검증
      if (!sendToAddress || !sendInput || !sendSelectedSymbol) {
        Alert.alert(
          language === 'en' ? 'Error' : '오류',
          language === 'en' ? 'Please fill in all required fields' : '모든 필수 항목을 입력해주세요'
        );
        return;
      }

      // URL 검증 (yooy://pay URL인 경우 또는 요청 상태인 경우)
      let urlData = parsePayUri(sendToAddress);
      
      // sendToAddress가 일반 주소이지만 isRequest가 true인 경우, 
      // 저장된 원본 URL 데이터를 사용
      if (!urlData && isRequest && originalUrlData) {
        urlData = originalUrlData;
      }
      
      if (urlData) {
        // 현재 입력값 정규화(천단위 구분 제거) 후 검증
        const normalizedInput = parseNumericInput(sendInput);
        const validation = validateSendUrl(urlData, String(normalizedInput));
        
        // 코인 종류가 다르면 보내기 차단
        if (!validation.isValid) {
          // 간단 라벨 매핑: 코인 다름 / 수량 낮음
          let label = language==='en' ? 'Invalid' : '검증 실패';
          if (urlData.sym !== sendSelectedSymbol) {
            label = language==='en' ? 'Wrong coin' : '코인 다름';
          } else if (urlData.amt && urlData.amt !== '0') {
            const requested = parseFloat(urlData.amt);
            const enteredRaw = parseNumericInput(sendInput);
            const entered = sendAmountType === 'amount' ? convertAmountToQuantity(enteredRaw, sendSelectedSymbol) : enteredRaw;
            if (entered < requested) label = language==='en' ? 'Low amount' : '수량 낮음';
          }
          setSendErrorText(label);
          // 5초 후 자동 복구
          setTimeout(()=>setSendErrorText(null), 5000);
          return;
        }
        
        // 수량이 요청보다 큰 경우: 추가 확인 없이 바로 진행 (성공 처리)
        // 수량이 동일한 경우도 그대로 진행
        // validation.hasWarnings 는 요청 초과를 의미하므로 별도 경고 팝업 없이 계속 진행
      }

             // 보유량 확인
             const ownedAmount = ownedSendAmount;
             const sendAmount = sendAmountType === 'amount' 
               ? convertAmountToQuantity(parseFloat(sendInput) || 0, sendSelectedSymbol)
               : parseFloat(sendInput) || 0;
      
      if (sendAmount > ownedAmount) {
        setSendErrorText(language==='en'?'Insufficient balance':'잔액 부족');
        setTimeout(()=>setSendErrorText(null), 5000);
        return;
      }

      // 실제 트랜잭션 처리 함수
      const proceedWithTransaction = async () => {
        // mock 전송 제거: 실제 전송 불가 시 에러만 안내
        try {
          Alert.alert(language==='en'?'Action required':'작업 필요', language==='en'?'Connect or configure a wallet to send.':'전송하려면 지갑 생성/복구가 필요합니다.');
        } catch {}
        return;
      };

      // URL 검증이 없거나 통과/초과한 경우 바로 진행
      // ETH 네이티브 코인 전송 (MetaMask)
      if (sendSelectedSymbol === 'ETH' && typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const ethereum = (window as any).ethereum;
          const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
          const from = accounts?.[0];
          const { parseUnits } = await import('@/lib/eth');
          const value = parseUnits(parseFloat(sendInput)||0, 18);
          const txHash: string = await ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: sendToAddress, value: '0x' + value.toString(16) }] });
          // 기록
          const transactionData = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'send' as const,
            from,
            to: sendToAddress,
            amount: parseFloat(sendInput)||0,
            currency: 'ETH',
            description: `Sent ${sendInput} ETH to ${sendToAddress.slice(0,6)}...${sendToAddress.slice(-4)}`,
            timestamp: new Date().toISOString(),
            status: 'completed' as const,
            hash: txHash,
            network: 'Ethereum' as const,
            blockTimestamp: new Date().toISOString(),
          };
          await addTransaction(transactionData as any);
          try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol:'ETH', amount: parseFloat(sendInput)||0, change: -(parseFloat(sendInput)||0), description: transactionData.description, transactionHash: txHash, source:'wallet' } as any); } catch {}
          setSendToAddress(''); setSendInput(''); setSendPct(null); setIsRequest(false); setOriginalUrlData(null);
          try { Alert.alert(language==='en'?'Success':'완료', 'ETH 전송 완료'); } catch {}
          setTimeout(()=>{ try { setActiveTab('history'); setHistoryPage(1); } catch {}; setSelectedTransaction(transactionData as any); setTransactionDetailVisible(true); }, 800);
          return;
        } catch (e) { /* fallthrough to WC/mock */ }
      }

      // ERC-20 (MetaMask): YOY 및 레지스트리에 존재하는 토큰 전송
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          const ethereum = (window as any).ethereum;
          const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
          const from = accounts?.[0];
          const { getYoyContractAddress } = await import('@/lib/config');
          const { getErc20BySymbol } = await import('@/lib/erc20Registry');
          const chainIdOnMM: string = await ethereum.request({ method: 'eth_chainId' });
          const { isHexAddress, encodeErc20Transfer, parseUnits } = await import('@/lib/eth');

          let erc20Address: string | null = null;
          let decimals = 18;
          if (sendSelectedSymbol === 'YOY') {
            erc20Address = await getYoyContractAddress();
            decimals = 18;
          } else {
            const meta = getErc20BySymbol(chainIdOnMM, sendSelectedSymbol);
            if (meta) { erc20Address = meta.address; decimals = meta.decimals; }
          }

          if (!from || !erc20Address || !isHexAddress(erc20Address) || !isHexAddress(sendToAddress)) {
            await proceedWithTransaction();
            return;
          }
          const normalizedRaw = parseNumericInput(sendInput);
          const amount = sendAmountType === 'amount' 
            ? parseUnits(convertAmountToQuantity(normalizedRaw, sendSelectedSymbol), decimals)
            : parseUnits(normalizedRaw, decimals);
          const data = encodeErc20Transfer(sendToAddress, amount);
          const txParams = { from, to: erc20Address, data, value: '0x0' };
          const txHash: string = await ethereum.request({ method: 'eth_sendTransaction', params: [txParams] });

          // 성공 시 트랜잭션 기록
          const transactionData = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'send' as const,
            from,
            to: sendToAddress,
            amount: sendAmount,
            currency: sendSelectedSymbol,
            description: isRequest 
              ? `Payment request approved: ${sendAmount} ${sendSelectedSymbol} to ${sendToAddress.slice(0, 6)}...${sendToAddress.slice(-4)}`
              : `Sent ${sendAmount} ${sendSelectedSymbol} to ${sendToAddress.slice(0, 6)}...${sendToAddress.slice(-4)}`,
            timestamp: new Date().toISOString(),
            status: 'completed' as const,
            fee: undefined,
            hash: txHash,
            blockNumber: undefined,
            gasUsed: undefined,
            gasPrice: undefined,
            network: 'Ethereum' as const,
            blockTimestamp: new Date().toISOString(),
            memo: isRequest ? 'Payment request approved' : undefined
          };

          await addTransaction(transactionData);
          try {
            walletStore.addTransaction({
              type: 'transfer',
              success: true,
              status: 'completed',
              symbol: sendSelectedSymbol,
              amount: sendAmount,
              change: -sendAmount,
              description: transactionData.description,
              transactionHash: transactionData.hash,
              fee: transactionData.fee,
              source: 'wallet',
            } as any);
          } catch {}

          setSendToAddress('');
          setSendInput('');
          setSendPct(null);
          setIsRequest(false);
          setOriginalUrlData(null);

          try {
            Alert.alert(language === 'en' ? 'Success' : '완료', language === 'en' ? 'Payment sent on Ethereum' : '이더리움으로 전송했습니다');
          } catch {}

          setTimeout(() => {
            try { setActiveTab('history'); setHistoryPage(1); } catch {}
            setSelectedTransaction(transactionData);
            setTransactionDetailVisible(true);
          }, 800);
          return;
        } catch (e) {
          console.error('ERC20 send failed (MetaMask), fallback to mock:', e);
          // 실패 시 모의 트랜잭션으로 폴백
          await proceedWithTransaction();
          return;
        }
      }

      // ERC-20: WalletConnect 연결되어 있으면 네이티브 지갑으로 실제 전송 (레지스트리 토큰 전체)
      if (wc && wc.state.connected) {
        try {
          const { getYoyContractAddress, getEthChainIdHex } = await import('@/lib/config');
          const { isHexAddress, encodeErc20Transfer, parseUnits } = await import('@/lib/eth');
          const chainIdHex = await getEthChainIdHex();

          let contract: string | null = null;
          let decimals = 18;
          if (sendSelectedSymbol === 'ETH') {
            // 네이티브 ETH는 sendErc20이 아닌 네이티브 전송이므로 아래로 폴백
            contract = null;
          } else if (sendSelectedSymbol === 'YOY') {
            contract = await getYoyContractAddress();
            decimals = 18;
          } else {
            const { getErc20BySymbol } = await import('@/lib/erc20Registry');
            const meta = getErc20BySymbol(chainIdHex, sendSelectedSymbol);
            if (meta) { contract = meta.address; decimals = meta.decimals; }
          }

          if (!contract || !isHexAddress(contract) || !isHexAddress(sendToAddress)) {
            // admin custom token fallback
            const { loadCustomCoins } = await import('@/lib/customCoins');
            const custom = await loadCustomCoins();
            const found = custom.find(c => c.symbol?.toUpperCase()===sendSelectedSymbol && c.contract && (!c.chainIdHex || c.chainIdHex===chainIdHex));
          if (found && found.contract && isHexAddress(found.contract)) {
            contract = found.contract as string;
              if (typeof found.decimals === 'number') decimals = found.decimals;
            } else {
              await proceedWithTransaction();
              return;
            }
          }
          const normalizedRaw = parseNumericInput(sendInput);
          const amount = sendAmountType === 'amount' 
            ? parseUnits(convertAmountToQuantity(normalizedRaw, sendSelectedSymbol), decimals)
            : parseUnits(normalizedRaw, decimals);
          const data = encodeErc20Transfer(sendToAddress, amount);
          const txHashMaybe = await wc.sendErc20({ contract: contract!, to: sendToAddress, data, chainIdHex: chainIdHex as string });
          const txHash = txHashMaybe || '';
          if (!txHash) throw new Error('No transaction hash returned');

          const transactionData = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'send' as const,
            from: wc.state.address || '',
            to: sendToAddress,
            amount: sendAmount,
            currency: sendSelectedSymbol,
            description: isRequest 
              ? `Payment request approved: ${sendAmount} ${sendSelectedSymbol} to ${sendToAddress.slice(0, 6)}...${sendToAddress.slice(-4)}`
              : `Sent ${sendAmount} ${sendSelectedSymbol} to ${sendToAddress.slice(0, 6)}...${sendToAddress.slice(-4)}`,
            timestamp: new Date().toISOString(),
            status: 'completed' as const,
            fee: undefined,
            hash: txHash,
            blockNumber: undefined,
            gasUsed: undefined,
            gasPrice: undefined,
            network: 'Ethereum' as const,
            blockTimestamp: new Date().toISOString(),
            memo: isRequest ? 'Payment request approved' : undefined
          };

          await addTransaction(transactionData as any);
          try {
            walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol: sendSelectedSymbol, amount: sendAmount, change: -sendAmount, description: transactionData.description, transactionHash: transactionData.hash, source:'wallet' } as any);
          } catch {}

          setSendToAddress('');
          setSendInput('');
          setSendPct(null);
          setIsRequest(false);
          setOriginalUrlData(null);

          try { Alert.alert(language==='en'?'Success':'완료', `WalletConnect 전송 완료 (${sendSelectedSymbol})`); } catch {}

          setTimeout(() => {
            try { setActiveTab('history'); setHistoryPage(1); } catch {}
            setSelectedTransaction(transactionData as any);
            setTransactionDetailVisible(true);
          }, 800);
          return;
        } catch (e: any) {
          console.error('WalletConnect send failed:', e);
          // UX 강화: 네트워크 전환/재시도 가이드
          try {
            Alert.alert(language==='en'?'Send failed':'전송 실패',
              language==='en'?'Check wallet network and try again.':'지갑 네트워크를 확인 후 다시 시도해주세요.',
              [
                { text: language==='en'?'Retry':'재시도', onPress: async ()=>{ try { await handleSendTransaction(); } catch {} } },
                { text: language==='en'?'Cancel':'취소', style:'cancel' }
              ]
            );
          } catch {}
          await proceedWithTransaction();
          return;
        }
      }

      // 내장 지갑을 사용한 YOY 전송 (WalletConnect 없어도 동작)
      if (sendSelectedSymbol === 'YOY') {
        try {
          // 가스(ETH) 사전 점검
          const pf = await preflightTokenGasCheck({ to: sendToAddress, symbol: 'YOY', amount: String(sendInput) });
          if (!pf.ok) {
            const toEth = (w: bigint) => {
              try { const { ethers } = require('ethers'); return Number(ethers.formatEther(w)); } catch { return Number(w) / 1e18; }
            };
            const need = toEth(pf.needEthWei || 0n);
            const have = toEth(pf.haveEthWei || 0n);
            const gap = Math.max(0, need - have);
            Alert.alert(
              language==='en'?'Insufficient gas (ETH)':'가스(ETH) 부족',
              language==='en'
                ? `At least ${need.toFixed(6)} ETH required for gas.\nCurrent: ${have.toFixed(6)} ETH\nShort: ${gap.toFixed(6)} ETH`
                : `가스비로 최소 ${need.toFixed(6)} ETH가 필요합니다.\n보유: ${have.toFixed(6)} ETH\n부족: ${gap.toFixed(6)} ETH`
            );
            return;
          }
          const { sendYoyToken } = await import('@/src/wallet/wallet');
          const res = await sendYoyToken({ to: sendToAddress, amount: String(sendInput) });
          const transactionData = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'send' as const,
            from: getWalletBySymbol('YOY')?.address || '',
            to: sendToAddress,
            amount: parseFloat(sendInput)||0,
            currency: 'YOY',
            description: `Sent ${sendInput} YOY to ${sendToAddress.slice(0,6)}...${sendToAddress.slice(-4)}`,
            timestamp: new Date().toISOString(),
            status: 'completed' as const,
            hash: res.hash,
            network: 'YOY' as const,
            blockTimestamp: new Date().toISOString(),
          };
          await addTransaction(transactionData as any);
          try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol:'YOY', amount: parseFloat(sendInput)||0, change: -(parseFloat(sendInput)||0), description: transactionData.description, transactionHash: res.hash, source:'wallet' } as any); } catch {}
          setSendToAddress(''); setSendInput(''); setSendPct(null); setIsRequest(false); setOriginalUrlData(null);
          try { Alert.alert(language==='en'?'Success':'완료', 'YOY 전송 완료'); } catch {}
          setTimeout(()=>{ try { setActiveTab('history'); setHistoryPage(1); } catch {}; setSelectedTransaction(transactionData as any); setTransactionDetailVisible(true); }, 800);
          return;
        } catch (e: any) {
          const msg = String(e?.message || e);
          try { Alert.alert(language==='en'?'Send failed':'전송 실패', msg); } catch {}
          return;
        }
      }

      // ETH/기타 전송: 연결지갑(WalletConnect) 또는 브라우저 지갑 사용
      if (sendSelectedSymbol === 'BTC') {
        Alert.alert(language==='en'?'Not supported':'지원 예정', language==='en'?'BTC transfer is not implemented yet.':'BTC 전송은 아직 구현되지 않았습니다.');
        return;
      }
      await proceedWithTransaction();

    } catch (error) {
      console.error('Send transaction failed:', error);
      
      // 실패 트랜잭션 기록
      const failedTransaction = {
        id: `tx_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'send' as const,
        from: getWalletBySymbol(sendSelectedSymbol)?.address || '',
        to: sendToAddress,
        amount: parseFloat(sendInput) || 0,
        currency: sendSelectedSymbol,
        description: `Send transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        status: 'failed' as const,
        hash: `failed_${Date.now()}`,
        network: sendSelectedSymbol === 'YOY' ? 'YOY' as const : 'Ethereum' as const,
        blockTimestamp: new Date().toISOString(),
        memo: `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      
      // 실패 트랜잭션 추가
      addTransaction(failedTransaction);
      
      Alert.alert(
        language === 'en' ? 'Transaction Failed' : '거래 실패',
        language === 'en' ? 'Failed to send transaction. Please try again.' : '트랜잭션 전송에 실패했습니다. 다시 시도해주세요.',
        [
          {
            text: language === 'en' ? 'Try Again' : '다시 시도',
            onPress: () => {
              // 입력값 초기화하여 다시 시도할 수 있게 함
              setSendToAddress('');
              setSendInput('');
              setSendPct(null);
              setIsRequest(false);
            }
          },
          {
            text: language === 'en' ? 'View History' : '히스토리 보기',
            onPress: () => { try { setActiveTab('history'); setHistoryPage(1); } catch {} }
          }
        ]
      );
    }
  };
  
  // 지갑 생성 모달 상태
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<{symbol: string, name: string, network: string} | null>(null);
  
  // QR 코드 팝업 상태
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrCoin, setQrCoin] = useState<{symbol: string, name: string, network: string, address: string} | null>(null);
  const [qrModalTab, setQrModalTab] = useState<TabKey>('receive');
  const [qrModalType, setQrModalType] = useState<'wallet' | 'pngsave'>('wallet');
  const qrModalContentRef = useRef<View|null>(null);
  // 커스텀 페이로드 QR (바우처 등)
  const [customQrPayload, setCustomQrPayload] = useState<string | null>(null);
  const [customQrVisible, setCustomQrVisible] = useState(false);
  const customQrBoxRef = useRef<View|null>(null);
  
  // 복사 상태 관리
  const [copySuccess, setCopySuccess] = useState(false);
  const [qrModalCopySuccess, setQrModalCopySuccess] = useState(false);
  const [addrCopySuccess, setAddrCopySuccess] = useState(false);
  
  // 거래 상세 모달 상태
  const [transactionDetailVisible, setTransactionDetailVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [memoDraft, setMemoDraft] = useState('');

  // 지갑 안내 모달 (진입 시)
  const [introVisible, setIntroVisible] = useState(false);
  const [introDontShow, setIntroDontShow] = useState(false);
  // 기프트 수령 대기 상태 (yooy://claim 감지 시 표시)
  const [pendingGift, setPendingGift] = useState<{ id: string; symbol: string; status: string } | null>(null);
  // 기프트 탭: 입력값
  const [giftClaimInput, setGiftClaimInput] = useState('');
  // 기프트 탭: 상태 표시용
  const [giftStatus, setGiftStatus] = useState<string | null>(null);
  const [giftStatusTone, setGiftStatusTone] = useState<'info'|'success'|'error'|'warn'>('info');

  // Gift 탭: 링크에서 바우처 로드
  const loadGiftVoucherFromData = async (raw: string) => {
    try {
      const parsed = parseClaimUri(raw);
      if (!parsed?.id) {
        Alert.alert(language==='en'?'Invalid link':'유효하지 않은 링크');
        return;
      }
      const v = await getVoucher(parsed.id);
      if (!v) {
        Alert.alert(language==='en'?'Not found':'바우처를 찾을 수 없습니다.');
        return;
      }
      setPendingGift({ id: v.id, symbol: v.symbol || 'YOY', status: v.status });
      if (v.status !== 'active') {
        const msg = v.status === 'expired' ? (language==='en'?'Expired':'만료됨')
          : v.status === 'exhausted' ? (language==='en'?'Exhausted':'소진됨')
          : (language==='en'?'Cancelled':'종료됨');
        Alert.alert(language==='en'?'Not claimable':'수령 불가', msg);
      } else {
        Alert.alert(language==='en'?'Claim available':'수령 가능', (language==='en'?'Press Claim to receive.':'아래 받기 버튼을 눌러 수령하세요.'));
      }
    } catch (e) {
      Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
    }
  };

  const handlePasteGift = async () => {
    try {
      const text = await (navigator as any)?.clipboard?.readText?.();
      if (text) {
        setGiftClaimInput(text);
        await loadGiftVoucherFromData(text);
      }
    } catch {}
  };

  const handleImageGift = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 1, base64: true, selectionLimit: 1 } as any);
      if (res.canceled || !res.assets?.length) return;
      const asset: any = res.assets[0];
      // 네이티브에서도 base64 data URL을 우선 사용(인식률 향상)
      const src = asset?.base64 ? `data:${asset.type || 'image/png'};base64,${asset.base64}` : (asset?.uri || '');
      const code = await scanImageWithAll(src);
      if (code) {
        setGiftClaimInput(code);
        await loadGiftVoucherFromData(code);
        return;
      }
      Alert.alert(language==='en'?'Scan failed':'스캔 실패', language==='en'?'Could not detect a gift QR in the selected image.':'선택한 이미지에서 기프트 QR을 찾을 수 없습니다.');
    } catch (e) {
      Alert.alert(language==='en'?'Scan error':'스캔 오류', String(e instanceof Error ? e.message : e));
    }
  };

  const handleClaimGift = async () => {
    try {
      if (!pendingGift) return;
      setGiftStatus(language==='en'?'Receiving...':'수령 중...'); setGiftStatusTone('info');
      const sym = pendingGift.symbol || 'YOY';
      const recvAddrNow = getWalletBySymbol(sym)?.address || recvAddress || '';
      if (!recvAddrNow) {
        const msg = language==='en'?'No wallet address':'지갑 주소 없음';
        setGiftStatus(msg); setGiftStatusTone('error');
        Alert.alert(msg, language==='en'?'Create wallet first.':'먼저 해당 코인 지갑을 생성하세요.');
        return;
      }
      const res = await claimVoucher({ id: pendingGift.id, recipientAddress: recvAddrNow, recipientEmail: currentUserEmail });
      if ('error' in res) {
        const code = String(res.error || '');
        if (code.includes('expired') || code.includes('cancelled') || code.includes('not_active')) {
          const msg = language==='en'?'Event ended':'이벤트가 종료 되었습니다.';
          setGiftStatus(msg); setGiftStatusTone('warn');
          Alert.alert(msg);
        } else if (code.includes('exhausted')) {
          const msg = language==='en'?'Event exhausted':'이벤트가 모두 소진 되었습니다.';
          setGiftStatus(msg); setGiftStatusTone('warn');
          Alert.alert(msg);
        } else {
          setGiftStatus(code); setGiftStatusTone('error');
          Alert.alert(language==='en'?'Event failed':'수령 실패', code);
        }
        return;
      }
      const gained = res.amount || 0;
      try {
        const storageKey = `user_balances_${currentUserEmail}`;
        const saved = await AsyncStorage.getItem(storageKey);
        const parsedBal = saved ? JSON.parse(saved) : {};
        parsedBal[sym] = (parsedBal[sym] || 0) + gained;
        await AsyncStorage.setItem(storageKey, JSON.stringify(parsedBal));
      } catch {}
      // 거래내역 기록 + 상세 팝업 오픈
      try {
        const transactionData: any = {
          id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'receive',
          symbol: sym,
          amount: gained,
          to: recvAddrNow,
          from: 'voucher',
          description: 'Voucher claim',
          status: 'completed',
          success: true,
          hash: `voucher_${pendingGift.id}`,
          blockTimestamp: new Date().toISOString(),
        };
        await addTransaction(transactionData);
        setTxDetail(transactionData);
      } catch {}
      setPendingGift(null);
      const successMsg = language==='en'
        ? `Congratulations! You received ${gained} ${sym}.`
        : `축하합니다! ${gained} ${sym}를 수령하였습니다.`;
      setGiftStatus(successMsg); setGiftStatusTone('success');
      Alert.alert(successMsg);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      setGiftStatus(msg); setGiftStatusTone('error');
      Alert.alert(language==='en'?'Error':'오류', msg);
    }
  };

  // 수령하기 버튼: 입력 링크를 바로 처리(상태 세팅 지연과 무관하게 동작)
  const handleEventClaimClick = async () => {
    try {
      setGiftStatus(language==='en'?'Preparing to receive...':'수령 준비 중...'); setGiftStatusTone('info');
      let vid: string | null = null;
      if (giftClaimInput) {
        const parsed = parseClaimUri(giftClaimInput);
        vid = parsed?.id || null;
      } else if (pendingGift?.id) {
        vid = pendingGift.id;
      }
      if (!vid) {
        const msg = language==='en'?'Enter event link':'이벤트 링크를 입력하세요';
        setGiftStatus(msg); setGiftStatusTone('error');
        Alert.alert(msg);
        return;
      }
      // 로컬 미리보기 ID는 수령 불가 (배너 고정 노출 제거, 알림만)
      if (/^local_/i.test(vid)) {
        Alert.alert(
          language==='en'?'Not claimable':'수령 불가',
          language==='en'
          ? 'This is a local preview QR. Please use a real event link.'
            : '로컬 미리보기 QR입니다. 실제 이벤트 링크로 시도해 주세요.'
        );
        return;
      }
      const v = await getVoucher(vid);
      if (!v) {
        const msg = language==='en'?'Not found':'바우처를 찾을 수 없습니다.';
        setGiftStatus(msg); setGiftStatusTone('error');
        Alert.alert(msg);
        return;
      }
      setPendingGift({ id: v.id, symbol: v.symbol || 'YOY', status: v.status });
      if (v.status !== 'active') {
        const msg = v.status === 'expired' ? (language==='en'?'Event ended':'이벤트가 종료 되었습니다.') :
                    v.status === 'exhausted' ? (language==='en'?'Event exhausted':'이벤트가 모두 소진 되었습니다.') :
                    (language==='en'?'Event ended':'이벤트가 종료 되었습니다.');
        setGiftStatus(msg); setGiftStatusTone('warn');
        Alert.alert(msg);
        return;
      }
      setGiftStatus(language==='en'?'Receiving...':'수령 중...'); setGiftStatusTone('info');
      await handleClaimGift();
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      setGiftStatus(msg); setGiftStatusTone('error');
      Alert.alert(language==='en'?'Error':'오류', msg);
    }
  };

  // 보내기/받기 상단 폼 상태
  const [sendSelectOpen, setSendSelectOpen] = useState(false);
  const [sendMode, setSendMode] = useState<'amount' | 'value'>('amount');
  const [sendPct, setSendPct] = useState<number | null>(null);
  const [sendInput, setSendInput] = useState('');
  const [sendAmountType, setSendAmountType] = useState<'quantity' | 'amount'>('quantity'); // 수량/금액 구분
  const [sendToAddress, setSendToAddress] = useState('');
  const [isRequest, setIsRequest] = useState(false);
  const [originalUrlData, setOriginalUrlData] = useState<{addr: string, sym: string, amt: string} | null>(null); // QR 요청 여부 (요청수량 존재 시 true)

  // 이전에 선언된 recvSelectedSymbol과 중복되는 상태 제거
  const [recvSelectOpen, setRecvSelectOpen] = useState(false);
  const [recvMode, setRecvMode] = useState<'amount' | 'value'>('amount');
  const [recvFromAddress, setRecvFromAddress] = useState('');
  // 빠른 액션 설정(공유 컨텍스트)
  const { actions: quickActionsState, replaceAll, setActionEnabled } = useQuickActions();
  const [quickSettingsVisible, setQuickSettingsVisible] = useState(false);

  // 보유 수량 조회
  const getOwnedAmount = (sym: string) => {
    const b = realTimeBalances.find(x => x.symbol === sym);
    return b?.amount ?? 0;
  };
  const ownedSendAmount = useMemo(() => getOwnedAmount(sendSelectedSymbol), [sendSelectedSymbol, realTimeBalances]);
  // 거래내역 Type 컬러 (파스텔)
  const getTypeColor = (type: string) => {
    const key = String(type || '').toUpperCase();
    switch (key) {
      case 'SEND': return '#9EC9FF'; // pastel blue
      case 'RECEIVE': return '#A8E6CF'; // pastel mint
      case 'SWAP': return '#CBB2FE'; // pastel purple
      case 'BUY': return '#B2F0B2'; // pastel green
      case 'SELL': return '#FFD3B6'; // pastel orange
      case 'STAKE': return '#FDE2FF';
      case 'UNSTAKE': return '#FFDFD3';
      default: return '#D7D7D7';
    }
  };
  // 빠른 액션 엔트리(아이콘/라벨 매핑)
  const quickEntries = useMemo(() => ([
    { key: 'send', labelEn: 'Send', labelKo: '보내기', icon: '↗' },
    { key: 'receive', labelEn: 'Receive', labelKo: '받기', icon: '↘' },
    { key: 'qr', labelEn: 'QR Code', labelKo: 'QR 코드', icon: '▦' },
    { key: 'gift', labelEn: 'Gift', labelKo: '기프트', icon: '🎁' },
    { key: 'history', labelEn: 'History', labelKo: '히스토리', icon: '≡' },
    { key: 'schedule', labelEn: 'Schedule', labelKo: '일정', icon: '▣' },
    { key: 'reward', labelEn: 'Reward', labelKo: '리워드', icon: '★' },
    { key: 'chat', labelEn: 'Chat', labelKo: '채팅', icon: '○' },
    { key: 'shop', labelEn: 'Shop', labelKo: '상점', icon: '◆' },
    { key: 'nft', labelEn: 'NFT', labelKo: 'NFT', icon: '◇' },
    { key: 'buy', labelEn: 'Buy', labelKo: '매수', icon: '△' },
    { key: 'sell', labelEn: 'Sell', labelKo: '매도', icon: '▽' },
    { key: 'diary', labelEn: 'Diary', labelKo: '일기', icon: '◌' },
    { key: 'accountBook', labelEn: 'Account Book', labelKo: '가계부', icon: '◐' },
    { key: 'memo', labelEn: 'Memo', labelKo: '메모', icon: '◑' },
  ]), [language]);

  const renderQuickTile = (entry: any) => (
    <TouchableOpacity key={`qa-${entry.key}`} style={styles.quickTile}
      onPress={() => {
        if (entry.key === 'send') setActiveTab('send');
        else if (entry.key === 'receive') setActiveTab('receive');
        else if (entry.key === 'gift') setActiveTab('gift');
        else if (entry.key === 'history') setActiveTab('history');
        else if (entry.key === 'qr') setActiveTab('receive');
        else if (entry.key === 'schedule') {
          router.push('/(tabs)/todo');
        } else if (entry.key === 'reward') {
          router.push('/(tabs)/dashboard');
        } else if (entry.key === 'chat') {
          router.push('/(tabs)/chat');
        } else if (entry.key === 'shop') {
          router.push('/(tabs)/exchange');
        } else if (entry.key === 'nft') {
          router.push('/(tabs)/exchange');
        } else if (entry.key === 'buy') {
          router.push('/(tabs)/exchange');
        } else if (entry.key === 'sell') {
          router.push('/(tabs)/exchange');
        } else if (entry.key === 'diary') {
          router.push('/(tabs)/todo');
        } else if (entry.key === 'accountBook') {
          router.push('/(tabs)/todo');
        } else if (entry.key === 'memo') {
          router.push('/(tabs)/todo');
        } else {
          // 기타 항목은 일단 Quick Set을 열어 사용자 커스터마이즈 유도
          setQuickSettingsVisible(true);
        }
      }}>
      <View style={styles.tileIcon}><ThemedText style={styles.tileIconText}>{entry.icon}</ThemedText></View>
      <ThemedText style={styles.tileText}>{language==='en'? entry.labelEn : entry.labelKo}</ThemedText>
    </TouchableOpacity>
  );
  
  // 거래 쌍 연결 상태
  const [transactionPair, setTransactionPair] = useState<{
    sendTab: {symbol: string, amount: string, toAddress: string} | null;
    receiveTab: {symbol: string, amount: string, fromAddress: string} | null;
    isMatched: boolean;
  }>({
    sendTab: null,
    receiveTab: null,
    isMatched: false
  });
  // 거래내역 페이지네이션
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
    })();
  }, [currency]);

  useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const saved = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.photoUri`);
        if (saved) setAvatarUri(saved);
        
        // Load username
        const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
        if (info) {
          try {
            const parsedInfo = JSON.parse(info);
            setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          } catch {
            setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          }
        } else {
          setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
        }
      }
    })();
  }, [currentUser?.uid]);

  // 지갑 안내 모달 표시 여부 로드
  useEffect(() => {
    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem('wallet.intro.dismissed');
        if (dismissed !== 'true') setIntroVisible(true);
      } catch {}
    })();
  }, []);

  // 거래 쌍 매칭 자동 확인
  useEffect(() => {
    checkTransactionMatch();
  }, [transactionPair.sendTab, transactionPair.receiveTab]);

  // 지갑 생성 핸들러
  const handleCreateWallet = (coin: {symbol: string, name: string, network: string}) => {
    setSelectedCoin(coin);
    setWalletModalVisible(true);
  };

  // QR 코드 팝업 열기
  const handleOpenQrModal = (coin: {symbol: string, name: string, network: string}) => {
    const wallet = getWalletBySymbol(coin.symbol);
    if (wallet) {
      setQrCoin({
        symbol: coin.symbol,
        name: coin.name,
        network: coin.network,
        address: wallet.address
      });
      setQrModalTab(activeTab); // 현재 탭 정보 전달
      // 지갑을 클릭해 여는 경우: 지갑 뷰 스타일('wallet')로 노출
      setQrModalType('wallet');
      setQrModalVisible(true);
    }
  };

  // 지갑 안내 모달: 확인/취소
  const handleIntroConfirm = async () => {
    try {
      if (introDontShow) await AsyncStorage.setItem('wallet.intro.dismissed', 'true');
    } catch {}
    setIntroVisible(false);
  };
  const handleIntroCancel = () => {
    setIntroVisible(false);
  };

  // 거래 쌍 매칭 확인
  const checkTransactionMatch = () => {
    if (transactionPair.sendTab && transactionPair.receiveTab) {
      const isMatched = 
        transactionPair.sendTab.symbol === transactionPair.receiveTab.symbol &&
        transactionPair.sendTab.amount === transactionPair.receiveTab.amount &&
        transactionPair.sendTab.toAddress === transactionPair.receiveTab.fromAddress;
      
      setTransactionPair(prev => ({
        ...prev,
        isMatched
      }));
    }
  };

  // 보내기 거래 설정
  const setSendTransaction = (symbol: string, amount: string, toAddress: string) => {
    setTransactionPair(prev => ({
      ...prev,
      sendTab: { symbol, amount, toAddress }
    }));
  };

  // 받기 거래 설정
  const setReceiveTransaction = (symbol: string, amount: string, fromAddress: string) => {
    setTransactionPair(prev => ({
      ...prev,
      receiveTab: { symbol, amount, fromAddress }
    }));
  };

  // 주문 처리 함수
  const handleWalletOrder = async () => {
    if (isOrdering) return;
    
    try {
      setIsOrdering(true);
      
      const price = parseFloat(orderPrice) || 0;
      const quantity = parseFloat(orderQuantity) || 0;
      
      // 입력 검증
      if (price <= 0 || quantity <= 0) {
        alert(language === 'en' ? 'Please enter valid price and quantity.' : '가격과 수량을 올바르게 입력하세요.');
        return;
      }
      
      if (!orderSymbol) {
        alert(language === 'en' ? 'Please enter a symbol.' : '종목을 입력하세요.');
        return;
      }
      
      // 주문 데이터 준비
      const orderData = {
        symbol: orderSymbol,
        side: orderType,
        type: 'LIMIT',
        price: price,
        quantity: quantity,
        timestamp: Date.now()
      };
      
      // 개발 환경에서 모의 주문 처리
      const isDevelopment = !process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL.includes('localhost');
      
      let orderResponse;
      
      if (isDevelopment) {
        // 모의 주문 응답 생성
        orderResponse = {
          id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'PENDING',
          ...orderData
        };
        
        // 2초 후 체결 시뮬레이션
        setTimeout(() => {
          const fillData = {
            status: 'FILLED',
            filledQuantity: orderData.quantity,
            filledAmount: orderData.price * orderData.quantity
          };
          
          setOrderResult((prev: any) => ({ ...prev, status: 'FILLED', fillData }));
        }, 2000);
        
      } else {
        // 실제 서버 호출
        const token = accessToken;
        if (!token) {
          alert(language === 'en' ? 'Authentication token not found. Please login again.' : '인증 토큰이 없습니다. 다시 로그인해주세요.');
          return;
        }
        
        const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || (process.env.API_BASE_URL as string) || 'https://api-test.yooyland.com';
        
        const response = await fetch(`${API_BASE}/api/v1/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(orderData)
        });
        
        if (!response.ok) {
          let errorMessage = language === 'en' ? 'Order submission failed' : '주문 전송 실패';
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            const errorText = await response.text();
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        
        orderResponse = await response.json();
      }
      
      setOrderResult(orderResponse);
      setShowOrderReceiptModal(true);
      
      // 입력 필드 초기화
      setOrderPrice('');
      setOrderQuantity('');
      
    } catch (error) {
      console.error('주문 처리 오류:', error);
      alert(`${language === 'en' ? 'Order processing error:' : '주문 처리 중 오류가 발생했습니다:'} ${(error as Error).message}`);
    } finally {
      setIsOrdering(false);
    }
  };

  // 간단 가격/수익 데이터 생성 (대시보드 마켓 뷰 유사)
  const holdingsForMarket = useMemo(() => {
    return realTimeBalances
      .filter(b => !['KRW','USD','JPY','CNY','EUR'].includes(b.symbol))
      .map(b => {
        const currentPrice = b.valueUSD / (b.amount || 1);
        const buyPrice = currentPrice * 0.97; // 임시 매수가
        const currentValue = b.valueUSD;
        const profitLoss = currentValue - (b.amount * buyPrice);
        const profitLossPercent = (profitLoss / Math.max(1, (b.amount * buyPrice))) * 100;
        return { symbol: b.symbol, name: b.name, amount: b.amount, currentPrice, buyPrice, currentValue, profitLoss, profitLossPercent };
      });
  }, [realTimeBalances]);

  // 코인명 번역 토글 및 정렬 상태
  const [useKoreanCoinName, setUseKoreanCoinName] = useState(false);
  const [sortKey, setSortKey] = useState<'price' | 'change' | 'value'>('price');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const sortedHoldingsForMarket = useMemo(() => {
    const arr = [...holdingsForMarket];
    const dir = sortOrder === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === 'price') return (a.currentPrice - b.currentPrice) * dir;
      if (sortKey === 'change') return (a.profitLossPercent - b.profitLossPercent) * dir;
      return (a.currentValue - b.currentValue) * dir;
    });
    return arr;
  }, [holdingsForMarket, sortKey, sortOrder]);

  // 실제 보유한 자산 확인 (amount > 0)
  const hasAsset = (symbol: string) => {
    const balance = realTimeBalances.find(b => b.symbol === symbol);
    return balance && balance.amount > 0;
  };

  // Exchange 페이지의 모든 코인 리스트 (실제 마켓 데이터 기반)
  const getAllExchangeCoins = () => {
    // Exchange 페이지의 모든 마켓 코인들 (중복 제거, YOY 우선)
    const marketCoins = {
      // KRW 마켓 코인들 (업비트 KRW 마켓 상위 50개 + YOY)
      KRW: [
        'YOY', // YOY 코인을 맨 앞에 배치
        'BTC', 'ETH', 'XRP', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC',
        'LINK', 'UNI', 'LTC', 'ATOM', 'NEAR', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA',
        'EOS', 'XTZ', 'SUSHI', 'COMP', 'MKR', 'SNX', 'YFI', 'UMA', 'LRC', 'REN',
        'BNB', 'TRX', 'XLM', 'XMR', 'AAVE', 'FTM', 'SHIB', 'MANA', 'SAND', 'AXS',
        'CHZ', 'ENJ', 'BAT', 'ZRX', 'KNC', 'REP', 'STORJ', 'GNT', 'OMG', 'QTUM',
        'USDT' // USDT는 마지막에 배치
      ],
      
      // USDT 마켓 코인들 (바이낸스 주요 코인 30개)
      USDT: [
        'YOY', 'BTC', 'ETH', 'USDC', 'BNB', 'ADA', 'DOT', 'SOL', 'AVAX', 'ATOM',
        'TRX', 'XLM', 'XMR', 'XRP', 'DOGE', 'LTC', 'LINK', 'UNI', 'AAVE', 'MATIC',
        'SHIB', 'FTM', 'NEAR', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA', 'EOS', 'XTZ'
      ],
      
      // ETH 마켓 코인들 (이더리움 생태계 주요 코인 30개)
      ETH: [
        'YOY', 'BTC', 'USDT', 'LINK', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX', 'YFI',
        'UMA', 'LRC', 'REN', 'KNC', 'BAL', 'CRV', '1INCH', 'GRT', 'SUSHI', 'MATIC',
        'SHIB', 'FTM', 'NEAR', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA', 'EOS', 'XTZ'
      ],
      
      // BTC 마켓 코인들 (비트코인 생태계 주요 코인 30개)
      BTC: [
        'YOY', 'ETH', 'USDT', 'LTC', 'BCH', 'BSV', 'XRP', 'ADA', 'DOT', 'SOL',
        'AVAX', 'ATOM', 'TRX', 'XLM', 'XMR', 'DOGE', 'LINK', 'UNI', 'AAVE', 'MATIC',
        'SHIB', 'FTM', 'NEAR', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA', 'EOS', 'XTZ'
      ],
      
      // 추가 주요 코인들 (마켓에 없는 코인들만)
      OTHER: ['DAI', 'BUSD', 'WBTC', 'LUNA', 'MIR', 'ANC', 'UST', 'KAVA', 'BAND']
    };
    
    // 모든 마켓의 코인들을 수집 (중복 제거)
    const allMarketCoins = new Set([
      ...marketCoins.KRW,
      ...marketCoins.USDT,
      ...marketCoins.ETH,
      ...marketCoins.BTC
    ]);
    
    // 마켓에 없는 추가 코인들만 OTHER에서 추가
    const additionalCoins = marketCoins.OTHER.filter(coin => !allMarketCoins.has(coin));
    
    // 최종 코인 리스트 (YOY가 맨 앞에 오도록)
    const finalCoins = ['YOY', ...Array.from(allMarketCoins).filter(coin => coin !== 'YOY'), ...additionalCoins];
    
    return finalCoins.map(sym => ({
      symbol: sym,
      name: getCoinDisplayName(sym),
      network: getCoinNetwork(sym),
      hasWallet: hasWallet(sym), // 실제 지갑 상태 확인
      hasAsset: hasAsset(sym), // 실제 보유 자산 확인 (amount > 0)
    }));
  };

  // 코인 표시 이름 가져오기
  const getCoinDisplayName = (symbol: string) => {
    const balance = realTimeBalances.find(b => b.symbol === symbol);
    return balance?.name || symbol;
  };

  // 코인 네트워크 결정
  const getCoinNetwork = (symbol: string) => {
    // Layer 1 블록체인
    if (symbol === 'BTC') return 'Bitcoin';
    if (symbol === 'ETH') return 'Ethereum';
    if (symbol === 'BNB') return 'BSC';
    if (symbol === 'MATIC') return 'Polygon';
    if (symbol === 'AVAX') return 'Avalanche';
    if (symbol === 'SOL') return 'Solana';
    if (symbol === 'DOT') return 'Polkadot';
    if (symbol === 'ATOM') return 'Cosmos';
    if (symbol === 'XLM') return 'Stellar';
    if (symbol === 'XRP') return 'Ripple';
    if (symbol === 'TRX') return 'Tron';
    if (symbol === 'LTC') return 'Litecoin';
    if (symbol === 'DOGE') return 'Dogecoin';
    if (symbol === 'XMR') return 'Monero';
    if (symbol === 'ADA') return 'Cardano';
    if (symbol === 'ALGO') return 'Algorand';
    if (symbol === 'VET') return 'VeChain';
    if (symbol === 'ICP') return 'Internet Computer';
    if (symbol === 'FIL') return 'Filecoin';
    if (symbol === 'THETA') return 'Theta';
    if (symbol === 'EOS') return 'EOS';
    if (symbol === 'XTZ') return 'Tezos';
    if (symbol === 'NEAR') return 'NEAR';
    if (symbol === 'FTM') return 'Fantom';
    if (symbol === 'LUNA') return 'Terra';
    if (symbol === 'KAVA') return 'Kava';
    
    // YOY 네트워크
    if (symbol === 'YOY') return 'YOY';
    
    // Stablecoins
    if (symbol === 'USDT' || symbol === 'USDC' || symbol === 'DAI' || symbol === 'UST') return 'Ethereum';
    
    // DeFi 토큰들 (대부분 Ethereum)
    if (['LINK', 'UNI', 'AAVE', 'SUSHI', 'COMP', 'MKR', 'SNX', 'YFI', 'UMA', 'LRC', 'REN', 'KNC', 'BAL', 'CRV', '1INCH', 'GRT', 'SHIB', 'WBTC'].includes(symbol)) {
      return 'Ethereum';
    }
    
    return 'Ethereum'; // 기본값
  };

  // (사용 안 함) 폴백 로고 컴포넌트는 제거

  // 코인 로고 컴포넌트: 로고 없으면 빈 상태 유지
  const CoinLogo = ({ symbol }: { symbol: string }) => {
    const [error, setError] = useState(false);
    if (symbol === 'YOY') {
      return <Image source={require('@/assets/images/yoy.png')} style={styles.walletLogo} />;
    }
    if (error) {
      return <View style={styles.walletLogoEmpty} />;
    }
    return (
      <Image
        source={{ uri: `https://static.upbit.com/logos/${symbol}.png` }}
        style={styles.walletLogo}
        onError={() => setError(true)}
      />
    );
  };

  // 발행한 코인 수와 전체 코인 수 계산
  const allCoins = getAllExchangeCoins();
  const createdWalletsCount = allCoins.filter(c => c.hasWallet).length;
  const totalCoinsCount = allCoins.length;

  // 주요 코인 우선순위 정의 (YOY가 맨 처음, 마켓별 주요 코인들 포함)
  const majorCoins = [
    'YOY', 'BTC', 'ETH', 'USDT', 'USDC', // 기본 주요 코인
    'SOL', 'DOT', 'BNB', 'AVAX', 'LTC', 'LINK', 'ADA', 'ATOM', 'XLM', 'XRP', 'DOGE', 'TRX', // KRW/USDT 마켓 주요 코인
    'UNI', 'AAVE', 'MATIC', 'SHIB', 'FTM', 'NEAR', 'ALGO', 'VET', 'ICP', 'FIL', 'THETA', 'EOS', 'XTZ', // 추가 주요 코인
    'SUSHI', 'COMP', 'MKR', 'SNX', 'YFI', 'UMA', 'LRC', 'REN', 'KNC', 'BAL', 'CRV', '1INCH', 'GRT', // DeFi 코인
    'LUNA', 'MIR', 'ANC', 'UST', 'KAVA', 'BAND', 'WBTC', 'DAI' // 기타 주요 코인
  ];

  // 코인 정렬: 생성된 지갑 우선, 그 다음 주요 코인 순 (YOY가 맨 처음), 나머지는 알파벳 순
  const walletCoins = allCoins.sort((a, b) => {
    // 1순위: 생성된 지갑 우선
    if (a.hasWallet && !b.hasWallet) return -1;
    if (!a.hasWallet && b.hasWallet) return 1;
    
    // 2순위: YOY가 항상 맨 처음 (지갑 생성 여부와 무관)
    if (a.symbol === 'YOY' && b.symbol !== 'YOY') return -1;
    if (a.symbol !== 'YOY' && b.symbol === 'YOY') return 1;
    
    // 3순위: 주요 코인 우선 (YOY 제외)
    const aIsMajor = majorCoins.includes(a.symbol);
    const bIsMajor = majorCoins.includes(b.symbol);
    if (aIsMajor && !bIsMajor) return -1;
    if (!aIsMajor && bIsMajor) return 1;
    
    // 4순위: 알파벳 순
    return a.symbol.localeCompare(b.symbol);
  });

  // 기본 선택 코인을 생성된 지갑 보유 코인으로 설정
  useEffect(() => {
    const created = walletCoins.filter(c => c.hasWallet);
    if (created.length > 0) {
      if (!sendSelectedSymbol) {
        setSendSelectedSymbol(created[0].symbol);
      }
      if (!recvSelectedSymbol) {
        setRecvSelectedSymbol(created[0].symbol);
        const wallet = getWalletBySymbol(created[0].symbol);
        if (wallet) setRecvAddress(wallet.address);
      }
    }
  }, [walletCoins]);

  // 붙여넣기 등으로 주소에 yooy://pay URL이 들어온 경우 자동 채움
  useEffect(() => {
    try {
      const only = extractYooyPayUrl(sendToAddress);
      if (only) {
        const parsed = parsePayUri(only);
        if (parsed) {
          setSendSelectedSymbol((parsed.sym || 'YOY').toUpperCase());
          setSendAmountType('quantity');
          setSendInput(parsed.amt || '');
          setSendToAddress(parsed.addr || '');
          // 요청 원본 저장(검증/가이드용)
          setIsRequest(true);
          setOriginalUrlData(parsed as any);
          setSendErrorText(null);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendToAddress]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title={username} 
        onMenuPress={() => setMenuOpen(true)}
        onProfilePress={() => setProfileOpen(true)}
        avatarUri={avatarUri} 
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator
        refreshControl={<RefreshControl refreshing={refreshingWallet} onRefresh={onRefreshWallet} tintColor="#FFD700" colors={['#FFD700']} />}
      >
        {/* 탭 바 */}
        <View style={styles.tabBar}>
          {[
            { key: 'assets', label: t('walletAssets', language) },
            { key: 'send', label: t('walletSend', language) },
            { key: 'receive', label: t('walletReceive', language) },
            { key: 'history', label: language === 'en' ? 'History' : t('walletHistory', language) },
            
            { key: 'gift', label: language === 'en' ? 'Gift' : '기프트' },
          ].map(t => (
            <TouchableOpacity key={t.key} style={[styles.tabBtn, activeTab === (t.key as TabKey) && styles.tabBtnActive]} onPress={() => setActiveTab(t.key as TabKey)}>
              <ThemedText style={[styles.tabText, activeTab === (t.key as TabKey) && styles.tabTextActive]}>{t.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* 중복 Total 라인은 제거됨 */}

        {/* 탭 컨텐츠 */}
        {activeTab === 'assets' && (
          <View>
            {/* 보유 총자산 카드 섹션 */}
            <LinearGradient colors={['#1B0D2A','#21113A','#161327']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.assetCardBg}>
              <View style={styles.assetCardBorder}>
                <View style={[styles.cardContent,{ alignItems:'stretch' }]}>
                  <View style={styles.assetHeaderRow}>
                    <ThemedText style={styles.totalLabel}>{language === 'en' ? `Total Assets (${currency})` : `총 보유 자산 (${currency})`}</ThemedText>
                    <ThemedText style={styles.assetsCountText}>{realTimeBalances.length} Assets</ThemedText>
                  </View>
                  <ThemedText style={[styles.totalAmount,{ color:'#FFD700', textAlign:'center' }]}>{formatCurrency(total, currency, rates)}</ThemedText>
                  <Image source={require('@/assets/images/logo.png')} style={styles.cardCornerLogo} resizeMode="contain" />
                </View>
              </View>
              {!!giftStatus && (
                <View style={{ marginTop:8, padding:8, borderRadius:8, borderWidth:1, borderColor: giftStatusTone==='success' ? '#2E7D32' : giftStatusTone==='error' ? '#B71C1C' : giftStatusTone==='warn' ? '#E0A800' : '#375A64', backgroundColor:'#0F171B' }}>
                  <ThemedText style={{ color: giftStatusTone==='success' ? '#A5D6A7' : giftStatusTone==='error' ? '#FFCDD2' : giftStatusTone==='warn' ? '#FFE08A' : '#CFE3E8' }}>
                    {giftStatus}
                  </ThemedText>
                </View>
              )}
            </LinearGradient>

            {/* 빠른 액션 */}
            <View style={styles.quickHeaderRow}>
              <ThemedText style={styles.quickHeader}>{t('quickActions', language)}</ThemedText>
            </View>
            <View style={styles.quickGrid}>
              {quickEntries.filter(e => (quickActionsState as any)[e.key]).map(renderQuickTile)}
              {quickActionsState.chat !== false && (
                <TouchableOpacity style={styles.quickTile} onPress={()=>setQuickSettingsVisible(true)}>
                  <View style={styles.tileIcon}><ThemedText style={styles.tileIconText}>⋯</ThemedText></View>
                  <ThemedText style={styles.tileText}>Quick Set</ThemedText>
                </TouchableOpacity>
              )}
            </View>
            {/* 헤더 (빠른 액션 아래 충분한 여백 확보) */}
            <View style={styles.listHeader}>
              <TouchableOpacity style={[styles.headerCol, styles.headerColName]} onPress={()=>setUseKoreanCoinName(v=>!v)}>
                <ThemedText style={[styles.headerText, useKoreanCoinName && { color: '#FFD700' }]}>Coin/Market</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerColRight} onPress={()=>{ setSortKey('price'); setSortOrder(o=> (sortKey==='price' && o==='desc') ? 'asc' : 'desc'); }}>
                {(() => { const label = t('currentPriceBuyPrice', language); const parts = label.split('/'); return parts.length>1 ? (
                  <View style={styles.headerTwoLine}>
                    <ThemedText style={[styles.headerTextRight, (sortKey==='price' && sortOrder==='asc') && { color: '#FFD700' }]}>{parts[0].trim()}</ThemedText>
                    <ThemedText style={[styles.headerSubTextRight, (sortKey==='price' && sortOrder==='asc') && { color: '#FFD700' }]}>{parts[1].trim()}</ThemedText>
                  </View>
                ) : (<ThemedText style={styles.headerTextRight}>{label}</ThemedText>); })()}
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerColRight} onPress={()=>{ setSortKey('change'); setSortOrder(o=> (sortKey==='change' && o==='desc') ? 'asc' : 'desc'); }}>
                {(() => { const label = t('profitRateProfitAmount', language); const parts = label.split('/'); return parts.length>1 ? (
                  <View style={styles.headerTwoLine}>
                    <ThemedText style={[styles.headerTextRight, (sortKey==='change' && sortOrder==='asc') && { color: '#FFD700' }]}>{parts[0].trim()}</ThemedText>
                    <ThemedText style={[styles.headerSubTextRight, (sortKey==='change' && sortOrder==='asc') && { color: '#FFD700' }]}>{parts[1].trim()}</ThemedText>
                  </View>
                ) : (<ThemedText style={styles.headerTextRight}>{label}</ThemedText>); })()}
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerColRight} onPress={()=>{ setSortKey('value'); setSortOrder(o=> (sortKey==='value' && o==='desc') ? 'asc' : 'desc'); }}>
                <ThemedText style={[styles.headerTextRight, (sortKey==='value' && sortOrder==='asc') && { color: '#FFD700' }]}>{t('totalHoldings', language)}</ThemedText>
              </TouchableOpacity>
            </View>
            {/* 리스트 */}
            {sortedHoldingsForMarket.map((h) => {
              const isProfit = h.profitLoss >= 0;
              return (
                <TouchableOpacity 
                  key={h.symbol} 
                  style={styles.marketRow}
                  onPress={() => handleCoinPress(h)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.headerCol, styles.headerColName, { flexDirection: 'row', alignItems: 'center' }]}>
                    <View style={styles.coinIcon}>
                      {h.symbol === 'YOY' ? (
                        <Image source={require('@/assets/images/yoy.png')} style={styles.coinLogo} />
                      ) : (
                        <Image source={{ uri: `https://static.upbit.com/logos/${h.symbol}.png` }} style={styles.coinLogo} />
                      )}
                    </View>
                    <View>
                      <ThemedText style={styles.coinSymbol}>{useKoreanCoinName ? (t(`coinNames.${h.symbol as any}`, 'ko') || h.name) : h.symbol}</ThemedText>
                      <ThemedText style={styles.coinPair}>{useKoreanCoinName ? (t(`coinNames.${h.symbol as any}`, 'ko') || h.name) : `${h.symbol}/USD`}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.headerCol}>
                    <ThemedText style={styles.cellText}>${h.currentPrice.toLocaleString('en-US', {minimumFractionDigits: 4, maximumFractionDigits: 4})}</ThemedText>
                    <ThemedText style={[styles.cellSubText]}>${h.buyPrice.toLocaleString('en-US', {minimumFractionDigits: 4, maximumFractionDigits: 4})}</ThemedText>
                  </View>
                  <View style={styles.headerCol}>
                    <ThemedText style={[styles.cellText, { color: isProfit ? '#4CAF50' : '#F44336' }]}>{isProfit ? '+' : ''}{h.profitLossPercent.toFixed(2)}%</ThemedText>
                    <ThemedText style={[styles.cellSubText, { color: isProfit ? '#4CAF50' : '#F44336' }]}>{isProfit ? '+' : ''}${Math.abs(h.profitLoss).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</ThemedText>
                  </View>
                  <View style={styles.headerCol}>
                    <ThemedText style={styles.cellText}>${h.currentValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {activeTab === 'gift' && (
          <View>
            {/* 기프트 수령 */}
            <View style={{ gap: 10, padding: 12, borderWidth: 2, borderColor: '#FFD700', borderRadius: 12, backgroundColor: '#0F171B', marginTop: 8 }}>
              <ThemedText style={{ color:'#EDEDED', fontSize: 16 }}>{language==='en'?'Event gift':'기프트 수령'}</ThemedText>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <TextInput value={giftClaimInput} onChangeText={setGiftClaimInput} placeholder={language==='en'?'Paste event link (yooy://claim) here':'이벤트 링크(yooy://claim)를 붙여넣으세요'} placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
                {/* 수령하기: 상태 안내 + 성공 시 거래내역 팝업 */}
                <TouchableOpacity onPress={handleEventClaimClick} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#FFD700', backgroundColor:'#FFD700', borderRadius:8 }}>
                  <ThemedText style={{ color:'#000' }}>{language==='en'?'Event':'수령하기'}</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection:'row', gap:8 }}>
                <TouchableOpacity onPress={handlePasteGift} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Paste':'붙여넣기'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleImageGift} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'QR Image':'QR이미지'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={async()=>{
                  try {
                    if (VisionCamera) {
                      const status = await VisionCamera.requestCameraPermission();
                      const granted = status === 'authorized';
                      setHasCamPerm(granted);
                      if (granted) {
                        setScanOpen(true);
                      } else {
                        Alert.alert(
                          language==='en'?'Camera permission required':'카메라 권한 필요',
                          language==='en'?'Please allow camera access to scan QR codes.':'QR 코드를 스캔하려면 카메라 접근을 허용해주세요.'
                        );
                      }
                    } else if ((Platform as any).OS === 'web') {
                      setScanOpen(true);
                    } else {
                      // VisionCamera 미사용 네이티브: Expo Camera로 대체
                      try {
                        if (ExpoCamera?.requestCameraPermissionsAsync) {
                          const perm = await ExpoCamera.requestCameraPermissionsAsync();
                          const granted = perm?.status === 'granted';
                          setHasCamPerm(granted);
                          if (granted) {
                            setScanOpen(true);
                          } else {
                            Alert.alert(
                              language==='en'?'Camera permission required':'카메라 권한 필요',
                              language==='en'?'Please allow camera access to scan QR codes.':'QR 코드를 스캔하려면 카메라 접근을 허용해주세요.'
                            );
                          }
                        } else {
                          Alert.alert(
                            language==='en'?'Scanner unavailable':'스캐너를 사용할 수 없습니다',
                            language==='en'?'This build does not include camera scanning.':'현재 빌드에서는 카메라 스캔이 비활성화되어 있습니다.'
                          );
                        }
                      } catch {
                        Alert.alert(
                          language==='en'?'Scanner unavailable':'스캐너를 사용할 수 없습니다',
                          language==='en'?'This build does not include camera scanning.':'현재 빌드에서는 카메라 스캔이 비활성화되어 있습니다.'
                        );
                      }
                    }
                  } catch (e) {
                    Alert.alert(language==='en'?'Scan error':'스캔 오류', String(e instanceof Error ? e.message : e));
                  }
                }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Scan':'카메라'}</ThemedText>
                </TouchableOpacity>
                {!!pendingGift && pendingGift.status === 'active' && (
                  <TouchableOpacity onPress={handleClaimGift} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#FFD700', borderRadius:8, backgroundColor:'#FFD700' }}>
                    <ThemedText style={{ color:'#000' }}>{language==='en'?'Claim':'받기'}</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
              {!!pendingGift && (
                <View style={{ marginTop:6 }}>
                  <ThemedText style={{ color:'#9AB' }}>
                    {pendingGift.symbol} • {
                      pendingGift.status==='active' ? (language==='en'?'Active':'진행중') :
                      pendingGift.status==='exhausted' ? (language==='en'?'Exhausted':'소진') :
                      pendingGift.status==='expired' ? (language==='en'?'Expired':'만료') :
                      (language==='en'?'Cancelled':'종료')
                    }
                  </ThemedText>
                </View>
              )}
            </View>
            <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: '#1F2C31', borderRadius: 12, backgroundColor: '#0F171B', marginTop: 8 }}>
              <ThemedText style={{ color:'#EDEDED', fontSize: 16 }}>{language==='en'?'Create gift':'기프트 생성'}</ThemedText>
              <View style={{ flexDirection:'row', gap:8 }}>
                <TouchableOpacity onPress={()=>setGiftMode('per_claim')} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: giftMode==='per_claim' ? '#FFD700' : '#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color: giftMode==='per_claim' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'Per-claim':'1인당 고정'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setGiftMode('total')} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: giftMode==='total' ? '#FFD700' : '#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color: giftMode==='total' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'Total':'총액'}</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Coin':'코인'}</ThemedText>
                <View style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color:'#EDEDED' }}>YOY</ThemedText>
                </View>
              </View>
              {giftMode==='per_claim' ? (
                <>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Amount':'수량'}</ThemedText>
                    <TextInput value={giftPerClaimAmount} onChangeText={setGiftPerClaimAmount} keyboardType="numeric" placeholder="10" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
                  </View>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'People':'인원'}</ThemedText>
                    <TextInput value={giftClaimLimit} onChangeText={setGiftClaimLimit} keyboardType="numeric" placeholder="5" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Total':'총액'}</ThemedText>
                    <TextInput value={giftTotalAmount} onChangeText={setGiftTotalAmount} keyboardType="numeric" placeholder="100" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
                  </View>
                  <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                    <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Policy':'정책'}</ThemedText>
                    <TouchableOpacity onPress={()=>setGiftTotalPolicy('all')} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: giftTotalPolicy==='all' ? '#FFD700' : '#2B3A3F', borderRadius:8 }}>
                      <ThemedText style={{ color: giftTotalPolicy==='all' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'All at once':'전액'}</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={()=>setGiftTotalPolicy('equal')} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: giftTotalPolicy==='equal' ? '#FFD700' : '#2B3A3F', borderRadius:8 }}>
                      <ThemedText style={{ color: giftTotalPolicy==='equal' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'Equal':'균등'}</ThemedText>
                    </TouchableOpacity>
                  </View>
                  {giftTotalPolicy==='equal' && (
                    <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                      <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'People':'인원'}</ThemedText>
                      <TextInput value={giftTotalPeople} onChangeText={setGiftTotalPeople} keyboardType="numeric" placeholder="5" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
                      <ThemedText style={{ color:'#9AB' }}>
                        {(() => {
                          const tot = Number(giftTotalAmount || 0);
                          const ppl = Math.max(1, Math.floor(Number(giftTotalPeople || 1)));
                          return ppl ? `${(tot/ppl || 0).toFixed(6)} YOY / 1인` : '';
                        })()}
                      </ThemedText>
                    </View>
                  )}
                </>
              )}
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Expires':'만료일'}</ThemedText>
                <TextInput value={giftExpiresISO} onChangeText={setGiftExpiresISO} placeholder="YYYY-MM-DD (optional)" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
              </View>
              <TouchableOpacity
                disabled={giftCreating}
                onPress={async ()=>{
                  try {
                    setGiftCreating(true);
                    const symbol = 'YOY';
                    const voucher = await createVoucher({
                      createdByEmail: currentUserEmail,
                      symbol,
                      mode: giftMode,
                      perClaimAmount: giftMode==='per_claim' ? Number(giftPerClaimAmount || 0) : (giftTotalPolicy==='equal' ? Number(giftTotalAmount || 0) / Math.max(1, Math.floor(Number(giftTotalPeople || 1))) : undefined),
                      claimLimit: giftMode==='per_claim' ? Math.floor(Number(giftClaimLimit || 0)) : (giftTotalPolicy==='equal' ? Math.floor(Number(giftTotalPeople || 0)) : undefined),
                      totalAmount: giftMode==='total' ? Number(giftTotalAmount || 0) : undefined,
                      totalPolicy: giftMode==='total' ? giftTotalPolicy : undefined,
                      maxPerUser: 1,
                      expiresAtISO: giftExpiresISO || null,
                    });
                    const url = buildClaimUri(voucher.id);
                    setCustomQrPayload(url);
                    setCustomQrVisible(true);
                    // 낙관적 목록 반영: 구독 응답이 느린 환경에서도 즉시 보이도록
                    try {
                      setGiftList((prev) => {
                        const exists = prev.some((v) => v.id === voucher.id);
                        if (exists) return prev;
                        return [voucher as any, ...prev];
                      });
                    } catch {}
                    // 잔액 예치(로컬 차감)
                    try {
                      const storageKey = `user_balances_${currentUserEmail}`;
                      const saved = await AsyncStorage.getItem(storageKey);
                      const parsed = saved ? JSON.parse(saved) : {};
                      const totalDeduct = giftMode==='per_claim'
                        ? (Number(giftPerClaimAmount||0) * Math.floor(Number(giftClaimLimit||0)))
                        : Number(giftTotalAmount||0);
                      parsed[symbol] = Math.max(0, (parsed[symbol] || 0) - totalDeduct);
                      await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
                    } catch {}
                    // 거래내역 기록(보낸 사람 - 예약 차감)
                    try {
                      const reserved = (giftMode==='per_claim'
                        ? Math.max(0, Number(giftPerClaimAmount || 0)) * Math.max(1, Number(giftClaimLimit || 0))
                        : Math.max(0, Number(giftTotalAmount || 0)));
                      await addTransaction({
                        id: `tx_gift_${voucher.id}`,
                        type: 'send',
                        symbol,
                        amount: reserved,
                        to: `voucher:${voucher.id}`,
                        from: 'me',
                        description: 'Gift created',
                        status: 'completed',
                        success: true,
                        hash: `voucher_create_${voucher.id}`,
                        blockTimestamp: new Date().toISOString(),
                      } as any);
                    } catch {}
                    Alert.alert(language==='en'?'Gift created':'기프트 생성됨');
                  } catch (e) {
                    // 서버 저장 실패: 임시 로컬 바우처로라도 QR을 보여준다
                    try {
                      const tmpId = `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
                      const tmpVoucher: any = {
                        id: tmpId,
                        createdByEmail: currentUserEmail || '',
                        symbol,
                        mode: giftMode,
                        perClaimAmount: giftMode==='per_claim' ? Number(giftPerClaimAmount || 0) : (giftTotalPolicy==='equal' ? Number(giftTotalAmount || 0) / Math.max(1, Math.floor(Number(giftTotalPeople || 1))) : undefined),
                        claimLimit: giftMode==='per_claim' ? Math.floor(Number(giftClaimLimit || 0)) : (giftTotalPolicy==='equal' ? Math.floor(Number(giftTotalPeople || 0)) : undefined),
                        totalAmount: giftMode==='total' ? Number(giftTotalAmount || 0) : undefined,
                        totalPolicy: giftMode==='total' ? giftTotalPolicy : undefined,
                        remainingAmount: giftMode==='total' ? Number(giftTotalAmount || 0) : undefined,
                        claimedCount: 0,
                        claimedTotal: 0,
                        status: 'active',
                      };
                      const url = buildClaimUri(tmpId);
                      setCustomQrPayload(url);
                      setCustomQrVisible(true);
                      setGiftList((prev)=>[tmpVoucher, ...prev]);
                      Alert.alert(language==='en'?'Created (offline preview)':'임시 QR 미리보기', language==='en'?'Server unreachable. Showing a temporary QR preview.':'서버 연결 실패. 임시 QR 미리보기를 표시합니다.');
                    } catch {}
                    Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
                  } finally {
                    setGiftCreating(false);
                  }
                }}
                style={{ alignSelf:'flex-end', backgroundColor:'#FFD700', paddingHorizontal:16, paddingVertical:10, borderRadius:10 }}
              >
                <ThemedText style={{ color:'#000' }}>{giftCreating ? (language==='en'?'Creating...':'생성 중...') : (language==='en'?'Create':'생성')}</ThemedText>
              </TouchableOpacity>
              <ThemedText style={{ color:'#888', fontSize:12 }}>
                {language==='en'
                  ? 'You can end an event only at 0% progress or after 80% progress.'
                  : '진행 0% 또는 80% 이상일 때만 이벤트를 종료할 수 있습니다.'}
              </ThemedText>
            </View>
            <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: '#1F2C31', borderRadius: 12, backgroundColor: '#0F171B', marginTop: 12 }}>
              <ThemedText style={{ color:'#EDEDED', fontSize:16 }}>{language==='en'?'My gifts':'내 기프트'}</ThemedText>
              {giftList.map(v => {
                const url = buildClaimUri(v.id);
                const progress = v.mode==='per_claim'
                  ? `${v.claimedCount}/${v.claimLimit}`
                  : `${v.claimedTotal}/${v.totalAmount}`;
                const statusText =
                  v.status === 'active' ? (language==='en'?'Active':'진행중') :
                  v.status === 'exhausted' ? (language==='en'?'Exhausted':'소진') :
                  v.status === 'expired' ? (language==='en'?'Expired':'만료') :
                  (language==='en'?'Cancelled':'취소됨');
                // 종료 가능 여부
                const ratio = v.mode==='per_claim'
                  ? ((v.claimedCount || 0) / Math.max(1, Number(v.claimLimit || 1)))
                  : ((v.claimedTotal || 0) / Math.max(1, Number(v.totalAmount || 1)));
                const canEndNow = v.status === 'active' && ((v.claimedCount || 0) === 0 || ratio >= 0.8);
                return (
                  <View key={v.id} style={{ padding:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, gap:8 }}>
                    <ThemedText style={{ color:'#EDEDED' }}>
                      {v.symbol} • {v.mode==='per_claim' ? (language==='en'?'Per-claim':'1인당') : (language==='en'?'Total':'총액')}
                      {v.mode==='total' && v.totalPolicy ? ` • ${v.totalPolicy==='all' ? (language==='en'?'All':'전액') : (language==='en'?'Equal':'균등')}` : ''} • {statusText}
                    </ThemedText>
                    <ThemedText style={{ color:'#CFCFCF' }}>
                      {v.mode==='per_claim'
                        ? `${language==='en'?'Amount':'수량'}: ${v.perClaimAmount} • ${language==='en'?'People':'인원'}: ${v.claimLimit}`
                        : `${language==='en'?'Total':'총액'}: ${v.totalAmount} • ${language==='en'?'Remaining':'남은량'}: ${v.remainingAmount ?? 0}` + (v.totalPolicy==='equal' ? ` • ${language==='en'?'Per':'1인당'}: ${v.perClaimAmount}` : '')}
                    </ThemedText>
                    {!!v.expiresAt && (
                      <ThemedText style={{ color:'#9AB' }}>
                        {language==='en'?'Expires':'만료'}: {new Date(v.expiresAt.toMillis()).toISOString().slice(0,10)}
                      </ThemedText>
                    )}
                    {/* 항상 보이는 QR 미리보기 + 링크 */}
                    <View style={{ flexDirection:'row', alignItems:'center', gap:12, marginTop:4 }}>
                      <View style={{ width:96, height:96, borderRadius:8, overflow:'hidden', backgroundColor:'#fff', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#D32F2F' }}>
                        {(() => {
                          const img = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=H&margin=16&color=000000&bgcolor=ffffff&data=${encodeURIComponent(url)}`;
                          return <Image source={{ uri: img }} style={{ width:96, height:96 }} />;
                        })()}
                      </View>
                      <View style={{ flex:1, gap:6 }}>
                        <ThemedText style={{ color:'#9AB' }} numberOfLines={2} ellipsizeMode="middle">{url}</ThemedText>
                        <View style={{ flexDirection:'row', gap:8 }}>
                          <TouchableOpacity onPress={async()=>{ try { await (navigator as any)?.clipboard?.writeText?.(url); Alert.alert(language==='en'?'Copied':'복사됨'); } catch {} }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                            <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Copy link':'링크 복사'}</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={()=>{ setCustomQrPayload(url); setCustomQrVisible(true); }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                            <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Open QR':'QR 크게'}</ThemedText>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <ThemedText style={{ color:'#9AB' }}>{language==='en'?'Progress':'진행도'}: {progress}</ThemedText>
                    <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
                      <TouchableOpacity onPress={()=>{ setCustomQrPayload(url); setCustomQrVisible(true); }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                        <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Share QR':'QR 공유'}</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={async()=>{ try { await (navigator as any)?.clipboard?.writeText?.(url); Alert.alert(language==='en'?'Copied':'복사됨'); } catch {} }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                        <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Copy link':'링크 복사'}</ThemedText>
                      </TouchableOpacity>
                      {canEndNow && (
                        <TouchableOpacity
                          onPress={async()=>{
                            try {
                              const ok = await new Promise<boolean>((resolve)=>{
                                Alert.alert(
                                  language==='en'?'End event?':'이벤트 종료',
                                  language==='en'?'You can end only at 0% or after 80% progress.':'0% 또는 80% 이상 진행 시에만 종료할 수 있습니다.',
                                  [
                                    { text: language==='en'?'Cancel':'취소', style:'cancel', onPress:()=>resolve(false) },
                                    { text: language==='en'?'End':'종료', style:'destructive', onPress:()=>resolve(true) },
                                  ]
                                );
                              });
                              if (!ok) return;
                              if (/^local_/i.test(v.id)) {
                                setGiftList(prev => prev.map(it => it.id===v.id ? ({ ...it, status: 'cancelled' } as any) : it));
                                Alert.alert(language==='en'?'Ended (local)':'종료됨(로컬)');
                                return;
                              }
                              const res = await endVoucher({ id: v.id, requestedByEmail: currentUserEmail || v.createdByEmail || '' });
                              if ((res as any)?.ok) {
                                try {
                                  setGiftList(prev => prev.map(it => it.id===v.id ? ({ ...it, status: 'cancelled' } as any) : it));
                                } catch {}
                                Alert.alert(language==='en'?'Ended':'종료됨');
                              } else {
                                // 개발환경/권한 문제 시 로컬 종료 허용
                                setGiftList(prev => prev.map(it => it.id===v.id ? ({ ...it, status: 'cancelled' } as any) : it));
                                Alert.alert(language==='en'?'Ended (local)':'종료됨(로컬)');
                              }
                            } catch (e:any) {
                              Alert.alert(language==='en'?'Error':'오류', String(e?.message || e));
                            }
                          }}
                          style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#D32F2F', borderRadius:8 }}
                        >
                          <ThemedText style={{ color:'#D32F2F' }}>{language==='en'?'End':'종료'}</ThemedText>
                        </TouchableOpacity>
                      )}
                      {v.status === 'cancelled' && (
                        <TouchableOpacity
                          onPress={async()=>{
                            try {
                              const ok = await new Promise<boolean>((resolve)=>{
                                Alert.alert(
                                  language==='en'?'Delete event?':'이벤트 삭제',
                                  language==='en'?'This will permanently remove the event.':'이 이벤트를 영구 삭제합니다.',
                                  [
                                    { text: language==='en'?'Cancel':'취소', style:'cancel', onPress:()=>resolve(false) },
                                    { text: language==='en'?'Delete':'삭제', style:'destructive', onPress:()=>resolve(true) },
                                  ]
                                );
                              });
                              if (!ok) return;
                              const { deleteVoucher } = await import('@/lib/claims');
                              const res = await deleteVoucher({ id: v.id, requestedByEmail: currentUserEmail });
                              if ((res as any)?.ok) {
                                setGiftList(prev => prev.filter(it => it.id !== v.id));
                                Alert.alert(language==='en'?'Deleted':'삭제됨');
                              } else {
                                Alert.alert(language==='en'?'Delete failed':'삭제 실패', String((res as any)?.error || 'fail'));
                              }
                            } catch (e:any) {
                              Alert.alert(language==='en'?'Error':'오류', String(e?.message || e));
                            }
                          }}
                          style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#8B0000', borderRadius:8 }}
                        >
                          <ThemedText style={{ color:'#FF6B6B' }}>{language==='en'?'Delete':'삭제'}</ThemedText>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {activeTab === 'send' && (
          <View>
            <ThemedText type="subtitle">{t('send', language)}</ThemedText>
            
              {/* 상단 송금 폼 (스샷 스타일) */}
              <View style={styles.sendBox}>

              {/* 보내는 코인 선택 */}
              <ThemedText style={styles.sendLabel}>{t('sendingCoin', language)}</ThemedText>
              <View style={styles.selectWrap}>
                <TouchableOpacity style={styles.selectField} onPress={()=>setSendSelectOpen(v=>!v)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.selectIcon}>
                      <Image 
                        source={sendSelectedSymbol==='YOY' 
                          ? require('@/assets/images/yoy.png') 
                          : { uri: `https://static.upbit.com/logos/${sendSelectedSymbol}.png` }} 
                        style={{ width: 20, height: 20, borderRadius: 10 }} 
                      />
                    </View>
                    <ThemedText style={styles.selectText}>{sendSelectedSymbol}</ThemedText>
                  </View>
                  <View style={styles.selectChevron} />
                </TouchableOpacity>
                {sendSelectOpen && (
                  <View style={styles.dropdown}
                  >
                  {walletCoins.filter(c=>c.hasWallet).map(c => (
                    <TouchableOpacity key={`send-dd-${c.symbol}`} style={styles.dropdownItem} onPress={()=>{ setSendSelectedSymbol(c.symbol); setSendSelectOpen(false); }}>
                      <ThemedText style={styles.dropdownText}>{c.symbol}</ThemedText>
                    </TouchableOpacity>
                  ))}
                  </View>
                )}
              </View>


              {/* 수량/금액 토글 */}
              <View style={{ flexDirection:'row', alignItems:'center', gap:18, marginTop:8, marginBottom:8 }}>
                <TouchableOpacity 
                  style={[styles.toggleButton, sendAmountType === 'quantity' && styles.toggleButtonActive]}
                  onPress={() => {
                    if (sendAmountType === 'amount' && sendInput) {
                      // 금액 → 수량 변환
                      const currentAmount = parseFloat(sendInput);
                      const quantity = convertAmountToQuantity(currentAmount, sendSelectedSymbol);
                      setSendInput(quantity.toString());
                    }
                    setSendAmountType('quantity');
                  }}
                >
                  <ThemedText style={[styles.toggleButtonText, sendAmountType === 'quantity' && styles.toggleButtonTextActive]}>
                    {t('quantity', language)}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleButton, sendAmountType === 'amount' && styles.toggleButtonActive]}
                  onPress={() => {
                    if (sendAmountType === 'quantity' && sendInput) {
                      // 수량 → 금액 변환
                      const currentQuantity = parseFloat(sendInput);
                      const amount = convertQuantityToAmount(currentQuantity, sendSelectedSymbol);
                      setSendInput(amount.toString());
                    }
                    setSendAmountType('amount');
                  }}
                >
                  <ThemedText style={[styles.toggleButtonText, sendAmountType === 'amount' && styles.toggleButtonTextActive]}>
                    {t('amount', language)}
                  </ThemedText>
                </TouchableOpacity>
                {!pricesLoaded && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ActivityIndicator size="small" color="#FFD700" />
                    <ThemedText style={{ color: '#FFD700', fontSize: 12 }}>
                      {t('loadingPrices', language)}
                    </ThemedText>
                    <ThemedText style={{ color: '#888', fontSize: 10 }}>
                      {language === 'en' ? '(Using fallback)' : '(기본값 사용)'}
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* 비율 버튼 (토글 아래 배치) */}
              <View style={[styles.pctRow]}>
                {[10,25,50,100].map(p => (
                  <TouchableOpacity key={p} onPress={() => {
                    setSendPct(p);
                    if (sendAmountType === 'quantity') {
                      // 보유 수량 기준
                      const q = (ownedSendAmount * p) / 100;
                      setSendInput(String(q));
                    } else {
                      // 금액 기준: 보유 수량 → 금액 환산 후 비율
                      const totalAmount = convertQuantityToAmount(ownedSendAmount, sendSelectedSymbol);
                      const amt = (totalAmount * p) / 100;
                      // 입력은 금액 모드이므로 금액 문자열로 설정
                      setSendInput(String(amt));
                    }
                  }} style={[styles.pctBtn, sendPct===p && styles.pctBtnActive]}>
                    <ThemedText style={[styles.pctText, sendPct===p && styles.pctTextActive]}>{p}%</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <View style={[styles.inputField, { flex: 1, paddingVertical: 0 }] }>
                  <TextInput
                    style={sendAmountType === 'amount' ? styles.numericInputAmount : styles.numericInput}
                    placeholder={sendAmountType === 'quantity' ? t('enterQuantity', language) : t('enterAmount', language)}
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={formatAmount(sendInput)}
                    onChangeText={(v)=>{ 
                      // 포맷팅된 값에서 콤마 제거 후 저장
                      const cleanValue = v.replace(/,/g, '');
                      setSendInput(cleanValue.replace(/[^0-9.]/g,'')); 
                      setSendPct(null); 
                      // URL 기반 요청인 경우 isRequest 상태 유지
                      if (!originalUrlData) {
                        setIsRequest(false); 
                      }
                    }}
                  />
                </View>
                <View style={styles.unitBadge}>
                  <ThemedText style={styles.unitBadgeText}>
                    {sendAmountType === 'quantity' ? sendSelectedSymbol : currency}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={styles.availableTextRight}>{t('available', language)}: {formatAmount(ownedSendAmount.toString())} {sendSelectedSymbol}</ThemedText>

              <ThemedText style={[styles.sendLabel,{ marginTop: 12 }]}>{t('recipientAddress', language)}</ThemedText>
              <View style={styles.addrField}>
                <TextInput
                  value={sendToAddress}
                  onChangeText={(text) => {
                    // yooy://pay URL인지 확인하고 파싱
                    const parsed = parsePayUri(text);
                    if (parsed) {
                      // URL 검증
                      const validation = validateSendUrl(parsed);
                      
                      // 코인 종류가 다르면 보내기 자체를 막음
                      if (!validation.isValid) {
                        // 실패 메시지 표시 (보내기 불가)
                        Alert.alert(
                          language === 'en' ? '❌ Transaction Blocked' : '❌ 거래 차단',
                          validation.errors.join('\n\n'),
                          [
                            {
                              text: language === 'en' ? 'OK' : '확인',
                              onPress: () => {
                                // 입력값 초기화
                                setSendToAddress('');
                                setSendInput('');
                                setIsRequest(false);
                              }
                            }
                          ]
                        );
                        return;
                      }
                      
                      // 데이터 반영
                      setSendToAddress(parsed.addr);
                      setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                      setSendInput(parsed.amt || '');
                      setIsRequest(true); // 요청 상태로 설정
                      setOriginalUrlData(parsed); // 원본 URL 데이터 저장
                      
                      // 수량 경고가 있으면 표시 (보내기는 가능)
                      if (validation.hasWarnings) {
                        Alert.alert(
                          language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                          validation.warnings.join('\n\n'),
                          [
                            {
                              text: language === 'en' ? 'OK' : '확인'
                            }
                          ]
                        );
                      }
                    } else {
                      // 일반 주소면 그대로 설정
                      setSendToAddress(text);
                      setIsRequest(false); // 일반 상태로 설정
                    }
                  }}
                  placeholder="0x..."
                  placeholderTextColor="#666"
                  style={{ color:'#fff', flex:1 }}
                />
                <View style={{ flexDirection:'row', gap: 8 }}>
                  {/* 붙여넣기 */}
                  <TouchableOpacity accessibilityLabel="Paste" style={[styles.addrIconBtn,{ backgroundColor:'#243034', borderColor:'#375A64' }]} onPress={async()=>{ 
                    try{ 
                      let text: string | null = null;
                      try { const Clipboard = require('expo-clipboard'); text = await Clipboard.getStringAsync(); } catch { text = await (navigator as any)?.clipboard?.readText?.(); }
                      if(text) {
                        // yooy://pay URL인지 확인하고 파싱
                        const parsed = parsePayUri(text);
                        if (parsed) {
                          // 데이터 반영 (항상 붙여넣기 허용) + 수량모드 강제
                          setSendToAddress(parsed.addr);
                          setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                          setSendAmountType('quantity');
                            setSendInput(parsed.amt || '');
                          setIsRequest(true); // 요청 상태로 설정
                          setOriginalUrlData(parsed); // 원본 URL 데이터 저장
                          
                          // URL 검증 (붙여넣기 후 경고만 표시)
                          const validation = validateSendUrl(parsed, parsed.amt);
                          
                          // 검증 실패 시 경고 표시 (붙여넣기는 허용)
                          if (!validation.isValid) {
                            Alert.alert(
                              language === 'en' ? '⚠️ Paste Warning' : '⚠️ 붙여넣기 경고',
                              validation.errors.join('\n\n') + '\n\n' + (language === 'en' ? 'You can still modify the values and try again.' : '값을 수정한 후 다시 시도할 수 있습니다.'),
                              [
                                {
                                  text: language === 'en' ? 'OK' : '확인'
                                }
                              ]
                            );
                          } else if (validation.hasWarnings) {
                            // 수량 경고가 있으면 표시
                            Alert.alert(
                              language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                              validation.warnings.join('\n\n'),
                              [
                                {
                                  text: language === 'en' ? 'OK' : '확인'
                                }
                              ]
                            );
                          }
                        } else {
                          // 일반 주소면 그대로 설정
                          setSendToAddress(text);
                          setIsRequest(false); // 일반 상태로 설정
                          setOriginalUrlData(null); // 원본 URL 데이터 초기화
                        }
                      }
                    }catch{}
                  }}>
                    <Ionicons name="clipboard-outline" size={18} color="#D5E7EC" />
                  </TouchableOpacity>
                  {/* 이미지 스캔 (사진 아이콘) */}
                  <TouchableOpacity accessibilityLabel="Scan Image" style={[styles.addrIconBtn,{ backgroundColor:'#243034', borderColor:'#375A64' }]} onPress={async()=>{
                    // 호환성: SDK 버전에 따라 MediaType enum이 없을 수 있으므로 문자열 사용
                    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality:1, base64: true, selectionLimit: 1 } as any);
                    if (!res.canceled && res.assets?.length) {
                      try {
                        const asset: any = res.assets[0];
                        // 파일명에 yooy__<base64url>.png 형태로 저장된 경우, 파일명에서 복구 시도
                        const name: string = (asset as any)?.fileName || (asset as any)?.name || '';
                        if (name && name.includes('yooy__')) {
                          // 파일명 형식: yooy__<base64url>-YYYYMMDD-<amt><sym>.png
                          const m = name.match(/yooy__([A-Za-z0-9_-]+)-.*\.png/i);
                          if (m?.[1]) {
                            const restored = fromBase64Url(m[1]);
                            const norm = normalizeScannedText(restored);
                            if (norm) {
                              const parsed = parsePayUri(norm);
                              if (parsed) {
                                setSendToAddress(parsed.addr);
                                setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                                setSendInput(parsed.amt || '');
                                setIsRequest(true);
                                setOriginalUrlData(parsed);
                                const validation = validateSendUrl(parsed, parsed.amt);
                                if (!validation.isValid) {
                                  Alert.alert(
                                    language === 'en' ? '⚠️ Scan Warning' : '⚠️ 스캔 경고',
                                    validation.errors.join('\n\n') + '\n\n' + (language === 'en' ? 'You can still modify the values and try again.' : '값을 수정한 후 다시 시도할 수 있습니다.'),
                                    [{ text: language === 'en' ? 'OK' : '확인' }]
                                  );
                                } else if (validation.hasWarnings) {
                                  Alert.alert(
                                    language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                                    validation.warnings.join('\n\n'),
                                    [{ text: language === 'en' ? 'OK' : '확인' }]
                                  );
                                }
                                return; // 파일명 복원 성공 시에만 스캔 생략
                              }
                            }
                          }
                        }
                        // 네이티브에선 파일 URI 사용 → 실패 시 base64 data URL로 즉시 재시도
                        if (Platform.OS !== 'web' && asset) {
                          // 안전모드: 바로 대체 파이프라인으로 스캔 시도
                          try {
                            // 파일명에서도 복구 실패 시, base64 우선 사용(안드로이드 인식률 향상)
                            const altSrc = asset.base64 ? `data:${asset.type || 'image/png'};base64,${asset.base64}` : (asset.uri || '');
                            const alt = await scanImageWithAll(altSrc);
                            if (alt) {
                              const parsed = parsePayUri(alt);
                              if (parsed) {
                                setSendToAddress(parsed.addr);
                                setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                                setSendInput(parsed.amt || '');
                                setIsRequest(true);
                                setOriginalUrlData(parsed);
                                const validation = validateSendUrl(parsed, parsed.amt);
                                if (!validation.isValid) {
                                  Alert.alert(
                                    language === 'en' ? '⚠️ Scan Warning' : '⚠️ 스캔 경고',
                                    validation.errors.join('\n\n') + '\n\n' + (language === 'en' ? 'You can still modify the values and try again.' : '값을 수정한 후 다시 시도할 수 있습니다.'),
                                    [{ text: language === 'en' ? 'OK' : '확인' }]
                                  );
                                } else if (validation.hasWarnings) {
                                  Alert.alert(
                                    language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                                    validation.warnings.join('\n\n'),
                                    [{ text: language === 'en' ? 'OK' : '확인' }]
                                  );
                                }
                                return;
                              } else {
                                setSendToAddress(alt);
                                setIsRequest(false);
                                setOriginalUrlData(null);
                                return;
                              }
                            }
                          } catch {}
                          // 최종 실패 시 noop
                          try { /* noop */ } catch {}
                        }
                        // 2차 실패 시: 아래 공통 파이프라인으로 재시도

                        const src = (Platform as any).OS === 'web' && asset?.base64 ? `data:${asset.type || 'image/png'};base64,${asset.base64}` : (asset?.uri || '');
                        const code = await scanImageWithAll(src);
                        if (code) {
                          const parsed = parsePayUri(code);
                          if (parsed) {
                            setSendToAddress(parsed.addr);
                            setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                            setSendInput(parsed.amt || '');
                            setIsRequest(true);
                            setOriginalUrlData(parsed);
                            const validation = validateSendUrl(parsed, parsed.amt);
                            if (!validation.isValid) {
                              Alert.alert(
                                language === 'en' ? '⚠️ Scan Warning' : '⚠️ 스캔 경고',
                                validation.errors.join('\n\n') + '\n\n' + (language === 'en' ? 'You can still modify the values and try again.' : '값을 수정한 후 다시 시도할 수 있습니다.'),
                                [{ text: language === 'en' ? 'OK' : '확인' }]
                              );
                            } else if (validation.hasWarnings) {
                              Alert.alert(
                                language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                                validation.warnings.join('\n\n'),
                                [{ text: language === 'en' ? 'OK' : '확인' }]
                              );
                            }
                          } else {
                            setSendToAddress(code);
                            setIsRequest(false);
                            setOriginalUrlData(null);
                          }
                        } else {
                          Alert.alert(
                            language==='en'?'Scan failed':'스캔 실패',
                            language==='en'?'Could not detect a QR code in the selected image.':'선택한 이미지에서 QR 코드를 찾을 수 없습니다.'
                          );
                        }
                      } catch (e) {
                        Alert.alert(language==='en'?'Scan error':'스캔 오류', String(e instanceof Error ? e.message : e));
                      }
                    }
                  }}>
                    <Ionicons name="image-outline" size={18} color="#D5E7EC" />
                  </TouchableOpacity>
                  {/* 카메라 스캔 */}
                  <TouchableOpacity
                    accessibilityLabel="Scan Camera"
                    style={[styles.addrIconBtn,{ backgroundColor:'#243034', borderColor:'#375A64' }]}
                    onPress={async()=>{ 
                      try {
                        if (VisionCamera) {
                          const status = await VisionCamera.requestCameraPermission();
                          const granted = status === 'authorized';
                          setHasCamPerm(granted);
                          if (granted) {
                            setScanOpen(true);
                          } else {
                            Alert.alert(
                              language==='en'?'Camera permission required':'카메라 권한 필요',
                              language==='en'?'Please allow camera access to scan QR codes.':'QR 코드를 스캔하려면 카메라 접근을 허용해주세요.'
                            );
                          }
                        } else if ((Platform as any).OS === 'web') {
                          // 웹은 HTML5 카메라 스캔 모달로 이동
                          setScanOpen(true);
                        } else {
                          // VisionCamera 미사용 네이티브: Expo Camera로 대체
                          try {
                            if (ExpoCamera?.requestCameraPermissionsAsync) {
                              const perm = await ExpoCamera.requestCameraPermissionsAsync();
                              const granted = perm?.status === 'granted';
                              setHasCamPerm(granted);
                              if (granted) {
                          setScanOpen(true);
                              } else {
                                Alert.alert(
                                  language==='en'?'Camera permission required':'카메라 권한 필요',
                                  language==='en'?'Please allow camera access to scan QR codes.':'QR 코드를 스캔하려면 카메라 접근을 허용해주세요.'
                                );
                              }
                        } else {
                          Alert.alert(
                            language==='en'?'Scanner unavailable':'스캐너를 사용할 수 없습니다',
                            language==='en'?'This build does not include camera scanning.':'현재 빌드에서는 카메라 스캔이 비활성화되어 있습니다.'
                          );
                            }
                          } catch {
                            Alert.alert(
                              language==='en'?'Scanner unavailable':'스캐너를 사용할 수 없습니다',
                              language==='en'?'This build does not include camera scanning.':'현재 빌드에서는 카메라 스캔이 비활성화되어 있습니다.'
                            );
                          }
                        }
                      } catch (e) {
                        Alert.alert(language==='en'?'Scan error':'스캔 오류', String(e instanceof Error ? e.message : e));
                      }
                    }}
                  >
                    <Ionicons name="camera-outline" size={18} color="#D5E7EC" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection:'row', gap: 12, marginTop: 14 }}>
                {/* 거부하기 버튼 */}
                <TouchableOpacity 
                  style={[styles.secondaryCta, { flex: 1 }]} 
                  onPress={()=>{
                    if (isRequest && sendInput) {
                      // 요청 거부: 상대방에게 알림 전송
                      Alert.alert(
                        language === 'en' ? 'Request Rejected' : '요청 거부',
                        language === 'en' ? 'Payment request has been rejected and the sender has been notified' : '결제 요청이 거부되었으며 발신자에게 알림이 전송되었습니다',
                        [
                          {
                            text: language === 'en' ? 'OK' : '확인',
                            onPress: () => {
                              // 입력값 초기화
                              setSendToAddress('');
                              setSendInput('');
                              setSendPct(null);
                              setIsRequest(false);
                              setOriginalUrlData(null);
                            }
                          }
                        ]
                      );
                    }
                  }}
                >
                  <ThemedText style={styles.secondaryCtaText}>{t('reject', language)}</ThemedText>
                </TouchableOpacity>
                
                {/* 초기화 버튼 */}
                <TouchableOpacity 
                  style={[styles.secondaryCta, { flex: 1 }]}
                  onPress={() => {
                    setSendToAddress('');
                    setSendInput('');
                    setSendPct(null);
                    setIsRequest(false);
                    setOriginalUrlData(null);
                  }}
                >
                  <ThemedText style={styles.secondaryCtaText}>{t('reset', language)}</ThemedText>
                </TouchableOpacity>
                
                {/* 보내기 버튼 */}
                <TouchableOpacity 
                  style={[styles.primaryCta, sendErrorText && styles.primaryCtaError, { flex: 1 }]}
                  onPress={handleSendTransaction}
                >
                  <ThemedText style={[styles.primaryCtaText, sendErrorText && styles.primaryCtaErrorText]}>
                    {sendErrorText ? sendErrorText : t('send', language)}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {/* 경고문 하단 */}
              <View style={[styles.warningBox,{ marginTop: 16 }]}>
                <ThemedText style={styles.warningText}>
                  {t('addressWarning', language)}
                </ThemedText>
              </View>
            </View>
            
            
            <View style={styles.walletSection}>
              <View style={{ alignItems:'center', gap: 4 }}>
                <View style={{ flexDirection:'row', alignItems:'baseline', gap: 6 }}>
                  <ThemedText style={styles.sectionTitle}>{t('walletCreatableCoins', language)}</ThemedText>
                  <ThemedText style={styles.coinCounter}>( {createdWalletsCount} / {totalCoinsCount} )</ThemedText>
                </View>
                <ThemedText style={styles.sectionSubtitle}>{t('walletCreatableDescription', language)}</ThemedText>
              </View>
            </View>
            
            <View style={styles.walletGrid}>
              {walletCoins.map(c => (
                <View key={`send-${c.symbol}`} style={[styles.walletCard, c.hasAsset ? styles.walletCardActive : styles.walletCardInactive]}>
                  <View style={styles.walletIcon}>
                    <CoinLogo symbol={c.symbol} />
                  </View>
                  <ThemedText style={styles.walletName}>{c.name}</ThemedText>
                  <ThemedText style={styles.walletNetwork}>{c.network}</ThemedText>
                  <TouchableOpacity 
                    style={[styles.walletBtn, c.hasWallet ? styles.walletBtnActive : undefined]}
                    onPress={() => {
                      if (c.hasWallet) {
                        // 지갑이 생성되었으면 QR1 표시
                        handleOpenQrModal(c);
                      } else {
                        // 지갑이 없으면 생성
                        handleCreateWallet(c);
                      }
                    }}
                  >
                    <ThemedText style={[styles.walletBtnText, c.hasWallet && styles.walletBtnTextActive]}>
                      {c.hasWallet 
                        ? (language === 'en' ? `${c.symbol} QR Code` : `${c.symbol} QR 코드`)
                        : t('createWallet', language)
                      }
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'receive' && (
          <View>
            <ThemedText type="subtitle">{t('receive', language)}</ThemedText>
            <View style={styles.receiveSection}>
              <View style={styles.receiveCard}>
                <View style={styles.receiveContent}>
                  <View style={styles.qrCodeContainer}>
                    <View style={styles.qrCodePlaceholder}>
                      {(() => {
                        const addr = getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '0x0000000000000000000000000000000000000000';
                        // 금액 모드인 경우 수량으로 변환
                        const amountForUrl = recvAmountType === 'amount' 
                          ? convertAmountToQuantity(parseFloat(recvInput) || 0, recvSelectedSymbol).toString()
                          : recvInput;
                        const payload = buildPayUri(addr, recvSelectedSymbol, amountForUrl);
                        
                        // 네이티브 QR 코드 렌더링
                        if (Platform.OS !== 'web' && QRCode) {
                          try {
                            const Comp = QRCode as any;
                            return (
                              <View style={styles.qrCodeWrapper}>
                                <Comp 
                                  value={payload} 
                                  size={240} 
                                  backgroundColor="#FFFFFF" 
                                  color="#000000"
                                  quietZone={32}
                                  ecl="H"
                                />
                                {QR_CENTER_LOGO && (
                                  <View style={styles.qrCenterLogoAbsWrap}>
                                    <View style={styles.qrCenterLogoAbs}>
                                      <Image 
                                        source={require('@/assets/images/side_logo.png')} 
                                        style={styles.qrCenterLogoAbsImg} 
                                        resizeMode="contain" 
                                      />
                                    </View>
                                  </View>
                                )}
                              </View>
                            );
                          } catch (e) {
                            console.log('QRCode component error:', e);
                          }
                        }
                        
                        // 웹 폴백: API 생성 (고해상도, 여백/색상 명시)
                        const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&margin=24&color=000000&bgcolor=ffffff&data=${encodeURIComponent(payload)}`;
                        return (
                          <View style={styles.qrCodeWrapper}>
                            <Image 
                              source={{ uri: url }} 
                              style={{ width: 240, height: 240 }} 
                              resizeMode="contain" 
                            />
                            {QR_CENTER_LOGO && (
                              <View style={styles.qrCenterLogoAbsWrap}>
                                <View style={styles.qrCenterLogoAbs}>
                                  <Image 
                                    source={require('@/assets/images/side_logo.png')} 
                                    style={styles.qrCenterLogoAbsImg} 
                                    resizeMode="contain" 
                                  />
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  {/* [ID] 지갑 보내기 버튼 제거 (요청에 따른 삭제) */}

                  <ThemedText style={[styles.receiveTitle,{ marginTop: 2 }]}>{`[${recvSelectedSymbol}] ${language==='en'?'Receive Address':'받을 주소'}`}</ThemedText>
                  <View style={styles.addressBox}>
                    <ThemedText style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                      {getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '—'}
                    </ThemedText>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={async () => {
                        try {
                          const a = (getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '').trim();
                          if (!a) return;
                          try {
                            // 우선 네이티브 우선
                            // eslint-disable-next-line @typescript-eslint/no-var-requires
                            const Clipboard = require('expo-clipboard');
                            await Clipboard.setStringAsync(a);
                          } catch {
                            await (navigator as any)?.clipboard?.writeText?.(a);
                          }
                          setAddrCopySuccess(true);
                          setTimeout(() => setAddrCopySuccess(false), 1600);
                        } catch {}
                      }}
                    >
                      {addrCopySuccess ? (
                        <ThemedText style={[styles.copyButtonText, { color: '#4CAF50' }]}>
                          {language === 'en' ? 'Copied' : '복사됨'}
                        </ThemedText>
                      ) : (
                      <ThemedText style={styles.copyButtonText}>{t('copy', language)}</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={{ width:'100%', marginTop: 14 }}>
                    <ThemedText style={styles.receiveSubtitle}>{language==='en'?'Select coin received':'받을 코인'}</ThemedText>
                    <View style={styles.selectWrap}>
                      <TouchableOpacity style={styles.selectField} onPress={()=>setRecvSelectOpen(v=>!v)}>
                        <ThemedText style={styles.selectText}>{recvSelectedSymbol}</ThemedText>
                        <View style={styles.selectChevron} />
                      </TouchableOpacity>
                      {recvSelectOpen && (
                        <View style={styles.dropdown}>
                          {walletCoins.filter(c=>c.hasWallet).map(c => (
                            <TouchableOpacity key={`recv-dd-${c.symbol}`} style={styles.dropdownItem} onPress={()=>{ 
                              setRecvSelectedSymbol(c.symbol); 
                              setRecvSelectOpen(false);
                              const wallet = getWalletBySymbol(c.symbol);
                              if (wallet) setRecvAddress(wallet.address);
                            }}>
                              <ThemedText style={styles.dropdownText}>{c.symbol}</ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>

                    {/* 수량/금액 토글 */}
                    <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:10, marginBottom:8 }}>
                      <TouchableOpacity 
                        style={[styles.toggleButton, recvAmountType === 'quantity' && styles.toggleButtonActive]}
                        onPress={() => {
                          if (recvAmountType === 'amount' && recvInput) {
                            // 금액 → 수량 변환
                            const currentAmount = parseFloat(recvInput);
                            const quantity = convertAmountToQuantity(currentAmount, recvSelectedSymbol);
                            setRecvInput(quantity.toString());
                          }
                          setRecvAmountType('quantity');
                        }}
                      >
                        <ThemedText style={[styles.toggleButtonText, recvAmountType === 'quantity' && styles.toggleButtonTextActive]}>
                          {t('quantity', language)}
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.toggleButton, recvAmountType === 'amount' && styles.toggleButtonActive]}
                        onPress={() => {
                          if (recvAmountType === 'quantity' && recvInput) {
                            // 수량 → 금액 변환
                            const currentQuantity = parseFloat(recvInput);
                            const amount = convertQuantityToAmount(currentQuantity, recvSelectedSymbol);
                            setRecvInput(amount.toString());
                          }
                          setRecvAmountType('amount');
                        }}
                      >
                        <ThemedText style={[styles.toggleButtonText, recvAmountType === 'amount' && styles.toggleButtonTextActive]}>
                          {t('amount', language)}
                        </ThemedText>
                      </TouchableOpacity>
                      {!pricesLoaded && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <ActivityIndicator size="small" color="#FFD700" />
                          <ThemedText style={{ color: '#FFD700', fontSize: 12 }}>
                            {t('loadingPrices', language)}
                          </ThemedText>
                          <ThemedText style={{ color: '#888', fontSize: 10 }}>
                            {language === 'en' ? '(Using fallback)' : '(기본값 사용)'}
                          </ThemedText>
                        </View>
                      )}
                    </View>

                    <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:10 }}>
                      <View style={[styles.inputField, { flex:1, paddingVertical:0 }] }>
                        <TextInput
                          style={recvAmountType === 'amount' ? styles.numericInputAmount : styles.numericInput}
                          placeholder={recvAmountType === 'quantity' ? (language==='en'?'Quantity':'수량') : (language==='en'?'Amount':'금액')}
                          placeholderTextColor="#666"
                          keyboardType="numeric"
                          value={formatAmount(recvInput)}
                          onChangeText={(v)=>{ 
                            // 포맷팅된 값에서 콤마 제거 후 저장
                            const cleanValue = v.replace(/,/g, '');
                            setRecvInput(cleanValue.replace(/[^0-9.]/g,'')); 
                          }}
                        />
                      </View>
                      <View style={styles.unitBadge}>
                        <ThemedText style={styles.unitBadgeText}>
                          {recvAmountType === 'quantity' ? recvSelectedSymbol : currency}
                        </ThemedText>
                      </View>
                    </View>

                    <ThemedText style={[styles.receiveSubtitle,{ marginTop: 12 }]}>{language==='en'?'Receive address':'받을 주소'}</ThemedText>
                    <View style={styles.addrField}>
                      <TextInput 
                        value={recvAddress} 
                        placeholder={language==='en'?'Enter yooy://pay or yooy://claim URL':'yooy://pay 또는 yooy://claim URL 입력'} 
                        placeholderTextColor="#666" 
                        style={{ color:'#fff', flex:1 }} 
                        editable={true}
                        onChangeText={(text) => {
                          setRecvAddress(text);
                          // yooy://claim 링크 인식 → 수령 버튼 노출로 전환
                          if (text.startsWith('yooy://claim')) {
                            (async () => {
                              try {
                                const { parseClaimUri, getVoucher } = await import('@/lib/claims');
                                const parsed = parseClaimUri(text);
                                if (!parsed?.id) return;
                                const voucher = await getVoucher(parsed.id);
                                if (!voucher) {
                                  Alert.alert(language==='en'?'Invalid QR':'유효하지 않은 QR', language==='en'?'Voucher not found.':'바우처를 찾을 수 없습니다.');
                                  return;
                                }
                                setPendingGift({ id: voucher.id, symbol: voucher.symbol || 'YOY', status: voucher.status });
                                if (voucher.status !== 'active') {
                                  const msg = voucher.status === 'expired' ? (language==='en'?'Expired':'만료됨')
                                    : voucher.status === 'exhausted' ? (language==='en'?'Exhausted':'소진됨')
                                    : (language==='en'?'Cancelled':'종료됨');
                                  Alert.alert(language==='en'?'Not claimable':'수령 불가', msg);
                                } else {
                                  Alert.alert(language==='en'?'Claim available':'수령 가능', (language==='en'?'Press Claim to receive.':'하단의 받기 버튼을 눌러 수령하세요.'));
                                }
                              } catch (e) {
                                Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
                              }
                            })();
                            return;
                          }
                          // yooy://pay URL인 경우 검증 실행
                          if (text.startsWith('yooy://pay')) {
                            handleReceiveUrlInput(text);
                          }
                        }}
                      />
                    </View>
                  </View>

                  <View style={[styles.ctaRow,{ width:'100%', alignSelf:'stretch' }]}>
                    <TouchableOpacity style={[styles.ctaCopy,{ flex:1.2, width:undefined }]} onPress={async ()=>{ 
                      try {
                        if (VisionCamera) {
                          const status = await VisionCamera.requestCameraPermission();
                          const granted = status === 'authorized';
                          setHasCamPerm(granted);
                          if (granted) {
                            setScanOpen(true);
                          } else {
                            Alert.alert(
                              language==='en'?'Camera permission required':'카메라 권한 필요',
                              language==='en'?'Please allow camera access to scan QR codes.':'QR 코드를 스캔하려면 카메라 접근을 허용해주세요.'
                            );
                          }
                        } else {
                          // 웹: 모달 열기 (카메라 자동 시도)
                          setScanOpen(true);
                        }
                      } catch {
                        setScanOpen(true);
                      }
                    }}>
                      <ThemedText style={styles.ctaCopyText} numberOfLines={1}>{language==='en'?'Scan':'스캔'}</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ctaShare,{ flex:1.5, width:undefined }]} onPress={()=>{
                      const addr = getWalletBySymbol(recvSelectedSymbol)?.address||recvAddress||'';
                      // 금액 모드인 경우 수량으로 변환
                      const amountForUrl = recvAmountType === 'amount' 
                        ? convertAmountToQuantity(parseFloat(recvInput) || 0, recvSelectedSymbol).toString()
                        : recvInput;
                      const payload = buildPayUri(addr, recvSelectedSymbol, amountForUrl);
                    // 팝업 모달로 열기
                    setQrCoin({ symbol: recvSelectedSymbol, name: getCoinDisplayName(recvSelectedSymbol), network: getCoinNetwork(recvSelectedSymbol), address: addr });
                    setQrModalTab('receive');
                    setQrModalType('pngsave'); // PNG Save 팝업으로 설정
                    setQrModalVisible(true);
                    }}>
                      <ThemedText style={styles.ctaShareText} numberOfLines={1}>{language==='en'?'Save QR':'QR 저장'}</ThemedText>
                    </TouchableOpacity>
                    {/* 공유 복원 */}
                    <TouchableOpacity style={[styles.ctaCopy,{ flex:1.2, width:undefined }]} onPress={handleShareQr}>
                      <ThemedText style={styles.ctaCopyText} numberOfLines={1}>{language==='en'?'Share':'공유'}</ThemedText>
                    </TouchableOpacity>
                      <TouchableOpacity style={[styles.ctaCopy,{ flex:1.5, width:undefined }]} onPress={async ()=>{ 
                      try {
                        const addr = getWalletBySymbol(recvSelectedSymbol)?.address||recvAddress||'';
                        // 금액 모드인 경우 수량으로 변환
                        const amountForUrl = recvAmountType === 'amount' 
                          ? convertAmountToQuantity(parseFloat(recvInput) || 0, recvSelectedSymbol).toString()
                          : recvInput;
                        const uri = buildPayUri(addr, recvSelectedSymbol, amountForUrl); 
                        try {
                          const Clipboard = require('expo-clipboard');
                          await Clipboard.setStringAsync(uri);
                        } catch {
                        await (navigator as any)?.clipboard?.writeText?.(uri);
                        }
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000); // 2초 후 원래 상태로
                      } catch (error) {
                        console.error('Copy failed:', error);
                      }
                    }}>
                      {copySuccess ? (
                        <Ionicons name="checkmark" size={16} color="#4CAF50" />
                      ) : (
                        <ThemedText style={styles.ctaCopyText} numberOfLines={1}>{language==='en'?'Copy':'복사'}</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* 기프트 수령 대기 상태: 링크 인식/스캔 후 노출 */}
                  {pendingGift && pendingGift.status === 'active' && (
                    <View style={[styles.ctaRow,{ width:'100%', alignSelf:'stretch' }]}>
                      <TouchableOpacity style={[styles.ctaShare,{ flex:1, width:undefined }]} onPress={async()=>{
                        try {
                          const sym = pendingGift.symbol || 'YOY';
                          const recvAddrNow = getWalletBySymbol(sym)?.address || recvAddress || '';
                          if (!recvAddrNow) {
                            Alert.alert(language==='en'?'No wallet address':'지갑 주소 없음', language==='en'?'Create wallet first.':'먼저 해당 코인 지갑을 생성하세요.');
                            return;
                          }
                          const { claimVoucher } = await import('@/lib/claims');
                          const res = await claimVoucher({ id: pendingGift.id, recipientAddress: recvAddrNow, recipientEmail: currentUserEmail });
                          if ('error' in res) {
                            Alert.alert(language==='en'?'Claim failed':'수령 실패', String(res.error));
                            return;
                          }
                          const gained = res.amount || 0;
                          try {
                            const storageKey = `user_balances_${currentUserEmail}`;
                            const saved = await AsyncStorage.getItem(storageKey);
                            const parsedBal = saved ? JSON.parse(saved) : {};
                            parsedBal[sym] = (parsedBal[sym] || 0) + gained;
                            await AsyncStorage.setItem(storageKey, JSON.stringify(parsedBal));
                          } catch {}
                          setPendingGift(null);
                          Alert.alert(language==='en'?'Received':'수령 완료', `${gained} ${sym}`);
                        } catch (e) {
                          Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
                        }
                      }}>
                        <ThemedText style={styles.ctaShareText} numberOfLines={1}>{language==='en'?'Claim':'받기'}</ThemedText>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={[styles.warningBox,{ marginTop: 12 }]}>
                    <ThemedText style={styles.warningText}>
                      {t('addressWarning', language)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.walletSection}>
              <View style={{ flexDirection:'row', alignItems:'baseline', gap: 6 }}>
                <ThemedText style={styles.sectionTitle}>{t('walletCreatableCoins', language)}</ThemedText>
                <ThemedText style={styles.coinCounter}>( {createdWalletsCount} / {totalCoinsCount} )</ThemedText>
              </View>
              <ThemedText style={styles.sectionSubtitle}>{t('walletCreatableDescription', language)}</ThemedText>
              
              <View style={styles.walletGrid}>
                {walletCoins.map(c => (
                  <View key={`recv-${c.symbol}`} style={[styles.walletCard, c.hasAsset ? styles.walletCardActive : styles.walletCardInactive]}>
                    <View style={styles.walletIcon}>
                      <CoinLogo symbol={c.symbol} />
                    </View>
                    <ThemedText style={styles.walletName}>{c.name}</ThemedText>
                    <ThemedText style={styles.walletNetwork}>{c.network}</ThemedText>
                    <TouchableOpacity 
                      style={[styles.walletBtn, c.hasWallet ? styles.walletBtnActive : undefined]}
                      onPress={() => {
                        if (c.hasWallet) {
                          // 지갑이 생성되었으면 QR1 표시
                          handleOpenQrModal(c);
                        } else {
                          // 지갑이 없으면 생성
                          handleCreateWallet(c);
                        }
                      }}
                    >
                      <ThemedText style={[styles.walletBtnText, c.hasWallet && styles.walletBtnTextActive]}>
                        {c.hasWallet 
                          ? (language === 'en' ? `${c.symbol} QR Code` : `${c.symbol} QR 코드`)
                          : t('createWallet', language)
                        }
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* QR 스캔 모달 */}
        <Modal visible={scanOpen} transparent animationType="slide" onRequestClose={()=>setScanOpen(false)}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.9)', justifyContent:'center', alignItems:'center' }}>
            {hasCamPerm === false ? (
              <View style={{ alignItems:'center' }}>
                <ThemedText style={{ color:'#fff', marginBottom:12 }}>{language==='en'?'Camera permission denied':'카메라 권한이 없습니다'}</ThemedText>
                <TouchableOpacity
                  onPress={()=>{
                    try { Linking.openSettings?.(); } catch {}
                  }}
                  style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:10, borderWidth:1, borderColor:'#FFD700' }}
                >
                  <ThemedText style={{ color:'#FFD700', fontWeight:'800' }}>{language==='en'?'Open settings':'설정 열기'}</ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width:'90%', maxWidth:420, aspectRatio:0.75, overflow:'hidden', borderRadius:16, borderWidth:2, borderColor:'#FFD700', position:'relative', backgroundColor:'#000' }}>
                {VisionCamera ? (
                  // VisionCamera 경로
                  <View style={{ flex:1 }}>
                    {(() => {
                      const devices = useCameraDevices?.();
                      const device = devices?.back;
                      const codeScanner = useCodeScanner?.({
                        codeTypes: ['qr', 'ean-13', 'code-128'],
                        onCodeScanned: async (codes: any[]) => {
                          const raw = String(codes?.[0]?.value || codes?.[0]?.rawValue || '');
                          if (!raw) return;
                          try {
                            const { parseClaimUri } = await import('@/lib/claims');
                            const claim = parseClaimUri(raw);
                            if (claim?.id) {
                              setScanOpen(false);
                              await (async () => {
                                try {
                                  const { getVoucher, claimVoucher } = await import('@/lib/claims');
                                  const voucher = await getVoucher(claim.id);
                                  if (!voucher) {
                                    Alert.alert(language==='en'?'Invalid QR':'유효하지 않은 QR', language==='en'?'Voucher not found.':'바우처를 찾을 수 없습니다.');
                                    return;
                                  }
                                  const sym = voucher.symbol || 'YOY';
                                  const recvAddr = getWalletBySymbol(sym)?.address || recvAddress || '';
                                  if (!recvAddr) {
                                    Alert.alert(language==='en'?'No wallet address':'지갑 주소 없음', language==='en'?'Create wallet first.':'먼저 해당 코인 지갑을 생성하세요.');
                                    return;
                                  }
                                  const previewAmt = voucher.mode === 'per_claim'
                                    ? Math.max(0, Number(voucher.perClaimAmount || 0))
                                    : Math.max(0, Number(voucher.remainingAmount || voucher.totalAmount || 0));
                                  Alert.alert(
                                    language==='en'?'Claim voucher':'바우처 수령',
                                    language==='en'
                                      ? `Receive ${previewAmt} ${sym} to:\n${recvAddr.slice(0,8)}...${recvAddr.slice(-6)}`
                                      : `${sym} ${previewAmt} 수령합니다.\n받을 주소:\n${recvAddr.slice(0,8)}...${recvAddr.slice(-6)}`,
                                    [
                                      { text: language==='en'?'Cancel':'취소' },
                                      { text: language==='en'?'Claim':'수령', onPress: async () => {
                                        const res = await claimVoucher({ id: voucher.id, recipientAddress: recvAddr, recipientEmail: currentUserEmail });
                                        if ('error' in res) {
                                          const msg = res.error;
                                          Alert.alert(language==='en'?'Claim failed':'수령 실패', String(msg));
                                          return;
                                        }
                                        const gained = res.amount || previewAmt;
                                        try {
                                          const storageKey = `user_balances_${currentUserEmail}`;
                                          const saved = await AsyncStorage.getItem(storageKey);
                                          const parsed = saved ? JSON.parse(saved) : {};
                                          parsed[sym] = (parsed[sym] || 0) + gained;
                                          await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
                                        } catch {}
                                        try {
                                          const transactionData = {
                                            id: `rx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                                            type: 'receive' as const,
                                            from: `voucher:${voucher.id}`,
                                            to: recvAddr,
                                            amount: gained,
                                            currency: sym,
                                            description: language==='en'?'Claimed voucher':'바우처 수령',
                                            timestamp: new Date().toISOString(),
                                            status: 'completed' as const,
                                            hash: `voucher_${voucher.id}`,
                                            network: sym === 'YOY' ? 'YOY' as const : 'Ethereum' as const,
                                            blockTimestamp: new Date().toISOString(),
                                          };
                                          await addTransaction(transactionData as any);
                                          try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol: sym, amount: gained, change: gained, description: transactionData.description, transactionHash: transactionData.hash, source:'voucher' } as any); } catch {}
                                        } catch {}
                                        Alert.alert(language==='en'?'Received':'수령 완료', `${gained} ${sym}`);
                                      }}
                                    ]
                                  );
                                } catch (e) {
                                  Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
                                }
                              })();
                              return;
                            }
                          } catch {}
                          const parsed = parsePayUri(raw);
                          if (parsed) {
                            setSendToAddress(parsed.addr);
                            setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                            setSendInput(parsed.amt || '');
                            setIsRequest(true);
                            setOriginalUrlData(parsed);
                            const validation = validateSendUrl(parsed, parsed.amt);
                            if (!validation.isValid) {
                              Alert.alert(
                                language === 'en' ? '⚠️ Scan Warning' : '⚠️ 스캔 경고',
                                validation.errors.join('\n\n') + '\n\n' + (language === 'en' ? 'You can still modify the values and try again.' : '값을 수정한 후 다시 시도할 수 있습니다.'),
                                [{ text: language === 'en' ? 'OK' : '확인' }]
                              );
                            } else if (validation.hasWarnings) {
                              Alert.alert(
                                language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                                validation.warnings.join('\n\n'),
                                [{ text: language === 'en' ? 'OK' : '확인' }]
                              );
                            }
                          } else {
                            setSendToAddress(raw);
                            setIsRequest(false);
                            setOriginalUrlData(null);
                          }
                          setScanOpen(false);
                        },
                      });
                      if (!device) return <View style={{ flex:1 }} />;
                      return (
                        <VisionCamera
                          style={{ flex:1 }}
                          device={device}
                          isActive={true}
                          codeScanner={codeScanner}
                        />
                      );
                    })()}
                  </View>
                ) : (
                  <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
                    {(Platform as any).OS === 'web' ? (
                      <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}>
                        {/* @ts-ignore: web video element */}
                        <video ref={videoRef} autoPlay playsInline muted style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      </View>
                    ) : (
                      <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}>
                        {CameraView ? (
                        <CameraView
                          style={{ width:'100%', height:'100%' }}
                          facing="back"
                          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                          onBarcodeScanned={async ({ data }: any) => {
                            const raw = String(data || '');
                            if (!raw) return;
                            // 1) 바우처 QR 우선 처리
                            try {
                              const { parseClaimUri } = await import('@/lib/claims');
                              const claim = parseClaimUri(raw);
                              if (claim?.id) {
                                setScanOpen(false);
                                await (async () => {
                                  try {
                                    const { getVoucher, claimVoucher } = await import('@/lib/claims');
                                    const voucher = await getVoucher(claim.id);
                                    if (!voucher) {
                                      Alert.alert(language==='en'?'Invalid QR':'유효하지 않은 QR', language==='en'?'Voucher not found.':'바우처를 찾을 수 없습니다.');
                                      return;
                                    }
                                    const sym = voucher.symbol || 'YOY';
                                    const recvAddr = getWalletBySymbol(sym)?.address || recvAddress || '';
                                    if (!recvAddr) {
                                      Alert.alert(language==='en'?'No wallet address':'지갑 주소 없음', language==='en'?'Create wallet first.':'먼저 해당 코인 지갑을 생성하세요.');
                                      return;
                                    }
                                    const previewAmt = voucher.mode === 'per_claim'
                                      ? Math.max(0, Number(voucher.perClaimAmount || 0))
                                      : Math.max(0, Number(voucher.remainingAmount || voucher.totalAmount || 0));
                                    Alert.alert(
                                      language==='en'?'Claim voucher':'바우처 수령',
                                      language==='en'
                                        ? `Receive ${previewAmt} ${sym} to:\n${recvAddr.slice(0,8)}...${recvAddr.slice(-6)}`
                                        : `${sym} ${previewAmt} 수령합니다.\n받을 주소:\n${recvAddr.slice(0,8)}...${recvAddr.slice(-6)}`,
                                      [
                                        { text: language==='en'?'Cancel':'취소' },
                                        { text: language==='en'?'Claim':'수령', onPress: async () => {
                                          const res = await claimVoucher({ id: voucher.id, recipientAddress: recvAddr, recipientEmail: currentUserEmail });
                                          if ('error' in res) {
                                            const msg = res.error;
                                            Alert.alert(language==='en'?'Claim failed':'수령 실패', String(msg));
                                            return;
                                          }
                                          const gained = res.amount || previewAmt;
                                          try {
                                            const storageKey = `user_balances_${currentUserEmail}`;
                                            const saved = await AsyncStorage.getItem(storageKey);
                                            const parsed = saved ? JSON.parse(saved) : {};
                                            parsed[sym] = (parsed[sym] || 0) + gained;
                                            await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
                                          } catch {}
                                          try {
                                            const transactionData = {
                                              id: `rx_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                                              type: 'receive' as const,
                                              from: `voucher:${voucher.id}`,
                                              to: recvAddr,
                                              amount: gained,
                                              currency: sym,
                                              description: language==='en'?'Claimed voucher':'바우처 수령',
                                              timestamp: new Date().toISOString(),
                                              status: 'completed' as const,
                                              hash: `voucher_${voucher.id}`,
                                              network: sym === 'YOY' ? 'YOY' as const : 'Ethereum' as const,
                                              blockTimestamp: new Date().toISOString(),
                                            };
                                            await addTransaction(transactionData as any);
                                            try { walletStore.addTransaction({ type:'transfer', success:true, status:'completed', symbol: sym, amount: gained, change: gained, description: transactionData.description, transactionHash: transactionData.hash, source:'voucher' } as any); } catch {}
                                          } catch {}
                                          Alert.alert(language==='en'?'Received':'수령 완료', `${gained} ${sym}`);
                                        }}
                                      ]
                                    );
                                  } catch (e) {
                                    Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
                                  }
                                })();
                                return;
                              }
                            } catch {}
                            // 2) 결제 URL 처리
                            const parsed = parsePayUri(raw);
                            if (parsed) {
                              setSendToAddress(parsed.addr);
                              setSendSelectedSymbol(parsed.sym || sendSelectedSymbol);
                              setSendAmountType('quantity');
                              setSendInput(parsed.amt || '');
                              setIsRequest(true);
                              setOriginalUrlData(parsed);
                              const validation = validateSendUrl(parsed, parsed.amt);
                              if (!validation.isValid) {
                                Alert.alert(
                                  language === 'en' ? '⚠️ Scan Warning' : '⚠️ 스캔 경고',
                                  validation.errors.join('\n\n') + '\n\n' + (language === 'en' ? 'You can still modify the values and try again.' : '값을 수정한 후 다시 시도할 수 있습니다.'),
                                  [{ text: language === 'en' ? 'OK' : '확인' }]
                                );
                              } else if (validation.hasWarnings) {
                                Alert.alert(
                                  language === 'en' ? '⚠️ Amount Warning' : '⚠️ 수량 경고',
                                  validation.warnings.join('\n\n'),
                                  [{ text: language === 'en' ? 'OK' : '확인' }]
                                );
                              }
                            } else {
                              setSendToAddress(raw);
                              setIsRequest(false);
                              setOriginalUrlData(null);
                            }
                            setScanOpen(false);
                          }}
                        />
                        ) : (
                          <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
                            <ThemedText style={{ color:'#CFCFCF', textAlign:'center', paddingHorizontal:16 }}>
                              {language==='en'
                                ? 'Scanner module not available in this build.\nPlease use Gallery Scan or install the Dev Build again.'
                                : '이 빌드에는 스캐너 모듈이 없습니다.\n갤러리 스캔을 사용하시거나 Dev 빌드를 다시 설치해주세요.'}
                      </ThemedText>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
                {/* 가이드 프레임 */}
                <View style={{ position:'absolute', left:'10%', right:'10%', top:'20%', bottom:'20%', borderWidth:3, borderColor:'#FFD700', borderRadius:12 }} />
                {/* 스캔 레이저 애니메이션 */}
                <Animated.View style={{ position:'absolute', left:'10%', right:'10%', top:'20%', transform:[{ translateY: scanLineY }] }}>
                  <View style={{ height:2, backgroundColor:'#FF3B30', width:'100%' }} />
                </Animated.View>
                <View style={{ position:'absolute', left:0, right:0, bottom:16, alignItems:'center' }}>
                  <ThemedText style={{ color:'#fff' }}>{language==='en'?'Align the QR within the frame':'QR를 프레임 안에 맞춰주세요'}</ThemedText>
                </View>
              </View>
            )}
            <View style={{ width:'90%', maxWidth:420, marginTop:16, alignSelf:'center' }}>
              <TouchableOpacity style={[styles.scanFullBtn, { backgroundColor:'#3A3A3A', borderColor:'#4A4A4A' }]} onPress={()=>setScanOpen(false)}>
                <ThemedText style={styles.scanFullBtnText}>{language==='en'?'Close':'닫기'}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {activeTab === 'history' && (
          <View>
            <View style={styles.quickHeaderRow}>
              <ThemedText style={styles.quickHeader}>{language==='en'?'Quick Actions':'빠른 액션'}</ThemedText>
            </View>
            <View style={styles.quickGrid}>
              {quickEntries.filter(e => (quickActionsState as any)[e.key]).map(renderQuickTile)}
              {quickActionsState.chat !== false && (
                <TouchableOpacity style={styles.quickTile} onPress={()=>setQuickSettingsVisible(true)}>
                  <View style={styles.tileIcon}><ThemedText style={styles.tileIconText}>⋯</ThemedText></View>
                  <ThemedText style={styles.tileText}>Quick Set</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <ThemedText type="subtitle">{t('transactionHistory', language)}</ThemedText>
            <View style={styles.txTable}>
              <View style={styles.txHeader}>
                <ThemedText style={[styles.txHeadText, {flex:1.2}]}>Time</ThemedText>
                <ThemedText style={[styles.txHeadText, {flex:1.1}]}>Type</ThemedText>
                <ThemedText style={[styles.txHeadText, {flex:1}]}>Amount</ThemedText>
                <ThemedText style={[styles.txHeadText, {flex:0.9}]}>Status</ThemedText>
                <ThemedText style={[styles.txHeadText, {flex:1.4, textAlign:'right'}]}>Memo</ThemedText>
              </View>
              {(() => {
                // 전역 거래 스토어에서 모든 거래 기록 가져오기
                // 모든 거래 유형을 표시 (보내기/받기/보상/스왑/실패/성공 등)
                const allTransactions = getTransactions({ limit: 1000 })
                  .sort((a,b)=> new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                const paginatedTransactions = allTransactions.slice(((historyPage||1)-1)*40, (historyPage||1)*40);
                
                return paginatedTransactions.map(tx => (
                  <TouchableOpacity key={tx.id} style={styles.txRow} onPress={()=>setTxDetail({
                    id: tx.id,
                    type: tx.type,
                    amount: tx.amount || tx.fromAmount || tx.toAmount || 0,
                    currency: tx.symbol || tx.fromToken || tx.toToken || '',
                    status: tx.status || (tx.success ? 'completed' : 'failed'),
                    timestamp: tx.timestamp,
                    memo: tx.memo || '',
                    description: tx.description
                  })}>
                    <ThemedText style={[styles.txCell, {flex:1.2}]} numberOfLines={1}>
                      {(() => {
                        try {
                          // ISO 형식 또는 기존 형식 모두 처리
                          let date: Date;
                          if (tx.timestamp.includes('T')) {
                            // ISO 형식인 경우
                            date = new Date(tx.timestamp);
                          } else {
                            // 기존 한국어 형식인 경우
                            date = new Date(tx.timestamp.replace(/\./g, '-'));
                          }
                          
                          if (isNaN(date.getTime())) {
                            // 여전히 유효하지 않은 경우 현재 날짜 사용
                            date = new Date();
                          }
                          
                          return date.toLocaleDateString('ko-KR', { 
                            month: 'short', 
                            day: 'numeric' 
                          });
                        } catch (error) {
                          // 오류 발생 시 현재 날짜 사용
                          return new Date().toLocaleDateString('ko-KR', { 
                            month: 'short', 
                            day: 'numeric' 
                          });
                        }
                      })()}
                    </ThemedText>
                    <ThemedText style={[styles.txCell, {flex:1.1, color: getTypeColor(tx.type)}]} numberOfLines={1}>
                      {tx.type.toUpperCase()}
                    </ThemedText>
                    <ThemedText style={[styles.txCell, {flex:1}]} numberOfLines={1}>
                      {tx.type === 'swap' 
                        ? tx.swapType === 'from' 
                          ? `-${tx.amount || tx.change || 0} ${tx.symbol || ''}`
                          : `+${tx.amount || tx.change || 0} ${tx.symbol || ''}`
                        : `${tx.amount || tx.change || 0} ${tx.symbol || ''}`
                      }
                    </ThemedText>
                    <ThemedText style={[styles.txCell, {flex:0.9, color: (tx.status || (tx.success ? 'completed' : 'failed'))==='completed'?'#4CAF50':(tx.status || (tx.success ? 'completed' : 'failed'))==='failed'?'#F44336':'#FFD54F'}]} numberOfLines={1}>
                      {(() => {
                        const statusText = tx.status || (tx.success ? 'completed' : 'failed');
                        const bn = (tx as any).blockNumber as number | undefined;
                        if (bn && headBlock && headBlock >= bn && statusText==='completed') {
                          const conf = Math.max(0, headBlock - bn + 1);
                          return `${statusText} · ${conf} conf`;
                        }
                        return statusText;
                      })()}
                    </ThemedText>
                    <View style={[styles.txMemoCell, {flex:1.4}]}> 
                      {memoEditingId===tx.id ? (
                        <View style={styles.memoEditRow}>
                          <TextInput style={styles.memoInput} value={memoDraft} onChangeText={setMemoDraft} placeholder="Add memo" placeholderTextColor="#666" />
                          <TouchableOpacity style={styles.memoSaveBtn} onPress={async()=>{ await updateTransactionMemo(tx.id, memoDraft); setMemoEditingId(null); }}>
                            <ThemedText style={styles.memoSaveText}>Save</ThemedText>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity style={[styles.memoView,{flex:1}]} onPress={()=>{ setMemoEditingId(tx.id); setMemoDraft(tx.memo||''); }}>
                          <ThemedText style={[styles.txCell,{textAlign:'right', maxWidth: 80, color: tx.memo ? '#FFFFFF' : '#FFD700'}]} numberOfLines={1} ellipsizeMode="tail">
                            {tx.memo ? tx.memo : '✎'}
                          </ThemedText>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                ));
              })()}
            </View>
            {/* Pagination */}
            {(() => { 
              const total = getTransactions({ limit: 1000 }).length; 
              const pages = Math.max(1, Math.ceil(total/40)); 
              return (
                <View style={{ flexDirection:'row', justifyContent:'center', gap:8, paddingVertical:12 }}>
                  {Array.from({length: pages}).map((_,i)=> (
                    <TouchableOpacity key={`pg-${i+1}`} onPress={()=>setHistoryPage(i+1)} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#333', backgroundColor: (historyPage||1)===(i+1)?'#FFD700':'#111' }}>
                      <ThemedText style={{ color: (historyPage||1)===(i+1)?'#000':'#fff', fontWeight:'800' }}>{i+1}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              ); 
            })()}
          </View>
        )}

        {/* 주문내역 탭 */}
        {activeTab === 'orders' && (
          <View>
            <View style={styles.quickHeaderRow}>
              <ThemedText style={styles.quickHeader}>{language==='en'?'Quick Actions':'빠른 액션'}</ThemedText>
            </View>
            <View style={styles.quickGrid}>
              {quickEntries.filter(e => (quickActionsState as any)[e.key]).map(renderQuickTile)}
              {quickActionsState.chat !== false && (
                <TouchableOpacity style={styles.quickTile} onPress={()=>setQuickSettingsVisible(true)}>
                  <View style={styles.tileIcon}><ThemedText style={styles.tileIconText}>⋯</ThemedText></View>
                  <ThemedText style={styles.tileText}>Quick Set</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* 주문 폼 섹션 */}
            <View style={styles.orderFormSection}>
              <ThemedText type="subtitle">{language === 'en' ? 'Place Order' : '주문하기'}</ThemedText>
              
              {/* 매수/매도 선택 */}
              <View style={styles.orderTypeContainer}>
                <TouchableOpacity
                  style={[styles.orderTypeButton, orderType === 'buy' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('buy')}
                >
                  <ThemedText style={[styles.orderTypeText, orderType === 'buy' && styles.orderTypeTextActive]}>
                    {language === 'en' ? 'Buy' : '매수'}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderTypeButton, orderType === 'sell' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('sell')}
                >
                  <ThemedText style={[styles.orderTypeText, orderType === 'sell' && styles.orderTypeTextActive]}>
                    {language === 'en' ? 'Sell' : '매도'}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {/* 종목 선택 */}
              <View style={styles.orderInputSection}>
                <ThemedText style={styles.orderInputLabel}>{language === 'en' ? 'Symbol' : '종목'}</ThemedText>
                <View style={styles.orderInputContainer}>
                  <TextInput
                    style={styles.orderInput}
                    value={orderSymbol}
                    onChangeText={setOrderSymbol}
                    placeholder={language === 'en' ? 'e.g., BTC/KRW' : '예: BTC/KRW'}
                    placeholderTextColor="#666"
                  />
                </View>
              </View>

              {/* 가격 입력 */}
              <View style={styles.orderInputSection}>
                <ThemedText style={styles.orderInputLabel}>{language === 'en' ? 'Price' : '가격'}</ThemedText>
                <View style={styles.orderInputContainer}>
                  <TextInput
                    style={styles.orderInput}
                    value={orderPrice}
                    onChangeText={setOrderPrice}
                    placeholder={language === 'en' ? 'Enter price' : '가격 입력'}
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* 수량 입력 */}
              <View style={styles.orderInputSection}>
                <ThemedText style={styles.orderInputLabel}>{language === 'en' ? 'Quantity' : '수량'}</ThemedText>
                <View style={styles.orderInputContainer}>
                  <TextInput
                    style={styles.orderInput}
                    value={orderQuantity}
                    onChangeText={setOrderQuantity}
                    placeholder={language === 'en' ? 'Enter quantity' : '수량 입력'}
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* 주문 버튼 */}
              <TouchableOpacity
                style={[
                  styles.orderSubmitButton,
                  orderType === 'buy' ? styles.buyOrderButton : styles.sellOrderButton,
                  isOrdering && styles.orderButtonDisabled
                ]}
                onPress={handleWalletOrder}
                disabled={isOrdering}
              >
                <ThemedText style={styles.orderSubmitButtonText}>
                  {isOrdering 
                    ? (language === 'en' ? 'Processing...' : '주문 처리 중...') 
                    : (orderType === 'buy' 
                        ? (language === 'en' ? 'Place Buy Order' : '매수 주문하기') 
                        : (language === 'en' ? 'Place Sell Order' : '매도 주문하기')
                      )
                  }
                </ThemedText>
              </TouchableOpacity>
            </View>

            <ThemedText type="subtitle">{language === 'en' ? 'Order History' : '주문내역'}</ThemedText>
            
            {/* 주문 필터 탭 */}
            <View style={styles.orderFilterTabs}>
              {[
                { key: 'all', label: language === 'en' ? 'All' : '전체' },
                { key: 'buy', label: language === 'en' ? 'Buy' : '매수' },
                { key: 'sell', label: language === 'en' ? 'Sell' : '매도' },
              ].map(filter => (
                <TouchableOpacity 
                  key={filter.key} 
                  style={[styles.orderFilterTab, orderFilter === filter.key && styles.orderFilterTabActive]}
                  onPress={() => setOrderFilter(filter.key as 'all' | 'buy' | 'sell')}
                >
                  <ThemedText style={[styles.orderFilterText, orderFilter === filter.key && styles.orderFilterTextActive]}>
                    {filter.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* 주문 테이블 */}
            <View style={styles.orderTable}>
              <View style={styles.orderHeader}>
                <ThemedText style={[styles.orderHeadText, {flex:1.2}]}>{language === 'en' ? 'Time' : '시간'}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:0.8}]}>{language === 'en' ? 'Type' : '유형'}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:1}]}>{language === 'en' ? 'Symbol' : '종목'}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:1}]}>{language === 'en' ? 'Price' : '가격'}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:1}]}>{language === 'en' ? 'Quantity' : '수량'}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:0.8}]}>{language === 'en' ? 'Status' : '상태'}</ThemedText>
                <ThemedText style={[styles.orderHeadText, {flex:0.8}]}>{language === 'en' ? 'Action' : '액션'}</ThemedText>
              </View>
              
              {(() => {
                // 모의 주문 데이터 (실제로는 AsyncStorage나 API에서 가져와야 함)
                const mockOrders = [
                  {
                    id: 'order_1',
                    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30분 전
                    side: 'buy',
                    symbol: 'BTC/KRW',
                    price: 112000000,
                    quantity: 0.001,
                    status: 'FILLED',
                    filledQuantity: 0.001,
                    filledPrice: 112000000
                  },
                  {
                    id: 'order_2',
                    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2시간 전
                    side: 'sell',
                    symbol: 'ETH/KRW',
                    price: 4500000,
                    quantity: 0.1,
                    status: 'PENDING',
                    filledQuantity: 0,
                    filledPrice: 0
                  },
                  {
                    id: 'order_3',
                    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1일 전
                    side: 'buy',
                    symbol: 'YOY/KRW',
                    price: 150,
                    quantity: 1000,
                    status: 'CANCELLED',
                    filledQuantity: 0,
                    filledPrice: 0
                  }
                ];

                // 필터 적용
                const filteredOrders = orderFilter === 'all' 
                  ? mockOrders 
                  : mockOrders.filter(order => order.side === orderFilter);

                return filteredOrders.map(order => (
                  <View key={order.id} style={styles.orderRow}>
                    <ThemedText style={[styles.orderCell, {flex:1.2}]} numberOfLines={1}>
                      {new Date(order.timestamp).toLocaleDateString('ko-KR', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </ThemedText>
                    <ThemedText style={[styles.orderCell, {flex:0.8, color: order.side === 'buy' ? '#02C076' : '#F23645'}]} numberOfLines={1}>
                      {order.side === 'buy' ? (language === 'en' ? 'Buy' : '매수') : (language === 'en' ? 'Sell' : '매도')}
                    </ThemedText>
                    <ThemedText style={[styles.orderCell, {flex:1}]} numberOfLines={1}>
                      {order.symbol}
                    </ThemedText>
                    <ThemedText style={[styles.orderCell, {flex:1}]} numberOfLines={1}>
                      {order.price.toLocaleString()}
                    </ThemedText>
                    <ThemedText style={[styles.orderCell, {flex:1}]} numberOfLines={1}>
                      {order.quantity.toFixed(4)}
                    </ThemedText>
                    <ThemedText style={[styles.orderCell, {flex:0.8, color: 
                      order.status === 'FILLED' ? '#02C076' : 
                      order.status === 'PENDING' ? '#FFD54F' : 
                      order.status === 'CANCELLED' ? '#F23645' : '#FFFFFF'
                    }]} numberOfLines={1}>
                      {order.status === 'FILLED' ? (language === 'en' ? 'Filled' : '체결') :
                       order.status === 'PENDING' ? (language === 'en' ? 'Pending' : '대기') :
                       order.status === 'CANCELLED' ? (language === 'en' ? 'Cancelled' : '취소') : order.status}
                    </ThemedText>
                    <View style={{flex:0.8, alignItems: 'center'}}>
                      {order.status === 'PENDING' ? (
                        <TouchableOpacity 
                          style={styles.cancelOrderBtn}
                          onPress={() => {
                            Alert.alert(
                              language === 'en' ? 'Cancel Order' : '주문 취소',
                              language === 'en' ? 'Are you sure you want to cancel this order?' : '이 주문을 취소하시겠습니까?',
                              [
                                { text: language === 'en' ? 'No' : '아니오', style: 'cancel' },
                                { 
                                  text: language === 'en' ? 'Yes' : '예', 
                                  style: 'destructive',
                                  onPress: () => {
                                    // 주문 취소 로직
                                    Alert.alert(language === 'en' ? 'Order Cancelled' : '주문이 취소되었습니다.');
                                  }
                                }
                              ]
                            );
                          }}
                        >
                          <ThemedText style={styles.cancelOrderBtnText}>
                            {language === 'en' ? 'Cancel' : '취소'}
                          </ThemedText>
                        </TouchableOpacity>
                      ) : (
                        <ThemedText style={[styles.orderCell, {color: '#666'}]}>-</ThemedText>
                      )}
                    </View>
                  </View>
                ));
              })()}
            </View>
          </View>
        )}
      </ScrollView>
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
      <ProfileSheet 
        visible={profileOpen} 
        onClose={() => setProfileOpen(false)}
        onSaved={async (newAvatarUri) => {
          setAvatarUri(newAvatarUri);
          setProfileOpen(false);
          
          // username도 다시 로드
          if (currentUser?.uid) {
            const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
            if (info) {
              try {
                const parsedInfo = JSON.parse(info);
                setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              } catch {
                setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              }
            }
          }
        }}
      />
      
      {/* 거래 상세 모달 */}
      {selectedTransaction && (
        <TransactionDetailModal
          visible={transactionDetailVisible}
          tx={selectedTransaction}
          onClose={() => {
            setTransactionDetailVisible(false);
            setSelectedTransaction(null);
          }}
          onSaveMemo={updateTransactionMemo}
          memoDraft={memoDraft}
          setMemoDraft={setMemoDraft}
        />
      )}
      
      {/* 지갑 생성 모달 */}
      {selectedCoin && (
        <WalletCreateModal
          visible={walletModalVisible}
          onClose={() => setWalletModalVisible(false)}
          coinSymbol={selectedCoin.symbol}
          coinName={selectedCoin.name}
          coinNetwork={selectedCoin.network}
        />
      )}

      {/* QR 코드 팝업 모달 */}
      {qrCoin && (
        <Modal
          visible={qrModalVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          hardwareAccelerated
          onRequestClose={() => setQrModalVisible(false)}
        >
          <View style={styles.qrModalOverlay}>
            <View
              style={styles.qrModalContent}
              ref={qrModalContentRef as any}
              collapsable={false}
              renderToHardwareTextureAndroid
            >
              <View style={styles.qrModalHeader}>
                <ThemedText style={styles.qrModalTitle}>
                  {qrModalType === 'pngsave' 
                    ? `[${qrCoin.symbol}] / ${recvInput ? `${recvInput} ${qrCoin.symbol}` : '—'}`
                    : `[${qrCoin.symbol}] Wallet`
                  }
                </ThemedText>
                <TouchableOpacity 
                  style={styles.qrModalCloseButton}
                  onPress={() => setQrModalVisible(false)}
                >
                  <ThemedText style={styles.qrModalCloseButtonText}>×</ThemedText>
                </TouchableOpacity>
              </View>
              
              <View style={[styles.qrModalBody, { paddingTop: 16 }]}>
                {qrModalType === 'wallet' && (
                  <View style={{ alignItems:'center', marginBottom: 8 }}>
                    <ThemedText style={{ color:'#FFD700', fontWeight:'800', fontSize:16 }}>QR코드</ThemedText>
                  </View>
                )}
                {/* PNG 저장 미리보기는 오프스크린 저장 레이아웃과 동일한 구조로 렌더 */}
                {qrModalType === 'pngsave' ? (
                  <View style={{ alignItems:'center', justifyContent:'center' }}>
                    {/* 상단 타이틀 */}
                    <View style={{ alignItems:'center', marginBottom: 12 }}>
                      <ThemedText style={{ color:'#FFD700', fontWeight:'800', fontSize:20 }}>
                        {`[${qrCoin.symbol}] / ${recvInput || '0'} ${qrCoin.symbol}`}
                      </ThemedText>
                    </View>
                    {/* 프레임 + 내부 화이트 패널 */}
                    <View style={{ padding:0, borderRadius:18, borderWidth:8, borderColor:'#D4AF37', backgroundColor:'#000' }}>
                      <View style={{ margin:8, backgroundColor:'#fff', borderRadius:12, padding:0, borderWidth:1, borderColor:'#000' }}>
                        <View style={{ width:300, height:300, alignItems:'center', justifyContent:'center', backgroundColor:'#fff', borderRadius:8 }} ref={qrShotBoxRef as any}>
                          {(() => {
                            const addr = qrCoin.address;
                            const amtForUrl = recvAmountType === 'amount'
                              ? convertAmountToQuantity(parseFloat(recvInput) || 0, qrCoin.symbol).toString()
                              : (recvInput || '');
                            const payload = buildPayUri(addr, qrCoin.symbol, amtForUrl);
                            if (QRCode && Platform.OS !== 'web') {
                              const Comp = QRCode as any;
                              return (
                                <Comp
                                  value={payload}
                                  size={300}
                                  backgroundColor="#FFFFFF"
                                  color="#000000"
                                  quietZone={56}
                                  ecl="H"
                                  logo={require('@/assets/images/side_logo.png')}
                                  logoSize={90}
                                  logoBackgroundColor="#000000"
                                  logoMargin={3}
                                  getRef={(c:any)=>{ (qrRef as any).current = c; }}
                                />
                              );
                            }
                            // 웹 폴백 이미지
                            const url = `https://api.qrserver.com/v1/create-qr-code/?size=340x340&ecc=H&margin=12&color=000000&bgcolor=ffffff&data=${encodeURIComponent(payload)}`;
                            return <Image source={{ uri: url }} style={{ width: 284, height: 284 }} resizeMode="contain" />;
                          })()}
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                <View style={styles.qrCodeContainer}>
                  <View style={[styles.qrCodeBox, styles.qrFrame, { marginTop: 10 }]}> 
                    <View style={styles.qrCode}>
                    {(() => {
                      // QR2: 데이터 URL(payload) + 중앙 로고 포함
                      const addr = qrCoin.address;
                      const amtForUrl = recvAmountType === 'amount'
                        ? convertAmountToQuantity(parseFloat(recvInput) || 0, qrCoin.symbol).toString()
                        : (recvInput || '');
                      const payload = buildPayUri(addr, qrCoin.symbol, amtForUrl);
                      // 웹에서는 라이브러리 호환성 이슈가 있어 항상 이미지 폴백 사용
                      if (Platform.OS !== 'web' && QRCode) {
                        try {
                          const Comp = QRCode as any;
                          const showCenterLogo = false; // 네이티브에선 QR 내부 로고 옵션 사용
                          return (
                            <View style={styles.qrCodeWrapper} ref={qrShotBoxRef as any} collapsable={false}>
                              <Comp 
                                value={payload} 
                                size={360}
                                backgroundColor="#FFFFFF" 
                                color="#000000"
                                quietZone={56}
                                ecl="H"
                                logo={require('@/assets/images/side_logo.png')}
                                logoSize={96}
                                logoBackgroundColor="#000000"
                                logoMargin={3}
                                getRef={(c:any)=>{ (qrRef as any).current = c; }}
                              />
                              {showCenterLogo && (
                                <View style={styles.qrCenterLogoAbsWrap}>
                                  <View style={styles.qrCenterLogoAbs}>
                                    <Image 
                                      source={require('@/assets/images/side_logo.png')} 
                                      style={styles.qrCenterLogoAbsImg} 
                                      resizeMode="contain" 
                                    />
                                  </View>
                                </View>
                              )}
                            </View>
                          );
                        } catch {}
                      }
                      // 폴백: API 생성 (웹 기본) - 고해상도, 여백/색상 명시
                      const url = `https://api.qrserver.com/v1/create-qr-code/?size=340x340&ecc=H&margin=12&color=000000&bgcolor=ffffff&data=${encodeURIComponent(payload)}`;
                      return (
                        <View style={styles.qrCodeWrapper} ref={qrShotBoxRef as any} collapsable={false}>
                          <Image source={{ uri: url }} style={{ width: 284, height: 284 }} resizeMode="contain" />
                          {true && (
                            <View style={styles.qrCenterLogoAbsWrap}>
                              <View style={styles.qrCenterLogoAbs}>
                                <Image 
                                  source={require('@/assets/images/side_logo.png')} 
                                  style={styles.qrCenterLogoAbsImg} 
                                  resizeMode="contain" 
                                />
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })()}
                    </View>
                  </View>
                </View>
                )}
                
                {qrModalType === 'wallet' && (
                  <ThemedText style={styles.qrAddressLabel}>
                    {`${currentUser?.displayName || currentUser?.email || '사용자'}님의 ${qrCoin.symbol} 지갑입니다.`}
                  </ThemedText>
                )}
                
                {qrModalType !== 'pngsave' && (
                  <View style={styles.qrAddressContainer}>
                  {qrModalType === 'wallet' ? (
                    <>
                      <TouchableOpacity 
                        style={[styles.ctaCopy, { flex:1, backgroundColor:'#243034', borderColor:'#375A64' }]}
                        onPress={async () => {
                          try {
                            const addr = qrCoin.address;
                            try {
                              const Clipboard = require('expo-clipboard');
                              await Clipboard.setStringAsync(addr);
                            } catch {
                              await (navigator as any)?.clipboard?.writeText?.(addr);
                            }
                            Alert.alert(language==='en'?'Copied':'복사됨', `${qrCoin.symbol} 지갑주소가 복사되었습니다`);
                          } catch {}
                        }}
                      >
                        <ThemedText style={styles.ctaCopyText}>{`${qrCoin.symbol}지갑주소 복사`}</ThemedText>
                      </TouchableOpacity>
                    </>
                  ) : (
                    (() => {
                    const addr = qrCoin.address;
                    const amtForUrl = recvAmountType === 'amount'
                      ? convertAmountToQuantity(parseFloat(recvInput) || 0, qrCoin.symbol).toString()
                      : (recvInput || '');
                    const url = buildPayUri(addr, qrCoin.symbol, amtForUrl);
                    return (
                      <>
                        <ThemedText style={styles.qrAddressText} numberOfLines={1} ellipsizeMode="middle">
                          {url}
                        </ThemedText>
                        <TouchableOpacity 
                          style={styles.qrCopyButton}
                          onPress={async () => {
                            try {
                                try {
                                  const Clipboard = require('expo-clipboard');
                                  await Clipboard.setStringAsync(url);
                                } catch {
                              await (navigator as any)?.clipboard?.writeText?.(url);
                                }
                              setQrModalCopySuccess(true);
                              setTimeout(() => setQrModalCopySuccess(false), 2000);
                            } catch (error) {
                              console.error('Copy failed:', error);
                            }
                          }}
                        >
                          {qrModalCopySuccess ? (
                            <Ionicons name="checkmark" size={16} color="#4CAF50" />
                          ) : (
                            <Ionicons name="copy-outline" size={16} color="#FFFFFF" />
                          )}
                        </TouchableOpacity>
                      </>
                    );
                    })()
                  )}
                  </View>
                )}
                
                {qrModalType === 'wallet' && (
                  <View style={styles.qrButtonContainer}>
                    {qrModalTab === 'send' ? (
                      <View style={styles.qrButtonRow}>
                        <TouchableOpacity 
                          style={[styles.qrCancelButton, { flex: 1 }]}
                          onPress={async () => {
                            try {
                              await deleteWallet(qrCoin.symbol);
                              setQrModalVisible(false);
                              Alert.alert(
                                language === 'en' ? 'Success' : '완료',
                                language === 'en' ? `${qrCoin.symbol} wallet has been reset` : `${qrCoin.symbol} 지갑이 해제되었습니다`
                              );
                            } catch (error) {
                              Alert.alert(
                                language === 'en' ? 'Error' : '오류',
                                language === 'en' ? 'Failed to reset wallet' : '지갑 해제에 실패했습니다'
                              );
                            }
                          }}
                        >
                          <ThemedText style={styles.qrCancelButtonText}>
                            {language === 'en' ? 'Reset' : '해제'}
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.qrSendButton, { flex: 2 }]}
                          onPress={() => {
                            setQrModalVisible(false);
                            setActiveTab('send');
                            setSendSelectedSymbol(qrCoin.symbol);
                          }}
                        >
                          <ThemedText style={styles.qrSendButtonText}>
                            {qrCoin.symbol} {t('walletSend', language)}
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.qrButtonRow}>
                        <TouchableOpacity 
                          style={[styles.qrCancelButton, { flex: 1 }]}
                          onPress={async () => {
                            try {
                              await deleteWallet(qrCoin.symbol);
                              setQrModalVisible(false);
                              Alert.alert(
                                language === 'en' ? 'Success' : '완료',
                                language === 'en' ? `${qrCoin.symbol} wallet has been reset` : `${qrCoin.symbol} 지갑이 해제되었습니다`
                              );
                            } catch (error) {
                              Alert.alert(
                                language === 'en' ? 'Error' : '오류',
                                language === 'en' ? 'Failed to reset wallet' : '지갑 해제에 실패했습니다'
                              );
                            }
                          }}
                        >
                          <ThemedText style={styles.qrCancelButtonText}>
                            {language === 'en' ? 'Reset' : '해제'}
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.qrReceiveButton, { flex: 2 }]}
                          onPress={() => {
                            setQrModalVisible(false);
                            setActiveTab('receive');
                            setRecvSelectedSymbol(qrCoin.symbol);
                          }}
                        >
                          <ThemedText style={styles.qrReceiveButtonText}>
                            {qrCoin.symbol} {t('walletReceive', language)}
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
              
              {/* 경고 섹션 제거 요청 */}
            </View>
            
            {/* 다운로드 버튼 - 팝업 컨테이너 밖 */}
            {qrModalType === 'pngsave' && (
              <View style={styles.qrModalDownloadButtonContainer}>
                <TouchableOpacity style={[styles.qrSaveButton, qrModalCopySuccess && { backgroundColor:'#4CAF50', borderColor:'#4CAF50' }]} onPress={async()=>{
                  // copy 버튼과 동일한 payload(수량/금액 변환 포함)
                  const addr = qrCoin.address;
                  const amtForUrl = recvAmountType === 'amount' 
                    ? convertAmountToQuantity(parseFloat(recvInput) || 0, qrCoin.symbol).toString()
                    : (recvInput || '');
                  const payload = buildPayUri(addr, qrCoin.symbol, amtForUrl);
                  const title = `[${qrCoin.symbol}] / ${recvInput || '0'} ${qrCoin.symbol}`;
                  // 네이티브/웹 공통: 내부 생성 로직으로 저장 (view-shot 사용 안 함: 일부 기기에서 검은 화면 저장 이슈)
                  let ok = false;
                  try {
                      ok = await handleSaveQrImage(payload, title);
                  } catch {}
                  if (ok) {
                    try {
                      setQrModalCopySuccess(true);
                      // 체크 아이콘이 잠깐 표시된 뒤 모달 자동 닫기
                      setTimeout(()=>{
                        setQrModalCopySuccess(false);
                        setQrModalVisible(false);
                      }, 900);
                    } catch {}
                  }
                }}>
                  {qrModalCopySuccess ? (
                    <Ionicons name="checkmark" size={22} color="#000" />
                  ) : (
                    <ThemedText style={styles.qrSaveIcon}>↓</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* 오프스크린 QR 저장 전용 뷰(제목 + 프레임 + QR) */}
      <View style={{ position:'absolute', left: -10000, top: -10000, width: 360, height: 450, padding: 0, backgroundColor:'#000' }} pointerEvents="none" collapsable={false} ref={qrExportRef as any}>
        <View style={{ width: 360, height: 450, backgroundColor:'#000', alignItems:'center', justifyContent:'center' }}>
          {/* 상단 타이틀 */}
          <View style={{ position:'absolute', top: 0, left:0, right:0, height:64, alignItems:'center', justifyContent:'center' }}>
            <ThemedText style={{ color:'#FFD700', fontWeight:'800', fontSize:20 }}>
              {`[${recvSelectedSymbol}] / ${recvInput || '0'} ${recvSelectedSymbol}`}
            </ThemedText>
          </View>
          {/* 프레임 + QR */}
          <View style={{ marginTop:64, padding:0, borderRadius:18, borderWidth:8, borderColor:'#D4AF37', backgroundColor:'#000' }}>
            <View style={{ margin:8, backgroundColor:'#fff', borderRadius:12, padding:0 }}>
              <View style={{ width:300, height:300, alignItems:'center', justifyContent:'center', backgroundColor:'#fff', borderRadius:8 }}>
                {(() => {
                  const addr = getWalletBySymbol(recvSelectedSymbol)?.address || recvAddress || '';
                  const amtForUrl = recvAmountType === 'amount'
                    ? convertAmountToQuantity(parseFloat(recvInput) || 0, recvSelectedSymbol).toString()
                    : (recvInput || '');
                  const payload = buildPayUri(addr, recvSelectedSymbol, amtForUrl);
                  if (QRCode) {
                    const Comp = QRCode as any;
                    return (
                      <Comp
                        value={payload}
                        size={300}
                        backgroundColor="#FFFFFF"
                        color="#000000"
                        quietZone={48}
                        ecl="H"
                        logo={require('@/assets/images/side_logo.png')}
                        logoSize={32}
                        logoBackgroundColor="#000000"
                        logoMargin={3}
                      />
                    );
                  }
                  return null;
                })()}
              </View>
            </View>
          </View>
        </View>
      </View>
      {/* 커스텀 페이로드 QR 모달 (기프트/바우처 공유) */}
      {customQrPayload && (
        <Modal visible={customQrVisible} transparent animationType="fade" onRequestClose={()=>setCustomQrVisible(false)}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.7)', alignItems:'center', justifyContent:'center', padding:16 }}>
            <View style={{ width:'90%', maxWidth:420, backgroundColor:'#0F171B', borderRadius:16, borderWidth:1, borderColor:'#1F2C31', padding:16, alignItems:'center' }} ref={qrModalContentRef as any}>
              <ThemedText style={{ color:'#EDEDED', fontSize:16, marginBottom:12 }}>{isGiftPayload(customQrPayload) ? 'QR Gift' : (language==='en'?'Share QR':'QR 공유')}</ThemedText>
              <View ref={customQrBoxRef as any} style={{ width:240, height:240, borderRadius:16, overflow:'hidden', backgroundColor:'#fff', alignItems:'center', justifyContent:'center', borderWidth:4, borderColor: isGiftPayload(customQrPayload) ? '#D32F2F' : '#FFD700' }}>
                {(() => {
                  const data = customQrPayload || '';
                  if (Platform.OS !== 'web' && QRCode) {
                    const Comp = QRCode as any;
                    return (
                      <View style={{ width:220, height:220, backgroundColor:'#fff' }}>
                        <Comp value={data} size={220} />
                        <View style={{ position:'absolute', left: '50%', top: '50%', width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: 8, overflow:'hidden', backgroundColor:'#000', alignItems:'center', justifyContent:'center', borderWidth: isGiftPayload(data)? 2 : 4, borderColor: isGiftPayload(data) ? '#D32F2F' : '#FFD700' }}>
                          <Image source={require('@/assets/images/side_logo.png')} style={{ width:42, height:42 }} resizeMode="contain" />
                        </View>
                      </View>
                    );
                  }
                  const url = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(data)}`;
                  return (
                    <View style={{ width:240, height:240, backgroundColor:'#fff' }}>
                      <Image source={{ uri: `${url}&ecc=H&margin=24&color=000000&bgcolor=ffffff` }} style={{ width:240, height:240 }} />
                      <View style={{ position:'absolute', left: '50%', top: '50%', width: 54, height: 54, marginLeft: -27, marginTop: -27, borderRadius: 8, overflow:'hidden', backgroundColor:'#000', alignItems:'center', justifyContent:'center', borderWidth: isGiftPayload(data)? 2 : 4, borderColor: isGiftPayload(data) ? '#D32F2F' : '#FFD700' }}>
                        <Image source={require('@/assets/images/side_logo.png')} style={{ width:44, height:44 }} resizeMode="contain" />
                      </View>
                    </View>
                  );
                })()}
              </View>
              <View style={{ marginTop:12, width:'100%', gap:8 }}>
                <TouchableOpacity style={[styles.ctaCopy,{ width:'100%' }]} onPress={async()=>{
                  try {
                    if (customQrPayload) {
                      try {
                        const Clipboard = require('expo-clipboard');
                        await Clipboard.setStringAsync(customQrPayload);
                      } catch {
                        await (navigator as any)?.clipboard?.writeText?.(customQrPayload);
                      }
                    }
                    Alert.alert(language==='en'?'Copied':'복사됨');
                  } catch {}
                }}>
                  <ThemedText style={styles.ctaCopyText}>{language==='en'?'Copy link':'링크 복사'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ctaShare,{ width:'100%' }]} onPress={async()=>{
                  try {
                    // 캡처로 스타일 포함 저장
                    let ok = false;
                    if (Platform.OS !== 'web' && captureRef && customQrBoxRef.current) {
                      const uri = await captureRef(customQrBoxRef.current, { format: 'png', quality: 1, result: 'tmpfile' });
                      const perm = await MediaLibrary.requestPermissionsAsync();
                      if (perm.status === 'granted' && uri) { await MediaLibrary.saveToLibraryAsync(uri); ok = true; }
                    } else if ((Platform as any).OS === 'web' && customQrBoxRef.current) {
                      try {
                        // 사전 처리: 외부 QR 이미지를 dataURL로 대체해 CORS 회피
                        const boxEl = customQrBoxRef.current as unknown as HTMLElement;
                        const imgEl = boxEl.querySelector('img');
                        let restoreSrc: string | null = null;
                        let tmpUrl: string | null = null;
                        if (imgEl && imgEl.getAttribute('src')?.includes('api.qrserver.com')) {
                          restoreSrc = imgEl.getAttribute('src');
                          const proxy = `${window.location.origin}/api/proxy?url=${encodeURIComponent(restoreSrc || '')}`;
                          const resp = await fetch(proxy);
                          const blob = await resp.blob();
                          tmpUrl = URL.createObjectURL(blob);
                          await new Promise<void>((resolve) => {
                            imgEl.onload = () => resolve();
                            imgEl.setAttribute('src', tmpUrl!);
                          });
                        }
                        // @ts-ignore
                        const html2canvas = (await import('html2canvas')).default;
                        const canvas = await html2canvas(customQrBoxRef.current as any, { backgroundColor: '#0F171B', scale: 2, useCORS: true });
                        const dataUrl = canvas.toDataURL('image/png');
                        const link = document.createElement('a');
                        link.download = 'yooy-gift-qr.png';
                        link.href = dataUrl;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        try {
                          if (restoreSrc) imgEl?.setAttribute('src', restoreSrc);
                          if (tmpUrl) URL.revokeObjectURL(tmpUrl);
                        } catch {}
                        ok = true;
                      } catch {}
                    } else {
                      // 폴백
                      ok = await handleSaveQrImage(customQrPayload || '', isGiftPayload(customQrPayload) ? 'Gift QR' : 'QR');
                    }
                    if (ok) Alert.alert(language==='en'?'Saved':'저장됨');
                  } catch {}
                }}>
                  <ThemedText style={styles.ctaShareText}>{language==='en'?'Save as PNG':'PNG 저장'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ctaShare,{ width:'100%' }]} onPress={()=> setCustomQrVisible(false)}>
                  <ThemedText style={styles.ctaShareText}>{language==='en'?'Close':'닫기'}</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 지갑 안내 모달 */}
      <Modal visible={introVisible} transparent animationType="fade" onRequestClose={handleIntroCancel}>
        <View style={styles.introOverlay}>
          <View style={styles.introModal}>
            <View style={styles.introHeader}>
              <ThemedText style={styles.introTitle}>{t('yoyWalletIntroTitle', language)}</ThemedText>
            </View>

            <View style={styles.introBody}>
              <View style={styles.introNotice}>
                <ThemedText style={styles.introNoticeTitle}>{t('yoyWalletIntroNotice', language)}</ThemedText>
                <TouchableOpacity><ThemedText style={styles.introGuideLink}>{t('yoyWalletIntroGuide', language)}</ThemedText></TouchableOpacity>
              </View>

              <View style={styles.introList}>
                <ThemedText style={styles.introItem}>• {t('yoyWalletIntroBullet1', language)}</ThemedText>
                <ThemedText style={styles.introItem}>• {t('yoyWalletIntroBullet2', language)}</ThemedText>
                <ThemedText style={styles.introItem}>• {t('yoyWalletIntroBullet3', language)}</ThemedText>
                <ThemedText style={styles.introItem}>• {t('yoyWalletIntroBullet4', language)}</ThemedText>
              </View>

              <View style={styles.introFooterNote}>
                <ThemedText style={styles.introFooterText}>{t('yoyWalletIntroFooter', language)}</ThemedText>
              </View>

              <TouchableOpacity style={styles.introCheckRow} onPress={() => setIntroDontShow(v => !v)}>
                <View style={[styles.checkbox, introDontShow && styles.checkboxChecked]} />
                <ThemedText style={styles.introCheckText}>{t('dontShowAgain', language)}</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.introActions}>
              <TouchableOpacity style={styles.introCancel} onPress={handleIntroCancel}>
                <ThemedText style={styles.introCancelText}>{t('cancel', language)}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.introConfirm} onPress={handleIntroConfirm}>
                <ThemedText style={styles.introConfirmText}>{t('ok', language)}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TransactionDetailModal 
        visible={!!txDetail} 
        tx={txDetail} 
        onClose={()=>setTxDetail(null)} 
        memoDraft={memoDraft} 
        setMemoDraft={setMemoDraft} 
        onSaveMemo={async(id, memo)=>{ await updateTransactionMemo(id, memo); setTxDetail(null); }}
      />
      <QuickActionsSettings visible={quickSettingsVisible} onClose={()=>setQuickSettingsVisible(false)} />

      {/* 코인 상세 모달 */}
            {selectedCoinForDetail && (
              <CoinDetailModal
                visible={coinDetailModalVisible}
                onClose={handleCloseModal}
                coin={{
                  symbol: selectedCoinForDetail.symbol,
                  name: selectedCoinForDetail.name || selectedCoinForDetail.symbol,
                  amount: selectedCoinForDetail.amount,
                  valueUSD: selectedCoinForDetail.currentValue || selectedCoinForDetail.valueUSD,
                  logo: selectedCoinForDetail.symbol,
                }}
                onNavigateToWallet={handleNavigateToWallet}
                onNavigateToMarket={handleNavigateToMarket}
              />
        )}

        {/* 주문 영수증 모달 */}
        {showOrderReceiptModal && orderResult && (
          <Modal
            visible={showOrderReceiptModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowOrderReceiptModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.receiptModal}>
                <View style={styles.receiptHeader}>
                  <ThemedText style={styles.receiptTitle}>
                    {language === 'en' ? 'Order Receipt' : '주문 영수증'}
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setShowOrderReceiptModal(false)}
                  >
                    <ThemedText style={styles.closeButtonText}>×</ThemedText>
                  </TouchableOpacity>
                </View>

                <View style={styles.receiptContent}>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptLabel}>{language === 'en' ? 'Order ID' : '주문번호'}</ThemedText>
                    <ThemedText style={styles.receiptValue}>{orderResult.id}</ThemedText>
                  </View>
                  
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptLabel}>{language === 'en' ? 'Symbol' : '종목'}</ThemedText>
                    <ThemedText style={styles.receiptValue}>{orderResult.symbol}</ThemedText>
                  </View>
                  
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptLabel}>{language === 'en' ? 'Type' : '유형'}</ThemedText>
                    <ThemedText style={[
                      styles.receiptValue,
                      orderResult.side === 'buy' ? styles.buyText : styles.sellText
                    ]}>
                      {orderResult.side === 'buy' 
                        ? (language === 'en' ? 'Buy' : '매수') 
                        : (language === 'en' ? 'Sell' : '매도')
                      }
                    </ThemedText>
                  </View>
                  
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptLabel}>{language === 'en' ? 'Price' : '가격'}</ThemedText>
                    <ThemedText style={styles.receiptValue}>{orderResult.price?.toLocaleString()}</ThemedText>
                  </View>
                  
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptLabel}>{language === 'en' ? 'Quantity' : '수량'}</ThemedText>
                    <ThemedText style={styles.receiptValue}>{orderResult.quantity}</ThemedText>
                  </View>
                  
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptLabel}>{language === 'en' ? 'Status' : '상태'}</ThemedText>
                    <ThemedText style={[
                      styles.receiptValue,
                      orderResult.status === 'FILLED' ? styles.filledText : 
                      orderResult.status === 'PENDING' ? styles.pendingText : styles.cancelledText
                    ]}>
                      {orderResult.status === 'FILLED' ? (language === 'en' ? 'Filled' : '체결') :
                       orderResult.status === 'PENDING' ? (language === 'en' ? 'Pending' : '대기') :
                       (language === 'en' ? 'Cancelled' : '취소')}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.receiptActions}>
                  {orderResult.status === 'PENDING' && (
                    <TouchableOpacity
                      style={styles.cancelOrderButton}
                      onPress={() => {
                        alert(language === 'en' ? 'Order cancelled' : '주문이 취소되었습니다.');
                        setOrderResult((prev: any) => ({ ...prev, status: 'CANCELLED' }));
                      }}
                    >
                      <ThemedText style={styles.cancelOrderButtonText}>
                        {language === 'en' ? 'Cancel Order' : '주문 취소'}
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={() => setShowOrderReceiptModal(false)}
                  >
                    <ThemedText style={styles.confirmButtonText}>
                      {language === 'en' ? 'Confirm' : '확인'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </ThemedView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0C0C0C',
  },
  totalCard: {
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  assetCardBg: { borderRadius: 16, overflow: 'hidden', marginBottom: 12, marginTop: 2 },
  assetCardBorder: { borderWidth: 2, borderColor: '#FFD700', borderRadius: 16 },
  cardContent: { paddingTop: 2, paddingBottom: 24, paddingHorizontal: 20, alignItems:'center', justifyContent:'center', minHeight: 180 },
  decorGlow: { display:'none' },
  patternLayer: { display:'none' },
  cardCornerLogo: { position:'absolute', right: 10, bottom: 10, width: 56, height: 24, opacity: 0.9 },
  assetHeaderRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  assetDivider: { height: 0 },
  totalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  totalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  totalAmount: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 0.2, marginVertical: 20 },
  totalBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalMetaLabel: { color: '#9AA0A6' },
  assetsChip: { backgroundColor: 'rgba(212,175,55,0.12)', borderWidth: 1, borderColor: '#D4AF37', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  assetsChipText: { color: '#FFD700', fontWeight: '700' },
  currencyChip: { backgroundColor: '#131313', borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  currencyChipText: { color: '#FFFFFF', fontWeight: '700' },
  totalLabel: { color:'#C3C3C3', fontWeight:'700', marginBottom: 6 },
  assetsCountText: { color:'#7DE1B2', fontWeight:'700', marginTop: 10 },
  quickHeaderRow: { marginTop: 6, marginBottom: 6 },
  quickHeader: { color:'#FFFFFF', fontWeight:'800', fontSize: 16 },
  quickGrid: { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', marginBottom: 12 },
  quickTile: { width:'23.5%', aspectRatio: 1, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#D4AF37', borderRadius:14, marginBottom: 12, padding:4, alignItems:'center', justifyContent:'center' },
  tileIcon: { width:38, height:38, alignItems:'center', justifyContent:'center', marginBottom: 2 },
  tileIconText: { color:'#FFFFFF', fontWeight:'800', fontSize:24 },
  tileText: { color:'#FFFFFF', fontWeight:'700', fontSize:12, marginTop: 0 },
  rewardTile: { backgroundColor:'#22062A', borderColor:'#6E2A8C' },
  rewardIcon: {},
  rewardCheck: { position:'absolute', right:8, top:6, color:'#FFD700', fontWeight:'800' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0E0E0E',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  tabText: { color: '#AAA', fontWeight: '600' },
  tabTextActive: { color: '#FFD700' },
  txTable: { marginTop: 8, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, overflow: 'hidden' },
  txHeader: { flexDirection: 'row', backgroundColor: '#121212', paddingVertical: 8, paddingHorizontal: 12 },
  txHeadText: { color: '#AAAAAA', fontWeight: '700', fontSize: 12 },
  txRow: { flexDirection: 'row', backgroundColor: '#0E0E0E', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  txCell: { color: '#FFFFFF', fontSize: 12 },
  txMemoCell: { justifyContent: 'center', alignItems: 'flex-end' },
  memoEditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  memoInput: { minWidth: 120, maxWidth: 180, backgroundColor: '#151515', borderWidth: 1, borderColor: '#333', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: '#FFF', fontSize: 12 },
  memoSaveBtn: { backgroundColor: '#FFD700', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  memoSaveText: { color: '#000', fontWeight: '800', fontSize: 12 },
  memoView: { paddingVertical: 2, paddingHorizontal: 6 },
  txDetailRow: { color:'#FFFFFF' },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerCol: { flex: 1, alignItems: 'center' },
  headerColRight: { flex: 1, alignItems: 'flex-end', paddingRight: 6 },
  headerColName: { flex: 1.2, alignItems: 'flex-start', paddingLeft: 6 },
  headerText: { color: '#999', fontSize: 12 },
  headerSubText: { color: '#777', fontSize: 10 },
  headerTextRight: { color: '#999', fontSize: 12, textAlign: 'right' },
  headerSubTextRight: { color: '#777', fontSize: 10, textAlign: 'right' },
  headerTwoLine: { paddingVertical: 0 },

  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000', // 보유한 자산 배경을 검정색으로
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    paddingVertical: 4,
  },
  coinIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
  },
  coinLogo: { width: 28, height: 28, borderRadius: 14 },
  coinSymbol: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  coinPair: { color: '#AAA', fontSize: 11 },
  cellText: { color: '#FFF', fontSize: 12 },
  cellSubText: { color: '#AAA', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  input: { borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 10, marginVertical: 8 },
  walletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  walletCard: {
    width: '30%', // 3xN 그리드에서 더 많은 코인 표시
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6, // 10에서 6으로 줄임
    paddingHorizontal: 8,
    marginBottom: 6, // 10에서 6으로 줄임
    alignItems: 'center',
  },
  walletCardActive: {
    backgroundColor: '#000000', // 보유한 코인은 블랙 배경
    borderColor: '#FFD700',
  },
  walletCardInactive: {
    backgroundColor: '#1A1A1A', // 보유하지 않은 코인은 회색 배경
    borderColor: '#2A2A2A',
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4, // 6에서 4로 줄임
  },
  walletLogo: { width: 36, height: 36, borderRadius: 18 },
  walletLogoEmpty: { width: 36, height: 36, borderRadius: 18 },
  walletName: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  walletNetwork: { color: '#9AA0A6', fontSize: 10, marginBottom: 4 }, // 6에서 4로 줄임
  walletBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#133A2E',
  },
  walletBtnActive: {
    backgroundColor: '#FFD700', // 발행된 코인 버튼은 골드색
  },
  walletBtnText: { color: '#A6F0C6', fontSize: 10 },
  walletBtnTextActive: { color: '#000000', fontSize: 10 }, // 발행된 코인 버튼 텍스트는 검정색
  
  // 받기 영역 스타일
  receiveSection: {
    marginBottom: 24,
  },
  receiveCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 20,
  },
  receiveHeader: {
    marginBottom: 20,
  },
  receiveTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  receiveSubtitle: {
    color: '#9AA0A6',
    fontSize: 14,
  },
  receiveContent: {
    alignItems: 'center',
  },
  qrCodeContainer: { marginBottom: 2, alignItems: 'center', justifyContent: 'center' },
  qrCodeBox: { padding: 8 },
  qrFrame: { borderWidth: 4, borderColor: '#D4AF37', borderRadius: 20, backgroundColor: '#000' },
  qrCodePlaceholder: {
    width: 280,
    height: 280,
    backgroundColor: '#1A1A1A',
    borderRadius: 4,
    borderWidth: 4,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCodeText: {
    color: '#666',
    fontSize: 14,
  },
  addressContainer: {
    width: '100%',
    marginBottom: 16,
  },
  addressLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addressText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  copyButtonText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#2A1F13',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A2F13',
    padding: 12,
  },
  warningText: {
    color: '#FFB74D',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  
  // 지갑 섹션 스타일
  walletSection: {
    marginTop: 8,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  coinCounter: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '500',
  },
  sectionSubtitle: {
    color: '#9AA0A6',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  
  // 지갑 액션 버튼 스타일
  walletActions: {
    marginBottom: 16,
    gap: 8,
  },
  resetYOYWalletButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  resetYOYWalletButtonText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetWalletsButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  resetWalletsButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // QR 코드 팝업 모달 스타일
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModalContent: {
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FFD700',
    padding: 18,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  qrModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  qrModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  qrModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  qrModalBody: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  qrModalCodeContainer: {
    marginBottom: 20,
  },
  qrCode: {
    width: 200,
    height: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 4,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative', // 중앙 로고 절대 위치 기준
  },
  qrCodeFallback: {
    width: 200,
    height: 200,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCodeImage: {
    width: 200,
    height: 200,
  },
  qrLogoOverlay: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  qrLogoOverlayQR1: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  qrLogoOverlayQR2: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFD700',
  },
  // QR 중앙 로고(팝업 렌더용): 검정 배경 위, 4px 골드 테두리
  qrCenterLogoAbsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrCenterLogoAbs: {
    position: 'absolute',
    width: 72,
    height: 72,
    backgroundColor: '#000000',
    borderWidth: 4,
    borderColor: '#FFD700',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrCenterLogoAbsImg: {
    width: 48,
    height: 48
  },
  qrCodeWrapper: {
    position: 'relative',
    backgroundColor: '#000000',
    borderWidth: 6,
    borderColor: '#FFD700',
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLogoImage: {
    width: 24,
    height: 24,
  },
  logoImage: {
    width: 30,
    height: 30,
  },
  logoImageSmall: {
    width: 24,
    height: 24,
  },
  qrAddressLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  qrAddressContainer: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qrAddressText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    flex: 1,
  },
  qrCopyButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#333333',
    marginLeft: 8,
  },
  qrButtonContainer: {
    width: '100%',
    marginBottom: 20,
  },
  qrButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  qrReceiveButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 120,
  },
  qrReceiveButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  qrFloatingSave: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: -48,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5C556',
  },
  qrFloatingSaveInline: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5C556',
    zIndex: 5,
  },
  qrSaveRow: { width: '100%', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  qrModalDownloadButtonContainer: { 
    alignItems: 'center', 
    marginTop: 20,
    marginBottom: 20
  },
  qrSaveButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFD700', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E5C556' },
  qrSaveIcon: { fontSize: 28, fontWeight: '900', color: '#000' },
  qrCenterLogo: { position: 'absolute', width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  qrCenterLogoBorder: { backgroundColor: '#000', padding: 6, borderRadius: 14 },
  qrCenterLogoImg: { width: 32, height: 32 },
  qrSendButton: {
    backgroundColor: '#133A2E',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 120,
  },
  qrSendButtonText: {
    color: '#A6F0C6',
    fontSize: 14,
    fontWeight: '600',
  },
  qrCancelButton: {
    backgroundColor: '#2B2B2B',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCancelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  qrWarningSection: {
    backgroundColor: '#2A1F13',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A2F13',
    padding: 12,
  },
  qrWarningTitle: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  qrWarningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  qrWarningBullet: {
    color: '#FFB74D',
    fontSize: 12,
    marginRight: 8,
    marginTop: 2,
  },
  qrWarningText: {
    color: '#FFB74D',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },

  // Intro modal styles
  introOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  introModal: { width: '100%', maxWidth: 420, backgroundColor: '#0A0A0A', borderRadius: 16, borderWidth: 2, borderColor: '#FF3B30', overflow: 'hidden' },
  introHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#FF3B30' },
  introTitle: { color: '#FFD700', fontWeight: '800', fontSize: 16 },
  introBody: { padding: 16 },
  introNotice: { backgroundColor: '#14110A', borderWidth: 1, borderColor: '#3A2F13', borderRadius: 12, padding: 12, marginBottom: 12 },
  introNoticeTitle: { color: '#FFCE54', fontWeight: '700', lineHeight: 18, marginBottom: 6 },
  introGuideLink: { color: '#7DB3FF', textDecorationLine: 'underline' },
  introList: { marginVertical: 8 },
  introItem: { color: '#E9E9E9', fontSize: 13, lineHeight: 18, marginBottom: 6 },
  introFooterNote: { marginTop: 4, marginBottom: 8 },
  introFooterText: { color: '#9AA0A6', fontSize: 12 },
  introCheckRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#FFD700', marginRight: 8 },
  checkboxChecked: { backgroundColor: '#FFD700' },
  introCheckText: { color: '#FFFFFF' },
  introActions: { flexDirection: 'row', padding: 12, gap: 10 },
  introCancel: { flex: 1, backgroundColor: '#1E1E1E', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3A', alignItems: 'center' },
  introCancelText: { color: '#FFFFFF', fontWeight: '700' },
  introConfirm: { flex: 1, backgroundColor: '#FFD700', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  introConfirmText: { color: '#000000', fontWeight: '800' },
  quickSettingRow: { flexDirection:'row', alignItems:'center', gap: 10, paddingVertical: 8 },

  // 거래 폼 스타일
  transactionForm: {
    backgroundColor: '#0A0A0A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 20,
    marginBottom: 20,
  },
  formTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  formRow: {
    marginBottom: 16,
  },
  formLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  coinSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  coinOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  coinOptionSelected: {
    borderColor: '#FFD700',
    backgroundColor: '#FFD700',
  },
  coinOptionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  coinOptionTextSelected: {
    color: '#000000',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLabel: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
    minWidth: 60,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  amountText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  addressInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addressTextSecondary: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  matchIndicator: {
    backgroundColor: '#133A2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
    padding: 12,
    alignItems: 'center',
  },
  matchText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },

  // 상단 송금/수취 박스
  sendBox: { backgroundColor: '#0A0A0A', borderColor: '#1A1A1A', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  sendTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  sendLabel: { color: '#9AA0A6', marginTop: 4 },
  selectWrap: { position: 'relative', zIndex: 20, overflow: 'visible' },
  selectField: { marginTop: 6, backgroundColor: '#0F0F0F', borderColor: '#D4AF37', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  selectText: { color: '#FFFFFF', fontWeight: '700' },
  selectChevron: { width: 10, height: 10, borderRightWidth: 2, borderBottomWidth: 2, borderColor: '#D4AF37', transform: [{ rotate: '45deg' }] },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A' },
  chipActive: { backgroundColor: 'rgba(212,175,55,0.15)', borderColor: '#D4AF37' },
  chipText: { color: '#9AA0A6', fontWeight: '700' },
  chipTextActive: { color: '#FFD700' },
  pctRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
  pctBtn: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pctBtnActive: { borderColor: '#FFD700', backgroundColor: 'rgba(212,175,55,0.15)' },
  pctText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  pctTextActive: { color: '#FFD700' },
  inputField: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, position: 'relative' },
  inputPlaceholder: { color: '#666' },
  numericInput: { color: '#FFFFFF', paddingVertical: 12, fontSize: 14 },
  numericInputAmount: { color: '#FFD700', paddingVertical: 12, fontSize: 18, fontWeight: '700' },
  suffix: { position: 'absolute', right: 20, top: 8, backgroundColor: '#2A2A2A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  unitText: { color: '#FFFFFF', fontWeight: '700' },
  suffixText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  availableText: { color: '#FFD700', fontSize: 12, marginTop: 6, fontWeight: '700' },
  availableTextRight: { color: '#FFD700', fontSize: 12, marginTop: 6, fontWeight: '700', textAlign: 'right' },
  dropdown: { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 6, backgroundColor: '#0F0F0F', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, zIndex: 30, elevation: 10, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1C1C1C' },
  dropdownText: { color: '#FFFFFF', fontWeight: '700' },
  unitBadge: { minWidth: 38, height: 28, borderRadius: 6, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  unitBadgeText: { color: '#FFFFFF', fontWeight: '800' },
  toggleButton: { backgroundColor:'#2A2A2A', borderWidth:1, borderColor:'#3A3A3A', borderRadius:8, paddingHorizontal:12, paddingVertical:6 },
  toggleButtonActive: { backgroundColor:'#FFD700', borderColor:'#FFD700' },
  toggleButtonText: { color:'#999', fontSize:12, fontWeight:'600' },
  toggleButtonTextActive: { color:'#000', fontWeight:'700' },
  addrField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  addrPlaceholder: { color: '#666' },
  addrBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1F2A20', borderWidth: 1, borderColor: '#294330' },
  addrIconBtn: { width: 36, height: 36, borderRadius: 8, alignItems:'center', justifyContent:'center', borderWidth:1 },
  scanButton: { width: 36, height: 36, borderRadius: 8, alignItems:'center', justifyContent:'center', borderWidth:1, backgroundColor:'#243034', borderColor:'#375A64' },
  addrIconText: { color:'#D5E7EC', fontSize:16, fontWeight:'700' },
  ctaRow: { flexDirection:'row', gap:12, marginTop:14, marginHorizontal:0, width:'100%' },
  ctaShare: { backgroundColor:'#FFD700', borderRadius:12, paddingVertical:12, alignItems:'center', shadowColor:'#000', shadowOpacity:0.3, shadowRadius:6, paddingHorizontal:4 },
  ctaShareText: { color:'#000', fontWeight:'900' },
  ctaCopy: { backgroundColor:'#1E2730', borderWidth:1, borderColor:'#314455', borderRadius:12, paddingVertical:12, alignItems:'center', paddingHorizontal:4 },
  ctaCopyText: { color:'#E3EEF5', fontWeight:'800' },
  primaryCta: { flex: 1, backgroundColor: '#FFD700', borderRadius: 10, alignItems: 'center', paddingVertical: 12 },
  primaryCtaText: { color: '#000000', fontWeight: '800' },
  primaryCtaError: { backgroundColor: '#FF3B30' },
  primaryCtaErrorText: { color: '#000000' },
  secondaryCta: { flex: 1, backgroundColor: '#2B2B2B', borderWidth: 1, borderColor: '#3A3A3A', borderRadius: 10, alignItems: 'center', paddingVertical: 12 },
  secondaryCtaText: { color: '#FFFFFF', fontWeight: '800' },
  scanFullBtn: { width: '100%', backgroundColor: '#2B2B2B', borderWidth: 1, borderColor: '#3A3A3A', borderRadius: 10, alignItems: 'center', paddingVertical: 14 },
  scanFullBtnText: { color: '#FFFFFF', fontWeight: '800' },

  // 주문 테이블 스타일
  orderFilterTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 4,
  },
  orderFilterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  orderFilterTabActive: {
    backgroundColor: '#FFD700',
  },
  orderFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CCCCCC',
  },
  orderFilterTextActive: {
    color: '#000000',
  },
  orderTable: {
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    overflow: 'hidden',
  },
  orderHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  orderHeadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CCCCCC',
    textAlign: 'center',
  },
  orderRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    alignItems: 'center',
  },
  orderCell: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cancelOrderBtn: {
    backgroundColor: '#F23645',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
  },
  cancelOrderBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // 주문 폼 스타일
  orderFormSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  orderTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  orderTypeButtonActive: {
    backgroundColor: '#FFD700',
  },
  orderTypeText: {
    color: '#999',
    fontWeight: '600',
    fontSize: 14,
  },
  orderTypeTextActive: {
    color: '#000',
  },
  orderInputSection: {
    marginBottom: 16,
  },
  orderInputLabel: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  orderInputContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  orderInput: {
    color: '#FFF',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  orderSubmitButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buyOrderButton: {
    backgroundColor: '#00C851',
  },
  sellOrderButton: {
    backgroundColor: '#FF4444',
  },
  orderButtonDisabled: {
    opacity: 0.6,
  },
  orderSubmitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // 주문 영수증 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptModal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#333',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  receiptTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  receiptContent: {
    padding: 20,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  receiptLabel: {
    color: '#999',
    fontSize: 14,
  },
  receiptValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buyText: {
    color: '#00C851',
  },
  sellText: {
    color: '#FF4444',
  },
  filledText: {
    color: '#00C851',
  },
  pendingText: {
    color: '#FFD700',
  },
  cancelledText: {
    color: '#FF6B6B',
  },
  receiptActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  cancelOrderButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    alignItems: 'center',
  },
  cancelOrderButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FFD700',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
});


