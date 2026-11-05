import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { RepoError } from '@/data/repository';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Text } from './Text';

/** Calm pulsing placeholder block. */
export function Skeleton({ height = 16, width = '100%', radius }: { height?: number; width?: DimensionValue; radius?: number }) {
  const t = useTheme();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (!t.reduceMotion) o.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [o, t.reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ height, width, borderRadius: radius ?? t.radius.sm, backgroundColor: t.colors.surfaceAlt }, style]}
    />
  );
}

/** Generic card-shaped skeleton list. */
export function SkeletonList({ rows = 3, height = 88 }: { rows?: number; height?: number }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <View style={{ gap: t.space[3] }} accessibilityLabel={tr('common:states.loading')} accessibilityRole="progressbar">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} radius={t.radius.lg} />
      ))}
    </View>
  );
}

/** Friendly warm illustration for empty states (the only place illustrations are used). */
export function EmptyIllustration({ size = 140 }: { size?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 160 120" accessibilityElementsHidden>
      <Ellipse cx="80" cy="108" rx="58" ry="8" fill={t.colors.surfaceAlt} />
      <Rect x="38" y="34" width="84" height="66" rx="12" fill={t.colors.primarySoft} />
      <Rect x="50" y="48" width="44" height="7" rx="3.5" fill={t.colors.accent} opacity={0.8} />
      <Rect x="50" y="62" width="60" height="6" rx="3" fill={t.colors.borderStrong} />
      <Rect x="50" y="74" width="36" height="6" rx="3" fill={t.colors.borderStrong} />
      <Circle cx="118" cy="30" r="14" fill={t.colors.surface} stroke={t.colors.accent} strokeWidth="3" />
      <Path d="M112 30 l4 4 l8 -8" stroke={t.colors.primary} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="30" cy="24" r="5" fill={t.colors.accent} opacity={0.5} />
      <Circle cx="140" cy="70" r="4" fill={t.colors.success} opacity={0.5} />
    </Svg>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  compact,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? t.space[5] : t.space[9], paddingHorizontal: t.space[5], gap: t.space[3] }}>
      {compact ? null : <EmptyIllustration />}
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text color="textMuted" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

export function errorMessageKey(error: unknown): string {
  if (error instanceof RepoError) return `errors:${error.code}`;
  return 'errors:unknown';
}

export function ErrorState({ error, onRetry, compact }: { error?: unknown; onRetry?: () => void; compact?: boolean }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const isKnown = error instanceof RepoError && error.code !== 'unknown';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', paddingVertical: compact ? t.space[4] : t.space[8], paddingHorizontal: t.space[5], gap: t.space[3] }}
    >
      <Text variant="heading" align="center">
        {tr('common:states.errorTitle')}
      </Text>
      <Text color="textMuted" align="center">
        {isKnown ? tr(errorMessageKey(error)) : tr('common:states.errorBody')}
      </Text>
      {onRetry ? <Button label={tr('common:actions.retry')} icon={RefreshCw} variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

/**
 * Standard loading / error / empty handling for a query.
 *   <QueryView query={q} skeleton={<SkeletonList />} isEmpty={(d) => d.length === 0} empty={<EmptyState …/>}>
 *     {(data) => …}
 *   </QueryView>
 */
export function QueryView<T>({
  query,
  children,
  skeleton,
  isEmpty,
  empty,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isPending' | 'refetch'>;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
}) {
  if (query.isPending) return <>{skeleton ?? <SkeletonList />}</>;
  if (query.error || query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (isEmpty?.(query.data)) return <>{empty ?? null}</>;
  return <>{children(query.data)}</>;
}
