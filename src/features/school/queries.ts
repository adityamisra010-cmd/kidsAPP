import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { DataRequest, Organization, OrgSettings, RatingDimension, TherapyType, UUID } from '@/domain/types';
import { useActive, useSession } from '@/state/session';

import type { OrgFields } from './settingsDraft';

/** Keeps the signed-in user's copy of the organisation (school name in headers) in step. */
function syncSessionOrg(org: Organization) {
  const { user, setUser } = useSession.getState();
  if (!user) return;
  setUser({ ...user, organizations: user.organizations.map((o) => (o.id === org.id ? org : o)) });
}

export function useSaveSchool() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useMutation({
    mutationFn: async ({ orgPatch, settingsPatch }: { orgPatch: Partial<OrgFields> | null; settingsPatch: Partial<OrgSettings> | null }) => {
      if (!orgId) throw new Error('no_org');
      let org: Organization | null = null;
      if (orgPatch) org = await repo.org.update(orgId, orgPatch);
      if (settingsPatch) org = await repo.org.updateSettings(orgId, settingsPatch);
      return org;
    },
    onSuccess: async (org) => {
      if (org) syncSessionOrg(org);
      await invalidate('org', 'appointments', 'dashboards');
    },
  });
}

export function useUpsertDimension() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (input: Omit<RatingDimension, 'id'> & { id?: UUID }) => repo.org.upsertRatingDimension(input),
    onSettled: () => invalidate('org', 'sessions', 'progress'),
  });
}

export function useReorderDimensions() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useMutation({
    mutationFn: (orderedIds: UUID[]) => repo.org.reorderRatingDimensions(orgId!, orderedIds),
    onSettled: () => invalidate('org'),
  });
}

export function useUpsertTherapyType() {
  const repo = useRepo();
  return useMutation({
    mutationFn: (input: Omit<TherapyType, 'id'> & { id?: UUID }) => repo.org.upsertTherapyType(input),
    onSettled: () => invalidate('org', 'appointments', 'children'),
  });
}

export function useDataRequests() {
  const repo = useRepo();
  const orgId = useActive()?.orgId ?? null;
  return useQuery({ queryKey: key('org', orgId, 'dataRequests'), queryFn: () => repo.org.listDataRequests(orgId!), enabled: !!orgId });
}

export function useSetDataRequestStatus() {
  const repo = useRepo();
  return useMutation({
    mutationFn: ({ id, status }: { id: UUID; status: DataRequest['status'] }) => repo.org.setDataRequestStatus(id, status),
    onSettled: () => invalidate('org', 'me'),
  });
}
