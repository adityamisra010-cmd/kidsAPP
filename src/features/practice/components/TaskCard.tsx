/**
 * Active home task on the parent Practice tab: what, why (goal in parent words), how often,
 * this week's count and a big "Log practice" button.
 */
import { router } from 'expo-router';
import { Clock, PenLine, Repeat, Target } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { HomeTask } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ProgressBar, Row, Stack, Text } from '@/ui';

export function TaskMeta({ task }: { task: Pick<HomeTask, 'frequencyPerWeek' | 'durationMinutes'> }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  return (
    <Row gap={3} wrap>
      <Row gap={1}>
        <Repeat size={16} color={t.colors.textMuted} />
        <Text variant="label" color="textMuted">
          {tr('task.frequency', { count: task.frequencyPerWeek })}
        </Text>
      </Row>
      <Row gap={1}>
        <Clock size={16} color={t.colors.textMuted} />
        <Text variant="label" color="textMuted">
          {tr('task.duration', { count: task.durationMinutes })}
        </Text>
      </Row>
    </Row>
  );
}

export function TaskCard({ task, goalText, weekCount, testID }: { task: HomeTask; goalText?: string; weekCount: number; testID?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const expected = task.frequencyPerWeek;
  return (
    <Card
      testID={testID}
      onPress={() => router.push(`/practice/task/${task.id}`)}
      accessibilityLabel={`${task.title}. ${tr('task.thisWeek', { done: Math.min(weekCount, expected), expected })}`}
      accessibilityHint={tr('common:a11y.opensDetails')}
    >
      <Stack gap={3}>
        <Stack gap={1}>
          <Text variant="heading">{task.title}</Text>
          {goalText ? (
            <Row gap={2} align="flex-start">
              <Target size={16} color={t.colors.primaryText} style={{ marginTop: 3 }} />
              <Text color="textMuted" style={{ flex: 1 }}>
                {goalText}
              </Text>
            </Row>
          ) : null}
        </Stack>
        <TaskMeta task={task} />
        <Stack gap={1}>
          <Text variant="label" weight="semibold">
            {tr('task.thisWeek', { done: Math.min(weekCount, expected), expected })}
          </Text>
          <ProgressBar value={expected ? Math.min(1, weekCount / expected) : 0} height={6} label={tr('task.thisWeek', { done: Math.min(weekCount, expected), expected })} />
        </Stack>
        <Button
          label={tr('task.logShort')}
          icon={PenLine}
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => router.push(`/practice/log/${task.id}`)}
          testID={testID ? `${testID}-log` : undefined}
        />
      </Stack>
    </Card>
  );
}
