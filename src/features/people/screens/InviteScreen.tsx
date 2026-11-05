import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren, useMembers } from '@/data/hooks';
import { ADMIN_ROLES, type Role, type UUID } from '@/domain/types';
import { useUnsavedGuard } from '@/features/children/useUnsavedGuard';
import { useRequiredActive } from '@/state/session';
import { Button, Card, ChipGroup, EmptyState, errorMessageKey, Screen, Stack, Text, TextField, toast } from '@/ui';

import { invitableRoles, RELATIONS, toInviteInput, validateInvite, type InviteDraft, type InviteErrors, type RelationKey } from '../people';
import { formatIndianPhone, normaliseIndianPhone } from '../phone';
import { useCreateInvite, useInvites } from '../queries';

/** Invite staff or a parent by phone (`/people/invite`). `childId` pre-selects a child for parents. */
export function InviteScreen({ childId, role: initialRole }: { childId?: UUID; role?: Role }) {
  const { t } = useTranslation('admin');
  const active = useRequiredActive();
  const allowed = invitableRoles(active.role);
  const children = useChildren().data ?? [];
  const members = useMembers().data ?? [];
  const invites = useInvites().data ?? [];
  const create = useCreateInvite();
  const start: InviteDraft = {
    role: initialRole && allowed.includes(initialRole) ? initialRole : childId ? 'parent' : 'therapist',
    fullName: '',
    phone: '',
    email: '',
    childIds: childId ? [childId] : [],
    relation: 'mother',
  };
  const [d, setD] = useState<InviteDraft>(start);
  const [errors, setErrors] = useState<InviteErrors>({});
  const dirty = !!(d.fullName || d.phone || d.email);
  const guard = useUnsavedGuard(dirty && !create.isSuccess);

  if (!ADMIN_ROLES.includes(active.role) || !active.orgId) {
    return (
      <Screen back title={t('invite.title')}>
        <EmptyState title={t('noAccessTitle')} body={t('noAccessBody')} />
      </Screen>
    );
  }
  const orgId = active.orgId;
  const set = <K extends keyof InviteDraft>(k: K, v: InviteDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const normalised = normaliseIndianPhone(d.phone);

  const submit = async () => {
    const existingPhones = [
      ...members.map((m) => m.profile.phone).filter((p): p is string => !!p),
      ...invites.filter((i) => i.status === 'pending').map((i) => i.phone).filter((p): p is string => !!p),
    ];
    const e = validateInvite(d, { existingPhones, allowedRoles: allowed });
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await create.mutateAsync(toInviteInput(d, orgId));
      toast.success(t('invite.sent', { name: d.fullName.trim() }));
      guard.leave();
    } catch (err) {
      toast.error(t(errorMessageKey(err)));
    }
  };

  return (
    <Screen
      back
      title={t('invite.title')}
      testID="invite-screen"
      footer={<Button label={t('invite.send')} icon={Send} onPress={() => void submit()} loading={create.isPending} fullWidth testID="send-invite" />}
    >
      <Text color="textMuted">{t('invite.intro')}</Text>
      <Card>
        <Stack gap={4}>
          <Stack gap={2}>
            <Text variant="label">{t('invite.role')}</Text>
            <ChipGroup
              single
              options={allowed.map((r) => ({ value: r, label: t(`common:roles.${r}`) }))}
              value={[d.role]}
              onChange={(v) => v[0] && set('role', v[0] as Role)}
            />
            {errors.role ? (
              <Text variant="caption" color="danger">
                {t(errors.role)}
              </Text>
            ) : null}
          </Stack>
          <TextField label={t('invite.name')} required value={d.fullName} onChangeText={(v) => set('fullName', v)} error={errors.fullName ? t(errors.fullName) : undefined} autoCapitalize="words" />
          <TextField
            label={t('invite.phone')}
            required
            value={d.phone}
            onChangeText={(v) => set('phone', v)}
            keyboardType="phone-pad"
            placeholder="98765 43210"
            error={errors.phone ? t(errors.phone) : undefined}
            helper={normalised ? t('invite.willSendTo', { phone: formatIndianPhone(normalised) }) : t('invite.phoneHelp')}
            testID="invite-phone"
          />
          <TextField
            label={`${t('invite.email')} (${t('common:optional')})`}
            value={d.email}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email ? t(errors.email) : undefined}
          />
        </Stack>
      </Card>

      {d.role === 'parent' ? (
        <Card>
          <Stack gap={3}>
            <Text variant="subheading">{t('invite.children')}</Text>
            {children.length === 0 ? (
              <Text color="textMuted">{t('invite.noChildren')}</Text>
            ) : (
              <ChipGroup
                options={children.map((c) => ({ value: c.child.id, label: c.child.preferredName || c.child.fullName }))}
                value={d.childIds}
                onChange={(v) => set('childIds', v)}
                size="sm"
              />
            )}
            {errors.childIds ? (
              <Text variant="caption" color="danger">
                {t(errors.childIds)}
              </Text>
            ) : null}
            <Text variant="label">{t('invite.relation')}</Text>
            <ChipGroup
              single
              size="sm"
              options={RELATIONS.map((r) => ({ value: r, label: t(`relations.${r}`) }))}
              value={[d.relation]}
              onChange={(v) => v[0] && set('relation', v[0] as RelationKey)}
            />
          </Stack>
        </Card>
      ) : null}
    </Screen>
  );
}
