/**
 * One practice log in a history list, and a therapist-feedback card for parents.
 */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { HomeLog } from '@/domain/types';
import { formatDay, timeAgo } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Card, Row, Stack, Text } from '@/ui';

import { DifficultyBadge, OutcomeBadge, ReactionBadge, VideoBadge } from './badges';

/** History row: date, outcome + difficulty, note, therapist reaction. */
export function HomeLogRow({ log, pendingLabel }: { log: Pick<HomeLog, 'id' | 'outcome' | 'difficulty' | 'note' | 'createdAt' | 'mediaId' | 'reviewReaction' | 'reviewComment' | 'reviewedByName' | 'loggedByName'>; pendingLabel?: string }) {
  const { t } = useTranslation('practice');
  return (
    <Card
      onPress={pendingLabel ? undefined : () => router.push(`/practice/entry/${log.id}`)}
      tone={pendingLabel ? 'sunken' : 'default'}
      elevated={false}
      accessibilityHint={pendingLabel ? undefined : t('common:a11y.opensDetails')}
    >
      <Stack gap={2}>
        <Row justify="between" align="flex-start" gap={2}>
          <Text variant="bodyStrong">{formatDay(log.createdAt)}</Text>
          <Text variant="caption" color="textMuted">
            {pendingLabel ?? log.loggedByName}
          </Text>
        </Row>
        <Row gap={2} wrap>
          <OutcomeBadge outcome={log.outcome} />
          <DifficultyBadge difficulty={log.difficulty} />
          {log.mediaId ? <VideoBadge /> : null}
        </Row>
        {log.note ? <Text color="textMuted">{log.note}</Text> : null}
        {log.reviewReaction ? (
          <Stack gap={1}>
            <Row gap={2} wrap>
              <ReactionBadge reaction={log.reviewReaction} />
              {log.reviewedByName ? (
                <Text variant="caption" color="textMuted">
                  {log.reviewedByName}
                </Text>
              ) : null}
            </Row>
            {log.reviewComment ? <Text>{`“${log.reviewComment}”`}</Text> : null}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}

/** Parent-facing feedback card: reaction first, then the therapist's words. */
export function FeedbackCard({ log }: { log: HomeLog }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const who = log.reviewedByName ?? '';
  return (
    <Card onPress={() => router.push(`/practice/entry/${log.id}`)} accessibilityHint={tr('common:a11y.opensDetails')}>
      <Row gap={3} align="flex-start">
        <Avatar name={who || '?'} size={44} />
        <Stack gap={2} flex={1}>
          <Stack gap={1}>
            <Text variant="bodyStrong">{who}</Text>
            <Text variant="caption" color="textMuted">
              {`${log.taskTitle} · ${timeAgo(log.reviewedAt ?? log.createdAt)}`}
            </Text>
          </Stack>
          {log.reviewReaction ? <ReactionBadge reaction={log.reviewReaction} /> : null}
          {log.reviewComment ? (
            <Text style={{ borderLeftWidth: 3, borderLeftColor: t.colors.accent, paddingLeft: t.space[3] }}>{log.reviewComment}</Text>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}
