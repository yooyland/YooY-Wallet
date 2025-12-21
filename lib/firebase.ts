import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, signInAnonymously, setPersistence, browserSessionPersistence, indexedDBLocalPersistence, getReactNativePersistence } from 'firebase/auth';
import {
    initializeFirestore,
    persistentSingleTabManager,
    type Firestore,
    setLogLevel,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';
// App Check (웹에서 Storage 사전검증 헤더 요구 시 대비)
let initializeAppCheckFn: any = null;
let ReCaptchaV3ProviderCtor: any = null;
let appCheckInstance: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ initializeAppCheck: initializeAppCheckFn, ReCaptchaV3Provider: ReCaptchaV3ProviderCtor } = require('firebase/app-check'));
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
    const enableDebug = String(process.env.EXPO_PUBLIC_APPCHECK_DEBUG || (process.env.EXPO_PUBLIC_ENV || 'dev') === 'dev') === 'true';
    if (enableDebug && typeof window !== 'undefined') {
      const debugToken = process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN || '';
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
}
export const firebaseAuth: Auth = authInstance;

// Firestore: 웹 안정화(롱폴링 + fetch stream 비활성 + 단일탭 캐시)
export const firestore: Firestore = initializeFirestore(app, {
  // 일부 네트워크/프록시 환경에서 WebChannel Write/channel 400을 회피하기 위해
  // 강제 롱폴링을 해제하고 자동 감지를 사용합니다.
  experimentalAutoDetectLongPolling: true,
  // 개발 환경 안정성을 위해 fetch stream은 유지/혹은 런타임이 지원하지 않으면 자동 폴백
  useFetchStreams: false,
  localCache: persistentSingleTabManager(),
  ignoreUndefinedProperties: true,
});
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

  // 2) 익명 로그인 시도 후 최대 8초 대기
  try { await signInAnonymously(firebaseAuth); } catch {}
  const uidAfterSignIn = await waitForUid(8000);
  if (uidAfterSignIn) return uidAfterSignIn;

  // 3) 최후: 한 번 더 시도 후 실패하면 에러로 처리하여 상위 로직이 업로드를 건너뛰게 함
  try { await signInAnonymously(firebaseAuth); } catch {}
  const uidFinal = await waitForUid(2000);
  if (uidFinal) return uidFinal;
  throw new Error('auth-not-ready');
}

// App Check 토큰을 강제로 미리 획득하여 이후 Storage 요청의 프리플라이트가 통과되도록 보장
export async function ensureAppCheckReady(): Promise<void> {
  try {
    if (!appCheckInstance) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getToken } = require('firebase/app-check');
    // 강제 갱신(true)로 즉시 토큰을 확보
    const res = await getToken(appCheckInstance, true);
    // 토큰이 헤더에 반영될 때까지 아주 짧은 딜레이 (preflight 타이밍 이슈 예방)
    if (res && res.token) {
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch {
    // no-op
  }
}

// 개발 편의를 위한 전역 디버그 핸들 (웹에서만)
try {
  if (typeof window !== 'undefined' && (process.env.EXPO_PUBLIC_ENV || 'dev') !== 'prod') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__fb = { app, auth: authInstance };
  }
} catch {}
