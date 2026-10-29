// Owner: W5 (practice). "This week's home practice" summary for parent Home.
import { router } from 'expo-router';
import { ListChecks, PenLine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { UUID } from '@/domain/types';
import { WeekSummary } from '@/features/practice/components/WeekSummary';
import { practisedThisWeek } from '@/features/practice/logic';
import { useActiveTasks, useChildLogs, useWeeklyCompletion } from '@/features/practice/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Divider, Row, Skeleton, Stack, Text } from '@/ui';

export function HomeTasksCard({ childId }: { childId: UUID }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const weekly = useWeeklyCompletion(childId);
  const tasks = useActiveTasks(childId);
  const logs = useChildLogs(childId);

  // Home stays calm: a failed card simply steps aside; the Practice tab shows the full error.
  if (weekly.error && tasks.error) return null;
  const loading = weekly.isPending || tasks.isPending;
  const top = (tasks.data ?? []).slice(0, 2);

  return (
    <Card testID="home-tasks-card">
      <Stack gap={3}>
        <Row justify="between">
          <Row gap={2} flex={1}>
            <ListChecks size={18} color={t.colors.primaryText} />
            <Text variant="overline" color="primaryText">
              {tr('home.cardTitle')}
            </Text>
          </Row>
          <Button size="sm" variant="ghost" label={tr('common:actions.seeAll')} onPress={() => router.push('/parent/practice')} />
        </Row>

        {loading ? (
          <Stack gap={2}>
            <Skeleton height={28} width="45%" />
            <Skeleton height={10} />
          </Stack>
        ) : weekly.data ? (
          <WeekSummary weekly={weekly.data} />
        ) : null}

        {!loading && top.length === 0 ? <Text color="textMuted">{tr('home.noTasks')}</Text> : null}

        {top.map((task) => {
          const count = Math.min(practisedThisWeek(logs.data ?? [], task.id), task.frequencyPerWeek);
          return (
            <Stack key={task.id} gap={3}>
              <Divider />
              <Row gap={3}>
                <Stack flex={1} gap={1}>
                  <Text variant="bodyStrong" numberOfLines={2} onPress={() => router.push(`/practice/task/${task.id}`)} accessibilityRole="link">
                    {task.title}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {tr('task.thisWeek', { done: count, expected: task.frequencyPerWeek })}
                  </Text>
                </Stack>
                <Button size="md" variant="secondary" icon={PenLine} label={tr('home.log')} onPress={() => router.push(`/practice/log/${task.id}`)} />
              </Row>
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}
