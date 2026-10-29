/**
 * Session logs for every attended past appointment, generated per child + therapy in chronological
 * order so metrics (deltas, rolling averages, trends) and alerts match what the app would compute.
 */
import { CHIPS } from '@/domain/constants';
import { isAttended, toPreviousSession } from '@/domain/derive';
import { checkAlerts, computeSessionMetrics } from '@/domain/metrics';
import type { Appointment, BehaviourIncident, ComparedToLast, GoalTrial, IncidentType, PromptLevel, RatingValue, RegulationState, UUID } from '@/domain/types';
import { stableId } from '@/lib/id';

import { rng, type Rng } from '../../rng';
import type { StoredSession } from '../../store';
import { NOT_WORKED_TEXT, WORKED_TEXT } from '../content/phrases';
import type { ChildSeed, GoalSeed, SchoolSeed } from '../content/types';
import { apptDate } from './apptOps';
import { childSeed, courtesyName, dayDiff, ids, notAfterNow, profileName, type Build } from './context';
import { goalAccuracy, planTrials, successfulFor } from './goalTrials';
import { buildNotes } from './notes';
import { PAST_DAYS } from './schedule';

const HOUR = 3_600_000;

export function buildSessions(b: Build): void {
  for (const s of b.schools) {
    const orgId = ids.org(s.key);
    const toLog = b.store.appointments.filter(
      (a) => a.organizationId === orgId && isAttended(a) && new Date(a.endsAt).getTime() <= b.now.getTime() && !b.meta.unlogged.has(a.id),
    );
    const groups = new Map<string, Appointment[]>();
    for (const a of toLog) {
      const key = `${a.childId}|${a.therapyTypeId}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    for (const list of groups.values()) {
      list.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
      logGroup(b, s, list);
    }
  }
  b.store.sessions.sort((x, y) => x.date.localeCompare(y.date) || x.createdAt.localeCompare(y.createdAt));
}

function logGroup(b: Build, s: SchoolSeed, list: Appointment[]): void {
  const first = list[0];
  const childKey = s.children.find((c) => ids.child(s.key, c.key) === first.childId)!.key;
  const c = childSeed(b, s.key, childKey);
  const typeKey = b.store.therapyTypes.find((t) => t.id === first.therapyTypeId)!.key;
  const org = b.store.organizations.find((o) => o.id === first.organizationId)!;
  const dims = b.store.dimensions.filter((d) => d.organizationId === org.id);
  const goals = b.store.goals.filter((g) => g.childId === first.childId && g.therapyTypeId === first.therapyTypeId);
  const goalSeeds = new Map<UUID, GoalSeed>(c.goals.map((g) => [ids.goal(s.key, c.key, g.bank), g]));
  const plan = planTrials(list, goals, goalSeeds);
  const therapyBias = rng(`therapy-bias:${first.childId}:${typeKey}`).normal() * 0.15;
  const relation = b.store.guardians.find((g) => g.childId === first.childId && g.isPrimary)?.relation ?? 'Parent';
  const previous: StoredSession[] = [];

  list.forEach((a, i) => {
    const r = rng(`session:${a.id}`);
    const date = apptDate(a);
    const weeks = dayDiff(b.today, date) / 7 + PAST_DAYS / 7;
    let mean = c.level + c.gainPerWeek * weeks + therapyBias;
    let noise = 0.45;
    if (c.scenario === 'speech_improving' && typeKey === 'speech') {
      // Slow start, then the new strategy clicks in the last 3 weeks.
      mean = c.level + 0.03 * Math.min(weeks, 5) + 0.35 * Math.max(0, weeks - 5);
      if (weeks > 5) noise = 0.3;
    }
    if (c.scenario === 'decline' && typeKey === 'behaviour' && i >= list.length - 3) {
      mean -= 1.1;
      noise = 0.25;
    }
    const isSubstitute = Boolean(a.originalTherapistId);
    if (isSubstitute) mean -= 0.35;
    if (a.attendance === 'late') mean -= 0.15;
    const checkin = b.store.checkins.find((x) => x.appointmentId === a.id);
    if (checkin?.sleep === 'poor') mean -= 0.3;
    if (checkin?.mood === 'upset') mean -= 0.25;

    const ratings: Record<string, RatingValue> = {};
    for (const d of dims) {
      const v = Math.round(mean + (c.dimBias?.[d.key] ?? 0) + noise * r.normal());
      ratings[d.key] = Math.min(5, Math.max(1, v)) as RatingValue;
    }
    const trials: (GoalTrial & { bankKey: string })[] = plan.goals[i].map((goalId) => {
      const seed = goalSeeds.get(goalId)!;
      const acc = goalAccuracy(b, goals.find((g) => g.id === goalId)!, seed, plan, i, r);
      const attempted = r.int(6, 10);
      const successful = successfulFor(acc, attempted);
      return { goalId, attempted, successful, promptLevel: promptFor(acc, r), bankKey: seed.bank, note: r.chance(0.2) ? 'Needed a model on the first 2 trials.' : undefined };
    });
    const incidents = makeIncidents(c, typeKey, i === list.length - 1, r);
    const metrics = computeSessionMetrics({ ratings, goalTrials: trials, incidents, dimensions: dims, previous: previous.map(toPreviousSession) });
    const worked = r.sample(c.worked, r.int(1, 3));
    const notWorked = r.sample(c.notWorked, metrics.deltaLast != null && metrics.deltaLast < -5 ? 2 : r.int(0, 1));
    const regulationState = stateFor(ratings.regulation, c, r);
    const bucket = (metrics.deltaRolling ?? metrics.deltaLast ?? 0) >= 4 ? 'good' : (metrics.deltaRolling ?? metrics.deltaLast ?? 0) <= -6 ? 'hard' : 'steady';
    const therapist = b.store.profiles.find((p) => p.id === a.therapistId)!;
    const staffSeed = (key: UUID) => s.staff.find((p) => ids.staff(s.key, p.key) === key)!;
    const createdAt = notAfterNow(b, new Date(new Date(a.endsAt).getTime() + r.int(10, 150) * 60_000).toISOString());
    const activeGoals = goals.filter((g) => g.status !== 'mastered' && g.status !== 'maintenance');
    const breaksCount = r.int(0, 2) + (incidents.length ? 1 : 0);
    const session: StoredSession = {
      id: ids.session(a.id),
      clientId: stableId(`client:${a.id}`),
      organizationId: a.organizationId,
      appointmentId: a.id,
      childId: a.childId,
      therapistId: a.therapistId,
      therapistName: therapist.fullName,
      therapyTypeId: a.therapyTypeId,
      isSubstitute,
      date,
      actualMinutes: a.attendance === 'late' ? 45 - (a.lateMinutes ?? 5) : 45,
      startedLate: a.attendance === 'late',
      regulationState,
      ratings,
      goalTrials: trials.map(({ bankKey: _bankKey, ...t }) => t),
      incidents,
      breaksCount,
      comparedToLast: compared(metrics.deltaLast),
      workedTags: worked,
      workedText: r.pick(WORKED_TEXT),
      notWorkedTags: notWorked,
      notWorkedText: notWorked.length ? r.pick(NOT_WORKED_TEXT) : '',
      notes: buildNotes(
        {
          child: c,
          relation,
          ratings,
          regulationState,
          trials,
          planGoals: (activeGoals.length ? activeGoals : goals).slice(0, 2).map((g) => ({ id: g.id, bankKey: goalSeeds.get(g.id)!.bank })),
          incidents,
          breaks: breaksCount,
          workedTags: worked,
          notWorkedTags: notWorked,
          bucket,
          substitute: isSubstitute
            ? { therapistShort: courtesyName(therapist.fullName, staffSeed(a.therapistId).gender), regularShort: courtesyName(profileName(b, a.originalTherapistId!), staffSeed(a.originalTherapistId!).gender) }
            : undefined,
          checkin,
        },
        r,
      ),
      metrics,
      createdAt,
      updatedAt: createdAt,
      lockedAt: new Date(new Date(createdAt).getTime() + org.settings.logLockHours * HOUR).toISOString(),
      amendmentCount: 0,
    };
    b.store.sessions.push(session);
    a.status = 'completed';
    raiseAlerts(b, session, previous[0], org.settings, c);
    previous.unshift(session);
  });
}

function compared(delta: number | undefined): ComparedToLast {
  if (delta == null) return 'same';
  if (delta >= 12) return 'much_better';
  if (delta >= 4) return 'better';
  if (delta <= -12) return 'much_worse';
  if (delta <= -4) return 'worse';
  return 'same';
}

function promptFor(acc: number, r: Rng): PromptLevel {
  const base = acc < 35 ? 2 : acc < 60 ? 3 : acc < 82 ? 4 : 5;
  return Math.min(5, Math.max(1, base + (r.chance(0.2) ? -1 : 0))) as PromptLevel;
}

function stateFor(regulation: RatingValue, c: ChildSeed, r: Rng): RegulationState {
  const seeker = (c.dimBias?.attention ?? 0) < -0.2 || (c.dimBias?.regulation ?? 0) < -0.1;
  if (regulation <= 2) return seeker ? 'over' : 'under';
  if (regulation === 3 && r.chance(0.3)) return seeker ? 'over' : 'under';
  return 'regulated';
}

const INCIDENT_TYPES: IncidentType[] = ['refusal', 'meltdown', 'elopement', 'refusal', 'other'];

function makeIncidents(c: ChildSeed, typeKey: string, isLatest: boolean, r: Rng): BehaviourIncident[] {
  if (c.scenario === 'incident_spike' && typeKey === 'behaviour' && isLatest) {
    return [
      { type: 'meltdown', durationSeconds: 240, antecedentTags: ['transition'] },
      { type: c.key === 'advik' ? 'self_injury' : 'aggression', durationSeconds: 45, antecedentTags: ['denied_item'] },
      { type: 'elopement', durationSeconds: 60, antecedentTags: ['demand', 'sensory'] },
    ];
  }
  const rate = (c.incidentRate ?? 0) * (typeKey === 'behaviour' ? 1.4 : 0.7);
  if (!r.chance(rate)) return [];
  const count = r.chance(0.2) ? 2 : 1;
  return Array.from({ length: count }, () => ({
    type: r.pick(INCIDENT_TYPES),
    durationSeconds: r.int(3, 30) * 10,
    antecedentTags: r.sample(CHIPS.antecedents.slice(0, 5), r.int(1, 2)),
  }));
}

function raiseAlerts(b: Build, s: StoredSession, prev: StoredSession | undefined, settings: { alertDropThreshold: number; alertIncidentThreshold: number }, c: ChildSeed): void {
  const check = checkAlerts(s.metrics, prev ? toPreviousSession(prev) : undefined, { drop: settings.alertDropThreshold, incidents: settings.alertIncidentThreshold });
  const recent = dayDiff(s.date, b.today) <= 10;
  const coordinator = b.store.memberships.find((m) => m.organizationId === s.organizationId && m.role === 'coordinator')!.userId;
  const typeName = b.store.therapyTypes.find((t) => t.id === s.therapyTypeId)!.name;
  const open = (kind: string) => b.store.alerts.some((a) => a.childId === s.childId && a.kind === kind && a.status === 'open' && a.payload.therapyTypeId === s.therapyTypeId);
  const push = (kind: 'score_drop' | 'incident_spike', message: string, extra: Record<string, unknown>) => {
    if (open(kind)) return;
    b.store.alerts.push({
      id: stableId(`alert:${kind}:${s.id}`),
      organizationId: s.organizationId,
      childId: s.childId,
      childName: c.fullName,
      kind,
      payload: { sessionIds: [prev?.id, s.id].filter(Boolean), therapyTypeId: s.therapyTypeId, ...extra },
      message,
      status: recent ? 'open' : 'resolved',
      createdAt: s.createdAt,
      resolvedBy: recent ? undefined : coordinator,
      resolvedAt: recent ? undefined : new Date(new Date(s.createdAt).getTime() + 2 * 24 * HOUR).toISOString(),
    });
  };
  if (check.scoreDrop) {
    push('score_drop', `${c.preferredName}'s ${typeName} scores are well below the recent average for 2 sessions in a row.`, { drop: s.metrics.deltaRolling });
  }
  if (check.incidentSpike) {
    push('incident_spike', `${s.metrics.incidentCount} behaviour incidents in ${c.preferredName}'s ${typeName} session on ${s.date}.`, { incidents: s.metrics.incidentCount });
  }
}

