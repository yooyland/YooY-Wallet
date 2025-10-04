import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const ENV = process.env.EXPO_PUBLIC_ENV || 'dev';
const FALLBACKS: Record<string, any> = {
  prod: {
    apiKey: 'AIzaSyB-qGVg2R0N1VfrY68cucdnz3_00y2RphI',
    authDomain: 'yooyland-prod.firebaseapp.com',
    projectId: 'yooyland-prod',
    storageBucket: 'yooyland-prod.appspot.com',
    messagingSenderId: '712419325837',
    appId: '1:712419325837:web:5cb8eeebba6a8838922fc4',
    measurementId: 'G-XZVSZSJ6EV',
  },
  dev: {
    apiKey: 'AIzaSyCjsqHT9VUwjfHbkOgE1APt_CeOcTCCHJk',
    authDomain: 'yooyland-dev.firebaseapp.com',
    projectId: 'yooyland-dev',
    storageBucket: 'yooyland-dev.appspot.com',
    messagingSenderId: '100235868327',
    appId: '1:100235868327:web:faf04af748faf8957d8382',
    measurementId: 'G-LQWFJKSESR',
  },
  stg: {
    apiKey: 'AIzaSyDRLsj5b_IYXaPZ44650EzMAqCXiz8vj-U',
    authDomain: 'yooyland-stg.firebaseapp.com',
    projectId: 'yooyland-stg',
    storageBucket: 'yooyland-stg.appspot.com',
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
export const firebaseAuth: Auth = getAuth(app);
export const firestore: Firestore = getFirestore(app);
export const firebaseStorage: FirebaseStorage = getStorage(app);
