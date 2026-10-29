/**
 * Parent "Practice" tab: this week's progress, active tasks with quick logging, therapist feedback.
 */
import { router } from 'expo-router';
import { BookOpen, CalendarDays } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { useChildDetail, useGoals } from '@/data/hooks';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, EmptyState, ErrorState, ListItem, QueryView, Row, Screen, SectionHeader, Skeleton, SkeletonList, Stack, Text } from '@/ui';

import { FeedbackCard } from '../components/HomeLogRow';
import { PendingUploads } from '../components/PendingUploads';
import { TaskCard } from '../components/TaskCard';
import { WeekSummary } from '../components/WeekSummary';
import { firstName, practisedThisWeek, recentFeedback } from '../logic';
import { useActiveTasks, useChildLogs, useWeeklyCompletion } from '../queries';

export function ParentPracticeScreen() {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const active = useActive();
  const childId = active?.childId ?? null;
  const child = useChildDetail(childId);
  const tasks = useActiveTasks(childId);
  const weekly = useWeeklyCompletion(childId);
  const logs = useChildLogs(childId);
  const goals = useGoals(childId);
  const [refreshing, setRefreshing] = useState(false);

  const goalText = useMemo(() => new Map((goals.data ?? []).map((g) => [g.id, g.parentText])), [goals.data]);
  const feedback = useMemo(() => recentFeedback(logs.data ?? [], 5), [logs.data]);
  const name = child.data ? firstName(child.data.child.preferredName ?? child.data.child.fullName) : undefined;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([tasks.refetch(), weekly.refetch(), logs.refetch(), goals.refetch()]).finally(() => setRefreshing(false));
  };

  if (!childId) {
    return (
      <Screen title={tr('tab.title')}>
        <EmptyState title={tr('list.noChildTitle')} body={tr('list.noChildBody')} />
      </Screen>
    );
  }

  return (
    <Screen title={tr('tab.title')} subtitle={name ? tr('tab.subtitle', { name }) : undefined} refreshing={refreshing} onRefresh={() => void refresh()}>
      <ChildSwitcher />

      <Card testID="week-card">
        <Stack gap={3}>
          <Row gap={2}>
            <CalendarDays size={18} color={t.colors.primaryText} />
            <Text variant="overline" color="primaryText">
              {tr('week.title')}
            </Text>
          </Row>
          {weekly.isPending ? (
            <Stack gap={2}>
              <Skeleton height={28} width="50%" />
              <Skeleton height={10} />
            </Stack>
          ) : weekly.data ? (
            <WeekSummary weekly={weekly.data} />
          ) : (
            <ErrorState compact error={weekly.error} onRetry={() => void weekly.refetch()} />
          )}
        </Stack>
      </Card>

      <PendingUploads />

      <SectionHeader title={tr('list.tasksTitle')} />
      <QueryView
        query={tasks}
        skeleton={<SkeletonList rows={2} height={200} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={tr('list.emptyTitle')} body={tr('list.emptyBody', { name: name ?? '' })} />}
      >
        {(list) => (
          <Stack gap={3}>
            {list.map((task, i) => (
              <TaskCard
                key={task.id}
                testID={`task-${i}`}
                task={task}
                goalText={task.goalId ? goalText.get(task.goalId) : undefined}
                weekCount={practisedThisWeek(logs.data ?? [], task.id)}
              />
            ))}
          </Stack>
        )}
      </QueryView>

      {feedback.length ? (
        <Stack gap={3}>
          <SectionHeader title={tr('list.feedbackTitle')} subtitle={tr('list.feedbackSubtitle')} />
          {feedback.map((log) => (
            <FeedbackCard key={log.id} log={log} />
          ))}
        </Stack>
      ) : null}

      <Card padding={2} elevated={false} tone="sunken">
        <ListItem
          title={tr('list.resourcesLink')}
          subtitle={tr('list.resourcesHint')}
          left={<BookOpen size={22} color={t.colors.primaryText} />}
          onPress={() => router.push('/resources')}
        />
      </Card>
    </Screen>
  );
}
