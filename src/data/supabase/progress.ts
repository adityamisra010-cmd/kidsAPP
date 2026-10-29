/**
 * Progress views. Staff: composed from sessions / goals / appointments with the shared metrics
 * helpers. Parents: parent_progress() (dimension words + arrows, goal counts) plus attendance and
 * home-practice completion, which parents may read directly.
 */
import type { Attendance, ParentProgress, ProgressPeriod, StaffProgress, UUID } from '@/domain/types';

import { RepoError, type ProgressRepo } from '../repository';
import type { AdapterContext } from './context';
import {
  addDays,
  attendanceSummary,
  fourSessionAverage,
  incidentsByWeek,
  istDayBounds,
  rangeCompletion,
  substituteImpact,
  todayIST,
} from './derive-local';
import { staffGoals } from './goals';
import { tasksAndLogsForChild } from './home-practice';
import { arr } from './mappers';
import { trendOf } from './mappers-rpc';
import { rpc, selectAll } from './query';
import type { AppointmentRow, ParentProgressJson, SessionJoinedRow } from './rows';
import { SESSION_SELECT, summarizeSessions } from './sessions';

export const PERIOD_DAYS: Record<ProgressPeriod, number> = { week: 7, month: 30, quarter: 90 };

/** Appointment status + attendance of a child in [from, to] (IST dates). */
export async function childAttendanceRows(
  c: AdapterContext,
  childId: UUID,
  from: string,
  to: string,
  therapyTypeId?: UUID,
): Promise<Pick<AppointmentRow, 'status' | 'attendance' | 'starts_at'>[]> {
  return selectAll((f, t) => {
    let q = c.sb
      .from('appointments')
      .select('id,status,attendance,starts_at')
      .eq('child_id', childId)
      .gte('starts_at', istDayBounds(from).start)
      .lt('starts_at', istDayBounds(to).end);
    if (therapyTypeId) q = q.eq('therapy_type_id', therapyTypeId);
    return q.order('starts_at').order('id').range(f, t);
  });
}

/** Sessions of a child in [from, to], oldest → newest, as SessionSummary. */
export async function childSessions(c: AdapterContext, childId: UUID, from: string, to: string, therapyTypeId?: UUID) {
  const rows = await selectAll<SessionJoinedRow>((f, t) => {
    let q = c.sb.from('sessions').select(SESSION_SELECT).eq('child_id', childId).gte('date', from).lte('date', to);
    if (therapyTypeId) q = q.eq('therapy_type_id', therapyTypeId);
    return q.order('date').order('created_at').order('id').range(f, t);
  });
  return summarizeSessions(c, rows);
}

export function createProgressRepo(c: AdapterContext): ProgressRepo {
  return {
    async staff(childId, opts): Promise<StaffProgress> {
      if (c.isParent()) throw new RepoError('forbidden', 'Parents use the parent progress view');
      const today = todayIST(c.now());
      const from = opts?.from ?? addDays(today, -180);
      const to = opts?.to ?? today;
      const [sessions, goals, appts] = await Promise.all([
        childSessions(c, childId, from, to, opts?.therapyTypeId),
        staffGoals(c, childId, { therapyTypeId: opts?.therapyTypeId }),
        childAttendanceRows(c, childId, from, to, opts?.therapyTypeId),
      ]);
      const nowMs = c.now().getTime();
      return {
        childId,
        therapyTypeId: opts?.therapyTypeId,
        sessions,
        latest: sessions[sessions.length - 1],
        fourSessionAverage: fourSessionAverage(sessions),
        goals: goals.map((g) => ({ ...g, points: g.points.filter((p) => p.date >= from && p.date <= to) })),
        // Only appointments that have happened count towards attendance.
        attendance: attendanceSummary(appts.filter((a) => Date.parse(a.starts_at) <= nowMs).map(attendanceOf)),
        incidentsByWeek: incidentsByWeek(sessions),
        substituteImpact: substituteImpact(sessions),
      };
    },

    async parent(childId, period): Promise<ParentProgress> {
      const today = todayIST(c.now());
      const since = addDays(today, -PERIOD_DAYS[period]);
      const [pp, appts, practice] = await Promise.all([
        rpc<ParentProgressJson>(c.sb, 'parent_progress', { child_id: childId, since }),
        childAttendanceRows(c, childId, since, today),
        tasksAndLogsForChild(c, childId, since, today),
      ]);
      const nowMs = c.now().getTime();
      return {
        childId,
        period,
        byTherapy: arr(pp?.byTherapy).map((b) => ({
          therapyTypeId: b.therapyTypeId,
          therapyTypeName: b.therapyTypeName,
          therapyTypeColor: b.therapyTypeColor,
          dimensions: arr(b.dimensions).map((d) => ({ key: d.key, label: d.label, icon: d.icon, trend: trendOf(d.trend), recent: arr(d.recent) })),
          sessionsCount: b.sessionsCount ?? 0,
        })),
        goalsSummary: arr(pp?.goalsSummary).map((g) => ({ domain: g.domain, achieved: g.achieved ?? 0, inProgress: g.inProgress ?? 0 })),
        attendance: attendanceSummary(appts.filter((a) => Date.parse(a.starts_at) <= nowMs).map(attendanceOf)),
        homePracticeCompletion: rangeCompletion(
          since,
          today,
          practice.tasks.map((t) => ({ frequencyPerWeek: t.frequency_per_week, activeFrom: t.active_from, activeTo: t.active_to, status: t.status })),
          practice.logs.map((l) => ({ outcome: l.outcome, createdAt: l.created_at })),
        ),
      };
    },
  };
}

/** Status + attendance in domain form (nulls → undefined). */
export function attendanceOf(a: Pick<AppointmentRow, 'status' | 'attendance'>): { status: AppointmentRow['status']; attendance?: Attendance } {
  return { status: a.status, attendance: a.attendance ?? undefined };
}
