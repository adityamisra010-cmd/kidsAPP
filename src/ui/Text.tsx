import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { Palette, TextVariant } from '@/theme/tokens';

export type TextColor = keyof Pick<
  Palette,
  'text' | 'textMuted' | 'textSubtle' | 'primary' | 'primaryText' | 'onPrimary' | 'success' | 'warning' | 'danger' | 'info'
>;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  /** Override weight within the variant: 'medium' | 'semibold' | 'bold'. */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  align?: TextStyle['textAlign'];
  /** Raw colour (e.g. therapy type marker). Prefer `color`. */
  tint?: string;
}

/** All text in the app goes through this so type scale, colour and font scaling stay consistent. */
export function Text({ variant = 'body', color = 'text', weight, align, tint, style, ...rest }: TextProps) {
  const t = useTheme();
  const base = t.type[variant];
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        base,
        { color: tint ?? t.colors[color] },
        weight && { fontFamily: t.fonts[weight] },
        variant === 'overline' && { textTransform: 'uppercase' },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
