import { router } from 'expo-router';
import { TriangleAlert, UserCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { SessionSummary, UUID } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { Badge, Card, Delta, EmptyState, QueryView, Row, SkeletonList, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

import { useChildSessions } from '../queries';

export const WORKSPACE_SESSION_LIMIT = 30;

/** Staff session history: score, change vs last session, trend; substitutes tagged. */
export function WorkspaceSessions({ childId }: { childId: UUID }) {
  const { t } = useTranslation('child');
  const q = useChildSessions(childId, { limit: WORKSPACE_SESSION_LIMIT });
  return (
    <QueryView
      query={q}
      skeleton={<SkeletonList rows={4} height={92} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState title={t('sessions.emptyTitle')} body={t('sessions.emptyBody')} />}
    >
      {(sessions) => (
        <Stack gap={3} testID="workspace-sessions">
          {[...sessions]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
        </Stack>
      )}
    </QueryView>
  );
}

function SessionRow({ s }: { s: SessionSummary }) {
  const { t } = useTranslation('child');
  return (
    <Card
      accent={s.therapyTypeColor}
      onPress={() => router.push(`/session/${s.id}`)}
      accessibilityLabel={t('sessions.a11y', { date: formatDay(s.date), therapy: s.therapyTypeName, therapist: s.therapistName, score: Math.round(s.sessionScore) })}
    >
      <Row gap={3} align="flex-start">
        <Stack gap={1} flex={1}>
          <Row gap={2} wrap>
            <Text variant="label" weight="semibold">
              {formatDay(s.date)}
            </Text>
            <TypeTag name={s.therapyTypeName} color={s.therapyTypeColor} />
          </Row>
          <Text color="textMuted" numberOfLines={1}>
            {s.therapistName}
          </Text>
          <Row gap={2} wrap>
            {s.isSubstitute ? <Badge label={t('sessions.substitute')} tone="warning" icon={UserCheck} /> : null}
            {s.incidentCount > 0 ? <Badge label={t('sessions.incidents', { count: s.incidentCount })} tone="danger" icon={TriangleAlert} /> : null}
          </Row>
        </Stack>
        <Stack gap={1} align="flex-end">
          <Text variant="title" accessibilityLabel={t('sessions.scoreA11y', { score: Math.round(s.sessionScore) })}>
            {Math.round(s.sessionScore)}
          </Text>
          <Row gap={1}>
            <Text variant="caption" color="textSubtle">
              {t('sessions.vsLast')}
            </Text>
            <Delta value={s.deltaLast} />
          </Row>
          <TrendIndicator trend={s.trend} size="sm" />
          {s.goalAccuracy != null ? (
            <Text variant="caption" color="textSubtle">
              {t('sessions.goalAccuracy', { value: Math.round(s.goalAccuracy) })}
            </Text>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}
