import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { invalidate, key } from '@/data/queryClient';
import type { ImportKind, ImportRow } from '@/domain/types';

/** Names → ids the validator resolves against. Refetched each time an import starts. */
export function useImportContext() {
  const repo = useRepo();
  return useQuery({ queryKey: key('imports', 'context'), queryFn: () => repo.imports.context(), staleTime: 0 });
}

export function useCommitImport() {
  const repo = useRepo();
  return useMutation({
    mutationFn: ({ kind, rows }: { kind: ImportKind; rows: ImportRow[] }) => repo.imports.commit(kind, rows),
    onSuccess: () => invalidate('imports', 'children', 'org', 'appointments', 'dashboards', 'goals'),
  });
}
