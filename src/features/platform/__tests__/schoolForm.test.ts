import { DEFAULT_ORG_SETTINGS } from '@/domain/constants';
import type { SchoolSummary } from '@/domain/types';

import {
  formatIndianPhone,
  normalizeIndianPhone,
  schoolSchema,
  schoolTotals,
  sortSchools,
  suggestShortName,
  toCreateSchoolInput,
} from '../schoolForm';

describe('normalizeIndianPhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['(987) 654 3210', '+919876543210'],
  ])('mobile %s → %s', (input, out) => {
    expect(normalizeIndianPhone(input, { mobile: true })).toBe(out);
  });

  it('rejects non-mobile prefixes, wrong lengths and other countries for mobiles', () => {
    expect(normalizeIndianPhone('5876543210', { mobile: true })).toBeNull();
    expect(normalizeIndianPhone('98765', { mobile: true })).toBeNull();
    expect(normalizeIndianPhone('+44 7700 900123', { mobile: true })).toBeNull();
    expect(normalizeIndianPhone('', { mobile: true })).toBeNull();
  });

  it('accepts landlines with an STD code for the school phone', () => {
    expect(normalizeIndianPhone('080 2345 6789', { mobile: false })).toBe('+918023456789');
    expect(normalizeIndianPhone('020-25550101', { mobile: false })).toBe('+912025550101');
  });

  it('formats for display', () => {
    expect(formatIndianPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatIndianPhone('12345')).toBe('12345');
  });
});

describe('schoolSchema', () => {
  const valid = {
    name: 'Sahaj Special School',
    shortName: 'Sahaj',
    city: 'Jaipur',
    address: '14 MI Road, Jaipur',
    phone: '0141 255 0199',
    adminName: 'Meenakshi Rao',
    adminPhone: '98290 11223',
  };

  it('accepts a complete form and normalises phones', () => {
    const parsed = schoolSchema.parse(valid);
    expect(toCreateSchoolInput(parsed)).toMatchObject({ phone: '+911412550199', adminPhone: '+919829011223', name: 'Sahaj Special School' });
  });

  it('returns i18n keys for errors', () => {
    const res = schoolSchema.safeParse({ ...valid, name: ' ', adminPhone: '12345' });
    expect(res.success).toBe(false);
    const messages = res.success ? [] : res.error.issues.map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining(['platform:new.errors.name', 'platform:new.errors.adminPhone']));
  });

  it('suggests a short name', () => {
    expect(suggestShortName('Anvaya Child Development Centre')).toBe('Anvaya');
  });
});

const school = (id: string, status: 'active' | 'suspended', children: number, sessions: number): SchoolSummary => ({
  organization: {
    id,
    name: id,
    shortName: id,
    city: 'Pune',
    address: '',
    phone: '',
    status,
    settings: DEFAULT_ORG_SETTINGS,
    createdAt: '2026-01-01T00:00:00Z',
  },
  activeChildren: children,
  staffCount: 4,
  sessionsThisMonth: sessions,
  activeParentsPercent: 60,
});

describe('school list helpers', () => {
  const list = [school('Zen', 'active', 10, 100), school('Bright', 'suspended', 5, 0), school('Anvaya', 'active', 40, 320)];

  it('totals across schools', () => {
    expect(schoolTotals(list)).toEqual({ schools: 3, active: 2, suspended: 1, children: 55, sessionsThisMonth: 420 });
  });

  it('lists active schools first, alphabetically', () => {
    expect(sortSchools(list).map((s) => s.organization.id)).toEqual(['Anvaya', 'Zen', 'Bright']);
  });
});
