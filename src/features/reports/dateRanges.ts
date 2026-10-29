/** Date range presets for reports and exports (all dates yyyy-MM-dd, local school time). */
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';

import type { ISODate } from '@/domain/types';
import { toISODate } from '@/lib/dates';

export type RangePreset = 'this_month' | 'last_month' | 'last_3_months' | 'custom';

export const RANGE_PRESETS: RangePreset[] = ['this_month', 'last_month', 'last_3_months', 'custom'];

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

/** "This month" runs to today; "Last 3 months" is this month and the two before it. */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date = new Date()): DateRange {
  switch (preset) {
    case 'this_month':
      return { from: toISODate(startOfMonth(today)), to: toISODate(today) };
    case 'last_month': {
      const prev = subMonths(today, 1);
      return { from: toISODate(startOfMonth(prev)), to: toISODate(endOfMonth(prev)) };
    }
    case 'last_3_months':
      return { from: toISODate(startOfMonth(subMonths(today, 2))), to: toISODate(today) };
  }
}

export function isValidRange(r: Partial<DateRange>): r is DateRange {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return !!r.from && !!r.to && iso.test(r.from) && iso.test(r.to) && r.from <= r.to;
}

/** Which preset (if any) a range corresponds to, so a deep link shows the right chip. */
export function matchPreset(r: DateRange, today: Date = new Date()): RangePreset {
  for (const p of ['this_month', 'last_month', 'last_3_months'] as const) {
    const pr = presetRange(p, today);
    if (pr.from === r.from && pr.to === r.to) return p;
  }
  return 'custom';
}
