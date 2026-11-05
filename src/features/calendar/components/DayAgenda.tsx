/** The agenda for one selected day (Month and Week views). */
import { router } from 'expo-router';
import { Plus, TreePalm } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { AppointmentView, ISODate, OrgSettings } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, EmptyState, Row, SkeletonList, Stack, Text } from '@/ui';

import { dayHeading } from '../lib/grouping';
import { holidayOn } from '../lib/marking';
import { weekdayOf } from '../lib/slots';
import { AgendaRow, type Perspective } from './AgendaRow';

export function DayAgenda({
  day,
  items,
  loading,
  perspective,
  settings,
  showChildName,
  now = new Date(),
}: {
  day: ISODate;
  items: AppointmentView[];
  loading: boolean;
  perspective: Perspective;
  settings: OrgSettings;
  showChildName?: boolean;
  now?: Date;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const heading = dayHeading(day, now, { today: tr('day.today'), tomorrow: tr('day.tomorrow'), yesterday: tr('day.yesterday') });
  const fullDate = formatDay(day);
  const holiday = holidayOn(day, settings.holidays);
  const closed = !settings.workingHours.days.includes(weekdayOf(day));

  return (
    <Stack gap={3}>
      <Row justify="between" align="flex-end">
        <Stack gap={0} flex={1}>
          <Text variant="heading" accessibilityRole="header">
            {heading}
          </Text>
          {heading !== fullDate ? (
            <Text variant="caption" color="textMuted">
              {fullDate}
            </Text>
          ) : null}
        </Stack>
        {!loading && items.length ? (
          <Text variant="label" color="textMuted">
            {tr('day.sessions', { count: items.length })}
          </Text>
        ) : null}
      </Row>

      {holiday || (closed && !items.length) ? (
        <Card tone="sunken" elevated={false} padding={3}>
          <Row gap={2}>
            <TreePalm size={18} color={t.colors.textMuted} />
            <Text variant="label" color="textMuted" style={{ flex: 1 }}>
              {holiday ? tr('day.holiday', { label: holiday }) : tr('day.closed')}
            </Text>
          </Row>
        </Card>
      ) : null}

      {loading ? (
        <SkeletonList rows={2} height={96} />
      ) : items.length ? (
        items.map((a) => <AgendaRow key={a.id} appointment={a} perspective={perspective} showChildName={showChildName} />)
      ) : holiday || closed ? null : (
        <Card elevated={false} padding={4}>
          <EmptyState
            compact
            title={tr('day.empty')}
            body={perspective === 'parent' ? tr('day.emptyParent') : tr('day.emptyStaff')}
          />
          {perspective === 'admin' ? (
            <Button
              label={tr('day.addSession')}
              icon={Plus}
              variant="secondary"
              onPress={() => router.push(`/appointment/new?date=${day}`)}
              style={{ alignSelf: 'center' }}
            />
          ) : null}
        </Card>
      )}
    </Stack>
  );
}
