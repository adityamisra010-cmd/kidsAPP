/**
 * One practice log. Staff: watch the private video and react (quick reaction + comment + "use in
 * next session"), then move straight to the next item. Parents: see their log and the feedback.
 */
import { router } from 'expo-router';
import { Send, Clapperboard } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { STAFF_ROLES, type ReviewReaction } from '@/domain/types';
import { timeAgo } from '@/lib/dates';
import { useActive } from '@/state/session';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Badge, Button, Card, ErrorState, Row, Screen, SkeletonList, Stack, SwitchRow, Text, TextField, toast } from '@/ui';

import { DifficultyBadge, OutcomeBadge, REACTION_META, ReactionBadge } from '../components/badges';
import { ChoiceTiles } from '../components/ChoiceTiles';
import { MediaPlayer } from '../components/VideoPlayer';
import { nextInQueue, REACTIONS } from '../logic';
import { useHomeLog, useReviewLog, useReviewQueue } from '../queries';

export function LogEntryScreen({ logId, taskId }: { logId: string; taskId?: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation('practice');
  const active = useActive();
  const isStaff = !!active && STAFF_ROLES.includes(active.role);
  const q = useHomeLog(logId, taskId);
  const queue = useReviewQueue(isStaff);
  const review = useReviewLog();
  const [reaction, setReaction] = useState<ReviewReaction | undefined>();
  const [comment, setComment] = useState('');
  const [useInSession, setUseInSession] = useState(false);
  const retentionDays = active?.organization?.settings.videoRetentionDays;

  if (q.isPending || q.error || !q.data) {
    return (
      <Screen title={tr('entry.title')} back>
        {q.isPending ? <SkeletonList rows={3} height={120} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      </Screen>
    );
  }
  const log = q.data;
  const reviewed = !!log.reviewReaction;
  const canReview = isStaff && !reviewed;

  const send = () => {
    if (!reaction) return;
    const next = nextInQueue(queue.data ?? [], log.id);
    review.mutate(
      { logId: log.id, reaction, comment: comment.trim() || undefined, useInNextSession: log.mediaId ? useInSession : undefined },
      {
        onSuccess: () => {
          if (next) {
            toast.success(tr('entry.sent'));
            router.replace(`/practice/entry/${next.id}`);
          } else {
            toast.success(tr('entry.allDone'));
            if (router.canGoBack()) router.back();
            else router.replace('/therapist/reviews');
          }
        },
        onError: () => toast.error(tr('errors:unknown')),
      },
    );
  };

  return (
    <Screen
      title={tr('entry.title')}
      back
      testID="log-entry"
      footer={
        canReview ? (
          <>
            {!reaction ? (
              <Text variant="caption" color="textMuted" align="center">
                {tr('entry.chooseReaction')}
              </Text>
            ) : null}
            <Button label={tr('entry.send')} icon={Send} size="lg" fullWidth disabled={!reaction} loading={review.isPending} onPress={send} testID="entry-send" />
          </>
        ) : undefined
      }
    >
      <Row gap={3}>
        <Avatar name={log.childName} size={52} />
        <Stack gap={1} flex={1}>
          <Text variant="heading">{log.childName}</Text>
          <Text variant="label" color="primaryText" onPress={() => router.push(`/practice/task/${log.taskId}`)} accessibilityRole="link">
            {log.taskTitle}
          </Text>
          <Text variant="caption" color="textMuted">
            {tr('entry.loggedBy', { name: log.loggedByName, when: timeAgo(log.createdAt) })}
          </Text>
        </Stack>
      </Row>

      <Card>
        <Stack gap={3}>
          <Row gap={2} wrap>
            <OutcomeBadge outcome={log.outcome} />
            <DifficultyBadge difficulty={log.difficulty} />
          </Row>
          <Stack gap={1}>
            <Text variant="overline" color="textMuted">
              {tr('entry.note')}
            </Text>
            <Text color={log.note ? 'text' : 'textMuted'}>{log.note || tr('entry.noNote')}</Text>
          </Stack>
        </Stack>
      </Card>

      {log.mediaId ? <MediaPlayer mediaId={log.mediaId} retentionDays={retentionDays} /> : null}

      {reviewed ? (
        <Card tone="success" elevated={false} testID="entry-feedback">
          <Stack gap={2}>
            <Text variant="label" weight="semibold">
              {tr('entry.therapistFeedback', { name: log.reviewedByName ?? '' })}
            </Text>
            <ReactionBadge reaction={log.reviewReaction!} />
            {log.reviewComment ? <Text>{log.reviewComment}</Text> : null}
            {isStaff && log.useInNextSession ? <Badge label={tr('entry.flaggedForSession')} tone="primary" icon={Clapperboard} /> : null}
          </Stack>
        </Card>
      ) : canReview ? (
        <Stack gap={4}>
          <ChoiceTiles
            label={tr('entry.quickReaction')}
            columns={2}
            options={REACTIONS.map((r) => ({ value: r, label: tr(`reaction.${r}`), icon: REACTION_META[r].icon }))}
            value={reaction}
            onChange={setReaction}
            testID="reaction"
          />
          <TextField
            label={tr('entry.comment')}
            placeholder={tr('entry.commentPlaceholder')}
            multiline
            minLines={2}
            maxLength={500}
            value={comment}
            onChangeText={setComment}
          />
          {log.mediaId ? (
            <Card tone="sunken" elevated={false} padding={3}>
              <SwitchRow label={tr('entry.useInSession')} description={tr('entry.useInSessionHint')} value={useInSession} onChange={setUseInSession} />
            </Card>
          ) : null}
        </Stack>
      ) : (
        <Card tone="sunken" elevated={false}>
          <Text color="textMuted" style={{ paddingVertical: t.space[1] }}>
            {tr('entry.awaitingFeedback')}
          </Text>
        </Card>
      )}
    </Screen>
  );
}
