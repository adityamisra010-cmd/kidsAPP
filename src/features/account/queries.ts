/** Account queries. `getRepo()` is called inside query functions so these are safe before sign-in. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { NotificationKind, Organization, UUID } from '@/domain/types';
import { useActive } from '@/state/session';

import { sanitizeMuted } from './notificationKinds';

export function mutedKindsKey(userId: UUID | undefined) {
  return key('me', 'mutedKinds', userId ?? 'none');
}

export function useMutedKinds(enabled = true) {
  const userId = useActive()?.user.profile.id;
  return useQuery({
    queryKey: mutedKindsKey(userId),
    queryFn: async () => sanitizeMuted(await getRepo().me.getMutedNotificationKinds()),
    enabled: enabled && !!userId,
    staleTime: 5 * 60_000,
  });
}

/** Optimistic: the switch moves immediately and rolls back if saving fails. */
export function useSetMutedKinds() {
  const qc = useQueryClient();
  const userId = useActive()?.user.profile.id;
  const qk = mutedKindsKey(userId);
  return useMutation({
    mutationFn: (kinds: NotificationKind[]) => getRepo().me.setMutedNotificationKinds(sanitizeMuted(kinds)),
    onMutate: async (kinds) => {
      await qc.cancelQueries({ queryKey: qk });
      const previous = qc.getQueryData<NotificationKind[]>(qk);
      qc.setQueryData(qk, sanitizeMuted(kinds));
      return { previous };
    },
    onError: (_e, _kinds, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk }),
  });
}

export function useConsents() {
  const userId = useActive()?.user.profile.id;
  return useQuery({
    queryKey: key('me', 'consents', userId ?? 'none'),
    queryFn: () => getRepo().me.listConsents(),
    enabled: !!userId,
  });
}

/** Same cache entry as `useOrg()` in @/data/hooks, but safe to call before a repository exists. */
export function useOrgSafe(enabled = true) {
  const orgId = useActive()?.orgId ?? null;
  return useQuery<Organization>({
    queryKey: key('org', orgId),
    queryFn: () => getRepo().org.get(orgId!),
    enabled: enabled && !!orgId,
  });
}

/** A parent's children (same cache entry as `useChildren()`); disabled for staff. */
export function useMyChildren(enabled = true) {
  return useQuery({
    queryKey: key('children', 'list', {}),
    queryFn: () => getRepo().children.list(),
    enabled,
  });
}

export const invalidateMe = () => invalidate('me');
