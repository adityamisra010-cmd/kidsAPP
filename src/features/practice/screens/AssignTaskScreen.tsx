/**
 * Assign (or edit) a home practice task (staff). Child → goal → start from library or write your
 * own → short steps → how often / how long → active window. Saved tasks appear in the parent's
 * Practice tab.
 */
import { router } from 'expo-router';
import { BookOpen, ChevronDown, Save, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useChildren, useGoals } from '@/data/hooks';
import type { ChildFilter } from '@/data/repository';
import { toISODate } from '@/lib/dates';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, Card, ChipGroup, DateField, ErrorState, ListItem, Row, Screen, Sheet, SkeletonList, Stack, Text, TextField, toast } from '@/ui';

import { ResourcePickerSheet } from '../../resources/components/ResourcePickerSheet';
import { KindTile } from '../../resources/components/ResourceRow';
import { useResource } from '../../resources/queries';
import { ChildRadioList, RadioRow } from '../components/RadioList';
import { StepsEditor } from '../components/StepsEditor';
import { defaultTaskDraft, draftFromTask, DURATION_OPTIONS, FREQUENCY_OPTIONS, isAssignableGoal, toTaskInput, validateTaskDraft, type TaskDraft } from '../logic';
import { useSaveTask, useTask } from '../queries';

export interface AssignTaskParams {
  childId?: string;
  goalId?: string;
  resourceId?: string;
  /** Edit mode. */
  taskId?: string;
}

export function AssignTaskScreen({ childId, goalId, resourceId, taskId }: AssignTaskParams) {
  const { t: tr } = useTranslation('practice');
  const existing = useTask(taskId);
  if (!taskId) {
    return <AssignTaskForm initial={() => defaultTaskDraft(toISODate(new Date()), { childId, goalId, resourceId })} childLocked={!!childId} />;
  }
  if (!existing.data) {
    return (
      <Screen title={tr('assign.editTitle')} back>
        {existing.error ? <ErrorState error={existing.error} onRetry={() => void existing.refetch()} /> : <SkeletonList rows={4} />}
      </Screen>
    );
  }
  const task = existing.data;
  return <AssignTaskForm key={task.id} taskId={task.id} initial={() => draftFromTask(task)} childLocked />;
}

function AssignTaskForm({ initial, taskId, childLocked }: { initial: () => TaskDraft; taskId?: string; childLocked: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const active = useActive();
  const editing = !!taskId;
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [childSheet, setChildSheet] = useState(false);
  const [librarySheet, setLibrarySheet] = useState(false);
  const save = useSaveTask();

  const childFilter: ChildFilter = active?.role === 'therapist' ? { therapistId: active.user.profile.id, status: 'active' } : { status: 'active' };
  const children = useChildren(childFilter);
  const child = useChildDetail(draft.childId);
  const goals = useGoals(draft.childId);
  const resource = useResource(draft.resourceId);
  const assignableGoals = useMemo(() => (goals.data ?? []).filter((g) => isAssignableGoal(g.status) || g.id === draft.goalId), [goals.data, draft.goalId]);

  const errors = validateTaskDraft(draft);
  const err = (k: keyof typeof errors) => (showErrors && errors[k] ? tr(errors[k]!) : undefined);
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(errors).length) return;
    save.mutate(
      { taskId, input: toTaskInput(draft) },
      {
        onSuccess: () => {
          toast.success(editing ? tr('assign.savedEdit') : tr('assign.saved'));
          if (router.canGoBack()) router.back();
          else router.replace('/therapist/today');
        },
        onError: () => toast.error(tr('errors:unknown')),
      },
    );
  };

  const title = editing ? tr('assign.editTitle') : tr('assign.title');
  const childName = child.data?.child.fullName;

  return (
    <Screen
      title={title}
      back
      testID="assign-task"
      footer={
        <>
          {!editing ? (
            <Text variant="caption" color="textMuted" align="center">
              {tr('assign.notifyHint')}
            </Text>
          ) : null}
          <Button label={editing ? tr('assign.saveEdit') : tr('assign.save')} icon={Save} size="lg" fullWidth loading={save.isPending} onPress={submit} testID="assign-save" />
        </>
      }
    >
      {/* Child */}
      <Stack gap={2}>
        <Text variant="label">{tr('assign.child')}</Text>
        {childLocked ? (
          <Row gap={3}>
            <Avatar name={childName ?? '…'} uri={child.data?.child.photoUrl} size={44} />
            <Text variant="subheading">{childName ?? ''}</Text>
          </Row>
        ) : (
          <Card padding={2} elevated={false}>
            <ListItem
              title={childName ?? tr('assign.chooseChild')}
              left={childName ? <Avatar name={childName} size={40} /> : undefined}
              right={<ChevronDown size={20} color={t.colors.textMuted} />}
              chevron={false}
              onPress={() => setChildSheet(true)}
              testID="assign-child"
            />
          </Card>
        )}
        {err('child') ? (
          <Text variant="caption" color="danger">
            {err('child')}
          </Text>
        ) : null}
      </Stack>

      {/* Goal */}
      {draft.childId ? (
        <Stack gap={2}>
          <Text variant="label">{tr('assign.goal')}</Text>
          <RadioRow selected={!draft.goalId} onPress={() => set({ goalId: undefined })} title={tr('assign.noGoal')} />
          {assignableGoals.map((g) => (
            <RadioRow key={g.id} selected={g.id === draft.goalId} onPress={() => set({ goalId: g.id })} title={g.parentText} subtitle={g.staffText !== g.parentText ? g.staffText : undefined} />
          ))}
        </Stack>
      ) : null}

      {/* Library */}
      <Card tone="sunken" elevated={false}>
        {resource.data ? (
          <Stack gap={3}>
            <Text variant="label">{tr('assign.resource')}</Text>
            <Row gap={3}>
              <KindTile kind={resource.data.kind} size={44} />
              <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
                {resource.data.title}
              </Text>
            </Row>
            <Row gap={2}>
              <Button size="sm" variant="outline" icon={BookOpen} label={tr('assign.changeResource')} onPress={() => setLibrarySheet(true)} />
              <Button size="sm" variant="ghost" icon={X} label={tr('assign.removeResource')} onPress={() => set({ resourceId: undefined })} />
            </Row>
          </Stack>
        ) : (
          <Stack gap={2}>
            <Button variant="outline" icon={BookOpen} label={tr('assign.fromLibrary')} onPress={() => setLibrarySheet(true)} testID="assign-library" />
            <Text variant="caption" color="textMuted" align="center">
              {tr('assign.fromLibraryHint')}
            </Text>
          </Stack>
        )}
      </Card>

      <TextField
        label={tr('assign.titleLabel')}
        required
        placeholder={tr('assign.titlePlaceholder')}
        value={draft.title}
        onChangeText={(v) => set({ title: v })}
        maxLength={80}
        error={err('title')}
        testID="assign-title"
      />

      <StepsEditor steps={draft.steps} onChange={(steps) => set({ steps })} error={err('steps')} />

      <Stack gap={2}>
        <Text variant="label">{tr('assign.frequency')}</Text>
        <ChipGroup
          single
          options={FREQUENCY_OPTIONS.map((n) => ({ value: String(n), label: tr('assign.frequencyChip', { count: n }) }))}
          value={[String(draft.frequencyPerWeek)]}
          onChange={(v) => v[0] && set({ frequencyPerWeek: Number(v[0]) })}
        />
      </Stack>

      <Stack gap={2}>
        <Text variant="label">{tr('assign.duration')}</Text>
        <ChipGroup
          single
          options={DURATION_OPTIONS.map((n) => ({ value: String(n), label: tr('task.duration', { count: n }) }))}
          value={[String(draft.durationMinutes)]}
          onChange={(v) => v[0] && set({ durationMinutes: Number(v[0]) })}
        />
      </Stack>

      <Row gap={3} align="flex-start">
        <Stack flex={1}>
          <DateField label={tr('assign.from')} value={draft.activeFrom} onChange={(d) => set({ activeFrom: d })} />
        </Stack>
        <Stack flex={1}>
          <DateField label={tr('assign.to')} value={draft.activeTo} minDate={draft.activeFrom} onChange={(d) => set({ activeTo: d })} error={err('dates')} />
        </Stack>
      </Row>

      <Sheet visible={childSheet} onClose={() => setChildSheet(false)} title={tr('assign.chooseChild')}>
        {children.isPending ? (
          <SkeletonList rows={3} height={56} />
        ) : (
          <ChildRadioList
            items={children.data ?? []}
            value={draft.childId}
            onChange={(id) => {
              set({ childId: id, goalId: undefined });
              setChildSheet(false);
            }}
          />
        )}
      </Sheet>

      <ResourcePickerSheet
        visible={librarySheet}
        onClose={() => setLibrarySheet(false)}
        onSelect={(r) => setDraft((d) => ({ ...d, resourceId: r.id, title: d.title.trim() ? d.title : r.title }))}
      />
    </Screen>
  );
}
