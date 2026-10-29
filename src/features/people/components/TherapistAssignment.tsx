import { useTranslation } from 'react-i18next';

import type { Member, TherapyType, UUID } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { Card, ChipGroup, Divider, Stack, SwitchRow, Text, TypeTag } from '@/ui';

import { qualifiedFor, type NewChildDraft } from '../people';

/** Per therapy type: pick a therapist (qualified staff first) and mark the lead. */
export function TherapistAssignment({
  therapyTypes,
  members,
  value,
  onChange,
}: {
  therapyTypes: TherapyType[];
  members: Member[];
  value: NewChildDraft['therapists'];
  onChange: (next: NewChildDraft['therapists']) => void;
}) {
  const { t } = useTranslation('admin');
  const set = (typeId: UUID, userId: UUID | null) => {
    const next = { ...value };
    if (userId) next[typeId] = { userId, isLead: value[typeId]?.isLead ?? !Object.values(value).some((a) => a.isLead) };
    else delete next[typeId];
    onChange(next);
  };
  const setLead = (typeId: UUID, isLead: boolean) => {
    const a = value[typeId];
    if (a) onChange({ ...value, [typeId]: { ...a, isLead } });
  };

  return (
    <Stack gap={3}>
      {therapyTypes
        .filter((tt) => tt.active)
        .map((tt) => {
          const options = qualifiedFor(members, tt.id);
          const current = value[tt.id];
          return (
            <Card key={tt.id} accent={tt.color} padding={3}>
              <Stack gap={2}>
                <TypeTag name={therapyTypeLabel(t, tt)} color={tt.color} />
                {options.length === 0 ? (
                  <Text variant="caption" color="textMuted">
                    {t('newChild.noTherapists')}
                  </Text>
                ) : (
                  <ChipGroup
                    single
                    size="sm"
                    options={options.map((m) => ({ value: m.profile.id, label: m.profile.fullName }))}
                    value={current ? [current.userId] : []}
                    onChange={(v) => set(tt.id, v[0] ?? null)}
                  />
                )}
                {current ? (
                  <>
                    <Divider />
                    <SwitchRow label={t('newChild.lead')} description={t('newChild.leadHelp')} value={current.isLead} onChange={(v) => setLead(tt.id, v)} />
                  </>
                ) : null}
              </Stack>
            </Card>
          );
        })}
    </Stack>
  );
}
