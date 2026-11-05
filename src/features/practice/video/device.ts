/**
 * Native-only video helpers: on-device compression and private local copies for the upload queue.
 * The web build uses device.web.ts (no compressor, no file system).
 */
import { Directory, File, Paths } from 'expo-file-system';
import { Video } from 'react-native-compressor';

import { VIDEO_LIMITS } from '@/domain/constants';

/** Compresses to at most 720 px with the library's automatic bitrate. Progress 0..1. */
export async function compressVideo(uri: string, onProgress: (p: number) => void): Promise<string> {
  return Video.compress(uri, { compressionMethod: 'auto', maxSize: VIDEO_LIMITS.maxHeight, progressDivider: 5 }, onProgress);
}

export function fileSizeBytes(uri: string): number | undefined {
  try {
    const f = new File(uri);
    return f.exists ? f.size : undefined;
  } catch {
    return undefined;
  }
}

const QUEUE_DIR = 'practice-videos';

/**
 * Copies the compressed video into the app's private documents folder so a queued upload survives
 * the OS clearing the cache. Falls back to the original uri if copying fails.
 */
export async function keepForUpload(uri: string, name: string): Promise<string> {
  try {
    const dir = new Directory(Paths.document, QUEUE_DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${name}.mp4`);
    if (dest.exists) dest.delete();
    await new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

export function deleteLocalVideo(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone, or not ours to delete.
  }
}

export const supportsCompression = true;
