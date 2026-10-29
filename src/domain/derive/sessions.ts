/** Session ordering, summaries, parent snapshots (words + arrows) and Handover Brief chips. */
import { PARENT_HIGHLIGHT_KEYS } from '../constants';
import { dimensionChange, overallChange } from '../metrics';
import type { PreviousSession } from '../metrics';
import type {
  Goal,
  ISODate,
  ISODateTime,
  OrgSettings,
  ParentSessionSnapshot,
  RatingDimension,
  SessionLog,
  SessionSummary,
  TherapyType,
  UUID,
} from '../types';

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
  therapyType: Pick<TherapyType, 'name' | 'color' | 'key'>;
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
    therapyTypeKey: input.therapyType.key,
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
