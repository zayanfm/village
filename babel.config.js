module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 uses the worklets plugin; it MUST be the last plugin listed.
    plugins: ['react-native-worklets/plugin'],
  };
};
