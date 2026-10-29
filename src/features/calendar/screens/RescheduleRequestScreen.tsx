/**
 * `/reschedule/[appointmentId]` (parent): propose up to two other times + a reason. Schools own
 * the roster, so this is a request; the coordinator confirms.
 */
import { router } from 'expo-router';
import { CircleCheckBig, Plus, Send, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import { useAppointment } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { toISODate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, EmptyState, errorMessageKey, ErrorState, Screen, SkeletonList, Stack, Text, TextField, toast } from '@/ui';

import { AgendaRow } from '../components/AgendaRow';
import { SlotFields } from '../components/Pickers';
import { isOpen } from '../lib/actions';
import { composeReason } from '../lib/requests';
import { durationMinutes, latestStart, slotToISO, validateSlots, type Slot } from '../lib/slots';
import { useOrgSettings, useScheduleMutation } from '../queries';

const REASONS = ['unwell', 'travel', 'school_exam', 'family_event', 'transport', 'other'] as const;

export function RescheduleRequestScreen({ appointmentId }: { appointmentId: UUID }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const repo = useRepo();
  const settings = useOrgSettings();
  const q = useAppointment(appointmentId);
  const [slots, setSlots] = useState<Slot[]>([{}]);
  const [reason, setReason] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);
  const send = useScheduleMutation((v: { slots: string[]; reason: string }) => repo.appointments.requestReschedule(appointmentId, v.slots, v.reason));

  const a = q.data;
  const duration = a ? durationMinutes(a.startsAt, a.endsAt) : 45;
  const errors = validateSlots(slots, { now: new Date(), workingHours: settings.workingHours, holidays: settings.holidays, durationMinutes: duration });
  const valid = errors.every((e) => e === null) && reason.length > 0;

  const onSubmit = async () => {
    setSubmitted(true);
    if (!valid) return;
    try {
      await send.mutateAsync({
        slots: slots.map((s) => slotToISO({ date: s.date!, time: s.time! })),
        reason: composeReason(tr(`reschedule.reasons.${reason[0]}`), note),
      });
      setSent(true);
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    }
  };

  if (sent) {
    return (
      <Screen title={tr('reschedule.title')} back testID="reschedule-sent">
        <Card tone="success">
          <Stack gap={3} align="center">
            <CircleCheckBig size={40} color={t.colors.success} />
            <Text variant="title" align="center" accessibilityRole="header">
              {tr('reschedule.sentTitle')}
            </Text>
            <Text color="textMuted" align="center">
              {tr('reschedule.sentBody')}
            </Text>
          </Stack>
        </Card>
        <Button label={tr('reschedule.backToSession')} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/appointment/${appointmentId}`))} fullWidth />
      </Screen>
    );
  }

  const canRequest = !!a && isOpen(a, new Date()) && !a.pendingRescheduleRequestId;
  return (
    <Screen
      title={tr('reschedule.title')}
      back
      testID="reschedule-screen"
      footer={canRequest ? <Button label={tr('reschedule.submit')} icon={Send} onPress={() => void onSubmit()} loading={send.isPending} fullWidth testID="send-request" /> : undefined}
    >
      {q.isPending ? (
        <SkeletonList rows={3} />
      ) : q.error || !a ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !canRequest ? (
        <>
          <AgendaRow appointment={a} perspective="parent" />
          <EmptyState compact title={a.pendingRescheduleRequestId ? tr('reschedule.alreadyPending') : tr('reschedule.notAvailable')} />
        </>
      ) : (
        <Stack gap={5}>
          <Stack gap={2}>
            <Text variant="overline" color="textMuted">
              {tr('reschedule.current')}
            </Text>
            <AgendaRow appointment={a} perspective="parent" />
          </Stack>
          <Text color="textMuted">{tr('reschedule.intro')}</Text>

          <Stack gap={4}>
            <Text variant="heading" accessibilityRole="header">
              {tr('reschedule.proposedTitle')}
            </Text>
            {slots.map((s, i) => (
              <Card key={i} padding={4} elevated={false} testID={`slot-${i}`}>
                <Stack gap={2}>
                  <SlotFields
                    title={tr('slots.option', { n: i + 1 })}
                    slot={s}
                    onChange={(next) => setSlots(slots.map((x, j) => (j === i ? next : x)))}
                    error={submitted || (s.date && s.time) ? errors[i] : null}
                    minDate={toISODate(new Date())}
                    timeStart={settings.workingHours.start}
                    timeEnd={latestStart(settings.workingHours, duration)}
                  />
                  {i > 0 ? (
                    <Button size="sm" variant="ghost" icon={Trash2} label={tr('slots.removeSecond')} onPress={() => setSlots(slots.slice(0, 1))} style={{ alignSelf: 'flex-start' }} />
                  ) : null}
                </Stack>
              </Card>
            ))}
            {slots.length < 2 ? (
              <Button variant="secondary" icon={Plus} label={tr('slots.addSecond')} onPress={() => setSlots([...slots, {}])} testID="add-slot" />
            ) : null}
          </Stack>

          <Stack gap={2}>
            <Text variant="heading" accessibilityRole="header">
              {tr('reschedule.reasonTitle')}
            </Text>
            <ChipGroup single options={REASONS.map((r) => ({ value: r, label: tr(`reschedule.reasons.${r}`) }))} value={reason} onChange={setReason} testID="reason-chips" />
            {submitted && !reason.length ? (
              <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
                {tr('reschedule.reasonRequired')}
              </Text>
            ) : null}
          </Stack>
          <TextField label={tr('reschedule.noteLabel')} placeholder={tr('reschedule.notePlaceholder')} value={note} onChangeText={setNote} multiline minLines={2} maxLength={200} />
        </Stack>
      )}
    </Screen>
  );
}
