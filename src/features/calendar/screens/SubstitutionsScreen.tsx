/** `/substitutions` (coordinator): sessions whose therapist is on leave, and upcoming cover. */
import { addDays } from 'date-fns';
import { router } from 'expo-router';
import { CalendarOff, UserRoundCog, UserX } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppointmentView, TherapistUnavailability } from '@/domain/types';
import { formatTimeRange, toISODate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, Card, EmptyState, ErrorState, Row, Screen, SectionHeader, SkeletonList, Stack, Text, TypeTag } from '@/ui';

import { AgendaRow } from '../components/AgendaRow';
import { SubstituteSheet } from '../components/SubstituteSheet';
import { dayHeading, groupByDay, localDate } from '../lib/grouping';
import { useAppointmentList, useNeedingSubstitute, useUnavailability } from '../queries';

const UPCOMING_DAYS = 14;

function leaveFor(a: AppointmentView, leave: TherapistUnavailability[]): TherapistUnavailability | undefined {
  const day = localDate(a.startsAt);
  const regular = a.originalTherapistId ?? a.therapistId;
  return leave.find((l) => l.userId === regular && l.from <= day && day <= l.to);
}

function NeedsCoverCard({ appointment: a, leave, onChoose }: { appointment: AppointmentView; leave?: TherapistUnavailability; onChoose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const name = a.originalTherapistName ?? a.therapistName;
  return (
    <Card accent={a.therapyTypeColor} testID={`needs-${a.id}`}>
      <Stack gap={3}>
        <Row gap={3} align="flex-start">
          <Avatar name={a.childName} uri={a.childPhotoUrl} size={44} />
          <Stack gap={1} flex={1}>
            <Text variant="label" weight="semibold">
              {formatTimeRange(a.startsAt, a.endsAt)}
            </Text>
            <Text variant="subheading" numberOfLines={1}>
              {a.childName}
            </Text>
            <TypeTag name={a.therapyTypeName} color={a.therapyTypeColor} />
          </Stack>
        </Row>
        <Row gap={2}>
          <UserX size={16} color={t.colors.warning} />
          <Text variant="label" tint={t.colors.warning} style={{ flex: 1 }}>
            {leave?.reason ? tr('subs.onLeaveReason', { name, reason: leave.reason }) : tr('subs.onLeave', { name })}
          </Text>
        </Row>
        <Button label={tr('subs.choose')} icon={UserRoundCog} onPress={onChoose} fullWidth testID={`choose-${a.id}`} />
      </Stack>
    </Card>
  );
}

export function SubstitutionsScreen() {
  const { t } = useTranslation('calendar');
  const needs = useNeedingSubstitute();
  const now = useMemo(() => new Date(), []);
  const leave = useUnavailability({ from: toISODate(now), to: toISODate(addDays(now, 90)) });
  const upcoming = useAppointmentList({ from: now.toISOString(), to: addDays(now, UPCOMING_DAYS).toISOString() });
  const [choosing, setChoosing] = useState<AppointmentView | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const words = { today: t('day.today'), tomorrow: t('day.tomorrow'), yesterday: t('day.yesterday') };
  const covered = (upcoming.data ?? []).filter((a) => a.isSubstitute && a.status === 'scheduled');
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([needs.refetch(), leave.refetch(), upcoming.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      title={t('subs.title')}
      back
      right={<Button size="sm" variant="ghost" icon={CalendarOff} label={t('subs.manageLeave')} onPress={() => router.push('/availability')} />}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      testID="substitutions-screen"
    >
      <Stack gap={3}>
        <SectionHeader title={t('subs.needs')} subtitle={needs.data?.length ? t('subs.needsBody') : undefined} />
        {needs.isPending ? (
          <SkeletonList rows={2} height={180} />
        ) : needs.error ? (
          <ErrorState error={needs.error} onRetry={() => void needs.refetch()} />
        ) : !needs.data?.length ? (
          <Card tone="success" elevated={false}>
            <EmptyState compact title={t('subs.allCoveredTitle')} body={t('subs.allCoveredBody')} />
          </Card>
        ) : (
          groupByDay(needs.data).map((g) => (
            <Stack key={g.date} gap={2}>
              <Text variant="overline" color="textMuted" accessibilityRole="header">
                {dayHeading(g.date, now, words)}
              </Text>
              {g.items.map((a) => (
                <NeedsCoverCard key={a.id} appointment={a} leave={leaveFor(a, leave.data ?? [])} onChoose={() => setChoosing(a)} />
              ))}
            </Stack>
          ))
        )}
      </Stack>

      <Stack gap={3}>
        <SectionHeader title={t('subs.upcoming')} />
        {upcoming.isPending ? (
          <SkeletonList rows={2} />
        ) : covered.length ? (
          covered.map((a) => <AgendaRow key={a.id} appointment={a} perspective="admin" />)
        ) : (
          <Text color="textMuted">{t('subs.upcomingEmpty')}</Text>
        )}
      </Stack>

      <SubstituteSheet appointment={choosing} visible={!!choosing} onClose={() => setChoosing(null)} />
    </Screen>
  );
}
