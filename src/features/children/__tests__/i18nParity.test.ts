import enAdmin from '@/i18n/locales/en/admin.json';
import enChild from '@/i18n/locales/en/child.json';
import enGoals from '@/i18n/locales/en/goals.json';
import enProgress from '@/i18n/locales/en/progress.json';
import hiAdmin from '@/i18n/locales/hi/admin.json';
import hiChild from '@/i18n/locales/hi/child.json';
import hiGoals from '@/i18n/locales/hi/goals.json';
import hiProgress from '@/i18n/locales/hi/progress.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (k === '_review') return [];
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? keys(v as object, path) : [path];
  });
}

describe.each([
  ['child', enChild, hiChild],
  ['goals', enGoals, hiGoals],
  ['progress', enProgress, hiProgress],
  ['admin', enAdmin, hiAdmin],
])('%s namespace', (_ns, en, hi) => {
  it('has the same keys in English and Hindi', () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
  });

  it('keeps the Hindi review marker', () => {
    expect((hi as { _review?: string })._review).toMatch(/review/);
  });
});
