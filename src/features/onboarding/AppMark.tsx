import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Placeholder app mark: a rounded square with three rising steps and a small marker above the
 * last one ("progress, one session at a time"). Decorative; the app name sits next to it.
 */
export function AppMark({ size = 72 }: { size?: number }) {
  const t = useTheme();
  const fg = t.colors.onPrimary;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width: size, height: size }, t.elevation(1)]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect x="0" y="0" width="64" height="64" rx="18" fill={t.colors.primary} />
        <Rect x="13" y="37" width="10" height="14" rx="3.5" fill={fg} opacity={0.5} />
        <Rect x="27" y="29" width="10" height="22" rx="3.5" fill={fg} opacity={0.75} />
        <Rect x="41" y="21" width="10" height="30" rx="3.5" fill={fg} />
        <Circle cx="46" cy="13.5" r="3.5" fill={fg} />
      </Svg>
    </View>
  );
}
