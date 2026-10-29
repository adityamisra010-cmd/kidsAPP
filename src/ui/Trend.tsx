import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import type { Trend } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

type Change = 'better' | 'same' | 'harder';

/** Arrow + words. Never colour alone. `kind="change"` for parent wording (better/same/harder). */
export function TrendIndicator({
  trend,
  change,
  showLabel = true,
  size = 'md',
}: {
  trend?: Trend;
  change?: Change;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const dir: 'up' | 'flat' | 'down' = change ? (change === 'better' ? 'up' : change === 'harder' ? 'down' : 'flat') : (trend ?? 'flat');
  const color = dir === 'up' ? t.colors.success : dir === 'down' ? t.colors.warning : t.colors.textMuted;
  const Cmp = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : ArrowRight;
  const label = change ? tr(`common:changeShort.${change}`) : tr(`common:trend.${dir}`);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={label}>
      <Cmp size={size === 'sm' ? 14 : 18} color={color} strokeWidth={2.4} />
      {showLabel ? (
        <Text variant={size === 'sm' ? 'caption' : 'label'} tint={color} weight="semibold">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Signed delta like "+12" / "−4" with arrow (staff views). */
export function Delta({ value, unit = '' }: { value?: number; unit?: string }) {
  const t = useTheme();
  if (value == null) return <Text variant="caption" color="textSubtle">—</Text>;
  const color = value > 0 ? t.colors.success : value < 0 ? t.colors.warning : t.colors.textMuted;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return (
    <Text variant="label" tint={color} weight="semibold">
      {`${sign}${Math.abs(Math.round(value * 10) / 10)}${unit}`}
    </Text>
  );
}

/** Tiny line chart. values in any range; drawn min→max. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color,
  domain,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  domain?: [number, number];
}) {
  const t = useTheme();
  if (values.length === 0) return <View style={{ width, height }} />;
  const [min, max] = domain ?? [Math.min(...values), Math.max(...values)];
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (values.length - 1);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const c = color ?? t.colors.primary;
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden>
      <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill={c} />
    </Svg>
  );
}
