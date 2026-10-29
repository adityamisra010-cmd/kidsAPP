import { IMPORT_COLUMNS, IMPORT_KINDS, isImportKind } from '../columns';
import { parseCsvText } from '../parse';
import { templateFileName, TEMPLATES } from '../templates';

// Jest provides these at runtime; the app's tsconfig has no Node types.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: 'utf8'): string }>('fs');
const ROOT = `${__dirname}/../../../..`;

describe('CSV templates', () => {
  it.each(IMPORT_KINDS)('%s: embedded copy matches CSV_TEMPLATES/', (kind) => {
    expect(TEMPLATES[kind]).toBe(readFileSync(`${ROOT}/CSV_TEMPLATES/${kind}.csv`, 'utf8'));
  });

  it.each(IMPORT_KINDS)('%s: headers are exactly the template columns, with 2–3 sample rows', (kind) => {
    const sheet = parseCsvText(TEMPLATES[kind], kind);
    expect(sheet.headers).toEqual(IMPORT_COLUMNS[kind].map((c) => c.header));
    expect(sheet.rows.length).toBeGreaterThanOrEqual(2);
    expect(sheet.rows.length).toBeLessThanOrEqual(3);
  });

  it('names template files and guards kinds', () => {
    expect(templateFileName('children')).toBe('children-template.csv');
    expect(isImportKind('staff')).toBe(true);
    expect(isImportKind('teachers')).toBe(false);
    expect(isImportKind(undefined)).toBe(false);
  });

  it('keeps column keys unique per kind', () => {
    for (const kind of IMPORT_KINDS) {
      const keys = IMPORT_COLUMNS[kind].map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
