import { router } from 'expo-router';
import { CalendarCheck, Plus, School, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { StatGrid, StatTile } from '@/features/dashboard/StatTile';
import { useRefresh } from '@/features/home/components/useRefresh';
import { EmptyState, LabeledIconButton, QueryView, Screen, SkeletonList } from '@/ui';

import { useSchools } from './queries';
import { SchoolCard } from './SchoolCard';
import { schoolTotals, sortSchools } from './schoolForm';

/** Platform admin home: every partner school with usage at a glance. */
export function SchoolsScreen() {
  const { t } = useTranslation('platform');
  const q = useSchools();
  const list = useMemo(() => sortSchools(q.data ?? []), [q.data]);
  const totals = useMemo(() => schoolTotals(q.data ?? []), [q.data]);
  const { refreshing, onRefresh } = useRefresh(['platform']);
  const add = () => router.push('/platform-school/new');

  return (
    <Screen
      testID="schools"
      title={t('schools.title')}
      subtitle={q.data ? t('schools.subtitle', { active: totals.active, total: totals.schools }) : undefined}
      refreshing={refreshing}
      onRefresh={onRefresh}
      right={<LabeledIconButton testID="add-school" icon={Plus} label={t('schools.add')} onPress={add} />}
    >
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={3} height={170} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('schools.emptyTitle')} body={t('schools.emptyBody')} actionLabel={t('schools.add')} onAction={add} />}
      >
        {() => (
          <>
            <StatGrid>
              <StatTile testID="total-schools" icon={School} label={t('schools.totalSchools')} value={totals.active} tone="primary" />
              <StatTile testID="total-children" icon={Users} label={t('schools.totalChildren')} value={totals.children} />
              <StatTile testID="total-sessions" icon={CalendarCheck} label={t('schools.totalSessions')} value={totals.sessionsThisMonth} />
            </StatGrid>
            {list.map((s) => (
              <SchoolCard key={s.organization.id} school={s} />
            ))}
          </>
        )}
      </QueryView>
    </Screen>
  );
}
