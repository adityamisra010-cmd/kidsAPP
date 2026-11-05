/**
 * Home task detail: big numbered steps, how often, the goal in parent words, demo video or guide,
 * who assigned it, and the practice history. Staff also get Edit / Archive.
 */
import { router } from 'expo-router';
import { Archive, PenLine, Pencil, Target, UserRound } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useGoals } from '@/data/hooks';
import { STAFF_ROLES, type HomeLog } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, confirm, ErrorState, LabeledIconButton, Row, Screen, SectionHeader, SkeletonList, Stack, Text, toast } from '@/ui';

import { ResourceRow } from '../../resources/components/ResourceRow';
import { useResource } from '../../resources/queries';
import { HomeLogRow } from '../components/HomeLogRow';
import { StepsList } from '../components/StepsList';
import { TaskMeta } from '../components/TaskCard';
import { MediaPlayer, VideoPlayer } from '../components/VideoPlayer';
import { sortNewestFirst } from '../logic';
import { usePendingHomeLogs, useSetTaskStatus, useTask } from '../queries';

export function TaskDetailScreen({ taskId }: { taskId: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const active = useActive();
  const isStaff = !!active && STAFF_ROLES.includes(active.role);
  const q = useTask(taskId);
  const goals = useGoals(q.data?.childId);
  const resource = useResource(q.data?.resourceId);
  const pending = usePendingHomeLogs(taskId);
  const setStatus = useSetTaskStatus();
  const logs = useMemo(() => sortNewestFirst(q.data?.logs ?? []), [q.data?.logs]);

  if (q.isPending || q.error || !q.data) {
    return (
      <Screen title={tr('task.screenTitle')} back>
        {q.isPending ? <SkeletonList rows={3} height={140} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Screen>
    );
  }

  const task = q.data;
  const goal = goals.data?.find((g) => g.id === task.goalId);
  const isActive = task.status === 'active';

  const archive = async () => {
    const ok = await confirm({ title: tr('task.archiveTitle'), body: tr('task.archiveBody'), confirmLabel: tr('task.archive'), destructive: true });
    if (!ok) return;
    setStatus.mutate(
      { taskId, status: 'archived' },
      {
        onSuccess: () => {
          toast.success(tr('task.archived'));
          router.back();
        },
        onError: () => toast.error(tr('errors:unknown')),
      },
    );
  };

  return (
    <Screen
      title={tr('task.screenTitle')}
      back
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      right={
        isStaff && isActive ? (
          <>
            <LabeledIconButton icon={Pencil} label={tr('task.edit')} onPress={() => router.push(`/practice/task/new?taskId=${task.id}`)} />
            <LabeledIconButton icon={Archive} label={tr('task.archive')} onPress={() => void archive()} />
          </>
        ) : undefined
      }
      footer={
        isActive ? (
          <Button label={tr('task.logToday')} icon={PenLine} size="lg" fullWidth onPress={() => router.push(`/practice/log/${task.id}`)} testID="task-log" />
        ) : undefined
      }
    >
      <Stack gap={2}>
        <Text variant="display" accessibilityRole="header">
          {task.title}
        </Text>
        {!isActive ? <Badge label={tr(`task.status.${task.status}`)} tone="neutral" icon={Archive} /> : null}
        {goal ? (
          <Row gap={2} align="flex-start">
            <Target size={18} color={t.colors.primaryText} style={{ marginTop: 3 }} />
            <Stack gap={1} flex={1}>
              <Text>{goal.parentText}</Text>
              {isStaff && goal.staffText !== goal.parentText ? (
                <Text variant="caption" color="textMuted">
                  {goal.staffText}
                </Text>
              ) : null}
            </Stack>
          </Row>
        ) : null}
        <TaskMeta task={task} />
        <Row gap={2}>
          <UserRound size={16} color={t.colors.textMuted} />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {`${tr('task.assignedBy', { name: task.assignedByName })} · ${tr('task.activeRange', { from: formatDay(task.activeFrom), to: formatDay(task.activeTo) })}`}
          </Text>
        </Row>
      </Stack>

      <Card>
        <Stack gap={4}>
          <Text variant="overline" color="primaryText">
            {tr('task.steps')}
          </Text>
          <StepsList steps={task.steps} />
        </Stack>
      </Card>

      {task.demoMediaId ? (
        <Stack gap={2}>
          <SectionHeader title={tr('task.demo')} />
          <MediaPlayer mediaId={task.demoMediaId} />
        </Stack>
      ) : null}

      {resource.data ? (
        <Stack gap={2}>
          <SectionHeader title={tr('task.resource')} />
          {resource.data.kind === 'video' && !task.demoMediaId ? <VideoPlayer uri={resource.data.url} /> : null}
          <ResourceRow resource={resource.data} onPress={() => router.push(`/resources/${resource.data!.id}`)} />
        </Stack>
      ) : null}

      <Stack gap={3}>
        <SectionHeader title={tr('task.history')} />
        {pending.map((p) => (
          <HomeLogRow
            key={p.id}
            pendingLabel={p.failed ? tr('uploads.failed') : tr('task.waitingSync')}
            log={{ id: p.id, outcome: p.payload.outcome, difficulty: p.payload.difficulty, note: p.payload.note, createdAt: p.createdAt, mediaId: p.payload.video ? 'pending' : undefined, loggedByName: '' }}
          />
        ))}
        {logs.map((log: HomeLog) => (
          <HomeLogRow key={log.id} log={log} />
        ))}
        {!logs.length && !pending.length ? <Text color="textMuted">{tr('task.historyEmpty')}</Text> : null}
      </Stack>
    </Screen>
  );
}
