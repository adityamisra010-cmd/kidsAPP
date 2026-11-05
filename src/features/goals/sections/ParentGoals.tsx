import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useGoals, useTherapyTypes } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { Card, EmptyState, QueryView, Row, SkeletonList, Stack, Text, TypeTag } from '@/ui';

import { ParentGoalStatusBadge } from '../components/GoalStatusBadge';
import { sortForParent } from '../goalStatus';

/** Goals in parent wording with a simple status word. No staff jargon, no numbers. */
export function ParentGoals({ childId, name }: { childId: UUID; name: string }) {
  const { t } = useTranslation('goals');
  const q = useGoals(childId);
  const types = useTherapyTypes().data ?? [];
  return (
    <QueryView
      query={q}
      skeleton={<SkeletonList rows={3} height={110} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState title={t('parent.emptyTitle')} body={t('parent.emptyBody', { name })} />}
    >
      {(goals) => (
        <Stack gap={3} testID="parent-goals">
          <Text color="textMuted">{t('parent.intro', { name })}</Text>
          {sortForParent(goals).map((g) => {
            const type = types.find((x) => x.id === g.therapyTypeId);
            return (
              <Card key={g.id} accent={type?.color}>
                <Stack gap={2}>
                  <Row justify="between" gap={2} wrap>
                    {type ? <TypeTag name={therapyTypeLabel(t, type)} color={type.color} /> : <View />}
                    <ParentGoalStatusBadge status={g.status} />
                  </Row>
                  <Text variant="bodyStrong">{g.parentText}</Text>
                  <Text variant="caption" color="textMuted">
                    {vocabLabel(t, 'domains', g.domain)}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}
    </QueryView>
  );
}
