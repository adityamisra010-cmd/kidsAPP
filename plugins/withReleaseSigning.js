/**
 * Config plugin: release signing + ABI selection for `expo prebuild` (keeps android/ generated).
 *
 * Release builds are signed with the keystore given by env vars (keystore lives OUTSIDE the repo):
 *   MYKIDS_KEYSTORE_PATH, MYKIDS_KEYSTORE_PASSWORD, MYKIDS_KEY_ALIAS, MYKIDS_KEY_PASSWORD
 * Without them the build falls back to the debug key (fine for local testing, not for sharing).
 *
 * ABIs: arm64-v8a + armeabi-v7a cover real Android phones (incl. older budget phones) and keep the
 * APK small. Override with REACT_NATIVE_ARCHITECTURES.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING_BLOCK = `
        release {
            if (System.getenv('MYKIDS_KEYSTORE_PATH')) {
                storeFile file(System.getenv('MYKIDS_KEYSTORE_PATH'))
                storePassword System.getenv('MYKIDS_KEYSTORE_PASSWORD')
                keyAlias System.getenv('MYKIDS_KEY_ALIAS')
                keyPassword System.getenv('MYKIDS_KEY_PASSWORD')
            }
        }`;

function withSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes("System.getenv('MYKIDS_KEYSTORE_PATH')")) {
      src = src.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING_BLOCK}`);
      // Inside buildTypes.release, use the release config when a keystore is provided.
      src = src.replace(
        /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/,
        `$1signingConfig System.getenv('MYKIDS_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug`,
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withAbis(config) {
  return withGradleProperties(config, (cfg) => {
    const abis = process.env.REACT_NATIVE_ARCHITECTURES || 'arm64-v8a,armeabi-v7a';
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'reactNativeArchitectures'));
    cfg.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: abis });
    return cfg;
  });
}

module.exports = function withReleaseSigning(config) {
  return withAbis(withSigning(config));
};
