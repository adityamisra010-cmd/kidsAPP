import { router } from 'expo-router';
import { ChartLine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { SessionSummary, UUID } from '@/domain/types';
import { useChildSessions } from '@/features/children/queries';
import { WORKSPACE_SESSION_LIMIT } from '@/features/children/sections/WorkspaceSessions';
import { Button, Card, EmptyState, QueryView, Row, SkeletonList, Sparkline, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

import { scoreSummary } from '../chartData';

/** Compact progress summary inside the child workspace, with a link to the full charts. */
export function WorkspaceProgress({ childId }: { childId: UUID }) {
  const { t } = useTranslation('progress');
  // Same query as the Sessions section, so switching tabs costs nothing.
  const q = useChildSessions(childId, { limit: WORKSPACE_SESSION_LIMIT });
  const open = () => router.push(`/progress/${childId}`);
  return (
    <Stack gap={3} testID="workspace-progress">
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={2} height={110} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState compact title={t('workspace.emptyTitle')} body={t('workspace.emptyBody')} />}
      >
        {(sessions) => <Summary sessions={sessions} />}
      </QueryView>
      <Button label={t('workspace.openFull')} icon={ChartLine} variant="secondary" onPress={open} fullWidth />
    </Stack>
  );
}

function Summary({ sessions }: { sessions: SessionSummary[] }) {
  const { t } = useTranslation('progress');
  const byType = new Map<string, SessionSummary[]>();
  for (const s of sessions) byType.set(s.therapyTypeId, [...(byType.get(s.therapyTypeId) ?? []), s]);

  return (
    <Stack gap={3}>
      {[...byType.values()].map((list) => {
        const first = list[0];
        const sum = scoreSummary(list);
        const series = [...list].sort((a, b) => a.date.localeCompare(b.date)).map((s) => s.sessionScore);
        return (
          <Card key={first.therapyTypeId} accent={first.therapyTypeColor}>
            <Stack gap={2}>
              <Row justify="between" gap={2}>
                <TypeTag name={first.therapyTypeName} color={first.therapyTypeColor} />
                <TrendIndicator trend={sum.trend} size="sm" />
              </Row>
              <Row justify="between" gap={3}>
                <Stack gap={0}>
                  <Text variant="title">{sum.latest != null ? Math.round(sum.latest) : '—'}</Text>
                  <Text variant="caption" color="textMuted">
                    {t('workspace.latestScore')}
                  </Text>
                </Stack>
                <Stack gap={0}>
                  <Text variant="heading">{sum.average ?? '—'}</Text>
                  <Text variant="caption" color="textMuted">
                    {t('workspace.average', { count: sum.count })}
                  </Text>
                </Stack>
                <Sparkline values={series.slice(-12)} domain={[0, 100]} color={first.therapyTypeColor} width={96} height={32} />
              </Row>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
