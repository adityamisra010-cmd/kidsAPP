import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

/** Large, whole-row checkbox with a label and optional hint. */
export function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
  required,
  compact,
  testID,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  /** Plain row without the card frame (e.g. "Show password"). */
  compact?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: compact ? 'center' : 'flex-start',
        gap: t.space[3],
        padding: compact ? t.space[1] : t.space[4],
        minHeight: compact ? 48 : 56,
        alignSelf: compact ? 'flex-start' : 'stretch',
        borderRadius: t.radius.lg,
        borderWidth: compact ? 0 : 1.5,
        borderColor: checked ? t.colors.primary : t.colors.border,
        backgroundColor: compact ? 'transparent' : checked ? t.colors.primarySoft : t.colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 26,
          height: 26,
          marginTop: compact ? 0 : 1,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? t.colors.primary : t.colors.borderStrong,
          backgroundColor: checked ? t.colors.primary : t.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check size={18} color={t.colors.onPrimary} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: compact ? 0 : 1, gap: 4, justifyContent: 'center', minHeight: 26 }}>
        <Text variant={compact ? 'body' : 'bodyStrong'}>
          {label}
          {required ? <Text variant="bodyStrong" color="danger">{' *'}</Text> : null}
        </Text>
        {hint ? (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
