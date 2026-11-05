/** Attendance summaries and home-practice completion. */
import { addDaysISO, parse, toISODate } from '@/lib/dates';

import { round } from '../metrics';

import { isAttended } from './appointments';
import type {
  Appointment,
  AttendanceSummary,
  HomeLog,
  HomeTask,
  ISODate,
  ISODateTime,
  UUID,
  WeeklyCompletion,
} from '../types';

/** Epoch ms of a full ISO timestamp (native parsing; these always carry an offset). */
const ms = (iso: ISODateTime) => Date.parse(iso);

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
