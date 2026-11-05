/**
 * Write a file to the cache and open the system share sheet (WhatsApp, email, Drive…).
 * Web: downloads the file instead. Used by CSV exports, import templates and PDFs.
 */
import { File as FsFile, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export class ShareUnavailableError extends Error {
  constructor() {
    super('share_unavailable');
    this.name = 'ShareUnavailableError';
  }
}

interface ShareOptions {
  mimeType: string;
  dialogTitle: string;
  /** iOS uniform type identifier. */
  uti?: string;
}

function downloadOnWeb(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareUri(uri: string, opts: ShareOptions): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new ShareUnavailableError();
  await Sharing.shareAsync(uri, { mimeType: opts.mimeType, dialogTitle: opts.dialogTitle, UTI: opts.uti });
}

/** Text file (CSV) → cache → share sheet. */
export async function shareTextFile(fileName: string, content: string, opts: ShareOptions): Promise<void> {
  if (Platform.OS === 'web') {
    downloadOnWeb(fileName, content, opts.mimeType);
    return;
  }
  const file = new FsFile(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(content);
  await shareUri(file.uri, opts);
}

export const CSV_SHARE = { mimeType: 'text/csv', uti: 'public.comma-separated-values-text' } as const;

/** HTML → PDF (A4) → share sheet with a readable file name. Web: opens the print dialog. */
export async function sharePdf(html: string, fileName: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  let shareUriValue = uri;
  try {
    const named = new FsFile(Paths.cache, fileName);
    await new FsFile(uri).move(named, { overwrite: true });
    shareUriValue = named.uri;
  } catch {
    // Keep the generated name; sharing still works.
  }
  await shareUri(shareUriValue, { mimeType: 'application/pdf', dialogTitle, uti: 'com.adobe.pdf' });
}

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/**
 * The print WebView can't read app-local files, so a locally picked logo is inlined as a data URI.
 * Remote https logos are passed through.
 */
export async function logoForPrint(logoUrl: string | undefined): Promise<string | undefined> {
  if (!logoUrl) return undefined;
  if (/^(https:|data:)/i.test(logoUrl)) return logoUrl;
  if (Platform.OS === 'web' || !/^(file|content):/i.test(logoUrl)) return undefined;
  try {
    const ext = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(logoUrl)?.[1]?.toLowerCase() ?? 'png';
    const b64 = await new FsFile(logoUrl).base64();
    return `data:${IMAGE_MIME[ext] ?? 'image/png'};base64,${b64}`;
  } catch {
    return undefined;
  }
}
