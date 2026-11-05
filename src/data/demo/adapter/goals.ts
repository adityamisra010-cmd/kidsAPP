/** Goals with derived stats, mastery confirmation (Wins) and the goal bank. */
import type { GoalsRepo } from '@/data/repository';
import { RepoError } from '@/data/repository';
import { goalProgressPoints, trialRecordsForGoal } from '@/domain/derive';
import type { Goal } from '@/domain/types';
import { uuid } from '@/lib/id';

import type { DemoCore } from './core';
import { childSessions, goalsWithStats, statsFor } from './queries';

export function createGoalsRepo(core: DemoCore): GoalsRepo {
  const st = core.db;
  const load = (goalId: string, staffOnly = false): Goal => {
    const goal = core.sameOrg(st.goals.find((g) => g.id === goalId), 'Goal');
    core.requireChild(goal.childId, staffOnly ? ['full'] : ['full', 'brief_only', 'parent']);
    return goal;
  };
  const validate = (g: Partial<Goal>) => {
    if (g.staffText != null && !g.staffText.trim()) throw new RepoError('validation', 'Staff wording is required.');
    if (g.parentText != null && !g.parentText.trim()) throw new RepoError('validation', 'Parent-friendly wording is required.');
    if (g.masteryRule && (g.masteryRule.accuracy <= 0 || g.masteryRule.accuracy > 100 || g.masteryRule.consecutiveSessions < 1)) {
      throw new RepoError('validation', 'Mastery needs an accuracy of 1–100% over at least 1 session.');
    }
  };
  return {
    listForChild: (childId, filter) =>
      core.run(() => {
        core.requireChild(childId);
        return goalsWithStats(core, childId, filter);
      }),
    get: (goalId) => core.run(() => statsFor(core, load(goalId))),
    create: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        core.requireChild(input.childId, ['full']);
        core.therapyType(input.therapyTypeId);
        validate(input);
        if (!input.staffText || !input.parentText) throw new RepoError('validation', 'Staff and parent wording are required.');
        const goal: Goal = { ...input, id: uuid(), organizationId: ctx.organizationId, createdBy: ctx.userId, createdAt: core.nowIso() };
        st.goals.push(goal);
        core.audit('goal.create', 'goal', goal.id);
        return goal;
      }),
    update: (goalId, patch) =>
      core.run(() => {
        core.requireStaff();
        const goal = load(goalId, true);
        validate(patch);
        Object.assign(goal, patch);
        core.audit('goal.update', 'goal', goalId, { keys: Object.keys(patch) });
        return goal;
      }),
    setStatus: (goalId, status) =>
      core.run(() => {
        core.requireStaff();
        const goal = load(goalId, true);
        if (status === 'mastered' && goal.status !== 'mastered') goal.masteredAt = core.nowIso();
        if (status !== 'mastered' && status !== 'maintenance') goal.masteredAt = undefined;
        goal.status = status;
        core.audit('goal.set_status', 'goal', goalId, { status });
        return goal;
      }),
    progress: (goalId) =>
      core.run(() => {
        const goal = load(goalId);
        return goalProgressPoints(trialRecordsForGoal(goal.id, childSessions(core, goal.childId, goal.therapyTypeId)));
      }),
    wins: (childId) =>
      core.run(() => {
        core.requireChild(childId);
        return st.goals
          .filter((g) => g.childId === childId && (g.status === 'mastered' || g.status === 'maintenance'))
          .sort((a, b) => (b.masteredAt ?? '').localeCompare(a.masteredAt ?? ''));
      }),
    listBank: (filter) =>
      core.run(() => {
        const ctx = core.requireCtx();
        const q = filter?.search?.trim().toLowerCase();
        return st.goalBank.filter(
          (g) =>
            (g.organizationId === null || g.organizationId === ctx.organizationId) &&
            (!filter?.domain || g.domain === filter.domain) &&
            (!filter?.therapyTypeKey || g.therapyTypeKey === filter.therapyTypeKey) &&
            (!q || g.staffText.toLowerCase().includes(q) || g.parentText.toLowerCase().includes(q)),
        );
      }),
    addToBank: (input) =>
      core.run(() => {
        const ctx = core.requireStaff();
        if (!input.staffText.trim() || !input.parentText.trim()) throw new RepoError('validation', 'Both staff and parent wording are required.');
        const item = { ...input, id: uuid(), organizationId: ctx.organizationId };
        st.goalBank.push(item);
        return item;
      }),
  };
}
