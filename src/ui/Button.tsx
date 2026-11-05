import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Light haptic tap (default true for primary). */
  haptic?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: IconCmp,
  iconRight: IconRight,
  loading,
  disabled,
  fullWidth,
  accessibilityHint,
  testID,
  style,
  haptic,
}: ButtonProps) {
  const t = useTheme();
  const s = useStyles();
  const inactive = disabled || loading;

  const fg = {
    primary: t.colors.onPrimary,
    secondary: t.colors.primaryText,
    outline: t.colors.text,
    ghost: t.colors.primaryText,
    danger: t.colors.onPrimary,
  }[variant];
  const bg = {
    primary: t.colors.primary,
    secondary: t.colors.primarySoft,
    outline: 'transparent',
    ghost: 'transparent',
    danger: t.colors.danger,
  }[variant];
  const height = size === 'lg' ? 56 : size === 'sm' ? 40 : TOUCH;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={size === 'sm' ? 4 : 0}
      onPress={() => {
        if ((haptic ?? variant === 'primary') && Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }
        onPress?.();
      }}
      android_ripple={{ color: variant === 'primary' || variant === 'danger' ? 'rgba(255,255,255,0.2)' : t.colors.primarySoft }}
      style={({ pressed }) => [
        s.base,
        {
          height,
          backgroundColor: pressed && variant === 'primary' && Platform.OS !== 'android' ? t.colors.primaryPressed : bg,
          borderColor: variant === 'outline' ? t.colors.borderStrong : 'transparent',
          paddingHorizontal: size === 'sm' ? t.space[3] : t.space[5],
          opacity: inactive ? 0.55 : pressed && Platform.OS !== 'android' ? 0.9 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.content}>
          {IconCmp ? <IconCmp size={size === 'sm' ? 16 : 20} color={fg} strokeWidth={2.2} /> : null}
          <Text variant={size === 'sm' ? 'label' : 'subheading'} tint={fg} numberOfLines={1}>
            {label}
          </Text>
          {IconRight ? <IconRight size={size === 'sm' ? 16 : 20} color={fg} strokeWidth={2.2} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    borderRadius: t.radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: t.space[2] },
}));

/**
 * Icon button with a VISIBLE short label underneath (icons are never shown alone, except
 * universally understood back/close which use `IconOnlyButton`).
 */
export function LabeledIconButton({
  icon: IconCmp,
  label,
  onPress,
  badge,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  badge?: number;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ alignItems: 'center', minWidth: TOUCH, minHeight: TOUCH, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <View>
        <IconCmp size={22} color={t.colors.text} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -8,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: t.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text variant="overline" tint={t.colors.onPrimary} style={{ fontSize: 10, lineHeight: 12 }}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption" color="textMuted" style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Only for universally understood actions: back and close. Always has an accessibility label. */
export function IconOnlyButton({ icon: IconCmp, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: TOUCH,
        height: TOUCH,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: TOUCH / 2,
        backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
      })}
    >
      <IconCmp size={24} color={t.colors.text} />
    </Pressable>
  );
}
