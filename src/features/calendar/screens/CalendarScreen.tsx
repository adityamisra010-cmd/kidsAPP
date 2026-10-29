/**
 * Role-aware calendar used by three tabs: parent Calendar, therapist Calendar and the
 * coordinator / school admin Schedule. Month · Week · List views over one fetched range.
 */
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AppointmentFilter } from '@/data/repository';
import type { ISODate } from '@/domain/types';
import { toISODate } from '@/lib/dates';
import { useRequiredActive } from '@/state/session';
import { Button, ErrorState, Screen, SegmentedControl, Stack } from '@/ui';

import type { Perspective } from '../components/AgendaRow';
import { DayAgenda } from '../components/DayAgenda';
import { activeFilterCount, AdminFilterBar, ParentChildChips, type ScheduleFilters } from '../components/Filters';
import { ListView } from '../components/ListView';
import { MonthView } from '../components/MonthView';
import { QuickLinks } from '../components/QuickLinks';
import { WeekStrip } from '../components/WeekStrip';
import { isAdminRole } from '../lib/actions';
import { itemsOnDay } from '../lib/grouping';
import { monthKey, rangeForView, shiftWeek, type CalendarView, type ListTab } from '../lib/ranges';
import { useAppointmentList, useNeedingSubstitute, useOrgSettings, useRescheduleRequests } from '../queries';

const LIST_WEEKS_STEP = 4;

export function CalendarScreen() {
  const { t } = useTranslation('calendar');
  const active = useRequiredActive();
  const settings = useOrgSettings();
  const admin = isAdminRole(active.role);
  const perspective: Perspective = active.role === 'parent' ? 'parent' : admin ? 'admin' : 'therapist';

  const today = toISODate(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [month, setMonth] = useState<ISODate>(monthKey(today));
  const [selectedDay, setSelectedDay] = useState<ISODate>(today);
  const [tab, setTab] = useState<ListTab>('upcoming');
  const [listWeeks, setListWeeks] = useState(LIST_WEEKS_STEP);
  const [filters, setFilters] = useState<ScheduleFilters>({});
  const [parentChild, setParentChild] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  // `now` is fixed per render pass of the range; recomputed when the view inputs change.
  const filter = useMemo<AppointmentFilter>(() => {
    const range = rangeForView({ view, month, selectedDay, tab, listWeeks }, new Date());
    const base: AppointmentFilter = { ...range, includeCancelled: true };
    if (perspective === 'parent') return { ...base, childId: parentChild };
    if (perspective === 'therapist') return { ...base, therapistId: active.user.profile.id };
    return { ...base, ...filters };
  }, [view, month, selectedDay, tab, listWeeks, perspective, parentChild, filters, active.user.profile.id]);

  const list = useAppointmentList(filter);
  const subs = useNeedingSubstitute(admin);
  const requests = useRescheduleRequests({ status: ['pending'] }, admin);
  const items = useMemo(() => list.data ?? [], [list.data]);
  const loading = list.isPending;
  const showChildName = perspective === 'parent' && !parentChild;

  const selectDay = (d: ISODate) => {
    setSelectedDay(d);
    if (monthKey(d) !== month) setMonth(monthKey(d));
  };
  const changeMonth = (m: ISODate) => {
    setMonth(m);
    // Keep the agenda meaningful: today in the current month, otherwise the 1st.
    if (monthKey(selectedDay) !== m) setSelectedDay(monthKey(today) === m ? today : m);
  };
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([list.refetch(), admin ? subs.refetch() : null, admin ? requests.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      title={admin ? t('title.schedule') : t('title.calendar')}
      right={admin ? <Button size="sm" icon={Plus} label={t('admin.newSchedule')} onPress={() => router.push('/appointment/new')} testID="new-schedule" /> : undefined}
      headerExtra={
        <SegmentedControl
          testID="view-switcher"
          options={[
            { value: 'month', label: t('views.month') },
            { value: 'week', label: t('views.week') },
            { value: 'list', label: t('views.list') },
          ]}
          value={view}
          onChange={setView}
        />
      }
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      testID="calendar-screen"
    >
      <Stack gap={4}>
        {admin ? <QuickLinks needCover={subs.data?.length ?? 0} pendingRequests={requests.data?.length ?? 0} /> : null}
        {admin ? <AdminFilterBar value={filters} onChange={setFilters} /> : null}
        {perspective === 'parent' ? <ParentChildChips value={parentChild} onChange={setParentChild} /> : null}

        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : view === 'list' ? (
          <ListView
            tab={tab}
            onTab={(next) => {
              setTab(next);
              setListWeeks(LIST_WEEKS_STEP);
            }}
            items={items}
            loading={loading}
            perspective={perspective}
            showChildName={showChildName}
            filtered={admin && activeFilterCount(filters) > 0}
            onShowMore={() => setListWeeks((w) => w + LIST_WEEKS_STEP)}
          />
        ) : (
          <>
            {view === 'month' ? (
              <MonthView month={month} selectedDay={selectedDay} appointments={items} settings={settings} onSelectDay={selectDay} onMonthChange={changeMonth} />
            ) : (
              <WeekStrip selectedDay={selectedDay} appointments={items} settings={settings} onSelectDay={selectDay} onShiftWeek={(by) => selectDay(shiftWeek(selectedDay, by))} />
            )}
            <DayAgenda
              day={selectedDay}
              items={itemsOnDay(items, selectedDay)}
              loading={loading}
              perspective={perspective}
              settings={settings}
              showChildName={showChildName}
            />
          </>
        )}
      </Stack>
    </Screen>
  );
}
