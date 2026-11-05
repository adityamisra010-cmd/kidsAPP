/** Small appointment helpers used by the schedule scenarios. */
import { makeOccurrence, isCancelled } from '@/domain/derive';
import type { Appointment, ISODate, UUID } from '@/domain/types';
import { stableId } from '@/lib/id';
import { parse, toISODate } from '@/lib/dates';

import { at, ids, type Build, type SchoolKey } from './context';

const dateCache = new Map<string, ISODate>();
/** Local calendar date of an appointment (memoised: called for every row in many filters). */
export function apptDate(a: Pick<Appointment, 'startsAt'>): ISODate {
  let d = dateCache.get(a.startsAt);
  if (d == null) {
    d = toISODate(parse(a.startsAt));
    dateCache.set(a.startsAt, d);
  }
  return d;
}

const overlaps = (a: Pick<Appointment, 'startsAt' | 'endsAt'>, startsAt: string, endsAt: string) =>
  Date.parse(a.startsAt) < Date.parse(endsAt) && Date.parse(startsAt) < Date.parse(a.endsAt);

/** No live appointment for this therapist/child overlaps the slot. */
export function isFree(b: Build, who: { therapistId?: UUID; childId?: UUID }, startsAt: string, endsAt: string, excludeId?: UUID): boolean {
  return !b.store.appointments.some(
    (a) =>
      a.id !== excludeId &&
      !isCancelled(a) &&
      ((who.therapistId && a.therapistId === who.therapistId) || (who.childId && a.childId === who.childId)) &&
      overlaps(a, startsAt, endsAt),
  );
}

export function onDate(b: Build, date: ISODate, pred: (a: Appointment) => boolean = () => true): Appointment[] {
  return b.store.appointments
    .filter((a) => apptDate(a) === date && pred(a))
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

export function oneOff(
  b: Build,
  s: SchoolKey,
  input: { child: string; therapist: string; type: string; date: ISODate; time: string; tag: string; room?: string; makeupOfId?: UUID },
): Appointment {
  const occ = makeOccurrence(input.date, input.time, 45);
  const appt: Appointment = {
    id: ids.appointment(`oneoff:${s}:${input.child}:${input.type}:${input.tag}`, input.date),
    organizationId: ids.org(s),
    childId: ids.child(s, input.child),
    therapistId: ids.staff(s, input.therapist),
    therapyTypeId: ids.therapyType(s, input.type),
    startsAt: occ.startsAt,
    endsAt: occ.endsAt,
    room: input.room,
    status: 'scheduled',
    makeupOfId: input.makeupOfId,
    wasRescheduled: false,
    createdAt: at(b, -3, '12:15'),
  };
  b.store.appointments.push(appt);
  return appt;
}

export function cancelBySchool(a: Appointment, reason: string): void {
  a.status = 'cancelled';
  a.attendance = 'cancelled_by_school';
  a.cancelReason = reason;
}

/** Hand the appointment to the first qualified, free colleague; returns false when nobody is free. */
export function reassign(b: Build, a: Appointment, candidates: UUID[]): boolean {
  for (const userId of candidates) {
    const qualified = b.store.qualifications.some((q) => q.userId === userId && q.therapyTypeId === a.therapyTypeId);
    if (!qualified || userId === a.therapistId) continue;
    if (!isFree(b, { therapistId: userId }, a.startsAt, a.endsAt, a.id)) continue;
    a.originalTherapistId = a.therapistId;
    a.therapistId = userId;
    return true;
  }
  return false;
}

export function addLeave(b: Build, s: SchoolKey, staffKey: string, from: ISODate, to: ISODate, reason: string): void {
  b.store.unavailability.push({
    id: stableId(`leave:${s}:${staffKey}:${from}`),
    organizationId: ids.org(s),
    userId: ids.staff(s, staffKey),
    from,
    to,
    reason,
    createdAt: at(b, -5, '10:00'),
  });
}

/** Most recent date with the given weekday on or before `offset` days from today. */
export function weekdayOnOrBefore(b: Build, offset: number, weekday: number): number {
  let o = offset;
  while (parse(at(b, o, '12:00')).getDay() !== weekday) o--;
  return o;
}

export function staffIds(b: Build, s: SchoolKey, keys: string[]): UUID[] {
  return keys.map((k) => ids.staff(s, k));
}
