/** Mon–Sun strip with therapy dots; tap a day to see its agenda. */
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { AppointmentView, ISODate, OrgSettings } from '@/domain/types';
import { formatDay, parse, sameDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, Row, Text } from '@/ui';

import { dayMonth, localDate } from '../lib/grouping';
import { dotsByDay, holidayOn, isCancelled } from '../lib/marking';
import { weekDays } from '../lib/ranges';

export function WeekStrip({
  selectedDay,
  appointments,
  settings,
  onSelectDay,
  onShiftWeek,
  now = new Date(),
}: {
  selectedDay: ISODate;
  appointments: AppointmentView[];
  settings: OrgSettings;
  onSelectDay: (day: ISODate) => void;
  onShiftWeek: (by: number) => void;
  now?: Date;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation('calendar');
  const days = weekDays(selectedDay);
  const dots = useMemo(() => dotsByDay(appointments), [appointments]);
  const counts = useMemo(() => {
    const m = new Map<ISODate, number>();
    for (const a of appointments) {
      if (isCancelled(a)) continue;
      const d = localDate(a.startsAt);
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [appointments]);
  const range = `${dayMonth(days[0])} – ${dayMonth(days[6])}`;

  return (
    <Card padding={3} testID="week-strip">
      <Row justify="between" gap={1}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} label={tr('week.prev')} accessibilityHint={tr('week.prevA11y')} onPress={() => onShiftWeek(-1)} />
        <Text variant="label" weight="semibold" align="center" style={{ flex: 1 }} numberOfLines={1}>
          {range}
        </Text>
        <Button size="sm" variant="ghost" iconRight={ChevronRight} label={tr('week.next')} accessibilityHint={tr('week.nextA11y')} onPress={() => onShiftWeek(1)} />
      </Row>
      <Row gap={1} style={{ marginTop: t.space[2] }} accessibilityRole="tablist">
        {days.map((d) => {
          const date = parse(d);
          const selected = d === selectedDay;
          const today = sameDay(d, now);
          const muted = !!holidayOn(d, settings.holidays) || !settings.workingHours.days.includes(date.getDay());
          const dayDots = dots.get(d) ?? [];
          const fg = selected ? t.colors.onPrimary : today ? t.colors.primaryText : muted ? t.colors.textSubtle : t.colors.text;
          return (
            <Pressable
              key={d}
              onPress={() => onSelectDay(d)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tr('day.a11y', { day: formatDay(d), count: counts.get(d) ?? 0 })}
              testID={`week-day-${d}`}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 72,
                borderRadius: t.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: selected ? t.colors.primary : pressed ? t.colors.surfaceAlt : 'transparent',
                borderWidth: today && !selected ? 1.5 : 0,
                borderColor: t.colors.primary,
              })}
            >
              <Text variant="caption" tint={selected ? t.colors.onPrimary : t.colors.textMuted} maxFontSizeMultiplier={1.2}>
                {tr(`weekdays.short.${date.getDay()}`)}
              </Text>
              <Text variant="subheading" tint={fg} maxFontSizeMultiplier={1.2}>
                {date.getDate()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                {dayDots.map((dot) => (
                  <View key={dot.key} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selected ? t.colors.onPrimary : dot.color }} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </Row>
    </Card>
  );
}
