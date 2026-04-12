module.exports = function (api) {
  api.cache(true);
  
  const plugins = [];
  
  // Reanimated must be the last plugin
  plugins.push('react-native-reanimated/plugin');
  
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};


