import { Ban, CalendarCheck, Mail, MapPin, Phone, RotateCcw, UserRound, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { formatPercent } from '@/features/dashboard/format';
import { StatGrid, StatTile } from '@/features/dashboard/StatTile';
import { useRefresh } from '@/features/home/components/useRefresh';
import { formatDate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, confirm, Divider, EmptyState, ErrorState, ListItem, Row, Screen, SectionHeader, SkeletonList, Stack, Text, toast } from '@/ui';

import { useSchools, useSetSchoolStatus } from './queries';
import { lastActivityText, SchoolStatusBadge } from './SchoolCard';
import { formatIndianPhone } from './schoolForm';

/** One school: usage, contact details and suspend / reactivate (with confirmation). */
export function SchoolDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { t } = useTranslation('platform');
  const q = useSchools();
  const setStatus = useSetSchoolStatus();
  const { refreshing, onRefresh } = useRefresh(['platform']);
  const s = q.data?.find((x) => x.organization.id === id);

  if (q.isPending) {
    return (
      <Screen title={t('detail.loading')} back>
        <SkeletonList rows={3} height={140} />
      </Screen>
    );
  }
  if (q.error || !s) {
    return (
      <Screen title={t('detail.title')} back>
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <EmptyState title={t('detail.notFound')} />}
      </Screen>
    );
  }

  const o = s.organization;
  const suspended = o.status === 'suspended';
  const toggle = async () => {
    const ok = await confirm(
      suspended
        ? { title: t('detail.reactivateTitle', { name: o.shortName || o.name }), body: t('detail.reactivateBody'), confirmLabel: t('detail.reactivate') }
        : { title: t('detail.suspendTitle', { name: o.shortName || o.name }), body: t('detail.suspendBody'), confirmLabel: t('detail.suspend'), destructive: true },
    );
    if (!ok) return;
    setStatus.mutate(
      { orgId: o.id, status: suspended ? 'active' : 'suspended' },
      {
        onSuccess: () => toast.success(t(suspended ? 'detail.reactivated' : 'detail.suspended', { name: o.shortName || o.name })),
        onError: () => toast.error(t('errors:unknown')),
      },
    );
  };

  return (
    <Screen testID="school-detail" title={o.name} subtitle={o.city} back refreshing={refreshing} onRefresh={onRefresh}>
      <Card tone={suspended ? 'danger' : 'default'}>
        <Stack gap={3}>
          <Row justify="between">
            <SchoolStatusBadge status={o.status} />
            <Text variant="caption" color="textMuted">
              {lastActivityText(t, s.lastActivityAt)}
            </Text>
          </Row>
          <Text color="textMuted">{suspended ? t('detail.suspendedNote') : t('detail.activeNote')}</Text>
          <Button
            testID="toggle-status"
            label={suspended ? t('detail.reactivate') : t('detail.suspend')}
            icon={suspended ? RotateCcw : Ban}
            variant={suspended ? 'primary' : 'outline'}
            loading={setStatus.isPending}
            onPress={() => void toggle()}
          />
        </Stack>
      </Card>

      <SectionHeader title={t('detail.usage')} />
      <StatGrid>
        <StatTile icon={Users} label={t('card.children')} value={s.activeChildren} />
        <StatTile icon={UserRound} label={t('detail.staff')} value={s.staffCount} />
        <StatTile icon={CalendarCheck} label={t('card.sessions')} value={s.sessionsThisMonth} />
        <StatTile icon={Users} label={t('card.parents')} value={formatPercent(s.activeParentsPercent)} />
      </StatGrid>

      <SectionHeader title={t('detail.contact')} />
      <Card padding={3}>
        <ListItem title={o.address || '—'} subtitle={t('detail.address')} left={<MapPin size={20} color={theme.colors.textMuted} />} />
        <Divider />
        <ListItem
          title={o.phone ? formatIndianPhone(o.phone) : '—'}
          subtitle={t('detail.phone')}
          left={<Phone size={20} color={theme.colors.textMuted} />}
          onPress={o.phone ? () => void Linking.openURL(`tel:${o.phone}`) : undefined}
          accessibilityHint={o.phone ? t('detail.callHint') : undefined}
        />
        {o.email ? (
          <>
            <Divider />
            <ListItem title={o.email} subtitle={t('detail.email')} left={<Mail size={20} color={theme.colors.textMuted} />} onPress={() => void Linking.openURL(`mailto:${o.email}`)} />
          </>
        ) : null}
      </Card>
      <Text variant="caption" color="textSubtle">
        {t('detail.since', { date: formatDate(o.createdAt), short: o.shortName })}
      </Text>
    </Screen>
  );
}
