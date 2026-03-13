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
  scheme: 'yooy',
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
    // 카메라 플러그인 명시(매니페스트/권한 패치 보장)
    ensure('expo-camera');
    // 알림 플러그인 명시(POST_NOTIFICATIONS 권한 및 채널 설정)
    ensure('expo-notifications');
    // Remove any accidental references to expo-barcode-scanner plugin
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const name = typeof p === 'string' ? p : (Array.isArray(p) ? p[0] : undefined);
      if (name === 'expo-barcode-scanner') {
        list.splice(i, 1);
      }
    }
    // 보안 저장소
    ensure('expo-secure-store');
    // Proguard 설정 반영
    const hasBuildProps = list.some((p) => (Array.isArray(p) && p[0] === 'expo-build-properties') || p === 'expo-build-properties');
    if (!hasBuildProps) {
      list.push(['expo-build-properties', { android: { enableProguardInReleaseBuilds: true, proguardRules: 'proguard-rules.pro' } }]);
    }
    // ensure our local guard plugin is present and LAST so it can patch after other plugins
    const guardPath = './plugins/withRNEnableBundleCompressionGuard';
    // remove any existing occurrence
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const name = typeof p === 'string' ? p : (Array.isArray(p) ? p[0] : undefined);
      if (name === guardPath) {
        list.splice(i, 1);
      }
    }
    // push at end
    list.push(guardPath);
    return list;
  })(),
  extra: {
    ...(config.extra || {}),
    // 빌드 적용 확인용: 새 AAB 설치 후 설정 > 동기화 디버그 등에서 이 값이 보이면 최신 번들 포함됨
    BUILD_FINGERPRINT: '2025-03-10-balance-ssot',
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
