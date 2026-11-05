/** TanStack hooks for progress views. */
import { useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { ISODate, ProgressPeriod, UUID } from '@/domain/types';

export function useStaffProgress(childId: UUID | undefined, opts: { therapyTypeId?: UUID; from?: ISODate; to?: ISODate }) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('progress', 'staff', childId, opts),
    queryFn: () => repo.progress.staff(childId!, opts),
    enabled: !!childId,
    placeholderData: (prev) => prev,
  });
}

export function useParentProgress(childId: UUID | undefined, period: ProgressPeriod) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('progress', 'parent', childId, period),
    queryFn: () => repo.progress.parent(childId!, period),
    enabled: !!childId,
    placeholderData: (prev) => prev,
  });
}
