/** Schedule filters: admin sheet (therapy, therapist, child) and parent child chips. */
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren, useMembers, useTherapyTypes } from '@/data/hooks';
import type { UUID } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { Button, Chip, ChipGroup, Row, Sheet, Stack, Text, TextField } from '@/ui';

export interface ScheduleFilters {
  therapyTypeId?: UUID;
  therapistId?: UUID;
  childId?: UUID;
}

export function activeFilterCount(f: ScheduleFilters): number {
  return [f.therapyTypeId, f.therapistId, f.childId].filter(Boolean).length;
}

const firstName = (full: string) => full.split(' ')[0];
const MAX_CHILD_CHIPS = 12;

export function AdminFilterBar({ value, onChange }: { value: ScheduleFilters; onChange: (f: ScheduleFilters) => void }) {
  const { t } = useTranslation('calendar');
  const types = useTherapyTypes();
  const members = useMembers(['therapist', 'coordinator']);
  const children = useChildren();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ScheduleFilters>(value);
  const [search, setSearch] = useState('');

  const typeOptions = (types.data ?? []).filter((x) => x.active).map((x) => ({ value: x.id, label: therapyTypeLabel(t, x), dot: x.color }));
  const therapistOptions = (members.data ?? [])
    .filter((m) => !draft.therapyTypeId || m.therapyTypeIds.includes(draft.therapyTypeId))
    .map((m) => ({ value: m.profile.id, label: m.profile.fullName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const childOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (children.data ?? [])
      .filter((c) => !q || c.child.fullName.toLowerCase().includes(q) || c.child.preferredName?.toLowerCase().includes(q))
      .slice(0, MAX_CHILD_CHIPS)
      .map((c) => ({ value: c.child.id, label: c.child.fullName }));
  }, [children.data, search]);

  const labelFor = {
    therapyTypeId: typeOptions.find((o) => o.value === value.therapyTypeId),
    therapistId: (members.data ?? []).find((m) => m.profile.id === value.therapistId)?.profile.fullName,
    childId: (children.data ?? []).find((c) => c.child.id === value.childId)?.child.fullName,
  };
  const count = activeFilterCount(value);
  const single = (v: string[]) => v[0] || undefined;

  return (
    <>
      <Row gap={2} wrap testID="admin-filters">
        <Button
          size="sm"
          variant="outline"
          icon={SlidersHorizontal}
          label={count ? t('filters.buttonCount', { count }) : t('filters.button')}
          onPress={() => {
            setDraft(value);
            setOpen(true);
          }}
        />
        {labelFor.therapyTypeId ? (
          <Chip size="sm" selected dot={labelFor.therapyTypeId.dot} label={labelFor.therapyTypeId.label} onPress={() => onChange({ ...value, therapyTypeId: undefined })} />
        ) : null}
        {labelFor.therapistId ? <Chip size="sm" selected label={labelFor.therapistId} onPress={() => onChange({ ...value, therapistId: undefined })} /> : null}
        {labelFor.childId ? <Chip size="sm" selected label={labelFor.childId} onPress={() => onChange({ ...value, childId: undefined })} /> : null}
      </Row>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('filters.title')}
        footer={
          <Row gap={2}>
            <Button variant="ghost" label={t('filters.clear')} onPress={() => setDraft({})} style={{ flex: 1 }} />
            <Button
              label={t('filters.show')}
              onPress={() => {
                onChange(draft);
                setOpen(false);
              }}
              style={{ flex: 1 }}
            />
          </Row>
        }
      >
        <Stack gap={2}>
          <Text variant="subheading">{t('filters.therapyType')}</Text>
          <ChipGroup single size="sm" options={typeOptions} value={draft.therapyTypeId ? [draft.therapyTypeId] : []} onChange={(v) => setDraft({ ...draft, therapyTypeId: single(v), therapistId: undefined })} />
        </Stack>
        <Stack gap={2}>
          <Text variant="subheading">{t('filters.therapist')}</Text>
          <ChipGroup single size="sm" options={therapistOptions} value={draft.therapistId ? [draft.therapistId] : []} onChange={(v) => setDraft({ ...draft, therapistId: single(v) })} />
        </Stack>
        <Stack gap={2}>
          <Text variant="subheading">{t('filters.child')}</Text>
          <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={t('filters.searchChild')} accessibilityLabel={t('filters.searchChild')} />
          {childOptions.length ? (
            <ChipGroup single size="sm" options={childOptions} value={draft.childId ? [draft.childId] : []} onChange={(v) => setDraft({ ...draft, childId: single(v) })} />
          ) : (
            <Text variant="caption" color="textMuted">
              {t('filters.noChildMatch')}
            </Text>
          )}
        </Stack>
      </Sheet>
    </>
  );
}

/** Parents with more than one child: "All children" + one chip each. Hidden with one child. */
export function ParentChildChips({ value, onChange }: { value?: UUID; onChange: (childId?: UUID) => void }) {
  const { t } = useTranslation('calendar');
  const children = useChildren();
  const list = children.data ?? [];
  if (list.length < 2) return null;
  return (
    <Row gap={2} wrap testID="child-chips">
      <Chip label={t('filters.allChildren')} selected={!value} onPress={() => onChange(undefined)} />
      {list.map((c) => (
        <Chip key={c.child.id} label={c.child.preferredName ?? firstName(c.child.fullName)} selected={value === c.child.id} onPress={() => onChange(c.child.id)} />
      ))}
    </Row>
  );
}
