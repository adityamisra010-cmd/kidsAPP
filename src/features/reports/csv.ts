/**
 * CSV writer for admin exports. RFC 4180 quoting, CRLF line endings and a UTF-8 BOM so Excel
 * opens Hindi names (and ₹) correctly on Windows.
 */
import type { ExportRow } from '@/domain/types';

export const UTF8_BOM = '\uFEFF';

export interface CsvOptions {
  /** Column order. Default: keys in order of first appearance across rows. */
  columns?: string[];
  /** Prefix with a byte-order mark (default true). */
  bom?: boolean;
  /** Words for true/false (default Yes/No). */
  booleans?: [string, string];
}

/** Spreadsheet apps run cells starting with = + - @ as formulas. Plain numbers/phones are safe. */
function neutraliseFormula(s: string): string {
  if (/^[=@\t\r]/.test(s)) return `'${s}`;
  if (/^[+-]/.test(s) && !/^[+-][\d\s().-]*$/.test(s)) return `'${s}`;
  return s;
}

export function csvCell(value: ExportRow[string] | undefined, booleans: [string, string] = ['Yes', 'No']): string {
  if (value == null) return '';
  let s: string;
  if (typeof value === 'boolean') s = value ? booleans[0] : booleans[1];
  else if (typeof value === 'number') s = Number.isFinite(value) ? String(value) : '';
  else s = neutraliseFormula(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvColumns(rows: ExportRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) seen.add(k);
  return [...seen];
}

export function toCsv(rows: ExportRow[], opts: CsvOptions = {}): string {
  const columns = opts.columns ?? csvColumns(rows);
  const lines = [columns.map((c) => csvCell(c)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c], opts.booleans)).join(','));
  return `${opts.bom === false ? '' : UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
