/**
 * "3 of 5 done" + progress bar + one encouraging line. Used on the Practice tab and the Home card.
 */
import { useTranslation } from 'react-i18next';

import type { WeeklyCompletion } from '@/domain/types';
import { ProgressBar, Row, Stack, Text } from '@/ui';

import { weeklyProgress } from '../logic';

export function WeekSummary({ weekly }: { weekly: Pick<WeeklyCompletion, 'expected' | 'done' | 'partly'> }) {
  const { t } = useTranslation('practice');
  const p = weeklyProgress(weekly);
  if (p.mood === 'none') {
    return (
      <Text color="textMuted" testID="week-summary">
        {t('week.msg.none')}
      </Text>
    );
  }
  const countText = t('week.count', { done: p.practised, expected: p.expected });
  return (
    <Stack gap={2} testID="week-summary">
      <Row justify="between" align="flex-end">
        <Text variant="title" accessibilityLabel={countText}>
          {countText}
        </Text>
      </Row>
      <ProgressBar value={p.ratio} height={10} label={countText} />
      <Text color="textMuted">{t(`week.msg.${p.mood}`)}</Text>
    </Stack>
  );
}
