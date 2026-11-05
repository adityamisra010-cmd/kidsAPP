/**
 * Web stand-ins for device.ts. Browsers can't run the native compressor or write app files, so the
 * picked file is used as-is (the size check still applies) and nothing is copied or deleted.
 */
export async function compressVideo(uri: string, onProgress: (p: number) => void): Promise<string> {
  onProgress(1);
  return uri;
}

export function fileSizeBytes(_uri: string): number | undefined {
  return undefined;
}

export async function keepForUpload(uri: string, _name: string): Promise<string> {
  return uri;
}

export function deleteLocalVideo(_uri: string): void {
  // Nothing to clean up on web.
}

export const supportsCompression = false;
