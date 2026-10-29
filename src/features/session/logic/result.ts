/**
 * Instant, offline metrics for the "Saved" view and the parent preview. Uses the shared metrics
 * engine (src/domain/metrics.ts), so the numbers match what the server stores.
 */
import { PARENT_HIGHLIGHT_KEYS } from '@/domain/constants';
import {
  checkAlerts,
  computeSessionMetrics,
  dimensionChange,
  masteryMet,
  overallChange,
  type AlertCheck,
  type PreviousSession,
} from '@/domain/metrics';
import type {
  GoalProgressPoint,
  GoalWithStats,
  ISODate,
  OrgSettings,
  ParentSessionSnapshot,
  RatingDimension,
  SessionInput,
  SessionMetrics,
  SessionSummary,
  UUID,
} from '@/domain/types';

import { enabledDimensions } from './draft';

/**
 * Previous sessions of the same child + therapy type, newest first, excluding the session being
 * logged (edits) and anything after its date.
 */
export function toPreviousSessions(
  summaries: SessionSummary[],
  opts: { appointmentId: UUID; onOrBefore: ISODate; excludeSessionId?: UUID },
): PreviousSession[] {
  return summaries
    .filter(
      (s) => s.appointmentId !== opts.appointmentId && s.id !== opts.excludeSessionId && s.date <= opts.onOrBefore,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({ sessionScore: s.sessionScore, ratings: s.ratings, deltaRolling: s.deltaRolling }));
}

/** Goals whose mastery rule is met once this session's accuracy is added. */
export function masterySuggestions(
  input: Pick<SessionInput, 'goalTrials'>,
  goals: GoalWithStats[],
  history: Record<UUID, GoalProgressPoint[] | undefined>,
  excludeSessionId?: UUID,
): UUID[] {
  const out: UUID[] = [];
  for (const trial of input.goalTrials) {
    if (trial.attempted <= 0) continue;
    const goal = goals.find((g) => g.id === trial.goalId);
    if (!goal || goal.status === 'mastered' || goal.status === 'maintenance') continue;
    const points = (history[goal.id] ?? [])
      .filter((p) => p.sessionId !== excludeSessionId)
      .sort((a, b) => a.date.localeCompare(b.date));
    const accuracy = (Math.min(trial.successful, trial.attempted) / trial.attempted) * 100;
    if (masteryMet([...points.map((p) => p.accuracy), accuracy], goal.masteryRule)) out.push(goal.id);
  }
  return out;
}

export interface SavedResult {
  metrics: SessionMetrics;
  alerts: AlertCheck;
  masteryGoalIds: UUID[];
  hasPrevious: boolean;
}

export function computeSavedResult(args: {
  input: SessionInput;
  dimensions: RatingDimension[];
  previous: PreviousSession[];
  goals: GoalWithStats[];
  history: Record<UUID, GoalProgressPoint[] | undefined>;
  settings: Pick<OrgSettings, 'alertDropThreshold' | 'alertIncidentThreshold'>;
  excludeSessionId?: UUID;
}): SavedResult {
  const metrics = computeSessionMetrics({
    ratings: args.input.ratings,
    goalTrials: args.input.goalTrials,
    incidents: args.input.incidents,
    dimensions: args.dimensions,
    previous: args.previous,
  });
  return {
    metrics,
    alerts: checkAlerts(metrics, args.previous[0], {
      drop: args.settings.alertDropThreshold,
      incidents: args.settings.alertIncidentThreshold,
    }),
    masteryGoalIds: masterySuggestions(args.input, args.goals, args.history, args.excludeSessionId),
    hasPrevious: args.previous.length > 0,
  };
}

/**
 * What the parent will see, built locally from the draft so the therapist can preview it before
 * saving. Mirrors the server's ParentSessionSnapshot rules (3–4 highlights, words not numbers).
 */
export function buildParentPreview(args: {
  sessionId: UUID;
  date: ISODate;
  therapyTypeName: string;
  therapyTypeColor: string;
  therapyTypeKey?: string;
  therapistName: string;
  isSubstitute: boolean;
  input: Pick<SessionInput, 'ratings' | 'goalTrials' | 'incidents' | 'notes'>;
  dimensions: RatingDimension[];
  previous: PreviousSession[];
  goals: Pick<GoalWithStats, 'id' | 'parentText'>[];
  showScore: boolean;
}): ParentSessionSnapshot {
  const metrics = computeSessionMetrics({
    ratings: args.input.ratings,
    goalTrials: args.input.goalTrials,
    incidents: args.input.incidents,
    dimensions: args.dimensions,
    previous: args.previous,
  });
  const enabled = enabledDimensions(args.dimensions);
  const preferred = PARENT_HIGHLIGHT_KEYS.map((k) => enabled.find((d) => d.key === k)).filter(
    (d): d is RatingDimension => !!d,
  );
  const pool = preferred.length >= 3 ? preferred : [...preferred, ...enabled.filter((d) => !preferred.includes(d))];
  const highlights = pool
    .filter((d) => args.input.ratings[d.key] != null)
    .slice(0, 4)
    .map((d) => ({
      key: d.key,
      label: d.parentLabel,
      icon: d.icon,
      value: args.input.ratings[d.key],
      change: dimensionChange(metrics.dimensions[d.key]?.deltaLast),
    }));
  return {
    sessionId: args.sessionId,
    date: args.date,
    therapyTypeName: args.therapyTypeName,
    therapyTypeColor: args.therapyTypeColor,
    therapyTypeKey: args.therapyTypeKey ?? '',
    therapistName: args.therapistName,
    isSubstitute: args.isSubstitute,
    highlights,
    overall: overallChange(metrics.deltaLast),
    sessionScore: args.showScore ? metrics.sessionScore : undefined,
    parentSummary: args.input.notes.parentSummary,
    goalsWorkedOn: args.input.goalTrials
      .map((t) => args.goals.find((g) => g.id === t.goalId))
      .filter((g): g is Pick<GoalWithStats, 'id' | 'parentText'> => !!g)
      .map((g) => ({ goalId: g.id, parentText: g.parentText })),
  };
}
