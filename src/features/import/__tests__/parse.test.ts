import * as XLSX from 'xlsx';

import { cellToString, detectHeaderRow, formatFromName, formatKind, ImportFileError, looksGarbled, parseCsvText, parseWorkbookData, sampleValue } from '../parse';

function xlsxBase64(aoa: unknown[][], formats: Record<string, string> = {}, bookType: XLSX.BookType = 'xlsx'): string {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const [addr, z] of Object.entries(formats)) (ws[addr] as XLSX.CellObject).z = z;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  return XLSX.write(wb, { type: 'base64', bookType }) as string;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ImportFileError ? e.code : 'other';
  }
  return undefined;
}

describe('parseCsvText', () => {
  it('keeps cells exactly as typed (no US date guessing, no lost zeros)', () => {
    const sheet = parseCsvText('Name,DOB,Phone\n"Sharma, Aarav",12/03/2019,09876543210\nदिया अय्यर,2019-03-12,+91 98765 43210\n');
    expect(sheet.headers).toEqual(['Name', 'DOB', 'Phone']);
    expect(sheet.rows).toEqual([
      { rowNumber: 2, cells: ['Sharma, Aarav', '12/03/2019', '09876543210'] },
      { rowNumber: 3, cells: ['दिया अय्यर', '2019-03-12', '+91 98765 43210'] },
    ]);
    expect(sheet.headerRowNumber).toBe(1);
  });

  it('strips a UTF-8 BOM and handles semicolon and tab separated files', () => {
    expect(parseCsvText('\uFEFFName;DOB\nAarav;12/03/2019').rows[0].cells).toEqual(['Aarav', '12/03/2019']);
    expect(parseCsvText('Name\tDOB\nAarav\t12/03/2019').rows[0].cells).toEqual(['Aarav', '12/03/2019']);
  });

  it('skips a title row above the real header and keeps Excel row numbers', () => {
    const csv = 'Sunrise Centre - Student list 2026,,\n,,\nS.No.,Student Name,Date of Birth\n1,Aarav Sharma,14/03/2019\n2,,\n3,Diya Iyer,02/11/2017\n';
    const sheet = parseCsvText(csv, 'children');
    expect(sheet.headerRowNumber).toBe(3);
    expect(sheet.headers).toEqual(['S.No.', 'Student Name', 'Date of Birth']);
    // Row 5 only has a serial number: kept here (the validator ignores it), fully blank rows are dropped.
    expect(sheet.rows.map((r) => r.rowNumber)).toEqual([4, 5, 6]);
  });

  it('names blank and repeated headers so every column can be picked', () => {
    const sheet = parseCsvText('Name,,Phone,Phone\nA,x,1,2');
    expect(sheet.headers).toEqual(['Name', 'Column B', 'Phone', 'Phone (2)']);
  });

  it('keeps a quoted multi-line cell together', () => {
    const sheet = parseCsvText('Name,Notes\nAarav,"line one\nline two"\n');
    expect(sheet.rows).toHaveLength(1);
  });

  it('explains empty, header-only and garbled files', () => {
    expect(codeOf(() => parseCsvText(''))).toBe('empty');
    expect(codeOf(() => parseCsvText('   \n \n'))).toBe('empty');
    expect(codeOf(() => parseCsvText('Name,DOB\n'))).toBe('no_rows');
    expect(codeOf(() => parseCsvText('just one cell\nanother'))).toBe('no_header');
    expect(codeOf(() => parseCsvText('N\u0000a\u0000m\u0000e\u0000,\u0000D\u0000O\u0000B\u0000\n'))).toBe('unreadable');
  });
});

describe('parseWorkbookData (xlsx / xls)', () => {
  it('turns date cells into ISO dates and time cells into HH:mm, whatever the display format', () => {
    const b64 = xlsxBase64(
      [
        ['Child Name', 'DOB', 'Mobile', 'Time'],
        ['Aarav', 43538, 9876543210, 0.4375],
      ],
      { B2: 'm/d/yy', D2: 'h:mm AM/PM' },
    );
    const sheet = parseWorkbookData(b64);
    expect(sheet.sheetName).toBe('Students');
    expect(sheet.rows[0].cells).toEqual(['Aarav', '2019-03-14', '9876543210', '10:30']);
  });

  it('reads legacy .xls files too', () => {
    const b64 = xlsxBase64([['Name', 'DOB'], ['Diya', 42676]], { B2: 'dd/mm/yyyy' }, 'biff8');
    expect(parseWorkbookData(b64).rows[0].cells).toEqual(['Diya', '2016-11-02']);
  });

  it('accepts an ArrayBuffer (web)', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'DOB'], ['Diya', '02/11/2017']]), 'S');
    const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(parseWorkbookData(ab).rows[0].cells).toEqual(['Diya', '02/11/2017']);
  });

  it('skips an empty first sheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'DOB'], ['Aarav', '14/03/2019']]), 'Children');
    const sheet = parseWorkbookData(XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string);
    expect(sheet.sheetName).toBe('Children');
    expect(sheet.sheetCount).toBe(2);
  });

  it('reports a corrupt file kindly', () => {
    expect(codeOf(() => parseWorkbookData(btoa('PK\u0003\u0004garbage')))).toMatch(/unreadable|password/);
  });
});

describe('helpers', () => {
  it('classifies number formats', () => {
    expect(formatKind('General')).toBe('number');
    expect(formatKind(undefined)).toBe('number');
    expect(formatKind('0.00')).toBe('number');
    expect(formatKind('[$₹-4009] #,##0.00')).toBe('number');
    expect(formatKind('dd/mm/yyyy')).toBe('date');
    expect(formatKind('[$-409]d-mmm-yy;@')).toBe('date');
    expect(formatKind('mmm')).toBe('date');
    expect(formatKind('h:mm AM/PM')).toBe('time');
    expect(formatKind('"Due "0')).toBe('number');
  });

  it('converts cells', () => {
    expect(cellToString(undefined)).toBe('');
    expect(cellToString({ t: 'n', v: 10.5 })).toBe('10.5');
    expect(cellToString({ t: 'n', v: 919876543210 })).toBe('919876543210');
    expect(cellToString({ t: 'b', v: true })).toBe('TRUE');
    expect(cellToString({ t: 'e', v: 7 })).toBe('');
    expect(cellToString({ t: 'n', v: 43538.5, z: 'dd/mm/yyyy hh:mm' })).toBe('2019-03-14 12:00');
  });

  it('finds the header row by known column names', () => {
    const grid = [['Report', 'Oct'], ['x', 'y'], ['Parent Name', 'Mobile', 'Child Name']];
    expect(detectHeaderRow(grid, 'parents')).toBe(2);
    expect(detectHeaderRow([['a'], ['b']])).toBe(-1);
  });

  it('detects the format from name or MIME type', () => {
    expect(formatFromName('Students.CSV')).toBe('csv');
    expect(formatFromName('staff.xlsx')).toBe('workbook');
    expect(formatFromName('old.xls')).toBe('workbook');
    expect(formatFromName('download', 'text/csv')).toBe('csv');
    expect(formatFromName('download', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('workbook');
    expect(formatFromName('photo.jpg', 'image/jpeg')).toBe('unsupported');
  });

  it('spots badly decoded text', () => {
    expect(looksGarbled('Name,DOB\nAarav,14/03/2019')).toBe(false);
    expect(looksGarbled('\uFFFD\uFFFD\uFFFD\uFFFD\uFFFDabc')).toBe(true);
  });

  it('finds a sample value for a column', () => {
    const sheet = parseCsvText('Name,Class\nAarav,\nDiya,Lotus');
    expect(sampleValue(sheet, 1)).toBe('Lotus');
    expect(sampleValue(sheet, 5)).toBeUndefined();
  });
});
