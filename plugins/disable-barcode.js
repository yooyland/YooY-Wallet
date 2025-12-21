// Config plugin to force-remove expo-barcode-scanner from Android native build
// Applies only when included in app.config.js plugins array.
const { withSettingsGradle, withAppBuildGradle } = require('@expo/config-plugins');

function stripLine(content) {
  try {
    return content.replace(/.*expo-barcode-scanner.*\r?\n/g, '');
  } catch {
    return content;
  }
}

module.exports = function withDisableBarcode(config) {
  config = withSettingsGradle(config, (cfg) => {
    const mod = cfg.modResults;
    if (mod && typeof mod.contents === 'string') {
      mod.contents = stripLine(mod.contents);
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    const mod = cfg.modResults;
    if (mod && typeof mod.contents === 'string') {
      mod.contents = stripLine(mod.contents);
    }
    return cfg;
  });

  return config;
};


