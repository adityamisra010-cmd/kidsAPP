import { CalendarDays, Clock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import type { ClockTime, ISODate } from '@/domain/types';
import { formatDate, toISODate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';

import { Sheet } from './Sheet';
import { Text } from './Text';

/** Shared react-native-calendars theme so every calendar matches the app. */
export function useCalendarTheme() {
  const t = useTheme();
  return useMemo(
    () => ({
      calendarBackground: t.colors.surface,
      backgroundColor: t.colors.surface,
      textSectionTitleColor: t.colors.textMuted,
      dayTextColor: t.colors.text,
      todayTextColor: t.colors.primaryText,
      selectedDayBackgroundColor: t.colors.primary,
      selectedDayTextColor: t.colors.onPrimary,
      monthTextColor: t.colors.text,
      arrowColor: t.colors.primaryText,
      textDisabledColor: t.colors.textSubtle,
      dotColor: t.colors.accent,
      selectedDotColor: t.colors.onPrimary,
      textDayFontFamily: t.fonts.regular,
      textMonthFontFamily: t.fonts.semibold,
      textDayHeaderFontFamily: t.fonts.medium,
      textDayFontSize: 15,
      textMonthFontSize: 17,
    }),
    [t],
  );
}

function FieldButton({ label, value, placeholder, icon, onPress, error }: { label: string; value?: string; placeholder: string; icon: 'date' | 'time'; onPress: () => void; error?: string }) {
  const t = useTheme();
  const Icon = icon === 'date' ? CalendarDays : Clock;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={{
          minHeight: 52,
          borderWidth: 1.5,
          borderColor: error ? t.colors.danger : t.colors.border,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          paddingHorizontal: t.space[3],
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
        }}
      >
        <Icon size={20} color={t.colors.textMuted} />
        <Text color={value ? 'text' : 'textSubtle'}>{value ?? placeholder}</Text>
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Date field that opens a month calendar sheet. */
export function DateField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder,
  error,
}: {
  label: string;
  value?: ISODate;
  onChange: (d: ISODate) => void;
  minDate?: ISODate;
  maxDate?: ISODate;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const { t: tr } = useTranslation();
  const theme = useCalendarTheme();
  return (
    <>
      <FieldButton label={label} value={value ? formatDate(value) : undefined} placeholder={placeholder ?? tr('common:actions.select')} icon="date" onPress={() => setOpen(true)} error={error} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <Calendar
          current={value ?? toISODate(new Date())}
          minDate={minDate}
          maxDate={maxDate}
          firstDay={1}
          enableSwipeMonths
          theme={theme}
          markedDates={value ? { [value]: { selected: true } } : undefined}
          onDayPress={(d: { dateString: string }) => {
            onChange(d.dateString);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

function slots(start: ClockTime, end: ClockTime, stepMin: number): ClockTime[] {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const out: ClockTime[] = [];
  for (let m = toMin(start); m <= toMin(end); m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

export function formatClock(time: ClockTime): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Time field: grid of 15-minute slots within working hours (no fiddly wheel). */
export function TimeField({
  label,
  value,
  onChange,
  start = '07:00',
  end = '19:00',
  stepMin = 15,
  placeholder,
  error,
}: {
  label: string;
  value?: ClockTime;
  onChange: (t: ClockTime) => void;
  start?: ClockTime;
  end?: ClockTime;
  stepMin?: number;
  placeholder?: string;
  error?: string;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => slots(start, end, stepMin), [start, end, stepMin]);
  return (
    <>
      <FieldButton label={label} value={value ? formatClock(value) : undefined} placeholder={placeholder ?? tr('common:actions.select')} icon="time" onPress={() => setOpen(true)} error={error} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {options.map((o) => {
            const active = o === value;
            return (
              <Pressable
                key={o}
                onPress={() => {
                  onChange(o);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={formatClock(o)}
                style={{
                  width: '31%',
                  minHeight: 48,
                  borderRadius: t.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: active ? t.colors.primary : t.colors.border,
                  backgroundColor: active ? t.colors.primarySoft : t.colors.surface,
                }}
              >
                <Text variant="label" tint={active ? t.colors.primaryText : t.colors.text}>
                  {formatClock(o)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
