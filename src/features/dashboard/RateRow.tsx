import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ProgressBar, Text } from '@/ui';

import { formatPercent, type RateTone } from './format';

/** Colour for a bar by tone (bars are always paired with a number and words). */
export function useToneBar(tone: RateTone): string {
  const t = useTheme();
  return tone === 'success' ? t.colors.success : tone === 'warning' ? t.colors.warning : t.colors.accent;
}

/** Label + big percent + bar (staff views only). */
export function RateRow({ label, caption, percent, tone, testID }: { label: string; caption?: string; percent: number; tone: RateTone; testID?: string }) {
  const t = useTheme();
  const color = useToneBar(tone);
  return (
    <View testID={testID} style={{ gap: t.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.space[2] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{label}</Text>
          {caption ? (
            <Text variant="caption" color="textMuted">
              {caption}
            </Text>
          ) : null}
        </View>
        <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          {formatPercent(percent)}
        </Text>
      </View>
      <ProgressBar value={percent / 100} color={color} height={10} label={`${label}: ${formatPercent(percent)}`} />
    </View>
  );
}

/** Name + "12 of 14 logged" + thin bar: one row per therapist. */
export function BarRow({
  title,
  detail,
  fraction,
  color,
  testID,
}: {
  title: string;
  detail: string;
  fraction: number;
  color: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ gap: 6, paddingVertical: t.space[2] }} accessible accessibilityLabel={`${title}, ${detail}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space[2] }}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        <Text variant="label" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
          {detail}
        </Text>
      </View>
      <ProgressBar value={fraction} color={color} height={8} />
    </View>
  );
}
