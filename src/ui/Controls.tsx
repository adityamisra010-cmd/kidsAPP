import { Minus, Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, Switch, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';

import { Text } from './Text';

/** Segmented control for 2–4 options (e.g. Upcoming / Past, Weekly / Monthly). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md, padding: 4, gap: 4 }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: t.radius.sm + 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? t.colors.primary : 'transparent',
            }}
          >
            <Text variant="label" weight={active ? 'semibold' : 'medium'} tint={active ? t.colors.onPrimary : t.colors.textMuted} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − value + with big targets (trial counters, durations). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  suffix,
  testID,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
  testID?: string;
}) {
  const t = useTheme();
  const btn = (icon: 'minus' | 'plus', disabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${icon === 'minus' ? '−' : '+'} ${label}`}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: TOUCH,
        height: TOUCH,
        borderRadius: t.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? t.colors.primarySoft : t.colors.surfaceAlt,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {icon === 'minus' ? <Minus size={22} color={t.colors.text} /> : <Plus size={22} color={t.colors.text} />}
    </Pressable>
  );
  return (
    <View testID={testID} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }} style={{ gap: 4 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        {btn('minus', value <= min, () => onChange(Math.max(min, value - step)))}
        <Text variant="heading" style={{ minWidth: 40, textAlign: 'center' }}>
          {value}
          {suffix ? <Text variant="caption" color="textMuted">{` ${suffix}`}</Text> : null}
        </Text>
        {btn('plus', value >= max, () => onChange(Math.min(max, value + step)))}
      </View>
    </View>
  );
}

/** Animated fill that respects reduce-motion. value 0..1 */
export function ProgressBar({ value, color, height = 8, label }: { value: number; color?: string; height?: number; label?: string }) {
  const t = useTheme();
  const w = useSharedValue(t.reduceMotion ? value : 0);
  useEffect(() => {
    w.value = t.reduceMotion ? value : withTiming(Math.max(0, Math.min(1, value)), { duration: 600 });
  }, [value, t.reduceMotion, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? t.colors.accent }, fill]} />
    </View>
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3], minHeight: 56, paddingVertical: t.space[2] }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: t.colors.primary, false: t.colors.borderStrong }}
        thumbColor={t.colors.surface}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}
