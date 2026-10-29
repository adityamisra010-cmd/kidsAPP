import { CalendarDays, CalendarOff, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ISODate } from '@/domain/types';
import { formatDay } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, DateField, Divider, Stack, Text, TextField } from '@/ui';

import { addHoliday, removeHoliday, WEEKDAY_ORDER } from '../settingsDraft';
import type { SectionProps } from './DetailsSection';
import { ChoiceChips, Section, TimeInput } from './fields';

export function CalendarSection({ draft, update, readOnly, errors }: SectionProps) {
  const t = useTheme();
  const { t: tr } = useTranslation('school');
  const wh = draft.settings.workingHours;
  const [date, setDate] = useState<ISODate | undefined>();
  const [label, setLabel] = useState('');

  const add = () => {
    if (!date) return;
    update((d) => {
      d.settings.holidays = addHoliday(d.settings.holidays, date, label || tr('calendar.holidaysTitle'));
    });
    setDate(undefined);
    setLabel('');
  };

  return (
    <Section icon={CalendarDays} title={tr('calendar.title')} body={tr('calendar.body')} testID="school-calendar">
      <View style={{ flexDirection: 'row', gap: t.space[3] }}>
        <View style={{ flex: 1 }}>
          <TimeInput
            label={tr('calendar.start')}
            value={wh.start}
            readOnly={readOnly}
            start="06:00"
            end="21:00"
            onChange={(v) =>
              update((d) => {
                d.settings.workingHours.start = v;
              })
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeInput
            label={tr('calendar.end')}
            value={wh.end}
            readOnly={readOnly}
            start="06:00"
            end="22:00"
            error={errors.workingHours ? tr(errors.workingHours) : undefined}
            onChange={(v) =>
              update((d) => {
                d.settings.workingHours.end = v;
              })
            }
          />
        </View>
      </View>
      <ChoiceChips
        testID="school-working-days"
        label={tr('calendar.days')}
        readOnly={readOnly}
        options={WEEKDAY_ORDER.map((n) => ({ value: String(n), label: tr(`weekdays.${n}`) }))}
        value={wh.days.map(String)}
        onChange={(v) =>
          update((d) => {
            d.settings.workingHours.days = v.map(Number);
          })
        }
      />
      {errors.workingDays ? (
        <Text variant="caption" color="danger">
          {tr(errors.workingDays)}
        </Text>
      ) : null}

      <Divider />
      <Stack gap={1}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
          <CalendarOff size={18} color={t.colors.textMuted} />
          <Text variant="subheading">{tr('calendar.holidaysTitle')}</Text>
        </View>
        <Text variant="caption" color="textMuted">
          {tr('calendar.holidaysBody')}
        </Text>
      </Stack>
      {draft.settings.holidays.length === 0 ? (
        <Text color="textMuted">{tr('calendar.noHolidays')}</Text>
      ) : (
        <Stack gap={1}>
          {draft.settings.holidays.map((h) => (
            <View key={h.date} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minHeight: 48 }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{h.label}</Text>
                <Text variant="caption" color="textMuted">
                  {formatDay(h.date)}
                </Text>
              </View>
              {readOnly ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  label={tr('common:actions.remove')}
                  accessibilityHint={tr('calendar.removeHoliday', { label: h.label })}
                  onPress={() =>
                    update((d) => {
                      d.settings.holidays = removeHoliday(d.settings.holidays, h.date);
                    })
                  }
                />
              )}
            </View>
          ))}
        </Stack>
      )}
      {readOnly ? null : (
        <Stack gap={3}>
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <View style={{ flex: 1 }}>
              <DateField label={tr('calendar.holidayDate')} value={date} onChange={setDate} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label={tr('calendar.holidayLabel')} value={label} onChangeText={setLabel} placeholder={tr('calendar.holidayLabelPlaceholder')} />
            </View>
          </View>
          <Button testID="school-add-holiday" label={tr('calendar.addHoliday')} icon={Plus} variant="secondary" disabled={!date} onPress={add} />
        </Stack>
      )}
    </Section>
  );
}
