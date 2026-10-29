import { useMutation, useQuery } from '@tanstack/react-query';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import type { Alert } from '@/domain/types';
import { useInvalidate } from '@/features/home/components/useRefresh';

export const alertsKey = (status: Alert['status']) => key('alerts', 'list', { status: [status] });

export function useAlerts(status: Alert['status'], enabled = true) {
  const repo = useRepo();
  return useQuery({ queryKey: alertsKey(status), queryFn: () => repo.alerts.list({ status: [status] }), enabled });
}

/** Acknowledge / resolve. Refreshes alerts, the dashboard and child lists (open-alert counts). */
export function useAlertAction() {
  const repo = useRepo();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' }) =>
      action === 'acknowledge' ? repo.alerts.acknowledge(id) : repo.alerts.resolve(id),
    onSettled: () => invalidate('alerts', 'dashboards', 'children'),
  });
}
