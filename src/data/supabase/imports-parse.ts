/**
 * Pure parsing helpers for CSV/XLSX import rows. The validator (src/features/import) keys values by
 * template column; these readers accept camelCase, snake_case and spaced variants of each key so
 * small template differences don't break a commit.
 */
import type { ClockTime, ISODate, Role } from '@/domain/types';

function norm(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export type RowReader = (...keys: string[]) => string;

/** First non-empty value among the given column keys (case/underscore-insensitive). */
export function reader(values: Record<string, string>): RowReader {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) m.set(norm(k), String(v ?? '').trim());
  return (...keys) => {
    for (const k of keys) {
      const v = m.get(norm(k));
      if (v) return v;
    }
    return '';
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** yyyy-MM-dd, dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy, "12 Apr 2018", or an Excel serial number. */
export function parseDate(input: string): ISODate | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validDate(y, +m[2], +m[1]);
  }
  m = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? validDate(+m[3], month, +m[1]) : null;
  }
  if (/^\d{5}$/.test(s)) {
    // Excel serial date (days since 1899-12-30)
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000);
    return dt.toISOString().slice(0, 10);
  }
  return null;
}

/** "10:30", "10.30", "9:00 AM", "4 PM" → HH:mm. */
export function parseTime(input: string): ClockTime | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(input.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const DAY_NAMES: Record<string, number> = {
  su: 0, sun: 0, sunday: 0,
  mo: 1, mon: 1, monday: 1,
  tu: 2, tue: 2, tues: 2, tuesday: 2,
  we: 3, wed: 3, wednesday: 3,
  th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fr: 5, fri: 5, friday: 5,
  sa: 6, sat: 6, saturday: 6,
};

/** "Mon, Wed, Fri" / "MO WE FR" / "1,3,5" (0 = Sunday) → [1, 3, 5]. */
export function parseWeekdays(input: string): number[] {
  const out = new Set<number>();
  for (const token of input.toLowerCase().split(/[\s,;/|&+]+/).filter(Boolean)) {
    if (/^[0-6]$/.test(token)) out.add(Number(token));
    else if (token in DAY_NAMES) out.add(DAY_NAMES[token]);
  }
  return [...out].sort((a, b) => a - b);
}

export function parseGender(input: string): 'male' | 'female' | 'other' | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return undefined;
  if (['m', 'male', 'boy', 'b'].includes(s)) return 'male';
  if (['f', 'female', 'girl', 'g'].includes(s)) return 'female';
  return 'other';
}

export function parseStaffRole(input: string): Exclude<Role, 'parent' | 'platform_admin'> {
  const s = input.trim().toLowerCase();
  if (/admin|principal|head/.test(s)) return 'school_admin';
  if (/coord|lead|supervisor/.test(s)) return 'coordinator';
  return 'therapist';
}

export function splitList(input: string): string[] {
  return input
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
