/**
 * Pure formatting for the coordinator / school admin dashboard (staff view: percentages are fine here).
 */
import type { AdminDashboard, UUID } from '@/domain/types';

export type RateTone = 'success' | 'neutral' | 'warning';

/** 0..100, rounded; NaN/undefined become 0. */
export function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function formatPercent(value: number | null | undefined): string {
  return `${clampPercent(value)}%`;
}

/** Calm three-step scale: 90+ good, 70–89 fine, below 70 needs a look. */
export function rateTone(percent: number): RateTone {
  const p = clampPercent(percent);
  if (p >= 90) return 'success';
  if (p >= 70) return 'neutral';
  return 'warning';
}

export interface ComplianceRow {
  therapistId: UUID;
  name: string;
  logged: number;
  due: number;
  percent: number;
  /** 0..1 for the progress bar. */
  fraction: number;
  tone: RateTone;
  /** No sessions were due this week. */
  noneDue: boolean;
}

/** Lowest compliance first, so the people who need a nudge are at the top. */
export function complianceRows(list: AdminDashboard['week']['loggingCompliance']): ComplianceRow[] {
  return list
    .map((r) => {
      const noneDue = r.due <= 0;
      const percent = noneDue ? 100 : clampPercent(Number.isFinite(r.percent) ? r.percent : (r.logged / r.due) * 100);
      return {
        therapistId: r.therapistId,
        name: r.name,
        logged: Math.max(0, r.logged),
        due: Math.max(0, r.due),
        percent,
        fraction: noneDue ? 0 : Math.min(1, Math.max(0, r.logged / r.due)),
        tone: noneDue ? ('neutral' as const) : rateTone(percent),
        noneDue,
      };
    })
    .sort((a, b) => Number(a.noneDue) - Number(b.noneDue) || a.percent - b.percent || a.name.localeCompare(b.name));
}

export interface WorkloadRow {
  therapistId: UUID;
  name: string;
  sessions: number;
  /** Relative to the busiest therapist, 0..1. */
  fraction: number;
}

/** Busiest first; bars are relative to the busiest therapist. */
export function workloadRows(list: AdminDashboard['workload']): WorkloadRow[] {
  const max = Math.max(0, ...list.map((w) => w.sessionsThisWeek));
  return [...list]
    .sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek || a.name.localeCompare(b.name))
    .map((w) => ({
      therapistId: w.therapistId,
      name: w.name,
      sessions: w.sessionsThisWeek,
      fraction: max > 0 ? w.sessionsThisWeek / max : 0,
    }));
}

export type TodayTileKey = keyof AdminDashboard['today'];

/** Fixed order for the "Today" tiles. */
export const TODAY_TILE_ORDER: TodayTileKey[] = ['scheduled', 'completed', 'logged', 'unlogged', 'cancelled'];

export function todayTiles(today: AdminDashboard['today']): { key: TodayTileKey; value: number }[] {
  return TODAY_TILE_ORDER.map((k) => ({ key: k, value: Math.max(0, today[k] ?? 0) }));
}

/** Number of items that need a coordinator's action today (for the header summary). */
export function actionCount(d: Pick<AdminDashboard, 'unloggedSessions' | 'needsSubstitute' | 'pendingReschedules'>): number {
  return d.unloggedSessions.length + d.needsSubstitute.length + d.pendingReschedules.length;
}
