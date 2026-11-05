/** "Can't make it" (parent) and "Cancel by school" (admin): reason chips + note, then confirm. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRepo } from '@/data';
import type { AppointmentView } from '@/domain/types';
import { formatDay, formatTime } from '@/lib/dates';
import { Button, ChipGroup, confirm, errorMessageKey, Sheet, Stack, Text, TextField, toast } from '@/ui';

import { composeReason } from '../lib/requests';
import { useScheduleMutation } from '../queries';

const PARENT_REASONS = ['unwell', 'travel', 'family_event', 'other'] as const;
const SCHOOL_REASONS = ['therapist_unavailable', 'school_event', 'room_unavailable', 'other'] as const;

function CancelSheetBody({
  appointment: a,
  by,
  visible,
  onClose,
}: {
  appointment: AppointmentView;
  by: 'parent' | 'school';
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('calendar');
  const repo = useRepo();
  const [reason, setReason] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [showError, setShowError] = useState(false);
  const cancel = useScheduleMutation((text: string) => repo.appointments.cancel(a.id, by, text));
  const group = by === 'parent' ? 'parentReasons' : 'schoolReasons';
  const reasons = by === 'parent' ? PARENT_REASONS : SCHOOL_REASONS;


  const onSubmit = async () => {
    if (!reason.length) {
      setShowError(true);
      return;
    }
    const text = composeReason(t(`cancel.${group}.${reason[0]}`), note);
    onClose();
    const ok = await confirm({
      title: t('cancel.confirmTitle'),
      body: t('cancel.confirmBody', { therapy: a.therapyTypeName, date: formatDay(a.startsAt), time: formatTime(a.startsAt) }),
      confirmLabel: t('cancel.confirmYes'),
      cancelLabel: t('cancel.keep'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(text);
      toast.success(by === 'parent' ? t('cancel.doneParent') : t('cancel.doneSchool'));
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={by === 'parent' ? t('cancel.parentTitle') : t('cancel.schoolTitle')}
      subtitle={by === 'parent' ? t('cancel.parentSubtitle') : t('cancel.schoolSubtitle')}
      testID="cancel-sheet"
      footer={<Button label={t('cancel.submit')} variant="danger" onPress={() => void onSubmit()} fullWidth testID="cancel-submit" />}
    >
      <Stack gap={2}>
        <Text variant="subheading">{t('cancel.reasonLabel')}</Text>
        <ChipGroup
          single
          options={reasons.map((r) => ({ value: r, label: t(`cancel.${group}.${r}`) }))}
          value={reason}
          onChange={(v) => {
            setReason(v);
            setShowError(false);
          }}
        />
        {showError ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {t('cancel.reasonRequired')}
          </Text>
        ) : null}
      </Stack>
      <TextField label={t('cancel.noteLabel')} placeholder={t('cancel.notePlaceholder')} value={note} onChangeText={setNote} multiline minLines={2} maxLength={200} />
    </Sheet>
  );
}

/** Mounted only while open, so every opening starts from a fresh form. */
export function CancelSheet(props: Parameters<typeof CancelSheetBody>[0]) {
  return props.visible ? <CancelSheetBody {...props} /> : null;
}
