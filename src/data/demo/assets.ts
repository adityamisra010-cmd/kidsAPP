/**
 * Resolves the bundled demo practice videos (assets/demo/practice-N.mp4) to a playable URI.
 * Kept behind one small function so tests can mock it and the adapter never touches native modules
 * directly. Requires stay inside the function so nothing loads until a video is actually played.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro needs static require() for bundled assets, and expo-asset is loaded lazily. */

function moduleFor(name: string): number | undefined {
  switch (name) {
    case 'practice-1':
      return require('../../../assets/demo/practice-1.mp4');
    case 'practice-2':
      return require('../../../assets/demo/practice-2.mp4');
    case 'practice-3':
      return require('../../../assets/demo/practice-3.mp4');
    default:
      return undefined;
  }
}

/** `demo/practice-2.mp4` → playable URI (falls back to the module id when expo-asset is unavailable). */
export function resolveDemoVideo(bucketPath: string): string | undefined {
  const name = bucketPath.replace(/^demo\//, '').replace(/\.mp4$/, '');
  const mod = moduleFor(name);
  if (mod == null) return undefined;
  try {
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    return Asset.fromModule(mod).uri;
  } catch {
    return String(mod);
  }
}
