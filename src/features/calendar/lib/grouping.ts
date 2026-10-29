/** Grouping and splitting appointment lists for agenda and list views. */
import { addDays, isSameDay } from 'date-fns';

import type { ISODate, ISODateTime } from '@/domain/types';
import { formatDay, parse, toISODate } from '@/lib/dates';

export interface DayGroup<T> {
  date: ISODate;
  items: T[];
}

type Timed = { startsAt: ISODateTime; endsAt: ISODateTime };

/** Local school date of a timestamp. */
export function localDate(value: ISODateTime): ISODate {
  return toISODate(parse(value));
}

/**
 * Groups by local day. `asc`: earliest day first, earliest session first (upcoming).
 * `desc`: most recent day first, but sessions within a day stay in time order (past).
 */
export function groupByDay<T extends Timed>(items: T[], order: 'asc' | 'desc' = 'asc'): DayGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const map = new Map<ISODate, T[]>();
  for (const item of sorted) {
    const d = localDate(item.startsAt);
    const list = map.get(d);
    if (list) list.push(item);
    else map.set(d, [item]);
  }
  const groups = [...map.entries()].map(([date, list]) => ({ date, items: list }));
  return order === 'asc' ? groups : groups.reverse();
}

/** Items on one local day, in time order. */
export function itemsOnDay<T extends Timed>(items: T[], day: ISODate): T[] {
  return items.filter((i) => localDate(i.startsAt) === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Upcoming = not finished yet (in progress counts as upcoming). Past = finished. */
export function splitUpcomingPast<T extends Timed>(items: T[], now: Date): { upcoming: T[]; past: T[] } {
  const nowIso = now.toISOString();
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const i of items) (parse(i.endsAt).toISOString() > nowIso ? upcoming : past).push(i);
  return { upcoming, past };
}

/** "Today", "Tomorrow", "Yesterday" or "Mon, 24 May". */
export function dayHeading(
  day: ISODate,
  now: Date,
  words: { today: string; tomorrow: string; yesterday: string },
): string {
  const d = parse(day);
  if (isSameDay(d, now)) return words.today;
  if (isSameDay(d, addDays(now, 1))) return words.tomorrow;
  if (isSameDay(d, addDays(now, -1))) return words.yesterday;
  return formatDay(d);
}

/** "24 May" (the localised day + month part of formatDay, without the weekday). */
export function dayMonth(value: ISODate | ISODateTime): string {
  const full = formatDay(value);
  const i = full.indexOf(', ');
  return i >= 0 ? full.slice(i + 2) : full;
}
