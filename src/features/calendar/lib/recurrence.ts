/** Weekly recurrence helpers: RRULE BYDAY parsing, series inference, summary text and counts. */
import { addDays } from 'date-fns';

import type { ISODate, ISODateTime } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** Monday-first order, Sunday last (Indian school week). */
export function sortWeekdays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** `FREQ=WEEKLY;BYDAY=MO,WE,FR` → [1, 3, 5]. Unknown tokens are ignored. */
export function weekdaysFromRRule(rrule: string): number[] {
  const match = /BYDAY=([^;]+)/i.exec(rrule);
  if (!match) return [];
  const days = match[1]
    .split(',')
    .map((tok) => BYDAY.indexOf(tok.trim().slice(-2).toUpperCase() as (typeof BYDAY)[number]))
    .filter((d) => d >= 0);
  return sortWeekdays(days);
}

export function weekdaysToRRule(weekdays: number[]): string {
  return `FREQ=WEEKLY;BYDAY=${sortWeekdays(weekdays)
    .map((d) => BYDAY[d])
    .join(',')}`;
}

/**
 * The repository exposes `seriesId` but not the series itself, so the detail screen infers the
 * weekdays from sibling occurrences fetched around the appointment.
 */
export function inferSeriesWeekdays(appointments: { seriesId?: string; startsAt: ISODateTime }[], seriesId: string): number[] {
  return sortWeekdays(appointments.filter((a) => a.seriesId === seriesId).map((a) => parse(a.startsAt).getDay()));
}

/** "Mon · Wed · Fri" from weekday numbers and translated short names (index 0 = Sunday). */
export function formatWeekdayList(weekdays: number[], shortNames: string[], separator = ' · '): string {
  return sortWeekdays(weekdays)
    .map((d) => shortNames[d])
    .join(separator);
}

/** Every date between start and end (inclusive) that falls on one of the weekdays. */
export function occurrenceDates(weekdays: number[], startDate: ISODate, endDate: ISODate): ISODate[] {
  if (!weekdays.length || endDate < startDate) return [];
  const out: ISODate[] = [];
  const end = parse(endDate);
  for (let d = parse(startDate); d <= end; d = addDays(d, 1)) {
    if (weekdays.includes(d.getDay())) out.push(toISODate(d));
  }
  return out;
}

export function countOccurrences(weekdays: number[], startDate: ISODate, endDate: ISODate): number {
  return occurrenceDates(weekdays, startDate, endDate).length;
}
