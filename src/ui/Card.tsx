import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import type { SpaceKey } from '@/theme/tokens';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Coloured stripe on the left edge (e.g. therapy type marker). */
  accent?: string;
  /** Tinted background for highlighted cards. */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'sunken';
  padding?: SpaceKey;
  elevated?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  accent,
  tone = 'default',
  padding = 4,
  elevated = true,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: CardProps) {
  const t = useTheme();
  const s = useStyles();
  const bg = {
    default: t.colors.surface,
    primary: t.colors.primarySoft,
    success: t.colors.successSoft,
    warning: t.colors.warningSoft,
    danger: t.colors.dangerSoft,
    info: t.colors.infoSoft,
    sunken: t.colors.surfaceAlt,
  }[tone];
  const body = (
    <>
      {accent ? <View style={[s.accent, { backgroundColor: accent }]} /> : null}
      <View style={{ padding: t.space[padding], paddingLeft: accent ? t.space[padding] + 4 : t.space[padding] }}>{children}</View>
    </>
  );
  const frame: StyleProp<ViewStyle> = [
    s.card,
    { backgroundColor: bg, borderColor: tone === 'default' ? t.colors.border : 'transparent' },
    elevated && tone === 'default' ? t.elevation(1) : null,
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={frame} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: t.colors.surfaceAlt }}
      style={({ pressed }) => [frame, pressed && { opacity: 0.92 }]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: { borderRadius: t.radius.lg, borderWidth: 1, overflow: 'hidden' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
}));
