/** Add leave: dates + reason, with a preview of the sessions that will need cover. */
import { endOfDay, startOfDay } from 'date-fns';
import { CalendarClock } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import type { AppointmentView, ISODate, Member, UUID } from '@/domain/types';
import { parse, toISODate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ChipGroup, DateField, errorMessageKey, Row, Sheet, Stack, Text, TextField, toast } from '@/ui';

import { isCancelled } from '../lib/marking';
import { composeReason } from '../lib/requests';
import { useAppointmentList, useScheduleMutation } from '../queries';
import { StaffRadioList } from './Pickers';

const REASONS = ['sick', 'personal', 'training', 'other'] as const;

function LeaveSheetBody({
  visible,
  onClose,
  userId,
  staff,
  admin,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  /** Pre-selected therapist (always set for therapists adding their own leave). */
  userId?: UUID;
  /** Staff to choose from (admins only). */
  staff: Member[];
  admin: boolean;
  onSaved: (affected: AppointmentView[]) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const repo = useRepo();
  const today = toISODate(new Date());
  const [who, setWho] = useState<UUID | undefined>(userId);
  const [from, setFrom] = useState<ISODate>(today);
  const [to, setTo] = useState<ISODate>(today);
  const [reason, setReason] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);


  const datesOk = to >= from;
  const preview = useAppointmentList(
    visible && who && datesOk ? { from: startOfDay(parse(from)).toISOString(), to: endOfDay(parse(to)).toISOString(), therapistId: who } : null,
  );
  const affected = (preview.data ?? []).filter((a) => !isCancelled(a));
  const add = useScheduleMutation((v: { userId: UUID; from: ISODate; to: ISODate; reason: string }) => repo.appointments.addUnavailability(v));

  const onSave = async () => {
    setSubmitted(true);
    if (!who || !datesOk || !reason.length) return;
    try {
      const res = await add.mutateAsync({ userId: who, from, to, reason: composeReason(tr(`availability.reasons.${reason[0]}`), note) });
      const n = res.affected.length;
      toast.success(n === 0 ? tr('availability.savedNone') : admin ? tr('availability.savedAdmin', { count: n }) : tr('availability.savedTherapist', { count: n }));
      onSaved(res.affected);
      onClose();
    } catch (e) {
      toast.error(tr(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('availability.addTitle')}
      testID="leave-sheet"
      footer={<Button label={tr('availability.save')} onPress={() => void onSave()} loading={add.isPending} disabled={!who} fullWidth testID="save-leave" />}
    >
      {admin ? (
        <Stack gap={2}>
          <Text variant="subheading">{tr('availability.therapist')}</Text>
          <StaffRadioList staff={staff} value={who} onChange={setWho} emptyText={tr('pickers.noTherapist')} />
        </Stack>
      ) : null}
      <DateField
        label={tr('availability.from')}
        value={from}
        minDate={today}
        onChange={(d) => {
          setFrom(d);
          if (to < d) setTo(d);
        }}
      />
      <DateField label={tr('availability.to')} value={to} minDate={from} onChange={setTo} error={datesOk ? undefined : tr('availability.toBeforeFrom')} />
      <Stack gap={2}>
        <Text variant="subheading">{tr('availability.reasonTitle')}</Text>
        <ChipGroup single options={REASONS.map((r) => ({ value: r, label: tr(`availability.reasons.${r}`) }))} value={reason} onChange={setReason} />
        {submitted && !reason.length ? (
          <Text variant="caption" color="danger">
            {tr('cancel.reasonRequired')}
          </Text>
        ) : null}
      </Stack>
      <TextField label={tr('availability.noteLabel')} value={note} onChangeText={setNote} maxLength={120} />
      {who && datesOk && !preview.isPending ? (
        <Card tone={affected.length ? 'info' : 'sunken'} elevated={false} padding={3} testID="leave-preview">
          <Row gap={2} align="flex-start">
            <CalendarClock size={18} color={affected.length ? t.colors.info : t.colors.textMuted} style={{ marginTop: 2 }} />
            <Stack gap={1} flex={1}>
              <Text variant="label" weight="semibold">
                {affected.length ? tr('availability.affected', { count: affected.length }) : tr('availability.affectedNone')}
              </Text>
              {affected.length ? (
                <Text variant="caption" color="textMuted">
                  {admin ? tr('availability.coverNoteAdmin') : tr('availability.coverNoteTherapist')}
                </Text>
              ) : null}
            </Stack>
          </Row>
        </Card>
      ) : null}
    </Sheet>
  );
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function LeaveSheet(props: Parameters<typeof LeaveSheetBody>[0]) {
  return props.visible ? <LeaveSheetBody {...props} /> : null;
}
