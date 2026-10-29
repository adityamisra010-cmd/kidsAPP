/** Shared result type and text clean-up for import parsing. */

export type Parsed<T> = { ok: true; value: T; warning?: string } | { ok: false; code: string };

export const ok = <T>(value: T, warning?: string): Parsed<T> => (warning ? { ok: true, value, warning } : { ok: true, value });
export const fail = <T>(code: string): Parsed<T> => ({ ok: false, code });

export const pad2 = (n: number) => String(n).padStart(2, '0');
// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Trim, drop zero-width characters / non-breaking spaces and collapse internal whitespace. */
export function cleanText(raw: unknown): string {
  if (raw == null) return '';
  return String(raw)
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Header comparison form: lower-case, no bracketed hints, punctuation → space. */
export function normalizeHeader(raw: string): string {
  return cleanText(raw)
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'smt', 'shri', 'shree', 'sri', 'kum', 'kumari', 'master', 'baby', 'prof', 'sh']);

/** Name comparison form: case/space-insensitive, honorifics ("Ms.", "Dr.", "Smt.") and dots ignored. */
export function normalizeName(raw: string): string {
  const words = cleanText(raw)
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  while (words.length > 1 && TITLES.has(words[0])) words.shift();
  return words.join(' ');
}

export function hasLetter(raw: string): boolean {
  return /\p{L}/u.test(raw);
}

/** Splits "Speech; OT / Physio" style lists (not on "&"/"and": "Speech & Language Therapy" is one name). */
export function splitList(raw: string): string[] {
  return cleanText(raw)
    .split(/\s*[,;|/\n]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}
