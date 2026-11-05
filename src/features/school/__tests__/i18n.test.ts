import enImport from '@/i18n/locales/en/import.json';
import enReports from '@/i18n/locales/en/reports.json';
import enSchool from '@/i18n/locales/en/school.json';
import hiImport from '@/i18n/locales/hi/import.json';
import hiReports from '@/i18n/locales/hi/reports.json';
import hiSchool from '@/i18n/locales/hi/school.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (obj == null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>)
    .filter(([k]) => k !== '_review')
    .flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe.each([
  ['reports', enReports, hiReports],
  ['import', enImport, hiImport],
  ['school', enSchool, hiSchool],
])('%s translations', (_ns, en, hi) => {
  it('has the same keys in English and Hindi', () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
  });

  it('marks the Hindi draft for review', () => {
    expect((hi as { _review?: string })._review).toMatch(/review/);
  });

  it('avoids hype words', () => {
    expect(JSON.stringify(en)).not.toMatch(/seamless|unlock|elevate|tailored|trusted partner/i);
  });
});
