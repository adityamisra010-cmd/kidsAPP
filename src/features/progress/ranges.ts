/** Date range presets for the staff progress screen. */
import { subMonths, subWeeks } from 'date-fns';

import type { ISODate } from '@/domain/types';
import { toISODate } from '@/lib/dates';

export type RangePreset = '4w' | '3m' | '6m' | 'all';
export const RANGE_PRESETS: RangePreset[] = ['4w', '3m', '6m', 'all'];

export function rangeForPreset(preset: RangePreset, today: Date = new Date()): { from?: ISODate; to?: ISODate } {
  const to = toISODate(today);
  switch (preset) {
    case '4w':
      return { from: toISODate(subWeeks(today, 4)), to };
    case '3m':
      return { from: toISODate(subMonths(today, 3)), to };
    case '6m':
      return { from: toISODate(subMonths(today, 6)), to };
    case 'all':
      return {};
  }
}
