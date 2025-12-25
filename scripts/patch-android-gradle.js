const fs = require('fs');
const path = require('path');

function tryPatch(file, patcher) {
  try {
    if (!fs.existsSync(file)) return;
    const before = fs.readFileSync(file, 'utf8');
    const after = patcher(before);
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      console.log(`[patch-android-gradle] Patched: ${path.relative(process.cwd(), file)}`);
    } else {
      console.log(`[patch-android-gradle] No changes: ${path.relative(process.cwd(), file)}`);
    }
  } catch (e) {
    console.log(`[patch-android-gradle] Skip ${file}: ${e.message}`);
  }
}

function stripEnableBundleCompression(content) {
  return content
    // remove any line mentioning enableBundleCompression
    .replace(/^[^\n]*enableBundleCompression[^\n]*\n/gm, '')
    // clean possible project properties line variants
    .replace(/^[^\n]*react\.enableBundleCompression[^\n]*\n/gm, '')
    // compress multiple blank lines
    .replace(/\n{3,}/g, '\n\n');
}

function injectGuardsAtTop(content) {
  if (content.includes('ENABLE_BUNDLE_COMPRESSION_GUARD')) return content;
  const guard = `
// ===== ENABLE_BUNDLE_COMPRESSION_GUARD (post-install) START =====
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
// ===== ENABLE_BUNDLE_COMPRESSION_GUARD (post-install) END =====
`;
  return guard + '\n' + content;
}

function main() {
  const appGradle = path.join(process.cwd(), 'android', 'app', 'build.gradle');
  const gradleProps = path.join(process.cwd(), 'android', 'gradle.properties');

  tryPatch(gradleProps, (c) =>
    c
      .split('\n')
      .filter(
        (line) =>
          !/^\s*react\.enableBundleCompression\s*=/.test(line) &&
          !/^\s*org\.gradle\.project\.react\.enableBundleCompression\s*=/.test(line)
      )
      .join('\n')
  );

  tryPatch(appGradle, (c) => injectGuardsAtTop(stripEnableBundleCompression(c)));

  // Patch RNGH source for getSurfaceId() arg nullability/signature changes across RN versions
  const rnghKt = path.join(
    process.cwd(),
    'node_modules',
    'react-native-gesture-handler',
    'android',
    'src',
    'main',
    'java',
    'com',
    'swmans ion'.replace(' ', ''), // avoid lark patch parsing issues
    'gesturehandler',
    'react',
    'RNGestureHandlerTouchEvent.kt'
  );
  try {
    // If upstream path changed, also try the canonical path without the space removal
    let target = rnghKt.replace('swmans ion'.replace(' ', ''), 'swmans ion'.replace(' ', ''));
    if (!fs.existsSync(target)) {
      target = path.join(
        process.cwd(),
        'node_modules',
        'react-native-gesture-handler',
        'android',
        'src',
        'main',
        'java',
        'com',
        'swmans ion'.replace(' ', ''),
        'gesturehandler',
        'react',
        'RNGestureHandlerTouchEvent.kt'
      );
    }
    tryPatch(target, (code) => {
      let patched = code;
      // Force match common patterns and cast to expected types for RN 0.75+/0.76+
      // reactContext -> Context
      patched = patched.replace(/UIManagerHelper\.getSurfaceId\(\s*(reactContext)\s*\)/g, 'UIManagerHelper.getSurfaceId(($1) as android.content.Context)');
      // context -> Context
      patched = patched.replace(/UIManagerHelper\.getSurfaceId\(\s*(?:this\.)?context\s*\)/g, 'UIManagerHelper.getSurfaceId((context as android.content.Context))');
      // view -> android.view.View
      patched = patched.replace(/UIManagerHelper\.getSurfaceId\(\s*view\s*\)/g, 'UIManagerHelper.getSurfaceId((view as android.view.View))');
      return patched;
    });
  } catch (e) {
    console.log('[patch-android-gradle] RNGH patch skipped:', e.message);
  }

  // Patch expo-modules-core gradle plugin to use Kotlin 2.0.21 (SDK55 expects 2.0.x toolchain)
  const expoGradlePlugin = path.join(
    process.cwd(),
    'node_modules',
    'expo',
    'node_modules',
    'expo-modules-core',
    'expo-module-gradle-plugin',
    'build.gradle.kts'
  );
  tryPatch(expoGradlePlugin, (code) => {
    let out = code;
    // Replace hardcoded kotlin("jvm") version if present (e.g., "1.9.24") with 2.0.21
    out = out.replace(/kotlin\\("jvm"\\) version "\\d+\\.\\d+\\.\\d+"/, 'kotlin("jvm") version "2.0.21"');
    return out;
  });
}

main();


