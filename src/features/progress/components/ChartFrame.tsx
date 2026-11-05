import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Card, Row, Skeleton, Stack, Text } from '@/ui';

type IdleGlobal = { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };

/**
 * Mounts a chart only after the screen has settled and its width is known, so opening a progress
 * screen stays fast on mid-range phones. `delay` staggers several charts on one screen.
 */
export function LazyMount({ height, delay = 0, children }: { height: number; delay?: number; children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const g = globalThis as IdleGlobal;
    let idle: number | undefined;
    const timer = setTimeout(() => {
      if (g.requestIdleCallback) idle = g.requestIdleCallback(() => setReady(true));
      else setReady(true);
    }, delay);
    return () => {
      clearTimeout(timer);
      if (idle != null) g.cancelIdleCallback?.(idle);
    };
  }, [delay]);
  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: height }}>
      {ready && width > 0 ? children(width) : <Skeleton height={height} />}
    </View>
  );
}

/**
 * Card around a chart: title, the chart (hidden from screen readers) and a plain-text summary
 * underneath that says the same thing in words.
 */
export function ChartCard({
  title,
  subtitle,
  summary,
  legend,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  summary: string;
  legend?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Card testID={testID}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Text variant="subheading" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
        </Stack>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {children}
        </View>
        {legend}
        <Text color="textMuted" testID={testID ? `${testID}-summary` : undefined}>
          {summary}
        </Text>
      </Stack>
    </Card>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Row gap={2}>
      <View style={{ width: 16, height: dashed ? 0 : 10, borderRadius: 3, backgroundColor: dashed ? 'transparent' : color, borderTopWidth: dashed ? 2 : 0, borderStyle: 'dashed', borderColor: color }} />
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </Row>
  );
}

/** Shared gifted-charts styling from theme tokens (no hard-coded colours). */
export function useChartTheme() {
  const t = useTheme();
  return useMemo(
    () => ({
      yAxisLabelWidth: 30,
      common: {
        xAxisColor: t.colors.borderStrong,
        xAxisThickness: 1,
        yAxisThickness: 0,
        yAxisColor: 'transparent',
        rulesColor: t.colors.border,
        yAxisTextStyle: { color: t.colors.textMuted, fontFamily: t.fonts.regular, fontSize: 11 },
        xAxisLabelTextStyle: { color: t.colors.textMuted, fontFamily: t.fonts.regular, fontSize: 10 },
        isAnimated: !t.reduceMotion,
        disableScroll: true,
      },
      colors: {
        primary: t.colors.primary,
        accent: t.colors.accent,
        muted: t.colors.borderStrong,
        mastery: t.colors.success,
        incidents: t.colors.warning,
        surface: t.colors.surface,
      },
    }),
    [t],
  );
}
