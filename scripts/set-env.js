#!/usr/bin/env node

/**
 * Environment setup script for YooY Land App
 * Usage: node scripts/set-env.js [development|staging|production]
 */

const fs = require('fs');
const path = require('path');

const environments = {
  development: {
    EXPO_PUBLIC_ENV: 'dev',
    EXPO_PUBLIC_ENVIRONMENT: 'development',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'yooyland-dev',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'yooyland-dev.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'yooyland-dev.firebasestorage.app',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyCjsqHT9VUwjfHbkOgE1APt_CeOcTCCHJk',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '100235868327',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:100235868327:web:faf04af748faf8957d8382',
    EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-LQWFJKSESR',
    EXPO_PUBLIC_APPCHECK_DEBUG: 'true',
    EXPO_PUBLIC_APPCHECK_SITE_KEY: '',
    EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN: '4214f7e3-15a3-4249-a2c7-98c78dc9403b',
  },
  staging: {
    EXPO_PUBLIC_ENV: 'stg',
    EXPO_PUBLIC_ENVIRONMENT: 'staging',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'yooyland-stg',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'yooyland-stg.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'yooyland-stg.appspot.com',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyDRLsj5b_IYXaPZ44650EzMAqCXiz8vj-U',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '228684575961',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:228684575961:web:76c2f00f0b9ed670fefac8',
    EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-V2XJ31EKLX',
    EXPO_PUBLIC_APPCHECK_DEBUG: 'false',
    EXPO_PUBLIC_APPCHECK_SITE_KEY: '',
  },
  production: {
    EXPO_PUBLIC_ENV: 'prod',
    EXPO_PUBLIC_ENVIRONMENT: 'production',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'yooyland-prod',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'yooyland-prod.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'yooyland-prod.appspot.com',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyB-qGVg2R0N1VfrY68cucdnz3_00y2RphI',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '712419325837',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:712419325837:web:5cb8eeebba6a8838922fc4',
    EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-XZVSZSJ6EV',
    EXPO_PUBLIC_APPCHECK_DEBUG: 'false',
    EXPO_PUBLIC_APPCHECK_SITE_KEY: '',
  },
};

const targetEnv = process.argv[2] || 'development';

if (!environments[targetEnv]) {
  console.error(`❌ Invalid environment: ${targetEnv}`);
  console.log('Available environments: development, staging, production');
  process.exit(1);
}

const envConfig = environments[targetEnv];
const envContent = Object.entries(envConfig)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

const envPath = path.join(process.cwd(), '.env');
fs.writeFileSync(envPath, envContent);

console.log(`✅ Environment set to: ${targetEnv}`);
console.log(`📁 .env file updated with ${targetEnv} configuration`);
console.log(`🔥 Firebase Project: ${envConfig.EXPO_PUBLIC_FIREBASE_PROJECT_ID}`);





