/**
 * Session metrics engine. Single source of truth for the maths; mirrored line-for-line in
 * supabase/migrations/*_metrics.sql (`compute_session_metrics`). Parity is enforced by
 * scripts/test-db (fixtures in src/domain/__fixtures__/metrics.json).
 *
 * Conventions (keep identical in SQL):
 * - Ratings are 1..5. Normalised to 0..100 as (v - 1) / 4 * 100.
 * - Rounding: 1 decimal, half away from zero (Postgres `round(numeric, 1)`).
 * - "Previous" sessions = same child + same therapy type, strictly earlier, newest first.
 * - Rolling average uses up to 4 previous sessions and needs at least 2 (with 1 it equals "last").
 * - Trend = least-squares slope over the last up-to-6 values (oldest → newest, including current),
 *   on the 0..100 scale; needs 3+ points. slope >= +2.5 → up, <= -2.5 → down, else flat.
 */
import type {
  BehaviourIncident,
  DimensionDelta,
  GoalTrial,
  MasteryRule,
  RatingDimension,
  RatingValue,
  SessionMetrics,
  Trend,
} from './types';

export const ROLLING_WINDOW = 4;
export const ROLLING_MIN = 2;
export const TREND_WINDOW = 6;
export const TREND_MIN_POINTS = 3;
export const TREND_SLOPE_THRESHOLD = 2.5;

/** Half-away-from-zero rounding to `dp` decimals (matches Postgres numeric round). */
export function round(value: number, dp = 1): number {
  const f = 10 ** dp;
  const scaled = Math.abs(value) * f;
  // Guard against binary float artefacts like 1.005 * 100 = 100.49999.
  const r = Math.round(scaled + 1e-9) / f;
  return value < 0 ? -r : r;
}

export function normalise(v: number): number {
  return ((v - 1) / 4) * 100;
}

type WeightedDim = Pick<RatingDimension, 'key' | 'weight' | 'enabled'>;

/**
 * Weighted average of enabled dimensions that have a rating, normalised to 0..100.
 * Returns 0 when nothing is rated (the logger requires all enabled dimensions, so this is a guard).
 */
export function sessionScore(ratings: Record<string, number>, dims: WeightedDim[]): number {
  let total = 0;
  let weights = 0;
  for (const d of dims) {
    if (!d.enabled || d.weight <= 0) continue;
    const v = ratings[d.key];
    if (v == null) continue;
    total += normalise(v) * d.weight;
    weights += d.weight;
  }
  return weights === 0 ? 0 : round(total / weights);
}

export function trialAccuracy(t: Pick<GoalTrial, 'attempted' | 'successful'>): number | undefined {
  if (t.attempted <= 0) return undefined;
  return round((Math.min(t.successful, t.attempted) / t.attempted) * 100);
}

/** Mean accuracy across goals targeted (attempted > 0) this session. */
export function goalAccuracy(trials: Pick<GoalTrial, 'attempted' | 'successful'>[]): number | undefined {
  const acc = trials.map(trialAccuracy).filter((a): a is number => a != null);
  if (acc.length === 0) return undefined;
  return round(acc.reduce((s, a) => s + a, 0) / acc.length);
}

export function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Least-squares slope with x = 0..n-1. */
export function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** values ordered oldest → newest, already on a 0..100 scale. */
export function trend(values: number[]): Trend {
  const window = values.slice(-TREND_WINDOW);
  if (window.length < TREND_MIN_POINTS) return 'flat';
  const s = slope(window);
  if (s >= TREND_SLOPE_THRESHOLD) return 'up';
  if (s <= -TREND_SLOPE_THRESHOLD) return 'down';
  return 'flat';
}

export interface PreviousSession {
  sessionScore: number;
  ratings: Record<string, number>;
  /** Stored delta vs rolling average of that session (for the 2-in-a-row alert rule). */
  deltaRolling?: number;
}

export interface MetricsInput {
  ratings: Record<string, RatingValue>;
  goalTrials: Pick<GoalTrial, 'attempted' | 'successful'>[];
  incidents: BehaviourIncident[];
  dimensions: WeightedDim[];
  /** Previous sessions for the same child + therapy type, NEWEST FIRST. */
  previous: PreviousSession[];
}

export function computeSessionMetrics(input: MetricsInput): SessionMetrics {
  const score = sessionScore(input.ratings, input.dimensions);
  const prev = input.previous;
  const last = prev[0];
  const rollingPool = prev.slice(0, ROLLING_WINDOW);
  const rollingAverage = rollingPool.length >= ROLLING_MIN ? round(mean(rollingPool.map((p) => p.sessionScore))!) : undefined;

  // oldest → newest including current
  const scoreSeries = [...prev.slice(0, TREND_WINDOW - 1).map((p) => p.sessionScore)].reverse().concat(score);

  const dimensions: Record<string, DimensionDelta> = {};
  for (const d of input.dimensions) {
    if (!d.enabled) continue;
    const v = input.ratings[d.key];
    if (v == null) continue;
    const prevVals = prev.map((p) => p.ratings[d.key]).filter((x): x is number => x != null);
    const lastVal = last?.ratings[d.key];
    const pool = prevVals.slice(0, ROLLING_WINDOW);
    const rollingDim = pool.length >= ROLLING_MIN ? mean(pool)! : undefined;
    const series = prevVals
      .slice(0, TREND_WINDOW - 1)
      .reverse()
      .concat(v)
      .map(normalise);
    dimensions[d.key] = {
      value: v,
      deltaLast: lastVal != null ? round(v - lastVal) : undefined,
      deltaRolling: rollingDim != null ? round(v - rollingDim) : undefined,
      trend: trend(series),
    };
  }

  return {
    sessionScore: score,
    goalAccuracy: goalAccuracy(input.goalTrials),
    deltaLast: last ? round(score - last.sessionScore) : undefined,
    deltaRolling: rollingAverage != null ? round(score - rollingAverage) : undefined,
    rollingAverage,
    trend: trend(scoreSeries),
    dimensions,
    incidentCount: input.incidents.length,
  };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface AlertCheck {
  scoreDrop: boolean;
  incidentSpike: boolean;
}

/**
 * Score drop: this session AND the previous one are each >= threshold points below their rolling
 * average. Incident spike: incidents in this session >= incidentThreshold.
 */
export function checkAlerts(
  current: Pick<SessionMetrics, 'deltaRolling' | 'incidentCount'>,
  previous: PreviousSession | undefined,
  thresholds: { drop: number; incidents: number },
): AlertCheck {
  const isDrop = (d: number | undefined) => d != null && d <= -thresholds.drop;
  return {
    scoreDrop: isDrop(current.deltaRolling) && isDrop(previous?.deltaRolling),
    incidentSpike: current.incidentCount >= thresholds.incidents,
  };
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/**
 * Accuracies for one goal ordered oldest → newest (only sessions where it was attempted).
 * True when the last N are all >= rule.accuracy.
 */
export function masteryMet(accuracies: number[], rule: MasteryRule): boolean {
  if (accuracies.length < rule.consecutiveSessions) return false;
  return accuracies.slice(-rule.consecutiveSessions).every((a) => a >= rule.accuracy);
}

// ---------------------------------------------------------------------------
// Parent-facing wording
// ---------------------------------------------------------------------------

export type ParentChange = 'better' | 'same' | 'harder';

/** Per-dimension change in words. ±1 rating point is a real change; less is "same". */
export function dimensionChange(deltaLast: number | undefined): ParentChange {
  if (deltaLast == null) return 'same';
  if (deltaLast >= 1) return 'better';
  if (deltaLast <= -1) return 'harder';
  return 'same';
}

/** Overall change in words. ±5 points on the 0..100 score. */
export function overallChange(deltaLast: number | undefined): ParentChange {
  if (deltaLast == null) return 'same';
  if (deltaLast >= 5) return 'better';
  if (deltaLast <= -5) return 'harder';
  return 'same';
}
