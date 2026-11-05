/** Goal trial history, progress points and stats with the mastery suggestion. */
import { masteryMet, trialAccuracy } from '../metrics';

import { compareSessions } from './sessions';
import type {
  Goal,
  GoalProgressPoint,
  GoalTrial,
  GoalWithStats,
  ISODate,
  SessionLog,
  UUID,
} from '../types';

export interface TrialRecord {
  sessionId: UUID;
  date: ISODate;
  trial: GoalTrial;
}

/** Collects one goal's trials from sessions, oldest → newest. */
export function trialRecordsForGoal(goalId: UUID, sessions: Pick<SessionLog, 'id' | 'date' | 'createdAt' | 'goalTrials'>[]): TrialRecord[] {
  return [...sessions]
    .sort(compareSessions)
    .flatMap((s) => s.goalTrials.filter((t) => t.goalId === goalId && t.attempted > 0).map((trial) => ({ sessionId: s.id, date: s.date, trial })));
}

export function goalProgressPoints(records: TrialRecord[]): GoalProgressPoint[] {
  return records.map((r) => ({
    date: r.date,
    sessionId: r.sessionId,
    accuracy: trialAccuracy(r.trial) ?? 0,
    attempted: r.trial.attempted,
    successful: r.trial.successful,
    promptLevel: r.trial.promptLevel,
  }));
}

const CLOSED_GOAL_STATUSES = ['mastered', 'maintenance', 'paused'];

export function goalWithStats(goal: Goal, records: TrialRecord[]): GoalWithStats {
  const points = goalProgressPoints(records);
  const last = points[points.length - 1];
  return {
    ...goal,
    lastAccuracy: last?.accuracy,
    lastPromptLevel: last?.promptLevel,
    sessionsTracked: points.length,
    masterySuggested:
      !CLOSED_GOAL_STATUSES.includes(goal.status) && masteryMet(points.map((p) => p.accuracy), goal.masteryRule),
  };
}

export function isActiveGoal(g: Pick<Goal, 'status'>): boolean {
  return !CLOSED_GOAL_STATUSES.includes(g.status);
}
