import { ChevronDown, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

/** Field-looking button that opens a picker sheet ("Child: Aarav Sharma ▾"). */
export function SelectField({
  label,
  value,
  placeholder,
  icon: Icon,
  onPress,
  testID,
}: {
  label: string;
  value?: string;
  placeholder: string;
  icon?: LucideIcon;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={({ pressed }) => ({
          minHeight: 52,
          borderWidth: 1.5,
          borderColor: t.colors.border,
          borderRadius: t.radius.md,
          backgroundColor: pressed ? t.colors.surfaceAlt : t.colors.surface,
          paddingHorizontal: t.space[3],
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
        })}
      >
        {Icon ? <Icon size={20} color={t.colors.textMuted} /> : null}
        <Text color={value ? 'text' : 'textSubtle'} style={{ flex: 1 }} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <ChevronDown size={20} color={t.colors.textMuted} />
      </Pressable>
    </View>
  );
}
