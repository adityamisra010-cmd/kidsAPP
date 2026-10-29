/** Book a make-up session linked to a missed (absent / cancelled) one. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import type { AppointmentView, Conflict, SeriesInput, UUID } from '@/domain/types';
import { formatDay, toISODate } from '@/lib/dates';
import { Button, errorMessageKey, Sheet, Stack, Text, toast } from '@/ui';

import { durationMinutes, latestStart, validateSlot, weekdayOf, type Slot } from '../lib/slots';
import { useLiveConflicts, useOrgSettings, useScheduleMutation } from '../queries';
import { ConflictList } from './ConflictList';
import { SlotFields, StaffRadioList, useQualifiedStaff } from './Pickers';

function MakeupSheetBody({ appointment: a, visible, onClose }: { appointment: AppointmentView; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('calendar');
  const repo = useRepo();
  const settings = useOrgSettings();
  const staff = useQualifiedStaff(a.therapyTypeId);
  const duration = durationMinutes(a.startsAt, a.endsAt);
  const [slot, setSlot] = useState<Slot>({});
  const [therapistId, setTherapistId] = useState<UUID>(a.originalTherapistId ?? a.therapistId);
  const [rejected, setRejected] = useState<Conflict[] | null>(null);


  const slotError = slot.date || slot.time ? validateSlot(slot, { now: new Date(), workingHours: settings.workingHours, holidays: settings.holidays, durationMinutes: duration }) : null;
  const ready = !!slot.date && !!slot.time && !slotError;

  const input = useMemo<SeriesInput | null>(
    () =>
      ready && slot.date && slot.time
        ? {
            childId: a.childId,
            therapistId,
            therapyTypeId: a.therapyTypeId,
            weekdays: [weekdayOf(slot.date)],
            startTime: slot.time,
            durationMinutes: duration,
            startDate: slot.date,
            endDate: slot.date,
            room: a.room,
          }
        : null,
    [ready, slot.date, slot.time, a.childId, a.therapyTypeId, a.room, therapistId, duration],
  );
  const live = useLiveConflicts(visible ? input : null);

  const book = useScheduleMutation((v: { input: SeriesInput; force: boolean }) => {
    const { weekdays: _w, endDate: _e, ...one } = v.input;
    return repo.appointments.createOne({ ...one, makeupOfId: a.id }, { force: v.force });
  });

  const onBook = async () => {
    if (!input) return;
    try {
      const res = await book.mutateAsync({ input, force: !!live.conflicts?.length || !!rejected });
      if (!res.appointment) {
        setRejected(res.conflicts);
        return;
      }
      toast.success(t('makeup.saved'));
      onClose();
      router.push(`/appointment/${res.appointment.id}`);
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  const shownConflicts = rejected ?? live.conflicts;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('makeup.title')}
      subtitle={t('makeup.subtitle', { date: formatDay(a.startsAt) })}
      testID="makeup-sheet"
      footer={<Button label={shownConflicts?.length ? t('conflicts.saveAnyway') : t('makeup.save')} onPress={() => void onBook()} disabled={!ready} loading={book.isPending} fullWidth />}
    >
      <SlotFields
        slot={slot}
        onChange={(s) => {
          setSlot(s);
          setRejected(null);
        }}
        error={slotError === 'missing' ? null : slotError}
        minDate={toISODate(new Date())}
        timeStart={settings.workingHours.start}
        timeEnd={latestStart(settings.workingHours, duration)}
      />
      <Stack gap={2}>
        <Text variant="subheading">{t('pickers.therapist')}</Text>
        <StaffRadioList staff={staff.list} value={therapistId} onChange={setTherapistId} usualIds={[a.originalTherapistId ?? a.therapistId]} emptyText={t('pickers.noTherapist')} />
      </Stack>
      {ready ? <ConflictList conflicts={shownConflicts} checking={!rejected && live.checking} /> : null}
    </Sheet>
  );
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function MakeupSheet(props: Parameters<typeof MakeupSheetBody>[0]) {
  return props.visible ? <MakeupSheetBody {...props} /> : null;
}
