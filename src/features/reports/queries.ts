import { useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { ISODate, UUID } from '@/domain/types';

import { isValidRange } from './dateRanges';

export type ExportDataset = 'sessions' | 'attendance';

export function useChildReport(childId: UUID | undefined, opts: { from: ISODate; to: ISODate; audience: 'staff' | 'parent' }) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('reports', 'child', childId, opts),
    queryFn: () => repo.reports.childReport(childId!, opts),
    enabled: !!childId && isValidRange(opts),
  });
}

export function useExportRows(dataset: ExportDataset, opts: { from: ISODate; to: ISODate; childId?: UUID; therapistId?: UUID }, enabled: boolean) {
  const repo = useRepo();
  return useQuery({
    queryKey: key('reports', 'export', dataset, opts),
    queryFn: () => (dataset === 'sessions' ? repo.reports.exportSessions(opts) : repo.reports.exportAttendance(opts)),
    enabled: enabled && isValidRange(opts),
  });
}
