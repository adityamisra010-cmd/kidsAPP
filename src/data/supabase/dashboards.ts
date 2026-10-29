/**
 * Dashboards. Admin: admin_dashboard() returns counts and appointment / request ids, which are
 * hydrated here in one batched pass. Therapist Today: own appointments + small counters.
 */
import type { AdminDashboard, AppointmentView, Child, TherapistToday, UUID } from '@/domain/types';

import type { DashboardsRepo } from '../repository';
import { listAppointments, rescheduleRequests } from './appointments';
import type { AdapterContext } from './context';
import { istDayBounds, todayIST } from './derive-local';
import { childFromRow, num } from './mappers';
import { trendOf } from './mappers-rpc';
import { countOf, inChunks, many, rpc } from './query';
import type { AdminDashboardJson, ChildRow, ChildTherapistRow } from './rows';
import { appointmentViewsByIds } from './views';

export interface DashboardDeps {
  unreadMessages: () => Promise<number>;
  unlogged: () => Promise<AppointmentView[]>;
}

/** Unreviewed parent logs for the therapist's assigned children (count only). */
async function pendingReviews(c: AdapterContext): Promise<number> {
  const today = todayIST(c.now());
  let q = c.sb.from('home_logs').select('id', { count: 'exact', head: true }).eq('organization_id', c.requireOrg()).is('reviewed_at', null);
  if (!c.isOrgAdmin()) {
    const mine = await many<Pick<ChildTherapistRow, 'child_id' | 'active_from' | 'active_to'>>(
      c.sb.from('child_therapists').select('child_id,active_from,active_to').eq('user_id', c.requireUserId()),
    );
    const ids = [...new Set(mine.filter((m) => m.active_from <= today && (!m.active_to || m.active_to >= today)).map((m) => m.child_id))];
    if (ids.length === 0) return 0;
    q = q.in('child_id', ids);
  }
  return countOf(q);
}

export function createDashboardsRepo(c: AdapterContext, deps: DashboardDeps): DashboardsRepo {
  return {
    async therapistToday(date): Promise<TherapistToday> {
      const day = date ?? todayIST(c.now());
      const { start, end } = istDayBounds(day);
      const [appointments, reviews, unreadMessages, unlogged] = await Promise.all([
        listAppointments(c, { from: start, to: end, therapistId: c.requireUserId(), includeCancelled: true }),
        pendingReviews(c),
        deps.unreadMessages().catch(() => 0),
        deps.unlogged(),
      ]);
      return { date: day, appointments, pendingReviews: reviews, unreadMessages, unloggedCount: unlogged.length };
    },

    async admin(date): Promise<AdminDashboard> {
      const orgId = c.requireOrg();
      const j = await rpc<AdminDashboardJson>(c.sb, 'admin_dashboard', { org_id: orgId, on_date: date ?? null });
      const apptIds = [...new Set([...j.unloggedAppointmentIds, ...j.upcomingSubstitutionIds, ...j.needsSubstituteIds])];
      const childIds = [...new Set(j.childrenNeedingAttention.map((x) => x.childId))];
      const [views, reschedules, children] = await Promise.all([
        appointmentViewsByIds(c, apptIds),
        j.pendingRescheduleIds.length ? rescheduleRequests(c, { ids: j.pendingRescheduleIds }) : Promise.resolve([]),
        inChunks(childIds, (part) => many<ChildRow>(c.sb.from('children').select('*').in('id', part))),
      ]);
      const viewById = new Map(views.map((v) => [v.id, v]));
      const pick = (ids: UUID[]) => ids.map((id) => viewById.get(id)).filter((v): v is AppointmentView => !!v);
      const childById = new Map<UUID, Child>(children.map((r) => [r.id, childFromRow(r)]));
      return {
        date: j.date,
        today: j.today,
        week: {
          attendanceRate: num(j.week.attendanceRate) ?? 0,
          homePracticeRate: num(j.week.homePracticeRate) ?? 0,
          loggingCompliance: j.week.loggingCompliance.map((x) => ({ ...x, percent: num(x.percent) ?? 0 })),
        },
        childrenNeedingAttention: j.childrenNeedingAttention
          .filter((x) => childById.has(x.childId))
          .map((x) => ({ child: childById.get(x.childId)!, reason: x.reason, alertId: x.alertId, trend: x.trend ? trendOf(x.trend) : undefined })),
        unloggedSessions: pick(j.unloggedAppointmentIds),
        upcomingSubstitutions: pick(j.upcomingSubstitutionIds),
        needsSubstitute: pick(j.needsSubstituteIds),
        pendingReschedules: reschedules,
        workload: j.workload,
      };
    },
  };
}
