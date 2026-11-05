import { Library, PenLine, Save, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildDetail, useTherapyTypes } from '@/data/hooks';
import { GOAL_DOMAINS } from '@/domain/constants';
import { STAFF_ROLES, type GoalDomain, type GoalStatus, type UUID } from '@/domain/types';
import { displayName } from '@/features/children/caseload';
import { useUnsavedGuard } from '@/features/children/useUnsavedGuard';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { toISODate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { Button, Card, ChipGroup, DateField, EmptyState, errorMessageKey, Screen, SegmentedControl, Stack, Text, TextField, toast } from '@/ui';

import { BankPicker } from '../components/BankPicker';
import { MasteryRuleField } from '../components/MasteryRuleField';
import { draftFromBankItem, emptyGoalDraft, MAX_GOAL_TEXT, toGoalInput, validateGoalDraft, type GoalDraft, type GoalDraftErrors } from '../goalForm';
import { INITIAL_STATUS_OPTIONS } from '../goalStatus';
import { useCreateGoal } from '../queries';

type Mode = 'bank' | 'custom';

/** New goal (`/goal/new?childId=`): pick from the Goal Bank or write one; parent wording required. */
export function NewGoalScreen({ childId }: { childId?: UUID }) {
  const { t } = useTranslation('goals');
  const role = useRequiredActive().role;
  const detail = useChildDetail(childId);
  const typesQ = useTherapyTypes();
  const allTypes = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const create = useCreateGoal();
  const today = toISODate(new Date());

  // The child's own therapy types first, then the rest of the school's.
  const types = useMemo(() => {
    const mine = new Set((detail.data?.therapists ?? []).map((x) => x.therapyTypeId));
    const active = allTypes.filter((x) => x.active);
    return [...active.filter((x) => mine.has(x.id)), ...active.filter((x) => !mine.has(x.id))];
  }, [allTypes, detail.data]);
  const defaultType = useMemo(() => {
    const ids = [...new Set((detail.data?.therapists ?? []).map((x) => x.therapyTypeId))];
    return ids.length === 1 ? ids[0] : null;
  }, [detail.data]);

  const [mode, setMode] = useState<Mode>('bank');
  const [d, setD] = useState<GoalDraft>(() => emptyGoalDraft(today));
  const [errors, setErrors] = useState<GoalDraftErrors>({});
  const dirty = !!(d.staffText || d.parentText || d.baseline || d.bankItemId);
  const guard = useUnsavedGuard(dirty && !create.isSuccess);
  const therapyTypeId = d.therapyTypeId ?? defaultType;

  if (!childId || (detail.data && (detail.data.access !== 'full' || !STAFF_ROLES.includes(role)))) {
    return (
      <Screen back title={t('form.title')}>
        <EmptyState title={t('form.noAccessTitle')} body={t('form.noAccessBody')} />
      </Screen>
    );
  }

  const set = <K extends keyof GoalDraft>(k: K, v: GoalDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const err = (k: keyof GoalDraftErrors) => (errors[k] ? t(errors[k]!) : undefined);

  const submit = async () => {
    const draft = { ...d, therapyTypeId };
    const e = validateGoalDraft(draft);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('form.fixErrors'));
      return;
    }
    try {
      await create.mutateAsync(toGoalInput(draft, childId));
      toast.success(t('form.saved'));
      guard.leave();
    } catch (ex) {
      toast.error(t(errorMessageKey(ex)));
    }
  };

  const selectedTypeKey = types.find((x) => x.id === therapyTypeId)?.key ?? null;

  return (
    <Screen
      back
      title={t('form.title')}
      subtitle={detail.data ? t('form.forChild', { name: displayName(detail.data.child) }) : undefined}
      testID="new-goal"
      footer={<Button label={t('form.save')} icon={Save} onPress={() => void submit()} loading={create.isPending} fullWidth testID="save-goal" />}
    >
      <SegmentedControl
        options={[
          { value: 'bank', label: t('form.fromBank') },
          { value: 'custom', label: t('form.writeOwn') },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'bank' && !d.bankItemId ? (
        <BankPicker
          therapyTypes={allTypes}
          initialTypeKey={selectedTypeKey}
          onPick={(item) => {
            setD((x) => draftFromBankItem(item, { ...x, therapyTypeId: x.therapyTypeId ?? defaultType }, types));
            setErrors({});
          }}
        />
      ) : null}

      {mode === 'bank' && d.bankItemId ? (
        <Card tone="primary">
          <Stack gap={2}>
            <Text variant="label" color="primaryText">
              {t('form.fromBankChosen')}
            </Text>
            <Button label={t('form.chooseAnother')} icon={Library} size="sm" variant="ghost" onPress={() => set('bankItemId', undefined)} />
          </Stack>
        </Card>
      ) : null}

      {mode === 'custom' || d.bankItemId ? (
        <Card>
          <Stack gap={4}>
            <Stack gap={2}>
              <Text variant="label">{t('form.therapyType')}</Text>
              <ChipGroup
                single
                size="sm"
                options={types.map((tt) => ({ value: tt.id, label: therapyTypeLabel(t, tt), dot: tt.color }))}
                value={therapyTypeId ? [therapyTypeId] : []}
                onChange={(v) => set('therapyTypeId', v[0] ?? null)}
              />
              {err('therapyTypeId') ? <Text variant="caption" color="danger">{err('therapyTypeId')}</Text> : null}
            </Stack>
            <Stack gap={2}>
              <Text variant="label">{t('form.domain')}</Text>
              <ChipGroup
                single
                size="sm"
                options={GOAL_DOMAINS.map((dm) => ({ value: dm, label: vocabLabel(t, 'domains', dm) }))}
                value={d.domain ? [d.domain] : []}
                onChange={(v) => set('domain', (v[0] as GoalDomain) ?? null)}
              />
              {err('domain') ? <Text variant="caption" color="danger">{err('domain')}</Text> : null}
            </Stack>
            <TextField
              label={t('form.staffText')}
              required
              multiline
              minLines={2}
              maxLength={MAX_GOAL_TEXT}
              value={d.staffText}
              onChangeText={(v) => set('staffText', v)}
              placeholder={t('form.staffTextPh')}
              error={err('staffText')}
            />
            <TextField
              label={t('form.parentText')}
              required
              multiline
              minLines={2}
              maxLength={MAX_GOAL_TEXT}
              icon={Users}
              value={d.parentText}
              onChangeText={(v) => set('parentText', v)}
              placeholder={t('form.parentTextPh')}
              helper={t('form.parentTextHelp')}
              error={err('parentText')}
              testID="parent-text"
            />
            <TextField label={t('form.baseline')} value={d.baseline} onChangeText={(v) => set('baseline', v)} placeholder={t('form.baselinePh')} />
            <MasteryRuleField
              accuracy={d.accuracy}
              sessions={d.consecutiveSessions}
              onChange={(r) => setD((x) => ({ ...x, accuracy: r.accuracy, consecutiveSessions: r.consecutiveSessions }))}
              error={err('accuracy') ?? err('consecutiveSessions')}
            />
            <DateField label={t('form.startDate')} value={d.startDate} onChange={(v) => set('startDate', v)} error={err('startDate')} />
            <Stack gap={2}>
              <Text variant="label">{t('form.initialStatus')}</Text>
              <ChipGroup
                single
                size="sm"
                options={INITIAL_STATUS_OPTIONS.map((s) => ({ value: s, label: t(`status.${s}`) }))}
                value={[d.status]}
                onChange={(v) => v[0] && set('status', v[0] as GoalStatus)}
              />
            </Stack>
          </Stack>
        </Card>
      ) : null}

      {mode === 'bank' && !d.bankItemId ? (
        <Button label={t('form.writeOwnInstead')} icon={PenLine} variant="ghost" onPress={() => setMode('custom')} />
      ) : null}
    </Screen>
  );
}
