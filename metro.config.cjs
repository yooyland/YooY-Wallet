// Metro configuration (CommonJS)
// Use CJS (.cjs) to avoid ESM loader issues on Windows absolute paths.
// Reduce max workers to keep memory low during bundling.

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  config.maxWorkers = 1;
  return config;
})();

