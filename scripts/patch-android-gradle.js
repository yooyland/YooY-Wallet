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
}

main();


