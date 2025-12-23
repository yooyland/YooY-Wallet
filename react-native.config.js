// 단일 export만 사용해야 RN 오토링킹이 올바르게 적용됩니다.
// - Reanimated 네이티브 모듈 비활성화 (빌드 이슈 우회)
// - (선택) EXPO_PUBLIC_BARCODE_ENABLED=false 일 때만 바코드 스캐너 오토링킹 비활성화

const config = {
  dependencies: {
    'react-native-reanimated': {
      platforms: { android: null, ios: null },
    },
    // 항상 안드로이드 오토링킹 비활성화 (JS 스캐너 사용)
    'expo-barcode-scanner': {
      platforms: { android: null },
    },
    'expo-camera': {
      platforms: { android: null },
    },
  },
};

module.exports = config;
