import { router } from 'expo-router';
import { Ban, Mail, Phone, RotateCcw, Save, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { useChildren, useMembers, useTherapyTypes } from '@/data/hooks';
import { ADMIN_ROLES, type Member, type UUID } from '@/domain/types';
import { therapyTypeLabel } from '@/i18n/labels';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Button, Card, ChipGroup, confirm, Divider, EmptyState, errorMessageKey, ListItem, QueryView, Row, Screen, SkeletonList, Stack, Text, toast } from '@/ui';

import { caseloadCount, childrenByGuardian } from '../people';
import { formatIndianPhone, telLink } from '../phone';
import { useSetMemberStatus, useSetMemberTherapyTypes } from '../queries';

/** Staff or parent detail (`/people/member/[id]`, id = user id). */
export function MemberScreen({ userId }: { userId: UUID }) {
  const { t } = useTranslation('admin');
  const q = useMembers();
  return (
    <QueryView
      query={q}
      skeleton={
        <Screen back title={t('member.title')}>
          <SkeletonList rows={3} />
        </Screen>
      }
    >
      {(members) => {
        const m = members.find((x) => x.profile.id === userId);
        return m ? (
          <MemberDetail member={m} />
        ) : (
          <Screen back title={t('member.title')}>
            <EmptyState title={t('member.notFoundTitle')} body={t('member.notFoundBody')} />
          </Screen>
        );
      }}
    </QueryView>
  );
}

function MemberDetail({ member: m }: { member: Member }) {
  const theme = useTheme();
  const { t } = useTranslation('admin');
  const active = useRequiredActive();
  const isAdmin = ADMIN_ROLES.includes(active.role);
  const isSelf = active.user.profile.id === m.profile.id;
  const isParent = m.membership.role === 'parent';
  const childrenQ = useChildren();
  const children = useMemo(() => childrenQ.data ?? [], [childrenQ.data]);
  const types = (useTherapyTypes().data ?? []).filter((x) => x.active);
  const setTypes = useSetMemberTherapyTypes();
  const setStatus = useSetMemberStatus();
  // null = not edited yet (shows the saved qualifications).
  const [edited, setQuals] = useState<UUID[] | null>(null);
  const quals = edited ?? m.therapyTypeIds;
  const qualsChanged = [...quals].sort().join() !== [...m.therapyTypeIds].sort().join();
  const suspended = m.membership.status === 'suspended';

  const assigned = useMemo(() => children.filter((c) => c.therapists.some((x) => x.userId === m.profile.id)), [children, m.profile.id]);
  const linked = useMemo(() => childrenByGuardian(children).get(m.profile.id) ?? [], [children, m.profile.id]);

  const saveQuals = async () => {
    try {
      await setTypes.mutateAsync({ userId: m.profile.id, therapyTypeIds: quals });
      setQuals(null);
      toast.success(t('member.qualsSaved'));
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  const toggleStatus = async () => {
    const next = suspended ? 'active' : 'suspended';
    const ok = await confirm({
      title: t(suspended ? 'member.reactivateTitle' : 'member.suspendTitle', { name: m.profile.fullName }),
      body: t(suspended ? 'member.reactivateBody' : 'member.suspendBody'),
      confirmLabel: t(suspended ? 'member.reactivate' : 'member.suspend'),
      destructive: !suspended,
    });
    if (!ok) return;
    try {
      await setStatus.mutateAsync({ membershipId: m.membership.id, status: next });
      toast.success(t(suspended ? 'member.reactivated' : 'member.suspended', { name: m.profile.fullName }));
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Screen back title={m.profile.fullName} subtitle={t(`common:roles.${m.membership.role}`)} testID="member-screen">
      <Card>
        <Stack gap={3}>
          <Row gap={3}>
            <Avatar name={m.profile.fullName} uri={m.profile.avatarUrl} size={64} />
            <Stack gap={1} flex={1}>
              <Text variant="heading">{m.profile.fullName}</Text>
              {m.profile.title ? <Text color="textMuted">{m.profile.title}</Text> : null}
              <Row gap={2} wrap>
                <Badge label={t(`common:roles.${m.membership.role}`)} tone="primary" />
                {suspended ? <Badge label={t('member.statusSuspended')} tone="danger" icon={Ban} /> : null}
                {m.membership.status === 'invited' ? <Badge label={t('member.statusInvited')} tone="info" icon={Mail} /> : null}
              </Row>
            </Stack>
          </Row>
          {m.profile.phone || m.profile.email ? <Divider /> : null}
          {m.profile.phone ? (
            <Row justify="between" gap={2}>
              <Text>{formatIndianPhone(m.profile.phone)}</Text>
              <Button label={t('common:actions.call')} icon={Phone} size="sm" variant="outline" onPress={() => void Linking.openURL(telLink(m.profile.phone!)).catch(() => undefined)} />
            </Row>
          ) : null}
          {m.profile.email ? <Text color="textMuted">{m.profile.email}</Text> : null}
        </Stack>
      </Card>

      {!isParent ? (
        <Card>
          <Stack gap={3}>
            <Text variant="subheading">{t('member.qualifications')}</Text>
            <Text variant="caption" color="textMuted">
              {t('member.qualificationsHelp')}
            </Text>
            <ChipGroup
              options={types.map((tt) => ({ value: tt.id, label: therapyTypeLabel(t, tt), dot: tt.color }))}
              value={quals}
              onChange={isAdmin ? setQuals : () => undefined}
              size="sm"
            />
            {isAdmin && qualsChanged ? <Button label={t('common:actions.save')} icon={Save} size="sm" onPress={() => void saveQuals()} loading={setTypes.isPending} /> : null}
          </Stack>
        </Card>
      ) : null}

      <Card padding={3}>
        <Stack gap={1}>
          <Row gap={2} style={{ paddingHorizontal: theme.space[1] }}>
            <Users size={18} color={theme.colors.primaryText} />
            <Text variant="subheading">
              {isParent ? t('member.linkedChildren', { count: linked.length }) : t('member.caseload', { count: caseloadCount(children, m.profile.id) })}
            </Text>
          </Row>
          {(isParent ? linked.map((l) => ({ id: l.childId, name: l.name, sub: l.relation })) : assigned.map((c) => ({ id: c.child.id, name: c.child.preferredName || c.child.fullName, sub: c.child.classGroup }))).map(
            (row) => (
              <ListItem key={row.id} title={row.name} subtitle={row.sub} left={<Avatar name={row.name} size={36} />} onPress={() => router.push(`/child/${row.id}`)} />
            ),
          )}
        </Stack>
      </Card>

      {isAdmin && !isSelf ? (
        <Button
          label={suspended ? t('member.reactivate') : t('member.suspend')}
          icon={suspended ? RotateCcw : Ban}
          variant={suspended ? 'secondary' : 'outline'}
          onPress={() => void toggleStatus()}
          loading={setStatus.isPending}
          fullWidth
          testID="toggle-status"
        />
      ) : null}
    </Screen>
  );
}
