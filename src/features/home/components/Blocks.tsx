/**
 * Small building blocks shared by the home, today, dashboard and inbox screens.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { Button, Card, ErrorState, Skeleton, Text } from '@/ui';

/** Calm "nothing here" row for a section (illustrations are reserved for full-screen empty states). */
export function InlineEmpty({
  icon: IconCmp,
  title,
  body,
  actionLabel,
  onAction,
  tone = 'sunken',
  testID,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'sunken' | 'success';
  testID?: string;
}) {
  const t = useTheme();
  const fg = tone === 'success' ? t.colors.success : t.colors.textMuted;
  return (
    <Card tone={tone} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <IconCmp size={20} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading">{title}</Text>
          {body ? <Text color="textMuted">{body}</Text> : null}
          {actionLabel && onAction ? (
            <View style={{ marginTop: t.space[2], alignSelf: 'flex-start' }}>
              <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/** Per-section loading / error / empty handling with a compact error and a card-shaped skeleton. */
export function SectionQuery<T>({
  query,
  skeletonHeight = 120,
  isEmpty,
  empty,
  children,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isPending' | 'refetch'>;
  skeletonHeight?: number;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const t = useTheme();
  if (query.isPending) return <Skeleton height={skeletonHeight} radius={t.radius.lg} />;
  if (query.error || query.data === undefined) {
    return (
      <Card tone="sunken" padding={2}>
        <ErrorState compact error={query.error} onRetry={() => void query.refetch()} />
      </Card>
    );
  }
  if (isEmpty?.(query.data)) return <>{empty ?? null}</>;
  return <>{children(query.data)}</>;
}

/** A block on a home screen (header row + content) with a gentle entrance fade, skipped with reduce motion. */
export function Section({ children, index = 0, testID }: { children: ReactNode; index?: number; testID?: string }) {
  const t = useTheme();
  return (
    <Animated.View
      testID={testID}
      entering={t.reduceMotion ? undefined : FadeIn.duration(260).delay(Math.min(index, 6) * 50)}
      style={{ gap: t.space[3] }}
    >
      {children}
    </Animated.View>
  );
}
