/**
 * Reads a local file (file:// or content://) into an ArrayBuffer for supabase-js storage uploads.
 * React Native's fetch cannot produce a Blob that storage accepts, so the file is read as base64
 * with expo-file-system and decoded with base64-arraybuffer.
 */
import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';

export async function readLocalFile(localUri: string): Promise<ArrayBuffer> {
  const file = new File(localUri);
  if (!file.exists) throw new Error('file not found');
  return decode(await file.base64());
}
