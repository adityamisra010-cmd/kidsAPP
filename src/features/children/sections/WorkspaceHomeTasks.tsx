import { router } from 'expo-router';
import { CircleCheck, ListPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { HomeTask, UUID } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { Badge, Button, Card, EmptyState, QueryView, SkeletonList, Stack, Text } from '@/ui';

import { useChildHomeTasks } from '../queries';

const ORDER: Record<HomeTask['status'], number> = { active: 0, completed: 1, archived: 2 };

/** Home-practice tasks assigned to this child; staff can assign a new one. */
export function WorkspaceHomeTasks({ childId, canAssign }: { childId: UUID; canAssign: boolean }) {
  const { t } = useTranslation('child');
  const q = useChildHomeTasks(childId);
  const assign = () => router.push(`/practice/task/new?childId=${childId}`);
  return (
    <Stack gap={3} testID="workspace-home-tasks">
      {canAssign ? <Button label={t('homeTasks.assign')} icon={ListPlus} size="sm" onPress={assign} style={{ alignSelf: 'flex-start' }} /> : null}
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={2} height={84} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState compact title={t('homeTasks.emptyTitle')} body={t('homeTasks.emptyBody')} />}
      >
        {(tasks) => (
          <Stack gap={3}>
            {[...tasks]
              .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.activeFrom.localeCompare(a.activeFrom))
              .map((task) => (
                <Card key={task.id} onPress={() => router.push(`/practice/task/${task.id}`)}>
                  <Stack gap={1}>
                    <Text variant="bodyStrong">{task.title}</Text>
                    <Text variant="caption" color="textMuted">
                      {t('homeTasks.meta', { times: task.frequencyPerWeek, minutes: task.durationMinutes, by: task.assignedByName })}
                    </Text>
                    <Text variant="caption" color="textSubtle">
                      {t('homeTasks.window', { from: formatDay(task.activeFrom), to: formatDay(task.activeTo) })}
                    </Text>
                    {task.status !== 'active' ? (
                      <Badge label={t(`homeTasks.status.${task.status}`)} tone="neutral" icon={CircleCheck} />
                    ) : null}
                  </Stack>
                </Card>
              ))}
          </Stack>
        )}
      </QueryView>
    </Stack>
  );
}
