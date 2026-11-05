import { Plus, Search } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { DEFAULT_THERAPY_TYPES, GOAL_DOMAINS } from '@/domain/constants';
import type { GoalBankItem, GoalDomain } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, ChipGroup, Divider, EmptyState, QueryView, Row, Sheet, SkeletonList, Stack, Text, TextField, toast, TypeTag } from '@/ui';

import { EMPTY_GOAL_DRAFT, filterGoalBank, validateGoalDraft, type GoalBankDraft, type GoalDraftErrors } from './goalBankForm';
import { useGlobalGoalBank, useSaveGoalBankItem } from './queries';

function GoalSheet({ draft, onClose }: { draft: GoalBankDraft | null; onClose: () => void }) {
  const { t } = useTranslation('platform');
  const save = useSaveGoalBankItem();
  const [d, setD] = useState<GoalBankDraft>(draft ?? EMPTY_GOAL_DRAFT);
  const [errors, setErrors] = useState<GoalDraftErrors>({});
  const set = <K extends keyof GoalBankDraft>(k: K, v: GoalBankDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const submit = () => {
    const res = validateGoalDraft(d);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    save.mutate(res.value, {
      onSuccess: () => {
        toast.success(t('goalBank.saved'));
        onClose();
      },
      onError: () => toast.error(t('errors:unknown')),
    });
  };

  return (
    <Sheet
      visible={!!draft}
      onClose={onClose}
      title={d.id ? t('goalBank.editTitle') : t('goalBank.addTitle')}
      subtitle={t('goalBank.sheetHint')}
      testID="goal-sheet"
      footer={<Button testID="save-goal" label={t('goalBank.save')} fullWidth loading={save.isPending} onPress={submit} />}
    >
      <Stack gap={2}>
        <Text variant="label">{t('goalBank.domain')}</Text>
        <ChipGroup single size="sm" value={d.domain ? [d.domain] : []} onChange={(n) => set('domain', (n[0] ?? '') as GoalDomain | '')} options={GOAL_DOMAINS.map((g) => ({ value: g, label: vocabLabel(t, 'domains', g) }))} />
        {errors.domain ? (
          <Text variant="caption" color="danger">
            {t(errors.domain)}
          </Text>
        ) : null}
      </Stack>
      <Stack gap={2}>
        <Text variant="label">{t('goalBank.therapy')}</Text>
        <ChipGroup
          single
          size="sm"
          value={d.therapyTypeKey ? [d.therapyTypeKey] : []}
          onChange={(n) => set('therapyTypeKey', n[0] ?? '')}
          options={DEFAULT_THERAPY_TYPES.map((tt) => ({ value: tt.key, label: therapyTypeLabel(t, tt), dot: tt.color }))}
        />
        {errors.therapyTypeKey ? (
          <Text variant="caption" color="danger">
            {t(errors.therapyTypeKey)}
          </Text>
        ) : null}
      </Stack>
      <TextField
        testID="staff-text"
        label={t('goalBank.staffText')}
        helper={t('goalBank.staffTextHelp')}
        value={d.staffText}
        onChangeText={(v) => set('staffText', v)}
        multiline
        minLines={2}
        error={errors.staffText ? t(errors.staffText) : undefined}
      />
      <TextField
        testID="parent-text"
        label={t('goalBank.parentText')}
        helper={t('goalBank.parentTextHelp')}
        value={d.parentText}
        onChangeText={(v) => set('parentText', v)}
        multiline
        minLines={2}
        error={errors.parentText ? t(errors.parentText) : undefined}
      />
    </Sheet>
  );
}

function GoalRow({ g, onPress }: { g: GoalBankItem; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation('platform');
  const tt = DEFAULT_THERAPY_TYPES.find((x) => x.key === g.therapyTypeKey);
  return (
    <Pressable
      testID={`goal-${g.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={t('goalBank.editHint')}
      style={({ pressed }) => ({ paddingVertical: theme.space[3], gap: theme.space[1], opacity: pressed ? 0.85 : 1 })}
    >
      <Text variant="bodyStrong">{g.staffText}</Text>
      <Text variant="caption" color="textMuted">
        {t('goalBank.parentsSee', { text: g.parentText })}
      </Text>
      <Row gap={3} wrap style={{ marginTop: 4 }}>
        <Badge label={vocabLabel(t, 'domains', g.domain)} />
        {tt ? <TypeTag name={therapyTypeLabel(t, tt)} color={tt.color} /> : null}
      </Row>
    </Pressable>
  );
}

/** Global goal bank: filter by area, search, add or edit wording for staff and parents. */
export function GoalBankTab() {
  const { t } = useTranslation('platform');
  const q = useGlobalGoalBank();
  const [domain, setDomain] = useState<GoalDomain | 'all'>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<GoalBankDraft | null>(null);
  const list = useMemo(() => filterGoalBank(q.data ?? [], domain, search), [q.data, domain, search]);

  return (
    <>
      <Row gap={2} align="flex-end">
        <Stack flex={1}>
          <TextField testID="goal-search" icon={Search} placeholder={t('goalBank.search')} value={search} onChangeText={setSearch} accessibilityLabel={t('goalBank.search')} />
        </Stack>
        <Button testID="add-goal" label={t('goalBank.add')} icon={Plus} variant="secondary" onPress={() => setDraft({ ...EMPTY_GOAL_DRAFT })} />
      </Row>
      <ChipGroup
        single
        size="sm"
        value={[domain]}
        onChange={(n) => setDomain((n[0] as GoalDomain | 'all' | undefined) ?? 'all')}
        options={[{ value: 'all', label: t('goalBank.allAreas') }, ...GOAL_DOMAINS.map((g) => ({ value: g, label: vocabLabel(t, 'domains', g) }))]}
      />
      <QueryView query={q} skeleton={<SkeletonList rows={4} height={90} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title={t('goalBank.empty')} actionLabel={t('goalBank.add')} onAction={() => setDraft({ ...EMPTY_GOAL_DRAFT })} />}>
        {() => (
          <>
            <Text variant="caption" color="textMuted">
              {t('goalBank.count', { count: list.length })}
            </Text>
            {list.length === 0 ? (
              <EmptyState compact title={t('goalBank.noMatch')} />
            ) : (
              <Card padding={3}>
                {list.map((g, i) => (
                  <Fragment key={g.id}>
                    {i > 0 ? <Divider /> : null}
                    <GoalRow g={g} onPress={() => setDraft({ id: g.id, domain: g.domain, therapyTypeKey: g.therapyTypeKey, staffText: g.staffText, parentText: g.parentText })} />
                  </Fragment>
                ))}
              </Card>
            )}
          </>
        )}
      </QueryView>
      {draft ? <GoalSheet key={draft.id ?? 'new'} draft={draft} onClose={() => setDraft(null)} /> : null}
    </>
  );
}
