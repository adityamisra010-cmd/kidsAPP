/**
 * Child progress report data (staff or parent audience) and CSV/Excel exports. Numbers reuse the
 * domain metrics helpers (mean, trend) so the PDF matches the in-app charts.
 */
import { mean, normalise, round, trend } from '@/domain/metrics';
import { ageLabel } from '@/lib/dates';
import type { ChildReportData, ExportRow, GoalWithStats, ParentSessionSnapshot, RatingValue, SessionSummary, UUID } from '@/domain/types';

import { RepoError, type ReportsRepo } from '../repository';
import type { AdapterContext } from './context';
import { attendanceSummary, istDate, istDayBounds, istTime, rangeCompletion, todayIST } from './derive-local';
import { parentGoals, staffGoals } from './goals';
import { tasksAndLogsForChild } from './home-practice';
import { childFromRow, dimensionFromRow, num, organizationFromRow, ratingsFromRows } from './mappers';
import { attendanceOf, childAttendanceRows, childSessions } from './progress';
import { inChunks, many, selectAll, single } from './query';
import type { AppointmentJoinedRow, ChildRow, OrganizationRow, RatingDimensionRow, SessionJoinedRow, SessionNotesRow, SessionRatingRow } from './rows';
import { parentSnapshots, SESSION_SELECT } from './sessions';
import { APPOINTMENT_SELECT } from './views';

/** Parent-visible snapshot as a SessionSummary row for the parent report (score only if shared). */
export function summaryFromSnapshot(s: ParentSessionSnapshot, childId: UUID): SessionSummary {
  const ratings: Record<string, RatingValue> = {};
  for (const h of s.highlights) ratings[h.key] = h.value;
  return {
    id: s.sessionId,
    appointmentId: '',
    childId,
    date: s.date,
    therapyTypeId: '',
    therapyTypeName: s.therapyTypeName,
    therapyTypeColor: s.therapyTypeColor,
    therapistName: s.therapistName,
    isSubstitute: s.isSubstitute,
    sessionScore: s.sessionScore ?? 0,
    trend: 'flat',
    ratings,
    incidentCount: 0,
    comparedToLast: s.overall === 'better' ? 'better' : s.overall === 'harder' ? 'worse' : 'same',
    parentSummary: s.parentSummary,
  };
}

/** Groups sessions per therapy type with average score and score trend. */
export function byTherapy(sessions: SessionSummary[], showScore: boolean): ChildReportData['byTherapy'] {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const k = s.therapyTypeName || s.therapyTypeId;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()].map((list) => {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // Without numeric scores (parents) the trend follows the highlighted ratings.
    const series = showScore
      ? ordered.map((s) => s.sessionScore)
      : ordered.map((s) => mean(Object.values(s.ratings).map(normalise)) ?? 0);
    const avg = mean(ordered.map((s) => s.sessionScore));
    return {
      therapyTypeName: ordered[0].therapyTypeName,
      therapyTypeColor: ordered[0].therapyTypeColor,
      sessions: ordered,
      averageScore: showScore && avg != null ? round(avg) : undefined,
      trend: trend(series),
    };
  });
}

export function createReportsRepo(c: AdapterContext): ReportsRepo {
  const sb = c.sb;

  return {
    async childReport(childId, opts): Promise<ChildReportData> {
      const childRow = await single<ChildRow>(sb.from('children').select('*').eq('id', childId), 'child');
      const parentCaller = c.isParent();
      const [orgRow, appts, practice, goals, sessions] = await Promise.all([
        single<OrganizationRow>(sb.from('organizations').select('*').eq('id', childRow.organization_id), 'school'),
        childAttendanceRows(c, childId, opts.from, opts.to),
        tasksAndLogsForChild(c, childId, opts.from, opts.to),
        parentCaller ? parentGoals(c, childId) : staffGoals(c, childId).then((g) => g.map(({ points: _p, ...rest }): GoalWithStats => rest)),
        parentCaller
          ? parentSnapshots(c, childId, 200).then((list) => list.filter((s) => s.date >= opts.from && s.date <= opts.to).map((s) => summaryFromSnapshot(s, childId)))
          : childSessions(c, childId, opts.from, opts.to),
      ]);
      const organization = organizationFromRow(orgRow);
      const showScore = opts.audience === 'staff' ? !parentCaller : organization.settings.parentsSeeNumericScore;

      // Pre-filled summary paragraph (editable before export): newest non-empty text.
      let therapistSummary = '';
      const newestFirst = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
      if (opts.audience === 'parent' || parentCaller) {
        therapistSummary = newestFirst.find((s) => s.parentSummary.trim())?.parentSummary ?? '';
      } else if (newestFirst.length) {
        const notes = await many<Pick<SessionNotesRow, 'session_id' | 'assessment'>>(
          sb.from('session_notes').select('session_id,assessment').in('session_id', newestFirst.slice(0, 10).map((s) => s.id)),
        );
        const byId = new Map(notes.map((n) => [n.session_id, n.assessment]));
        therapistSummary = newestFirst.map((s) => byId.get(s.id) ?? '').find((t) => t.trim()) ?? '';
      }

      const nowMs = c.now().getTime();
      return {
        organization,
        child: childFromRow(childRow),
        ageLabel: ageLabel(childRow.dob),
        range: { from: opts.from, to: opts.to },
        audience: opts.audience,
        attendance: attendanceSummary(appts.filter((a) => Date.parse(a.starts_at) <= nowMs).map(attendanceOf)),
        byTherapy: byTherapy(sessions, showScore),
        goals: goals.filter((g) => g.status !== 'mastered' && g.status !== 'maintenance'),
        wins: goals
          .filter((g) => g.status === 'mastered' || g.status === 'maintenance')
          .sort((a, b) => (b.masteredAt ?? '').localeCompare(a.masteredAt ?? '')),
        homePracticeCompletion: rangeCompletion(
          opts.from,
          opts.to < todayIST(c.now()) ? opts.to : todayIST(c.now()),
          practice.tasks.map((t) => ({ frequencyPerWeek: t.frequency_per_week, activeFrom: t.active_from, activeTo: t.active_to, status: t.status })),
          practice.logs.map((l) => ({ outcome: l.outcome, createdAt: l.created_at })),
        ),
        therapistSummary,
        generatedAt: c.now().toISOString(),
      };
    },

    async exportSessions(opts) {
      if (c.isParent()) throw new RepoError('forbidden', 'Exports are for staff');
      const orgId = c.requireOrg();
      const [rows, dimRows] = await Promise.all([
        selectAll<SessionJoinedRow & { child: { full_name: string } | null }>((f, t) => {
          let q = sb.from('sessions').select(`${SESSION_SELECT}, child:children(full_name)`).eq('organization_id', orgId).gte('date', opts.from).lte('date', opts.to);
          if (opts.childId) q = q.eq('child_id', opts.childId);
          if (opts.therapistId) q = q.eq('therapist_id', opts.therapistId);
          return q.order('date').order('created_at').order('id').range(f, t);
        }),
        many<RatingDimensionRow>(sb.from('rating_dimensions').select('*').eq('organization_id', orgId).order('sort_order')),
      ]);
      const ratings = await inChunks(rows.map((r) => r.id), (part) =>
        many<SessionRatingRow>(sb.from('session_ratings').select('session_id,dimension_key,value').in('session_id', part)),
      );
      const bySession = new Map<UUID, SessionRatingRow[]>();
      for (const r of ratings) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r]);
      const keys = dimRows.map(dimensionFromRow).map((d) => d.key);
      return rows.map((r): ExportRow => {
        const rated = ratingsFromRows(bySession.get(r.id) ?? []);
        const row: ExportRow = {
          date: r.date,
          child: r.child?.full_name ?? '',
          therapy_type: r.therapy_type?.name ?? '',
          therapist: r.therapist?.full_name ?? '',
          substitute: r.is_substitute,
          actual_minutes: r.actual_minutes,
          started_late: r.started_late,
          session_score: num(r.session_score) ?? null,
          goal_accuracy: num(r.goal_accuracy) ?? null,
          delta_last: num(r.delta_last) ?? null,
          delta_rolling: num(r.delta_rolling) ?? null,
          trend: r.trend,
          incidents: r.incident_count,
          compared_to_last: r.compared_to_last,
          regulation_state: r.regulation_state,
        };
        for (const k of keys) row[`rating_${k}`] = rated[k] ?? null;
        return row;
      });
    },

    async exportAttendance(opts) {
      if (c.isParent()) throw new RepoError('forbidden', 'Exports are for staff');
      const orgId = c.requireOrg();
      const rows = await selectAll<AppointmentJoinedRow>((f, t) => {
        let q = sb.from('appointments').select(APPOINTMENT_SELECT).eq('organization_id', orgId).gte('starts_at', istDayBounds(opts.from).start).lt('starts_at', istDayBounds(opts.to).end);
        if (opts.childId) q = q.eq('child_id', opts.childId);
        if (opts.therapistId) q = q.eq('therapist_id', opts.therapistId);
        return q.order('starts_at').order('id').range(f, t);
      });
      return rows.map(
        (r): ExportRow => ({
          date: istDate(r.starts_at),
          time: istTime(r.starts_at),
          minutes: Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000),
          child: r.child?.full_name ?? '',
          therapy_type: r.therapy_type?.name ?? '',
          therapist: r.therapist?.full_name ?? '',
          original_therapist: r.original_therapist?.full_name ?? null,
          status: r.status,
          attendance: r.attendance,
          late_minutes: r.late_minutes,
          cancel_reason: r.cancel_reason,
          rescheduled: r.was_rescheduled,
          room: r.room,
        }),
      );
    },
  };
}
