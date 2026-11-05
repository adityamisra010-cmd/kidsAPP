/** Parent check-ins and progress views (staff charts, parent words + arrows). */
import type { CheckinsRepo, ProgressRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import {
  attendanceSummary,
  fourSessionAverage,
  goalProgressPoints,
  incidentsByWeek,
  isCancelled,
  parentProgress,
  periodStart,
  substituteImpact,
  trialRecordsForGoal,
} from '@/domain/derive';
import type { ParentCheckin } from '@/domain/types';
import { uuid } from '@/lib/id';

import type { StoredCheckin } from '../store';
import type { DemoCore } from './core';
import { appointmentsForChild, childSessions, completion, goalsWithStats, localDate } from './queries';

export function createCheckinsRepo(core: DemoCore): CheckinsRepo {
  const st = core.db;
  return {
    submit: (input) =>
      core.run(() => {
        const ctx = core.requireOrg(['parent']);
        const { child } = core.requireChild(input.childId, ['parent']);
        const done = st.checkins.find((c) => c.clientId === input.clientId);
        if (done) return done;
        if (input.appointmentId) {
          const a = core.appointment(input.appointmentId);
          if (a.childId !== child.id) throw new RepoError('validation', 'This appointment is for another child.');
        }
        if (input.changeFlag && !input.changeNote.trim()) throw new RepoError('validation', 'Tell us briefly what changed.');
        const existing = st.checkins.find((c) => c.childId === child.id && (input.appointmentId ? c.appointmentId === input.appointmentId : c.date === input.date));
        const { clientId, ...fields } = input;
        if (existing) {
          Object.assign(existing, fields, { clientId, createdAt: core.nowIso() });
          return existing;
        }
        const checkin: StoredCheckin = { ...fields, clientId, id: uuid(), organizationId: child.organizationId, submittedBy: ctx.userId, createdAt: core.nowIso() };
        st.checkins.push(checkin);
        return checkin;
      }),
    forAppointment: (appointmentId) =>
      core.run((): ParentCheckin | null => {
        const a = core.appointment(appointmentId);
        core.requireChild(a.childId, ['parent', 'full', 'brief_only']);
        return st.checkins.find((c) => c.appointmentId === appointmentId) ?? st.checkins.find((c) => c.childId === a.childId && c.date === localDate(a.startsAt)) ?? null;
      }),
    pendingForToday: () =>
      core.run(() => {
        const ctx = core.requireOrg(['parent']);
        if (!core.org(ctx.organizationId).settings.checkinEnabled) return [];
        const today = core.today();
        const now = core.now().getTime();
        const firstPerChild = new Map<string, string>();
        return st.appointments
          .filter((a) => core.isGuardian(ctx.userId, a.childId) && localDate(a.startsAt) === today && !isCancelled(a) && new Date(a.endsAt).getTime() > now)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .filter((a) => {
            if (st.checkins.some((c) => c.childId === a.childId && (c.appointmentId === a.id || c.date === today))) return false;
            if (firstPerChild.has(a.childId)) return false;
            firstPerChild.set(a.childId, a.id);
            return true;
          })
          .map((a) => core.appointmentView(a));
      }),
  };
}

export function createProgressRepo(core: DemoCore): ProgressRepo {
  return {
    staff: (childId, opts) =>
      core.run(() => {
        core.requireStaff();
        core.requireChild(childId, ['full']);
        const sessions = childSessions(core, childId, opts?.therapyTypeId, opts);
        const latest = sessions[sessions.length - 1];
        const goals = goalsWithStats(core, childId, { therapyTypeId: opts?.therapyTypeId }).map((g) => ({
          ...g,
          points: goalProgressPoints(trialRecordsForGoal(g.id, childSessions(core, childId, g.therapyTypeId, opts))),
        }));
        const appts = appointmentsForChild(core, childId, opts).filter((a) => !opts?.therapyTypeId || a.therapyTypeId === opts.therapyTypeId);
        return {
          childId,
          therapyTypeId: opts?.therapyTypeId,
          sessions: sessions.map((s) => core.summary(s)),
          latest: latest ? core.summary(latest) : undefined,
          fourSessionAverage: fourSessionAverage(sessions),
          goals,
          attendance: attendanceSummary(appts, core.now()),
          incidentsByWeek: incidentsByWeek(sessions),
          substituteImpact: substituteImpact(sessions),
        };
      }),
    parent: (childId, period) =>
      core.run(() => {
        const { child } = core.requireChild(childId, ['parent', 'full']);
        const from = periodStart(period, core.now());
        const to = core.today();
        const typeIds = new Set(core.store.childTherapists.filter((t) => t.childId === childId).map((t) => t.therapyTypeId));
        return parentProgress({
          childId,
          period,
          now: core.now(),
          sessions: childSessions(core, childId),
          dimensions: core.dims(child.organizationId),
          therapyTypes: core.store.therapyTypes.filter((t) => typeIds.has(t.id)),
          goals: core.store.goals.filter((g) => g.childId === childId),
          attendance: attendanceSummary(appointmentsForChild(core, childId, { from, to }), core.now()),
          homePracticeCompletion: completion(core, { childId }, from, to),
        });
      }),
  };
}
