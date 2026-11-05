/**
 * Goals with derived stats (last accuracy, prompt level, mastery suggestion) computed from one
 * batched goal_trials query. Parents read parent-safe goals through the parent_goals RPC.
 */
import type { Goal, GoalProgressPoint, GoalWithStats, UUID } from '@/domain/types';

import { RepoError, type GoalsRepo } from '../repository';
import type { AdapterContext } from './context';
import { goalStats, todayIST } from './derive-local';
import { goalBankFromRow, goalFromRow, goalToRow, masteryRule, promptLevel } from './mappers';
import { goalFromParentJson } from './mappers-rpc';
import { ilikeAny, inChunks, many, rpc, searchTerm, single } from './query';
import type { GoalBankRow, GoalRow, GoalTrialWithSessionRow, ParentGoalJson } from './rows';

const TRIAL_SELECT = 'session_id,goal_id,attempted,successful,prompt_level,note, session:sessions(date, appointment:appointments(starts_at))';

function trialTime(t: GoalTrialWithSessionRow): string {
  return t.session?.appointment?.starts_at ?? `${t.session?.date ?? ''}T00:00:00Z`;
}

/** goal_trials for the goals, grouped per goal, oldest → newest. */
export async function trialsByGoal(c: AdapterContext, goalIds: UUID[]): Promise<Map<UUID, GoalTrialWithSessionRow[]>> {
  const rows = await inChunks(goalIds, (part) => many<GoalTrialWithSessionRow>(c.sb.from('goal_trials').select(TRIAL_SELECT).in('goal_id', part)));
  rows.sort((a, b) => Date.parse(trialTime(a)) - Date.parse(trialTime(b)));
  const out = new Map<UUID, GoalTrialWithSessionRow[]>();
  for (const r of rows) out.set(r.goal_id, [...(out.get(r.goal_id) ?? []), r]);
  return out;
}

export function progressPoints(trials: GoalTrialWithSessionRow[]): GoalProgressPoint[] {
  return trials
    .filter((t) => t.attempted > 0)
    .map((t) => ({
      date: t.session?.date ?? '',
      sessionId: t.session_id,
      accuracy: Math.round((Math.min(t.successful, t.attempted) / t.attempted) * 1000) / 10,
      attempted: t.attempted,
      successful: t.successful,
      promptLevel: promptLevel(t.prompt_level),
    }));
}

export function withStats(goal: Goal, trials: GoalTrialWithSessionRow[]): GoalWithStats {
  return {
    ...goal,
    ...goalStats(
      goal,
      trials.map((t) => ({ attempted: t.attempted, successful: t.successful, promptLevel: promptLevel(t.prompt_level) })),
    ),
  };
}

/** Staff: goals of a child with stats (2 queries). */
export async function staffGoals(
  c: AdapterContext,
  childId: UUID,
  filter?: { therapyTypeId?: UUID; status?: Goal['status'][] },
): Promise<(GoalWithStats & { points: GoalProgressPoint[] })[]> {
  let q = c.sb.from('goals').select('*').eq('child_id', childId);
  if (filter?.therapyTypeId) q = q.eq('therapy_type_id', filter.therapyTypeId);
  if (filter?.status?.length) q = q.in('status', filter.status);
  const goals = (await many<GoalRow>(q.order('start_date').order('created_at'))).map(goalFromRow);
  const trials = await trialsByGoal(c, goals.map((g) => g.id));
  return goals.map((g) => {
    const t = trials.get(g.id) ?? [];
    return { ...withStats(g, t), points: progressPoints(t) };
  });
}

/** Parents: goals through parent_goals() (no staff wording, baseline or mastery rule). */
export async function parentGoals(c: AdapterContext, childId: UUID): Promise<GoalWithStats[]> {
  const rows = await rpc<ParentGoalJson[] | null>(c.sb, 'parent_goals', { child_id: childId });
  const org = c.orgOrNull() ?? '';
  return (rows ?? []).map((r) => goalFromParentJson(r, org));
}

export function createGoalsRepo(c: AdapterContext): GoalsRepo {
  const sb = c.sb;

  async function update(goalId: UUID, values: Record<string, unknown>): Promise<Goal> {
    return goalFromRow(await single<GoalRow>(sb.from('goals').update(values).eq('id', goalId).select('*'), 'goal'));
  }

  return {
    async listForChild(childId, filter) {
      if (c.isParent()) {
        const all = await parentGoals(c, childId);
        return all.filter(
          (g) => (!filter?.therapyTypeId || g.therapyTypeId === filter.therapyTypeId) && (!filter?.status?.length || filter.status.includes(g.status)),
        );
      }
      return (await staffGoals(c, childId, filter)).map(({ points: _points, ...g }) => g);
    },

    async get(goalId) {
      if (c.isParent()) {
        const childIds = await c.guardianChildIds();
        const lists = await Promise.all(childIds.map((id) => parentGoals(c, id)));
        const hit = lists.flat().find((g) => g.id === goalId);
        if (!hit) throw new RepoError('not_found', 'goal not found');
        return hit;
      }
      const goal = goalFromRow(await single<GoalRow>(sb.from('goals').select('*').eq('id', goalId), 'goal'));
      const trials = await trialsByGoal(c, [goalId]);
      return withStats(goal, trials.get(goalId) ?? []);
    },

    async create(input) {
      const values = goalToRow({
        ...input,
        masteryRule: masteryRule(input.masteryRule),
        startDate: input.startDate || todayIST(c.now()),
      });
      return goalFromRow(await single<GoalRow>(sb.from('goals').insert(values).select('*'), 'goal'));
    },

    async update(goalId, patch) {
      const values = goalToRow(patch);
      if (patch.status === 'mastered' && patch.masteredAt === undefined) values.mastered_at = c.now().toISOString();
      return update(goalId, values);
    },

    async setStatus(goalId, status) {
      const current = await single<Pick<GoalRow, 'status' | 'mastered_at'>>(sb.from('goals').select('status,mastered_at').eq('id', goalId), 'goal');
      const values: Record<string, unknown> = { status };
      if (status === 'mastered' && !current.mastered_at) values.mastered_at = c.now().toISOString();
      // Leaving Wins (back to working on it) clears the mastery date; maintenance keeps it.
      if (status !== 'mastered' && status !== 'maintenance') values.mastered_at = null;
      return update(goalId, values);
    },

    async progress(goalId) {
      if (c.isParent()) throw new RepoError('forbidden', 'Goal trial data is staff-only');
      const trials = await trialsByGoal(c, [goalId]);
      return progressPoints(trials.get(goalId) ?? []);
    },

    async wins(childId) {
      const winning = new Set(['mastered', 'maintenance']);
      const goals: Goal[] = c.isParent()
        ? (await parentGoals(c, childId)).filter((g) => winning.has(g.status))
        : (await many<GoalRow>(sb.from('goals').select('*').eq('child_id', childId).in('status', ['mastered', 'maintenance']))).map(goalFromRow);
      return goals.sort((a, b) => (b.masteredAt ?? b.startDate).localeCompare(a.masteredAt ?? a.startDate));
    },

    async listBank(filter) {
      const org = c.orgOrNull();
      let q = sb.from('goal_bank').select('*');
      if (!org) q = q.is('organization_id', null);
      if (filter?.domain) q = q.eq('domain', filter.domain);
      if (filter?.therapyTypeKey) q = q.eq('therapy_type_key', filter.therapyTypeKey);
      const term = searchTerm(filter?.search);
      if (term) q = q.or(ilikeAny(['staff_text', 'parent_text'], term));
      const rows = await many<GoalBankRow>(q.order('domain').order('staff_text').limit(1000));
      // RLS returns global items plus every school the user works at; keep the active school's.
      return rows.filter((r) => r.organization_id == null || r.organization_id === org).map(goalBankFromRow);
    },

    async addToBank(input) {
      const row = await single<GoalBankRow>(
        sb
          .from('goal_bank')
          .insert({
            organization_id: c.requireOrg(),
            domain: input.domain,
            therapy_type_key: input.therapyTypeKey,
            staff_text: input.staffText.trim(),
            parent_text: input.parentText.trim(),
          })
          .select('*'),
        'goal bank item',
      );
      return goalBankFromRow(row);
    },
  };
}
