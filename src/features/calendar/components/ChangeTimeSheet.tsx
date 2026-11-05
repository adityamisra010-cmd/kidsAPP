/** Coordinator: move a session (or this + all future) to a new time and/or therapist, with a clash check. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import type { Appointment, AppointmentView, SeriesInput, UUID } from '@/domain/types';
import { clockTime, toISODate } from '@/lib/dates';
import { Button, DateField, errorMessageKey, SegmentedControl, Sheet, Stack, Text, TimeField, toast } from '@/ui';

import { localDate } from '../lib/grouping';
import { addMinutesISO, durationMinutes, latestStart, slotToISO, validateSlot, weekdayOf } from '../lib/slots';
import { useLiveConflicts, useOrgSettings, useScheduleMutation } from '../queries';
import { ConflictList } from './ConflictList';
import { StaffRadioList, useQualifiedStaff } from './Pickers';

type Scope = 'this' | 'future';
type Patch = Partial<Pick<Appointment, 'startsAt' | 'endsAt' | 'therapistId' | 'room'>>;

function ChangeTimeSheetBody({
  appointment: a,
  siblings,
  seriesWeekdays,
  visible,
  onClose,
}: {
  appointment: AppointmentView;
  /** Known occurrences of the same series (to exclude from the clash check). */
  siblings: AppointmentView[];
  seriesWeekdays: number[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('calendar');
  const repo = useRepo();
  const settings = useOrgSettings();
  const staff = useQualifiedStaff(a.therapyTypeId);
  const duration = durationMinutes(a.startsAt, a.endsAt);
  const originalDate = localDate(a.startsAt);
  const originalTime = clockTime(a.startsAt);

  const [scope, setScope] = useState<Scope>('this');
  const [date, setDate] = useState(originalDate);
  const [time, setTime] = useState(originalTime);
  const [therapistId, setTherapistId] = useState<UUID>(a.therapistId);
  const update = useScheduleMutation((v: { patch: Patch; scope: Scope }) => repo.appointments.update(a.id, v.patch, v.scope));


  const effectiveDate = scope === 'future' ? originalDate : date;
  const changed = effectiveDate !== originalDate || time !== originalTime || therapistId !== a.therapistId;
  const slotError = changed
    ? validateSlot({ date: effectiveDate, time }, { now: new Date(), workingHours: settings.workingHours, holidays: settings.holidays, durationMinutes: duration })
    : null;

  const conflictInput = ((): (SeriesInput & { excludeAppointmentIds?: UUID[] }) | null => {
    if (!visible || !changed || slotError) return null;
    const base = { childId: a.childId, therapistId, therapyTypeId: a.therapyTypeId, startTime: time, durationMinutes: duration, room: a.room };
    if (scope === 'this') {
      return { ...base, weekdays: [weekdayOf(date)], startDate: date, endDate: date, excludeAppointmentIds: [a.id] };
    }
    const future = siblings.filter((s) => s.startsAt >= a.startsAt);
    const last = future.length ? localDate(future[future.length - 1].startsAt) : originalDate;
    return {
      ...base,
      weekdays: seriesWeekdays.length ? seriesWeekdays : [weekdayOf(originalDate)],
      startDate: originalDate,
      endDate: last,
      excludeAppointmentIds: [a.id, ...future.map((s) => s.id)],
    };
  })();
  const live = useLiveConflicts(conflictInput);
  const hasConflicts = !!live.conflicts?.length;

  const onSave = async () => {
    // With clashes the button reads "Save anyway" right under the clash list: that is the confirmation.
    if (!changed || slotError) return;
    const startsAt = slotToISO({ date: effectiveDate, time });
    const patch: Patch = { startsAt, endsAt: addMinutesISO(startsAt, duration) };
    if (therapistId !== a.therapistId) patch.therapistId = therapistId;
    try {
      await update.mutateAsync({ patch, scope });
      toast.success(t('change.saved'));
      onClose();
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('change.title')}
      subtitle={`${a.therapyTypeName} · ${a.childName}`}
      testID="change-sheet"
      footer={
        <Button
          label={hasConflicts ? t('conflicts.saveAnyway') : t('change.save')}
          onPress={() => void onSave()}
          disabled={!changed || !!slotError}
          loading={update.isPending}
          fullWidth
        />
      }
    >
      {a.seriesId ? (
        <SegmentedControl
          options={[
            { value: 'this', label: t('change.scopeThis') },
            { value: 'future', label: t('change.scopeFuture') },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : null}
      {scope === 'future' ? (
        <Text variant="caption" color="textMuted">
          {t('change.futureNote')}
        </Text>
      ) : (
        <DateField label={t('change.date')} value={date} minDate={toISODate(new Date())} onChange={setDate} />
      )}
      <TimeField label={t('change.time')} value={time} start={settings.workingHours.start} end={latestStart(settings.workingHours, duration)} onChange={setTime} />
      {slotError ? (
        <Text variant="caption" color="danger">
          {t(`slots.errors.${slotError}`)}
        </Text>
      ) : null}
      <Stack gap={2}>
        <Text variant="subheading">{t('change.therapist')}</Text>
        <StaffRadioList staff={staff.list} value={therapistId} onChange={setTherapistId} usualIds={[a.originalTherapistId ?? a.therapistId]} emptyText={t('pickers.noTherapist')} />
      </Stack>
      {!changed ? (
        <Text variant="caption" color="textMuted">
          {t('change.nothingChanged')}
        </Text>
      ) : !slotError ? (
        <ConflictList conflicts={live.conflicts} checking={live.checking} />
      ) : null}
    </Sheet>
  );
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function ChangeTimeSheet(props: Parameters<typeof ChangeTimeSheetBody>[0]) {
  return props.visible ? <ChangeTimeSheetBody {...props} /> : null;
}
