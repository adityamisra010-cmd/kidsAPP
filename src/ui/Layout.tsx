import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { SpaceKey } from '@/theme/tokens';

interface BoxProps extends ViewProps {
  gap?: SpaceKey;
  padding?: SpaceKey;
  px?: SpaceKey;
  py?: SpaceKey;
  align?: ViewStyle['alignItems'];
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  flex?: number;
  wrap?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const justifyMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
} as const;

function useBoxStyle(p: BoxProps, direction: 'row' | 'column'): ViewStyle {
  const { space } = useTheme();
  return {
    flexDirection: direction,
    gap: p.gap != null ? space[p.gap] : undefined,
    padding: p.padding != null ? space[p.padding] : undefined,
    paddingHorizontal: p.px != null ? space[p.px] : undefined,
    paddingVertical: p.py != null ? space[p.py] : undefined,
    alignItems: p.align ?? (direction === 'row' ? 'center' : undefined),
    justifyContent: p.justify ? justifyMap[p.justify] : undefined,
    flex: p.flex,
    flexWrap: p.wrap ? 'wrap' : undefined,
  };
}

/** Vertical stack with token spacing: <Stack gap={3} padding={4}>. */
export function Stack(props: BoxProps) {
  const { gap: _g, padding: _p, px: _x, py: _y, align: _a, justify: _j, flex: _f, wrap: _w, style, ...rest } = props;
  const box = useBoxStyle(props, 'column');
  return <View {...rest} style={[box, style]} />;
}

/** Horizontal row, vertically centred by default: <Row gap={2} justify="between">. */
export function Row(props: BoxProps) {
  const { gap: _g, padding: _p, px: _x, py: _y, align: _a, justify: _j, flex: _f, wrap: _w, style, ...rest } = props;
  const box = useBoxStyle(props, 'row');
  return <View {...rest} style={[box, style]} />;
}

export function Spacer({ size = 4 }: { size?: SpaceKey }) {
  const { space } = useTheme();
  return <View style={{ height: space[size], width: space[size] }} />;
}

export function Divider({ inset = 0 }: { inset?: SpaceKey }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.colors.border, marginLeft: t.space[inset] }} />;
}
