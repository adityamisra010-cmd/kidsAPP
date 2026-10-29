import { useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { UUID } from '@/domain/types';

/** Today's sessions for the parent's children that still need the morning check-in. */
export function usePendingCheckins(enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: key('checkins', 'pendingToday'), queryFn: () => repo.checkins.pendingForToday(), enabled });
}

/** Newest parent-visible session snapshot for a child. */
export function useLatestSnapshot(childId: UUID | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('sessions', 'parentSnapshots', childId, { limit: 1 }),
    queryFn: () => repo.sessions.parentSnapshots(childId!, { limit: 1 }),
    enabled: !!childId,
  });
}

/** Same key as HomeTasksCard, so the card and the section skeleton share one request. */
export function useWeeklyPractice(childId: UUID | null) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('homePractice', 'weekly', childId),
    queryFn: () => repo.homePractice.weeklyCompletion(childId!),
    enabled: !!childId,
  });
}
