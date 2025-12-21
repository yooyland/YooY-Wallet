/* eslint-disable no-console */
/**
 * EAS 빌드 훅: 스토어 프로파일(store) + BARCODE 비활성화 시
 * expo-barcode-scanner 의존성을 package.json에서 제거하여
 * 네이티브 autolinking 자체를 차단합니다.
 *
 * 실행 시점: "eas-build-pre-install" (설치 이전)
 */
const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function main() {
  const profile = process.env.EAS_BUILD_PROFILE || '';
  const barcodeEnabled = process.env.EXPO_PUBLIC_BARCODE_ENABLED !== 'false';
  const projectRoot = process.cwd();
  const pkgPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    console.log('[prepare-store-build] package.json not found, skip.');
    return;
  }

  // 모든 프로파일에서 동작(development/preview/production/store)
  console.log(`[prepare-store-build] profile=${profile} BARCODE_ENABLED=${barcodeEnabled}`);

  if (barcodeEnabled) {
    console.log('[prepare-store-build] BARCODE_ENABLED=true → skip removing dependency.');
    return;
  }

  const pkg = readJson(pkgPath);
  const deps = pkg.dependencies || {};

  if (deps['expo-barcode-scanner']) {
    console.log('[prepare-store-build] Removing dependency: expo-barcode-scanner');
    delete deps['expo-barcode-scanner'];
    pkg.dependencies = deps;
    writeJson(pkgPath, pkg);
    console.log('[prepare-store-build] package.json updated. expo-barcode-scanner removed.');
  } else {
    console.log('[prepare-store-build] expo-barcode-scanner not present in dependencies.');
  }
}

try {
  main();
} catch (e) {
  console.error('[prepare-store-build] Failed:', e);
  // 실패해도 빌드 전체를 막지 않도록 종료 코드를 0으로 유지
}






