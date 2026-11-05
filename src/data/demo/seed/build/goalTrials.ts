/** Which goals each session targets, and believable accuracies per goal scenario. */
import type { Appointment, Goal, ISODate, UUID } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';

import { rng, type Rng } from '../../rng';
import type { GoalSeed } from '../content/types';
import { apptDate } from './apptOps';
import { dayDiff, dayOffset, type Build } from './context';
import { PAST_DAYS } from './schedule';

export interface TrialPlan {
  dates: ISODate[];
  goals: UUID[][];
}

const masteredDate = (g: Goal) => (g.masteredAt ? toISODate(parse(g.masteredAt)) : undefined);

export function planTrials(list: Appointment[], goals: Goal[], seeds: Map<UUID, GoalSeed>): TrialPlan {
  const dates = list.map(apptDate);
  const plan = list.map((a, i) => {
    const r = rng(`trials:${a.id}`);
    const d = dates[i];
    const started = goals.filter((g) => g.startDate <= d && seeds.get(g.id)?.scenario !== 'not_started');
    const active = started.filter((g) => !masteredDate(g) || d < masteredDate(g)!);
    const probes = started.filter((g) => masteredDate(g) && d >= masteredDate(g)!);
    const picked = active.length > 3 ? r.sample(active, 3) : [...active];
    if (picked.length === 0 && probes.length) picked.push(r.pick(probes));
    else if (picked.length < 3 && probes.length && r.chance(0.3)) picked.push(r.pick(probes));
    return picked.map((g) => g.id);
  });
  return { dates, goals: plan };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Target accuracy (0–100) for this goal in session `i` of the plan. */
export function goalAccuracy(b: Build, goal: Goal, seed: GoalSeed, plan: TrialPlan, i: number, r: Rng): number {
  const idx = plan.goals.map((g, j) => (g.includes(goal.id) ? j : -1)).filter((j) => j >= 0);
  const k = idx.indexOf(i);
  const d = plan.dates[i];
  const windowStart = goal.startDate > dayOffset(b, -PAST_DAYS) ? goal.startDate : dayOffset(b, -PAST_DAYS);
  const span = (to: ISODate) => clamp(dayDiff(windowStart, d) / Math.max(1, dayDiff(windowStart, to)), 0, 1);
  const jitter = r.normal() * 6;
  switch (seed.scenario) {
    case 'emerging':
      return clamp(25 + 25 * span(b.today) + jitter, 5, 55);
    case 'progressing':
      return clamp(45 + 30 * span(b.today) + jitter, 20, 78);
    case 'suggest':
      return k >= idx.length - 3 ? clamp(87 + r.normal() * 4, 81, 100) : clamp(55 + 25 * span(b.today) + jitter, 30, 78);
    case 'mastered':
    case 'maintenance': {
      const md = masteredDate(goal)!;
      if (d >= md) return clamp(90 + r.normal() * 5, 82, 100);
      const before = idx.filter((j) => plan.dates[j] < md);
      if (before.indexOf(i) >= before.length - 3) return clamp(87 + r.normal() * 4, 81, 100);
      return clamp(50 + 28 * span(md) + jitter, 25, 78);
    }
    default:
      return 40;
  }
}

/** Successful trials for a target accuracy, keeping the 80% mastery line on the intended side. */
export function successfulFor(acc: number, attempted: number): number {
  let s = Math.min(attempted, Math.max(0, Math.round((acc / 100) * attempted)));
  const line = Math.ceil(0.8 * attempted);
  if (acc >= 80 && s < line) s = line;
  if (acc < 80 && s >= line) s = line - 1;
  return s;
}

