import { router } from 'expo-router';
import { Library, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useGoals, useTherapyTypes } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { Button, EmptyState, QueryView, Row, SkeletonList, Stack, Text, TypeTag } from '@/ui';

import { GoalCard } from '../components/GoalCard';
import { MasteredMoment } from '../components/MasteredMoment';
import { groupByTherapy, sortForStaff } from '../goalStatus';
import { useConfirmMastery } from '../useConfirmMastery';

/** Staff goals for one child, grouped by therapy type, with mastery confirmations on top. */
export function WorkspaceGoals({ childId, canManage }: { childId: UUID; canManage: boolean }) {
  const { t } = useTranslation('goals');
  const q = useGoals(childId);
  const types = useTherapyTypes().data ?? [];
  const mastery = useConfirmMastery();

  return (
    <Stack gap={3} testID="workspace-goals">
      {canManage ? (
        <Row gap={2} wrap>
          <Button label={t('actions.add')} icon={Plus} size="sm" onPress={() => router.push(`/goal/new?childId=${childId}`)} />
          <Button label={t('actions.bank')} icon={Library} size="sm" variant="outline" onPress={() => router.push('/goal-bank')} />
        </Row>
      ) : null}
      {mastery.celebrating ? <MasteredMoment goalText={mastery.celebrating.text} onDone={mastery.endCelebration} /> : null}
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={120} />}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title={t('workspace.emptyTitle')}
            body={t('workspace.emptyBody')}
            actionLabel={canManage ? t('actions.add') : undefined}
            onAction={canManage ? () => router.push(`/goal/new?childId=${childId}`) : undefined}
          />
        }
      >
        {(goals) => (
          <Stack gap={4}>
            {groupByTherapy(sortForStaff(goals), types).map((group) => (
              <Stack key={group.therapyTypeId} gap={2}>
                <Row justify="between">
                  {group.therapyType ? (
                    <TypeTag name={therapyTypeLabel(t, group.therapyType)} color={group.therapyType.color} />
                  ) : (
                    <Text variant="caption" color="textMuted">
                      {t('workspace.otherType')}
                    </Text>
                  )}
                  <Text variant="caption" color="textSubtle">
                    {t('workspace.count', { count: group.goals.length })}
                  </Text>
                </Row>
                {group.goals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    canManage={canManage}
                    confirming={mastery.pendingGoalId === g.id}
                    onConfirmMastery={() => void mastery.confirmMastery(g)}
                  />
                ))}
              </Stack>
            ))}
          </Stack>
        )}
      </QueryView>
    </Stack>
  );
}
