/**
 * Pure chart-data builders for progress views. Charts render these; the same numbers feed the
 * accessible text summary under each chart, so what is drawn and what is read out always match.
 */
import { masteryMet, mean, round, trend as trendOf } from '@/domain/metrics';
import type {
  AttendanceSummary,
  GoalProgressPoint,
  ISODate,
  MasteryRule,
  SessionSummary,
  StaffProgress,
  Trend,
} from '@/domain/types';

export interface SeriesPoint {
  value: number;
  label: string;
  date: ISODate;
}

const byDate = <T extends { date: ISODate }>(list: T[]) => [...list].sort((a, b) => a.date.localeCompare(b.date));

/**
 * Thins x-axis labels so they never collide on a phone: keeps roughly `maxLabels` evenly spaced,
 * always including the last one.
 */
export function thinLabels<T extends { label: string }>(points: T[], maxLabels = 5): T[] {
  if (points.length <= maxLabels) return points;
  const every = Math.ceil(points.length / maxLabels);
  return points.map((p, i) => ((points.length - 1 - i) % every === 0 ? p : { ...p, label: '' }));
}

/** Session Score over time, oldest → newest. */
export function scoreSeries(sessions: SessionSummary[], formatLabel: (d: ISODate) => string): SeriesPoint[] {
  return byDate(sessions).map((s) => ({ value: s.sessionScore, label: formatLabel(s.date), date: s.date }));
}

export interface ScoreSummary {
  count: number;
  average?: number;
  latest?: number;
  /** Latest minus first in range. */
  change?: number;
  trend: Trend;
}

export function scoreSummary(sessions: SessionSummary[]): ScoreSummary {
  const values = byDate(sessions).map((s) => s.sessionScore);
  const avg = mean(values);
  return {
    count: values.length,
    average: avg == null ? undefined : Math.round(avg),
    latest: values.length ? values[values.length - 1] : undefined,
    change: values.length >= 2 ? round(values[values.length - 1] - values[0]) : undefined,
    trend: trendOf(values),
  };
}

/** Ratings for one dimension, oldest → newest, skipping sessions where it was not rated. */
export function dimensionSeries(sessions: SessionSummary[], key: string): number[] {
  return byDate(sessions)
    .map((s) => s.ratings[key])
    .filter((v): v is NonNullable<typeof v> => v != null)
    .map(Number);
}

/** Trend of a 1–5 dimension series, judged on the same 0–100 scale as the session score. */
export function dimensionTrend(values: number[]): Trend {
  return trendOf(values.map((v) => ((v - 1) / 4) * 100));
}

/**
 * Average rating per dimension over the 4 sessions BEFORE the latest one (oldest → newest input).
 * Used when the server did not supply `fourSessionAverage` (e.g. after a local filter).
 */
export function computeFourSessionAverage(sessions: SessionSummary[]): Record<string, number> {
  const sorted = byDate(sessions);
  const pool = sorted.slice(Math.max(0, sorted.length - 5), sorted.length - 1);
  const keys = new Set(pool.flatMap((s) => Object.keys(s.ratings)));
  const out: Record<string, number> = {};
  for (const k of keys) {
    const vals = pool.map((s) => s.ratings[k]).filter((v): v is NonNullable<typeof v> => v != null);
    const m = mean(vals);
    if (m != null) out[k] = round(m);
  }
  return out;
}

export interface DimensionComparisonRow {
  key: string;
  label: string;
  latest?: number;
  average?: number;
  /** latest − average (1 decimal). */
  diff?: number;
}

export function dimensionComparison(
  latest: Pick<SessionSummary, 'ratings'> | undefined,
  average: Record<string, number>,
  dims: { key: string; label: string }[],
): DimensionComparisonRow[] {
  return dims.map((d) => {
    const l = latest?.ratings[d.key];
    const a = average[d.key];
    return { key: d.key, label: d.label, latest: l, average: a, diff: l != null && a != null ? round(l - a) : undefined };
  });
}

/** Dimensions clearly above / below their recent average (±0.5 of a rating point). */
export function comparisonSummary(rows: DimensionComparisonRow[], threshold = 0.5): { higher: string[]; lower: string[] } {
  return {
    higher: rows.filter((r) => r.diff != null && r.diff >= threshold).map((r) => r.label),
    lower: rows.filter((r) => r.diff != null && r.diff <= -threshold).map((r) => r.label),
  };
}

export interface GroupedBar {
  value: number;
  frontColor: string;
  spacing: number;
  label?: string;
  barWidth: number;
}

/**
 * Grouped bars for gifted-charts: per dimension one "4-session average" bar then one "latest" bar.
 * The label sits under the first bar of each pair; spacing separates pairs.
 */
export function groupedBarData(
  rows: DimensionComparisonRow[],
  opts: { averageColor: string; latestColor: string; barWidth: number; innerGap: number; groupGap: number; shortLabel?: (label: string) => string },
): GroupedBar[] {
  const out: GroupedBar[] = [];
  for (const r of rows) {
    if (r.latest == null && r.average == null) continue;
    out.push({
      value: r.average ?? 0,
      frontColor: opts.averageColor,
      spacing: opts.innerGap,
      label: opts.shortLabel ? opts.shortLabel(r.label) : r.label,
      barWidth: opts.barWidth,
    });
    out.push({ value: r.latest ?? 0, frontColor: opts.latestColor, spacing: opts.groupGap, barWidth: opts.barWidth });
  }
  return out;
}

/** Goal accuracy per session where the goal was attempted, oldest → newest. */
export function accuracySeries(points: GoalProgressPoint[], formatLabel: (d: ISODate) => string): SeriesPoint[] {
  return byDate(points).map((p) => ({ value: p.accuracy, label: formatLabel(p.date), date: p.date }));
}

/** A flat line at the mastery accuracy, one point per session (drawn as a dashed second series). */
export function masteryLine(length: number, accuracy: number): number[] {
  return Array.from({ length }, () => accuracy);
}

export interface MasteryProgress {
  sessions: number;
  /** Sessions at or above the rule's accuracy. */
  atOrAbove: number;
  /** Consecutive most-recent sessions at or above. */
  streak: number;
  met: boolean;
  latest?: number;
}

export function masteryProgress(points: GoalProgressPoint[], rule: MasteryRule): MasteryProgress {
  const acc = byDate(points).map((p) => p.accuracy);
  let streak = 0;
  for (let i = acc.length - 1; i >= 0 && acc[i] >= rule.accuracy; i--) streak++;
  return {
    sessions: acc.length,
    atOrAbove: acc.filter((a) => a >= rule.accuracy).length,
    streak,
    met: masteryMet(acc, rule),
    latest: acc.length ? acc[acc.length - 1] : undefined,
  };
}

export interface SubstituteImpact {
  /** substitute average − regular average, rounded to whole points. */
  diff: number;
  direction: 'lower' | 'higher' | 'same';
  count: number;
}

/** "Sessions with substitutes averaged 6 points lower". Null when there were no substitute sessions. */
export function substituteImpact(impact: StaffProgress['substituteImpact']): SubstituteImpact | null {
  if (!impact || impact.substituteCount === 0) return null;
  const diff = Math.round(impact.substituteAvg - impact.regularAvg);
  return { diff: Math.abs(diff), direction: diff <= -2 ? 'lower' : diff >= 2 ? 'higher' : 'same', count: impact.substituteCount };
}

export interface AttendanceCounts {
  attended: number;
  /** Sessions the child was expected at: attended + absent + cancelled by parent. */
  expected: number;
  late: number;
  absent: number;
  cancelledByParent: number;
  cancelledBySchool: number;
}

/**
 * "8 of 9 sessions attended". School cancellations are not counted against the family; they are
 * reported separately.
 */
export function attendanceCounts(a: AttendanceSummary): AttendanceCounts {
  return {
    attended: a.attended,
    expected: a.attended + a.absent + a.cancelledByParent,
    late: a.late,
    absent: a.absent,
    cancelledByParent: a.cancelledByParent,
    cancelledBySchool: a.cancelledBySchool,
  };
}

export function incidentSeries(byWeek: StaffProgress['incidentsByWeek'], formatLabel: (d: ISODate) => string): SeriesPoint[] {
  return [...byWeek]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({ value: w.count, label: formatLabel(w.weekStart), date: w.weekStart }));
}

/** A tidy chart ceiling: at least `floor`, rounded up to `step`. */
export function niceMax(values: number[], floor: number, step = 1): number {
  const m = Math.max(floor, ...values);
  return Math.ceil(m / step) * step;
}
