/** Form pieces that also have a calm read-only form (coordinators see settings but can't edit). */
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { ClockTime } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Chip, ChipGroup, formatClock, Stack, Stepper, Text, TimeField } from '@/ui';

export function Section({ icon: Icon, title, body, children, testID }: { icon: LucideIcon; title: string; body?: string; children: ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <Card testID={testID}>
      <Stack gap={4}>
        <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={t.colors.primaryText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
            {body ? (
              <Text variant="caption" color="textMuted">
                {body}
              </Text>
            ) : null}
          </View>
        </View>
        {children}
      </Stack>
    </Card>
  );
}

export function ValueRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="label">{label}</Text>
      <View style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: t.space[3], borderRadius: t.radius.md, backgroundColor: t.colors.surfaceAlt }}>
        <Text>{value}</Text>
      </View>
    </View>
  );
}

export function ChoiceChips({
  label,
  options,
  value,
  onChange,
  single,
  readOnly,
  testID,
}: {
  label?: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
  readOnly?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Stack gap={2}>
      {label ? <Text variant="label">{label}</Text> : null}
      {readOnly ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {options.map((o) => (
            <Chip key={o.value} label={o.label} selected={value.includes(o.value)} />
          ))}
        </View>
      ) : (
        <ChipGroup testID={testID} options={options} value={value} single={single} onChange={(next) => (single && next.length === 0 ? undefined : onChange(next))} />
      )}
    </Stack>
  );
}

export function TimeInput({
  label,
  value,
  onChange,
  readOnly,
  start = '00:00',
  end = '23:45',
  stepMin = 15,
  error,
}: {
  label: string;
  value: ClockTime;
  onChange: (v: ClockTime) => void;
  readOnly?: boolean;
  start?: ClockTime;
  end?: ClockTime;
  stepMin?: number;
  error?: string;
}) {
  if (readOnly) return <ValueRow label={label} value={formatClock(value)} />;
  return <TimeField label={label} value={value} onChange={onChange} start={start} end={end} stepMin={stepMin} error={error} />;
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  readOnly,
  testID,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  readOnly?: boolean;
  testID?: string;
}) {
  if (readOnly) return <ValueRow label={label} value={suffix ? `${value} ${suffix}` : String(value)} />;
  return <Stepper testID={testID} label={label} value={value} onChange={onChange} min={min} max={max} step={step} suffix={suffix} />;
}
