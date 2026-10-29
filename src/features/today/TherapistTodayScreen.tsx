import { router } from 'expo-router';
import { CircleCheck, ClipboardList, Inbox, MessageCircle, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StatGrid, StatTile } from '@/features/dashboard/StatTile';
import { InlineEmpty, Section } from '@/features/home/components/Blocks';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { useNow } from '@/features/home/components/useNow';
import { useRefresh } from '@/features/home/components/useRefresh';
import { dayPeriod, firstName } from '@/features/home/greeting';
import { BellButton } from '@/features/notifications/BellButton';
import { formatDay, toISODate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { Button, EmptyState, ErrorState, Row, Screen, SectionHeader, SkeletonList, Stack, SyncBadge, Text } from '@/ui';

import { AgendaCard } from './AgendaCard';
import { agendaSummary, earlierUnlogged, filterAgenda, findFocus, type AgendaFilter } from './agenda';
import { useTherapistToday, useUnloggedSessions } from './queries';

/** Therapist "Today": the day's sessions in time order with Brief + Log on each. */
export function TherapistTodayScreen() {
  const { t } = useTranslation('therapist');
  const active = useRequiredActive();
  const now = useNow();
  const [filter, setFilter] = useState<AgendaFilter>('all');
  const q = useTherapistToday();
  const unlogged = useUnloggedSessions(filter === 'not_logged');
  const { refreshing, onRefresh } = useRefresh(['dashboards', 'appointments', 'sessions', 'homePractice', 'messaging', 'notifications']);

  const appointments = useMemo(() => q.data?.appointments ?? [], [q.data]);
  const focus = useMemo(() => findFocus(appointments, now), [appointments, now]);
  const list = useMemo(() => filterAgenda(appointments, filter), [appointments, filter]);
  const summary = agendaSummary(appointments);
  const todayISO = q.data?.date ?? toISODate(now);
  const earlier = useMemo(() => earlierUnlogged(unlogged.data ?? [], todayISO), [unlogged.data, todayISO]);

  const header = (
    <HomeHeader
      testID="today-header"
      eyebrow={t(`today.greeting.${dayPeriod(now)}`, { name: firstName(active.user.profile.fullName) })}
      title={t('today.title', { date: formatDay(q.data?.date ?? now) })}
      below={<SyncBadge alwaysShow />}
      actions={<BellButton />}
    />
  );

  const lockHours = active.organization?.settings.logLockHours ?? 24;
  const toggleNotLogged = () => setFilter((f) => (f === 'not_logged' ? 'all' : 'not_logged'));

  return (
    <Screen testID="therapist-today" refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      {q.isPending ? (
        <SkeletonList rows={3} height={170} />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Section index={0}>
            <StatGrid>
              <StatTile
                testID="tile-reviews"
                icon={Inbox}
                label={t('today.tiles.reviews')}
                value={q.data.pendingReviews}
                tone={q.data.pendingReviews ? 'primary' : 'neutral'}
                hint={t('today.tiles.reviewsHint')}
                onPress={() => router.push('/therapist/reviews')}
              />
              <StatTile
                testID="tile-messages"
                icon={MessageCircle}
                label={t('today.tiles.messages')}
                value={q.data.unreadMessages}
                tone={q.data.unreadMessages ? 'primary' : 'neutral'}
                hint={t('today.tiles.messagesHint')}
                onPress={() => router.push('/messages')}
              />
              <StatTile
                testID="tile-unlogged"
                icon={ClipboardList}
                label={t('today.tiles.unlogged')}
                value={q.data.unloggedCount}
                tone={q.data.unloggedCount ? 'warning' : 'success'}
                selected={filter === 'not_logged'}
                hint={t('today.tiles.unloggedHint')}
                onPress={toggleNotLogged}
              />
            </StatGrid>
            {summary.total > 0 ? (
              <Text variant="label" color="textMuted">
                {t('today.progress', { logged: summary.logged, total: summary.total })}
              </Text>
            ) : null}
          </Section>

          {filter === 'not_logged' ? (
            <Row justify="between" gap={2}>
              <Text variant="label" weight="semibold" style={{ flex: 1 }}>
                {t('today.filterActive')}
              </Text>
              <Button label={t('today.showAll')} icon={X} size="sm" variant="ghost" onPress={() => setFilter('all')} testID="show-all" />
            </Row>
          ) : null}

          {appointments.length === 0 && filter === 'all' ? (
            <EmptyState
              title={t('today.empty.title')}
              body={t('today.empty.body')}
              actionLabel={t('today.empty.action')}
              onAction={() => router.push('/therapist/calendar')}
            />
          ) : (
            <Section index={1} testID="agenda">
              {filter === 'all' ? <SectionHeader title={t('today.agenda')} subtitle={t('today.agendaHint')} /> : null}
              {list.map((a) => (
                <AgendaCard key={a.id} appointment={a} focus={a.id === focus.currentId ? 'now' : a.id === focus.nextId ? 'next' : undefined} />
              ))}
              {filter === 'not_logged' && list.length === 0 && earlier.length === 0 && !unlogged.isPending ? (
                <InlineEmpty icon={CircleCheck} tone="success" title={t('today.allLogged.title')} body={t('today.allLogged.body')} />
              ) : null}
            </Section>
          )}

          {filter === 'not_logged' && unlogged.isPending ? <SkeletonList rows={1} height={150} /> : null}
          {filter === 'not_logged' && earlier.length > 0 ? (
            <Section index={2} testID="earlier-unlogged">
              <SectionHeader title={t('today.earlier.title')} subtitle={t('today.earlier.subtitle', { hours: lockHours })} />
              <Stack gap={3}>
                {earlier.map((a) => (
                  <AgendaCard key={a.id} appointment={a} showDate />
                ))}
              </Stack>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
