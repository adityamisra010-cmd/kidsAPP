/** Read helpers shared by several repos (store rows + derive helpers, no access checks). */
import {
  buildParentSnapshot,
  compareSessions,
  goalWithStats,
  isActiveGoal,
  practiceCompletion,
  trialRecordsForGoal,
} from '@/domain/derive';
import type { Appointment, Goal, GoalStatus, GoalWithStats, ISODate, ParentSessionSnapshot, UUID } from '@/domain/types';

import { parse, toISODate } from '@/lib/dates';

import type { StoredSession } from '../store';
import type { DemoCore } from './core';

const dateCache = new Map<string, ISODate>();
/** Local calendar date of a timestamp (memoised; used in most appointment filters). */
export function localDate(iso: string): ISODate {
  let d = dateCache.get(iso);
  if (d == null) {
    d = toISODate(parse(iso));
    if (dateCache.size > 20_000) dateCache.clear();
    dateCache.set(iso, d);
  }
  return d;
}

/** Sessions for a child (optionally one therapy type), oldest → newest. */
export function childSessions(core: DemoCore, childId: UUID, therapyTypeId?: UUID, range?: { from?: ISODate; to?: ISODate }): StoredSession[] {
  return core.store.sessions
    .filter(
      (s) =>
        s.childId === childId &&
        (!therapyTypeId || s.therapyTypeId === therapyTypeId) &&
        (!range?.from || s.date >= range.from) &&
        (!range?.to || s.date <= range.to),
    )
    .sort(compareSessions);
}

export function statsFor(core: DemoCore, goal: Goal): GoalWithStats {
  return goalWithStats(goal, trialRecordsForGoal(goal.id, childSessions(core, goal.childId, goal.therapyTypeId)));
}

export function goalsWithStats(core: DemoCore, childId: UUID, filter?: { therapyTypeId?: UUID; status?: GoalStatus[]; activeOnly?: boolean }): GoalWithStats[] {
  return core.store.goals
    .filter(
      (g) =>
        g.childId === childId &&
        (!filter?.therapyTypeId || g.therapyTypeId === filter.therapyTypeId) &&
        (!filter?.status || filter.status.includes(g.status)) &&
        (!filter?.activeOnly || isActiveGoal(g)),
    )
    .map((g) => statsFor(core, g));
}

export function snapshotFor(core: DemoCore, s: StoredSession): ParentSessionSnapshot {
  return buildParentSnapshot({
    session: s,
    dimensions: core.dims(s.organizationId),
    settings: core.org(s.organizationId).settings,
    therapyType: core.therapyType(s.therapyTypeId),
    goals: core.store.goals.filter((g) => g.childId === s.childId),
  });
}

/** Home-practice completion % for one child (or a whole org) over a date range. */
export function completion(core: DemoCore, scope: { childId?: UUID; orgId?: UUID }, from: ISODate, to: ISODate): number {
  const tasks = core.store.homeTasks.filter((t) => (!scope.childId || t.childId === scope.childId) && (!scope.orgId || t.organizationId === scope.orgId));
  const ids = new Set(tasks.map((t) => t.id));
  return practiceCompletion(tasks, core.store.homeLogs.filter((l) => ids.has(l.taskId)), from, to).percent;
}

export function appointmentsForChild(core: DemoCore, childId: UUID, range?: { from?: ISODate; to?: ISODate }): Appointment[] {
  return core.store.appointments.filter((a) => {
    const d = localDate(a.startsAt);
    return a.childId === childId && (!range?.from || d >= range.from) && (!range?.to || d <= range.to);
  });
}
