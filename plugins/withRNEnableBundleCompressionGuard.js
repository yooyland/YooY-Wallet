// Adds guards into android/app/build.gradle during prebuild to avoid crashes
// when a tool attempts to set ReactExtension.enableBundleCompression on RN 0.75.
const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

function injectGuards(gradle) {
  if (gradle.includes('ENABLE_BUNDLE_COMPRESSION_GUARD')) {
    return gradle;
  }
  const guard = `
// ===== ENABLE_BUNDLE_COMPRESSION_GUARD (auto-injected) START =====
try {
    def _reactEnableBundleCompressionKeys = [
        'react.enableBundleCompression',
        'org.gradle.project.react.enableBundleCompression'
    ]
    if (gradle != null && gradle.startParameter != null && gradle.startParameter.projectProperties != null) {
        _reactEnableBundleCompressionKeys.each { k ->
            if (gradle.startParameter.projectProperties.containsKey(k)) {
                gradle.startParameter.projectProperties.remove(k)
                println("[app] Removed problematic project property: ${k}")
            }
        }
    }
    _reactEnableBundleCompressionKeys.each { k ->
        if (System.properties.containsKey(k)) {
            System.properties.remove(k)
            println("[app] Removed problematic system property: ${k}")
        }
    }
} catch (Throwable __) { }

try {
    def _reactExtClazz = Class.forName("com.facebook.react.ReactExtension")
    if (_reactExtClazz != null) {
        if (!_reactExtClazz.metaClass.respondsTo(_reactExtClazz, "setEnableBundleCompression", Object)) {
            _reactExtClazz.metaClass.setEnableBundleCompression { Object v ->
                println("[app] ReactExtension(Class): ignoring unsupported enableBundleCompression=${v}")
            }
        }
        if (!_reactExtClazz.metaClass.respondsTo(_reactExtClazz, "getEnableBundleCompression")) {
            _reactExtClazz.metaClass.getEnableBundleCompression { -> false }
        }
    }
} catch (Throwable __) { }
// ===== ENABLE_BUNDLE_COMPRESSION_GUARD (auto-injected) END =====
`;
  // Heuristic: inject right after Kotlin Android plugin line if present, else at top.
  const kotlinPluginLine = 'apply plugin: "org.jetbrains.kotlin.android"';
  if (gradle.includes(kotlinPluginLine)) {
    return gradle.replace(kotlinPluginLine, `${kotlinPluginLine}\n\n${guard}`);
  }
  return `${guard}\n${gradle}`;
}

function stripUnknownPropertyAssignments(gradle) {
  // Remove any line that contains enableBundleCompression in the gradle file
  // This covers forms like:
  //   enableBundleCompression = false
  //   enableBundleCompression false
  //   project.ext.react = [ enableBundleCompression: false ]
  return gradle
    // remove any standalone lines mentioning enableBundleCompression
    .replace(/^[^\n]*enableBundleCompression[^\n]*\n/gm, '')
    // also clean up potential trailing empty lines created
    .replace(/\n{3,}/g, '\n\n');
}

const withRNEnableBundleCompressionGuard = (config) => {
  // 1) Strip gradle.properties entries so RN plugin doesn't try to map them
  config = withGradleProperties(config, (config) => {
    try {
      const filtered = (config.modResults || []).filter(
        (item) =>
          item.name !== 'react.enableBundleCompression' &&
          item.name !== 'org.gradle.project.react.enableBundleCompression'
      );
      config.modResults = filtered;
    } catch (e) {
      // ignore
    }
    return config;
  });

  // 2) Add guards and strip any inline assignments in app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    try {
      let contents = config.modResults.contents || '';
      contents = injectGuards(contents);
      contents = stripUnknownPropertyAssignments(contents);
      config.modResults.contents = contents;
    } catch (e) {
      // Leave contents unchanged on error; prebuild should still succeed.
    }
    return config;
  });

  return config;
};

module.exports = withRNEnableBundleCompressionGuard;


