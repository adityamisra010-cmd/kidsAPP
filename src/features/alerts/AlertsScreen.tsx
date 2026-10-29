import { router } from 'expo-router';
import { ArrowDownRight, CircleCheck, ClipboardList, Eye, TrendingDown, Zap, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Alert, AlertKind } from '@/domain/types';
import { useRefresh } from '@/features/home/components/useRefresh';
import { formatDay, parse, timeAgo } from '@/lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, QueryView, Row, Screen, SegmentedControl, SkeletonList, Stack, Text, toast, type Tone } from '@/ui';

import { useAlertAction, useAlerts } from './queries';

export const ALERT_KIND: Record<AlertKind, { icon: LucideIcon }> = {
  score_drop: { icon: TrendingDown },
  incident_spike: { icon: Zap },
  unlogged_session: { icon: ClipboardList },
  declining_trend: { icon: ArrowDownRight },
};

function AlertCard({
  alert: a,
  busy,
  onAction,
}: {
  alert: Alert;
  busy: boolean;
  onAction: (action: 'acknowledge' | 'resolve') => void;
}) {
  const { t } = useTranslation('dashboard');
  const kind = ALERT_KIND[a.kind] ?? ALERT_KIND.score_drop;
  const tone: Tone = a.status === 'open' ? 'warning' : a.status === 'acknowledged' ? 'info' : 'neutral';
  return (
    <Card testID={`alert-${a.id}`}>
      <Stack gap={3}>
        <Row justify="between" align="flex-start" gap={2}>
          <Badge label={t(`alerts.kinds.${a.kind}`)} tone={tone} icon={kind.icon} />
          <Text variant="caption" color="textMuted">
            {`${formatDay(a.createdAt)} · ${timeAgo(a.createdAt)}`}
          </Text>
        </Row>
        <Row gap={3}>
          <Avatar name={a.childName} size={40} />
          <Stack gap={1} flex={1}>
            <Text variant="subheading">{a.childName}</Text>
            <Text color="textMuted">{a.message}</Text>
          </Stack>
        </Row>
        {a.status === 'resolved' && a.resolvedAt ? (
          <Text variant="caption" color="textMuted">
            {t('alerts.resolvedOn', { date: formatDay(a.resolvedAt) })}
          </Text>
        ) : null}
        <Row gap={2} wrap>
          {a.status === 'open' ? (
            <Button testID={`ack-${a.id}`} size="sm" variant="outline" icon={Eye} label={t('alerts.acknowledge')} disabled={busy} onPress={() => onAction('acknowledge')} />
          ) : null}
          {a.status !== 'resolved' ? (
            <Button testID={`resolve-${a.id}`} size="sm" variant="secondary" icon={CircleCheck} label={t('alerts.resolve')} disabled={busy} onPress={() => onAction('resolve')} />
          ) : null}
          <Button testID={`child-${a.id}`} size="sm" variant="ghost" label={t('alerts.openChild')} onPress={() => router.push(`/child/${a.childId}`)} />
        </Row>
      </Stack>
    </Card>
  );
}

/** Coordinator / admin alerts: Open → Acknowledged → Resolved. */
export function AlertsScreen() {
  const { t } = useTranslation('dashboard');
  const [status, setStatus] = useState<Alert['status']>('open');
  const q = useAlerts(status);
  const action = useAlertAction();
  const { refreshing, onRefresh } = useRefresh(['alerts']);
  const sorted = useMemo(() => [...(q.data ?? [])].sort((a, b) => parse(b.createdAt).getTime() - parse(a.createdAt).getTime()), [q.data]);

  const run = (id: string, kind: 'acknowledge' | 'resolve') =>
    action.mutate(
      { id, action: kind },
      {
        onSuccess: () => toast.success(t(kind === 'acknowledge' ? 'alerts.acknowledgedToast' : 'alerts.resolvedToast')),
        onError: () => toast.error(t('errors:unknown')),
      },
    );

  return (
    <Screen
      testID="alerts"
      title={t('alerts.title')}
      back
      refreshing={refreshing}
      onRefresh={onRefresh}
      headerExtra={
        <SegmentedControl
          testID="alert-segments"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: t('alerts.segments.open') },
            { value: 'acknowledged', label: t('alerts.segments.acknowledged') },
            { value: 'resolved', label: t('alerts.segments.resolved') },
          ]}
        />
      }
    >
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={160} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t(`alerts.empty.${status}.title`)} body={t(`alerts.empty.${status}.body`)} />}
      >
        {() => sorted.map((a) => <AlertCard key={a.id} alert={a} busy={action.isPending && action.variables?.id === a.id} onAction={(k) => run(a.id, k)} />)}
      </QueryView>
    </Screen>
  );
}
