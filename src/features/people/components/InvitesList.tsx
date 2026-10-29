import { router } from 'expo-router';
import { Clock, Send, X } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChildren } from '@/data/hooks';
import type { Invite } from '@/domain/types';
import { matchesSearch } from '@/features/children/caseload';
import { timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Badge, Button, Card, confirm, EmptyState, errorMessageKey, QueryView, Row, SkeletonList, Stack, Text, toast } from '@/ui';

import { pendingInvites } from '../people';
import { formatIndianPhone } from '../phone';
import { useInvites, useRevokeInvite } from '../queries';

/** Pending invites with revoke. */
export function InvitesList({ search }: { search: string }) {
  const { t } = useTranslation('admin');
  const q = useInvites();
  return (
    <Stack gap={3}>
      <Button label={t('people.newInvite')} icon={Send} onPress={() => router.push('/people/invite')} testID="new-invite" />
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={96} />}
        isEmpty={(d) => pendingInvites(d).length === 0}
        empty={<EmptyState compact title={t('invites.emptyTitle')} body={t('invites.emptyBody')} />}
      >
        {(all) => {
          const list = pendingInvites(all).filter((i) => matchesSearch([i.fullName, i.phone, i.email], search));
          return list.length === 0 ? (
            <EmptyState compact title={t('people.noMatch')} />
          ) : (
            <Stack gap={3}>
              {list.map((i) => (
                <InviteCard key={i.id} invite={i} />
              ))}
            </Stack>
          );
        }}
      </QueryView>
    </Stack>
  );
}

function InviteCard({ invite: i }: { invite: Invite }) {
  const theme = useTheme();
  const { t } = useTranslation('admin');
  const revoke = useRevokeInvite();
  const children = useChildren().data;
  const names = useMemo(
    () => i.childIds.map((id) => (children ?? []).find((c) => c.child.id === id)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.child.preferredName || c.child.fullName),
    [children, i.childIds],
  );

  const onRevoke = async () => {
    const ok = await confirm({ title: t('invites.revokeTitle', { name: i.fullName }), body: t('invites.revokeBody'), confirmLabel: t('invites.revoke'), destructive: true });
    if (!ok) return;
    try {
      await revoke.mutateAsync(i.id);
      toast.success(t('invites.revoked'));
    } catch (e) {
      toast.error(t(errorMessageKey(e)));
    }
  };

  return (
    <Card testID={`invite-${i.id}`}>
      <Stack gap={2}>
        <Row justify="between" gap={2} align="flex-start">
          <Stack gap={0} flex={1}>
            <Text variant="bodyStrong">{i.fullName}</Text>
            <Text variant="caption" color="textMuted">
              {[formatIndianPhone(i.phone), i.email].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
          <Badge label={t(`common:roles.${i.role}`)} tone="primary" />
        </Row>
        {names.length ? (
          <Text variant="caption" color="textMuted">
            {t('invites.forChildren', { relation: i.relation ?? '', names: names.join(', ') })}
          </Text>
        ) : null}
        <Row justify="between" gap={2}>
          <Row gap={1}>
            <Clock size={14} color={theme.colors.textSubtle} />
            <Text variant="caption" color="textSubtle">
              {t('invites.sent', { when: timeAgo(i.createdAt) })}
            </Text>
          </Row>
          <Button label={t('invites.revoke')} icon={X} size="sm" variant="ghost" onPress={() => void onRevoke()} loading={revoke.isPending} />
        </Row>
      </Stack>
    </Card>
  );
}
