// Expo config plugin: limit the Android build to the arm64-v8a ABI only.
//
// The default build produces a universal APK bundling all 4 ABIs
// (armeabi-v7a, arm64-v8a, x86, x86_64 ≈ 85 MB of native libs). x86/x86_64
// are emulator-only and armeabi-v7a is for old 32-bit phones; every modern
// device (incl. the Pixel 8a) uses arm64-v8a. Pinning reactNativeArchitectures
// to arm64-v8a cuts the APK from ~108 MB to ~44 MB with no loss on real phones.
//
// Done as a plugin (not a manual android/gradle.properties edit) so it survives
// `expo prebuild --clean`, which regenerates the android/ folder every time.
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'reactNativeArchitectures';
const VALUE = 'arm64-v8a';

module.exports = function withArm64Only(config) {
  return withGradleProperties(config, cfg => {
    cfg.modResults = cfg.modResults.filter(
      item => !(item.type === 'property' && item.key === KEY)
    );
    cfg.modResults.push({ type: 'property', key: KEY, value: VALUE });
    return cfg;
  });
};
