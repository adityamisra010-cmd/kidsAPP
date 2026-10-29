/**
 * Pure derivations shared by the Demo and Supabase adapters: display status, Handover Brief chips,
 * parent snapshots, goal stats, attendance, home-practice completion, series expansion, conflict
 * detection and parent progress. No adapter state, no I/O; callers pass in the rows they loaded.
 */
import { addDays, getDay } from 'date-fns';

import { addDaysISO, clockTime, combineDateTime, parse, toISODate, weekStart } from '@/lib/dates';

import { PARENT_HIGHLIGHT_KEYS } from './constants';
import { dimensionChange, masteryMet, mean, normalise, overallChange, round, trend, trialAccuracy } from './metrics';
import type { PreviousSession } from './metrics';
import type {
  Appointment,
  AppointmentDisplayStatus,
  AppointmentView,
  AttendanceSummary,
  Child,
  Conflict,
  Goal,
  GoalDomain,
  GoalProgressPoint,
  GoalTrial,
  GoalWithStats,
  HomeLog,
  HomeTask,
  ISODate,
  ISODateTime,
  LogState,
  OrgSettings,
  ParentProgress,
  ParentSessionSnapshot,
  Profile,
  ProgressPeriod,
  RatingDimension,
  SeriesInput,
  SessionLog,
  SessionSummary,
  TherapistUnavailability,
  TherapyType,
  UUID,
  WeeklyCompletion,
} from './types';

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

type ApptState = Pick<Appointment, 'status' | 'attendance'>;

export function isCancelled(a: ApptState): boolean {
  return a.status === 'cancelled' || a.attendance === 'cancelled_by_school' || a.attendance === 'cancelled_by_parent';
}

export function isAttended(a: ApptState): boolean {
  return a.attendance === 'present' || a.attendance === 'late';
}

/** Cancelled or absent: no session can be logged. */
export function isMissed(a: ApptState): boolean {
  return isCancelled(a) || a.attendance === 'absent';
}

const ms = (iso: ISODateTime) => parse(iso).getTime();

export function appointmentDisplayStatus(a: Appointment, now: Date): AppointmentDisplayStatus {
  if (isCancelled(a)) return 'cancelled';
  if (a.attendance === 'absent') return 'absent';
  if (a.status === 'completed' || (isAttended(a) && ms(a.endsAt) <= now.getTime())) return 'completed';
  if (a.makeupOfId) return 'makeup';
  if (a.originalTherapistId) return 'substitute';
  if (a.wasRescheduled) return 'rescheduled';
  return 'confirmed';
}

export function appointmentLogState(a: Appointment, hasSession: boolean, now: Date): LogState {
  if (isMissed(a)) return 'not_applicable';
  if (hasSession) return 'logged';
  const t = now.getTime();
  if (t < ms(a.startsAt)) return 'upcoming';
  if (t < ms(a.endsAt)) return 'in_progress';
  return 'not_logged';
}

/** Attended (or unmarked) and ended without a log. */
export function isUnlogged(a: Appointment, hasSession: boolean, now: Date): boolean {
  return !hasSession && !isMissed(a) && a.status !== 'completed' && ms(a.endsAt) <= now.getTime();
}

export interface BriefViewer {
  userId: UUID;
  /** Viewer is an active assigned therapist of the child for this therapy type. */
  assignedToChild: boolean;
  /** Viewer has logged at least one earlier session with the child. */
  hasWorkedWithChild: boolean;
}

/** The brief is mandatory for the appointment's therapist when they are a substitute or new to the child. */
export function isBriefRequired(a: Appointment, viewer: BriefViewer, hasSession: boolean): boolean {
  if (a.therapistId !== viewer.userId || hasSession || isMissed(a)) return false;
  return Boolean(a.originalTherapistId) || !viewer.assignedToChild || !viewer.hasWorkedWithChild;
}

export interface AppointmentViewInput {
  appointment: Appointment;
  child: Pick<Child, 'fullName' | 'photoUrl'>;
  therapist: Pick<Profile, 'fullName' | 'avatarUrl'>;
  originalTherapist?: Pick<Profile, 'fullName'>;
  therapyType: Pick<TherapyType, 'name' | 'color' | 'icon'>;
  sessionId?: UUID;
  viewer: BriefViewer;
  briefAcknowledged: boolean;
  hasCheckin: boolean;
  pendingRescheduleRequestId?: UUID;
  now: Date;
}

export function buildAppointmentView(i: AppointmentViewInput): AppointmentView {
  const a = i.appointment;
  const hasSession = Boolean(i.sessionId);
  return {
    ...a,
    childName: i.child.fullName,
    childPhotoUrl: i.child.photoUrl,
    therapistName: i.therapist.fullName,
    therapistAvatarUrl: i.therapist.avatarUrl,
    originalTherapistName: i.originalTherapist?.fullName,
    therapyTypeName: i.therapyType.name,
    therapyTypeColor: i.therapyType.color,
    therapyTypeIcon: i.therapyType.icon,
    displayStatus: appointmentDisplayStatus(a, i.now),
    logState: appointmentLogState(a, hasSession, i.now),
    sessionId: i.sessionId,
    isSubstitute: Boolean(a.originalTherapistId),
    briefRequired: isBriefRequired(a, i.viewer, hasSession),
    briefAcknowledged: i.briefAcknowledged,
    hasCheckin: i.hasCheckin,
    pendingRescheduleRequestId: i.pendingRescheduleRequestId,
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Chronological order key: session date, then creation time. */
export function compareSessions(a: Pick<SessionLog, 'date' | 'createdAt'>, b: Pick<SessionLog, 'date' | 'createdAt'>): number {
  return a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
}

/**
 * Sessions of the same child + therapy type strictly before `date` (sessions on the same date
 * count when created earlier), NEWEST FIRST — the order computeSessionMetrics expects.
 */
export function previousSessions<T extends Pick<SessionLog, 'id' | 'childId' | 'therapyTypeId' | 'date' | 'createdAt'>>(
  all: T[],
  ref: { childId: UUID; therapyTypeId: UUID; date: ISODate; createdAt?: ISODateTime; excludeId?: UUID },
): T[] {
  const refKey = { date: ref.date, createdAt: ref.createdAt ?? '9999' };
  return all
    .filter(
      (s) =>
        s.childId === ref.childId &&
        s.therapyTypeId === ref.therapyTypeId &&
        s.id !== ref.excludeId &&
        compareSessions(s, refKey) < 0,
    )
    .sort((a, b) => compareSessions(b, a));
}

export function toPreviousSession(s: Pick<SessionLog, 'metrics' | 'ratings'>): PreviousSession {
  return { sessionScore: s.metrics.sessionScore, ratings: s.ratings, deltaRolling: s.metrics.deltaRolling };
}

export function toSessionSummary(s: SessionLog, tt: Pick<TherapyType, 'name' | 'color'>): SessionSummary {
  return {
    id: s.id,
    appointmentId: s.appointmentId,
    childId: s.childId,
    date: s.date,
    therapyTypeId: s.therapyTypeId,
    therapyTypeName: tt.name,
    therapyTypeColor: tt.color,
    therapistName: s.therapistName,
    isSubstitute: s.isSubstitute,
    sessionScore: s.metrics.sessionScore,
    goalAccuracy: s.metrics.goalAccuracy,
    deltaLast: s.metrics.deltaLast,
    deltaRolling: s.metrics.deltaRolling,
    trend: s.metrics.trend,
    ratings: s.ratings,
    incidentCount: s.metrics.incidentCount,
    comparedToLast: s.comparedToLast,
    parentSummary: s.notes.parentSummary,
  };
}

/** Enabled dimensions to highlight for parents: PARENT_HIGHLIGHT_KEYS first, topped up to 3 by sort order. */
export function parentHighlightDimensions(dims: RatingDimension[]): RatingDimension[] {
  const enabled = dims.filter((d) => d.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  const picked = PARENT_HIGHLIGHT_KEYS.map((k) => enabled.find((d) => d.key === k)).filter(
    (d): d is RatingDimension => d != null,
  );
  for (const d of enabled) {
    if (picked.length >= 3) break;
    if (!picked.includes(d)) picked.push(d);
  }
  return picked.slice(0, 4);
}

export function buildParentSnapshot(input: {
  session: SessionLog;
  dimensions: RatingDimension[];
  settings: Pick<OrgSettings, 'parentsSeeNumericScore'>;
  therapyType: Pick<TherapyType, 'name' | 'color'>;
  goals: Pick<Goal, 'id' | 'parentText'>[];
}): ParentSessionSnapshot {
  const { session: s } = input;
  const highlights = parentHighlightDimensions(input.dimensions)
    .filter((d) => s.ratings[d.key] != null)
    .map((d) => ({
      key: d.key,
      label: d.parentLabel,
      icon: d.icon,
      value: s.ratings[d.key],
      change: dimensionChange(s.metrics.dimensions[d.key]?.deltaLast),
    }));
  const goalsWorkedOn = s.goalTrials
    .filter((t) => t.attempted > 0)
    .map((t) => input.goals.find((g) => g.id === t.goalId))
    .filter((g): g is Pick<Goal, 'id' | 'parentText'> => g != null)
    .map((g) => ({ goalId: g.id, parentText: g.parentText }));
  return {
    sessionId: s.id,
    date: s.date,
    therapyTypeName: input.therapyType.name,
    therapyTypeColor: input.therapyType.color,
    therapistName: s.therapistName,
    isSubstitute: s.isSubstitute,
    highlights,
    overall: overallChange(s.metrics.deltaLast),
    sessionScore: input.settings.parentsSeeNumericScore ? s.metrics.sessionScore : undefined,
    parentSummary: s.notes.parentSummary,
    goalsWorkedOn,
  };
}

/** Merge chip lists keeping first-seen order (case/space-insensitive), capped at `max`. */
export function dedupeChips(lists: string[][], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const chip = raw.trim();
      const key = chip.toLowerCase();
      if (!chip || seen.has(key)) continue;
      seen.add(key);
      out.push(chip);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** "What worked / didn't" chips for the Handover Brief from the last `take` sessions (newest first). */
export function briefChips(
  newestFirst: Pick<SessionLog, 'workedTags' | 'notWorkedTags'>[],
  take = 3,
): { whatWorked: string[]; whatDidnt: string[] } {
  const recent = newestFirst.slice(0, take);
  return {
    whatWorked: dedupeChips(recent.map((s) => s.workedTags)),
    whatDidnt: dedupeChips(recent.map((s) => s.notWorkedTags)),
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface TrialRecord {
  sessionId: UUID;
  date: ISODate;
  trial: GoalTrial;
}

/** Collects one goal's trials from sessions, oldest → newest. */
export function trialRecordsForGoal(goalId: UUID, sessions: Pick<SessionLog, 'id' | 'date' | 'createdAt' | 'goalTrials'>[]): TrialRecord[] {
  return [...sessions]
    .sort(compareSessions)
    .flatMap((s) => s.goalTrials.filter((t) => t.goalId === goalId && t.attempted > 0).map((trial) => ({ sessionId: s.id, date: s.date, trial })));
}

export function goalProgressPoints(records: TrialRecord[]): GoalProgressPoint[] {
  return records.map((r) => ({
    date: r.date,
    sessionId: r.sessionId,
    accuracy: trialAccuracy(r.trial) ?? 0,
    attempted: r.trial.attempted,
    successful: r.trial.successful,
    promptLevel: r.trial.promptLevel,
  }));
}

const CLOSED_GOAL_STATUSES = ['mastered', 'maintenance', 'paused'];

export function goalWithStats(goal: Goal, records: TrialRecord[]): GoalWithStats {
  const points = goalProgressPoints(records);
  const last = points[points.length - 1];
  return {
    ...goal,
    lastAccuracy: last?.accuracy,
    lastPromptLevel: last?.promptLevel,
    sessionsTracked: points.length,
    masterySuggested:
      !CLOSED_GOAL_STATUSES.includes(goal.status) && masteryMet(points.map((p) => p.accuracy), goal.masteryRule),
  };
}

export function isActiveGoal(g: Pick<Goal, 'status'>): boolean {
  return !CLOSED_GOAL_STATUSES.includes(g.status);
}

// ---------------------------------------------------------------------------
// Attendance & home practice
// ---------------------------------------------------------------------------

/** Counts appointments that have started by `now` (future ones are not yet "scheduled" for reports). */
export function attendanceSummary(appts: Appointment[], now: Date): AttendanceSummary {
  const out: AttendanceSummary = { scheduled: 0, attended: 0, late: 0, absent: 0, cancelledBySchool: 0, cancelledByParent: 0 };
  for (const a of appts) {
    if (ms(a.startsAt) > now.getTime()) continue;
    out.scheduled++;
    if (a.attendance === 'cancelled_by_school' || (a.status === 'cancelled' && a.attendance !== 'cancelled_by_parent')) {
      out.cancelledBySchool++;
    } else if (a.attendance === 'cancelled_by_parent') out.cancelledByParent++;
    else if (a.attendance === 'absent') out.absent++;
    else if (isAttended(a) || a.status === 'completed') {
      out.attended++;
      if (a.attendance === 'late') out.late++;
    }
  }
  return out;
}

export function attendanceRate(s: AttendanceSummary): number {
  const due = s.attended + s.absent + s.cancelledByParent;
  return due === 0 ? 0 : round((s.attended / due) * 100, 0);
}

type LogLite = Pick<HomeLog, 'taskId' | 'outcome' | 'createdAt'>;

/**
 * Completion over [from, to] (inclusive dates). Expected = each task's frequency pro-rated to the
 * days it was active in the range; done/partly logs count up to that expectation per task.
 */
export function practiceCompletion(
  tasks: Pick<HomeTask, 'id' | 'frequencyPerWeek' | 'activeFrom' | 'activeTo' | 'status'>[],
  logs: LogLite[],
  from: ISODate,
  to: ISODate,
): { expected: number; done: number; partly: number; percent: number } {
  let expected = 0;
  let done = 0;
  let partly = 0;
  for (const t of tasks) {
    if (t.status === 'archived') continue;
    const start = t.activeFrom > from ? t.activeFrom : from;
    const end = t.activeTo < to ? t.activeTo : to;
    if (start > end) continue;
    const days = Math.round((parse(end).getTime() - parse(start).getTime()) / 86_400_000) + 1;
    const exp = Math.max(1, Math.round((t.frequencyPerWeek * days) / 7));
    const inRange = logs.filter((l) => l.taskId === t.id && toISODate(parse(l.createdAt)) >= start && toISODate(parse(l.createdAt)) <= end);
    const d = Math.min(exp, inRange.filter((l) => l.outcome === 'done').length);
    const p = Math.min(exp - d, inRange.filter((l) => l.outcome === 'partly').length);
    expected += exp;
    done += d;
    partly += p;
  }
  const percent = expected === 0 ? 0 : Math.min(100, round(((done + partly * 0.5) / expected) * 100, 0));
  return { expected, done, partly, percent };
}

export function weeklyCompletion(
  childId: UUID,
  tasks: Pick<HomeTask, 'id' | 'childId' | 'frequencyPerWeek' | 'activeFrom' | 'activeTo' | 'status'>[],
  logs: LogLite[],
  weekStartDate: ISODate,
): WeeklyCompletion {
  const own = tasks.filter((t) => t.childId === childId);
  const c = practiceCompletion(own, logs, weekStartDate, addDaysISO(weekStartDate, 6));
  return { childId, weekStart: weekStartDate, expected: c.expected, done: c.done, partly: c.partly, percent: c.percent };
}

// ---------------------------------------------------------------------------
// Recurrence & conflicts
// ---------------------------------------------------------------------------

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
        out.push({ kind: 'therapist_double_booked', date: o.date, appointmentId: e.id, message: `${therapist} is already booked at ${clockTime(e.startsAt)} on ${o.date}` });
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

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const PERIOD_DAYS: Record<ProgressPeriod, number> = { week: 7, month: 30, quarter: 91 };

export function periodStart(period: ProgressPeriod, now: Date): ISODate {
  return addDaysISO(toISODate(now), -(PERIOD_DAYS[period] - 1));
}

/** Average rating per dimension over the (up to) 4 sessions before the latest. Input oldest → newest. */
export function fourSessionAverage(oldestFirst: Pick<SessionLog, 'ratings'>[]): Record<string, number> {
  const pool = oldestFirst.slice(0, -1).slice(-4);
  const keys = new Set(pool.flatMap((s) => Object.keys(s.ratings)));
  const out: Record<string, number> = {};
  for (const k of keys) {
    const avg = mean(pool.map((s) => s.ratings[k]).filter((v): v is NonNullable<typeof v> => v != null));
    if (avg != null) out[k] = round(avg);
  }
  return out;
}

export function incidentsByWeek(sessions: Pick<SessionLog, 'date' | 'metrics'>[]): { weekStart: ISODate; count: number }[] {
  const byWeek = new Map<ISODate, number>();
  for (const s of sessions) {
    const w = weekStart(s.date);
    byWeek.set(w, (byWeek.get(w) ?? 0) + s.metrics.incidentCount);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, count]) => ({ weekStart: w, count }));
}

export function substituteImpact(
  sessions: Pick<SessionLog, 'isSubstitute' | 'metrics'>[],
): { regularAvg: number; substituteAvg: number; substituteCount: number } | undefined {
  const subs = sessions.filter((s) => s.isSubstitute).map((s) => s.metrics.sessionScore);
  const regular = sessions.filter((s) => !s.isSubstitute).map((s) => s.metrics.sessionScore);
  if (subs.length === 0 || regular.length === 0) return undefined;
  return { regularAvg: round(mean(regular)!), substituteAvg: round(mean(subs)!), substituteCount: subs.length };
}

/** Overall trend of session scores (oldest → newest). */
export function scoreTrend(oldestFirst: Pick<SessionLog, 'metrics'>[]): ReturnType<typeof trend> {
  return trend(oldestFirst.map((s) => s.metrics.sessionScore));
}

export function goalsByDomain(goals: Pick<Goal, 'domain' | 'status'>[]): ParentProgress['goalsSummary'] {
  const map = new Map<GoalDomain, { achieved: number; inProgress: number }>();
  for (const g of goals) {
    const row = map.get(g.domain) ?? { achieved: 0, inProgress: 0 };
    if (g.status === 'mastered' || g.status === 'maintenance') row.achieved++;
    else if (g.status !== 'paused') row.inProgress++;
    map.set(g.domain, row);
  }
  return [...map.entries()].map(([domain, v]) => ({ domain, ...v }));
}

/** Parent progress: words + arrows per dimension per therapy over the period. */
export function parentProgress(input: {
  childId: UUID;
  period: ProgressPeriod;
  now: Date;
  sessions: SessionLog[];
  dimensions: RatingDimension[];
  therapyTypes: Pick<TherapyType, 'id' | 'name' | 'color'>[];
  goals: Pick<Goal, 'domain' | 'status'>[];
  attendance: AttendanceSummary;
  homePracticeCompletion: number;
}): ParentProgress {
  const from = periodStart(input.period, input.now);
  const inPeriod = input.sessions.filter((s) => s.childId === input.childId && s.date >= from).sort(compareSessions);
  const dims = input.dimensions.filter((d) => d.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  const byTherapy = input.therapyTypes
    .map((tt) => {
      const list = inPeriod.filter((s) => s.therapyTypeId === tt.id);
      return {
        therapyTypeId: tt.id,
        therapyTypeName: tt.name,
        therapyTypeColor: tt.color,
        sessionsCount: list.length,
        dimensions: dims
          .map((d) => {
            const values = list.map((s) => s.ratings[d.key]).filter((v): v is NonNullable<typeof v> => v != null);
            return { key: d.key, label: d.parentLabel, icon: d.icon, trend: trend(values.map(normalise)), recent: values.slice(-4) };
          })
          .filter((d) => d.recent.length > 0),
      };
    })
    .filter((t) => t.sessionsCount > 0);
  return {
    childId: input.childId,
    period: input.period,
    byTherapy,
    goalsSummary: goalsByDomain(input.goals),
    attendance: input.attendance,
    homePracticeCompletion: input.homePracticeCompletion,
  };
}
