/**
 * Google Play (2024+): READ_MEDIA_IMAGES / READ_MEDIA_VIDEO are disallowed unless the app
 * needs persistent gallery access. Google Play Console evaluates the final manifest's
 * requested permissions and does NOT respect tools:node="remove" declarations.
 *
 * Therefore we must physically remove the <uses-permission> entries from the manifest.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const TO_REMOVE = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  // Legacy broad access (avoid if possible; use system picker / scoped access)
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

module.exports = function withStripBroadMediaReadPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const list = Array.isArray(manifest['uses-permission']) ? manifest['uses-permission'] : [manifest['uses-permission']];
    manifest['uses-permission'] = list.filter((p) => {
      const n = p?.$?.['android:name'];
      return !TO_REMOVE.includes(String(n || ''));
    });
    return config;
  });
};
