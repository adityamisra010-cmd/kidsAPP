/** TanStack hooks for child profiles, workspace sections and caseload. */
import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { Child, ChildTherapist, ISODate, UUID } from '@/domain/types';

import type { ProfilePatch } from './profileDiff';

export function useProfileHistory(childId: UUID | undefined, enabled = true) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('children', 'history', childId),
    queryFn: () => repo.children.profileHistory(childId!),
    enabled: !!childId && enabled,
  });
}

export function useUpdateProfile(childId: UUID) {
  const repo = useRepo();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => repo.children.updateProfile(childId, patch),
    // The Handover Brief (sessions root) shows About Me, so refresh it too.
    onSuccess: () => invalidate('children', 'sessions'),
  });
}

export function useChildSessions(childId: UUID | undefined, opts?: { therapyTypeId?: UUID; from?: ISODate; to?: ISODate; limit?: number }) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'child', childId, opts ?? {}),
    queryFn: () => repo.sessions.listForChild(childId!, opts),
    enabled: !!childId,
  });
}

export function useParentSnapshots(childId: UUID | undefined, limit: number) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'parentSnapshots', childId, limit),
    queryFn: () => repo.sessions.parentSnapshots(childId!, { limit }),
    enabled: !!childId,
    placeholderData: (prev) => prev,
  });
}

export function useChildHomeTasks(childId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('homePractice', 'tasks', { childId }),
    queryFn: () => repo.homePractice.listTasks({ childId }),
    enabled: !!childId,
  });
}

export function useChildThreads(childId: UUID | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('messaging', 'child', childId),
    queryFn: () => repo.messaging.threadsForChild(childId!),
    enabled: !!childId,
  });
}

export type NewChildInput = Omit<Child, 'id' | 'organizationId' | 'createdAt' | 'status'>;

export function useCreateChild() {
  const repo = useRepo();
  return useMutation({
    mutationFn: async (input: {
      child: NewChildInput;
      therapists: Omit<ChildTherapist, 'childId' | 'activeFrom'>[];
      guardians: { userId: UUID; relation: string; isPrimary: boolean }[];
      invite?: { organizationId: UUID; fullName: string; phone: string; relation: string };
    }) => {
      const child = await repo.children.create(input.child);
      for (const t of input.therapists) await repo.children.assignTherapist({ ...t, childId: child.id });
      for (const g of input.guardians) await repo.children.linkGuardian(child.id, g.userId, g.relation, g.isPrimary);
      if (input.invite) {
        await repo.org.createInvite({
          organizationId: input.invite.organizationId,
          role: 'parent',
          fullName: input.invite.fullName,
          phone: input.invite.phone,
          childIds: [child.id],
          relation: input.invite.relation,
        });
      }
      return child;
    },
    onSuccess: () => invalidate('children', 'org', 'dashboards'),
  });
}
