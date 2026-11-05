/**
 * Picking and reading the school's spreadsheet (device side). Parsing itself is in ./parse.ts.
 * Web uses the browser File object the picker returns.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import type { ImportKind } from '@/domain/types';

import { formatFromName, ImportFileError, looksGarbled, parseCsvText, parseWorkbookData, type ParsedSheet } from './parse';

export interface PickedFile {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
  /** Browser file (web only). */
  webFile?: Blob;
}

const MAX_BYTES = 15 * 1024 * 1024;

/** Opens the system picker. All file types are allowed so WhatsApp/Drive downloads are never greyed out. */
export async function pickSpreadsheet(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { name: a.name, uri: a.uri, mimeType: a.mimeType, size: a.size, webFile: a.file };
}

async function readText(f: PickedFile): Promise<string> {
  if (Platform.OS === 'web' && f.webFile) return f.webFile.text();
  return new FsFile(f.uri).text();
}

async function readBinary(f: PickedFile): Promise<string | ArrayBuffer> {
  if (Platform.OS === 'web' && f.webFile) return f.webFile.arrayBuffer();
  return new FsFile(f.uri).base64();
}

export async function readSpreadsheet(f: PickedFile, kind: ImportKind): Promise<ParsedSheet> {
  const format = formatFromName(f.name, f.mimeType);
  if (format === 'unsupported') throw new ImportFileError('unsupported_type');
  if (f.size != null && f.size > MAX_BYTES) throw new ImportFileError('too_many_rows');
  if (f.size === 0) throw new ImportFileError('empty');
  try {
    if (format === 'csv') {
      const text = await readText(f);
      // "Unicode Text" saved by Excel is UTF-16: let SheetJS decode the raw bytes instead.
      if (looksGarbled(text)) return parseWorkbookData(await readBinary(f), kind);
      return parseCsvText(text, kind);
    }
    return parseWorkbookData(await readBinary(f), kind);
  } catch (e) {
    if (e instanceof ImportFileError) throw e;
    throw new ImportFileError('unreadable');
  }
}
