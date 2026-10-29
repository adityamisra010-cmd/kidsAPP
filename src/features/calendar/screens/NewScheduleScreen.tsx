/**
 * `/appointment/new` (coordinator / school admin): weekly series or one-off session, with a live
 * clash check before saving. Optional `childId` and `date` prefill the form.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { addWeeks } from 'date-fns';
import { router } from 'expo-router';
import { CalendarCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import { useChildren, useTherapyTypes } from '@/data/hooks';
import type { Conflict } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { formatDate, formatDay, parse, toISODate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import {
  Button,
  ChipGroup,
  confirm,
  DateField,
  EmptyState,
  errorMessageKey,
  formatClock,
  FormTextField,
  Screen,
  Stack,
  SwitchRow,
  Text,
  TimeField,
  toast,
} from '@/ui';

import { ConflictList } from '../components/ConflictList';
import { ChildPickerField, StaffRadioList, useQualifiedStaff } from '../components/Pickers';
import { isAdminRole } from '../lib/actions';
import { countOccurrences, sortWeekdays } from '../lib/recurrence';
import { DURATIONS, emptySchedule, isCheckable, scheduleSchema, toSeriesInput, type ScheduleValues } from '../lib/schedule';
import { latestStart, weekdayOf } from '../lib/slots';
import { useLiveConflicts, useOrgSettings, useScheduleMutation } from '../queries';

/** About one school term. The summary line shows the exact count before saving. */
const DEFAULT_WEEKS = 12;

function defaults(childId?: string, date?: string): ScheduleValues {
  const start = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toISODate(new Date());
  return emptySchedule({
    childId: childId ?? '',
    startDate: start,
    endDate: toISODate(addWeeks(parse(start), DEFAULT_WEEKS)),
    weekdays: date ? [weekdayOf(start)] : [],
  });
}

export function NewScheduleScreen({ childId, date }: { childId?: string; date?: string }) {
  const { t } = useTranslation('calendar');
  const repo = useRepo();
  const active = useRequiredActive();
  const settings = useOrgSettings();
  const types = useTherapyTypes();
  const children = useChildren();
  /** Clashes returned by a refused save, tied to the exact form values they were for. */
  const [refused, setRefused] = useState<{ serial: string; conflicts: Conflict[] } | null>(null);

  const { control, handleSubmit, setValue, getValues, formState } = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: defaults(childId, date),
  });
  const values = useWatch({ control }) as ScheduleValues;
  const staff = useQualifiedStaff(values.therapyTypeId || undefined);
  const child = children.data?.find((c) => c.child.id === values.childId);
  const usualIds = (child?.therapists ?? []).filter((x) => x.therapyTypeId === values.therapyTypeId).map((x) => x.userId);

  // Suggest the child's usual therapist for the chosen therapy (still changeable).
  useEffect(() => {
    const current = getValues('therapistId');
    const qualified = staff.list.some((m) => m.profile.id === current);
    if (!qualified) {
      const usual = staff.list.find((m) => usualIds.includes(m.profile.id));
      setValue('therapistId', usual?.profile.id ?? '', { shouldValidate: formState.isSubmitted });
    }
    // usualIds is derived from these two; listing it would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.list, values.childId]);

  // Any edit after a refused save drops the old clash list.
  const serial = JSON.stringify(values);
  const rejected = refused && refused.serial === serial ? refused.conflicts : null;

  const checkable = isCheckable(values);
  const live = useLiveConflicts(checkable ? toSeriesInput(values) : null);
  const conflicts = rejected ?? live.conflicts;
  const hasConflicts = !!conflicts?.length;
  const count = values.repeats ? countOccurrences(values.weekdays, values.startDate, values.endDate) : 1;

  const save = useScheduleMutation(async (v: { values: ScheduleValues; force: boolean }) => {
    const input = toSeriesInput(v.values);
    if (v.values.repeats) {
      const res = await repo.appointments.createSeries(input, { force: v.force });
      return { created: res.created, conflicts: res.conflicts };
    }
    const { weekdays: _w, endDate: _e, ...one } = input;
    const res = await repo.appointments.createOne(one, { force: v.force });
    return { created: res.appointment ? 1 : 0, conflicts: res.conflicts };
  });

  const onSubmit = handleSubmit(async (v) => {
    if (hasConflicts) {
      if (!isAdminRole(active.role)) return;
      const ok = await confirm({ title: t('conflicts.confirmTitle'), body: t('conflicts.confirmBody'), confirmLabel: t('conflicts.saveAnyway') });
      if (!ok) return;
    }
    try {
      const res = await save.mutateAsync({ values: v, force: hasConflicts });
      if (res.created === 0) {
        setRefused({ serial, conflicts: res.conflicts });
        toast.error(t('new.notSaved'));
        return;
      }
      toast.success(t('new.saved', { count: res.created }));
      if (router.canGoBack()) router.back();
      else router.replace('/admin/schedule');
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  });

  const err = (name: keyof ScheduleValues) => {
    const m = formState.errors[name]?.message;
    return m ? t(m) : undefined;
  };
  const working = sortWeekdays(settings.workingHours.days);
  const typeOptions = (types.data ?? []).filter((x) => x.active).map((x) => ({ value: x.id, label: therapyTypeLabel(t, x), dot: x.color }));
  const summary =
    values.repeats && values.weekdays.length && values.endDate >= values.startDate
      ? t('new.summarySeries', { count, from: formatDay(values.startDate), to: formatDay(values.endDate) })
      : !values.repeats && values.startDate && values.startTime
        ? t('new.summaryOne', { date: formatDate(values.startDate), time: formatClock(values.startTime) })
        : null;

  if (!isAdminRole(active.role)) {
    return (
      <Screen title={t('new.title')} back>
        <EmptyState title={t('errors:forbidden')} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('new.title')}
      back
      testID="new-schedule-screen"
      footer={
        <>
          {summary ? (
            <Text variant="label" color="textMuted" testID="schedule-summary">
              {summary}
            </Text>
          ) : null}
          <Button
            label={hasConflicts ? t('conflicts.saveAnyway') : t('new.save')}
            icon={CalendarCheck}
            onPress={() => void onSubmit()}
            loading={save.isPending}
            disabled={live.checking && !rejected}
            fullWidth
            testID="save-schedule"
          />
        </>
      }
    >
      <Stack gap={5}>
        <Controller control={control} name="childId" render={({ field }) => <ChildPickerField value={field.value} onChange={field.onChange} error={err('childId')} />} />

        <Stack gap={2}>
          <Text variant="label">{t('new.therapyType')}</Text>
          <Controller
            control={control}
            name="therapyTypeId"
            render={({ field }) => <ChipGroup single options={typeOptions} value={field.value ? [field.value] : []} onChange={(v) => field.onChange(v[0] ?? '')} testID="type-chips" />}
          />
          {err('therapyTypeId') ? (
            <Text variant="caption" color="danger">
              {err('therapyTypeId')}
            </Text>
          ) : null}
        </Stack>

        <Stack gap={2}>
          <Text variant="label">{t('new.therapist')}</Text>
          <Controller
            control={control}
            name="therapistId"
            render={({ field }) => (
              <StaffRadioList
                staff={staff.list}
                value={field.value}
                onChange={field.onChange}
                usualIds={usualIds}
                emptyText={values.therapyTypeId ? t('pickers.noTherapist') : t('pickers.pickTypeFirst')}
              />
            )}
          />
          {err('therapistId') ? (
            <Text variant="caption" color="danger">
              {err('therapistId')}
            </Text>
          ) : null}
        </Stack>

        <Controller control={control} name="repeats" render={({ field }) => <SwitchRow label={t('new.repeats')} description={t('new.repeatsHint')} value={field.value} onChange={field.onChange} testID="repeats" />} />

        {values.repeats ? (
          <Stack gap={2}>
            <Text variant="label">{t('new.weekdays')}</Text>
            <Controller
              control={control}
              name="weekdays"
              render={({ field }) => (
                <ChipGroup
                  options={working.map((d) => ({ value: String(d), label: t(`weekdays.short.${d}`) }))}
                  value={field.value.map(String)}
                  onChange={(v) => field.onChange(sortWeekdays(v.map(Number)))}
                  testID="weekday-chips"
                />
              )}
            />
            {err('weekdays') ? (
              <Text variant="caption" color="danger">
                {err('weekdays')}
              </Text>
            ) : null}
          </Stack>
        ) : null}

        <Stack gap={2}>
          <Text variant="label">{t('new.duration')}</Text>
          <Controller
            control={control}
            name="durationMinutes"
            render={({ field }) => (
              <ChipGroup
                single
                options={DURATIONS.map((d) => ({ value: String(d), label: t('new.durationChip', { count: d }) }))}
                value={[String(field.value)]}
                onChange={(v) => v[0] && field.onChange(Number(v[0]))}
              />
            )}
          />
        </Stack>

        <Controller
          control={control}
          name="startTime"
          render={({ field }) => (
            <TimeField
              label={t('new.startTime')}
              value={field.value || undefined}
              start={settings.workingHours.start}
              end={latestStart(settings.workingHours, values.durationMinutes)}
              onChange={field.onChange}
              error={err('startTime')}
            />
          )}
        />

        <Controller
          control={control}
          name="startDate"
          render={({ field }) => (
            <DateField label={values.repeats ? t('new.startDate') : t('new.date')} value={field.value || undefined} minDate={toISODate(new Date())} onChange={field.onChange} error={err('startDate')} />
          )}
        />
        {values.repeats ? (
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <DateField label={t('new.endDate')} value={field.value || undefined} minDate={values.startDate || undefined} onChange={field.onChange} error={err('endDate')} />
            )}
          />
        ) : null}

        <FormTextField control={control} name="room" label={t('new.room')} placeholder={t('new.roomPlaceholder')} maxLength={40} />

        {checkable || rejected ? <ConflictList conflicts={conflicts} checking={!rejected && live.checking} /> : null}
      </Stack>
    </Screen>
  );
}
