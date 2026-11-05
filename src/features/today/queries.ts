import { useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';

export function useTherapistToday() {
  const repo = useRepo();
  return useQuery({ queryKey: key('dashboards', 'therapistToday'), queryFn: () => repo.dashboards.therapistToday() });
}

/** Attended but not yet logged (any day within the lock window). */
export function useUnloggedSessions(enabled: boolean) {
  const repo = useRepo();
  return useQuery({ queryKey: key('sessions', 'unlogged'), queryFn: () => repo.sessions.unlogged(), enabled });
}
