/** Dashboards (therapist Today, coordinator/admin) and reports/exports, all computed from the store. */
import type { DashboardsRepo, ReportsRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { attendanceRate, attendanceSummary, isAttended, isCancelled, isUnlogged, scoreTrend } from '@/domain/derive';
import { mean, round } from '@/domain/metrics';
import type { AdminDashboard, Appointment, ChildReportData, ExportRow, ISODate, UUID } from '@/domain/types';
import { addDaysISO, ageLabel, clockTime, weekStart } from '@/lib/dates';

import type { DemoCore, OrgContext } from './core';
import { appointmentsForChild, childSessions, completion, goalsWithStats, localDate } from './queries';

export function createDashboardsRepo(core: DemoCore): DashboardsRepo {
  const st = core.db;
  const ended = (a: Appointment) => new Date(a.endsAt).getTime() <= core.now().getTime();
  const has = (a: Appointment) => Boolean(core.sessionFor(a.id));
  const unloggedFor = (ctx: OrgContext, therapistId?: UUID) => {
    const since = addDaysISO(core.today(), -14);
    return st.appointments
      .filter((a) => a.organizationId === ctx.organizationId && (!therapistId || a.therapistId === therapistId) && localDate(a.startsAt) >= since && isUnlogged(a, has(a), core.now()))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  };
  const unreadMessages = (userId: UUID) =>
    st.threadMembers
      .filter((m) => m.userId === userId)
      .reduce((n, m) => {
        const since = st.threadReads.find((r) => r.threadId === m.threadId && r.userId === userId)?.lastReadAt ?? '';
        return n + st.messages.filter((x) => x.threadId === m.threadId && x.senderId !== userId && x.createdAt > since).length;
      }, 0);

  return {
    therapistToday: (date) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const day = date ?? core.today();
        const appointments = st.appointments
          .filter((a) => a.therapistId === ctx.userId && localDate(a.startsAt) === day && !isCancelled(a))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((a) => core.appointmentView(a));
        const pendingReviews = st.homeLogs.filter((l) => {
          if (l.reviewedAt || l.organizationId !== ctx.organizationId) return false;
          const task = st.homeTasks.find((t) => t.id === l.taskId);
          return task?.assignedBy === ctx.userId || core.isAssigned(ctx.userId, l.childId);
        }).length;
        return { date: day, appointments, pendingReviews, unreadMessages: unreadMessages(ctx.userId), unloggedCount: unloggedFor(ctx, ctx.userId).length };
      }),
    admin: (date) =>
      core.run((): AdminDashboard => {
        const ctx = core.requireAdmin();
        const day = date ?? core.today();
        const inOrg = st.appointments.filter((a) => a.organizationId === ctx.organizationId);
        const todays = inOrg.filter((a) => localDate(a.startsAt) === day);
        const ws = weekStart(day);
        const week = inOrg.filter((a) => localDate(a.startsAt) >= ws && localDate(a.startsAt) <= day);
        const fullWeek = inOrg.filter((a) => localDate(a.startsAt) >= ws && localDate(a.startsAt) <= addDaysISO(ws, 6) && !isCancelled(a));
        const therapists = core.orgUsers(ctx.organizationId, ['therapist']);
        const now = core.now().getTime();

        const needing: AdminDashboard['childrenNeedingAttention'] = [];
        for (const alert of st.alerts.filter((a) => a.organizationId === ctx.organizationId && a.status !== 'resolved').sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
          const typeId = alert.payload.therapyTypeId as UUID | undefined;
          const last = childSessions(core, alert.childId, typeId).slice(-1)[0];
          needing.push({ child: st.children.find((c) => c.id === alert.childId)!, reason: alert.message, alertId: alert.id, trend: last?.metrics.trend });
        }
        for (const child of st.children.filter((c) => c.organizationId === ctx.organizationId && c.status === 'active')) {
          if (needing.some((n) => n.child.id === child.id)) continue;
          const types = new Set(st.sessions.filter((s) => s.childId === child.id).map((s) => s.therapyTypeId));
          for (const typeId of types) {
            const last = childSessions(core, child.id, typeId).slice(-1)[0];
            if (last?.metrics.trend === 'down') {
              needing.push({ child, reason: `Declining trend in ${core.therapyType(typeId).name}`, trend: 'down' });
              break;
            }
          }
        }

        return {
          date: day,
          today: {
            scheduled: todays.filter((a) => !isCancelled(a)).length,
            completed: todays.filter((a) => a.status === 'completed' || (isAttended(a) && ended(a))).length,
            logged: todays.filter(has).length,
            unlogged: todays.filter((a) => isUnlogged(a, has(a), core.now())).length,
            cancelled: todays.filter(isCancelled).length,
          },
          week: {
            attendanceRate: attendanceRate(attendanceSummary(week, core.now())),
            homePracticeRate: completion(core, { orgId: ctx.organizationId }, addDaysISO(day, -6), day),
            loggingCompliance: therapists.map((therapistId) => {
              const due = week.filter((a) => a.therapistId === therapistId && isAttended(a) && ended(a));
              const logged = due.filter(has).length;
              return { therapistId, name: core.name(therapistId), logged, due: due.length, percent: due.length ? Math.round((logged / due.length) * 100) : 100 };
            }),
          },
          childrenNeedingAttention: needing,
          unloggedSessions: unloggedFor(ctx).map((a) => core.appointmentView(a)),
          upcomingSubstitutions: inOrg
            .filter((a) => a.originalTherapistId && !isCancelled(a) && new Date(a.endsAt).getTime() > now && new Date(a.startsAt).getTime() < now + 7 * 86_400_000)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((a) => core.appointmentView(a)),
          needsSubstitute: inOrg
            .filter((a) => !isCancelled(a) && !a.originalTherapistId && new Date(a.endsAt).getTime() > now && st.unavailability.some((u) => u.userId === a.therapistId && u.from <= localDate(a.startsAt) && u.to >= localDate(a.startsAt)))
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((a) => core.appointmentView(a)),
          pendingReschedules: st.rescheduleRequests
            .filter((r) => r.organizationId === ctx.organizationId && r.status === 'pending')
            .map((r) => ({ ...r, appointment: core.appointmentView(st.appointments.find((a) => a.id === r.appointmentId)!) })),
          workload: therapists
            .map((therapistId) => ({ therapistId, name: core.name(therapistId), sessionsThisWeek: fullWeek.filter((a) => a.therapistId === therapistId).length }))
            .sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek),
        };
      }),
  };
}

export function createReportsRepo(core: DemoCore): ReportsRepo {
  const st = core.db;
  const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to;
  const checkRange = (from: ISODate, to: ISODate) => {
    if (to < from) throw new RepoError('validation', 'The end date is before the start date.');
  };
  return {
    childReport: (childId, opts) =>
      core.run((): ChildReportData => {
        checkRange(opts.from, opts.to);
        if (opts.audience === 'staff') core.requireStaff();
        const { child } = core.requireChild(childId, opts.audience === 'staff' ? ['full'] : ['parent', 'full']);
        const org = core.org(child.organizationId);
        const showScores = opts.audience === 'staff' || org.settings.parentsSeeNumericScore;
        const sessions = childSessions(core, childId, undefined, opts);
        const typeIds = [...new Set(sessions.map((s) => s.therapyTypeId))];
        const byTherapy = typeIds.map((typeId) => {
          const list = sessions.filter((s) => s.therapyTypeId === typeId);
          const tt = core.therapyType(typeId);
          return {
            therapyTypeName: tt.name,
            therapyTypeColor: tt.color,
            sessions: showScores ? list.map((s) => core.summary(s)) : [],
            averageScore: showScores ? round(mean(list.map((s) => s.metrics.sessionScore)) ?? 0) : undefined,
            trend: scoreTrend(list),
          };
        });
        const latestPerType = typeIds.map((typeId) => sessions.filter((s) => s.therapyTypeId === typeId).slice(-1)[0]);
        const therapistSummary = latestPerType
          .map((s) => `${core.therapyType(s.therapyTypeId).name}: ${opts.audience === 'staff' ? s.notes.assessment : s.notes.parentSummary}`)
          .join('\n\n');
        const goals = goalsWithStats(core, childId);
        return {
          organization: org,
          child,
          ageLabel: ageLabel(child.dob, core.now()),
          range: { from: opts.from, to: opts.to },
          audience: opts.audience,
          attendance: attendanceSummary(appointmentsForChild(core, childId, opts), core.now()),
          byTherapy,
          goals,
          wins: goals.filter((g) => g.status === 'mastered' || g.status === 'maintenance'),
          homePracticeCompletion: completion(core, { childId }, opts.from, opts.to),
          therapistSummary,
          generatedAt: core.nowIso(),
        };
      }),
    exportSessions: (opts) =>
      core.run((): ExportRow[] => {
        const ctx = core.requireAdmin();
        checkRange(opts.from, opts.to);
        return st.sessions
          .filter((s) => s.organizationId === ctx.organizationId && inRange(s.date, opts.from, opts.to) && (!opts.childId || s.childId === opts.childId) && (!opts.therapistId || s.therapistId === opts.therapistId))
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((s) => ({
            Date: s.date,
            Child: st.children.find((c) => c.id === s.childId)?.fullName ?? '',
            'Therapy type': core.therapyType(s.therapyTypeId).name,
            Therapist: s.therapistName,
            Substitute: s.isSubstitute,
            'Session score': s.metrics.sessionScore,
            'Goal accuracy %': s.metrics.goalAccuracy ?? null,
            'Change vs last': s.metrics.deltaLast ?? null,
            'Change vs 4-session avg': s.metrics.deltaRolling ?? null,
            Trend: s.metrics.trend,
            Incidents: s.metrics.incidentCount,
            'Compared to last': s.comparedToLast,
            Minutes: s.actualMinutes,
            'Started late': s.startedLate,
          }));
      }),
    exportAttendance: (opts) =>
      core.run((): ExportRow[] => {
        const ctx = core.requireAdmin();
        checkRange(opts.from, opts.to);
        return st.appointments
          .filter((a) => a.organizationId === ctx.organizationId && inRange(localDate(a.startsAt), opts.from, opts.to) && (!opts.childId || a.childId === opts.childId) && (!opts.therapistId || a.therapistId === opts.therapistId))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((a) => ({
            Date: localDate(a.startsAt),
            Time: clockTime(a.startsAt),
            Child: st.children.find((c) => c.id === a.childId)?.fullName ?? '',
            'Therapy type': core.therapyType(a.therapyTypeId).name,
            Therapist: core.name(a.therapistId),
            'Original therapist': a.originalTherapistId ? core.name(a.originalTherapistId) : null,
            Status: a.status,
            Attendance: a.attendance ?? null,
            'Late (min)': a.lateMinutes ?? null,
            Reason: a.cancelReason ?? null,
            Rescheduled: a.wasRescheduled,
            'Make-up': Boolean(a.makeupOfId),
          }));
      }),
  };
}
