const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK v9+ ships package-level `exports` maps but also has a stale
// `react-native` field in some sub-packages (e.g. @firebase/firestore) that
// points to a file which no longer exists. Enabling package exports makes Metro
// use the `exports` map — where all paths resolve correctly — instead of
// falling back to the broken `react-native` field.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
