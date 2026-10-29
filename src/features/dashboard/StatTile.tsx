import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { Text, useToneColors, type Tone } from '@/ui';

/**
 * Big-number tile with icon + word. Tappable tiles navigate or filter; `selected` (filter tiles) shows
 * a stronger border and tint, and screens also show a "Showing only…" line so state isn't colour alone.
 */
export function StatTile({
  icon: IconCmp,
  label,
  value,
  tone = 'neutral',
  onPress,
  selected,
  hint,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: Tone;
  onPress?: () => void;
  selected?: boolean;
  /** Screen-reader hint for what tapping does. */
  hint?: string;
  testID?: string;
}) {
  const t = useTheme();
  const c = useToneColors(tone);
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
        <Text variant="display" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {value}
        </Text>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <IconCmp size={17} color={c.fg} />
        </View>
      </View>
      <Text variant="label" color="textMuted" numberOfLines={2}>
        {label}
      </Text>
    </>
  );
  const frame = {
    flexGrow: 1,
    flexBasis: '30%' as const,
    minWidth: 96,
    minHeight: TOUCH + 40,
    padding: t.space[3],
    gap: t.space[1],
    borderRadius: t.radius.lg,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? t.colors.primary : t.colors.border,
    backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
  };
  if (!onPress) {
    return (
      <View testID={testID} style={frame} accessible accessibilityLabel={`${value} ${label}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      accessibilityHint={hint}
      accessibilityState={selected != null ? { selected } : undefined}
      android_ripple={{ color: t.colors.surfaceAlt }}
      style={({ pressed }) => [frame, pressed && { opacity: 0.85 }]}
    >
      {body}
    </Pressable>
  );
}

/** Wrapping row of StatTiles with consistent gaps. */
export function StatGrid({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[3] }}>{children}</View>;
}
