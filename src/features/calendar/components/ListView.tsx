/** List view: Upcoming / Past, grouped by day ("Today", "Tomorrow", "Mon, 24 May"). */
import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentView } from '@/domain/types';
import { Button, EmptyState, SegmentedControl, SkeletonList, Stack } from '@/ui';

import { groupByDay, splitUpcomingPast } from '../lib/grouping';
import type { ListTab } from '../lib/ranges';
import { AgendaRow, type Perspective } from './AgendaRow';
import { DayHeading } from './DayHeading';

export function ListView({
  tab,
  onTab,
  items,
  loading,
  perspective,
  showChildName,
  filtered,
  onShowMore,
  now = new Date(),
}: {
  tab: ListTab;
  onTab: (tab: ListTab) => void;
  items: AppointmentView[];
  loading: boolean;
  perspective: Perspective;
  showChildName?: boolean;
  /** Filters are active (changes the empty-state wording). */
  filtered?: boolean;
  onShowMore: () => void;
  now?: Date;
}) {
  const { t } = useTranslation('calendar');
  const { upcoming, past } = splitUpcomingPast(items, now);
  const groups = tab === 'upcoming' ? groupByDay(upcoming, 'asc') : groupByDay(past, 'desc');

  const empty = () => {
    if (filtered) return <EmptyState compact title={t('empty.filteredTitle')} body={t('empty.filteredBody')} />;
    if (tab === 'past') return <EmptyState compact title={t('empty.pastTitle')} body={t('empty.pastBody')} />;
    if (perspective === 'parent') {
      return <EmptyState title={t('empty.parentTitle')} body={t('empty.parentBody')} actionLabel={t('empty.contactSchool')} onAction={() => router.push('/account/contact')} />;
    }
    if (perspective === 'admin') {
      return <EmptyState title={t('empty.adminTitle')} body={t('empty.adminBody')} actionLabel={t('admin.newSchedule')} onAction={() => router.push('/appointment/new')} />;
    }
    return <EmptyState title={t('empty.staffTitle')} body={t('empty.staffBody')} />;
  };

  return (
    <Stack gap={4} testID="list-view">
      <SegmentedControl
        options={[
          { value: 'upcoming', label: t('list.upcoming') },
          { value: 'past', label: t('list.past') },
        ]}
        value={tab}
        onChange={onTab}
      />
      {loading ? (
        <SkeletonList rows={3} height={104} />
      ) : groups.length === 0 ? (
        empty()
      ) : (
        groups.map((g) => (
          <Stack gap={2} key={g.date}>
            <DayHeading day={g.date} now={now} />
            {g.items.map((a) => (
              <AgendaRow key={a.id} appointment={a} perspective={perspective} showChildName={showChildName} />
            ))}
          </Stack>
        ))
      )}
      {!loading ? (
        <Button
          variant="ghost"
          icon={ChevronDown}
          label={tab === 'upcoming' ? t('list.showLater') : t('list.showEarlier')}
          onPress={onShowMore}
          style={{ alignSelf: 'center' }}
        />
      ) : null}
    </Stack>
  );
}
