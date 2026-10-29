/**
 * Spreadsheet → plain grid of strings. Pure (SheetJS only), so it runs in Jest.
 *
 * - CSV text is parsed with `raw: true` so "12/03/2019" and "09876543210" stay exactly as typed
 *   (SheetJS would otherwise read dates US-style and drop leading zeros).
 * - XLSX/XLS date cells become yyyy-MM-dd, time cells HH:mm (no timezone maths involved).
 * - The header row is found automatically: schools often put a title like
 *   "Sunrise Centre – Student list 2026" above the real column names.
 */
import * as XLSX from 'xlsx';

import type { ImportKind } from '@/domain/types';

import { IMPORT_COLUMNS, IMPORT_KINDS } from './columns';
import { cleanText, excelFractionToClock, excelSerialToISODate, normalizeHeader } from './normalize';

export interface RawRow {
  /** Row number as the admin sees it in Excel (1-based). */
  rowNumber: number;
  cells: string[];
}

export interface ParsedSheet {
  sheetName: string;
  sheetCount: number;
  /** Excel row number of the header row. */
  headerRowNumber: number;
  headers: string[];
  rows: RawRow[];
}

export type ImportFileErrorCode = 'empty' | 'unreadable' | 'no_header' | 'no_rows' | 'too_many_rows' | 'unsupported_type' | 'password';

export class ImportFileError extends Error {
  constructor(public code: ImportFileErrorCode) {
    super(code);
    this.name = 'ImportFileError';
  }
}

export const MAX_ROWS = 3000;
const HEADER_SCAN_ROWS = 15;

// ---------------------------------------------------------------------------

/** Number format → what the cell holds. Quoted text and [colour]/[$-409] sections are ignored. */
export function formatKind(z: string | undefined): 'date' | 'time' | 'number' {
  if (!z || z === 'General') return 'number';
  const s = z
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .toLowerCase();
  if (/[dy]/.test(s)) return 'date';
  if (/[hs]/.test(s)) return 'time';
  if (/m/.test(s) && !/[0#?]/.test(s)) return 'date';
  return 'number';
}

function numberToString(v: number): string {
  if (Number.isInteger(v)) return v.toFixed(0);
  return String(Math.round(v * 1e6) / 1e6);
}

export function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  switch (cell.t) {
    case 's':
      return cleanText(cell.v);
    case 'n': {
      const v = typeof cell.v === 'number' ? cell.v : Number(cell.v);
      if (!Number.isFinite(v)) return cleanText(cell.w);
      const kind = formatKind(typeof cell.z === 'string' ? cell.z : undefined);
      if (kind === 'date') {
        const date = excelSerialToISODate(v);
        if (!date) return cleanText(cell.w);
        const hasTime = Math.abs(v - Math.floor(v)) > 1e-9;
        return hasTime ? `${date} ${excelFractionToClock(v)}` : date;
      }
      if (kind === 'time') return excelFractionToClock(v);
      return numberToString(v);
    }
    case 'b':
      return cell.v ? 'TRUE' : 'FALSE';
    case 'd': {
      const d = cell.v instanceof Date ? cell.v : new Date(String(cell.v));
      if (Number.isNaN(d.getTime())) return '';
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    case 'e':
    case 'z':
      return '';
    default:
      return cleanText(cell.w ?? cell.v);
  }
}

function sheetToGrid(ws: XLSX.WorkSheet): string[][] {
  // The sheet's declared range is often far bigger than its data (formatting applied to whole
  // columns), so size the grid from the cells that actually hold something.
  let lastRow = -1;
  let lastCol = -1;
  const values = new Map<string, string>();
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const text = cellToString(ws[addr] as XLSX.CellObject | undefined);
    if (!text) continue;
    const { r, c } = XLSX.utils.decode_cell(addr);
    values.set(`${r}:${c}`, text);
    lastRow = Math.max(lastRow, r);
    lastCol = Math.max(lastCol, c);
  }
  if (lastRow > MAX_ROWS + HEADER_SCAN_ROWS + 500) throw new ImportFileError('too_many_rows');
  const grid: string[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    grid.push(Array.from({ length: lastCol + 1 }, (_, c) => values.get(`${r}:${c}`) ?? ''));
  }
  return grid;
}

const nonEmpty = (row: string[]) => row.filter((c) => c !== '').length;

/** Picks the row that looks most like this kind's column names (falls back to the first row with 2+ cells). */
export function detectHeaderRow(grid: string[][], kind?: ImportKind): number {
  const kinds = kind ? [kind] : IMPORT_KINDS;
  const names = new Set<string>();
  for (const k of kinds) for (const col of IMPORT_COLUMNS[k]) [col.header, ...col.synonyms].forEach((s) => names.add(normalizeHeader(s)));

  let best = -1;
  let bestScore = 0;
  let firstWide = -1;
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const row = grid[r];
    if (nonEmpty(row) < 2) continue;
    if (firstWide < 0) firstWide = r;
    const score = row.filter((c) => c && names.has(normalizeHeader(c))).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best >= 0 ? best : firstWide;
}

/** Grid → headers + data rows. Fully empty rows are dropped; row numbers stay as in Excel. */
export function gridToSheet(grid: string[][], meta: { sheetName: string; sheetCount: number }, kind?: ImportKind): ParsedSheet {
  if (grid.every((row) => nonEmpty(row) === 0)) throw new ImportFileError('empty');
  const headerIdx = detectHeaderRow(grid, kind);
  if (headerIdx < 0) throw new ImportFileError('no_header');

  const rawHeaders = grid[headerIdx];
  let width = rawHeaders.length;
  while (width > 0 && rawHeaders[width - 1] === '') width--;
  // Keep columns that have data even when the header cell is blank.
  for (const row of grid.slice(headerIdx + 1)) {
    for (let c = row.length - 1; c >= width; c--) if (row[c] !== '') width = c + 1;
  }

  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, c) => {
    const h = rawHeaders[c] || `Column ${XLSX.utils.encode_col(c)}`;
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n > 1 ? `${h} (${n})` : h;
  });

  const rows: RawRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const cells = Array.from({ length: width }, (_, c) => grid[r][c] ?? '');
    if (nonEmpty(cells) === 0) continue;
    rows.push({ rowNumber: r + 1, cells });
  }
  if (rows.length === 0) throw new ImportFileError('no_rows');
  if (rows.length > MAX_ROWS) throw new ImportFileError('too_many_rows');
  return { ...meta, headerRowNumber: headerIdx + 1, headers, rows };
}

/** First sheet that has data (most files have one; a blank "Sheet1" in front is skipped). */
export function workbookToSheet(wb: XLSX.WorkBook, kind?: ImportKind): ParsedSheet {
  const names = wb.SheetNames;
  if (!names.length) throw new ImportFileError('empty');
  for (const name of names) {
    const grid = sheetToGrid(wb.Sheets[name]);
    if (grid.some((row) => nonEmpty(row) > 0)) return gridToSheet(grid, { sheetName: name, sheetCount: names.length }, kind);
  }
  throw new ImportFileError('empty');
}

/** Text that decoded badly (UTF-16 read as UTF-8, binary files). */
export function looksGarbled(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 4000);
  const bad = (sample.match(/[\u0000-\u0008\u000E-\u001F\uFFFD]/g) ?? []).length;
  return bad > Math.max(3, sample.length * 0.02);
}

export function parseCsvText(text: string, kind?: ImportKind): ParsedSheet {
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) throw new ImportFileError('empty');
  if (looksGarbled(clean)) throw new ImportFileError('unreadable');
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(clean, { type: 'string', raw: true, cellText: false });
  } catch {
    throw new ImportFileError('unreadable');
  }
  return workbookToSheet(wb, kind);
}

/** XLSX / XLS / any SheetJS-readable file. `data` is base64 (native) or an ArrayBuffer (web). */
export function parseWorkbookData(data: string | ArrayBuffer, kind?: ImportKind): ParsedSheet {
  let wb: XLSX.WorkBook;
  try {
    wb =
      typeof data === 'string'
        ? XLSX.read(data, { type: 'base64', cellNF: true, cellHTML: false, cellFormula: false })
        : XLSX.read(new Uint8Array(data), { type: 'array', cellNF: true, cellHTML: false, cellFormula: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : '';
    throw new ImportFileError(msg.includes('password') || msg.includes('encrypt') ? 'password' : 'unreadable');
  }
  return workbookToSheet(wb, kind);
}

export type SpreadsheetFormat = 'csv' | 'workbook' | 'unsupported';

export function formatFromName(name: string, mimeType?: string): SpreadsheetFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods') return 'workbook';
  if (mimeType && /csv|comma-separated|tab-separated|text\/plain/.test(mimeType)) return 'csv';
  if (mimeType && /spreadsheet|excel|opendocument/.test(mimeType)) return 'workbook';
  return 'unsupported';
}

/** First non-empty value in a column (shown as "e.g. Aarav Sharma" when matching columns). */
export function sampleValue(sheet: ParsedSheet, col: number): string | undefined {
  for (const row of sheet.rows) if (row.cells[col]) return row.cells[col];
  return undefined;
}
