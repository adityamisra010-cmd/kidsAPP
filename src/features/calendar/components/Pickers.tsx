/** Feature pickers: qualified-therapist list, searchable child sheet, and a date + time slot. */
import { Check, ChevronDown, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useChildren, useMembers } from '@/data/hooks';
import type { ClockTime, ISODate, Member, UUID } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { Avatar, Badge, DateField, ListItem, Row, Sheet, Stack, Text, TextField, TimeField } from '@/ui';

import type { Slot, SlotError } from '../lib/slots';

/** Therapists and coordinators qualified for a therapy type, best first. */
export function useQualifiedStaff(therapyTypeId: UUID | undefined): { list: Member[]; loading: boolean } {
  const members = useMembers(['therapist', 'coordinator']);
  const list = useMemo(
    () =>
      (members.data ?? [])
        .filter((m) => m.membership.status === 'active' && !!therapyTypeId && m.therapyTypeIds.includes(therapyTypeId))
        .sort((a, b) => a.profile.fullName.localeCompare(b.profile.fullName)),
    [members.data, therapyTypeId],
  );
  return { list, loading: members.isPending };
}

/** Radio list of staff (big rows with avatar). */
export function StaffRadioList({
  staff,
  value,
  onChange,
  usualIds = [],
  emptyText,
}: {
  staff: Member[];
  value?: UUID;
  onChange: (id: UUID) => void;
  usualIds?: UUID[];
  emptyText: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  if (!staff.length) {
    return (
      <Text variant="label" color="textMuted">
        {emptyText}
      </Text>
    );
  }
  return (
    <View accessibilityRole="radiogroup" style={{ gap: t.space[2] }}>
      {staff.map((m) => {
        const selected = m.profile.id === value;
        return (
          <Pressable
            key={m.profile.id}
            onPress={() => onChange(m.profile.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={m.profile.fullName}
            testID={`staff-${m.profile.id}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              minHeight: TOUCH + 8,
              paddingHorizontal: t.space[3],
              borderRadius: t.radius.md,
              borderWidth: 1.5,
              borderColor: selected ? t.colors.primary : t.colors.border,
              backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
            }}
          >
            <Avatar name={m.profile.fullName} uri={m.profile.avatarUrl} size={36} />
            <Stack gap={0} flex={1}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {m.profile.fullName}
              </Text>
              {m.profile.title ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {m.profile.title}
                </Text>
              ) : null}
            </Stack>
            {usualIds.includes(m.profile.id) ? <Badge label={tr('pickers.usual')} tone="info" /> : null}
            {selected ? <Check size={20} color={t.colors.primaryText} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Field that opens a searchable sheet of children. */
export function ChildPickerField({ value, onChange, error }: { value?: UUID; onChange: (id: UUID) => void; error?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const children = useChildren();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = children.data?.find((c) => c.child.id === value);
  const filtered = (children.data ?? []).filter((c) => {
    const s = q.trim().toLowerCase();
    return !s || c.child.fullName.toLowerCase().includes(s) || (c.child.classGroup ?? '').toLowerCase().includes(s);
  });

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{tr('pickers.child')}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${tr('pickers.child')}: ${selected?.child.fullName ?? tr('pickers.chooseChild')}`}
        testID="child-picker"
        style={{
          minHeight: 56,
          borderWidth: 1.5,
          borderColor: error ? t.colors.danger : t.colors.border,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          paddingHorizontal: t.space[3],
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[3],
        }}
      >
        {selected ? <Avatar name={selected.child.fullName} uri={selected.child.photoUrl} size={36} /> : null}
        <Stack gap={0} flex={1}>
          <Text color={selected ? 'text' : 'textSubtle'}>{selected?.child.fullName ?? tr('pickers.chooseChild')}</Text>
          {selected?.child.classGroup ? (
            <Text variant="caption" color="textMuted">
              {selected.child.classGroup}
            </Text>
          ) : null}
        </Stack>
        <ChevronDown size={20} color={t.colors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={tr('pickers.chooseChild')}>
        <TextField icon={Search} value={q} onChangeText={setQ} placeholder={tr('filters.searchChild')} accessibilityLabel={tr('filters.searchChild')} autoFocus />
        {filtered.length === 0 ? (
          <Text color="textMuted">{tr('filters.noChildMatch')}</Text>
        ) : (
          filtered.map((c) => (
            <ListItem
              key={c.child.id}
              title={c.child.fullName}
              subtitle={c.child.classGroup}
              left={<Avatar name={c.child.fullName} uri={c.child.photoUrl} size={40} />}
              right={c.child.id === value ? <Check size={20} color={t.colors.primaryText} /> : undefined}
              chevron={false}
              onPress={() => {
                onChange(c.child.id);
                setOpen(false);
                setQ('');
              }}
            />
          ))
        )}
      </Sheet>
    </View>
  );
}

/** Date + time side by side, with one error line for the pair. */
export function SlotFields({
  title,
  slot,
  onChange,
  error,
  minDate,
  timeStart,
  timeEnd,
}: {
  title?: string;
  slot: Slot;
  onChange: (s: Slot) => void;
  error?: SlotError | null;
  minDate?: ISODate;
  timeStart: ClockTime;
  timeEnd: ClockTime;
}) {
  const { t: tr } = useTranslation('calendar');
  return (
    <Stack gap={2}>
      {title ? <Text variant="subheading">{title}</Text> : null}
      <Row gap={3} align="flex-start">
        <View style={{ flex: 1.2 }}>
          <DateField label={tr('slots.date')} value={slot.date} minDate={minDate} onChange={(date) => onChange({ ...slot, date })} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label={tr('slots.time')} value={slot.time} start={timeStart} end={timeEnd} onChange={(time) => onChange({ ...slot, time })} />
        </View>
      </Row>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {tr(`slots.errors.${error}`)}
        </Text>
      ) : null}
    </Stack>
  );
}
