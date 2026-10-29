// Owner: W2 (session). Parent-facing "Latest session" card: words + arrows, never raw scores.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { ParentSessionSnapshot } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { Card, Icon, Row, Stack, Text, TrendIndicator, TypeTag } from '@/ui';

export function SessionSnapshotCard({ snapshot: s }: { snapshot: ParentSessionSnapshot }) {
  const { t } = useTranslation();
  return (
    <Card onPress={() => router.push(`/session/${s.sessionId}`)} accent={s.therapyTypeColor}>
      <Stack gap={3}>
        <Row justify="between">
          <TypeTag name={s.therapyTypeName} color={s.therapyTypeColor} />
          <Text variant="caption" color="textMuted">{formatDay(s.date)}</Text>
        </Row>
        <Text variant="subheading">{s.therapistName}</Text>
        <Stack gap={2}>
          {s.highlights.map((h) => (
            <Row key={h.key} justify="between">
              <Row gap={2}>
                <Icon name={h.icon} size={18} color="textMuted" />
                <Text variant="label">{h.label}</Text>
              </Row>
              <TrendIndicator change={h.change} size="sm" />
            </Row>
          ))}
        </Stack>
        {s.parentSummary ? <Text color="textMuted">{s.parentSummary}</Text> : null}
        <Text variant="caption" color="textSubtle">{t('common:change.' + s.overall)}</Text>
      </Stack>
    </Card>
  );
}
