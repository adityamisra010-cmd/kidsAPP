import { QueryClient, type QueryKey } from '@tanstack/react-query';

import { RepoError } from './repository';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      // Don't hammer the network on auth/permission errors.
      retry: (count, err) => !(err instanceof RepoError && ['forbidden', 'not_found', 'not_authenticated'].includes(err.code)) && count < 2,
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

/**
 * Query key roots. Every feature key starts with one of these so cross-feature invalidation works:
 *   useQuery({ queryKey: ['appointments', 'list', filter], … })
 *   invalidate('appointments', 'dashboards')
 */
export type KeyRoot =
  | 'me'
  | 'org'
  | 'platform'
  | 'children'
  | 'goals'
  | 'appointments'
  | 'sessions'
  | 'checkins'
  | 'progress'
  | 'homePractice'
  | 'media'
  | 'resources'
  | 'messaging'
  | 'notifications'
  | 'alerts'
  | 'dashboards'
  | 'reports'
  | 'imports';

export function key(root: KeyRoot, ...parts: unknown[]): QueryKey {
  return [root, ...parts];
}

export function invalidate(...roots: KeyRoot[]) {
  return Promise.all(roots.map((r) => queryClient.invalidateQueries({ queryKey: [r] })));
}
