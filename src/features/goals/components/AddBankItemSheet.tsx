import { Save, Users } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GOAL_DOMAINS } from '@/domain/constants';
import type { GoalDomain, TherapyType } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { Button, ChipGroup, errorMessageKey, Sheet, Stack, Text, TextField, toast } from '@/ui';

import { MAX_GOAL_TEXT, validateBankDraft, type BankDraft } from '../goalForm';
import { useAddToBank } from '../queries';

const EMPTY: BankDraft = { domain: null, therapyTypeKey: null, staffText: '', parentText: '' };

/** Coordinators/admins add a school-specific goal to the bank. Mount it only while open (fresh form each time). */
export function AddBankItemSheet({ visible, onClose, therapyTypes }: { visible: boolean; onClose: () => void; therapyTypes: TherapyType[] }) {
  const { t } = useTranslation('goals');
  const add = useAddToBank();
  const [d, setD] = useState<BankDraft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof BankDraft, string>>>({});

  const save = async () => {
    const e = validateBankDraft(d);
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await add.mutateAsync({ domain: d.domain!, therapyTypeKey: d.therapyTypeKey!, staffText: d.staffText.trim(), parentText: d.parentText.trim() });
      toast.success(t('bank.added'));
      onClose();
    } catch (ex) {
      toast.error(t(errorMessageKey(ex)));
    }
  };

  const keys = [...new Set(therapyTypes.filter((x) => x.active).map((x) => x.key))];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('bank.addTitle')}
      subtitle={t('bank.addSubtitle')}
      footer={<Button label={t('bank.add')} icon={Save} onPress={() => void save()} loading={add.isPending} fullWidth />}
    >
      <Stack gap={2}>
        <Text variant="label">{t('form.domain')}</Text>
        <ChipGroup
          single
          size="sm"
          options={GOAL_DOMAINS.map((dm) => ({ value: dm, label: vocabLabel(t, 'domains', dm) }))}
          value={d.domain ? [d.domain] : []}
          onChange={(v) => setD((x) => ({ ...x, domain: (v[0] as GoalDomain) ?? null }))}
        />
        {errors.domain ? <Text variant="caption" color="danger">{t(errors.domain)}</Text> : null}
      </Stack>
      <Stack gap={2}>
        <Text variant="label">{t('form.therapyType')}</Text>
        <ChipGroup
          single
          size="sm"
          options={keys.map((k) => {
            const tt = therapyTypes.find((x) => x.key === k)!;
            return { value: k, label: therapyTypeLabel(t, tt), dot: tt.color };
          })}
          value={d.therapyTypeKey ? [d.therapyTypeKey] : []}
          onChange={(v) => setD((x) => ({ ...x, therapyTypeKey: v[0] ?? null }))}
        />
        {errors.therapyTypeKey ? <Text variant="caption" color="danger">{t(errors.therapyTypeKey)}</Text> : null}
      </Stack>
      <TextField
        label={t('form.staffText')}
        required
        multiline
        minLines={2}
        maxLength={MAX_GOAL_TEXT}
        value={d.staffText}
        onChangeText={(v) => setD((x) => ({ ...x, staffText: v }))}
        error={errors.staffText ? t(errors.staffText) : undefined}
      />
      <TextField
        label={t('form.parentText')}
        required
        multiline
        minLines={2}
        icon={Users}
        maxLength={MAX_GOAL_TEXT}
        value={d.parentText}
        onChangeText={(v) => setD((x) => ({ ...x, parentText: v }))}
        helper={t('form.parentTextHelp')}
        error={errors.parentText ? t(errors.parentText) : undefined}
      />
    </Sheet>
  );
}
