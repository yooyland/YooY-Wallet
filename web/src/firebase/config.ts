/**
 * 모바일 앱과 동일 Firebase 프로젝트 (환경 변수로 주입).
 * 로컬: web/.env 로 VITE_* 설정. 프로덕션 빌드 시 CI에서 주입.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const FALLBACKS: Record<string, Record<string, string>> = {
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
};

const envKey = (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'dev').toLowerCase();
const fb = FALLBACKS[envKey] || FALLBACKS.dev;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fb.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fb.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fb.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fb.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fb.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fb.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fb.measurementId,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const firebaseApp: FirebaseApp = app;
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
