import { Search, UserPlus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Member } from '@/domain/types';
import { Button, Card, Chip, ChipGroup, Row, Stack, Text, TextField } from '@/ui';

import { RELATIONS, searchMembers, withPrimaryGuardian, type NewChildDraft, type RelationKey } from '../people';
import { formatIndianPhone } from '../phone';

/** Link existing parents (with relation) or invite a new parent in the same step. */
export function GuardianPicker({
  parents,
  guardians,
  onGuardians,
  newParent,
  onNewParent,
  errors,
}: {
  parents: Member[];
  guardians: NewChildDraft['guardians'];
  onGuardians: (next: NewChildDraft['guardians']) => void;
  newParent: NewChildDraft['newParent'];
  onNewParent: (next: NewChildDraft['newParent']) => void;
  errors: { name?: string; phone?: string };
}) {
  const { t } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const relationOptions = RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }));
  const matches = useMemo(() => (search.trim() ? searchMembers(parents, search).slice(0, 6) : []), [parents, search]);

  const toggle = (userId: string) => {
    const exists = guardians.some((g) => g.userId === userId);
    onGuardians(withPrimaryGuardian(exists ? guardians.filter((g) => g.userId !== userId) : [...guardians, { userId, relation: 'mother', isPrimary: false }]));
  };
  const update = (userId: string, patch: Partial<NewChildDraft['guardians'][number]>) =>
    onGuardians(withPrimaryGuardian(guardians.map((g) => (g.userId === userId ? { ...g, ...patch } : patch.isPrimary ? { ...g, isPrimary: false } : g))));

  return (
    <Stack gap={3}>
      {guardians.map((g) => {
        const m = parents.find((p) => p.profile.id === g.userId);
        return (
          <Card key={g.userId} padding={3}>
            <Stack gap={2}>
              <Row justify="between" gap={2}>
                <Stack gap={0} flex={1}>
                  <Text variant="bodyStrong">{m?.profile.fullName ?? g.userId}</Text>
                  {m?.profile.phone ? (
                    <Text variant="caption" color="textMuted">
                      {formatIndianPhone(m.profile.phone)}
                    </Text>
                  ) : null}
                </Stack>
                <Button label={t('common:actions.remove')} icon={X} size="sm" variant="ghost" onPress={() => toggle(g.userId)} />
              </Row>
              <ChipGroup single size="sm" options={relationOptions} value={[g.relation]} onChange={(v) => v[0] && update(g.userId, { relation: v[0] as RelationKey })} />
              <Chip
                size="sm"
                label={t('newChild.primary')}
                selected={g.isPrimary}
                onPress={() => update(g.userId, { isPrimary: true })}
              />
            </Stack>
          </Card>
        );
      })}

      <TextField icon={Search} value={search} onChangeText={setSearch} placeholder={t('newChild.findParent')} accessibilityLabel={t('newChild.findParent')} />
      {matches.length ? (
        <Row gap={2} wrap>
          {matches.map((m) => (
            <Chip
              key={m.profile.id}
              label={m.profile.fullName}
              selected={guardians.some((g) => g.userId === m.profile.id)}
              onPress={() => {
                toggle(m.profile.id);
                setSearch('');
              }}
            />
          ))}
        </Row>
      ) : search.trim() ? (
        <Text variant="caption" color="textMuted">
          {t('newChild.noParentMatch')}
        </Text>
      ) : null}

      {newParent ? (
        <Card tone="sunken" padding={3}>
          <Stack gap={3}>
            <Row justify="between">
              <Text variant="subheading">{t('newChild.inviteParent')}</Text>
              <Button label={t('common:actions.remove')} icon={X} size="sm" variant="ghost" onPress={() => onNewParent(null)} />
            </Row>
            <TextField label={t('invite.name')} required value={newParent.fullName} onChangeText={(v) => onNewParent({ ...newParent, fullName: v })} error={errors.name ? t(errors.name) : undefined} />
            <TextField
              label={t('invite.phone')}
              required
              value={newParent.phone}
              onChangeText={(v) => onNewParent({ ...newParent, phone: v })}
              keyboardType="phone-pad"
              placeholder="98765 43210"
              helper={t('invite.phoneHelp')}
              error={errors.phone ? t(errors.phone) : undefined}
            />
            <ChipGroup single size="sm" options={relationOptions} value={[newParent.relation]} onChange={(v) => v[0] && onNewParent({ ...newParent, relation: v[0] as RelationKey })} />
          </Stack>
        </Card>
      ) : (
        <Button label={t('newChild.inviteParent')} icon={UserPlus} variant="outline" onPress={() => onNewParent({ fullName: '', phone: '', relation: 'mother' })} />
      )}
    </Stack>
  );
}
