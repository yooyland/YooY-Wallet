const { existsSync, rmSync } = require('file-system');
const { spawnSync } = require('child_process');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function main() {
  const hasAndroid = existsSync('android');
  const hasGradlew = existsSync('android/gradlew');
  if (hasAndroid && hasGradlew) {
    console.log('[ensure-android] android/gradlew exists. Skipping prebuild.');
    // Best-effort: clean prebuilt Gradle plugin artifacts under node_modules to force rebuild with patched kotlin versions
    const toClean = [
      'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/build',
      'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/build',
      'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin-shared/build',
      'node_modules/expo/node_modules/expo-modules-core/expo-module-gradle-plugin/build',
    ];
    for (const p of toClean) {
      try {
        const full = require('path').join(process.cwd(), p);
        if (existsSync(full)) {
          console.log(`[ensure-android] removing stale build dir: ${p}`);
          rmSync(full, { recursive: true, force: true });
        }
      } catch (e) {
        console.log('[ensure-android] warn: cleanup failed for', p, e.message);
      }
    }
    return;
  }
  console.log('[ensure-android] android/gradlew not found. Running expo prebuild for android...');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--non-interactive']);
  if (!existsSync('android/gradlew')) {
    throw new Error('android/gradlew still missing after prebuild.');
  }
  console.log('[ensure-android] android/gradlew is present.');
}

main();


