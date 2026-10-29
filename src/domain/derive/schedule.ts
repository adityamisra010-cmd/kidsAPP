/** Weekly series expansion, RRULE helpers and conflict detection. */
import { addDays, getDay } from 'date-fns';

import { clockTime, combineDateTime, formatDay, parse, toISODate } from '@/lib/dates';

import { isCancelled } from './appointments';
import type {
  Appointment,
  Conflict,
  ISODate,
  ISODateTime,
  OrgSettings,
  SeriesInput,
  TherapistUnavailability,
  UUID,
} from '../types';

/** Epoch ms of a full ISO timestamp (native parsing; these always carry an offset). */
const ms = (iso: ISODateTime) => Date.parse(iso);

export interface Occurrence {
  date: ISODate;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}

const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function weekdaysToRrule(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => RRULE_DAYS[d]);
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
}

export function rruleToWeekdays(rrule: string): number[] {
  const m = /BYDAY=([A-Z,]+)/.exec(rrule);
  if (!m) return [];
  return m[1].split(',').map((d) => RRULE_DAYS.indexOf(d)).filter((d) => d >= 0);
}

export function makeOccurrence(date: ISODate, startTime: string, durationMinutes: number): Occurrence {
  const startsAt = combineDateTime(date, startTime);
  const endsAt = new Date(parse(startsAt).getTime() + durationMinutes * 60_000).toISOString();
  return { date, startsAt, endsAt };
}

/** Expands weekly weekdays between startDate and endDate (inclusive), skipping `skipDates`. */
export function expandSeries(
  input: Pick<SeriesInput, 'weekdays' | 'startTime' | 'durationMinutes' | 'startDate' | 'endDate'>,
  skipDates: Set<ISODate> = new Set(),
): Occurrence[] {
  const out: Occurrence[] = [];
  const wanted = new Set(input.weekdays);
  for (let d = parse(input.startDate); toISODate(d) <= input.endDate; d = addDays(d, 1)) {
    const iso = toISODate(d);
    if (wanted.has(getDay(d)) && !skipDates.has(iso)) out.push(makeOccurrence(iso, input.startTime, input.durationMinutes));
  }
  return out;
}

export interface ConflictInput {
  occurrences: Occurrence[];
  childId: UUID;
  therapistId: UUID;
  existing: Pick<Appointment, 'id' | 'childId' | 'therapistId' | 'startsAt' | 'endsAt' | 'status' | 'attendance'>[];
  unavailability: Pick<TherapistUnavailability, 'userId' | 'from' | 'to' | 'reason'>[];
  settings: Pick<OrgSettings, 'workingHours' | 'holidays'>;
  excludeAppointmentIds?: UUID[];
  names?: { therapist?: string; child?: string };
}

const overlaps = (a: Occurrence, b: Pick<Appointment, 'startsAt' | 'endsAt'>) =>
  ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);

/** Every problem with booking these occurrences; empty when safe to save. */
export function detectConflicts(i: ConflictInput): Conflict[] {
  const out: Conflict[] = [];
  const exclude = new Set(i.excludeAppointmentIds ?? []);
  const live = i.existing.filter((e) => !exclude.has(e.id) && !isCancelled(e));
  const therapist = i.names?.therapist ?? 'Therapist';
  const child = i.names?.child ?? 'Child';
  const wh = i.settings.workingHours;
  for (const o of i.occurrences) {
    const time = `${clockTime(o.startsAt)}–${clockTime(o.endsAt)}`;
    for (const e of live) {
      if (!overlaps(o, e)) continue;
      if (e.therapistId === i.therapistId) {
        out.push({ kind: 'therapist_double_booked', date: o.date, appointmentId: e.id, message: `${therapist} is already booked at ${clockTime(e.startsAt)} on ${formatDay(o.date)}` });
      }
      if (e.childId === i.childId) {
        out.push({ kind: 'child_double_booked', date: o.date, appointmentId: e.id, message: `${child} already has a session at ${clockTime(e.startsAt)} on ${o.date}` });
      }
    }
    const leave = i.unavailability.find((u) => u.userId === i.therapistId && u.from <= o.date && u.to >= o.date);
    if (leave) out.push({ kind: 'therapist_unavailable', date: o.date, message: `${therapist} is unavailable on ${o.date} (${leave.reason})` });
    const holiday = i.settings.holidays.find((h) => h.date === o.date);
    if (holiday) out.push({ kind: 'holiday', date: o.date, message: `${o.date} is a holiday (${holiday.label})` });
    if (!wh.days.includes(getDay(parse(o.date)))) {
      out.push({ kind: 'outside_hours', date: o.date, message: `The centre is closed on this weekday (${o.date})` });
    } else if (clockTime(o.startsAt) < wh.start || clockTime(o.endsAt) > wh.end) {
      out.push({ kind: 'outside_hours', date: o.date, message: `${time} is outside working hours (${wh.start}–${wh.end})` });
    }
  }
  return out;
}
