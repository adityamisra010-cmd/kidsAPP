/**
 * Create-school form: validation (zod) and phone normalisation, plus list totals.
 * Error messages are i18n keys (FormTextField translates them).
 */
import { z } from 'zod';

import type { SchoolSummary } from '@/domain/types';

/**
 * Indian numbers → "+91XXXXXXXXXX". Accepts spaces, dashes, brackets, a leading 0, 91 or +91.
 * `mobile` also requires a mobile prefix (6–9), since the first admin signs in by SMS code.
 * School phones may be landlines with an STD code (e.g. 080 2345 6789), so any 10 digits pass.
 */
export function normalizeIndianPhone(input: string, opts: { mobile: boolean }): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!/^\d{10}$/.test(digits)) return null;
  if (opts.mobile && !/^[6-9]/.test(digits)) return null;
  if (!opts.mobile && digits.startsWith('0')) return null;
  return `+91${digits}`;
}

/** "+919876543210" → "+91 98765 43210" for display. */
export function formatIndianPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

const req = (key: string, min = 2) => z.string().trim().min(min, key);

export const schoolSchema = z.object({
  name: req('platform:new.errors.name', 3),
  shortName: z.string().trim().min(2, 'platform:new.errors.shortName').max(24, 'platform:new.errors.shortNameLong'),
  city: req('platform:new.errors.city'),
  address: req('platform:new.errors.address', 5),
  phone: z
    .string()
    .trim()
    .refine((v) => normalizeIndianPhone(v, { mobile: false }) !== null, 'platform:new.errors.phone'),
  adminName: req('platform:new.errors.adminName'),
  adminPhone: z
    .string()
    .trim()
    .refine((v) => normalizeIndianPhone(v, { mobile: true }) !== null, 'platform:new.errors.adminPhone'),
});

export type SchoolFormValues = z.infer<typeof schoolSchema>;

export const EMPTY_SCHOOL_FORM: SchoolFormValues = {
  name: '',
  shortName: '',
  city: '',
  address: '',
  phone: '',
  adminName: '',
  adminPhone: '',
};

/** Values ready for `repo.platform.createSchool` (phones normalised). */
export function toCreateSchoolInput(v: SchoolFormValues) {
  return {
    name: v.name.trim(),
    shortName: v.shortName.trim(),
    city: v.city.trim(),
    address: v.address.trim(),
    phone: normalizeIndianPhone(v.phone, { mobile: false }) ?? v.phone.trim(),
    adminName: v.adminName.trim(),
    adminPhone: normalizeIndianPhone(v.adminPhone, { mobile: true }) ?? v.adminPhone.trim(),
  };
}

/** Suggests a short name from the full name: "Anvaya Child Development Centre" → "Anvaya". */
export function suggestShortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.slice(0, 24);
}

export interface SchoolTotals {
  schools: number;
  active: number;
  suspended: number;
  children: number;
  sessionsThisMonth: number;
}

export function schoolTotals(list: SchoolSummary[]): SchoolTotals {
  return list.reduce<SchoolTotals>(
    (acc, s) => ({
      schools: acc.schools + 1,
      active: acc.active + (s.organization.status === 'active' ? 1 : 0),
      suspended: acc.suspended + (s.organization.status === 'suspended' ? 1 : 0),
      children: acc.children + s.activeChildren,
      sessionsThisMonth: acc.sessionsThisMonth + s.sessionsThisMonth,
    }),
    { schools: 0, active: 0, suspended: 0, children: 0, sessionsThisMonth: 0 },
  );
}

/** Active schools first, then by name. */
export function sortSchools(list: SchoolSummary[]): SchoolSummary[] {
  return [...list].sort(
    (a, b) =>
      Number(a.organization.status !== 'active') - Number(b.organization.status !== 'active') ||
      a.organization.name.localeCompare(b.organization.name),
  );
}
