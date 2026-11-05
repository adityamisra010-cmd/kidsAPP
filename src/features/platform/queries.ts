import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { GoalBankItem } from '@/domain/types';
import { useInvalidate } from '@/features/home/components/useRefresh';

export function useSchools() {
  const repo = useRepo();
  return useQuery({ queryKey: key('platform', 'schools'), queryFn: () => repo.platform.listSchools() });
}

export function useGlobalDimensions(enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('platform', 'dimensions'), queryFn: () => repo.platform.listGlobalDimensions(), enabled, staleTime: 5 * 60_000 });
}

export function useGlobalGoalBank(enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('platform', 'goalBank'), queryFn: () => repo.platform.listGlobalGoalBank(), enabled });
}

export function useGlobalResources(enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('platform', 'resources'), queryFn: () => repo.platform.listGlobalResources(), enabled });
}

export function useSetSchoolStatus() {
  const repo = useRepo();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ orgId, status }: { orgId: string; status: 'active' | 'suspended' }) => repo.platform.setSchoolStatus(orgId, status),
    onSettled: () => invalidate('platform'),
  });
}

export function useSaveGoalBankItem() {
  const repo = useRepo();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Omit<GoalBankItem, 'id' | 'organizationId'> & { id?: string }) => repo.platform.upsertGlobalGoalBankItem(input),
    onSettled: () => invalidate('platform', 'goals'),
  });
}
