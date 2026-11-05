import type { ExportRow } from '@/domain/types';

import { csvCell, csvColumns, toCsv, UTF8_BOM } from '../csv';
import { isValidRange, matchPreset, presetRange } from '../dateRanges';

describe('toCsv', () => {
  it('writes a BOM, header row and CRLF lines', () => {
    const csv = toCsv([
      { Date: '2026-10-01', Child: 'Aarav Sharma', Score: 66 },
      { Date: '2026-10-02', Child: 'दिया अय्यर', Score: 71.5 },
    ]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(`${UTF8_BOM}Date,Child,Score\r\n2026-10-01,Aarav Sharma,66\r\n2026-10-02,दिया अय्यर,71.5\r\n`);
  });

  it('quotes commas, quotes, newlines and edge spaces', () => {
    expect(csvCell('Sharma, Aarav')).toBe('"Sharma, Aarav"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
    expect(csvCell(' padded ')).toBe('" padded "');
    expect(csvCell('plain')).toBe('plain');
  });

  it('writes nulls, booleans and numbers plainly', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('Yes');
    expect(csvCell(false)).toBe('No');
    expect(csvCell(false, ['TRUE', 'FALSE'])).toBe('FALSE');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(-4.5)).toBe('-4.5');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('neutralises spreadsheet formulas but keeps phone numbers and negatives', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('+91 98765 43210')).toBe('+91 98765 43210');
    expect(csvCell('-12')).toBe('-12');
  });

  it('collects columns across rows in first-seen order, or uses the given order', () => {
    const rows: ExportRow[] = [{ a: 1 }, { b: 2, a: 3 }];
    expect(csvColumns(rows)).toEqual(['a', 'b']);
    expect(toCsv(rows, { bom: false })).toBe('a,b\r\n1,\r\n3,2\r\n');
    expect(toCsv(rows, { bom: false, columns: ['b', 'a'] })).toBe('b,a\r\n,1\r\n2,3\r\n');
  });

  it('writes just a header (or nothing) for empty data', () => {
    expect(toCsv([], { bom: false, columns: ['Date'] })).toBe('Date\r\n');
    expect(toCsv([], { bom: false })).toBe('\r\n');
  });
});

describe('date range presets', () => {
  const today = new Date(2026, 9, 29);

  it('computes presets', () => {
    expect(presetRange('this_month', today)).toEqual({ from: '2026-10-01', to: '2026-10-29' });
    expect(presetRange('last_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('last_3_months', today)).toEqual({ from: '2026-08-01', to: '2026-10-29' });
    expect(presetRange('last_month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('validates ranges', () => {
    expect(isValidRange({ from: '2026-10-01', to: '2026-10-29' })).toBe(true);
    expect(isValidRange({ from: '2026-10-01', to: '2026-10-01' })).toBe(true);
    expect(isValidRange({ from: '2026-10-29', to: '2026-10-01' })).toBe(false);
    expect(isValidRange({ from: '2026-10-01' })).toBe(false);
    expect(isValidRange({ from: 'yesterday', to: '2026-10-01' })).toBe(false);
  });

  it('recognises a preset from a deep link', () => {
    expect(matchPreset({ from: '2026-09-01', to: '2026-09-30' }, today)).toBe('last_month');
    expect(matchPreset({ from: '2026-09-02', to: '2026-09-30' }, today)).toBe('custom');
  });
});
