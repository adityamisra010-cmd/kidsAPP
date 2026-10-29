/** Session logs: idempotent save with metrics + alerts, 24 h lock, amendments, Handover Brief. */
import type { SessionsRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { briefChips, compareSessions, isMissed, isUnlogged, previousSessions, toPreviousSession } from '@/domain/derive';
import { checkAlerts, computeSessionMetrics } from '@/domain/metrics';
import type { Alert, Amendment, Appointment, SessionInput, SessionLog, UUID } from '@/domain/types';
import { addDaysISO, ageLabel } from '@/lib/dates';
import { uuid } from '@/lib/id';

import type { StoredSession } from '../store';
import { withoutClinical } from './children';
import type { DemoCore } from './core';
import { childSessions, goalsWithStats, localDate, snapshotFor } from './queries';

const HOUR = 3_600_000;
type Editable = Omit<SessionInput, 'clientId' | 'appointmentId'>;
const METRIC_FIELDS: (keyof Editable)[] = ['ratings', 'goalTrials', 'incidents'];

export function createSessionsRepo(core: DemoCore): SessionsRepo {
  const st = core.db;
  /** clientIds already applied (the stored session keeps only its first one). */
  const seenClientIds = new Map<UUID, UUID>();

  const loadSession = (id: UUID): StoredSession => {
    const ctx = core.requireStaff();
    const s = core.sameOrg(st.sessions.find((x) => x.id === id), 'Session');
    if (s.therapistId !== ctx.userId) core.requireChild(s.childId, ['full']);
    return s;
  };

  const validate = (input: Editable, a: Appointment) => {
    const missing = core.dims(a.organizationId).filter((d) => d.enabled && ![1, 2, 3, 4, 5].includes(input.ratings[d.key]));
    if (missing.length) throw new RepoError('validation', 'Rate every dimension (1–5).', { missing: missing.map((d) => d.key) });
    if (!input.notes.planNext.trim()) throw new RepoError('validation', 'The plan for next session is required.');
    if (!(input.actualMinutes > 0)) throw new RepoError('validation', 'Enter the session length.');
    const goalIds = new Set(st.goals.filter((g) => g.childId === a.childId).map((g) => g.id));
    if (input.goalTrials.some((t) => !goalIds.has(t.goalId) || t.attempted < 0 || t.successful < 0 || t.successful > t.attempted)) {
      throw new RepoError('validation', 'Check the goal trials (successful cannot exceed attempted).');
    }
  };

  const metricsFor = (s: Pick<StoredSession, 'id' | 'childId' | 'therapyTypeId' | 'date' | 'createdAt' | 'organizationId'>, input: Editable) => {
    const previous = previousSessions(st.sessions, { childId: s.childId, therapyTypeId: s.therapyTypeId, date: s.date, createdAt: s.createdAt, excludeId: s.id });
    return { previous, metrics: computeSessionMetrics({ ratings: input.ratings, goalTrials: input.goalTrials, incidents: input.incidents, dimensions: core.dims(s.organizationId), previous: previous.map(toPreviousSession) }) };
  };

  const raiseAlerts = (s: StoredSession, previous: StoredSession | undefined) => {
    const settings = core.org(s.organizationId).settings;
    const check = checkAlerts(s.metrics, previous ? toPreviousSession(previous) : undefined, { drop: settings.alertDropThreshold, incidents: settings.alertIncidentThreshold });
    const child = st.children.find((c) => c.id === s.childId)!;
    const typeName = core.therapyType(s.therapyTypeId).name;
    const raise = (kind: Alert['kind'], message: string, extra: Record<string, unknown>) => {
      if (st.alerts.some((x) => x.childId === s.childId && x.kind === kind && x.status !== 'resolved' && x.payload.therapyTypeId === s.therapyTypeId)) return;
      const alert: Alert = { id: uuid(), organizationId: s.organizationId, childId: s.childId, childName: child.fullName, kind, payload: { sessionIds: [previous?.id, s.id].filter(Boolean), therapyTypeId: s.therapyTypeId, ...extra }, message, status: 'open', createdAt: core.nowIso() };
      st.alerts.push(alert);
      core.notify(core.orgUsers(s.organizationId, ['coordinator']), 'child_alert', `Alert: ${child.fullName}`, message, `/child/${s.childId}`);
    };
    const name = child.preferredName ?? child.fullName;
    if (check.scoreDrop) raise('score_drop', `${name}'s ${typeName} scores are well below the recent average for 2 sessions in a row.`, { drop: s.metrics.deltaRolling });
    if (check.incidentSpike) raise('incident_spike', `${s.metrics.incidentCount} behaviour incidents in ${name}'s ${typeName} session on ${s.date}.`, { incidents: s.metrics.incidentCount });
  };

  const apply = (s: StoredSession, input: Editable) => {
    const { previous, metrics } = metricsFor(s, input);
    Object.assign(s, input, { metrics, updatedAt: core.nowIso() });
    return previous;
  };

  return {
    getByAppointment: (appointmentId) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const a = core.appointment(appointmentId);
        if (a.therapistId !== ctx.userId) core.requireChild(a.childId, ['full']);
        return core.sessionFor(appointmentId) ?? null;
      }),
    get: (sessionId) => core.run(() => loadSession(sessionId)),
    listForChild: (childId, opts) =>
      core.run(() => {
        core.requireStaff();
        core.requireChild(childId, ['full', 'brief_only']);
        return childSessions(core, childId, opts?.therapyTypeId, opts)
          .reverse()
          .slice(0, opts?.limit ?? 200)
          .map((s) => core.summary(s));
      }),
    save: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const knownId = seenClientIds.get(input.clientId) ?? st.sessions.find((s) => s.clientId === input.clientId)?.id;
        const known = knownId ? st.sessions.find((s) => s.id === knownId) : undefined;
        if (known) return known;
        const a = core.appointment(input.appointmentId);
        if (!core.isAdmin(ctx) && a.therapistId !== ctx.userId) throw new RepoError('forbidden', 'Only the session therapist can log this session.');
        if (isMissed(a)) throw new RepoError('validation', 'This session was cancelled or the child was absent.');
        if (new Date(a.startsAt).getTime() - core.now().getTime() > HOUR) throw new RepoError('validation', 'This session has not started yet.');
        const { clientId, appointmentId: _appointmentId, ...fields } = input;
        validate(fields, a);
        const existing = core.sessionFor(a.id);
        if (existing) {
          if (core.now() > new Date(existing.lockedAt)) throw new RepoError('locked', 'This log is locked. Add an amendment with a reason instead.');
          const previous = apply(existing, fields);
          seenClientIds.set(clientId, existing.id);
          raiseAlerts(existing, previous[0]);
          core.audit('session.update', 'session', existing.id);
          return existing;
        }
        const createdAt = core.nowIso();
        const draft = { id: uuid(), childId: a.childId, therapyTypeId: a.therapyTypeId, date: localDate(a.startsAt), createdAt, organizationId: a.organizationId };
        const { previous, metrics } = metricsFor(draft, fields);
        const session: StoredSession = {
          ...draft,
          ...fields,
          clientId,
          appointmentId: a.id,
          therapistId: a.therapistId,
          therapistName: core.name(a.therapistId),
          isSubstitute: Boolean(a.originalTherapistId) || !core.isAssigned(a.therapistId, a.childId, a.therapyTypeId),
          metrics,
          updatedAt: createdAt,
          lockedAt: new Date(new Date(createdAt).getTime() + core.org(a.organizationId).settings.logLockHours * HOUR).toISOString(),
          amendmentCount: 0,
        };
        st.sessions.push(session);
        seenClientIds.set(clientId, session.id);
        a.status = 'completed';
        if (!a.attendance) a.attendance = 'present';
        raiseAlerts(session, previous[0]);
        const child = st.children.find((c) => c.id === a.childId)!;
        core.notify(core.guardiansOf(a.childId), 'session_summary', `${child.preferredName ?? child.fullName}'s ${core.therapyType(a.therapyTypeId).name} session`, session.notes.parentSummary.slice(0, 140), `/session/${session.id}`);
        core.audit('session.create', 'session', session.id);
        return session;
      }),
    amend: (sessionId, changes, reason) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const s = loadSession(sessionId);
        if (s.therapistId !== ctx.userId && !core.isAdmin(ctx)) throw new RepoError('forbidden', 'Only the session therapist or a coordinator can amend.');
        if (!reason.trim()) throw new RepoError('validation', 'A reason is required for an amendment.');
        const rows: Amendment[] = [];
        const row = (entity: Amendment['entity'], field: string, oldValue: unknown, newValue: unknown) => {
          const o = JSON.stringify(oldValue ?? '');
          const n = JSON.stringify(newValue ?? '');
          if (o !== n) rows.push({ id: uuid(), entity, entityId: s.id, field, oldValue: o, newValue: n, reason: reason.trim(), by: ctx.userId, byName: core.name(ctx.userId), at: core.nowIso() });
        };
        for (const [key, value] of Object.entries(changes) as [keyof Editable, unknown][]) {
          if (key === 'notes' && value) {
            for (const [nk, nv] of Object.entries(value as Partial<SessionLog['notes']>)) row('session_notes', `notes.${nk}`, s.notes[nk as keyof SessionLog['notes']], nv);
          } else row(key === 'goalTrials' ? 'goal_trial' : 'session', key, s[key], value);
        }
        if (!rows.length) throw new RepoError('validation', 'Nothing changed.');
        const next: Editable = { ...s, ...changes, notes: { ...s.notes, ...(changes.notes ?? {}) } };
        validate(next, core.appointment(s.appointmentId));
        if (METRIC_FIELDS.some((f) => f in changes)) apply(s, next);
        else Object.assign(s, next, { updatedAt: core.nowIso() });
        s.amendmentCount += rows.length;
        st.amendments.push(...rows.map((r) => ({ ...r, sessionId: s.id })));
        core.audit('session.amend', 'session', s.id, { fields: rows.map((r) => r.field) });
        return s;
      }),
    amendments: (sessionId) =>
      core.run(() => {
        const s = loadSession(sessionId);
        return st.amendments.filter((x) => x.sessionId === s.id).sort((a, b) => a.at.localeCompare(b.at)).map(({ sessionId: _sid, ...rest }) => rest);
      }),
    unlogged: () =>
      core.run(() => {
        const ctx = core.requireStaff();
        const since = addDaysISO(core.today(), -14);
        return st.appointments
          .filter((a) => a.organizationId === ctx.organizationId && (core.isAdmin(ctx) || a.therapistId === ctx.userId) && localDate(a.startsAt) >= since && isUnlogged(a, Boolean(core.sessionFor(a.id)), core.now()))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map((a) => core.appointmentView(a));
      }),
    brief: (appointmentId) =>
      core.run(() => {
        const ctx = core.requireStaff();
        const a = core.appointment(appointmentId);
        const { child, access } = core.requireChild(a.childId, ['full', 'brief_only']);
        if (access === 'brief_only' && a.therapistId !== ctx.userId) throw new RepoError('forbidden', 'The brief is available to the session therapist.');
        const profile = st.childProfiles.find((p) => p.childId === child.id)!;
        const sessions = childSessions(core, child.id, a.therapyTypeId).filter((s) => s.appointmentId !== a.id && new Date(s.createdAt) < new Date(a.endsAt));
        const newestFirst = [...sessions].sort((x, y) => compareSessions(y, x));
        const last = newestFirst[0];
        const view = core.appointmentView(a);
        const date = localDate(a.startsAt);
        const goals = goalsWithStats(core, child.id, { therapyTypeId: a.therapyTypeId, activeOnly: true });
        const planned = new Set(last?.notes.planGoalIds ?? []);
        return {
          appointment: view,
          child,
          ageLabel: ageLabel(child.dob, core.now()),
          profile: access === 'full' ? profile : withoutClinical(profile),
          planForToday: last ? { text: last.notes.planNext, goalIds: last.notes.planGoalIds, byName: last.therapistName, date: last.date } : undefined,
          goals: goals.sort((x, y) => Number(planned.has(y.id)) - Number(planned.has(x.id))),
          recentSessions: newestFirst.slice(0, 3).map((s) => core.summary(s)),
          ...briefChips(newestFirst),
          todaysCheckin: st.checkins.find((c) => c.appointmentId === a.id) ?? st.checkins.find((c) => c.childId === child.id && c.date === date),
          openHomeTasks: st.homeTasks.filter((t) => t.childId === child.id && t.status === 'active'),
          latestParentFeedback: [...st.homeLogs].filter((l) => l.childId === child.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0],
          activeAlerts: st.alerts.filter((x) => x.childId === child.id && x.status !== 'resolved'),
          access,
          mustAcknowledge: view.briefRequired,
          acknowledged: view.briefAcknowledged,
        };
      }),
    parentSnapshot: (sessionId) =>
      core.run(() => {
        const s = core.sameOrg(st.sessions.find((x) => x.id === sessionId), 'Session');
        core.requireChild(s.childId, ['parent', 'full']);
        return snapshotFor(core, s);
      }),
    parentSnapshots: (childId, opts) =>
      core.run(() => {
        core.requireChild(childId, ['parent', 'full']);
        return childSessions(core, childId)
          .reverse()
          .slice(0, opts?.limit ?? 50)
          .map((s) => snapshotFor(core, s));
      }),
    previous: (childId, therapyTypeId, before) =>
      core.run(() => {
        core.requireStaff();
        core.requireChild(childId, ['full', 'brief_only']);
        const cutoff = before ?? core.nowIso();
        const prev = childSessions(core, childId, therapyTypeId).filter((s) => s.createdAt < cutoff && s.date <= localDate(cutoff));
        const last = prev[prev.length - 1];
        return last ? core.summary(last) : null;
      }),
  };
}
