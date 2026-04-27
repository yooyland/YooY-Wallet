// Metro configuration (CommonJS)
// Use CJS (.cjs) to avoid ESM loader issues on Windows absolute paths.
// Reduce max workers to keep memory low during bundling.

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  config.maxWorkers = 1;
  // Windows에서 os.tmpdir()의 metro-cache 정리 중 ENOTEMPTY가 종종 발생 → 프로젝트 내부 캐시로 고정
  config.cacheStores = [
    new FileStore({
      root: path.join(__dirname, '.metro-cache'),
    }),
  ];
  return config;
})();

