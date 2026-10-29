/** Progress helpers: staff averages, incidents, substitute impact and parent words + arrows. */
import { addDaysISO, toISODate, weekStart } from '@/lib/dates';

import { mean, normalise, round, trend } from '../metrics';

import { compareSessions } from './sessions';
import type {
  AttendanceSummary,
  Goal,
  GoalDomain,
  ISODate,
  ParentProgress,
  ProgressPeriod,
  RatingDimension,
  SessionLog,
  TherapyType,
  UUID,
} from '../types';

const PERIOD_DAYS: Record<ProgressPeriod, number> = { week: 7, month: 30, quarter: 91 };

export function periodStart(period: ProgressPeriod, now: Date): ISODate {
  return addDaysISO(toISODate(now), -(PERIOD_DAYS[period] - 1));
}

/** Average rating per dimension over the (up to) 4 sessions before the latest. Input oldest → newest. */
export function fourSessionAverage(oldestFirst: Pick<SessionLog, 'ratings'>[]): Record<string, number> {
  const pool = oldestFirst.slice(0, -1).slice(-4);
  const keys = new Set(pool.flatMap((s) => Object.keys(s.ratings)));
  const out: Record<string, number> = {};
  for (const k of keys) {
    const avg = mean(pool.map((s) => s.ratings[k]).filter((v): v is NonNullable<typeof v> => v != null));
    if (avg != null) out[k] = round(avg);
  }
  return out;
}

export function incidentsByWeek(sessions: Pick<SessionLog, 'date' | 'metrics'>[]): { weekStart: ISODate; count: number }[] {
  const byWeek = new Map<ISODate, number>();
  for (const s of sessions) {
    const w = weekStart(s.date);
    byWeek.set(w, (byWeek.get(w) ?? 0) + s.metrics.incidentCount);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, count]) => ({ weekStart: w, count }));
}

export function substituteImpact(
  sessions: Pick<SessionLog, 'isSubstitute' | 'metrics'>[],
): { regularAvg: number; substituteAvg: number; substituteCount: number } | undefined {
  const subs = sessions.filter((s) => s.isSubstitute).map((s) => s.metrics.sessionScore);
  const regular = sessions.filter((s) => !s.isSubstitute).map((s) => s.metrics.sessionScore);
  if (subs.length === 0 || regular.length === 0) return undefined;
  return { regularAvg: round(mean(regular)!), substituteAvg: round(mean(subs)!), substituteCount: subs.length };
}

/** Overall trend of session scores (oldest → newest). */
export function scoreTrend(oldestFirst: Pick<SessionLog, 'metrics'>[]): ReturnType<typeof trend> {
  return trend(oldestFirst.map((s) => s.metrics.sessionScore));
}

export function goalsByDomain(goals: Pick<Goal, 'domain' | 'status'>[]): ParentProgress['goalsSummary'] {
  const map = new Map<GoalDomain, { achieved: number; inProgress: number }>();
  for (const g of goals) {
    const row = map.get(g.domain) ?? { achieved: 0, inProgress: 0 };
    if (g.status === 'mastered' || g.status === 'maintenance') row.achieved++;
    else if (g.status !== 'paused') row.inProgress++;
    map.set(g.domain, row);
  }
  return [...map.entries()].map(([domain, v]) => ({ domain, ...v }));
}

/** Parent progress: words + arrows per dimension per therapy over the period. */
export function parentProgress(input: {
  childId: UUID;
  period: ProgressPeriod;
  now: Date;
  sessions: SessionLog[];
  dimensions: RatingDimension[];
  therapyTypes: Pick<TherapyType, 'id' | 'name' | 'color'>[];
  goals: Pick<Goal, 'domain' | 'status'>[];
  attendance: AttendanceSummary;
  homePracticeCompletion: number;
}): ParentProgress {
  const from = periodStart(input.period, input.now);
  const inPeriod = input.sessions.filter((s) => s.childId === input.childId && s.date >= from).sort(compareSessions);
  const dims = input.dimensions.filter((d) => d.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  const byTherapy = input.therapyTypes
    .map((tt) => {
      const list = inPeriod.filter((s) => s.therapyTypeId === tt.id);
      return {
        therapyTypeId: tt.id,
        therapyTypeName: tt.name,
        therapyTypeColor: tt.color,
        sessionsCount: list.length,
        dimensions: dims
          .map((d) => {
            const values = list.map((s) => s.ratings[d.key]).filter((v): v is NonNullable<typeof v> => v != null);
            return { key: d.key, label: d.parentLabel, icon: d.icon, trend: trend(values.map(normalise)), recent: values.slice(-4) };
          })
          .filter((d) => d.recent.length > 0),
      };
    })
    .filter((t) => t.sessionsCount > 0);
  return {
    childId: input.childId,
    period: input.period,
    byTherapy,
    goalsSummary: goalsByDomain(input.goals),
    attendance: input.attendance,
    homePracticeCompletion: input.homePracticeCompletion,
  };
}
