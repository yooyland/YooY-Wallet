module.exports = function (api) {
  api.cache(true);
  
  const plugins = [];
  
  // 프로덕션 빌드에서 console.log 제거 (error, warn은 유지)
  if (process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production') {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  
  // Reanimated must be the last plugin
  plugins.push('react-native-reanimated/plugin');
  
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};


