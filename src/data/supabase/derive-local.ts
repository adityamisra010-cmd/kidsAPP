/**
 * Pure helpers the Supabase adapter needs to derive view fields (AppointmentView status, series
 * expansion, conflicts, progress aggregates). Local stand-in for src/domain/derive.ts (owned by
 * the Demo adapter); the two will be reconciled. No I/O, no React, no supabase-js.
 *
 * Time zone: every school is in India (IST, UTC+05:30, no DST), matching app.tz() in SQL.
 */
import { masteryMet, mean, round } from '@/domain/metrics';
import type {
  Appointment,
  AppointmentDisplayStatus,
  AttendanceSummary,
  ClockTime,
  Conflict,
  GoalTrial,
  ISODate,
  ISODateTime,
  LogState,
  MasteryRule,
  OrgSettings,
  PromptLevel,
  SessionSummary,
  WeeklyCompletion,
} from '@/domain/types';

// ---------------------------------------------------------------------------
// Dates (IST)
// ---------------------------------------------------------------------------
const IST_OFFSET_MS = 330 * 60_000;
export const IST_SUFFIX = '+05:30';
const DAY_MS = 86_400_000;

function ms(ts: ISODateTime | Date): number {
  return ts instanceof Date ? ts.getTime() : Date.parse(ts);
}

/** School-local (IST) calendar date of a timestamp. */
export function istDate(ts: ISODateTime | Date): ISODate {
  return new Date(ms(ts) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** School-local (IST) wall-clock time of a timestamp, `HH:mm`. */
export function istTime(ts: ISODateTime | Date): ClockTime {
  return new Date(ms(ts) + IST_OFFSET_MS).toISOString().slice(11, 16);
}

export function todayIST(now: Date = new Date()): ISODate {
  return istDate(now);
}

/** `yyyy-MM-ddTHH:mm:00+05:30` for a school-local date and time. */
export function istDateTime(date: ISODate, time: ClockTime): ISODateTime {
  return `${date}T${toClock(time)}:00${IST_SUFFIX}`;
}

/** Start (inclusive) and end (exclusive) of a school-local day. */
export function istDayBounds(date: ISODate): { start: ISODateTime; end: ISODateTime } {
  return { start: istDateTime(date, '00:00'), end: istDateTime(addDays(date, 1), '00:00') };
}

export function addDays(date: ISODate, n: number): ISODate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function addMinutes(ts: ISODateTime, minutes: number): ISODateTime {
  return new Date(ms(ts) + minutes * 60_000).toISOString();
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Monday of the week containing `date` (Indian schools start the week on Monday). */
export function weekStartOf(date: ISODate): ISODate {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** `10:30:00` → `10:30`. */
export function toClock(time: string): ClockTime {
  return time.slice(0, 5);
}

export function minutesOfDay(time: ClockTime): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesBetween(a: ISODateTime, b: ISODateTime): number {
  return Math.round((ms(b) - ms(a)) / 60_000);
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
type ApptStatusFields = Pick<Appointment, 'status' | 'attendance' | 'therapistId' | 'originalTherapistId' | 'wasRescheduled' | 'makeupOfId'>;

/** What the status chip says. Most important first: cancelled > absent > completed > substitute … */
export function displayStatus(a: ApptStatusFields): AppointmentDisplayStatus {
  if (a.status === 'cancelled' || a.attendance === 'cancelled_by_school' || a.attendance === 'cancelled_by_parent') return 'cancelled';
  if (a.attendance === 'absent') return 'absent';
  if (a.status === 'completed') return 'completed';
  if (a.originalTherapistId && a.originalTherapistId !== a.therapistId) return 'substitute';
  if (a.wasRescheduled) return 'rescheduled';
  if (a.makeupOfId) return 'makeup';
  return 'confirmed';
}

/** Logging state from the therapist's point of view. */
export function logState(
  a: Pick<Appointment, 'status' | 'attendance' | 'startsAt' | 'endsAt'>,
  hasSession: boolean,
  now: Date = new Date(),
): LogState {
  if (hasSession) return 'logged';
  if (a.status === 'cancelled' || (a.attendance && a.attendance !== 'present' && a.attendance !== 'late')) return 'not_applicable';
  const t = now.getTime();
  if (t < ms(a.startsAt)) return 'upcoming';
  if (t <= ms(a.endsAt)) return 'in_progress';
  return 'not_logged';
}

export interface AssignmentLite {
  childId: string;
  userId: string;
  activeFrom: ISODate;
  activeTo?: ISODate | null;
}

export function assignmentActiveOn(a: AssignmentLite, date: ISODate): boolean {
  return a.activeFrom <= date && (!a.activeTo || a.activeTo >= date);
}

/** Mirrors app.is_substitute_for(): replaced therapist, or therapist not assigned to the child that day. */
export function isSubstitute(
  a: Pick<Appointment, 'childId' | 'therapistId' | 'originalTherapistId' | 'startsAt'>,
  assignments: AssignmentLite[],
): boolean {
  if (a.originalTherapistId && a.originalTherapistId !== a.therapistId) return true;
  const day = istDate(a.startsAt);
  return !assignments.some((x) => x.childId === a.childId && x.userId === a.therapistId && assignmentActiveOn(x, day));
}

// ---------------------------------------------------------------------------
// Recurring series
// ---------------------------------------------------------------------------
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** `FREQ=WEEKLY;BYDAY=MO,WE,FR` (Monday-first, no DTSTART; dates live on the series row). */
export function buildRrule(weekdays: number[]): string {
  const days = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return `FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(',')}`;
}

export function rruleWeekdays(rrule: string): number[] {
  const m = /BYDAY=([A-Z,]+)/.exec(rrule.toUpperCase());
  if (!m) return [];
  return m[1]
    .split(',')
    .map((code) => BYDAY.indexOf(code.slice(-2)))
    .filter((d) => d >= 0);
}

export interface Occurrence {
  date: ISODate;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}

export const MAX_OCCURRENCES = 800;

/** Every date in [startDate, endDate] whose weekday is selected, at startTime IST. */
export function expandSeries(input: {
  weekdays: number[];
  startDate: ISODate;
  endDate: ISODate;
  startTime: ClockTime;
  durationMinutes: number;
}): Occurrence[] {
  const days = new Set(input.weekdays);
  const out: Occurrence[] = [];
  for (let d = input.startDate; d <= input.endDate && out.length < MAX_OCCURRENCES; d = addDays(d, 1)) {
    if (!days.has(weekdayOf(d))) continue;
    const startsAt = istDateTime(d, input.startTime);
    out.push({ date: d, startsAt, endsAt: addMinutes(startsAt, input.durationMinutes) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------
export interface BookedSlot {
  id: string;
  childId: string;
  therapistId: string;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  status: Appointment['status'];
}

export function overlaps(a: { startsAt: ISODateTime; endsAt: ISODateTime }, b: { startsAt: ISODateTime; endsAt: ISODateTime }): boolean {
  return ms(a.startsAt) < ms(b.endsAt) && ms(a.endsAt) > ms(b.startsAt);
}

export function findConflicts(input: {
  occurrences: Occurrence[];
  therapistId: string;
  childId: string;
  existing: BookedSlot[];
  unavailability: { from: ISODate; to: ISODate; reason: string }[];
  settings: Pick<OrgSettings, 'holidays' | 'workingHours'>;
  excludeIds?: string[];
}): Conflict[] {
  const exclude = new Set(input.excludeIds ?? []);
  const live = input.existing.filter((x) => x.status !== 'cancelled' && !exclude.has(x.id));
  const holidays = new Map(input.settings.holidays.map((h) => [h.date, h.label]));
  const wh = input.settings.workingHours;
  const out: Conflict[] = [];
  for (const o of input.occurrences) {
    const holiday = holidays.get(o.date);
    if (holiday != null) out.push({ kind: 'holiday', date: o.date, message: `Holiday: ${holiday}` });
    const start = minutesOfDay(istTime(o.startsAt));
    const end = start + minutesBetween(o.startsAt, o.endsAt);
    if (!wh.days.includes(weekdayOf(o.date)) || start < minutesOfDay(wh.start) || end > minutesOfDay(wh.end)) {
      out.push({ kind: 'outside_hours', date: o.date, message: `Outside working hours (${wh.start}–${wh.end})` });
    }
    const away = input.unavailability.find((u) => u.from <= o.date && u.to >= o.date);
    if (away) out.push({ kind: 'therapist_unavailable', date: o.date, message: away.reason ? `Therapist unavailable: ${away.reason}` : 'Therapist unavailable' });
    for (const x of live) {
      if (!overlaps(o, x)) continue;
      if (x.therapistId === input.therapistId) {
        out.push({ kind: 'therapist_double_booked', date: o.date, message: `Therapist already booked at ${istTime(x.startsAt)}`, appointmentId: x.id });
      } else if (x.childId === input.childId) {
        out.push({ kind: 'child_double_booked', date: o.date, message: `Child already booked at ${istTime(x.startsAt)}`, appointmentId: x.id });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregates for progress, reports and dashboards
// ---------------------------------------------------------------------------
export function attendanceSummary(appts: Pick<Appointment, 'status' | 'attendance'>[]): AttendanceSummary {
  const s: AttendanceSummary = { scheduled: appts.length, attended: 0, late: 0, absent: 0, cancelledBySchool: 0, cancelledByParent: 0 };
  for (const a of appts) {
    if (a.attendance === 'late') {
      s.late++;
      s.attended++;
    } else if (a.attendance === 'present' || (!a.attendance && a.status === 'completed')) s.attended++;
    else if (a.attendance === 'absent') s.absent++;
    else if (a.attendance === 'cancelled_by_parent') s.cancelledByParent++;
    else if (a.attendance === 'cancelled_by_school' || a.status === 'cancelled') s.cancelledBySchool++;
  }
  return s;
}

/** Trial stats of one goal; `trials` ordered oldest → newest. */
export function goalStats(
  goal: { status: string; masteryRule: MasteryRule },
  trials: Pick<GoalTrial, 'attempted' | 'successful' | 'promptLevel'>[],
): { lastAccuracy?: number; lastPromptLevel?: PromptLevel; sessionsTracked: number; masterySuggested: boolean } {
  const attempted = trials.filter((t) => t.attempted > 0);
  const accuracies = attempted.map((t) => round((Math.min(t.successful, t.attempted) / t.attempted) * 100));
  const last = attempted[attempted.length - 1];
  return {
    lastAccuracy: accuracies.length ? accuracies[accuracies.length - 1] : undefined,
    lastPromptLevel: last?.promptLevel,
    sessionsTracked: attempted.length,
    masterySuggested: goal.status !== 'mastered' && goal.status !== 'maintenance' && masteryMet(accuracies, goal.masteryRule),
  };
}

/** Average rating per dimension over the (up to) 4 sessions before the latest; oldest → newest input. */
export function fourSessionAverage(sessions: Pick<SessionSummary, 'ratings'>[]): Record<string, number> {
  const pool = sessions.slice(Math.max(0, sessions.length - 5), Math.max(0, sessions.length - 1));
  const keys = new Set(pool.flatMap((s) => Object.keys(s.ratings)));
  const out: Record<string, number> = {};
  for (const k of keys) {
    const avg = mean(pool.map((s) => s.ratings[k]).filter((v): v is NonNullable<typeof v> => v != null));
    if (avg != null) out[k] = round(avg, 2);
  }
  return out;
}

export function incidentsByWeek(sessions: Pick<SessionSummary, 'date' | 'incidentCount'>[]): { weekStart: ISODate; count: number }[] {
  const byWeek = new Map<ISODate, number>();
  for (const s of sessions) {
    const w = weekStartOf(s.date);
    byWeek.set(w, (byWeek.get(w) ?? 0) + s.incidentCount);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, count]) => ({ weekStart, count }));
}

export function substituteImpact(
  sessions: Pick<SessionSummary, 'isSubstitute' | 'sessionScore'>[],
): { regularAvg: number; substituteAvg: number; substituteCount: number } | undefined {
  const sub = sessions.filter((s) => s.isSubstitute).map((s) => s.sessionScore);
  const reg = sessions.filter((s) => !s.isSubstitute).map((s) => s.sessionScore);
  if (sub.length === 0 || reg.length === 0) return undefined;
  return { regularAvg: round(mean(reg)!), substituteAvg: round(mean(sub)!), substituteCount: sub.length };
}

/** Home practice completion: done counts 1, partly 0.5, against the weekly frequency of active tasks. */
export function completionPercent(expected: number, done: number, partly: number): number {
  if (expected <= 0) return 0;
  return Math.min(100, Math.round(((done + 0.5 * partly) / expected) * 100));
}

export function weeklyCompletion(
  childId: string,
  weekStart: ISODate,
  tasks: { frequencyPerWeek: number; activeFrom: ISODate; activeTo: ISODate; status: string }[],
  logs: { outcome: string; createdAt: ISODateTime }[],
): WeeklyCompletion {
  const weekEnd = addDays(weekStart, 6);
  const expected = tasks
    .filter((t) => t.status !== 'archived' && t.activeFrom <= weekEnd && t.activeTo >= weekStart)
    .reduce((s, t) => s + t.frequencyPerWeek, 0);
  const inWeek = logs.filter((l) => {
    const d = istDate(l.createdAt);
    return d >= weekStart && d <= weekEnd;
  });
  const done = inWeek.filter((l) => l.outcome === 'done').length;
  const partly = inWeek.filter((l) => l.outcome === 'partly').length;
  return { childId, weekStart, expected, done, partly, percent: completionPercent(expected, done, partly) };
}

/** Completion over an arbitrary date range (weeks pro-rated by the days each task was active). */
export function rangeCompletion(
  from: ISODate,
  to: ISODate,
  tasks: { frequencyPerWeek: number; activeFrom: ISODate; activeTo: ISODate; status: string }[],
  logs: { outcome: string; createdAt: ISODateTime }[],
): number {
  let expected = 0;
  for (const t of tasks) {
    if (t.status === 'archived') continue;
    const start = t.activeFrom > from ? t.activeFrom : from;
    const end = t.activeTo < to ? t.activeTo : to;
    if (end < start) continue;
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
    expected += (t.frequencyPerWeek * days) / 7;
  }
  const inRange = logs.filter((l) => {
    const d = istDate(l.createdAt);
    return d >= from && d <= to;
  });
  const done = inRange.filter((l) => l.outcome === 'done').length;
  const partly = inRange.filter((l) => l.outcome === 'partly').length;
  return completionPercent(expected, done, partly);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
/** Unique values, first occurrence wins. */
export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

export function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/** Mirrors app.normalize_phone(): Indian 10-digit numbers get +91; everything else becomes +digits. */
export function normalizePhone(input: string | null | undefined): string | undefined {
  const digits = (input ?? '').replace(/\D+/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

/** Name key for natural-key matching (case- and whitespace-insensitive). */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
