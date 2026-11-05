import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BRAND } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Placeholder app mark, drawn to match the launcher icon (assets/brand): a three-step staircase
 * ("session by session") with a dot for the child on the top step. Brand colours are fixed so the
 * mark looks the same as the icon in light and dark mode. Decorative; the app name sits next to it.
 */
export function AppMark({ size = 72 }: { size?: number }) {
  const t = useTheme();
  const steps = BRAND.background;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width: size, height: size }, t.elevation(1)]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect x="0" y="0" width="64" height="64" rx="15" fill={BRAND.primary} />
        <Path
          d="M16 46.6 V36.9 H26.7 V29.1 H37.4 V21.3 H48.1 V46.6 Z"
          fill={steps}
          stroke={steps}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <Circle cx="42.7" cy="15.2" r="4.2" fill="#F08A3C" />
      </Svg>
    </View>
  );
}
