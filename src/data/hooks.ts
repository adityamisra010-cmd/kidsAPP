/**
 * Common read hooks shared across features (thin wrappers over the repository).
 * Feature-specific queries live in each feature's own `queries.ts`.
 */
import { useQuery } from '@tanstack/react-query';

import type { ChildFilter } from './repository';
import { useRepo } from './index';
import { key } from './queryClient';
import type { Role, UUID } from '@/domain/types';
import { useActive } from '@/state/session';

export function useOrg() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useQuery({ queryKey: key('org', orgId), queryFn: () => repo.org.get(orgId!), enabled: !!orgId });
}

export function useTherapyTypes() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useQuery({ queryKey: key('org', orgId, 'therapyTypes'), queryFn: () => repo.org.listTherapyTypes(orgId!), enabled: !!orgId, staleTime: 5 * 60_000 });
}

export function useRatingDimensions() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useQuery({ queryKey: key('org', orgId, 'dimensions'), queryFn: () => repo.org.listRatingDimensions(orgId!), enabled: !!orgId, staleTime: 5 * 60_000 });
}

export function useMembers(roles?: Role[]) {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useQuery({ queryKey: key('org', orgId, 'members', roles ?? 'all'), queryFn: () => repo.org.listMembers(orgId!, roles), enabled: !!orgId });
}

export function useChildren(filter?: ChildFilter) {
  const repo = useRepo();
  return useQuery({ queryKey: key('children', 'list', filter ?? {}), queryFn: () => repo.children.list(filter) });
}

export function useChildDetail(childId: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('children', 'detail', childId), queryFn: () => repo.children.get(childId!), enabled: !!childId });
}

export function useGoals(childId: UUID | null | undefined, therapyTypeId?: UUID) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('goals', 'child', childId, therapyTypeId ?? 'all'),
    queryFn: () => repo.goals.listForChild(childId!, therapyTypeId ? { therapyTypeId } : undefined),
    enabled: !!childId,
  });
}

export function useAppointment(id: UUID | null | undefined) {
  const repo = useRepo();
  return useQuery({ queryKey: key('appointments', 'detail', id), queryFn: () => repo.appointments.get(id!), enabled: !!id });
}

export function useUpcoming(opts?: { childId?: UUID; limit?: number }) {
  const repo = useRepo();
  return useQuery({ queryKey: key('appointments', 'upcoming', opts ?? {}), queryFn: () => repo.appointments.upcoming(opts) });
}

export function useUnreadCounts() {
  const repo = useRepo();
  const notifications = useQuery({ queryKey: key('notifications', 'unread'), queryFn: () => repo.notifications.unreadCount(), refetchInterval: 60_000 });
  const messages = useQuery({ queryKey: key('messaging', 'unread'), queryFn: () => repo.messaging.unreadCount(), refetchInterval: 60_000 });
  return { notifications: notifications.data ?? 0, messages: messages.data ?? 0 };
}
