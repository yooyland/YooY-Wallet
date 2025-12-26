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
  // Log resolved versions to help diagnose nested dependency resolution on EAS
  try {
    const rootCore = path.join(process.cwd(), 'node_modules', 'expo-modules-core', 'package.json');
    const nestedCore = path.join(process.cwd(), 'node_modules', 'expo', 'node_modules', 'expo-modules-core', 'package.json');
    if (fs.existsSync(rootCore)) {
      const v = JSON.parse(fs.readFileSync(rootCore, 'utf8')).version;
      console.log(`[patch-android-gradle] expo-modules-core (root) version: ${v}`);
    }
    if (fs.existsSync(nestedCore)) {
      const v = JSON.parse(fs.readFileSync(nestedCore, 'utf8')).version;
      console.log(`[patch-android-gradle] expo-modules-core (expo/node_modules) version: ${v}`);
    }
  } catch (e) {
    console.log('[patch-android-gradle] version log skipped:', e.message);
  }

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

  // Patch expo-modules-core gradle plugin to use Kotlin 1.9.24 (keeps metadata <= 2.0.0, readable by 1.9.x compilers)
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
    // Replace hardcoded kotlin("jvm") version with 1.9.24
    out = out.replace(/kotlin\\("jvm"\\)\\s*?version\\s*?"[\\d.]+"/, 'kotlin("jvm") version "1.9.24"');
    return out;
  });

  // Also patch settings.gradle.kts and version catalogs in expo-modules-core plugin, if present
  const expoGradleSettings = path.join(
    process.cwd(),
    'node_modules',
    'expo',
    'node_modules',
    'expo-modules-core',
    'expo-module-gradle-plugin',
    'settings.gradle.kts'
  );
  tryPatch(expoGradleSettings, (code) => {
    let out = code;
    // Force kotlin plugins to 1.9.24 via pluginManagement resolutionStrategy if plugins DSL not explicit
    if (!/pluginManagement/.test(out)) return out;
    out = out.replace(/(id\\("org\\.jetbrains\\.kotlin\\.jvm"\\)\\s*version\\s*")([\\d.]+)"/g, '$11.9.24"');
    out = out.replace(/(id\\("org\\.jetbrains\\.kotlin\\.android"\\)\\s*version\\s*")([\\d.]+)"/g, '$11.9.24"');
    out = out.replace(/kotlin\\("jvm"\\)\\s*version\\s*"[\\d.]+"/g, 'kotlin("jvm") version "1.9.24"');
    return out;
  });
  const expoGradleVersionsToml = path.join(
    process.cwd(),
    'node_modules',
    'expo',
    'node_modules',
    'expo-modules-core',
    'expo-module-gradle-plugin',
    'gradle',
    'libs.versions.toml'
  );
  tryPatch(expoGradleVersionsToml, (code) => {
    let out = code;
    out = out.replace(/(^\\s*kotlin\\s*=\\s*")([\\d.]+)("\\s*$)/m, '$11.9.24$3');
    out = out.replace(/(^\\s*kotlinSerialization\\s*=\\s*")([\\d.]+)("\\s*$)/m, '$11.9.24$3');
    return out;
  });

  // Patch expo-autolinking gradle plugin (composite build) to pin kotlin plugin version to 1.9.24
  const expoAutolinkPlugin = path.join(
    process.cwd(),
    'node_modules',
    'expo-modules-autolinking',
    'android',
    'expo-gradle-plugin',
    'build.gradle.kts'
  );
  tryPatch(expoAutolinkPlugin, (code) => {
    let out = code;
    // Ensure kotlin("jvm") plugin uses 1.9.24 (add or replace version clause)
    // Case 1: already has a version → normalize to 1.9.24
    out = out.replace(/kotlin\\("jvm"\\)\\s*version\\s*"[\\d.]+"(\\s*\\w*\\s*false)?/g, 'kotlin("jvm") version "1.9.24"$1');
    // Case 2: no explicit version → append version
    out = out.replace(/kotlin\\("jvm"\\)(?!\\s*version)/g, 'kotlin("jvm") version "1.9.24"');
    return out;
  });

  // Patch expo-autolinking plugin shared module to pin kotlin plugins to 1.9.24
  const expoAutolinkSharedFile = path.join(process.cwd(), 'node_modules', 'expo-modules-autolinking', 'android', 'expo-gradle-plugin', 'expo-autolinking-plugin-shared', 'build.gradle.kts');
  tryPatch(expoAutolinkSharedFile, (code) => {
    let out = code;
    out = out.replace(/kotlin\\("jvm"\\)\\s*version\\s*"[\\d.]+"|kotlin\\("jvm"\\)\\b/g, 'kotlin("jvm") version "1.9.24"');
    out = out.replace(/kotlin\\("plugin\\.serialization"\\)\\s*version\\s*"[\\d.]+"|kotlin\\("plugin\\.serialization"\\)/g, 'kotlin("plugin.serialization") version "1.9.24"');
    return out;
  });
  // Patch expo-autolinking plugin settings and version catalogs
  const expoAutolinkSettings = path.join(process.cwd(), 'node_modules', 'expo-modules-autolinking', 'android', 'expo-gradle-plugin', 'settings.gradle.kts');
  tryPatch(expoAutolinkSettings, (code) => {
    let out = code;
    if (!/pluginManagement/.test(out)) return out;
    out = out.replace(/(id\\("org\\.jetbrains\\.kotlin\\.jvm"\\)\\s*version\\s*")([\\d.]+)"/g, '$11.9.24"');
    out = out.replace(/(id\\("org\\.jetbrains\\.kotlin\\.android"\\)\\s*version\\s*")([\\d.]+)"/g, '$11.9.24"');
    out = out.replace(/kotlin\\("jvm"\\)\\s*version\\s*"[\\d.]+"/g, 'kotlin("jvm") version "1.9.24"');
    return out;
  });
  const expoAutolinkVersionsToml = path.join(process.cwd(), 'node_modules', 'expo-modules-autolinking', 'android', 'expo-gradle-plugin', 'gradle', 'libs.versions.toml');
  tryPatch(expoAutolinkVersionsToml, (code) => {
    let out = code;
    out = out.replace(/(^\\s*kotlin\\s*=\\s*")([\\d.]+)("\\s*$)/m, '$11.9.24$3');
    out = out.replace(/(^\\s*kotlinSerialization\\s*=\\s*")([\\d.]+)("\\s*$)/m, '$11.9.24$3');
    return out;
  });

  // Also patch the other composite build path used by expo-modules-autolinking: android/gradle-plugin (if present)
  const altAutolinkRoot = path.join(process.cwd(), 'node_modules', 'expo-modules-autolinking', 'android', 'gradle-plugin');
  const altFiles = [
    path.join(altAutolinkRoot, 'build.gradle.kts'),
    path.join(altAutolinkRoot, 'settings.gradle.kts'),
    path.join(altAutolinkRoot, 'gradle', 'libs.versions.toml'),
  ];
  for (const f of altFiles) {
    tryPatch(f, (code) => {
      let out = code;
      out = out.replace(/kotlin\\("jvm"\\)\\s*version\\s*"[\\d.]+"|kotlin\\("jvm"\\)\\b/g, 'kotlin("jvm") version "1.9.24"');
      out = out.replace(/kotlin\\("plugin\\.serialization"\\)\\s*version\\s*"[\\d.]+"|kotlin\\("plugin\\.serialization"\\)/g, 'kotlin("plugin.serialization") version "1.9.24"');
      out = out.replace(/(id\\("org\\.jetbrains\\.kotlin\\.(?:jvm|android)"\\)\\s*version\\s*")([\\d.]+)"/g, '$11.9.24"');
      out = out.replace(/(^\\s*kotlin\\s*=\\s*")([\\d.]+)("\\s*$)/m, '$11.9.24$3');
      out = out.replace(/(^\\s*kotlinSerialization\\s*=\\s*")([\\d.]+)("\\s*$)/m, '$11.9.24$3');
      return out;
    });
  }
}

main();


