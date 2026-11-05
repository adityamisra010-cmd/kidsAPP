import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { KeyRoot } from '@/data/queryClient';

/** Invalidate whole key roots on the active query client (same semantics as `invalidate()`). */
export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback((...roots: KeyRoot[]) => Promise.all(roots.map((r) => qc.invalidateQueries({ queryKey: [r] }))).then(() => undefined), [qc]);
}

/** Pull-to-refresh state that re-fetches the given key roots. */
export function useRefresh(roots: KeyRoot[]) {
  const invalidate = useInvalidate();
  const [refreshing, setRefreshing] = useState(false);
  const key = roots.join('|');
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void invalidate(...(key.split('|') as KeyRoot[])).finally(() => setRefreshing(false));
  }, [invalidate, key]);
  return { refreshing, onRefresh };
}
