/**
 * Therapist "Reviews" tab: new practice logs and videos from families, newest first.
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HomeLog } from '@/domain/types';
import { timeAgo } from '@/lib/dates';
import { Avatar, Card, EmptyState, QueryView, Row, Screen, SkeletonList, Stack, Text } from '@/ui';

import { DifficultyBadge, OutcomeBadge, VideoBadge } from '../components/badges';
import { sortNewestFirst } from '../logic';
import { useReviewQueue } from '../queries';

function ReviewRow({ log, testID }: { log: HomeLog; testID?: string }) {
  const { t } = useTranslation('practice');
  return (
    <Card
      testID={testID}
      onPress={() => router.push(`/practice/entry/${log.id}`)}
      accessibilityLabel={`${log.childName}, ${log.taskTitle}, ${t(`outcome.${log.outcome}`)}${log.mediaId ? `, ${t('video.badge')}` : ''}, ${timeAgo(log.createdAt)}`}
      accessibilityHint={t('common:a11y.opensDetails')}
    >
      <Row gap={3} align="flex-start">
        <Avatar name={log.childName} size={48} />
        <Stack gap={2} flex={1}>
          <Stack gap={1}>
            <Row justify="between" align="flex-start" gap={2}>
              <Text variant="subheading" style={{ flex: 1 }} numberOfLines={1}>
                {log.childName}
              </Text>
              <Text variant="caption" color="textMuted">
                {timeAgo(log.createdAt)}
              </Text>
            </Row>
            <Text variant="label" color="textMuted" numberOfLines={1}>
              {`${log.taskTitle} · ${t('reviews.by', { name: log.loggedByName })}`}
            </Text>
          </Stack>
          <Row gap={2} wrap>
            <OutcomeBadge outcome={log.outcome} />
            <DifficultyBadge difficulty={log.difficulty} />
            {log.mediaId ? <VideoBadge /> : null}
          </Row>
          {log.note ? (
            <Text color="textMuted" numberOfLines={2}>
              {`“${log.note}”`}
            </Text>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}

export function ReviewQueueScreen() {
  const { t } = useTranslation('practice');
  const q = useReviewQueue();
  const items = useMemo(() => sortNewestFirst(q.data ?? []), [q.data]);
  return (
    <Screen
      title={t('reviews.title')}
      subtitle={items.length ? t('reviews.subtitle', { count: items.length }) : undefined}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      testID="review-queue"
    >
      <QueryView
        query={q}
        skeleton={<SkeletonList rows={4} height={130} />}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState title={t('reviews.emptyTitle')} body={t('reviews.emptyBody')} />}
      >
        {() => (
          <Stack gap={3}>
            {items.map((log, i) => (
              <ReviewRow key={log.id} log={log} testID={`review-${i}`} />
            ))}
          </Stack>
        )}
      </QueryView>
    </Screen>
  );
}
