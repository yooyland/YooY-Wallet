const disabled = String(process.env.EXPO_PUBLIC_BARCODE_ENABLED || '') === 'false';

module.exports = disabled
  ? {
      dependencies: {
        'expo-barcode-scanner': {
          platforms: {
            android: null, // Android 오토링킹 비활성화 (환경변수 false일 때만)
          },
        },
      },
    }
  : {};


