/** TanStack hooks for goals, wins and the goal bank. */
import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { Goal, GoalBankItem, GoalStatus, UUID } from '@/domain/types';

import type { GoalCreateInput } from './goalForm';

/** Everything a goal change can affect: lists, brief, progress, reports, dashboards. */
const goalRoots = ['goals', 'children', 'sessions', 'progress', 'reports', 'dashboards'] as const;

export function useGoal(goalId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('goals', 'detail', goalId), queryFn: () => repo.goals.get(goalId!), enabled: !!goalId });
}

export function useGoalProgress(goalId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('goals', 'progress', goalId), queryFn: () => repo.goals.progress(goalId!), enabled: !!goalId });
}

export function useWins(childId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('goals', 'wins', childId), queryFn: () => repo.goals.wins(childId!), enabled: !!childId });
}

export function useGoalBank() {
  const repo = useRepo();
  return useQuery({ queryKey: key('goals', 'bank'), queryFn: () => repo.goals.listBank(), staleTime: 5 * 60_000 });
}

export function useSetGoalStatus() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (v: { goalId: UUID; status: GoalStatus }) => repo.goals.setStatus(v.goalId, v.status),
    onSuccess: () => invalidate(...goalRoots),
  });
}

export function useUpdateGoal(goalId: UUID) {
  const repo = useRepo();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Goal, 'staffText' | 'parentText' | 'baseline' | 'masteryRule' | 'domain'>>) => repo.goals.update(goalId, patch),
    onSuccess: () => invalidate(...goalRoots),
  });
}

export function useCreateGoal() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (input: GoalCreateInput) => repo.goals.create(input),
    onSuccess: () => invalidate(...goalRoots),
  });
}

export function useAddToBank() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (input: Omit<GoalBankItem, 'id' | 'organizationId'>) => repo.goals.addToBank(input),
    onSuccess: () => invalidate('goals'),
  });
}
