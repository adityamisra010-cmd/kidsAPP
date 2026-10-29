/**
 * Big single-choice tiles (icon + word) for parents: "How did it go?", check-in questions.
 * Selection shows a tinted fill, a strong border AND a check mark, never colour alone.
 */
import { Check, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/ui';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

export function ChoiceTiles<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
  testID,
}: {
  /** The question, shown above and used as the group's accessibility label. */
  label: string;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  /** Wrap into a grid (e.g. 2 for four longer labels). Default: one row. */
  columns?: 2;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[2] }} testID={testID}>
      <Text variant="subheading" accessibilityRole="header">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: columns ? 'wrap' : 'nowrap', gap: t.space[2] }}>
        {options.map((o) => {
          const selected = o.value === value;
          const Icon = o.icon;
          return (
            <Pressable
              key={o.value}
              testID={testID ? `${testID}-${o.value}` : undefined}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={o.label}
              style={({ pressed }) => ({
                ...(columns ? { flexBasis: '46%', flexGrow: 1 } : { flex: 1 }),
                minHeight: columns ? 80 : 92,
                borderRadius: t.radius.lg,
                borderWidth: selected ? 2 : 1.5,
                borderColor: selected ? t.colors.primary : t.colors.border,
                backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: t.space[3],
                paddingHorizontal: t.space[1],
                gap: t.space[1],
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon size={30} color={selected ? t.colors.primaryText : t.colors.textMuted} strokeWidth={selected ? 2.4 : 2} />
              <Text variant="bodyStrong" align="center" weight={selected ? 'semibold' : 'medium'} tint={selected ? t.colors.primaryText : t.colors.text}>
                {o.label}
              </Text>
              {selected ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: t.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={13} color={t.colors.onPrimary} strokeWidth={3} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
