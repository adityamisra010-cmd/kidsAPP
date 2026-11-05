/**
 * Slot validation for reschedule proposals, make-ups and time changes:
 * must be in the future, on a school day, not a holiday and within working hours.
 */
import type { ClockTime, ISODate, ISODateTime, OrgSettings } from '@/domain/types';
import { clockTime, combineDateTime, parse, toISODate } from '@/lib/dates';

export interface Slot {
  date?: ISODate;
  time?: ClockTime;
}

export type SlotError = 'missing' | 'past' | 'holiday' | 'closed_day' | 'outside_hours' | 'duplicate';

export function toMinutes(time: ClockTime): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): ClockTime {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Weekday of a local date, 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: ISODate): number {
  return parse(date).getDay();
}

/**
 * The latest start time that still lets a session of `durationMinutes` end within working
 * hours. Used as the `end` of TimeField so impossible times are never offered.
 */
export function latestStart(workingHours: OrgSettings['workingHours'], durationMinutes: number): ClockTime {
  const latest = toMinutes(workingHours.end) - durationMinutes;
  return fromMinutes(Math.max(toMinutes(workingHours.start), latest - (latest % 15)));
}

export function validateSlot(
  slot: Slot,
  opts: {
    now: Date;
    workingHours: OrgSettings['workingHours'];
    holidays: OrgSettings['holidays'];
    durationMinutes: number;
  },
): SlotError | null {
  if (!slot.date || !slot.time) return 'missing';
  if (parse(combineDateTime(slot.date, slot.time)).getTime() <= opts.now.getTime()) return 'past';
  if (opts.holidays.some((h) => h.date === slot.date)) return 'holiday';
  if (!opts.workingHours.days.includes(weekdayOf(slot.date))) return 'closed_day';
  const start = toMinutes(slot.time);
  if (start < toMinutes(opts.workingHours.start) || start + opts.durationMinutes > toMinutes(opts.workingHours.end)) {
    return 'outside_hours';
  }
  return null;
}

/** Validates up to two proposed slots; the second must differ from the first. */
export function validateSlots(slots: Slot[], opts: Parameters<typeof validateSlot>[1]): (SlotError | null)[] {
  return slots.map((s, i) => {
    const err = validateSlot(s, opts);
    if (err) return err;
    const dup = slots.slice(0, i).some((p) => p.date === s.date && p.time === s.time);
    return dup ? 'duplicate' : null;
  });
}

export function slotToISO(slot: Required<Slot>): ISODateTime {
  return combineDateTime(slot.date, slot.time);
}

export function isoToSlot(value: ISODateTime): Required<Slot> {
  return { date: toISODate(parse(value)), time: clockTime(value) };
}

export function durationMinutes(startsAt: ISODateTime, endsAt: ISODateTime): number {
  return Math.round((parse(endsAt).getTime() - parse(startsAt).getTime()) / 60_000);
}

/** End timestamp for a start + duration. */
export function addMinutesISO(start: ISODateTime, minutes: number): ISODateTime {
  return new Date(parse(start).getTime() + minutes * 60_000).toISOString();
}
