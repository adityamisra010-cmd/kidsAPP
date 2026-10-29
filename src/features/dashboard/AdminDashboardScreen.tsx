import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CircleCheck, ListTodo, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useRepo } from '@/data';
import { key } from '@/data/queryClient';
import { useAlerts } from '@/features/alerts/queries';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { useNow } from '@/features/home/components/useNow';
import { useRefresh } from '@/features/home/components/useRefresh';
import { dayPeriod, firstName } from '@/features/home/greeting';
import { BellButton } from '@/features/notifications/BellButton';
import { formatDay } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { ErrorState, LabeledIconButton, Screen, SkeletonList, Text } from '@/ui';

import { AttentionSection, CoverSection, RescheduleSection, UnloggedSection } from './ActionSections';
import { actionCount } from './format';
import { TodaySection, WeekSection, WorkloadSection } from './InsightSections';

/**
 * Coordinator / school admin dashboard. Order: today's numbers, then things to act on (children,
 * unlogged sessions, cover, reschedules), then the week's rates and workload.
 */
export function AdminDashboardScreen() {
  const { t } = useTranslation('dashboard');
  const theme = useTheme();
  const active = useRequiredActive();
  const repo = useRepo();
  const now = useNow();
  const q = useQuery({ queryKey: key('dashboards', 'admin'), queryFn: () => repo.dashboards.admin() });
  const alerts = useAlerts('open');
  const { refreshing, onRefresh } = useRefresh(['dashboards', 'alerts', 'appointments', 'sessions', 'notifications']);

  const toDo = q.data ? actionCount(q.data) : 0;
  const summary = q.data ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
      {toDo ? <ListTodo size={16} color={theme.colors.warning} /> : <CircleCheck size={16} color={theme.colors.success} />}
      <Text variant="label" tint={toDo ? theme.colors.warning : theme.colors.success} weight="semibold">
        {toDo ? t('header.toDo', { count: toDo }) : t('header.allClear')}
      </Text>
    </View>
  ) : null;

  return (
    <Screen testID="admin-dashboard" refreshing={refreshing} onRefresh={onRefresh}>
      <HomeHeader
        testID="dashboard-header"
        eyebrow={`${t(`header.greeting.${dayPeriod(now)}`, { name: firstName(active.user.profile.fullName) })} · ${formatDay(q.data?.date ?? now)}`}
        title={active.organization?.name ?? t('header.fallbackTitle')}
        below={summary}
        actions={
          <>
            <LabeledIconButton testID="alerts-button" icon={TriangleAlert} label={t('header.alerts')} badge={alerts.data?.length ?? 0} onPress={() => router.push('/alerts')} />
            <BellButton />
          </>
        }
      />
      {q.isPending ? (
        <SkeletonList rows={4} height={140} />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <TodaySection today={q.data.today} index={0} />
          <AttentionSection items={q.data.childrenNeedingAttention} index={1} />
          <UnloggedSection items={q.data.unloggedSessions} index={2} />
          <CoverSection needs={q.data.needsSubstitute} upcoming={q.data.upcomingSubstitutions} index={3} />
          <RescheduleSection items={q.data.pendingReschedules} index={4} />
          <WeekSection week={q.data.week} index={5} />
          <WorkloadSection workload={q.data.workload} index={6} />
        </>
      )}
    </Screen>
  );
}
