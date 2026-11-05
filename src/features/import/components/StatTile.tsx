import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text, useToneColors, type Tone } from '@/ui';

/** Number + label tile with an icon (never colour alone). Two per row on phones. */
export function StatTile({ icon: Icon, value, label, tone = 'neutral', testID }: { icon: LucideIcon; value: number; label: string; tone?: Tone; testID?: string }) {
  const t = useTheme();
  const c = useToneColors(tone);
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        minHeight: 76,
        borderRadius: t.radius.lg,
        backgroundColor: c.bg,
        padding: t.space[3],
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={18} color={c.fg} strokeWidth={2.4} />
        <Text variant="title" tint={c.fg}>
          {value}
        </Text>
      </View>
      <Text variant="label" color="text">
        {label}
      </Text>
    </View>
  );
}
