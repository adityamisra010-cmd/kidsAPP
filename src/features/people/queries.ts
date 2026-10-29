/** TanStack hooks for the People tab: invites, member settings. */
import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { Invite, UUID } from '@/domain/types';
import { useActive } from '@/state/session';

export function useInvites() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useQuery({ queryKey: key('org', orgId, 'invites'), queryFn: () => repo.org.listInvites(orgId!), enabled: !!orgId });
}

export function useCreateInvite() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (input: Omit<Invite, 'id' | 'status' | 'createdAt' | 'createdBy'>) => repo.org.createInvite(input),
    onSuccess: () => invalidate('org'),
  });
}

export function useRevokeInvite() {
  const repo = useRepo();
  return useMutation({ mutationFn: (inviteId: UUID) => repo.org.revokeInvite(inviteId), onSuccess: () => invalidate('org') });
}

export function useSetMemberTherapyTypes() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useMutation({
    mutationFn: (v: { userId: UUID; therapyTypeIds: UUID[] }) => repo.org.setMemberTherapyTypes(orgId!, v.userId, v.therapyTypeIds),
    onSuccess: () => invalidate('org', 'appointments'),
  });
}

export function useSetMemberStatus() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (v: { membershipId: UUID; status: 'active' | 'suspended' }) => repo.org.setMemberStatus(v.membershipId, v.status),
    onSuccess: () => invalidate('org', 'children', 'dashboards'),
  });
}
