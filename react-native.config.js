// Keep a single export. Enable Reanimated & Worklets native on Android.
module.exports = {
  dependencies: {
    '@react-native-ml-kit/barcode-scanning': {
      // Disable native autolinking for this module (build issue on Android)
      platforms: { android: null, ios: null },
    },
    // Keep Reanimated / Worklets native enabled (no override here)
  },
};
