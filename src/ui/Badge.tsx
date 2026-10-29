import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function useToneColors(tone: Tone) {
  const t = useTheme();
  return {
    neutral: { bg: t.colors.surfaceAlt, fg: t.colors.textMuted },
    primary: { bg: t.colors.primarySoft, fg: t.colors.primaryText },
    success: { bg: t.colors.successSoft, fg: t.colors.success },
    warning: { bg: t.colors.warningSoft, fg: t.colors.warning },
    danger: { bg: t.colors.dangerSoft, fg: t.colors.danger },
    info: { bg: t.colors.infoSoft, fg: t.colors.info },
  }[tone];
}

/** Small status chip: icon + word (status is never shown by colour alone). */
export function Badge({ label, tone = 'neutral', icon: IconCmp, testID }: { label: string; tone?: Tone; icon?: LucideIcon; testID?: string }) {
  const t = useTheme();
  const c = useToneColors(tone);
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderRadius: t.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      {IconCmp ? <IconCmp size={13} color={c.fg} strokeWidth={2.4} /> : null}
      <Text variant="caption" weight="semibold" tint={c.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Coloured dot + name for therapy types. */
export function TypeTag({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" color="textMuted" weight="medium" numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}
