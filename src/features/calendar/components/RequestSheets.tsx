/** Coordinator answers to a reschedule request: approve a slot, offer other times, or decline. */
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useRepo } from '@/data';
import type { AppointmentView, ISODateTime, RescheduleRequest } from '@/domain/types';
import { toISODate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { Button, errorMessageKey, Sheet, Text, TextField, toast } from '@/ui';

import { durationMinutes, isoToSlot, latestStart, slotToISO, validateSlots, weekdayOf, type Slot } from '../lib/slots';
import { useLiveConflicts, useOrgSettings, useScheduleMutation } from '../queries';
import { ConflictList } from './ConflictList';
import { SlotFields } from './Pickers';
import { slotLabel } from './RequestStatusCard';

export type RequestWithAppointment = RescheduleRequest & { appointment: AppointmentView };
type Resolution = Parameters<ReturnType<typeof useRepo>['appointments']['resolveRescheduleRequest']>[1];

function useResolve(id: string) {
  const repo = useRepo();
  return useScheduleMutation((action: Resolution) => repo.appointments.resolveRescheduleRequest(id, action));
}

function ApproveSheetBody({ request: r, visible, onClose }: { request: RequestWithAppointment; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const [slot, setSlot] = useState<ISODateTime | undefined>(r.proposedSlots.length === 1 ? r.proposedSlots[0] : undefined);
  const resolve = useResolve(r.id);
  const a = r.appointment;
  const duration = durationMinutes(a.startsAt, a.endsAt);


  const chosen = slot ? isoToSlot(slot) : null;
  const live = useLiveConflicts(
    visible && chosen
      ? {
          childId: a.childId,
          therapistId: a.therapistId,
          therapyTypeId: a.therapyTypeId,
          weekdays: [weekdayOf(chosen.date)],
          startTime: chosen.time,
          durationMinutes: duration,
          startDate: chosen.date,
          endDate: chosen.date,
          room: a.room,
          excludeAppointmentIds: [a.id],
        }
      : null,
  );

  const onApprove = async () => {
    if (!slot) return;
    try {
      await resolve.mutateAsync({ type: 'approve', slot });
      toast.success(tr('requests.approved'));
      onClose();
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('requests.approveTitle')}
      subtitle={`${a.childName} · ${a.therapyTypeName}`}
      testID="approve-sheet"
      footer={
        <Button label={live.conflicts?.length ? tr('conflicts.saveAnyway') : tr('requests.approveSave')} onPress={() => void onApprove()} disabled={!slot} loading={resolve.isPending} fullWidth />
      }
    >
      <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
        {r.proposedSlots.map((s) => {
          const selected = s === slot;
          return (
            <Pressable
              key={s}
              onPress={() => setSlot(s)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={slotLabel(s)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[3],
                minHeight: TOUCH + 4,
                paddingHorizontal: t.space[3],
                borderRadius: t.radius.md,
                borderWidth: 1.5,
                borderColor: selected ? t.colors.primary : t.colors.border,
                backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
              }}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }} tint={selected ? t.colors.primaryText : t.colors.text}>
                {slotLabel(s)}
              </Text>
              {selected ? <Check size={20} color={t.colors.primaryText} /> : null}
            </Pressable>
          );
        })}
      </View>
      {slot ? <ConflictList conflicts={live.conflicts} checking={live.checking} /> : null}
    </Sheet>
  );
}

function CounterSheetBody({ request: r, visible, onClose }: { request: RequestWithAppointment; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('calendar');
  const settings = useOrgSettings();
  const resolve = useResolve(r.id);
  const [slots, setSlots] = useState<Slot[]>([{}]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const duration = durationMinutes(r.appointment.startsAt, r.appointment.endsAt);


  const errors = validateSlots(slots, { now: new Date(), workingHours: settings.workingHours, holidays: settings.holidays, durationMinutes: duration });
  const onSend = async () => {
    setSubmitted(true);
    if (errors.some(Boolean)) return;
    try {
      await resolve.mutateAsync({ type: 'counter', slots: slots.map((s) => slotToISO({ date: s.date!, time: s.time! })), note: note.trim() || undefined });
      toast.success(t('requests.countered'));
      onClose();
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('requests.counterTitle')}
      subtitle={`${r.appointment.childName} · ${r.appointment.therapyTypeName}`}
      testID="counter-sheet"
      footer={<Button label={t('requests.counterSave')} onPress={() => void onSend()} loading={resolve.isPending} fullWidth />}
    >
      {slots.map((s, i) => (
        <SlotFields
          key={i}
          title={t('slots.option', { n: i + 1 })}
          slot={s}
          onChange={(next) => setSlots(slots.map((x, j) => (j === i ? next : x)))}
          error={submitted || (s.date && s.time) ? errors[i] : null}
          minDate={toISODate(new Date())}
          timeStart={settings.workingHours.start}
          timeEnd={latestStart(settings.workingHours, duration)}
        />
      ))}
      {slots.length < 2 ? (
        <Button size="sm" variant="secondary" label={t('slots.addSecond')} onPress={() => setSlots([...slots, {}])} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <Button size="sm" variant="ghost" label={t('slots.removeSecond')} onPress={() => setSlots(slots.slice(0, 1))} style={{ alignSelf: 'flex-start' }} />
      )}
      <TextField label={t('requests.counterNote')} value={note} onChangeText={setNote} multiline minLines={2} maxLength={200} />
    </Sheet>
  );
}

function DeclineSheetBody({ request: r, visible, onClose }: { request: RequestWithAppointment; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('calendar');
  const resolve = useResolve(r.id);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);


  const onDecline = async () => {
    setSubmitted(true);
    if (!note.trim()) return;
    try {
      await resolve.mutateAsync({ type: 'decline', note: note.trim() });
      toast.success(t('requests.declined'));
      onClose();
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('requests.declineTitle')}
      subtitle={`${r.appointment.childName} · ${r.appointment.therapyTypeName}`}
      testID="decline-sheet"
      footer={<Button label={t('requests.declineSave')} variant="danger" onPress={() => void onDecline()} loading={resolve.isPending} fullWidth />}
    >
      <TextField
        label={t('requests.declineNote')}
        value={note}
        onChangeText={setNote}
        multiline
        minLines={3}
        maxLength={300}
        required
        error={submitted && !note.trim() ? t('requests.declineNoteRequired') : undefined}
      />
    </Sheet>
  );
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function ApproveSheet(props: Parameters<typeof ApproveSheetBody>[0]) {
  return props.visible ? <ApproveSheetBody {...props} /> : null;
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function CounterSheet(props: Parameters<typeof CounterSheetBody>[0]) {
  return props.visible ? <CounterSheetBody {...props} /> : null;
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function DeclineSheet(props: Parameters<typeof DeclineSheetBody>[0]) {
  return props.visible ? <DeclineSheetBody {...props} /> : null;
}
