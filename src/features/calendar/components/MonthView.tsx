/** Month grid: react-native-calendars themed like the app, one muted dot per therapy type. */
import { useMemo } from 'react';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';

import type { AppointmentView, ISODate, OrgSettings } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, useCalendarTheme } from '@/ui';

import { buildMarkedDates } from '../lib/marking';
import { monthKey } from '../lib/ranges';

type MarkedDates = NonNullable<CalendarProps['markedDates']>;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function MonthView({
  month,
  selectedDay,
  appointments,
  settings,
  onSelectDay,
  onMonthChange,
}: {
  month: ISODate;
  selectedDay: ISODate;
  appointments: AppointmentView[];
  settings: OrgSettings;
  onSelectDay: (day: ISODate) => void;
  onMonthChange: (month: ISODate) => void;
}) {
  const t = useTheme();
  const theme = useCalendarTheme();
  const marked = useMemo<MarkedDates>(
    () =>
      buildMarkedDates({
        appointments,
        selected: selectedDay,
        holidays: settings.holidays,
        selectedColor: t.colors.primary,
        selectedTextColor: t.colors.onPrimary,
        selectedDotColor: t.colors.onPrimary,
      }),
    [appointments, selectedDay, settings.holidays, t],
  );
  // Days the school is closed (e.g. Sunday) look muted but stay tappable.
  const closed = ALL_DAYS.filter((d) => !settings.workingHours.days.includes(d));

  return (
    <Card padding={2} testID="month-view">
      <Calendar
        // Remount on theme change: the library caches its stylesheet.
        key={t.scheme}
        initialDate={month}
        firstDay={1}
        enableSwipeMonths
        markingType="multi-dot"
        markedDates={marked}
        disabledByWeekDays={closed}
        theme={{ ...theme, textDayFontSize: 16, textDisabledColor: t.colors.textSubtle }}
        onDayPress={(d: DateData) => onSelectDay(d.dateString)}
        onMonthChange={(d: DateData) => onMonthChange(monthKey(d.dateString))}
      />
    </Card>
  );
}
