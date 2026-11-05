/**
 * Add a resource to the school library (staff): title, description, type, link, tags, therapy
 * types, areas, age band and who can see it.
 */
import { router } from 'expo-router';
import { Link, Save } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useTherapyTypes } from '@/data/hooks';
import { GOAL_DOMAINS } from '@/domain/constants';
import type { GoalDomain, Resource, ResourceAudience, ResourceKind } from '@/domain/types';
import { therapyTypeLabel, vocabLabel } from '@/i18n/labels';
import { Button, ChipGroup, SegmentedControl, Screen, Stack, Text, TextField, toast } from '@/ui';

import { AGE_BANDS, AUDIENCES, EMPTY_RESOURCE_DRAFT, RESOURCE_KINDS, toResourceInput, validateResourceDraft, type ResourceDraft } from '../logic';
import { useCreateResource } from '../queries';

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <Stack gap={2}>
      <Text variant="label">{label}</Text>
      {children}
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}

export function NewResourceScreen() {
  const { t } = useTranslation('resources');
  const therapyTypes = useTherapyTypes();
  const create = useCreateResource();
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY_RESOURCE_DRAFT);
  const [showErrors, setShowErrors] = useState(false);
  const errors = validateResourceDraft(draft);
  const err = (k: keyof typeof errors) => (showErrors && errors[k] ? t(errors[k]!) : undefined);
  const set = (patch: Partial<ResourceDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = () => {
    setShowErrors(true);
    if (Object.keys(errors).length) return;
    create.mutate(toResourceInput(draft), {
      onSuccess: (r) => {
        toast.success(t('new.saved'));
        router.replace(`/resources/${r.id}`);
      },
      onError: () => toast.error(t('errors:unknown')),
    });
  };

  return (
    <Screen
      title={t('new.title')}
      back
      testID="new-resource"
      footer={<Button label={t('new.save')} icon={Save} size="lg" fullWidth loading={create.isPending} onPress={submit} testID="resource-save" />}
    >
      <TextField label={t('new.titleLabel')} required value={draft.title} onChangeText={(title) => set({ title })} maxLength={100} error={err('title')} />
      <TextField label={t('new.description')} multiline minLines={3} maxLength={400} value={draft.description} onChangeText={(description) => set({ description })} />
      <Field label={t('new.kind')} error={err('kind')}>
        <ChipGroup
          single
          options={RESOURCE_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          value={draft.kind ? [draft.kind] : []}
          onChange={(v) => set({ kind: v[0] as ResourceKind | undefined })}
        />
      </Field>
      <TextField
        label={t('new.url')}
        required
        icon={Link}
        value={draft.url}
        onChangeText={(url) => set({ url })}
        placeholder="https://"
        helper={t('new.urlHelper')}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        error={err('url')}
      />
      <Field label={t('new.therapyTypes')}>
        <ChipGroup
          options={(therapyTypes.data ?? []).filter((tt) => tt.active).map((tt) => ({ value: tt.key, label: therapyTypeLabel(t, tt), dot: tt.color }))}
          value={draft.therapyTypeKeys}
          onChange={(therapyTypeKeys) => set({ therapyTypeKeys })}
        />
      </Field>
      <Field label={t('new.domains')}>
        <ChipGroup options={GOAL_DOMAINS.map((d) => ({ value: d, label: vocabLabel(t, 'domains', d) }))} value={draft.domains} onChange={(v) => set({ domains: v as GoalDomain[] })} />
      </Field>
      <Field label={t('new.ageBand')}>
        <ChipGroup
          single
          options={AGE_BANDS.map((b) => ({ value: b, label: t('detail.ageBand', { band: b }) }))}
          value={draft.ageBand ? [draft.ageBand] : []}
          onChange={(v) => set({ ageBand: v[0] as Resource['ageBand'] })}
        />
      </Field>
      <Field label={t('new.audience')}>
        <SegmentedControl<ResourceAudience>
          options={AUDIENCES.map((a) => ({ value: a, label: t(`audienceOpt.${a}`) }))}
          value={draft.audience}
          onChange={(audience) => set({ audience })}
        />
      </Field>
      <Field label={t('new.tags')}>
        <Text variant="caption" color="textMuted">
          {t('new.tagsHint')}
        </Text>
        <ChipGroup allowCustom options={[]} value={draft.tags} onChange={(tags) => set({ tags })} />
      </Field>
    </Screen>
  );
}
