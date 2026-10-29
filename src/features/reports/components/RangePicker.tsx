import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toISODate } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { ChipGroup, DateField, Stack, Text } from '@/ui';

import { isValidRange, presetRange, RANGE_PRESETS, type DateRange, type RangePreset } from '../dateRanges';

export interface RangeValue extends DateRange {
  preset: RangePreset;
}

export function initialRange(preset: Exclude<RangePreset, 'custom'> = 'this_month'): RangeValue {
  return { preset, ...presetRange(preset) };
}

/** Preset chips (This month / Last month / Last 3 months / Custom) with date fields for Custom. */
export function RangePicker({ label, value, onChange }: { label: string; value: RangeValue; onChange: (v: RangeValue) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation('reports');
  const today = toISODate(new Date());
  const invalid = value.preset === 'custom' && !isValidRange(value);
  return (
    <Stack gap={2}>
      <Text variant="label">{label}</Text>
      <ChipGroup
        testID="range-presets"
        single
        options={RANGE_PRESETS.map((p) => ({ value: p, label: tr(`presets.${p}`) }))}
        value={[value.preset]}
        onChange={(next) => {
          const p = (next[0] as RangePreset | undefined) ?? value.preset;
          onChange(p === 'custom' ? { ...value, preset: 'custom' } : { preset: p, ...presetRange(p) });
        }}
      />
      {value.preset === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: t.space[3] }}>
          <View style={{ flex: 1 }}>
            <DateField label={tr('from')} value={value.from} maxDate={today} onChange={(from) => onChange({ ...value, from })} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label={tr('to')} value={value.to} maxDate={today} onChange={(to) => onChange({ ...value, to })} />
          </View>
        </View>
      ) : null}
      {invalid ? (
        <Text variant="caption" color="danger">
          {tr('rangeInvalid')}
        </Text>
      ) : null}
    </Stack>
  );
}
