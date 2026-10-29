/**
 * TanStack hooks for the resource library. Keys start with 'resources'.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { GoalDomain, Resource, UUID } from '@/domain/types';

export interface ResourceFilter {
  search?: string;
  therapyTypeKey?: string;
  domain?: GoalDomain;
  kind?: Resource['kind'];
}

export function useResources(filter: ResourceFilter, enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('resources', 'list', filter), queryFn: () => repo.resources.list(filter), enabled, placeholderData: (prev) => prev });
}

export function useResource(id: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('resources', 'detail', id), queryFn: () => repo.resources.get(id!), enabled: !!id });
}

export function useParentResources(childId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('resources', 'parent', childId), queryFn: () => repo.resources.forParent(childId!), enabled: !!childId });
}

export function useShareResource() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (v: { resourceId: UUID; childId: UUID; note?: string }) => repo.resources.share(v.resourceId, { childId: v.childId }, v.note),
    onSuccess: () => invalidate('resources', 'notifications'),
  });
}

export function useCreateResource() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (input: Omit<Resource, 'id' | 'organizationId' | 'createdAt'>) => repo.resources.create(input),
    onSuccess: () => invalidate('resources'),
  });
}
