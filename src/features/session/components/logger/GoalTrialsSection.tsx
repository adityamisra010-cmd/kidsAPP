// C. Goal trials: planned goals first; add/remove which goals were targeted today.
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GoalWithStats, PromptLevel, UUID } from '@/domain/types';
import { vocabLabel } from '@/i18n/labels';
import { Button, Card, EmptyState, Icon, ListItem, SectionHeader, Sheet, Stack, Text } from '@/ui';

import type { TrialDraft } from '../../logic/draft';
import { GoalTrialCard } from './GoalTrialCard';

export function GoalTrialsSection({
  goals,
  trials,
  plannedGoalIds,
  fallbackPrompt,
  invalidGoalIds,
  onChange,
  onAdd,
  onRemove,
}: {
  /** Active goals for this child + therapy type, planned first. */
  goals: GoalWithStats[];
  trials: TrialDraft[];
  plannedGoalIds: UUID[];
  fallbackPrompt?: PromptLevel;
  invalidGoalIds: UUID[];
  onChange: (goalId: UUID, patch: Partial<TrialDraft>) => void;
  onAdd: (goalId: UUID) => void;
  onRemove: (goalId: UUID) => void;
}) {
  const { t } = useTranslation('session');
  const [adding, setAdding] = useState(false);
  const available = goals.filter((g) => !trials.some((tr) => tr.goalId === g.id));
  const rows = trials
    .map((tr) => ({ trial: tr, goal: goals.find((g) => g.id === tr.goalId) }))
    .filter((r): r is { trial: TrialDraft; goal: GoalWithStats } => !!r.goal);

  return (
    <Stack gap={2}>
      <SectionHeader title={t('logger.sections.goals')} subtitle={rows.length ? t('logger.goals.zeroNotSaved') : undefined} />
      {goals.length === 0 ? (
        <Card tone="sunken">
          <Text color="textMuted">{t('logger.goals.noActiveGoals')}</Text>
        </Card>
      ) : null}
      {goals.length > 0 && rows.length === 0 ? (
        <Card tone="sunken">
          <Text color="textMuted">{t('logger.goals.empty')}</Text>
        </Card>
      ) : null}
      {rows.map(({ trial, goal }) => (
        <GoalTrialCard
          key={goal.id}
          goal={goal}
          trial={trial}
          planned={plannedGoalIds.includes(goal.id)}
          fallbackPrompt={fallbackPrompt}
          invalid={invalidGoalIds.includes(goal.id)}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
      {available.length > 0 ? (
        <Button label={t('logger.goals.add')} icon={Plus} variant="outline" onPress={() => setAdding(true)} testID="add-goal" />
      ) : null}

      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('logger.goals.addSheetTitle')} subtitle={t('logger.goals.addSheetSubtitle')}>
        {available.length === 0 ? (
          <EmptyState compact title={t('logger.goals.allAdded')} />
        ) : (
          available.map((g) => (
            <ListItem
              key={g.id}
              title={g.staffText}
              subtitle={[
                vocabLabel(t, 'domains', g.domain),
                plannedGoalIds.includes(g.id) ? t('logger.goals.planned') : null,
                g.lastAccuracy != null ? t('logger.goals.lastAccuracy', { value: Math.round(g.lastAccuracy) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              left={<Icon icon={Plus} color="primaryText" />}
              onPress={() => {
                onAdd(g.id);
                setAdding(false);
              }}
            />
          ))
        )}
      </Sheet>
    </Stack>
  );
}
