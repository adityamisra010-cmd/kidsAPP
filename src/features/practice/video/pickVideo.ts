/**
 * Thin wrapper over expo-image-picker for practice videos (system camera, 60 s cap).
 * Returns plain results so the UI decides how to talk about cancellations and denials.
 */
import * as ImagePicker from 'expo-image-picker';

import { VIDEO_LIMITS } from '@/domain/constants';

import { pickerDurationS } from '../logic';

export type PickResult =
  | { status: 'picked'; uri: string; durationS?: number; sizeBytes?: number; mimeType?: string }
  | { status: 'cancelled' };

export type CameraAccess = 'granted' | 'undetermined' | 'denied' | 'blocked';

export async function cameraAccess(): Promise<CameraAccess> {
  const p = await ImagePicker.getCameraPermissionsAsync();
  if (p.granted) return 'granted';
  if (p.status === 'undetermined') return 'undetermined';
  return p.canAskAgain ? 'denied' : 'blocked';
}

export async function requestCameraAccess(): Promise<CameraAccess> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'denied' : 'blocked';
}

function toResult(r: ImagePicker.ImagePickerResult): PickResult {
  const asset = r.canceled ? undefined : r.assets?.[0];
  if (!asset) return { status: 'cancelled' };
  return {
    status: 'picked',
    uri: asset.uri,
    durationS: pickerDurationS(asset.duration),
    sizeBytes: asset.fileSize ?? undefined,
    mimeType: asset.mimeType ?? undefined,
  };
}

export async function recordVideo(): Promise<PickResult> {
  return toResult(
    await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: VIDEO_LIMITS.maxDurationS,
      quality: 0.7,
    }),
  );
}

export async function chooseVideo(): Promise<PickResult> {
  return toResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 }));
}
