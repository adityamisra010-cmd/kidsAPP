/**
 * Date ranges the calendar fetches for each view. Weeks start on Monday (Indian schools).
 * All functions are pure: pass `now` explicitly so they are testable.
 */
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import type { ISODate, ISODateTime } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';

export type CalendarView = 'month' | 'week' | 'list';
export type ListTab = 'upcoming' | 'past';

export interface DateRange {
  from: ISODateTime;
  to: ISODateTime;
}

const WEEK = { weekStartsOn: 1 } as const;

/** First day (yyyy-MM-01) of the month containing `day`. */
export function monthKey(day: ISODate | Date): ISODate {
  return toISODate(startOfMonth(parse(day)));
}

export function shiftMonth(month: ISODate, by: number): ISODate {
  return toISODate(startOfMonth(addMonths(parse(month), by)));
}

/**
 * The whole visible month grid (Mon-first weeks), so dots on the leading/trailing days of the
 * neighbouring months are filled too.
 */
export function monthGridRange(month: ISODate): DateRange {
  const d = parse(month);
  return {
    from: startOfWeek(startOfMonth(d), WEEK).toISOString(),
    to: endOfWeek(endOfMonth(d), WEEK).toISOString(),
  };
}

/** Monday..Sunday of the week containing `day`. */
export function weekDays(day: ISODate): ISODate[] {
  const start = startOfWeek(parse(day), WEEK);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
}

export function weekRange(day: ISODate): DateRange {
  const d = parse(day);
  return { from: startOfWeek(d, WEEK).toISOString(), to: endOfWeek(d, WEEK).toISOString() };
}

export function shiftWeek(day: ISODate, by: number): ISODate {
  return toISODate(addWeeks(parse(day), by));
}

/**
 * List view windows. Upcoming starts at the beginning of today (so sessions in progress stay
 * visible); past ends now. `weeks` grows when the user taps "Show more".
 */
export function listRange(tab: ListTab, now: Date, weeks: number): DateRange {
  if (tab === 'upcoming') {
    return { from: startOfDay(now).toISOString(), to: endOfDay(addWeeks(now, weeks)).toISOString() };
  }
  return { from: startOfDay(addWeeks(now, -weeks)).toISOString(), to: now.toISOString() };
}

export interface ViewState {
  view: CalendarView;
  /** First day of the month shown in Month view. */
  month: ISODate;
  /** Selected day in Month and Week views. */
  selectedDay: ISODate;
  tab: ListTab;
  /** List window size in weeks. */
  listWeeks: number;
}

/** The range to fetch for the current view. */
export function rangeForView(state: ViewState, now: Date): DateRange {
  switch (state.view) {
    case 'month':
      return monthGridRange(state.month);
    case 'week':
      return weekRange(state.selectedDay);
    case 'list':
      return listRange(state.tab, now, state.listWeeks);
  }
}
