import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, signInAnonymously, setPersistence, browserSessionPersistence, indexedDBLocalPersistence, getReactNativePersistence } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
  setLogLevel,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';
// App Check (웹에서 Storage 사전검증 헤더 요구 시 대비)
let initializeAppCheckFn: any = null;
let ReCaptchaV3ProviderCtor: any = null;
let CustomProviderCtor: any = null;
let getAppCheckTokenFn: any = null;
let appCheckInstance: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({
    initializeAppCheck: initializeAppCheckFn,
    ReCaptchaV3Provider: ReCaptchaV3ProviderCtor,
    CustomProvider: CustomProviderCtor,
    getToken: getAppCheckTokenFn,
  } = require('firebase/app-check'));
} catch {}
// RN 전용 AsyncStorage는 웹 번들에서 제외 (동적 로딩)
let RNAsyncStorage: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNAsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // no-op (웹)
}

const ENV = process.env.EXPO_PUBLIC_ENV || 'dev';
const APP_ENV = String(process.env.EXPO_PUBLIC_ENVIRONMENT || ENV || 'dev').toLowerCase();
const IS_PROD_ENV = APP_ENV === 'prod' || APP_ENV === 'production';
const ENABLE_APPCHECK_DEBUG = String(process.env.EXPO_PUBLIC_APPCHECK_DEBUG || (!IS_PROD_ENV)).toLowerCase() === 'true';
const APPCHECK_DEBUG_TOKEN = String(process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN || '').trim();
const FALLBACKS: Record<string, any> = {
  prod: {
    apiKey: 'AIzaSyB-qGVg2R0N1VfrY68cucdnz3_00y2RphI',
    authDomain: 'yooyland-prod.firebaseapp.com',
    projectId: 'yooyland-prod',
    storageBucket: 'yooyland-prod.firebasestorage.app',
    messagingSenderId: '712419325837',
    appId: '1:712419325837:web:5cb8eeebba6a8838922fc4',
    measurementId: 'G-XZVSZSJ6EV',
  },
  dev: {
    apiKey: 'AIzaSyCjsqHT9VUwjfHbkOgE1APt_CeOcTCCHJk',
    authDomain: 'yooyland-dev.firebaseapp.com',
    projectId: 'yooyland-dev',
    storageBucket: 'yooyland-dev.firebasestorage.app',
    messagingSenderId: '100235868327',
    appId: '1:100235868327:web:faf04af748faf8957d8382',
    measurementId: 'G-LQWFJKSESR',
  },
  stg: {
    apiKey: 'AIzaSyDRLsj5b_IYXaPZ44650EzMAqCXiz8vj-U',
    authDomain: 'yooyland-stg.firebaseapp.com',
    projectId: 'yooyland-stg',
    storageBucket: 'yooyland-stg.firebasestorage.app',
    messagingSenderId: '228684575961',
    appId: '1:228684575961:web:76c2f00f0b9ed670fefac8',
    measurementId: 'G-V2XJ31EKLX',
  },
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || FALLBACKS[ENV]?.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || FALLBACKS[ENV]?.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || FALLBACKS[ENV]?.projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || FALLBACKS[ENV]?.storageBucket,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || FALLBACKS[ENV]?.messagingSenderId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || FALLBACKS[ENV]?.appId,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || FALLBACKS[ENV]?.measurementId,
};

// 일부 모듈(웹 프록시 등)에서 firebaseApp import 없이도 projectId를 알 수 있도록 전역 힌트를 제공
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__YOY_FB_PROJECT_ID__ = String(firebaseConfig.projectId || '').trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__YOY_FB_ENV__ = String(ENV || '').trim();
} catch {}

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const firebaseApp: FirebaseApp = app;
// Auth: web/native 분리, 단일톤 보장
let authInstance: Auth;
if (Platform.OS === 'web') {
  // App Check: 개발 환경에서는 디버그 토큰로 사전검증 우회, 운영은 site key 사용
  try {
    const enableDebug = ENABLE_APPCHECK_DEBUG;
    if (enableDebug && typeof window !== 'undefined') {
      const debugToken = APPCHECK_DEBUG_TOKEN;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken ? debugToken : true;
      try {
        // Surface explicit context to help register the correct token/app
        // Note: The SDK will print the actual debug token. Register that exact value.
        // eslint-disable-next-line no-console
        console.info('[AppCheck] Debug mode ON. Waiting for SDK to print the debug token...');
        // eslint-disable-next-line no-console
        console.info('[AppCheck] Project:', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, 'AppId:', process.env.EXPO_PUBLIC_FIREBASE_APP_ID);
      } catch {}
    }
    const siteKey = process.env.EXPO_PUBLIC_APPCHECK_SITE_KEY || '';
    if (initializeAppCheckFn) {
      if (siteKey) {
        appCheckInstance = initializeAppCheckFn(app, {
          provider: new ReCaptchaV3ProviderCtor(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } else if (enableDebug) {
        appCheckInstance = initializeAppCheckFn(app, {
          provider: new ReCaptchaV3ProviderCtor('test'),
          isTokenAutoRefreshEnabled: true,
        });
      }
    }
  } catch {}
  // Expo 웹은 RN 빌드를 사용하므로 RN 방식 퍼시스턴스를 명시적으로 설정해 경고를 제거
  try {
    // @ts-expect-error store singleton on app to avoid re-init
    if (!(app as any)._auth) {
      // 웹에서는 RN 전용 퍼시스턴스를 사용하지 않는다 (RN 번들 로드로 인한 오류 예방)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any)._auth = getAuth(app);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authInstance = (app as any)._auth as Auth;
  } catch {
    authInstance = getAuth(app);
  }
  // 웹: localStorage 용량 초과(QuotaExceededError) 예방을 위해 기본 퍼시스턴스를 IndexedDB로 전환
  try {
    setPersistence(authInstance, indexedDBLocalPersistence).catch(() => setPersistence(authInstance, browserSessionPersistence).catch(()=>{}));
  } catch {}
  try {
    // 기본은 OFF. 명시적으로 EXPO_PUBLIC_ENABLE_AUTO_ANON=true 일 때만 사용
    const ENABLE_AUTO_ANON = String(process.env.EXPO_PUBLIC_ENABLE_AUTO_ANON || 'false') === 'true';
    if (ENABLE_AUTO_ANON && !authInstance.currentUser) {
      signInAnonymously(authInstance).catch(() => {});
    }
  } catch {}
} else {
  try {
    // @ts-expect-error store singleton on app to avoid re-init
    if (!(app as any)._auth) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any)._auth = initializeAuth(app, (getReactNativePersistence && RNAsyncStorage) ? {
        persistence: getReactNativePersistence(RNAsyncStorage),
      } : {});
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authInstance = (app as any)._auth as Auth;
  } catch {
    authInstance = getAuth(app);
  }

  // Native App Check: 개발(debug token) / 배포(play integrity via native provider) 분기
  // - @react-native-firebase/app-check가 있으면 그 토큰을 CustomProvider로 Firebase JS SDK에 연결
  // - 모듈이 없으면 로그만 남기고 기존 동작 유지
  try {
    if (initializeAppCheckFn && CustomProviderCtor) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rnFbAppCheck = (() => {
        try {
          return require('@react-native-firebase/app-check').default;
        } catch {
          return null;
        }
      })();
      if (rnFbAppCheck) {
        if (ENABLE_APPCHECK_DEBUG) {
          try {
            // RN Firebase App Check: debug provider/token 활성화 (가능한 API만 호출)
            if (typeof rnFbAppCheck().activate === 'function') {
              // debug token 문자열이 있으면 사용, 없으면 자동 생성 모드
              void Promise.resolve(rnFbAppCheck().activate(APPCHECK_DEBUG_TOKEN || true));
            }
          } catch {}
        } else {
          try {
            if (typeof rnFbAppCheck().activate === 'function') {
              // 배포: Play Integrity provider 사용(기기/빌드 설정 필요)
              void Promise.resolve(rnFbAppCheck().activate());
            }
          } catch {}
        }
        appCheckInstance = initializeAppCheckFn(app, {
          provider: new CustomProviderCtor({
            getToken: async () => {
              const tokenResult = await rnFbAppCheck().getToken(true);
              const token = String(tokenResult?.token || '').trim();
              if (!token) throw new Error('native_appcheck_token_empty');
              return { token };
            },
          }),
          isTokenAutoRefreshEnabled: true,
        });
        try {
          // eslint-disable-next-line no-console
          console.info('[AppCheck] Native initialized', {
            env: APP_ENV,
            debug: ENABLE_APPCHECK_DEBUG,
            hasDebugToken: !!APPCHECK_DEBUG_TOKEN,
          });
        } catch {}
      } else {
        try {
          // eslint-disable-next-line no-console
          console.warn('[AppCheck] Native provider module missing: @react-native-firebase/app-check');
        } catch {}
      }
    }
  } catch (e: any) {
    try {
      // eslint-disable-next-line no-console
      console.error('[AppCheck] Native init failed', String(e?.message || e || 'native_appcheck_init_failed'));
    } catch {}
  }
}
export const firebaseAuth: Auth = authInstance;

// Firestore
// - 웹: memoryLocalCache — Firestore IndexedDB 캐시를 사용하지 않음. 과거 `localCache: persistentSingleTabManager()`처럼
//   잘못된 설정으로 쌓인/손상된 IndexedDB, 또는 멀티탭·복구 타이밍과 겹치면 런타임 초기화(TDZ/ReferenceError)가 날 수 있어
//   단일 탭·로그인 안정성을 최우선으로 한다(오프라인 캐시는 희생).
// - 네이티브: persistentLocalCache + single-tab 매니저(한 프로세스).
export const firestore: Firestore = initializeFirestore(
  app,
  Platform.OS === 'web'
    ? {
        experimentalAutoDetectLongPolling: true,
        useFetchStreams: false,
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true,
      }
    : {
        experimentalAutoDetectLongPolling: true,
        useFetchStreams: false,
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager(),
        }),
        ignoreUndefinedProperties: true,
      }
);
// Firebase SDK 로그 소음 축소 (권한 오류로 인한 붉은 LogBox 억제)
try { setLogLevel('error'); } catch {}
// Storage: 환경값을 그대로 존중(버킷 ID 그대로 사용). 전체 URL만 주어지면 호스트만 추출
const rawBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || FALLBACKS[ENV]?.storageBucket;
let normalizedBucket: string | undefined = rawBucket;
try {
  if (normalizedBucket) {
    // 만약 전체 URL을 넣은 경우 (https://.../ or gs://.../) 에서 호스트/버킷만 추출
    if (/^https?:\/\//i.test(normalizedBucket)) {
      const u = new URL(normalizedBucket);
      normalizedBucket = u.host || normalizedBucket;
    }
    normalizedBucket = normalizedBucket.replace(/^gs:\/\//i, '');
    // 프로젝트에 따라 기본 버킷이 *.firebasestorage.app 인 경우가 있으므로 도메인 교정은 하지 않음
  }
} catch {}
const bucketUrl = normalizedBucket ? `gs://${normalizedBucket}` : undefined;
try { console.info('[FirebaseStorage] bucket', normalizedBucket || '(default)'); } catch {}
export const firebaseStorage: FirebaseStorage = bucketUrl ? getStorage(app, bucketUrl) : getStorage(app);

// 업로드 전 인증 보장 및 안전 UID 반환
export async function ensureAuthedUid(): Promise<string> {
  // 목적: Storage 보안 규칙과 일치하는 실제 UID를 반드시 획득
  // 절대 'anonymous' 같은 더미 문자열을 반환하지 않음
  const waitForUid = async (maxMs: number) => {
    const start = Date.now();
    while (!firebaseAuth.currentUser?.uid && Date.now() - start < maxMs) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    return firebaseAuth.currentUser?.uid || '';
  };

  // 1) 이미 로그인되어 있으면 즉시 반환
  if (firebaseAuth.currentUser?.uid) return firebaseAuth.currentUser.uid;

  // 2) 플랫폼에 따라 처리: 웹에서만 익명 허용, 네이티브는 사용자 로그인을 요구
  if (Platform.OS === 'web') {
    try { await signInAnonymously(firebaseAuth); } catch {}
    const uidAfterSignIn = await waitForUid(8000);
    if (uidAfterSignIn) return uidAfterSignIn;
    try { await signInAnonymously(firebaseAuth); } catch {}
    const uidFinalWeb = await waitForUid(2000);
    if (uidFinalWeb) return uidFinalWeb;
    throw new Error('auth-not-ready');
  }

  // 네이티브: 익명 로그인 금지 → 잠시 대기 후 실패 처리
  const uidAfterWait = await waitForUid(1500);
  if (uidAfterWait) return uidAfterWait;
  throw new Error('auth-required');
}

// App Check 토큰을 강제로 미리 획득하여 이후 Storage 요청의 프리플라이트가 통과되도록 보장
export async function ensureAppCheckReady(): Promise<void> {
  try {
    if (!appCheckInstance) return;
    const getToken = getAppCheckTokenFn || (() => Promise.resolve(null));
    // 강제 갱신(true)로 즉시 토큰을 확보
    const res = await getToken(appCheckInstance, true);
    // 토큰이 헤더에 반영될 때까지 아주 짧은 딜레이 (preflight 타이밍 이슈 예방)
    if (res && res.token) {
      try {
        // eslint-disable-next-line no-console
        console.info('[AppCheck] token ready', {
          platform: Platform.OS,
          env: APP_ENV,
          tokenPrefix: String(res.token).slice(0, 12),
        });
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch (e: any) {
    try {
      // eslint-disable-next-line no-console
      console.error('[AppCheck] token fetch failed', {
        platform: Platform.OS,
        env: APP_ENV,
        error: String(e?.message || e || 'appcheck_token_failed'),
      });
    } catch {}
    throw e;
  }
}

// 개발 편의를 위한 전역 디버그 핸들 (웹에서만)
try {
  if (typeof window !== 'undefined' && (process.env.EXPO_PUBLIC_ENV || 'dev') !== 'prod') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__fb = { app, auth: authInstance };
  }
} catch {}
