/**
 * App dynamic config to load env vars into expo extra
 */
const fs = require('fs');
const path = require('path');

try {
  const candidates = [
    path.resolve(__dirname, 'env/.env.dev'),
    path.resolve(__dirname, 'env/.env'),
    path.resolve(__dirname, '.env.dev'),
    path.resolve(__dirname, '.env'),
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (hit) {
    require('dotenv').config({ path: hit, override: true });
  } else {
    require('dotenv').config();
  }
} catch {}

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...(config.android || {}),
    // Proguard 등 네이티브 빌드 설정은 expo-build-properties 플러그인에서 처리
  },
  // 상태바/스플래시 배경을 블랙으로 통일 (경고 제거 + 가독성)
  androidStatusBar: {
    ...(config.androidStatusBar || {}),
    backgroundColor: '#000000',
    barStyle: 'light-content',
  },
  splash: {
    ...(config.splash || {}),
    backgroundColor: '#000000',
  },
  // 플러그인: 필수만 단순 포함(빌드 안정성 우선)
  plugins: (() => {
    const list = Array.isArray(config.plugins) ? [...config.plugins] : [];
    const ensure = (name) => {
      const ok = list.some((p) => (typeof p === 'string' ? p === name : Array.isArray(p) && p[0] === name));
      if (!ok) list.push(name);
    };
    // 보안 저장소
    ensure('expo-secure-store');
    // Proguard 설정 반영
    const hasBuildProps = list.some((p) => (Array.isArray(p) && p[0] === 'expo-build-properties') || p === 'expo-build-properties');
    if (!hasBuildProps) {
      list.push(['expo-build-properties', { android: { enableProguardInReleaseBuilds: true, proguardRules: 'proguard-rules.pro' } }]);
    }
    // 카메라 네이티브 모듈 포함(Expo SDK 54 호환)
    ensure('expo-camera');
    return list;
  })(),
  extra: {
    ...(config.extra || {}),
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    // Wallet/chain explicit defaults (env overrides if provided)
    EXPO_PUBLIC_CHAIN: process.env.EXPO_PUBLIC_CHAIN ?? 'mainnet',
    // Use public RPCs by default to avoid API key requirement
    EXPO_PUBLIC_RPC_SEPOLIA: process.env.EXPO_PUBLIC_RPC_SEPOLIA ?? 'https://ethereum-sepolia.publicnode.com',
    EXPO_PUBLIC_RPC_MAINNET: process.env.EXPO_PUBLIC_RPC_MAINNET ?? 'https://ethereum.publicnode.com',
    EXPO_PUBLIC_YOY_ERC20_ADDRESS: process.env.EXPO_PUBLIC_YOY_ERC20_ADDRESS ?? '0xf999DA2B5132eA62A158dA8A82f2265A1b1d9701',
  },
});
