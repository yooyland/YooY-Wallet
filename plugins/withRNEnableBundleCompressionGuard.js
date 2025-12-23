// Adds guards into android/app/build.gradle during prebuild to avoid crashes
// when a tool attempts to set ReactExtension.enableBundleCompression on RN 0.75.
const { withAppBuildGradle } = require('@expo/config-plugins');

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
  // Remove or comment out any enableBundleCompression assignments if present.
  return gradle.replace(/^[ \t]*enableBundleCompression\s*=.*$/gm, '/* enableBundleCompression removed by guard for RN 0.75 */');
}

const withRNEnableBundleCompressionGuard = (config) => {
  return withAppBuildGradle(config, (config) => {
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
};

module.exports = withRNEnableBundleCompressionGuard;


